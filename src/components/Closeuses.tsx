import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { createCloseuse } from '../lib/account'

interface Cl { id: string; nom: string; pays: string | null; actif: boolean; horaires: { debut?: string; fin?: string; sheet_url?: string } | null }
interface C { code: string; nom: string }
type Msg = { ok?: boolean; txt: string } | null

export default function Closeuses({ defaultPays }: { defaultPays?: string }) {
  const [list, setList] = useState<Cl[]>([])
  const [countries, setCountries] = useState<C[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)

  // édition
  const [editId, setEditId] = useState<string | null>(null)
  const [eNom, setENom] = useState(''); const [ePays, setEPays] = useState('')
  const [eDebut, setEDebut] = useState(''); const [eFin, setEFin] = useState(''); const [eSheet, setESheet] = useState(''); const [eActif, setEActif] = useState(true)

  // création
  const [showCreate, setShowCreate] = useState(false)
  const [nom, setNom] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState('')
  const [pays, setPays] = useState(''); const [debut, setDebut] = useState('08:00'); const [fin, setFin] = useState('18:00'); const [sheet, setSheet] = useState('')

  function load() {
    supabase?.from('agents').select('id, nom, pays, actif, horaires').eq('role', 'closer').then(({ data }) => setList((data as Cl[]) ?? []))
    supabase?.from('countries').select('code, nom').then(({ data }) => setCountries((data as C[]) ?? []))
  }
  useEffect(() => { load() }, [])

  function startEdit(c: Cl) {
    setMsg(null); setEditId(c.id); setENom(c.nom); setEPays(c.pays || '')
    setEDebut(c.horaires?.debut || ''); setEFin(c.horaires?.fin || ''); setESheet(c.horaires?.sheet_url || ''); setEActif(c.actif)
  }
  async function saveEdit() {
    if (!supabase || !editId) return
    setBusy(true); setMsg(null)
    const horaires = { debut: eDebut || null, fin: eFin || null, sheet_url: eSheet || null }
    const { error } = await supabase.from('agents').update({ nom: eNom.trim(), pays: ePays, horaires, actif: eActif }).eq('id', editId)
    setBusy(false)
    if (error) { setMsg({ txt: error.message }); return }
    setEditId(null); load()
  }
  async function del(id: string) {
    if (!supabase) return
    const { error } = await supabase.from('agents').delete().eq('id', id)
    if (error) { setMsg({ txt: 'Impossible : des commandes lui sont assignées. Désactive-la plutôt.' }); return }
    setEditId(null); load()
  }
  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (pw.length < 6) { setMsg({ txt: 'Mot de passe : 6 caractères minimum.' }); return }
    const code = pays || defaultPays || countries[0]?.code || ''
    if (!code) { setMsg({ txt: 'Choisis un pays.' }); return }
    setBusy(true); setMsg(null)
    const { error } = await createCloseuse({ nom, email, password: pw, pays: code, debut, fin, sheetUrl: sheet })
    setBusy(false)
    if (error) {
      setMsg({ txt: /signups are disabled/i.test(error) ? 'Active les inscriptions email dans Supabase (Auth → Providers → Email).' : error })
      return
    }
    setMsg({ ok: true, txt: `Closeuse « ${nom} » créée.` })
    setNom(''); setEmail(''); setPw(''); setSheet(''); setShowCreate(false); load()
  }

  return (
    <section className="acct">
      <div className="acct-t">Closeuses</div>
      {list.length === 0 ? <div className="acct-hint">Aucune closeuse pour l'instant.</div> : null}

      {list.map((c) => (
        editId === c.id ? (
          <div className="cl-edit" key={c.id}>
            <input value={eNom} onChange={(e) => setENom(e.target.value)} placeholder="Nom" />
            <select value={ePays} onChange={(e) => setEPays(e.target.value)}>
              <option value="" disabled>Pays</option>
              {countries.map((x) => <option key={x.code} value={x.code}>{x.nom}</option>)}
            </select>
            <div className="hr-row">
              <label>Début<input type="time" value={eDebut} onChange={(e) => setEDebut(e.target.value)} /></label>
              <label>Fin<input type="time" value={eFin} onChange={(e) => setEFin(e.target.value)} /></label>
            </div>
            <input type="url" value={eSheet} onChange={(e) => setESheet(e.target.value)} placeholder="Lien Google Sheet" />
            <label className="cl-toggle"><input type="checkbox" checked={eActif} onChange={(e) => setEActif(e.target.checked)} /> Active</label>
            <div className="cl-actions">
              <button className="ghostbtn" onClick={() => setEditId(null)}>Annuler</button>
              <button onClick={saveEdit} disabled={busy}>{busy ? '…' : 'Enregistrer'}</button>
            </div>
            <button className="cl-del" onClick={() => del(c.id)}><i className="ti ti-trash" aria-hidden="true" /> Supprimer cette closeuse</button>
          </div>
        ) : (
          <div className="cl-row" key={c.id}>
            <div className="cl-info">
              <div className="cl-nom">{c.nom}{c.actif ? null : <span className="cl-off">inactive</span>}</div>
              <div className="cl-meta">{c.pays || '—'} · {c.horaires?.debut || '—'}–{c.horaires?.fin || '—'}</div>
            </div>
            <button className="del-x" onClick={() => startEdit(c)} aria-label="Modifier"><i className="ti ti-edit" aria-hidden="true" /></button>
          </div>
        )
      ))}

      {msg ? <div className={msg.ok ? 'acct-ok' : 'acct-err'}>{msg.txt}</div> : null}

      {showCreate ? (
        <form onSubmit={create} className="cl-create">
          <input placeholder="Nom" value={nom} onChange={(e) => setNom(e.target.value)} required />
          <select value={pays} onChange={(e) => setPays(e.target.value)} required>
            <option value="" disabled>Pays</option>
            {countries.map((x) => <option key={x.code} value={x.code}>{x.nom}</option>)}
          </select>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" placeholder="Mot de passe" value={pw} onChange={(e) => setPw(e.target.value)} required />
          <div className="hr-row">
            <label>Début<input type="time" value={debut} onChange={(e) => setDebut(e.target.value)} /></label>
            <label>Fin<input type="time" value={fin} onChange={(e) => setFin(e.target.value)} /></label>
          </div>
          <input type="url" placeholder="Lien Google Sheet (source)" value={sheet} onChange={(e) => setSheet(e.target.value)} />
          <div className="cl-actions">
            <button type="button" className="ghostbtn" onClick={() => setShowCreate(false)}>Annuler</button>
            <button type="submit" disabled={busy}>{busy ? 'Création…' : 'Créer'}</button>
          </div>
        </form>
      ) : (
        <button className="ghostbtn" onClick={() => setShowCreate(true)} style={{ marginTop: 8 }}><i className="ti ti-plus" aria-hidden="true" /> Ajouter une closeuse</button>
      )}
      <div className="acct-hint">Modifie nom, pays, horaires, lien Sheet, ou désactive une closeuse. Le mot de passe se change par elle (onglet Moi).</div>
    </section>
  )
}
