import { useEffect, useMemo, useState } from 'react'
import type { Order, Statut, CallResult } from '../types'
import { fcfa, hm, telLink, waLink } from '../lib'

const RESULTATS: { statut: Statut; label: string; icon: string; tone: string; sched?: boolean }[] = [
  { statut: 'confirme', label: 'Confirmé', icon: 'ti-check', tone: 'ok' },
  { statut: 'a_rappeler', label: 'À rappeler', icon: 'ti-calendar', tone: 'info', sched: true },
  { statut: 'injoignable', label: 'Injoignable', icon: 'ti-phone-off', tone: 'warn', sched: true },
  { statut: 'whatsapp', label: 'Sur WhatsApp', icon: 'ti-brand-whatsapp', tone: 'ok' },
  { statut: 'refuse', label: 'Refus', icon: 'ti-x', tone: 'dang' },
  { statut: 'ne_reconnait_pas', label: 'Ne reconnaît pas', icon: 'ti-help', tone: '' },
]

const STATUT_LABELS: Record<string, string> = {
  a_appeler: 'À appeler', a_rappeler: 'À rappeler', injoignable: 'Injoignable',
  confirme: 'Confirmé', whatsapp: 'WhatsApp', refuse: 'Refus',
  ne_reconnait_pas: 'Ne reconnaît pas', livraison: 'En livraison', livre: 'Livré', annule: 'Annulé',
}
function fmtDt(ms: number) {
  return new Date(ms).toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const PUCES = ['il attend son salaire', 'rappelle plus tard', '10 000 F', 'raccroché au nez', 'discute WhatsApp', 'pas disponible']

/** ms epoch -> valeur d'un <input type="datetime-local"> en heure locale. */
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

function buildPresets(): { label: string; at: number }[] {
  const now = new Date()
  const at = (h: number, m: number, addDays: number) => {
    const x = new Date(now); x.setDate(x.getDate() + addDays); x.setHours(h, m, 0, 0); return x.getTime()
  }
  const soir = at(18, 0, 0) > now.getTime() ? at(18, 0, 0) : at(18, 0, 1)
  return [
    { label: 'Dans 1h', at: now.getTime() + 3600_000 },
    { label: 'Dans 3h', at: now.getTime() + 3 * 3600_000 },
    { label: 'Ce soir 18h', at: soir },
    { label: 'Demain 9h', at: at(9, 0, 1) },
    { label: 'Demain 14h', at: at(14, 0, 1) },
  ]
}

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
  const [adresse, setAdresse] = useState(o?.adresse ?? '')
  const [result, setResult] = useState<Statut | null>(null)
  const [schedAt, setSchedAt] = useState('')
  const [lieu, setLieu] = useState(o?.rappelLieu ?? '')
  const presets = useMemo(buildPresets, [index])

  // Réinitialise les champs à chaque changement de commande dans la file.
  const oid = o?.id
  useEffect(() => {
    setComment(''); setShowEdit(false); setResult(null); setSchedAt(''); setLieu('')
    setPrix(o?.prixNegocie ?? o?.prixUnitaire ?? 0)
    setCout(o?.coutLivraison ?? 0)
    setProduit(o?.produit ?? '')
    setQte(o?.quantite ?? 1)
    setAdresse(o?.adresse ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oid])

  if (!o) return null
  const schedMs = fromLocalInput(schedAt)
  const schedLabel = schedMs
    ? new Date(schedMs).toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : ''
  const extraEntries = o.extra
    ? Object.entries(o.extra).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    : []
  const needsSched = result === 'a_rappeler' || result === 'injoignable'
  const pct = Math.round(((index + 1) / queue.length) * 100)
  const total = Math.max(0, Math.round(prix)) * Math.max(1, qte) + Math.max(0, Math.round(cout))
  const waText = `Bonjour ${o.client}, confirmation de votre commande ${o.numero} : ${produit}${qte > 1 ? ` (x${qte})` : ''} pour ${fcfa(total, false)}. Pouvez-vous confirmer la livraison ? Merci.`

  function finish(statut: Statut, rappelAt?: number) {
    onResult(o, {
      statut,
      commentaire: comment.trim() || undefined,
      rappelAt,
      rappelLieu: rappelAt ? (lieu.trim() || undefined) : undefined,
      prixNegocie: Math.round(prix) !== o.prixUnitaire ? Math.round(prix) : (o.prixNegocie ?? undefined),
      coutLivraison: cout > 0 ? Math.round(cout) : (o.coutLivraison ?? undefined),
      produit: produit.trim() && produit.trim() !== o.produit ? produit.trim() : undefined,
      quantite: qte !== o.quantite ? qte : undefined,
      adresse: adresse.trim() && adresse.trim() !== o.adresse ? adresse.trim() : undefined,
    })
    // reset pour la commande suivante
    setComment(''); setShowEdit(false); setResult(null); setSchedAt(''); setLieu('')
  }

  // Sélection d'un résultat : un seul à la fois, re-clic = décoche, on peut changer.
  function selectResult(r: { statut: Statut; sched?: boolean }) {
    if (result === r.statut) { setResult(null); return }
    setResult(r.statut)
    // Injoignable / à rappeler : pré-remplit +1h, modifiable ensuite.
    if (r.sched && !schedAt) setSchedAt(toLocalInput(Date.now() + 3600_000))
  }
  // Validation explicite : enregistre le résultat sélectionné et passe à la suivante.
  function commit() {
    if (!result) return
    if (needsSched) { if (schedMs) finish(result, schedMs) }
    else finish(result)
  }

  return (
    <div className="call">
      <div className="call-inner">
        <div className="call-top">
          <span className="call-step">Commande {index + 1} / {queue.length}</span>
          <button className="x" onClick={onClose} aria-label="Fermer"><i className="ti ti-x" aria-hidden="true" /></button>
        </div>
        <div className="prog"><i style={{ width: `${pct}%` }} /></div>

        <div className="call-name">{o.client}</div>
        <div className="call-loc"><i className="ti ti-map-pin" aria-hidden="true" /> {o.adresse} · {o.region}{o.clientCount && o.clientCount > 1 ? <>&nbsp;·&nbsp;client ×{o.clientCount}</> : null}</div>
        <div className="call-line">
          <span className="p">{produit}{qte > 1 ? ` · ×${qte}` : ''}</span>
          <span className="a">{fcfa(total, false)}</span>
        </div>

        {o.commentaire || o.rappelAt ? (
          <div className="note">
            <i className="ti ti-note" aria-hidden="true" />
            <span>{o.commentaire ? `Note : ${o.commentaire}` : 'Rappel'}{o.rappelAt ? ` — ${hm(o.rappelAt)}${o.rappelLieu ? ` (${o.rappelLieu})` : ''}` : ''}</span>
          </div>
        ) : null}

        <div className="big">
          <a className="call-btn" href={telLink(o.telephone)}><i className="ti ti-phone" aria-hidden="true" /> Appeler</a>
          <a className="wa-btn" href={waLink(o.whatsapp, waText)} target="_blank" rel="noreferrer"><i className="ti ti-brand-whatsapp" aria-hidden="true" /> WhatsApp</a>
        </div>

        {/* Coût de livraison — saisissable directement */}
        <label className="livz">
          <span><i className="ti ti-truck" aria-hidden="true" /> Coût de livraison (FCFA)</span>
          <input type="number" min={0} value={cout} onChange={(e) => setCout(+e.target.value || 0)} placeholder="ex. 2 500" />
        </label>

        {/* Fiche complète de la commande */}
        <div className="fiche">
          <div className="fiche-t"><i className="ti ti-file-description" aria-hidden="true" /> Détails commande</div>
          <div className="fiche-grid">
            <div className="fiche-row"><span className="fk">N° commande</span><span className="fv">{o.numero}</span></div>
            <div className="fiche-row"><span className="fk">Téléphone</span><span className="fv"><a href={telLink(o.telephone)}>{o.telephone}</a></span></div>
            {o.whatsapp && <div className="fiche-row"><span className="fk">WhatsApp</span><span className="fv">{o.whatsapp}</span></div>}
            <div className="fiche-row"><span className="fk">Adresse</span><span className="fv">{o.adresse || '—'}</span></div>
            <div className="fiche-row"><span className="fk">Région</span><span className="fv">{o.region}</span></div>
            <div className="fiche-row"><span className="fk">Pays</span><span className="fv">{o.pays}</span></div>
            <div className="fiche-row"><span className="fk">Statut</span><span className="fv">{STATUT_LABELS[o.statut] ?? o.statut}</span></div>
            <div className="fiche-row"><span className="fk">Tentatives</span><span className="fv">{o.tentatives}</span></div>
            {o.deadline && <div className="fiche-row"><span className="fk">Limite appel</span><span className="fv">{fmtDt(o.deadline)}</span></div>}
            {o.rappelAt && <div className="fiche-row"><span className="fk">Rappel prévu</span><span className="fv">{fmtDt(o.rappelAt)}{o.rappelLieu ? ` — ${o.rappelLieu}` : ''}</span></div>}
            <div className="fiche-row"><span className="fk">Prix unitaire</span><span className="fv">{fcfa(o.prixUnitaire)}</span></div>
            {o.prixNegocie != null && o.prixNegocie !== o.prixUnitaire && (
              <div className="fiche-row"><span className="fk">Prix négocié</span><span className="fv">{fcfa(o.prixNegocie)}</span></div>
            )}
            {o.coutLivraison != null && o.coutLivraison > 0 && (
              <div className="fiche-row"><span className="fk">Livraison</span><span className="fv">{fcfa(o.coutLivraison)}</span></div>
            )}
            <div className="fiche-row"><span className="fk">Total</span><span className="fv fv-b">{fcfa(total)}</span></div>
            {extraEntries.map(([k, v]) => (
              <div key={k} className="fiche-row"><span className="fk">{k}</span><span className="fv">{String(v)}</span></div>
            ))}
          </div>
        </div>

        {/* Édition de la commande */}
        <button className="edit-toggle" onClick={() => setShowEdit((v) => !v)}>
          <i className={`ti ${showEdit ? 'ti-chevron-down' : 'ti-pencil'}`} aria-hidden="true" /> Modifier la commande
        </button>
        {showEdit ? (
          <div className="edit-grid">
            <label>Produit<input value={produit} onChange={(e) => setProduit(e.target.value)} /></label>
            <label>Quantité<input type="number" min={1} value={qte} onChange={(e) => setQte(Math.max(1, +e.target.value || 1))} /></label>
            <label>Prix (FCFA)<input type="number" min={0} value={prix} onChange={(e) => setPrix(+e.target.value || 0)} /></label>
            <label>Adresse<input value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="ex. Douala — Akwa" /></label>
            <div className="edit-total">Total : <b>{fcfa(total, false)}</b></div>
          </div>
        ) : null}

        {/* Commentaire */}
        <div className="cm-block">
          <textarea className="cm-area" placeholder="Commentaire (ex. il attend son salaire)…" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
          <div className="qc">
            {PUCES.map((p) => (
              <span key={p} onClick={() => setComment((c) => (c ? c + ' · ' + p : p))}>{p}</span>
            ))}
          </div>
        </div>

        <div className="sep">Résultat de l'appel</div>
        <div className="res">
          {RESULTATS.map((r) => (
            <button key={r.statut} aria-pressed={result === r.statut}
              className={`${r.tone} ${result === r.statut ? 'on' : ''}`}
              onClick={() => selectResult(r)}>
              <i className={`ti ${r.icon}`} aria-hidden="true" /> {r.label}
            </button>
          ))}
        </div>

        {needsSched ? (
          <div className="sched">
            <div className="sched-t">
              <i className="ti ti-clock" aria-hidden="true" /> Quand rappeler ?
              {result === 'injoignable' ? <span className="sched-def">défaut +1h</span> : null}
            </div>
            <div className="sched-presets">
              {presets.map((p) => (
                <button key={p.label} className={schedAt === toLocalInput(p.at) ? 'on' : ''} onClick={() => setSchedAt(toLocalInput(p.at))}>{p.label}</button>
              ))}
            </div>
            <label className="sched-dt">
              <span>Ou une date et heure précises</span>
              <input type="datetime-local" value={schedAt} min={toLocalInput(Date.now())} onChange={(e) => setSchedAt(e.target.value)} />
            </label>
            <input className="sched-lieu" placeholder="Lieu du RDV (optionnel) — ex. marché Ndogpassi" value={lieu} onChange={(e) => setLieu(e.target.value)} />
          </div>
        ) : null}

        {result ? (
          <button className="validate" disabled={needsSched && !schedMs} onClick={commit}>
            <i className="ti ti-check" aria-hidden="true" />
            {needsSched
              ? `Programmer le rappel${schedLabel ? ` · ${schedLabel}` : ''}`
              : `Valider : ${RESULTATS.find((x) => x.statut === result)?.label}`}
          </button>
        ) : (
          <div className="res-hint">Sélectionne un résultat, puis valide. Tu peux le changer ou le décocher avant.</div>
        )}

        <div className="spacer" />
      </div>
    </div>
  )
}
