import type { Order } from '../types'
import { fcfa, hms, telLink, waLink, isLate } from '../lib'

function Timer({ o, now, paused }: { o: Order; now: number; paused?: boolean }) {
  // Rappel / injoignable programmé : vrai décompte vers l'heure de rappel.
  if ((o.statut === 'a_rappeler' || o.statut === 'injoignable') && o.rappelAt) {
    if (paused) return <span className="chip muted"><i className="ti ti-player-pause" aria-hidden="true" /> en pause</span>
    const rem = o.rappelAt - now
    const ic = o.statut === 'a_rappeler' ? 'ti-bell' : 'ti-phone-off'
    if (rem < 0) {
      return <span className="chip dang"><i className="ti ti-alert-triangle" aria-hidden="true" /> +{hms(-rem)}</span>
    }
    return (
      <span className={`chip ${rem < 180_000 ? 'warn' : 'info'}`}>
        <i className={`ti ${ic}`} aria-hidden="true" /> {hms(rem)}
      </span>
    )
  }
  if (o.statut === 'injoignable') {
    return (
      <span className="chip warn">
        <i className="ti ti-phone-off" aria-hidden="true" />
        {o.tentatives}/4
      </span>
    )
  }
  if (o.deadline) {
    if (paused) {
      return <span className="chip muted"><i className="ti ti-player-pause" aria-hidden="true" /> en pause</span>
    }
    const rem = o.deadline - now
    if (rem < 0) {
      return (
        <span className="chip dang">
          <i className="ti ti-alert-triangle" aria-hidden="true" />
          +{hms(-rem)}
        </span>
      )
    }
    return (
      <span className={`chip ${rem < 180_000 ? 'warn' : 'muted'}`}>
        <i className="ti ti-clock" aria-hidden="true" />
        {hms(rem)}
      </span>
    )
  }
  return null
}

const STATUT_INFO: Record<Order['statut'], { label: string; tone: string }> = {
  a_appeler: { label: 'À appeler', tone: '' },
  a_rappeler: { label: 'À rappeler', tone: 'info' },
  injoignable: { label: 'Injoignable', tone: 'warn' },
  reporte: { label: 'Reporté', tone: 'info' },
  confirme: { label: 'Confirmé', tone: 'ok' },
  whatsapp: { label: 'WhatsApp', tone: 'ok' },
  refuse: { label: 'Refus', tone: 'dang' },
  ne_reconnait_pas: { label: 'Ne reconnaît pas', tone: '' },
  livraison: { label: 'Livraison', tone: 'info' },
  livre: { label: 'Livré', tone: 'ok' },
  annule: { label: 'Annulé', tone: '' },
}

export default function OrderCard({
  o, now, onOpen, selectMode, selected, onToggle, paused,
}: {
  o: Order
  now: number
  onOpen: (o: Order) => void
  selectMode?: boolean
  selected?: boolean
  onToggle?: (id: string) => void
  paused?: boolean
}) {
  const late = !paused && isLate(o, now)
  return (
    <div
      className={`card ${late ? 'late' : ''} ${selectMode ? 'selecting' : ''} ${selected ? 'selected' : ''}`}
      onClick={() => (selectMode ? onToggle?.(o.id) : onOpen(o))}
    >
      {selectMode ? (
        <span className={`selbox ${selected ? 'on' : ''}`}>{selected ? <i className="ti ti-check" aria-hidden="true" /> : null}</span>
      ) : null}
      <div className="r1">
        <span className="nm">{o.client}</span>
        <Timer o={o} now={now} paused={paused} />
      </div>
      <div className="sub">
        {o.produit}{o.quantite > 1 ? ` · ×${o.quantite}` : ''}
      </div>
      <div className="r2">
        <span className="amt">{fcfa(o.total)}</span>
        <span className="loc">
          <i className="ti ti-map-pin" aria-hidden="true" /> {o.adresse} · {o.region}
        </span>
      </div>

      <div className="badges">
        <span className={`pastille ${STATUT_INFO[o.statut]?.tone ?? ''}`}><span className="pdot" />{STATUT_INFO[o.statut]?.label ?? o.statut}</span>
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
