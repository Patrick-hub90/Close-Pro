import { useEffect, useMemo, useState } from 'react'
import type { FiltreId, Order, Statut } from './types'
import { CLOSEUSE, ORDERS, LIVRAISONS } from './data'
import { useNow, matchFiltre, byUrgence } from './lib'
import { supabase, type Agent } from './lib/supabase'
import { mapDbOrder } from './lib/mapOrder'
import OrderCard from './components/OrderCard'
import CallMode from './components/CallMode'
import ArchiveView from './components/ArchiveView'
import MorningSas from './components/MorningSas'

const FILTRES: { id: FiltreId; label: string }[] = [
  { id: 'a_appeler', label: 'À appeler' },
  { id: 'rappels', label: 'Rappels' },
  { id: 'retard', label: 'En retard' },
  { id: 'toutes', label: 'Toutes' },
]

type Tab = 'appels' | 'archive' | 'moi'

export default function CloseuseApp({
  onSwitchRole, live, agent,
}: {
  onSwitchRole: () => void
  live?: boolean
  agent?: Agent | null
}) {
  const now = useNow()
  const [orders, setOrders] = useState<Order[]>(live ? [] : ORDERS)
  const [filtre, setFiltre] = useState<FiltreId>('a_appeler')
  const [tab, setTab] = useState<Tab>('appels')
  const [sasDone, setSasDone] = useState(false)
  const [call, setCall] = useState<{ queue: Order[]; index: number } | null>(null)

  const nom = (live && agent?.nom) || CLOSEUSE.nom
  const pays = (live && agent?.pays) || CLOSEUSE.pays

  useEffect(() => {
    if (!live || !supabase) return
    let active = true
    supabase
      .from('orders')
      .select('*')
      .not('statut', 'in', '(livre,annule,refuse)')
      .then(({ data }) => { if (active) setOrders((data ?? []).map(mapDbOrder)) })
    return () => { active = false }
  }, [live])

  const sasOrders = live ? orders.filter((o) => o.statut === 'livraison') : LIVRAISONS

  const counts = useMemo(() => {
    const c: Record<FiltreId, number> = { a_appeler: 0, rappels: 0, retard: 0, toutes: 0 }
    for (const o of orders) for (const f of FILTRES) if (matchFiltre(o, f.id, now)) c[f.id]++
    return c
  }, [orders, now])

  const liste = useMemo(
    () => orders.filter((o) => matchFiltre(o, filtre, now)).sort(byUrgence(now)),
    [orders, filtre, now]
  )

  function openAt(o: Order) {
    const i = liste.findIndex((x) => x.id === o.id)
    setCall({ queue: liste, index: Math.max(0, i) })
  }
  function startQueue() {
    if (liste.length) setCall({ queue: liste, index: 0 })
  }
  function handleResult(o: Order, statut: Statut) {
    const newTent = statut === 'injoignable' ? o.tentatives + 1 : o.tentatives
    setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, statut, tentatives: newTent } : x)))
    if (live && supabase) {
      void supabase.from('orders').update({ statut, tentatives: newTent }).eq('id', o.id)
      void supabase.from('call_attempts').insert({ order_id: o.id, agent_id: agent?.id ?? null, canal: 'tel', resultat: statut })
    }
    setCall((c) => {
      if (!c) return null
      const next = c.index + 1
      return next < c.queue.length ? { ...c, index: next } : null
    })
  }

  if (call) {
    return <CallMode queue={call.queue} index={call.index} onResult={handleResult} onClose={() => setCall(null)} />
  }

  const showSas = tab === 'appels' && !sasDone && sasOrders.length > 0

  return (
    <div className="app">
      {showSas && <MorningSas orders={sasOrders} onDone={() => setSasDone(true)} />}

      {tab === 'appels' && !showSas && (
        <>
          <div className="hdr">
            <span className="who">
              <i className="ti ti-world" aria-hidden="true" />
              {pays} · <b>{nom}</b>
            </span>
            <span className="score"><i className="ti ti-bolt" aria-hidden="true" />{CLOSEUSE.score}</span>
          </div>

          <div className="seg">
            {FILTRES.map((f) => (
              <button
                key={f.id}
                className={`${filtre === f.id ? 'on' : ''} ${f.id === 'retard' ? 'alert' : ''}`}
                onClick={() => setFiltre(f.id)}
              >
                {f.label} <span className="n">{counts[f.id]}</span>
              </button>
            ))}
          </div>

          {liste.length === 0 ? (
            <div className="empty">
              <i className="ti ti-circle-check" aria-hidden="true" />
              {live ? 'Aucune commande à appeler pour le moment.' : 'Rien à traiter ici — tout est à jour.'}
            </div>
          ) : (
            liste.map((o) => <OrderCard key={o.id} o={o} now={now} onOpen={openAt} />)
          )}

          <div className="cta-wrap">
            <button className="cta" onClick={startQueue} disabled={!liste.length}>
              <i className="ti ti-player-play" aria-hidden="true" />
              Lancer les appels ({liste.length})
            </button>
          </div>
        </>
      )}

      {tab === 'archive' && <ArchiveView />}

      {tab === 'moi' && (
        <div className="profil">
          <div className="av">{nom.slice(0, 2).toUpperCase()}</div>
          <h3>{nom}</h3>
          <p>{pays} · score de ponctualité {CLOSEUSE.score}</p>
          <button className="roleswitch" onClick={onSwitchRole}>
            <i className={`ti ${live ? 'ti-logout' : 'ti-arrows-left-right'}`} aria-hidden="true" />
            {live ? 'Se déconnecter' : 'Passer en vue propriétaire'}
          </button>
        </div>
      )}

      {!showSas && (
        <nav className="nav">
          <div className="nav-inner">
            <button className={tab === 'appels' ? 'on' : ''} onClick={() => setTab('appels')}>
              <i className="ti ti-phone" aria-hidden="true" />Appels
            </button>
            <button className={tab === 'archive' ? 'on' : ''} onClick={() => setTab('archive')}>
              <i className="ti ti-archive" aria-hidden="true" />Archive
            </button>
            <button className={tab === 'moi' ? 'on' : ''} onClick={() => setTab('moi')}>
              <i className="ti ti-user" aria-hidden="true" />Moi
            </button>
          </div>
        </nav>
      )}
    </div>
  )
}
