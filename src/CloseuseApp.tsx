import { useEffect, useMemo, useRef, useState } from 'react'
import type { FiltreId, Order, Statut, CallResult } from './types'
import { CLOSEUSE, ORDERS, LIVRAISONS } from './data'
import { useNow, matchFiltre, byUrgence, isLate, isWorkingNow } from './lib'
import { supabase, type Agent } from './lib/supabase'
import { mapDbOrder } from './lib/mapOrder'
import OrderCard from './components/OrderCard'
import CallMode from './components/CallMode'
import MorningSas from './components/MorningSas'
import Compte from './components/Compte'
import Classement from './components/Classement'

const FILTRES: { id: FiltreId; label: string }[] = [
  { id: 'a_appeler', label: 'À appeler' },
  { id: 'rappels', label: 'Rappels' },
  { id: 'retard', label: 'En retard' },
  { id: 'livraisons', label: 'Livraisons' },
  { id: 'toutes', label: 'Toutes' },
  { id: 'archivees', label: 'Archivées' },
]

let _actx: AudioContext | null = null
function beep() {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!AC) return
    _actx = _actx || new AC()
    const ctx = _actx as AudioContext
    const osc = ctx.createOscillator(); const g = ctx.createGain()
    osc.connect(g); g.connect(ctx.destination)
    osc.type = 'sine'; osc.frequency.value = 880
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3)
    osc.start(); osc.stop(ctx.currentTime + 0.31)
  } catch { /* autoplay bloque tant que pas d'interaction */ }
}

function SkeletonList() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <div className="skel-card" key={i}>
          <div className="skel-row"><span className="skel lg" style={{ width: '45%' }} /><span className="skel" style={{ width: '22%' }} /></div>
          <div className="skel-row"><span className="skel" style={{ width: '60%' }} /></div>
          <div className="skel-actions"><span className="skel" /><span className="skel" /></div>
        </div>
      ))}
    </>
  )
}

type Tab = 'appels' | 'moi'

