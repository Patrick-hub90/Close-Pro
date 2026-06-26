import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login({ onDemo }: { onDemo: () => void }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setErr(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw })
    if (error) setErr(error.message)
    setBusy(false)
  }

  return (
    <div className="app login">
      <div className="login-card">
        <div className="login-logo"><i className="ti ti-phone-call" aria-hidden="true" /></div>
        <h2>Close-Pro</h2>
        <p className="login-sub">Connecte-toi pour accéder à tes commandes.</p>

        <form onSubmit={submit}>
          <input
            type="email" inputMode="email" autoComplete="username"
            placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required
          />
          <input
            type="password" autoComplete="current-password"
            placeholder="Mot de passe" value={pw} onChange={(e) => setPw(e.target.value)} required
          />
          {err ? <div className="login-err"><i className="ti ti-alert-circle" aria-hidden="true" /> {err}</div> : null}
          <button className="login-btn" type="submit" disabled={busy}>
            {busy ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <button className="login-demo" onClick={onDemo}>Continuer en démo</button>
      </div>
    </div>
  )
}
