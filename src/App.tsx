import { useEffect, useState } from 'react'
import CloseuseApp from './CloseuseApp'
import OwnerApp from './OwnerApp'
import Login from './components/Login'
import { supabase, supabaseEnabled, getAgent, type Agent } from './lib/supabase'

type Mode = 'loading' | 'login' | 'demo' | 'live'

export default function App() {
  const [mode, setMode] = useState<Mode>(supabaseEnabled ? 'loading' : 'demo')
  const [agent, setAgent] = useState<Agent | null>(null)
  const [demoRole, setDemoRole] = useState<'closeuse' | 'owner'>('closeuse')

  useEffect(() => {
    if (!supabaseEnabled || !supabase) return
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      if (!data.session) { setMode('login'); return }
      setAgent(await getAgent(data.session.user.id))
      if (active) setMode('live')
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (!active) return
      if (!session) { setAgent(null); setMode('login'); return }
      setAgent(await getAgent(session.user.id))
      setMode('live')
    })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [])

  const logout = () => supabase?.auth.signOut()

  if (mode === 'loading') {
    return <div className="app"><div className="empty"><i className="ti ti-loader-2" aria-hidden="true" />Connexion…</div></div>
  }
  if (mode === 'login') {
    return <Login onDemo={() => setMode('demo')} />
  }
  if (mode === 'live') {
    return agent?.role === 'owner'
      ? <OwnerApp onSwitchRole={logout} />
      : <CloseuseApp live agent={agent} onSwitchRole={logout} />
  }
  // démo (sans Supabase configuré, ou via "Continuer en démo")
  return demoRole === 'owner'
    ? <OwnerApp onSwitchRole={() => setDemoRole('closeuse')} />
    : <CloseuseApp onSwitchRole={() => setDemoRole('owner')} />
}
