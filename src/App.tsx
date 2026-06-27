import { useEffect, useState } from 'react'
import CloseuseApp from './CloseuseApp'
import Login from './components/Login'
import { supabase, supabaseEnabled, getAgent, type Agent } from './lib/supabase'

type Mode = 'loading' | 'login' | 'live' | 'noconfig'

export default function App() {
  const [mode, setMode] = useState<Mode>('loading')
  const [agent, setAgent] = useState<Agent | null>(null)

  useEffect(() => {
    if (!supabaseEnabled || !supabase) { setMode('noconfig'); return }
    let active = true
    const resolve = async (uid: string) => {
      try { return await getAgent(uid) } catch { return null }
    }
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      if (!data.session) { setMode('login'); return }
      setAgent(await resolve(data.session.user.id))
      if (active) setMode('live')
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (!active) return
      if (!session) { setAgent(null); setMode('login'); return }
      setAgent(await resolve(session.user.id))
      setMode('live')
    })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [])

  const logout = () => supabase?.auth.signOut()

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
  return <CloseuseApp live agent={agent} onSwitchRole={logout} />
}
