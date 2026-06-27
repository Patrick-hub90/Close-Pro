import { useState } from 'react'
import type { Agent } from '../lib/supabase'
import { changePassword } from '../lib/account'
import Closeuses from './Closeuses'
import Pays from './Pays'

type Msg = { ok?: boolean; txt: string } | null

export default function Compte({ agent, onLogout }: { agent?: Agent | null; onLogout: () => void }) {
  const isOwner = agent?.role === 'owner'

  const [pw, setPw] = useState('')
  const [pwMsg, setPwMsg] = useState<Msg>(null)
  const [pwBusy, setPwBusy] = useState(false)

  async function savePw(e: React.FormEvent) {
    e.preventDefault()
    if (pw.length < 6) { setPwMsg({ txt: '6 caractères minimum.' }); return }
    setPwBusy(true); setPwMsg(null)
    const { error } = await changePassword(pw)
    setPwBusy(false)
    setPwMsg(error ? { txt: error } : { ok: true, txt: 'Mot de passe mis à jour.' })
    if (!error) setPw('')
  }

  return (
    <div className="profil compte">
      <div className="av" style={isOwner ? { background: 'var(--navy-bg)', color: 'var(--navy)' } : undefined}>
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

      {isOwner ? <Closeuses defaultPays={agent?.pays || undefined} /> : null}
      {isOwner ? <Pays /> : null}

      <button className="roleswitch" onClick={onLogout}>
        <i className="ti ti-logout" aria-hidden="true" />Se déconnecter
      </button>
    </div>
  )
}
