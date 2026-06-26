import type { Order, Statut } from '../types'
import { fcfa, hm, telLink, waLink } from '../lib'

const RESULTATS: { statut: Statut; label: string; icon: string; tone: string }[] = [
  { statut: 'confirme', label: 'Confirmé', icon: 'ti-check', tone: 'ok' },
  { statut: 'a_rappeler', label: 'À rappeler', icon: 'ti-calendar', tone: 'info' },
  { statut: 'injoignable', label: 'Injoignable', icon: 'ti-phone-off', tone: 'warn' },
  { statut: 'whatsapp', label: 'Sur WhatsApp', icon: 'ti-brand-whatsapp', tone: 'ok' },
  { statut: 'refuse', label: 'Refus', icon: 'ti-x', tone: 'dang' },
  { statut: 'ne_reconnait_pas', label: 'Ne reconnaît pas', icon: 'ti-help', tone: '' },
]

const PUCES = ['il attend son salaire', 'rappelle à 16h', '10 000 F', 'raccroché au nez', 'discute WhatsApp']

export default function CallMode({
  queue, index, onResult, onClose,
}: {
  queue: Order[]
  index: number
  onResult: (o: Order, statut: Statut) => void
  onClose: () => void
}) {
  const o = queue[index]
  if (!o) return null
  const pct = Math.round(((index + 1) / queue.length) * 100)
  const waText = `Bonjour ${o.client}, c'est au sujet de votre commande ${o.numero} (${o.produit}).`

  return (
    <div className="call">
      <div className="call-inner">
        <div className="call-top">
          <span className="call-step">Commande {index + 1} / {queue.length}</span>
          <button className="x" onClick={onClose} aria-label="Fermer">
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>
        <div className="prog"><i style={{ width: `${pct}%` }} /></div>

        <div className="call-name">{o.client}</div>
        <div className="call-loc">
          <i className="ti ti-map-pin" aria-hidden="true" /> {o.adresse} · {o.region}
          {o.clientCount && o.clientCount > 1 ? <>&nbsp;·&nbsp;client ×{o.clientCount}</> : null}
        </div>
        <div className="call-line">
          <span className="p">{o.produit}{o.quantite > 1 ? ` · ×${o.quantite}` : ''}</span>
          <span className="a">{fcfa(o.total, false)}</span>
        </div>

        {o.commentaire || o.rappelAt ? (
          <div className="note">
            <i className="ti ti-note" aria-hidden="true" />
            <span>
              {o.commentaire ? `Note : ${o.commentaire}` : 'Rappel programmé'}
              {o.rappelAt ? ` — rappel ${hm(o.rappelAt)}${o.rappelLieu ? ` (${o.rappelLieu})` : ''}` : ''}
            </span>
          </div>
        ) : null}

        <div className="big">
          <a className="call-btn" href={telLink(o.telephone)}>
            <i className="ti ti-phone" aria-hidden="true" /> Appeler
          </a>
          <a className="wa-btn" href={waLink(o.whatsapp, waText)} target="_blank" rel="noreferrer">
            <i className="ti ti-brand-whatsapp" aria-hidden="true" /> WhatsApp
          </a>
        </div>

        <div className="sep">Résultat de l'appel</div>
        <div className="res">
          {RESULTATS.map((r) => (
            <button key={r.statut} className={r.tone} onClick={() => onResult(o, r.statut)}>
              <i className={`ti ${r.icon}`} aria-hidden="true" /> {r.label}
            </button>
          ))}
        </div>

        <div className="qc">
          {PUCES.map((p) => <span key={p}>{p}</span>)}
        </div>

        <div className="spacer" />
      </div>
    </div>
  )
}