export default function CloseuseApp({
  onSwitchRole, live, agent,
}: {
  onSwitchRole: () => void
  live?: boolean
  agent?: Agent | null
}) {
  const now = useNow()
  const [orders, setOrders] = useState<Order[]>(live ? [] : ORDERS)
  const [loading, setLoading] = useState<boolean>(!!live)
  const [filtre, setFiltre] = useState<FiltreId>('a_appeler')
  const [tab, setTab] = useState<Tab>('appels')
  const [sasDone, setSasDone] = useState(false)
  const [call, setCall] = useState<{ queue: Order[]; index: number } | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [archived, setArchived] = useState<Order[]>([])
  const [selectedPays, setSelectedPays] = useState('')
  const [showPays, setShowPays] = useState(false)
  const [paysList, setPaysList] = useState<{ code: string; nom: string }[]>([])
  const [closers, setClosers] = useState<{ id: string; nom: string; pays: string | null }[]>([])

  const nom = (live && agent?.nom) || CLOSEUSE.nom
  const pays = (live && agent?.pays) || CLOSEUSE.pays
  const workingNow = isWorkingNow(agent?.horaires, now)
  const isOwner = !!(live && agent?.role === 'owner')
  const scoped = useMemo(() => (selectedPays ? orders.filter((o) => o.pays === selectedPays) : orders), [orders, selectedPays])

  useEffect(() => {
    if (!live || !supabase) return
    let active = true
    const load = (showLoader: boolean) => {
      if (showLoader) setLoading(true)
      supabase!.from('orders').select('*').not('statut', 'in', '(livre,annule,refuse)')
        .then(({ data }) => {
          if (!active) return
          const mapped = (data ?? []).map(mapDbOrder)
          const cnt: Record<string, number> = {}
          for (const o of mapped) { const k = o.telephone || o.whatsapp || o.id; cnt[k] = (cnt[k] || 0) + 1 }
          for (const o of mapped) o.clientCount = cnt[o.telephone || o.whatsapp || o.id] || 1
          setOrders(mapped)
          setLoading(false)
        })
    }
    load(true)
    const id = setInterval(() => load(false), 25000)
    return () => { active = false; clearInterval(id) }
  }, [live])

  // Archive : charge les commandes terminées à la demande (filtre "Archivées").
  useEffect(() => {
    if (!live || !supabase || filtre !== 'archivees') return
    let active = true
    supabase.from('orders').select('*').in('statut', ['livre', 'annule', 'refuse']).order('updated_at', { ascending: false }).limit(200)
      .then(({ data }) => { if (active) setArchived((data ?? []).map(mapDbOrder)) })
    return () => { active = false }
  }, [live, filtre])

  // Pays + closeuses (pour le sélecteur et le classement du propriétaire).
  useEffect(() => {
    if (!live || !supabase || agent?.role !== 'owner') return
    supabase.from('countries').select('code, nom').then(({ data }) => setPaysList((data as { code: string; nom: string }[]) ?? []))
    supabase.from('agents').select('id, nom, pays').eq('role', 'closer').then(({ data }) => setClosers((data as { id: string; nom: string; pays: string | null }[]) ?? []))
  }, [live, agent])

  // Moteur de contrainte : alerte (vibration + bip) quand une commande passe en retard.
  const notifiedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!live || !workingNow) return
    for (const o of orders) {
      if (!isLate(o, now)) continue
      const key = o.id + ':' + (o.rappelAt || o.deadline || 0)
      if (notifiedRef.current.has(key)) continue
      notifiedRef.current.add(key)
      try { navigator.vibrate?.([300, 150, 300]) } catch { /* non supporte */ }
      beep()
    }
  }, [now, orders, live, workingNow])

  const sasOrders = live ? scoped.filter((o) => o.statut === 'livraison') : LIVRAISONS

  const counts = useMemo(() => {
    const c: Record<FiltreId, number> = { a_appeler: 0, rappels: 0, retard: 0, toutes: 0, archivees: 0 }
    for (const o of scoped) for (const f of FILTRES) if (matchFiltre(o, f.id, now, workingNow)) c[f.id]++
    return c
  }, [scoped, now, workingNow])
  const etat = useMemo(() => {
    const e: Record<string, number> = {}
    for (const o of scoped) e[o.statut] = (e[o.statut] || 0) + 1
    return e
  }, [scoped])

  // Verrou de file : une closeuse, en horaires, avec des retards -> doit les traiter d'abord.
  const lockLate = !!live && !isOwner && workingNow && !selectMode && counts.retard > 0
  const viewFiltre: FiltreId = lockLate ? 'retard' : filtre

  const liste = useMemo(
    () => scoped.filter((o) => matchFiltre(o, viewFiltre, now, workingNow)).sort(byUrgence(now)),
    [scoped, viewFiltre, now, workingNow]
  )
  const isArchive = viewFiltre === 'archivees'
  const displayList = isArchive ? archived : liste

  // Classement des closeuses (propriétaire) : ponctualité sur les commandes actives du pays sélectionné.
  const classement = useMemo(() => {
    if (!isOwner) return []
    const m = new Map<string, { nom: string; total: number; late: number; conf: number }>()
    for (const c of closers) {
      if (selectedPays && c.pays !== selectedPays) continue
      m.set(c.id, { nom: c.nom, total: 0, late: 0, conf: 0 })
    }
    for (const o of scoped) {
      if (!o.closeuseId) continue
      let row = m.get(o.closeuseId)
      if (!row) { row = { nom: 'Closeuse', total: 0, late: 0, conf: 0 }; m.set(o.closeuseId, row) }
      row.total++
      if (isLate(o, now)) row.late++
      if (o.statut === 'confirme' || o.statut === 'livraison') row.conf++
    }
    return [...m.entries()]
      .map(([id, r]) => ({ id, ...r, score: r.total ? Math.round(100 * (1 - r.late / r.total)) : 100 }))
      .sort((a, b) => b.score - a.score || b.conf - a.conf || b.total - a.total)
  }, [isOwner, closers, scoped, selectedPays, now])

  // Score de ponctualité (réel) : 100 si rien en retard, baisse avec les retards.
  const score = counts.toutes ? Math.round(100 * (1 - counts.retard / counts.toutes)) : 100
  const scoreCls = score >= 85 ? '' : score >= 60 ? 'mid' : 'low'

  function openAt(o: Order) {
    const i = displayList.findIndex((x) => x.id === o.id)
    setCall({ queue: displayList, index: Math.max(0, i) })
  }
  function startQueue() {
    if (liste.length) setCall({ queue: liste, index: 0 })
  }
  function toggleSelect(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function exitSelect() { setSelectMode(false); setSelected(new Set()) }

  function bulkStatut(statut: Statut) {
    const ids = [...selected]
    if (!ids.length) return
    setOrders((prev) => prev.map((x) => (ids.includes(x.id) ? { ...x, statut } : x)))
    if (live && supabase) void supabase.from('orders').update({ statut }).in('id', ids)
    exitSelect()
  }

  function handleResult(o: Order, r: CallResult) {
    const prix = r.prixNegocie ?? o.prixNegocie ?? o.prixUnitaire
    const qte = r.quantite ?? o.quantite
    const cout = r.coutLivraison ?? o.coutLivraison ?? 0
    const total = Math.round(prix) * qte + Math.round(cout)
    const newTent = r.statut === 'injoignable' ? o.tentatives + 1 : o.tentatives

    setOrders((prev) => prev.map((x) => (x.id === o.id ? {
      ...x, statut: r.statut, tentatives: newTent, total,
      prixNegocie: r.prixNegocie ?? x.prixNegocie, coutLivraison: r.coutLivraison ?? x.coutLivraison,
      produit: r.produit ?? x.produit, quantite: qte, adresse: r.adresse ?? x.adresse,
      commentaire: r.commentaire ?? x.commentaire,
      rappelAt: r.rappelAt ?? x.rappelAt, rappelLieu: r.rappelLieu ?? x.rappelLieu,
    } : x)))

    if (live && supabase) {
      const db: Record<string, any> = { statut: r.statut, tentatives: newTent, total, produit_nom: r.produit ?? o.produit, quantite: qte }
      if (r.prixNegocie != null) db.prix_negocie = r.prixNegocie
      if (r.coutLivraison != null) db.cout_livraison = r.coutLivraison
      if (r.adresse != null) db.adresse = r.adresse
      if (r.commentaire) db.dernier_commentaire = r.commentaire
      if (r.rappelAt) {
        const iso = new Date(r.rappelAt).toISOString()
        db.rappel_at = iso; db.rappel_lieu = r.rappelLieu ?? null
        db.appel_deadline = iso; db.appel_deadline_type = 'rappel_programme'
      }
      supabase.from('orders').update(db).eq('id', o.id).then(({ error }) => {
        if (error) console.error('[Close-Pro] update order failed:', error.message, error)
      })
      void supabase.from('call_attempts').insert({ order_id: o.id, agent_id: agent?.id ?? null, canal: 'tel', resultat: r.statut, commentaire: r.commentaire ?? null })
      if (r.rappelAt) void supabase.from('scheduled_callbacks').insert({ order_id: o.id, agent_id: agent?.id ?? null, rappel_at: new Date(r.rappelAt).toISOString(), lieu: r.rappelLieu ?? null, motif: r.statut })
    }

    setCall((c) => { if (!c) return null; const next = c.index + 1; return next < c.queue.length ? { ...c, index: next } : null })
  }

  if (call) {
    return <CallMode queue={call.queue} index={call.index} onResult={handleResult} onClose={() => setCall(null)} />
  }

  const showSas = tab === 'appels' && !sasDone && sasOrders.length > 0
  if (showSas) {
    return <div className="app"><MorningSas orders={sasOrders} onDone={() => setSasDone(true)} /></div>
  }

  const emptySub = filtre === 'a_appeler' ? 'Aucune commande à appeler pour le moment.'
    : filtre === 'rappels' ? 'Aucun rappel programmé.'
    : filtre === 'retard' ? 'Rien en retard — tout est à jour.'
    : 'Rien à afficher ici.'

  return (
    <div className="app shell">
      <header className="topbar">
        <div className={`brand${isOwner ? ' clickable' : ''}`} onClick={() => isOwner && setShowPays((v) => !v)}>
          <span className="logo">{(selectedPays || pays || 'CP').slice(0, 2).toUpperCase()}</span>
          <div className="bt">
            <div className="t">
              {isOwner ? (paysList.find((c) => c.code === selectedPays)?.nom || 'Tous les pays') : nom}
              {isOwner ? <i className="ti ti-chevron-down" aria-hidden="true" /> : null}
            </div>
            <div className="s">{isOwner ? `Propriétaire · ${nom}` : pays}</div>
          </div>
          {isOwner && showPays ? (
            <div className="pays-menu" onClick={(e) => e.stopPropagation()}>
              <button className={!selectedPays ? 'on' : ''} onClick={() => { setSelectedPays(''); setShowPays(false) }}>
                Tous les pays
              </button>
              {paysList.map((c) => (
                <button key={c.code} className={selectedPays === c.code ? 'on' : ''} onClick={() => { setSelectedPays(c.code); setShowPays(false) }}>
                  {c.nom}
                </button>
              ))}
              {paysList.length === 0 ? <span className="pm-empty">Aucun pays — ajoute-en dans Moi</span> : null}
            </div>
          ) : null}
        </div>
        <div className="acts">
          <span className={`tscore ${scoreCls}`} title="Ponctualité : part des commandes appelées à temps">
            <i className="ti ti-clock-check" aria-hidden="true" />{score}%
          </span>
          <i className="ti ti-bell" aria-hidden="true" />
        </div>
      </header>

      <div className="sheet">
      {tab === 'appels' && (
        <>
          {isOwner ? (
            <div className="etat">
              <div className="es"><b>{counts.a_appeler}</b><span>À appeler</span></div>
              <div className="es dang"><b>{counts.retard}</b><span>En retard</span></div>
              <div className="es"><b>{etat.confirme || 0}</b><span>Confirmées</span></div>
              <div className="es"><b>{etat.livraison || 0}</b><span>Livraison</span></div>
            </div>
          ) : null}

          <div className="seg">
            {FILTRES.map((f) => {
              const blocked = lockLate && f.id !== 'retard'
              return (
                <button key={f.id} disabled={blocked}
                  className={`${viewFiltre === f.id ? 'on' : ''} ${f.id === 'retard' ? 'alert' : ''} ${blocked ? 'locked' : ''}`}
                  onClick={() => { if (!blocked) setFiltre(f.id) }}>
                  {f.label} <span className="n">{f.id === 'archivees' ? (archived.length || '') : counts[f.id]}</span>
                </button>
              )
            })}
          </div>

          {!workingNow && agent?.horaires?.debut ? (
            <div className="hoursbar"><i className="ti ti-player-pause" aria-hidden="true" /> Hors de tes horaires ({agent.horaires.debut}–{agent.horaires.fin}) — décomptes en pause</div>
          ) : null}

          {lockLate ? (
            <div className="lockbar">
              <i className="ti ti-lock" aria-hidden="true" />
              <span><b>{counts.retard} commande{counts.retard > 1 ? 's' : ''} en retard.</b> Traite-les d'abord — les autres listes sont verrouillées tant qu'il reste du retard.</span>
            </div>
          ) : counts.retard > 0 && !selectMode ? (
            <button className="latebar" onClick={() => setFiltre('retard')}>
              <i className="ti ti-alert-triangle" aria-hidden="true" />
              {counts.retard} commande{counts.retard > 1 ? 's' : ''} en retard — à appeler maintenant
              <i className="ti ti-chevron-right" aria-hidden="true" />
            </button>
          ) : null}

          <div className="listbar">
            {selectMode ? (
              <><span>{selected.size} sélectionnée(s)</span><button onClick={exitSelect}>Annuler</button></>
            ) : (
              !isArchive && displayList.length > 0 ? <button onClick={() => setSelectMode(true)}><i className="ti ti-checkbox" aria-hidden="true" /> Sélectionner</button> : <span />
            )}
          </div>

          {loading && !isArchive ? (
            <SkeletonList />
          ) : displayList.length === 0 ? (
            <div className="empty">
              <i className="ti ti-inbox" aria-hidden="true" />
              <div className="empty-t">Aucune commande</div>
              <div className="empty-s">{isArchive ? 'Aucune commande archivée.' : emptySub}</div>
              {isOwner && !isArchive && scoped.length === 0 ? (
                <div className="empty-hint">
                  <i className="ti ti-plug-connected-x" aria-hidden="true" />
                  <span>Source non confirmée pour ce pays. Si tu viens de brancher le Google&nbsp;Sheet, les commandes arrivent ici <b>sous 1&nbsp;min</b>. Sinon, ouvre le Sheet → Apps&nbsp;Script → menu «&nbsp;Exécutions&nbsp;» pour voir si la synchro tourne.</span>
                </div>
              ) : null}
            </div>
          ) : (
            displayList.map((o) => (
              <OrderCard key={o.id} o={o} now={now} onOpen={openAt} paused={!workingNow}
                selectMode={selectMode} selected={selected.has(o.id)} onToggle={toggleSelect} />
            ))
          )}

          {isArchive ? null : selectMode ? (
            selected.size > 0 ? (
              <div className="cta-wrap bulkbar">
                <button className="bk ok" onClick={() => bulkStatut('confirme')}><i className="ti ti-check" aria-hidden="true" />Confirmer</button>
                <button className="bk warn" onClick={() => bulkStatut('injoignable')}><i className="ti ti-phone-off" aria-hidden="true" />Injoignable</button>
                <button className="bk dang" onClick={() => bulkStatut('annule')}><i className="ti ti-x" aria-hidden="true" />Annuler</button>
              </div>
            ) : null
          ) : (
            <div className="cta-wrap">
              <button className={`cta ${lockLate ? 'lock' : ''}`} onClick={startQueue} disabled={!liste.length}>
                <i className={`ti ${lockLate ? 'ti-alert-triangle' : 'ti-player-play'}`} aria-hidden="true" />
                {lockLate ? `Traiter les retards (${liste.length})` : `Lancer les appels (${liste.length})`}
              </button>
            </div>
          )}
        </>
      )}

      {tab === 'moi' && (live ? (
        <>
          {isOwner ? <Classement rows={classement} /> : null}
          <Compte agent={agent} onLogout={onSwitchRole} />
        </>
      ) : (
        <div className="profil">
          <div className="av">{nom.slice(0, 2).toUpperCase()}</div>
          <h3>{nom}</h3>
          <p>{pays} · score de ponctualité {CLOSEUSE.score}</p>
          <button className="roleswitch" onClick={onSwitchRole}><i className="ti ti-arrows-left-right" aria-hidden="true" />Passer en vue propriétaire</button>
        </div>
      ))}

      </div>

      <nav className="nav">
        <div className="nav-inner">
          <button className={tab === 'appels' ? 'on' : ''} onClick={() => setTab('appels')}><i className="ti ti-phone" aria-hidden="true" />Appels</button>
          <button className={tab === 'moi' ? 'on' : ''} onClick={() => setTab('moi')}><i className="ti ti-user" aria-hidden="true" />Moi</button>
        </div>
      </nav>
    </div>
  )
}
