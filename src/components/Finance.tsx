import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fcfa } from '../lib'

type Periode = 'jour' | '7j' | '30j' | 'perso'
type Ligne = { id: string; numero: string; adresse: string; cout: number; recu: number }

function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Bornes [debut, fin] en ms epoch selon la periode choisie. */
function bornes(p: Periode, from: string, to: string): [number, number] {
  const now = new Date()
  const fin = new Date(now); fin.setHours(23, 59, 59, 999)
  const deb = new Date(now); deb.setHours(0, 0, 0, 0)
  if (p === '7j') deb.setDate(deb.getDate() - 6)
  if (p === '30j') deb.setDate(deb.getDate() - 29)
  if (p === 'perso') {
    const d = from ? new Date(from + 'T00:00:00') : deb
    const f = to ? new Date(to + 'T23:59:59') : fin
    return [d.getTime(), f.getTime()]
  }
  return [deb.getTime(), fin.getTime()]
}

export default function Finance({ pays }: { pays?: string }) {
  const [periode, setPeriode] = useState<Periode>('jour')
  const today = isoDay(new Date())
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [deb, fin] = useMemo(() => bornes(periode, from, to), [periode, from, to])

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    let active = true
    setLoading(true); setErr(null)
    // Attribution : une vente compte pour son jour de CONFIRMATION (la veille de la
    // clôture du matin), pas pour le moment où on coche « Livré ».
    let q = supabase.from('orders')
      .select('id, numero, adresse, region, cout_livraison, total, confirme_at')
      .eq('statut', 'livre')
      .gte('confirme_at', new Date(deb).toISOString())
      .lte('confirme_at', new Date(fin).toISOString())
      .order('confirme_at', { ascending: false })
      .limit(500)
    if (pays) q = q.eq('pays', pays)
    q.then(({ data, error }) => {
      if (!active) return
      if (error) { setErr(error.message); setLoading(false); return }
      setLignes((data ?? []).map((d: any) => ({
        id: d.id, numero: d.numero,
        adresse: d.adresse || d.region || '—',
        cout: d.cout_livraison ?? 0,
        recu: d.total ?? 0,
      })))
      setLoading(false)
    })
    return () => { active = false }
  }, [deb, fin, pays])

  const tot = useMemo(() => {
    let cout = 0, recu = 0
    for (const l of lignes) { cout += l.cout; recu += l.recu }
    return { cout, recu, net: recu - cout, nb: lignes.length }
  }, [lignes])

  return (
    <div className="fin">
      <div className="hdr"><span className="who"><i className="ti ti-cash-banknote" aria-hidden="true" /> Finance</span></div>

      {/* Période */}
      <div className="fin-seg">
        {([['jour', "Aujourd'hui"], ['7j', '7 jours'], ['30j', '30 jours'], ['perso', 'Période']] as [Periode, string][]).map(([p, lb]) => (
          <button key={p} className={periode === p ? 'on' : ''} onClick={() => setPeriode(p)}>{lb}</button>
        ))}
      </div>
      {periode === 'perso' ? (
        <div className="fin-dates">
          <label>Du<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>Au<input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
      ) : null}

      {/* KPIs */}
      <div className="fin-kpis">
        <div className="fk ca"><span>Chiffre d'affaires</span><b>{fcfa(tot.recu)}</b></div>
        <div className="fk net"><span>Net (après livraison)</span><b>{fcfa(tot.net)}</b></div>
        <div className="fk nb"><span>Commandes livrées</span><b>{tot.nb}</b></div>
        <div className="fk liv"><span>Frais de livraison</span><b>{fcfa(tot.cout)}</b></div>
      </div>

      {/* Tableau */}
      {loading ? (
        <div className="boot-load"><span className="spinner" /><p>Chargement…</p></div>
      ) : err ? (
        <div className="empty"><i className="ti ti-alert-triangle" aria-hidden="true" /><div className="empty-t">Erreur</div><div className="empty-s">{err}</div></div>
      ) : lignes.length === 0 ? (
        <div className="empty"><i className="ti ti-cash-off" aria-hidden="true" /><div className="empty-t">Aucune livraison sur la période</div>
          <div className="empty-s">Les commandes marquées « Livré » apparaîtront ici.</div></div>
      ) : (
        <div className="fin-tbl">
          <div className="ft-head">
            <span className="c-num">N°</span><span className="c-adr">Adresse</span>
            <span className="c-cout">Livraison</span><span className="c-recu">Reçu</span>
          </div>
          {lignes.map((l) => (
            <div className="ft-row" key={l.id}>
              <span className="c-num">{l.numero}</span>
              <span className="c-adr">{l.adresse}</span>
              <span className="c-cout">{fcfa(l.cout)}</span>
              <span className="c-recu">{fcfa(l.recu)}</span>
            </div>
          ))}
          <div className="ft-tot">
            <span className="c-num">Total</span>
            <span className="c-adr">{tot.nb} cmd</span>
            <span className="c-cout">{fcfa(tot.cout)}</span>
            <span className="c-recu">{fcfa(tot.recu)}</span>
          </div>
        </div>
      )}

      <div className="fin-note"><i className="ti ti-info-circle" aria-hidden="true" /> « Reçu » = montant encaissé à la livraison. Seules les commandes marquées « Livré » sont comptées.</div>
    </div>
  )
}
