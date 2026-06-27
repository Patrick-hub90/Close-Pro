import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface C { code: string; nom: string; indicatif: string }

export default function Pays() {
  const [list, setList] = useState<C[]>([])
  const [editCode, setEditCode] = useState<string | null>(null)
  const [eNom, setENom] = useState(''); const [eInd, setEInd] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [code, setCode] = useState(''); const [nom, setNom] = useState(''); const [ind, setInd] = useState('')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null)

  function load() { supabase?.from('countries').select('code, nom, indicatif').then(({ data }) => setList((data as C[]) ?? [])) }
  useEffect(() => { load() }, [])

  function startEdit(c: C) { setErr(null); setEditCode(c.code); setENom(c.nom); setEInd(c.indicatif || '') }
  async function saveEdit() {
    if (!supabase || !editCode) return
    setBusy(true); setErr(null)
    const { error } = await supabase.from('countries').update({ nom: eNom.trim(), indicatif: eInd.replace(/\D/g, '') || '0' }).eq('code', editCode)
    setBusy(false)
    if (error) { setErr(error.message); return }
    setEditCode(null); load()
  }
  async function del(c: string) {
    if (!supabase) return
    const { error } = await supabase.from('countries').delete().eq('code', c)
    if (error) { setErr('Impossible : des commandes ou closeuses utilisent ce pays.'); return }
    setEditCode(null); load()
  }
  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    const c = code.trim().toUpperCase()
    if (c.length < 2) { setErr('Code pays (2 lettres) requis.'); return }
    setBusy(true); setErr(null)
    const { error } = await supabase.from('countries').upsert({ code: c, nom: nom.trim() || c, indicatif: ind.replace(/\D/g, '') || '0', devise: 'FCFA' }, { onConflict: 'code' })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setCode(''); setNom(''); setInd(''); setShowAdd(false); load()
  }

  return (
    <section className="acct">
      <div className="acct-t">Pays</div>
      {list.length === 0 ? <div className="acct-hint">Aucun pays — ajoute-en un.</div> : null}

      {list.map((c) => (
        editCode === c.code ? (
          <div className="cl-edit" key={c.code}>
            <div className="cl-meta">Code : {c.code}</div>
            <input value={eNom} onChange={(e) => setENom(e.target.value)} placeholder="Nom du pays" />
            <input value={eInd} onChange={(e) => setEInd(e.target.value)} placeholder="Indicatif (ex. 237)" />
            <div className="cl-actions">
              <button className="ghostbtn" onClick={() => setEditCode(null)}>Annuler</button>
              <button onClick={saveEdit} disabled={busy}>{busy ? '…' : 'Enregistrer'}</button>
            </div>
            <button className="cl-del" onClick={() => del(c.code)}><i className="ti ti-trash" aria-hidden="true" /> Supprimer ce pays</button>
          </div>
        ) : (
          <div className="cl-row" key={c.code}>
            <div className="cl-info">
              <div className="cl-nom">{c.nom}</div>
              <div className="cl-meta">{c.code} · +{c.indicatif}</div>
            </div>
            <button className="del-x" onClick={() => startEdit(c)} aria-label="Modifier"><i className="ti ti-edit" aria-hidden="true" /></button>
          </div>
        )
      ))}

      {err ? <div className="acct-err">{err}</div> : null}

      {showAdd ? (
        <form onSubmit={add} className="cl-create">
          <div className="pays-add">
            <input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={3} />
            <input placeholder="Nom du pays" value={nom} onChange={(e) => setNom(e.target.value)} />
            <input placeholder="+ind." value={ind} onChange={(e) => setInd(e.target.value)} />
          </div>
          <div className="cl-actions">
            <button type="button" className="ghostbtn" onClick={() => setShowAdd(false)}>Annuler</button>
            <button type="submit" disabled={busy}>{busy ? 'Ajout…' : 'Ajouter'}</button>
          </div>
        </form>
      ) : (
        <button className="ghostbtn" onClick={() => setShowAdd(true)} style={{ marginTop: 8 }}><i className="ti ti-plus" aria-hidden="true" /> Ajouter un pays</button>
      )}
      <div className="acct-hint">Crayon = modifier un pays. Ajoute librement (code = 2 lettres : CM, CI, BJ…).</div>
    </section>
  )
}
