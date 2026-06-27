import { useEffect, useMemo, useState } from 'react'
import type { Order, Statut, CallResult } from '../types'
import { fcfa, telLink, waLink } from '../lib'
import { supabase } from '../lib/supabase'

type Tone = 'ok' | 'info' | 'rep' | 'warn' | 'wa' | 'dang' | 'liv'
const RESULTATS: { statut: Statut; label: string; icon: string; tone: Tone; sched?: boolean }[] = [
  { statut: 'confirme', label: 'Confirmé', icon: 'ti-check', tone: 'ok' },
  { statut: 'a_rappeler', label: 'À rappeler', icon: 'ti-calendar-clock', tone: 'info', sched: true },
  { statut: 'reporte', label: 'Reporté', icon: 'ti-calendar-event', tone: 'rep', sched: true },
  { statut: 'injoignable', label: 'Injoignable', icon: 'ti-phone-off', tone: 'warn', sched: true },
  { statut: 'whatsapp', label: 'WhatsApp', icon: 'ti-brand-whatsapp', tone: 'wa' },
  { statut: 'annule', label: 'Annulé', icon: 'ti-x', tone: 'dang' },
  { statut: 'livre', label: 'Livré', icon: 'ti-package', tone: 'liv' },
]

const STATUT_LABELS: Record<string, string> = {
  a_appeler: 'À appeler', a_rappeler: 'À rappeler', injoignable: 'Injoignable', reporte: 'Reporté',
  confirme: 'Livraison', whatsapp: 'WhatsApp', refuse: 'Refus',
  ne_reconnait_pas: 'Ne reconnaît pas', livraison: 'En livraison', livre: 'Livré', annule: 'Annulé',
}
const TONE_OF: Record<string, Tone> = {
  confirme: 'info', a_rappeler: 'info', reporte: 'rep', injoignable: 'warn',
  whatsapp: 'wa', annule: 'dang', livre: 'liv', livraison: 'info', refuse: 'dang',
}

const PUCES_KEY = 'closepro_puces'
const PUCES_DEFAUT = ['il attend son salaire', 'rappelle plus tard', 'raccroché au nez', 'pas disponible', 'mauvais numéro', 'paiement à la livraison']
function loadPuces(): string[] {
  try { const r = JSON.parse(localStorage.getItem(PUCES_KEY) || '[]'); return Array.isArray(r) && r.length ? r : PUCES_DEFAUT } catch { return PUCES_DEFAUT }
}
function savePuces(p: string[]) { try { localStorage.setItem(PUCES_KEY, JSON.stringify(p)) } catch { /* quota */ } }

