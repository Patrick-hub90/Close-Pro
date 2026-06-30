import type { Order } from '../types'
import { fcfa, hms, telLink, waLink, isLate } from '../lib'

// Compte à rebours unique (closeuse ET propriétaire). Tourne vers l'heure cible selon le statut ;
// passe en « -HH:MM:SS » rouge une fois dépassé (jamais de « + »).
function Timer({ o, now }: { o: Order; now: number }) {
  let cible: number | undefined
  let ic = 'ti-clock'
  // Pas de compte à rebours affiché pour les nouvelles commandes (« à appeler ») : le délai des
  // 10 min reste calculé en interne (retard + notifications) mais n'apporte rien à l'écran.
  if (o.statut === 'a_rappeler') { cible = o.rappelAt; ic = 'ti-bell' }
  else if (o.statut === 'injoignable') { cible = o.rappelAt; ic = 'ti-phone-off' }
  else if (o.statut === 'reporte') { cible = o.rappelAt; ic = 'ti-calendar-event' }
  if (!cible) return null
  // Le décompte tourne TOUJOURS (jamais « en pause ») : un rappel / report programmé après la fin des
  // horaires doit continuer à décompter vers son heure. Seule la PÉNALITÉ de retard est désactivée hors
  // horaires (cf. `late`) — les performances de la closeuse ne sont pas comptées pendant la pause.
  const rem = cible - now
  if (rem < 0) {
    return <span className="chip dang"><i className="ti ti-alert-triangle" aria-hidden="true" /> -{hms(-rem)}</span>
  }
  return (
    <span className={`chip ${rem < 180_000 ? 'warn' : 'muted'}`}>
      <i className={`ti ${ic}`} aria-hidden="true" /> {hms(rem)}
    </span>
  )
}

const STATUT_INFO: Record<Order['statut'], { label: string; tone: string }> = {
  a_appeler: { label: 'Nouveau', tone: 'new' },
  a_rappeler: { label: 'À rappeler', tone: 'info' },
  injoignable: { label: 'Injoignable', tone: 'warn' },
  reporte: { label: 'Reporté', tone: 'rep' },
  confirme: { label: 'Livraison', tone: 'info' },
  whatsapp: { label: 'WhatsApp', tone: 'ok' },
  refuse: { label: 'Refus', tone: 'dang' },
  ne_reconnait_pas: { label: 'Ne reconnaît pas', tone: '' },
  livraison: { label: 'Livraison', tone: 'info' },
  livre: { label: 'Livré', tone: 'ok' },
  annule: { label: 'Annulé', tone: 'dang' },
}

export default function OrderCard({
  o, now, onOpen, selectMode, selected, onToggle, paused, owner,
}: {
  o: Order
  now: number
  onOpen: (o: Order) => void
  selectMode?: boolean
  selected?: boolean
  onToggle?: (id: string) => void
  paused?: boolean
  owner?: boolean
}) {
  // Pas de pulsation d'urgence pour le propriétaire (vue de supervision).
  const late = !paused && !owner && isLate(o, now)
  // La pastille reflète toujours la nature réelle du statut (un rappel dépassé garde « À rappeler »).
  const sInfo = STATUT_INFO[o.statut] ?? { label: o.statut, tone: '' }
  return (
    <div
      className={`card ${late ? 'late' : ''} ${selectMode ? 'selecting' : ''} ${selected ? 'selected' : ''}`}
      onClick={() => (selectMode ? onToggle?.(o.id) : onOpen(o))}
    >
      {selectMode ? (
        <span className={`selbox ${selected ? 'on' : ''}`}>{selected ? <i className="ti ti-check" aria-hidden="true" /> : null}</span>
      ) : null}
      <div className="r1">
        <span className="nm">{o.numero}</span>
        <Timer o={o} now={now} />
      </div>
      <div className="sub">
        {o.client} · {o.produit}{o.quantite > 1 ? ` · ×${o.quantite}` : ''}
      </div>
      <div className="r2">
        <span className="amt">{fcfa(o.total)}</span>
        <span className="loc">
          <i className="ti ti-map-pin" aria-hidden="true" /> {o.adresse} · {o.region}
        </span>
      </div>

      <div className="badges">
        <span className={`pastille ${sInfo.tone}`}><span className="pdot" />{sInfo.label}</span>
        {o.clientCount && o.clientCount > 1 ? (
          <span className="bdg"><i className="ti ti-repeat" aria-hidden="true" /> client ×{o.clientCount}</span>
        ) : null}
        {o.rappelLieu ? (
          <span className="bdg"><i className="ti ti-map-pin-2" aria-hidden="true" /> {o.rappelLieu}</span>
        ) : null}
      </div>
      {o.commentaire ? (
        <div className="card-comment"><i className="ti ti-message" aria-hidden="true" /> {o.commentaire}</div>
      ) : null}

      <div className="acts" onClick={(e) => e.stopPropagation()}>
        <a href={telLink(o.telephone)}>
          <i className="ti ti-phone" aria-hidden="true" /> Appeler
        </a>
        <a className="wa" href={waLink(o.whatsapp)} target="_blank" rel="noreferrer">
          <i className="ti ti-brand-whatsapp" aria-hidden="true" /> WhatsApp
        </a>
      </div>
    </div>
  )
}
