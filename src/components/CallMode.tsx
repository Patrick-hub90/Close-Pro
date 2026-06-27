import { useEffect, useMemo, useState } from 'react'
import type { Order, Statut, CallResult } from '../types'
import { fcfa, hm, telLink, waLink } from '../lib'
import { supabase } from '../lib/supabase'

const RESULTATS: { statut: Statut; label: string; icon: string; tone: string; sched?: number; hint: string }[] = [
  { statut: 'confirme', label: 'Confirmé', icon: 'ti-check', tone: 'ok', hint: 'Validée → passe en livraison (revue demain matin).' },
  { statut: 'a_rappeler', label: 'À rappeler', icon: 'ti-calendar-clock', tone: 'info', sched: 1, hint: 'Programme un rappel à l\'heure choisie.' },
  { statut: 'injoignable', label: 'Injoignable', icon: 'ti-phone-off', tone: 'warn', sched: 1, hint: 'Nouvelle tentative programmée.' },
  { statut: 'whatsapp', label: 'Sur WhatsApp', icon: 'ti-brand-whatsapp', tone: 'wa', sched: 2, hint: 'Relance programmée — ne pas laisser traîner.' },
  { statut: 'refuse', label: 'Refus', icon: 'ti-x', tone: 'dang', hint: 'Commande refusée → archivée.' },
  { statut: 'ne_reconnait_pas', label: 'Ne reconnaît pas', icon: 'ti-help', tone: 'mut', hint: 'Client ne reconnaît pas la commande.' },
]

const STATUT_LABELS: Record<string, string> = {
  a_appeler: 'À appeler', a_rappeler: 'À rappeler', injoignable: 'Injoignable',
  confirme: 'Confirmé', whatsapp: 'WhatsApp', refuse: 'Refus',
  ne_reconnait_pas: 'Ne reconnaît pas', livraison: 'En livraison', livre: 'Livré', annule: 'Annulé',
}

// Commentaires rapides — configurables, stockés en local.
const PUCES_KEY = 'closepro_puces'
const PUCES_DEFAUT = ['il attend son salaire', 'rappelle plus tard', 'raccroché au nez', 'pas disponible', 'mauvais numéro', 'paiement à la livraison']
function loadPuces(): string[] {
  try { const r = JSON.parse(localStorage.getItem(PUCES_KEY) || '[]'); return Array.isArray(r) && r.length ? r : PUCES_DEFAUT } catch { return PUCES_DEFAUT }
}
function savePuces(p: string[]) { try { localStorage.setItem(PUCES_KEY, JSON.stringify(p)) } catch { /* quota */ } }