function toLocalInput(ms: number): string {
  const d = new Date(ms); const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
function fromLocalInput(s: string): number | undefined {
  if (!s) return undefined
  const t = new Date(s).getTime(); return Number.isFinite(t) ? t : undefined
}
function fmtDt(ms: number) {
  return new Date(ms).toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function buildPresets(): { label: string; at: number }[] {
  const now = new Date()
  const at = (h: number, m: number, addDays: number) => { const x = new Date(now); x.setDate(x.getDate() + addDays); x.setHours(h, m, 0, 0); return x.getTime() }
  const soir = at(18, 0, 0) > now.getTime() ? at(18, 0, 0) : at(18, 0, 1)
  return [
    { label: 'Dans 1h', at: now.getTime() + 3600_000 },
    { label: 'Dans 2h', at: now.getTime() + 2 * 3600_000 },
    { label: 'Ce soir 18h', at: soir },
    { label: 'Demain 9h', at: at(9, 0, 1) },
  ]
}

type Hist = { date: number; statut: string; commentaire: string | null }

export default function CallMode({
  queue, index, onResult, onClose,
}: {
  queue: Order[]
  index: number
  onResult: (o: Order, r: CallResult) => void
  onClose: () => void
}) {
  const o = queue[index]
  const [comment, setComment] = useState('')
  const [showEdit, setShowEdit] = useState(false)
  const [prix, setPrix] = useState<number>(o?.prixNegocie ?? o?.prixUnitaire ?? 0)
  const [cout, setCout] = useState<number>(o?.coutLivraison ?? 0)
  const [produit, setProduit] = useState(o?.produit ?? '')
  const [qte, setQte] = useState<number>(o?.quantite ?? 1)
  const [puces, setPuces] = useState<string[]>(loadPuces)
  const [gerePuces, setGerePuces] = useState(false)
  const [newPuce, setNewPuce] = useState('')
  const [hist, setHist] = useState<Hist[]>([])
  const [histOpen, setHistOpen] = useState(false)
  // Fenêtre de planification (statuts à date).
  const [modal, setModal] = useState<{ statut: Statut; label: string; tone: Tone } | null>(null)
  const [schedAt, setSchedAt] = useState('')
  const [costError, setCostError] = useState(false)
  const presets = useMemo(buildPresets, [index])

  const oid = o?.id
  useEffect(() => {
    setComment(''); setShowEdit(false); setGerePuces(false); setNewPuce(''); setModal(null); setSchedAt(''); setHistOpen(false); setCostError(false)
    setPrix(o?.prixNegocie ?? o?.prixUnitaire ?? 0)
    setCout(o?.coutLivraison ?? 0)
    setProduit(o?.produit ?? '')
    setQte(o?.quantite ?? 1)
    setHist([])
    if (supabase && o?.id && o.id.includes('-')) {
      supabase.from('call_attempts').select('created_at, resultat, commentaire').eq('order_id', o.id)
        .order('created_at', { ascending: true }).limit(40)
        .then(({ data }) => setHist((data ?? []).map((d: any) => ({ date: new Date(d.created_at).getTime(), statut: d.resultat, commentaire: d.commentaire }))))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oid])

  if (!o) return null
  // Commande confirmée / en livraison → écran de clôture (Livré / Annulé / Reporté).
  // (Reporté n'est plus ici : il devient un rappel et s'ouvre en mode appel.)
  const isLivraison = o.statut === 'confirme' || o.statut === 'livraison'
  const total = Math.max(0, Math.round(prix)) * Math.max(1, qte) + Math.max(0, Math.round(cout))
  // Détails : toutes les colonnes du Sheet, y compris les valeurs sans nom de colonne.
  const extraEntries = o.extra
    ? Object.entries(o.extra).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    : []
  const pillTone = TONE_OF[o.statut] ?? ''
  const waText = `Bonjour ${o.client}, confirmation de votre commande ${o.numero} : ${produit}${qte > 1 ? ` (x${qte})` : ''} pour ${fcfa(total, false)}. Pouvez-vous confirmer la livraison ? Merci.`
  const schedMs = fromLocalInput(schedAt)
  const histCount = hist.length + (o.createdAt ? 1 : 0)

  function emit(statut: Statut, rappelAt?: number) {
    onResult(o, {
      statut,
      commentaire: comment.trim() || undefined,
      rappelAt,
      prixNegocie: Math.round(prix) !== o.prixUnitaire ? Math.round(prix) : (o.prixNegocie ?? undefined),
      coutLivraison: cout > 0 ? Math.round(cout) : (o.coutLivraison ?? undefined),
      produit: produit.trim() && produit.trim() !== o.produit ? produit.trim() : undefined,
      quantite: qte !== o.quantite ? qte : undefined,
    })
  }

  // Clic sur un statut : appliqué directement ; ceux à date ouvrent la fenêtre.
  // « Livré » exige un coût de livraison.
  function pick(r: { statut: Statut; label: string; tone: Tone; sched?: boolean }) {
    if (r.statut === 'livre' && cout <= 0) { setCostError(true); return }
    if (r.sched) {
      const dft = r.statut === 'reporte' ? 86_400_000 : 3600_000
      setSchedAt(toLocalInput(Date.now() + dft))
      setModal({ statut: r.statut, label: r.label, tone: r.tone })
    } else {
      emit(r.statut)
    }
  }
  function confirmSched() {
    if (modal && schedMs) { emit(modal.statut, schedMs); setModal(null) }
  }

  function ajouterPuce() {
    const v = newPuce.trim(); if (!v || puces.includes(v)) { setNewPuce(''); return }
    const p = [...puces, v]; setPuces(p); savePuces(p); setNewPuce('')
  }
  function retirerPuce(x: string) { const p = puces.filter((c) => c !== x); setPuces(p); savePuces(p) }

  return (
    <div className="call">
      <div className="call-inner">
        {/* Header : retour · n° · pastille + crayon */}
        <header className="call-head">
          <button className="back" onClick={onClose} aria-label="Retour"><i className="ti ti-arrow-left" aria-hidden="true" /></button>
          <div className="ch-mid">
            <div className="ch-num">Commande {o.numero}</div>
            <div className="ch-step">{index + 1} / {queue.length}</div>
          </div>
          <span className={`ch-stat ${pillTone}`}>{STATUT_LABELS[o.statut] ?? o.statut}</span>
          <button className={`ch-pen ${showEdit ? 'on' : ''}`} onClick={() => setShowEdit((v) => !v)} aria-label="Modifier">
            <i className="ti ti-pencil" aria-hidden="true" />
          </button>
        </header>
        <div className="prog"><i style={{ width: `${Math.round(((index + 1) / queue.length) * 100)}%` }} /></div>

        {/* Édition (ouverte par le crayon) */}
        {showEdit ? (
          <div className="edit-grid edit-top">
            <label>Produit<input value={produit} onChange={(e) => setProduit(e.target.value)} /></label>
            <label>Quantité<input type="number" min={1} value={qte} onChange={(e) => setQte(Math.max(1, +e.target.value || 1))} /></label>
            <label>Prix (FCFA)<input type="number" min={0} value={prix} onChange={(e) => setPrix(+e.target.value || 0)} /></label>
            <div className="edit-total">Total : <b>{fcfa(total, false)}</b></div>
          </div>
        ) : null}

        <div className="call-name">{o.client}</div>
        <div className="call-loc"><i className="ti ti-map-pin" aria-hidden="true" /> {o.adresse} · {o.region}{o.clientCount && o.clientCount > 1 ? <>&nbsp;·&nbsp;client ×{o.clientCount}</> : null}</div>
        <div className="call-line">
          <span className="p">{produit}{qte > 1 ? ` · ×${qte}` : ''}</span>
          <span className="a">{fcfa(total, false)}</span>
        </div>

        {o.commentaire ? (<div className="note"><i className="ti ti-note" aria-hidden="true" /><span>{o.commentaire}</span></div>) : null}

        {/* Appel/WhatsApp uniquement quand il reste à appeler (pas en livraison) */}
        {!isLivraison ? (
          <div className="big">
            <a className="call-btn" href={telLink(o.telephone)}><i className="ti ti-phone" aria-hidden="true" /> Appeler</a>
            <a className="wa-btn" href={waLink(o.whatsapp, waText)} target="_blank" rel="noreferrer"><i className="ti ti-brand-whatsapp" aria-hidden="true" /> WhatsApp</a>
          </div>
        ) : null}

        <label className={`livz ${costError ? 'err' : ''}`}>
          <span><i className="ti ti-truck" aria-hidden="true" /> Coût de livraison (FCFA){costError ? ' — obligatoire pour livrer' : ''}</span>
          <input type="number" inputMode="numeric" min={0} value={cout || ''} onChange={(e) => { setCout(+e.target.value || 0); setCostError(false) }} placeholder="ex. 2 500" />
        </label>

        {/* Commentaire AVANT le choix du statut : il part avec le changement enregistré. */}
        <div className="cm-block">
          <textarea className="cm-area" placeholder="Commentaire (ajouté à l'historique)…" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
          <div className="qc">
            {puces.map((p) => (
              <span key={p} className="qc-chip">
                <button className="qc-add" onClick={() => setComment((c) => (c ? c + ' · ' + p : p))}>{p}</button>
                {gerePuces ? <button className="qc-del" onClick={() => retirerPuce(p)} aria-label="Supprimer"><i className="ti ti-x" aria-hidden="true" /></button> : null}
              </span>
            ))}
            <button className="qc-gear" onClick={() => setGerePuces((v) => !v)} aria-label="Gérer les commentaires">
              <i className={`ti ${gerePuces ? 'ti-check' : 'ti-settings'}`} aria-hidden="true" />
            </button>
          </div>
          {gerePuces ? (
            <div className="qc-new">
              <input value={newPuce} placeholder="Nouveau commentaire rapide" onChange={(e) => setNewPuce(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') ajouterPuce() }} />
              <button onClick={ajouterPuce} aria-label="Ajouter"><i className="ti ti-plus" aria-hidden="true" /></button>
            </div>
          ) : null}
        </div>

        {isLivraison ? (
          <>
            <div className="res-h">Clôturer la livraison</div>
            <div className="livr-actions">
              <button className="lvb liv" onClick={() => pick({ statut: 'livre', label: 'Livré', tone: 'liv' })}><i className="ti ti-check" aria-hidden="true" /> Livré</button>
              <button className="lvb ann" onClick={() => pick({ statut: 'annule', label: 'Annulé', tone: 'dang' })}><i className="ti ti-x" aria-hidden="true" /> Annulé</button>
              <button className="lvb rep" onClick={() => pick({ statut: 'reporte', label: 'Reporté', tone: 'rep', sched: true })}><i className="ti ti-calendar-event" aria-hidden="true" /> Reporté</button>
            </div>
          </>
        ) : (
          <>
            <div className="res-h">Résultat de l'appel</div>
            <div className="chips">
              {RESULTATS.map((r) => (
                <button key={r.statut} className={`chip2 ${r.tone} ${o.statut === r.statut ? 'on' : ''}`} onClick={() => pick(r)}>
                  <i className={`ti ${r.icon}`} aria-hidden="true" /> {r.label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Historique — replié par défaut, avant les détails */}
        <button className="histH" onClick={() => setHistOpen((v) => !v)}>
          <i className="ti ti-history" aria-hidden="true" /> Historique <span className="hc">· {histCount} {histCount > 1 ? 'changements' : 'changement'}</span>
          <i className={`ti ${histOpen ? 'ti-chevron-up' : 'ti-chevron-down'}`} aria-hidden="true" style={{ marginLeft: 'auto' }} />
        </button>
        {histOpen ? (
          <div className="histBody">
            {o.createdAt ? (<div className="he"><span className="he-d">{fmtDt(o.createdAt)}</span><span className="he-s">Commande reçue</span></div>) : null}
            {hist.map((h, i) => (
              <div className="he" key={i}><span className="he-d">{fmtDt(h.date)}</span><span className="he-s">{STATUT_LABELS[h.statut] ?? h.statut}{h.commentaire ? ` — ${h.commentaire}` : ''}</span></div>
            ))}
            {!hist.length && !o.createdAt ? <div className="he-empty">Aucun historique enregistré.</div> : null}
          </div>
        ) : null}

        {/* Détails — tout en bas */}
        <div className="fiche">
          <div className="fiche-t"><i className="ti ti-file-description" aria-hidden="true" /> Détails commande</div>
          <div className="fiche-grid">
            <div className="fiche-row"><span className="fk">Produit</span><span className="fv">{produit || '—'}{qte > 1 ? ` · ×${qte}` : ''}</span></div>
            <div className="fiche-row"><span className="fk">Téléphone</span><span className="fv"><a href={telLink(o.telephone)}>{o.telephone}</a></span></div>
            {o.whatsapp && <div className="fiche-row"><span className="fk">WhatsApp</span><span className="fv">{o.whatsapp}</span></div>}
            <div className="fiche-row"><span className="fk">Adresse</span><span className="fv">{o.adresse || '—'}</span></div>
            <div className="fiche-row"><span className="fk">Région</span><span className="fv">{o.region}</span></div>
            <div className="fiche-row"><span className="fk">Pays</span><span className="fv">{o.pays}</span></div>
            {o.createdAt && <div className="fiche-row"><span className="fk">Reçue le</span><span className="fv">{fmtDt(o.createdAt)}</span></div>}
            <div className="fiche-row"><span className="fk">Tentatives</span><span className="fv">{o.tentatives}</span></div>
            {o.rappelAt && <div className="fiche-row"><span className="fk">Programmé</span><span className="fv">{fmtDt(o.rappelAt)}</span></div>}
            <div className="fiche-row"><span className="fk">Prix unitaire</span><span className="fv">{fcfa(o.prixUnitaire)}</span></div>
            {cout > 0 && <div className="fiche-row"><span className="fk">Livraison</span><span className="fv">{fcfa(cout)}</span></div>}
            <div className="fiche-row"><span className="fk">Total</span><span className="fv fv-b">{fcfa(total)}</span></div>
            {extraEntries.map(([k, v]) => {
              const sansNom = !k.trim() || /^(col|column|colonne|field|__\w+|\d+)$/i.test(k.trim())
              return (
                <div key={k} className={`fiche-row ${sansNom ? 'noname' : ''}`}>
                  <span className="fk">{sansNom ? 'colonne sans nom' : k}</span><span className="fv">{String(v)}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="spacer" />
      </div>

      {/* Fenêtre de planification */}
      {modal ? (
        <div className="sched-ov" onClick={() => setModal(null)}>
          <div className="sched-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sm-head">
              <span>{modal.statut === 'reporte' ? 'Reporter à quand ?' : modal.statut === 'injoignable' ? 'Nouvelle tentative à quand ?' : 'Quand rappeler ?'}</span>
              <button className="sm-x" onClick={() => setModal(null)} aria-label="Fermer"><i className="ti ti-x" aria-hidden="true" /></button>
            </div>
            <div className="sched-presets">
              {presets.map((p) => (
                <button key={p.label} className={schedAt === toLocalInput(p.at) ? 'on' : ''} onClick={() => setSchedAt(toLocalInput(p.at))}>{p.label}</button>
              ))}
            </div>
            <label className="sched-dt"><span>Date et heure précises</span>
              <input type="datetime-local" value={schedAt} min={toLocalInput(Date.now())} onChange={(e) => setSchedAt(e.target.value)} />
            </label>
            <button className={`sm-ok ${modal.tone}`} disabled={!schedMs} onClick={confirmSched}>
              <i className="ti ti-check" aria-hidden="true" /> Confirmer {schedMs ? `· ${fmtDt(schedMs)}` : ''}
            </button>
          </div>
        </div>
      ) : null}

      {/* Fenêtre : coût de livraison obligatoire avant « Livré » */}
      {costError ? (
        <div className="err-overlay" onClick={() => setCostError(false)}>
          <div className="errbox" onClick={(e) => e.stopPropagation()}>
            <i className="ti ti-alert-triangle" aria-hidden="true" />
            <h3>Coût de livraison manquant</h3>
            <p>Renseigne le coût de livraison avant de marquer cette commande « Livré ».</p>
            <button onClick={() => setCostError(false)}>Compris</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
