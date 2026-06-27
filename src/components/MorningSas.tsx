import { useState } from 'react'
import type { Order } from '../types'
import { fcfa } from '../lib'

type Issue = 'livre' | 'annule' | 'reporte'

export default function MorningSas({ orders, onDone, onResolve, onSetCost }: {
  orders: Order[]
  onDone: () => void
  onResolve?: (id: string, issue: Issue) => void
  onSetCost?: (id: string, cout: number) => void
}) {
  // Fige la liste du matin : les cartes ne disparaissent pas au clic.
  const [list] = useState(orders)
  const [resolved, setResolved] = useState<Record<string, Issue>>({})
  // Coûts saisis pendant la session (reflètent ce que le parent a déjà mis à jour).
  const [costs, setCosts] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {}
    for (const o of orders) if (o.coutLivraison) m[o.id] = o.coutLivraison
    return m
  })
  const [erreur, setErreur] = useState<string[] | null>(null)
  const done = Object.keys(resolved).length
  const total = list.length

  const coutDe = (o: Order) => costs[o.id] ?? o.coutLivraison ?? 0

  const mark = (o: Order, issue: Issue) => {
    // Livré exige un coût de livraison.
    if (issue === 'livre' && !coutDe(o)) { setErreur([o.numero]); return }
    setResolved((p) => ({ ...p, [o.id]: issue }))
    onResolve?.(o.id, issue)
  }

  const saisirCout = (o: Order, v: number) => {
    setCosts((p) => ({ ...p, [o.id]: v }))
    if (v > 0) onSetCost?.(o.id, v)
  }

  // Tout marquer livré : bloque si des commandes n'ont pas de coût de livraison.
  const toutLivrer = () => {
    const restants = list.filter((o) => resolved[o.id] !== 'livre' && resolved[o.id] !== 'annule')
    const sansCout = restants.filter((o) => !coutDe(o))
    if (sansCout.length) { setErreur(sansCout.map((o) => o.numero)); return }
    const next = { ...resolved }
    for (const o of restants) { next[o.id] = 'livre'; onResolve?.(o.id, 'livre') }
    setResolved(next)
  }

  return (
    <div className="app">
      <div className="hdr">
        <span className="who"><i className="ti ti-sun" aria-hidden="true" />À clôturer · livraisons</span>
      </div>

      <div className="lockbar">
        <i className="ti ti-lock" aria-hidden="true" />
        Clôture ces livraisons pour débloquer tes appels du jour
        <span className="pg">{done}/{total}</span>
      </div>

      <button className="sas-all" onClick={toutLivrer}>
        <i className="ti ti-checks" aria-hidden="true" /> Tout marquer livré
      </button>

      {list.map((o) => {
        const r = resolved[o.id]
        const cout = coutDe(o)
        const manque = !cout
        return (
          <div className={`dcard ${r ? 'done' : ''} ${manque ? 'nocost' : ''}`} key={o.id}>
            <div className="dch">
              <span className="nm">{o.client} · <span className="dc-num">{o.numero}</span></span>
              <span className="amt">{fcfa(o.total)}</span>
            </div>
            <div className="sub">{o.produit} · {o.adresse}</div>

            {manque ? (
              <label className="dcost">
                <span><i className="ti ti-alert-triangle" aria-hidden="true" /> Coût de livraison manquant</span>
                <input type="number" inputMode="numeric" min={0} placeholder="FCFA"
                  value={costs[o.id] || ''} onChange={(e) => saisirCout(o, +e.target.value || 0)} />
              </label>
            ) : (
              <div className="dcost-ok"><i className="ti ti-truck" aria-hidden="true" /> Livraison {fcfa(cout)}</div>
            )}

            <div className="dcb">
              <button className={`liv ${r === 'livre' ? 'on' : ''}`} disabled={manque} onClick={() => mark(o, 'livre')}>
                <i className="ti ti-check" aria-hidden="true" />{r === 'livre' ? 'Livré ✓' : 'Livré'}
              </button>
              <button className={`ret ${r === 'annule' ? 'on' : ''}`} onClick={() => mark(o, 'annule')}>
                <i className="ti ti-x" aria-hidden="true" />{r === 'annule' ? 'Annulé ✓' : 'Annulé'}
              </button>
              <button className={`rep ${r === 'reporte' ? 'on' : ''}`} onClick={() => mark(o, 'reporte')}>
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

      {/* Fenêtre d'erreur : coût de livraison manquant */}
      {erreur ? (
        <div className="err-overlay" onClick={() => setErreur(null)}>
          <div className="errbox" onClick={(e) => e.stopPropagation()}>
            <i className="ti ti-alert-triangle" aria-hidden="true" />
            <h3>Coût de livraison manquant</h3>
            <p>Impossible de marquer « Livré » sans le coût de livraison. Renseigne-le pour&nbsp;:</p>
            <div className="err-list">{erreur.map((n) => <span key={n}>{n}</span>)}</div>
            <button onClick={() => setErreur(null)}>Compris</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
