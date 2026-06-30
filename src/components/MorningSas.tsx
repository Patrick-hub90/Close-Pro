import { useEffect, useState } from 'react'
import type { Order } from '../types'
import { fcfa } from '../lib'

type Issue = 'livre' | 'annule'                        // actions directes
type Appel = 'a_rappeler' | 'injoignable' | 'reporte'  // statuts d'appel (avec heure de rappel)
type Marque = Issue | Appel

const LABELS: Record<Marque, string> = {
  livre: 'Livré', annule: 'Annulé', a_rappeler: 'À rappeler', injoignable: 'Injoignable', reporte: 'Reporté',
}

// Sélecteur d'heure de rappel (date + heure, horloge locale — comme l'écran d'appel).
function toLocalInput(ms: number): string {
  const d = new Date(ms); const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
function fromLocalInput(s: string): number | undefined {
  if (!s) return undefined; const t = new Date(s).getTime(); return Number.isFinite(t) ? t : undefined
}
function fmtDt(ms: number) { return new Date(ms).toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }
function presetsRappel(): { label: string; at: number }[] {
  const now = Date.now()
  const at = (h: number, m: number, addDays: number) => { const x = new Date(); x.setDate(x.getDate() + addDays); x.setHours(h, m, 0, 0); return x.getTime() }
  const soir = at(18, 0, 0) > now ? at(18, 0, 0) : at(18, 0, 1)
  return [
    { label: 'Dans 1h', at: now + 3600_000 },
    { label: 'Dans 2h', at: now + 2 * 3600_000 },
    { label: 'Ce soir 18h', at: soir },
    { label: 'Demain 9h', at: at(9, 0, 1) },
  ]
}

export default function MorningSas({ orders, onResolve, onAppel, onSetCost }: {
  orders: Order[]
  onResolve?: (id: string, issue: Issue) => void
  onAppel?: (id: string, statut: Appel, dateMs: number) => void
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
  const [resolved, setResolved] = useState<Record<string, Marque>>({})
  // Coûts saisis pendant la session (reflètent ce que le parent a déjà mis à jour).
  const [costs, setCosts] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {}
    for (const o of orders) if (o.coutLivraison) m[o.id] = o.coutLivraison
    return m
  })
  const [erreur, setErreur] = useState<string[] | null>(null)
  // Fenêtre de planification d'un rappel (injoignable / à rappeler / reporté).
  const [sched, setSched] = useState<{ order: Order; statut: Appel } | null>(null)
  const [schedAt, setSchedAt] = useState('')

  // N'affiche que les commandes encore dans la revue (orders) OU déjà traitées cette session : évite
  // une « carte fantôme » si une commande sort de sasOrders par un chemin externe (refetch / autre agent).
  const visibles = list.filter((o) => resolved[o.id] || orders.some((x) => x.id === o.id))
  const done = visibles.filter((o) => resolved[o.id]).length
  const total = visibles.length

  const coutDe = (o: Order) => costs[o.id] ?? o.coutLivraison ?? 0

  const mark = (o: Order, issue: Issue) => {
    if (issue === 'livre' && !coutDe(o)) { setErreur([o.numero]); return }
    setResolved((p) => ({ ...p, [o.id]: issue }))
    onResolve?.(o.id, issue)
  }

  // Menu déroulant : un statut d'appel (injoignable / à rappeler / reporté) → on demande l'heure de rappel.
  const choisirAppel = (o: Order, statut: Appel) => {
    setSched({ order: o, statut })
    setSchedAt(toLocalInput(Date.now() + 3600_000)) // défaut : dans 1h
  }
  const confirmSched = () => {
    const ms = fromLocalInput(schedAt)
    if (!sched || !ms) return
    setResolved((p) => ({ ...p, [sched.order.id]: sched.statut }))
    onAppel?.(sched.order.id, sched.statut, ms)
    setSched(null)
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

  const schedMs = fromLocalInput(schedAt)

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
        const appelChoisi = r === 'a_rappeler' || r === 'injoignable' || r === 'reporte'
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
              <select className={`sas-sel ${appelChoisi ? 'on' : ''}`} value=""
                onChange={(e) => { const v = e.target.value as Appel; if (v) { choisirAppel(o, v); e.target.value = '' } }}
                aria-label="Autre statut">
                <option value="">{r === 'a_rappeler' || r === 'injoignable' || r === 'reporte' ? `${LABELS[r]} ✓` : 'Autre…'}</option>
                <option value="injoignable">Injoignable</option>
                <option value="a_rappeler">À rappeler</option>
                <option value="reporte">Reporté</option>
              </select>
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

      {/* Fenêtre de planification d'un rappel (injoignable / à rappeler / reporté) */}
      {sched ? (
        <div className="sched-ov" onClick={() => setSched(null)}>
          <div className="sched-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sm-head">
              <span>{LABELS[sched.statut]} · {sched.order.numero} — quand rappeler ?</span>
              <button className="sm-x" onClick={() => setSched(null)} aria-label="Fermer"><i className="ti ti-x" aria-hidden="true" /></button>
            </div>
            <div className="sched-presets">
              {presetsRappel().map((p) => (
                <button key={p.label} className={schedAt === toLocalInput(p.at) ? 'on' : ''} onClick={() => setSchedAt(toLocalInput(p.at))}>{p.label}</button>
              ))}
            </div>
            <label className="sched-dt"><span>Date et heure précises</span>
              <input type="datetime-local" value={schedAt} min={toLocalInput(Date.now())} onChange={(e) => setSchedAt(e.target.value)} />
            </label>
            <button className="sm-ok rep" disabled={!schedMs} onClick={confirmSched}>
              <i className="ti ti-check" aria-hidden="true" /> Confirmer {schedMs ? `· ${fmtDt(schedMs)}` : ''}
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
