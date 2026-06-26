import type { Order } from '../types'
import { fcfa, mmss, hm, telLink, waLink, isLate } from '../lib'

function Timer({ o, now }: { o: Order; now: number }) {
  if (o.statut === 'a_rappeler' && o.rappelAt) {
    const late = now > o.rappelAt
    return (
      <span className={`chip ${late ? 'dang' : 'info'}`}>
        <i className="ti ti-bell" aria-hidden="true" />
        {late ? `${hm(o.rappelAt)} dépassé` : hm(o.rappelAt)}
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
    const rem = o.deadline - now
    if (rem < 0) {
      return (
        <span className="chip dang">
          <i className="ti ti-alert-triangle" aria-hidden="true" />
          +{mmss(-rem)}
        </span>
      )
    }
    return (
      <span className={`chip ${rem < 180_000 ? 'warn' : 'muted'}`}>
        <i className="ti ti-clock" aria-hidden="true" />
        {mmss(rem)}
      </span>
    )
  }
  return null
}

export default function OrderCard({
  o, now, onOpen,
}: {
  o: Order
  now: number
  onOpen: (o: Order) => void
}) {
  const late = isLate(o, now)
  return (
    <div className={`card ${late ? 'late' : ''}`} onClick={() => onOpen(o)}>
      <div className="r1">
        <span className="nm">{o.client}</span>
        <Timer o={o} now={now} />
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

      {(o.clientCount && o.clientCount > 1) || o.commentaire || o.rappelLieu ? (
        <div className="badges">
          {o.clientCount && o.clientCount > 1 ? (
            <span className="bdg"><i className="ti ti-repeat" aria-hidden="true" /> client ×{o.clientCount}</span>
          ) : null}
          {o.rappelLieu ? (
            <span className="bdg"><i className="ti ti-map-pin-2" aria-hidden="true" /> {o.rappelLieu}</span>
          ) : null}
          {o.commentaire ? (
            <span className="bdg"><i className="ti ti-message" aria-hidden="true" /> {o.commentaire}</span>
          ) : null}
        </div>
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
