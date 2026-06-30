import { useEffect, useState } from 'react'
import CloseuseApp from './CloseuseApp'
import Login from './components/Login'
import { supabase, supabaseEnabled, getAgent, type Agent } from './lib/supabase'
import { initPush, pushLogin, pushLogout } from './lib/onesignal'

type Mode = 'loading' | 'login' | 'live' | 'noconfig'

function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false)
    window.addEventListener('online', up); window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  return online
}

export default function App() {
  const [mode, setMode] = useState<Mode>('loading')
  const [agent, setAgent] = useState<Agent | null>(null)
  const online = useOnline()

  useEffect(() => {
    if (!supabaseEnabled || !supabase) { setMode('noconfig'); return }
    let active = true
    const sb = supabase
    initPush() // notifications push (OneSignal) — chargé une seule fois
    // Garde-fou : si l'init reste bloquée (réseau lent, getSession qui ne répond pas…), on ne
    // laisse pas l'écran « Connexion… » tourner sans fin — on retombe sur l'écran de connexion.
    const garde = setTimeout(() => { if (active) setMode((m) => (m === 'loading' ? 'login' : m)) }, 10000)
    // Résout la fiche agent puis bascule en « live ». Toujours appelée HORS du callback d'auth.
    const entrer = (uid: string) => {
      getAgent(uid).catch(() => null).then((ag) => { if (active) { setAgent(ag); setMode('live'); if (ag) pushLogin(ag.id) } })
    }
    sb.auth.getSession().then(({ data }) => {
      if (!active) return
      if (!data.session) { setMode('login'); return }
      entrer(data.session.user.id)
    })
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      if (!active) return
      if (!session) { setAgent(null); setMode('login'); return }
      // NE JAMAIS faire d'appel Supabase (ni await) directement dans ce callback : il s'exécute
      // en tenant le verrou interne de supabase-js, ce qui fige getSession() (écran « Connexion… »
      // qui tourne à l'infini). On diffère l'appel hors du verrou ; entrer() bascule en « live »
      // une fois la fiche agent résolue.
      setTimeout(() => { if (active) entrer(session.user.id) }, 0)
    })
    return () => { active = false; clearTimeout(garde); sub.subscription.unsubscribe() }
  }, [])

  const logout = () => { pushLogout(); supabase?.auth.signOut() }

  // Hors-ligne : si rien n'a encore pu charger, on explique pourquoi l'écran est vide.
  if (!online && (mode === 'loading' || mode === 'login')) {
    return (
      <div className="app">
        <div className="boot-err offline">
          <i className="ti ti-wifi-off" aria-hidden="true" />
          <h3>Pas de connexion internet</h3>
          <p>Close-Pro a besoin d'internet pour charger tes commandes. Vérifie ta connexion (Wi-Fi ou données mobiles) — l'application se rechargera automatiquement dès le retour du réseau.</p>
        </div>
      </div>
    )
  }

  if (mode === 'loading') {
    return <div className="app"><div className="boot-load"><span className="spinner" /><p>Connexion…</p></div></div>
  }
  if (mode === 'noconfig') {
    return <div className="app"><div className="boot-err"><i className="ti ti-alert-triangle" aria-hidden="true" /><h3>Configuration manquante</h3><p>Les identifiants Supabase ne sont pas définis.</p></div></div>
  }
  if (mode === 'login') {
    return <Login />
  }
  // live
  if (!agent) {
    return (
      <div className="app">
        <div className="boot-err">
          <i className="ti ti-user-question" aria-hidden="true" />
          <h3>Compte non associé</h3>
          <p>Ce compte n'est lié à aucune fiche (table <code>agents</code>). Demande à l'administrateur de l'ajouter.</p>
          <button onClick={logout}><i className="ti ti-logout" aria-hidden="true" /> Se déconnecter</button>
        </div>
      </div>
    )
  }
  return (
    <>
      {!online ? (
        <div className="offline-bar"><i className="ti ti-wifi-off" aria-hidden="true" /> Hors ligne — les changements seront perdus tant que le réseau n'est pas revenu.</div>
      ) : null}
      <CloseuseApp live agent={agent} onSwitchRole={logout} />
    </>
  )
}
