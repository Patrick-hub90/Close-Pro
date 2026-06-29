import { useEffect, useState } from 'react'
import { supabase, type Agent } from '../lib/supabase'
import { changePassword } from '../lib/account'
import Closeuses from './Closeuses'
import Pays from './Pays'

type Msg = { ok?: boolean; txt: string } | null

export default function Compte({ agent, onLogout }: { agent?: Agent | null; onLogout: () => void }) {
  const isOwner = agent?.role === 'owner'

  const [pw, setPw] = useState('')
  const [pwMsg, setPwMsg] = useState<Msg>(null)
  const [pwBusy, setPwBusy] = useState(false)

  // Forçage des notifications Telegram (ignore dimanche + horaires) — réglage propriétaire.
  const [notifForce, setNotifForce] = useState(false)
  const [notifBusy, setNotifBusy] = useState(false)
  useEffect(() => {
    if (!supabase || !isOwner) return
    supabase.from('app_config').select('value').eq('key', 'notif_force').maybeSingle()
      .then(({ data }) => setNotifForce((data as { value?: string } | null)?.value === 'true'))
  }, [isOwner])
  async function toggleNotif() {
    if (!supabase) return
    const v = !notifForce
    setNotifForce(v); setNotifBusy(true)
    await supabase.from('app_config').upsert({ key: 'notif_force', value: v ? 'true' : 'false' })
    setNotifBusy(false)
  }

  // Liaison Telegram : génère un code, la closeuse l'envoie au bot, le serveur capture son chat_id.
  const [tgLinked, setTgLinked] = useState(false)
  const [tgCode, setTgCode] = useState<string | null>(null)
  const [tgBusy, setTgBusy] = useState(false)
  useEffect(() => {
    if (!supabase || !agent?.id) return
    let active = true
    const check = () => supabase!.from('agents').select('telegram_chat_id').eq('id', agent.id!).maybeSingle()
      .then(({ data }) => { if (active && (data as { telegram_chat_id?: string } | null)?.telegram_chat_id) { setTgLinked(true); setTgCode(null) } })
    check()
    const id = setInterval(check, 6000)
    return () => { active = false; clearInterval(id) }
  }, [agent?.id])
  async function genCode() {
    if (!supabase) return
    setTgBusy(true)
    const { data } = await supabase.rpc('link_code_generer')
    setTgBusy(false)
    const d = data as { code?: string; bot?: string } | null
    if (!d?.code) return
    if (d.bot) window.open(`https://t.me/${d.bot}?start=${encodeURIComponent(d.code)}`, '_blank')
    else setTgCode(d.code) // secours : pas de username de bot configuré
  }

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

      <section className="acct">
        <div className="acct-t">Mon Telegram</div>
        {tgLinked ? (
          <div className="acct-ok"><i className="ti ti-brand-telegram" aria-hidden="true" /> Telegram lié — tu reçois les notifications de commandes à appeler.</div>
        ) : tgCode ? (
          <>
            <div className="acct-hint">Telegram s'ouvre sur le bot — appuie sur <b>Démarrer</b>. Si rien ne s'ouvre, envoie ce code :</div>
            <div className="tg-code">{tgCode}</div>
            <div className="acct-hint">La liaison se fait toute seule en ~1 minute.</div>
          </>
        ) : (
          <>
            <button type="button" onClick={genCode} disabled={tgBusy}><i className="ti ti-brand-telegram" aria-hidden="true" /> {tgBusy ? '…' : 'Lier mon Telegram'}</button>
            <div className="acct-hint">Pour recevoir une notification à chaque commande à appeler.</div>
          </>
        )}
      </section>

      {isOwner ? (
        <section className="acct">
          <div className="acct-t">Notifications Telegram</div>
          <label className="notif-row">
            <div>
              <div className="nt-l">Forcer les notifications</div>
              <div className="nt-s">Ignore le dimanche et les horaires de travail</div>
            </div>
            <button type="button" className={`tgl ${notifForce ? 'on' : ''}`} onClick={toggleNotif} disabled={notifBusy} aria-pressed={notifForce} aria-label="Forcer les notifications"><span /></button>
          </label>
          <div className="acct-hint">{notifForce ? 'Activé : tu reçois les alertes en continu, même le dimanche.' : 'Désactivé (défaut) : alertes uniquement en heures de travail, jamais le dimanche.'}</div>
        </section>
      ) : null}

      {isOwner ? <Closeuses defaultPays={agent?.pays || undefined} /> : null}
      {isOwner ? <Pays /> : null}

      <button className="roleswitch" onClick={onLogout}>
        <i className="ti ti-logout" aria-hidden="true" />Se déconnecter
      </button>
    </div>
  )
}
