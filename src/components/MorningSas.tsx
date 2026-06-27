import { useState } from 'react'
import type { Order } from '../types'
import { fcfa } from '../lib'

type Issue = 'livre' | 'retour' | 'reporte'

export default function MorningSas({ orders, onDone, onResolve }: {
  orders: Order[]
  onDone: () => void
  onResolve?: (id: string, issue: Issue) => void
}) {
  // Fige la liste du matin : les cartes ne disparaissent pas au clic (livré -> archivé).
  const [list] = useState(orders)
  const [resolved, setResolved] = useState<Record<string, Issue>>({})
  const done = Object.keys(resolved).length
  const total = list.length

  const mark = (id: string, issue: Issue) => {
    setResolved((p) => ({ ...p, [id]: issue }))
    onResolve?.(id, issue)
  }

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

      {list.map((o) => {
        const r = resolved[o.id]
        return (
          <div className={`dcard ${r ? 'done' : ''}`} key={o.id}>
            <div className="dch">
              <span className="nm">{o.client}</span>
              <span className="amt">{fcfa(o.total)}</span>
            </div>
            <div className="sub">{o.produit} · {o.adresse}</div>
            <div className="dcb">
              <button className={`liv ${r === 'livre' ? 'on' : ''}`} onClick={() => mark(o.id, 'livre')}>
                <i className="ti ti-check" aria-hidden="true" />{r === 'livre' ? 'Livré ✓' : 'Livré'}
              </button>
              <button className={`ret ${r === 'retour' ? 'on' : ''}`} onClick={() => mark(o.id, 'retour')}>
                <i className="ti ti-arrow-back-up" aria-hidden="true" />{r === 'retour' ? 'Retour ✓' : 'Retour'}
              </button>
              <button className={`rep ${r === 'reporte' ? 'on' : ''}`} onClick={() => mark(o.id, 'reporte')}>
                <i className="ti ti-calendar" aria-hidden="true" />{r === 'reporte' ? 'Reporté ✓' : 'Reporté'}
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
