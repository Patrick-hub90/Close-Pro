import { useEffect, useState } from 'react'
import type { Order } from '../types'
import { fcfa } from '../lib'

type Issue = 'livre' | 'annule' | 'reporte'

// Dates de re-livraison calées sur le fuseau du Cameroun (WAT = UTC+1), comme la logique de jour du
// SAS — ainsi la frontière du report coïncide avec celle de la revue du matin, quel que soit le
// réglage de l'horloge du téléphone. La commande revient le matin (heure Cameroun) du jour choisi.
const WAT_OFFSET_MS = 60 * 60 * 1000
function addDaysMs(n: number) { const d = new Date(Date.now() + WAT_OFFSET_MS); d.setUTCDate(d.getUTCDate() + n); d.setUTCHours(0, 0, 0, 0); return d.getTime() - WAT_OFFSET_MS }
function toDateInput(ms: number) { const d = new Date(ms + WAT_OFFSET_MS); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` }
function fromDateInput(s: string): number | undefined {
  if (!s) return undefined
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return undefined
  return Date.UTC(y, m - 1, d, 0, 0, 0) - WAT_OFFSET_MS // minuit WAT du jour choisi
}
function fmtJour(ms: number) { return new Date(ms).toLocaleDateString('fr-FR', { timeZone: 'Africa/Douala', weekday: 'long', day: '2-digit', month: '2-digit' }) }

export default function MorningSas({ orders, onResolve, onSetCost }: {
  orders: Order[]
  onResolve?: (id: string, issue: Issue, dateMs?: number) => void
  onSetCost?: (id: string, cout: number) => void
}) {
  // Liste vivante : les cartes déjà traitées restent affichées (avec ✓), MAIS toute commande qui
  // entre dans la revue après l'ouverture (refetch du parent, passage de minuit) s'ajoute pour
  // rester traitable — sinon le blocage ne pourrait jamais se lever (deadlock).
  const [list, setList] = useState<Order[]>(orders)
  useEffect(() => {
    setList((prev) => {
      const vus = new Set(prev.map((o) => o.id))
      const nouveaux = orders.filter((o) => !vus.has(o.id))
      return nouveaux.length ? [...prev, ...nouveaux] : prev
    })
  }, [orders])
  const [resolved, setResolved] = useState<Record<string, Issue>>({})
  // Coûts saisis pendant la session (reflètent ce que le parent a déjà mis à jour).
  const [costs, setCosts] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {}
    for (const o of orders) if (o.coutLivraison) m[o.id] = o.coutLivraison
    return m
  })
  const [erreur, setErreur] = useState<string[] | null>(null)
  // Fenêtre de report : choix de la date de re-livraison.
  const [repOrder, setRepOrder] = useState<Order | null>(null)
  const [repDate, setRepDate] = useState('')
  // N'affiche que les commandes encore dans la revue (orders) OU déjà traitées cette session : évite
  // une « carte fantôme » si une commande sort de sasOrders par un chemin externe (refetch / autre agent).
  const visibles = list.filter((o) => resolved[o.id] || orders.some((x) => x.id === o.id))
  const done = visibles.filter((o) => resolved[o.id]).length
  const total = visibles.length

  const coutDe = (o: Order) => costs[o.id] ?? o.coutLivraison ?? 0

  const mark = (o: Order, issue: Issue) => {
    // Livré exige un coût de livraison.
    if (issue === 'livre' && !coutDe(o)) { setErreur([o.numero]); return }
    // Reporté : on demande d'abord la date de re-livraison.
    if (issue === 'reporte') { setRepOrder(o); setRepDate(toDateInput(addDaysMs(1))); return }
    setResolved((p) => ({ ...p, [o.id]: issue }))
    onResolve?.(o.id, issue)
  }

  const confirmReport = () => {
    const ms = fromDateInput(repDate)
    if (!repOrder || !ms) return
    setResolved((p) => ({ ...p, [repOrder.id]: 'reporte' }))
    onResolve?.(repOrder.id, 'reporte', ms)
    setRepOrder(null)
  }

  const saisirCout = (o: Order, v: number) => {
    setCosts((p) => ({ ...p, [o.id]: v }))
    if (v > 0) onSetCost?.(o.id, v)
  }

  // Tout marquer livré : bloque si des commandes n'ont pas de coût de livraison.
  const toutLivrer = () => {
    const restants = visibles.filter((o) => !resolved[o.id])
    const sansCout = restants.filter((o) => !coutDe(o))
    if (sansCout.length) { setErreur(sansCout.map((o) => o.numero)); return }
    const next = { ...resolved }
    for (const o of restants) { next[o.id] = 'livre'; onResolve?.(o.id, 'livre') }
    setResolved(next)
  }

  const repMs = fromDateInput(repDate)

  return (
    <div className="app">
      <div className="hdr">
        <span className="who"><i className="ti ti-sun" aria-hidden="true" />À clôturer · livraisons</span>
      </div>

      <div className="lockbar soft">
        <i className="ti ti-sun" aria-hidden="true" />
        Livraisons d'hier — clôture-les maintenant ou plus tard
        <span className="pg">{done}/{total}</span>
      </div>

      <button className="sas-all" onClick={toutLivrer}>
        <i className="ti ti-checks" aria-hidden="true" /> Tout marquer livré
      </button>

      {visibles.map((o) => {
        const r = resolved[o.id]
        const cout = coutDe(o)            // coût effectif (saisie locale ou DB) — sert à débloquer « Livré »
        const manque = !cout
        // L'affichage champ-de-saisie vs lecture seule se décide sur le coût CONNU À L'OUVERTURE,
        // pas sur la saisie en cours : sinon le champ disparaîtrait dès le 1er chiffre tapé.
        const aSaisir = !o.coutLivraison
        return (
          <div className={`dcard ${r ? 'done' : ''} ${manque ? 'nocost' : ''}`} key={o.id}>
            <div className="dch">
              <span className="nm">{o.client} · <span className="dc-num">{o.numero}</span></span>
              <span className="amt">{fcfa(o.total)}</span>
            </div>
            <div className="sub">{o.produit}{o.quantite > 1 ? ` · ×${o.quantite}` : ''}</div>
            <div className="dadr"><i className="ti ti-map-pin" aria-hidden="true" /> {o.adresse || 'Adresse non renseignée'}{o.region ? ` · ${o.region}` : ''}</div>

            {aSaisir ? (
              <label className="dcost">
                <span>
                  {cout > 0
                    ? <><i className="ti ti-truck" aria-hidden="true" /> Coût de livraison</>
                    : <><i className="ti ti-alert-triangle" aria-hidden="true" /> Coût de livraison manquant</>}
                </span>
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

      <div className="sas-foot">
        {done < total ? (
          <><i className="ti ti-lock" aria-hidden="true" /> Paramètre les {total - done} livraison{total - done > 1 ? 's' : ''} restante{total - done > 1 ? 's' : ''} pour commencer tes appels.</>
        ) : (
          <><i className="ti ti-circle-check" aria-hidden="true" /> Tout est clôturé — ouverture de la journée…</>
        )}
      </div>

      {/* Fenêtre de report : date de re-livraison */}
      {repOrder ? (
        <div className="sched-ov" onClick={() => setRepOrder(null)}>
          <div className="sched-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sm-head">
              <span>Reporter la livraison · {repOrder.numero}</span>
              <button className="sm-x" onClick={() => setRepOrder(null)} aria-label="Fermer"><i className="ti ti-x" aria-hidden="true" /></button>
            </div>
            <div className="sched-presets">
              {[{ label: 'Demain', n: 1 }, { label: 'Dans 2 jours', n: 2 }, { label: 'Dans 3 jours', n: 3 }].map((p) => (
                <button key={p.n} className={repMs === addDaysMs(p.n) ? 'on' : ''} onClick={() => setRepDate(toDateInput(addDaysMs(p.n)))}>{p.label}</button>
              ))}
            </div>
            <label className="sched-dt"><span>Date précise</span>
              <input type="date" value={repDate} min={toDateInput(addDaysMs(1))} onChange={(e) => setRepDate(e.target.value)} />
            </label>
            <button className="sm-ok rep" disabled={!repMs || (repMs <= addDaysMs(0))} onClick={confirmReport}>
              <i className="ti ti-check" aria-hidden="true" /> Reporter {repMs ? `· ${fmtJour(repMs)}` : ''}
            </button>
          </div>
        </div>
      ) : null}

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
