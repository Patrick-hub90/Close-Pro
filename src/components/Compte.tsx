import { useState } from 'react'
import type { Agent } from '../lib/supabase'
import { changePassword, createCloseuse } from '../lib/account'

type Msg = { ok?: boolean; txt: string } | null

export default function Compte({ agent, onLogout }: { agent?: Agent | null; onLogout: () => void }) {
  const isOwner = agent?.role === 'owner'

  const [pw, setPw] = useState('')
  const [pwMsg, setPwMsg] = useState<Msg>(null)
  const [pwBusy, setPwBusy] = useState(false)

  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [cpw, setCpw] = useState('')
  const [cMsg, setCMsg] = useState<Msg>(null)
  const [cBusy, setCBusy] = useState(false)

  async function savePw(e: React.FormEvent) {
    e.preventDefault()
    if (pw.length < 6) { setPwMsg({ txt: '6 caractères minimum.' }); return }
    setPwBusy(true); setPwMsg(null)
    const { error } = await changePassword(pw)
    setPwBusy(false)
    setPwMsg(error ? { txt: error } : { ok: true, txt: 'Mot de passe mis à jour.' })
    if (!error) setPw('')
  }

  async function createC(e: React.FormEvent) {
    e.preventDefault()
    if (cpw.length < 6) { setCMsg({ txt: '6 caractères minimum.' }); return }
    setCBusy(true); setCMsg(null)
    const { error } = await createCloseuse({ nom, email, password: cpw, pays: agent?.pays || 'CM' })
    setCBusy(false)
    if (error) { setCMsg({ txt: error }); return }
    setCMsg({ ok: true, txt: `Closeuse « ${nom} » créée.` })
    setNom(''); setEmail(''); setCpw('')
  }

  return (
    <div className="profil compte">
      <div className="av" style={isOwner ? { background: 'var(--blue-bg)', color: 'var(--blue-tx)' } : undefined}>
        {(agent?.nom || '?').slice(0, 2).toUpperCase()}
      </div>
      <h3>{agent?.nom || 'Mon compte'}</h3>
      <p>{isOwner ? 'Propriétaire' : 'Closeuse'}{agent?.pays ? ` · ${agent.pays}` : ''}</p>

      <section className="acct">
        <div className="acct-t">Changer mon mot de passe</div>
        <form onSubmit={savePw}>
          <input type="password" autoComplete="new-password" placeholder="Nouveau mot de passe"
            value={pw} onChange={(e) => setPw(e.target.value)} />
          {pwMsg ? <div className={pwMsg.ok ? 'acct-ok' : 'acct-err'}>{pwMsg.txt}</div> : null}
          <button type="submit" disabled={pwBusy}>{pwBusy ? 'Mise à jour…' : 'Mettre à jour'}</button>
        </form>
      </section>

      {isOwner ? (
        <section className="acct">
          <div className="acct-t">Ajouter une closeuse</div>
          <form onSubmit={createC}>
            <input type="text" placeholder="Nom" value={nom} onChange={(e) => setNom(e.target.value)} required />
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input type="password" placeholder="Mot de passe" value={cpw} onChange={(e) => setCpw(e.target.value)} required />
            {cMsg ? <div className={cMsg.ok ? 'acct-ok' : 'acct-err'}>{cMsg.txt}</div> : null}
            <button type="submit" disabled={cBusy}>{cBusy ? 'Création…' : 'Créer le compte'}</button>
          </form>
          <div className="acct-hint">Elle se connecte avec cet email + mot de passe (pays : {agent?.pays || 'CM'}).</div>
        </section>
      ) : null}

      <button className="roleswitch" onClick={onLogout}>
        <i className="ti ti-logout" aria-hidden="true" />Se déconnecter
      </button>
    </div>
  )
}
