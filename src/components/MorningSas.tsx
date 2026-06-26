import { useState } from 'react'
import type { Order } from '../types'
import { fcfa } from '../lib'

type Issue = 'livre' | 'retour' | 'reporte'

export default function MorningSas({ orders, onDone }: { orders: Order[]; onDone: () => void }) {
  const [resolved, setResolved] = useState<Record<string, Issue>>({})
  const done = Object.keys(resolved).length
  const total = orders.length

  return (
    <div className="app">
      <div className="hdr">
        <span className="who"><i className="ti ti-sun" aria-hidden="true" />À clôturer · livraisons d'hier</span>
      </div>

      <div className="lockbar">
        <i className="ti ti-lock" aria-hidden="true" />
        Confirme ces livraisons pour débloquer tes appels du jour
        <span className="pg">{done}/{total}</span>
      </div>

      {orders.map((o) => {
        const r = resolved[o.id]
        return (
          <div className={`dcard ${r ? 'done' : ''}`} key={o.id}>
            <div className="dch">
              <span className="nm">{o.client}</span>
              <span className="amt">{fcfa(o.total)}</span>
            </div>
            <div className="sub">{o.produit} · {o.adresse} · hier</div>
            <div className="dcb">
              <button className="liv" onClick={() => setResolved((p) => ({ ...p, [o.id]: 'livre' }))}>
                <i className="ti ti-check" aria-hidden="true" />{r === 'livre' ? 'Livré ✓' : 'Livré'}
              </button>
              <button className="ret" onClick={() => setResolved((p) => ({ ...p, [o.id]: 'retour' }))}>
                <i className="ti ti-arrow-back-up" aria-hidden="true" />Retour
              </button>
              <button className="rep" onClick={() => setResolved((p) => ({ ...p, [o.id]: 'reporte' }))}>
                <i className="ti ti-calendar" aria-hidden="true" />Reporté
              </button>
            </div>
          </div>
        )
      })}

      <div className="cta-wrap" style={{ background: 'transparent' }}>
        <button className="sasdone" disabled={done < total} onClick={onDone}>
          {done < total ? `Encore ${total - done} à clôturer` : 'Commencer ma journée'}
        </button>
      </div>
    </div>
  )
}
