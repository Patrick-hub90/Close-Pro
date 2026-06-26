import { useState } from 'react'
import { supabase } from '../lib/supabase'

function friendly(m: string): string {
  const x = (m || '').toLowerCase()
  if (x.includes('logins are disabled') || x.includes('signups are disabled') || x.includes('provider'))
    return "La connexion par email est désactivée côté Supabase. Réactive le fournisseur Email (Authentication → Providers → Email)."
  if (x.includes('invalid login credentials')) return 'Email ou mot de passe incorrect.'
  if (x.includes('email not confirmed')) return "Email non confirmé. Désactive « Confirm email » dans Supabase."
  if (x.includes('failed to fetch') || x.includes('networkerror')) return 'Connexion au serveur impossible. Vérifie ta connexion internet et réessaie.'
  return m || 'Connexion impossible. Réessaie.'
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) { setErr('Application non configurée (Supabase manquant).'); return }
    setBusy(true)
    setErr(null)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw })
      if (error) setErr(friendly(error.message))
    } catch (e: any) {
      setErr(friendly(e?.message || ''))
    } finally {
      setBusy(false)
    }
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
      </div>
    </div>
  )
}