function toLocalInput(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
function fromLocalInput(s: string): number | undefined {
  if (!s) return undefined
  const t = new Date(s).getTime()
  return Number.isFinite(t) ? t : undefined
}
function fmtDt(ms: number) {
  return new Date(ms).toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function buildPresets(): { label: string; at: number }[] {
  const now = new Date()
  const at = (h: number, m: number, addDays: number) => {
    const x = new Date(now); x.setDate(x.getDate() + addDays); x.setHours(h, m, 0, 0); return x.getTime()
  }
  const soir = at(18, 0, 0) > now.getTime() ? at(18, 0, 0) : at(18, 0, 1)
  return [
    { label: 'Dans 1h', at: now.getTime() + 3600_000 },
    { label: 'Dans 2h', at: now.getTime() + 2 * 3600_000 },
    { label: 'Ce soir 18h', at: soir },
    { label: 'Demain 9h', at: at(9, 0, 1) },
  ]
}

type Hist = { date: number; statut: string; commentaire: string | null; canal: string | null }

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
  const [result, setResult] = useState<Statut | null>(null)
  const [schedAt, setSchedAt] = useState('')
  const [puces, setPuces] = useState<string[]>(loadPuces)
  const [gerePuces, setGerePuces] = useState(false)
  const [newPuce, setNewPuce] = useState('')
  const [hist, setHist] = useState<Hist[]>([])
  const presets = useMemo(buildPresets, [index])

  const oid = o?.id
  // Réinitialise + pré-sélectionne le statut actuel à chaque commande.
  useEffect(() => {
    setComment(''); setShowEdit(false); setSchedAt(''); setGerePuces(false); setNewPuce('')
    setPrix(o?.prixNegocie ?? o?.prixUnitaire ?? 0)
    setCout(o?.coutLivraison ?? 0)
    setProduit(o?.produit ?? '')
    setQte(o?.quantite ?? 1)
    // Pré-sélection : si la commande a déjà un résultat connu, on le ré-affiche coché.
    const known = RESULTATS.find((r) => r.statut === o?.statut)
    setResult(known ? known.statut : null)
    if (known?.sched && o?.rappelAt) setSchedAt(toLocalInput(o.rappelAt))
    // Historique des statuts depuis call_attempts (uniquement les vrais ID Supabase).
    setHist([])
    if (supabase && o?.id && o.id.includes('-')) {
      supabase.from('call_attempts').select('created_at, resultat, commentaire, canal').eq('order_id', o.id)
        .order('created_at', { ascending: true }).limit(40)
        .then(({ data }) => setHist((data ?? []).map((d: any) => ({ date: new Date(d.created_at).getTime(), statut: d.resultat, commentaire: d.commentaire, canal: d.canal }))))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oid])

  if (!o) return null
  const schedMs = fromLocalInput(schedAt)
  const schedLabel = schedMs ? fmtDt(schedMs) : ''
  const extraEntries = o.extra
    ? Object.entries(o.extra).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    : []
  const chosen = RESULTATS.find((r) => r.statut === result)
  const needsSched = !!chosen?.sched
  const pct = Math.round(((index + 1) / queue.length) * 100)
  const total = Math.max(0, Math.round(prix)) * Math.max(1, qte) + Math.max(0, Math.round(cout))
  const waText = `Bonjour ${o.client}, confirmation de votre commande ${o.numero} : ${produit}${qte > 1 ? ` (x${qte})` : ''} pour ${fcfa(total, false)}. Pouvez-vous confirmer la livraison ? Merci.`

  function finish(statut: Statut, rappelAt?: number) {
    onResult(o, {
      statut,
      commentaire: comment.trim() || undefined,
      rappelAt,
      prixNegocie: Math.round(prix) !== o.prixUnitaire ? Math.round(prix) : (o.prixNegocie ?? undefined),
      coutLivraison: cout > 0 ? Math.round(cout) : (o.coutLivraison ?? undefined),
      produit: produit.trim() && produit.trim() !== o.produit ? produit.trim() : undefined,
      quantite: qte !== o.quantite ? qte : undefined,
    })
    setComment(''); setShowEdit(false); setResult(null); setSchedAt('')
  }

  function selectResult(r: { statut: Statut; sched?: number }) {
    if (result === r.statut) { setResult(null); return }
    setResult(r.statut)
    if (r.sched && !schedAt) setSchedAt(toLocalInput(Date.now() + r.sched * 3600_000))
  }
  function commit() {
    if (!result) return
    if (needsSched) { if (schedMs) finish(result, schedMs) }
    else finish(result)
  }

  function ajouterPuce() {
    const v = newPuce.trim()
    if (!v || puces.includes(v)) { setNewPuce(''); return }
    const p = [...puces, v]; setPuces(p); savePuces(p); setNewPuce('')
  }
  function retirerPuce(x: string) {
    const p = puces.filter((c) => c !== x); setPuces(p); savePuces(p)
  }

  return (
    <div className="call">
      <div className="call-inner">
        {/* Vrai header : retour + n° de commande */}
        <header className="call-head">
          <button className="back" onClick={onClose} aria-label="Retour"><i className="ti ti-arrow-left" aria-hidden="true" /></button>
          <div className="ch-mid">
            <div className="ch-num">Commande {o.numero}</div>
            <div className="ch-step">{index + 1} / {queue.length}</div>
          </div>
          <span className={`ch-stat ${chosen?.tone ?? ''}`}>{STATUT_LABELS[o.statut] ?? o.statut}</span>
        </header>
        <div className="prog"><i style={{ width: `${pct}%` }} /></div>

        <div className="call-name">{o.client}</div>
        <div className="call-loc"><i className="ti ti-map-pin" aria-hidden="true" /> {o.adresse} · {o.region}{o.clientCount && o.clientCount > 1 ? <>&nbsp;·&nbsp;client ×{o.clientCount}</> : null}</div>
        <div className="call-line">
          <span className="p">{produit}{qte > 1 ? ` · ×${qte}` : ''}</span>
          <span className="a">{fcfa(total, false)}</span>
        </div>

        {o.commentaire ? (
          <div className="note"><i className="ti ti-note" aria-hidden="true" /><span>{o.commentaire}</span></div>
        ) : null}

        <div className="big">
          <a className="call-btn" href={telLink(o.telephone)}><i className="ti ti-phone" aria-hidden="true" /> Appeler</a>
          <a className="wa-btn" href={waLink(o.whatsapp, waText)} target="_blank" rel="noreferrer"><i className="ti ti-brand-whatsapp" aria-hidden="true" /> WhatsApp</a>
        </div>

        {/* Coût de livraison */}
        <label className="livz">
          <span><i className="ti ti-truck" aria-hidden="true" /> Coût de livraison (FCFA)</span>
          <input type="number" inputMode="numeric" min={0} value={cout || ''} onChange={(e) => setCout(+e.target.value || 0)} placeholder="ex. 2 500" />
        </label>

        {/* Résultat de l'appel — juste sous le coût */}
        <div className="sep">Résultat de l'appel</div>
        <div className={`res2 ${result ? 'chosen' : ''}`}>
          {RESULTATS.map((r) => (
            <button key={r.statut} aria-pressed={result === r.statut}
              className={`rc ${r.tone} ${result === r.statut ? 'on' : ''}`}
              onClick={() => selectResult(r)}>
              <span className="rc-ic"><i className={`ti ${r.icon}`} aria-hidden="true" /></span>
              <span className="rc-lb">{r.label}</span>
              {result === r.statut ? <i className="ti ti-circle-check-filled rc-ck" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
        {chosen ? <div className={`res-why ${chosen.tone}`}><i className="ti ti-info-circle" aria-hidden="true" /> {chosen.hint}</div> : null}

        {/* Planification (sans lieu) */}
        {needsSched ? (
          <div className="sched">
            <div className="sched-presets">
              {presets.map((p) => (
                <button key={p.label} className={schedAt === toLocalInput(p.at) ? 'on' : ''} onClick={() => setSchedAt(toLocalInput(p.at))}>{p.label}</button>
              ))}
            </div>
            <label className="sched-dt">
              <span><i className="ti ti-clock" aria-hidden="true" /> Date et heure</span>
              <input type="datetime-local" value={schedAt} min={toLocalInput(Date.now())} onChange={(e) => setSchedAt(e.target.value)} />
            </label>
          </div>
        ) : null}

        {/* Commentaire + puces configurables */}
        <div className="cm-block">
          <textarea className="cm-area" placeholder="Commentaire…" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
          <div className="qc">
            {puces.map((p) => (
              <span key={p} className="qc-chip">
                <button className="qc-add" onClick={() => setComment((c) => (c ? c + ' · ' + p : p))}>{p}</button>
                {gerePuces ? <button className="qc-del" onClick={() => retirerPuce(p)} aria-label="Supprimer"><i className="ti ti-x" aria-hidden="true" /></button> : null}
              </span>
            ))}
            <button className="qc-gear" onClick={() => setGerePuces((v) => !v)} aria-label="Gérer">
              <i className={`ti ${gerePuces ? 'ti-check' : 'ti-settings'}`} aria-hidden="true" />
            </button>
          </div>
          {gerePuces ? (
            <div className="qc-new">
              <input value={newPuce} placeholder="Nouveau commentaire rapide" onChange={(e) => setNewPuce(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') ajouterPuce() }} />
              <button onClick={ajouterPuce}><i className="ti ti-plus" aria-hidden="true" /></button>
            </div>
          ) : null}
        </div>

        {/* Validation */}
        {result ? (
          <button className={`validate ${chosen?.tone ?? ''}`} disabled={needsSched && !schedMs} onClick={commit}>
            <i className="ti ti-check" aria-hidden="true" />
            {needsSched ? `Programmer · ${schedLabel || '…'}` : `Valider : ${chosen?.label}`}
          </button>
        ) : (
          <div className="res-hint">Choisis un résultat ci-dessus pour valider.</div>
        )}

        {/* Détails complets de la commande */}
        <div className="fiche">
          <div className="fiche-t"><i className="ti ti-file-description" aria-hidden="true" /> Détails commande</div>
          <div className="fiche-grid">
            <div className="fiche-row"><span className="fk">N° commande</span><span className="fv">{o.numero}</span></div>
            <div className="fiche-row"><span className="fk">Téléphone</span><span className="fv"><a href={telLink(o.telephone)}>{o.telephone}</a></span></div>
            {o.whatsapp && <div className="fiche-row"><span className="fk">WhatsApp</span><span className="fv">{o.whatsapp}</span></div>}
            <div className="fiche-row"><span className="fk">Adresse</span><span className="fv">{o.adresse || '—'}</span></div>
            <div className="fiche-row"><span className="fk">Région</span><span className="fv">{o.region}</span></div>
            <div className="fiche-row"><span className="fk">Pays</span><span className="fv">{o.pays}</span></div>
            {o.createdAt && <div className="fiche-row"><span className="fk">Reçue le</span><span className="fv">{fmtDt(o.createdAt)}</span></div>}
            <div className="fiche-row"><span className="fk">Statut</span><span className="fv">{STATUT_LABELS[o.statut] ?? o.statut}</span></div>
            <div className="fiche-row"><span className="fk">Tentatives</span><span className="fv">{o.tentatives}</span></div>
            {o.rappelAt && <div className="fiche-row"><span className="fk">Rappel prévu</span><span className="fv">{fmtDt(o.rappelAt)}</span></div>}
            <div className="fiche-row"><span className="fk">Prix unitaire</span><span className="fv">{fcfa(o.prixUnitaire)}</span></div>
            {o.coutLivraison != null && o.coutLivraison > 0 && (
              <div className="fiche-row"><span className="fk">Livraison</span><span className="fv">{fcfa(o.coutLivraison)}</span></div>
            )}
            <div className="fiche-row"><span className="fk">Total</span><span className="fv fv-b">{fcfa(total)}</span></div>
            {extraEntries.map(([k, v]) => (
              <div key={k} className="fiche-row"><span className="fk">{k}</span><span className="fv">{String(v)}</span></div>
            ))}
          </div>

          {/* Modifier produit / quantité / prix */}
          <button className="edit-toggle" onClick={() => setShowEdit((v) => !v)}>
            <i className={`ti ${showEdit ? 'ti-chevron-down' : 'ti-pencil'}`} aria-hidden="true" /> Modifier la commande
          </button>
          {showEdit ? (
            <div className="edit-grid">
              <label>Produit<input value={produit} onChange={(e) => setProduit(e.target.value)} /></label>
              <label>Quantité<input type="number" min={1} value={qte} onChange={(e) => setQte(Math.max(1, +e.target.value || 1))} /></label>
              <label>Prix (FCFA)<input type="number" min={0} value={prix} onChange={(e) => setPrix(+e.target.value || 0)} /></label>
              <div className="edit-total">Total : <b>{fcfa(total, false)}</b></div>
            </div>
          ) : null}
        </div>

        {/* Historique */}
        <div className="histo">
          <div className="histo-t"><i className="ti ti-history" aria-hidden="true" /> Historique</div>
          {o.createdAt ? (
            <div className="he"><span className="he-d">{fmtDt(o.createdAt)}</span><span className="he-s">Commande reçue</span></div>
          ) : null}
          {hist.map((h, i) => (
            <div className="he" key={i}>
              <span className="he-d">{fmtDt(h.date)}</span>
              <span className="he-s">{STATUT_LABELS[h.statut] ?? h.statut}{h.commentaire ? ` — ${h.commentaire}` : ''}</span>
            </div>
          ))}
          {!hist.length && !o.createdAt ? <div className="he-empty">Aucun historique enregistré.</div> : null}
        </div>

        <div className="spacer" />
      </div>
    </div>
  )
}
