import { memo, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fcfa } from '../lib'

type Periode = 'jour' | '7j' | '30j' | 'perso'
type Ligne = { id: string; numero: string; adresse: string; cout: number; recu: number; net: number }

function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
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

function Finance({ pays }: { pays?: string }) {
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
    // Une vente compte pour son jour de confirmation (la veille de la clôture).
    let q = supabase.from('orders')
      .select('id, numero, adresse, region, cout_livraison, total, confirme_at')
      .eq('statut', 'livre')
      .gte('confirme_at', new Date(deb).toISOString())
      .lte('confirme_at', new Date(fin).toISOString())
      .order('confirme_at', { ascending: false })
      .limit(1000)
    if (pays) q = q.eq('pays', pays)
    q.then(({ data, error }) => {
      if (!active) return
      if (error) { setErr(error.message); setLoading(false); return }
      setLignes((data ?? []).map((d: any) => {
        // total est déjà NET (prix − frais). On reconstruit l'encaissé brut = net + frais.
        const cout = d.cout_livraison ?? 0, net = d.total ?? 0
        return { id: d.id, numero: d.numero, adresse: d.adresse || d.region || '—', cout, net, recu: net + cout }
      }))
      setLoading(false)
    })
    return () => { active = false }
  }, [deb, fin, pays])

  const tot = useMemo(() => {
    let cout = 0, recu = 0
    for (const l of lignes) { cout += l.cout; recu += l.recu }
    const nb = lignes.length
    const net = recu - cout
    return { cout, recu, net, nb, panier: nb ? Math.round(net / nb) : 0 }
  }, [lignes])

  return (
    <div className="fin">
      <div className="hdr"><span className="who"><i className="ti ti-cash-banknote" aria-hidden="true" /> Finance</span></div>

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

      {/* CA hero */}
      <div className="fin-hero">
        <div className="fh-l">Chiffre d'affaires net (frais déduits)</div>
        <div className="fh-v">{fcfa(tot.net, false)}</div>
        <div className="fh-s"><i className="ti ti-package" aria-hidden="true" /> {tot.nb} livrée{tot.nb > 1 ? 's' : ''} · panier moyen {fcfa(tot.panier)}</div>
      </div>

      <div className="fin-stats">
        <div className="fs"><span>Encaissé (brut)</span><b>{fcfa(tot.recu)}</b></div>
        <div className="fs"><span>Frais de livraison</span><b>{fcfa(tot.cout)}</b></div>
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
          <div className="ft-head"><span>N°</span><span>Adresse</span><span className="r">Livr.</span><span className="r">Reçu</span><span className="r">Net</span></div>
          {lignes.slice(0, 200).map((l) => (
            <div className="ft-row" key={l.id}>
              <span>{l.numero}</span><span className="adr">{l.adresse}</span>
              <span className="r">{fcfa(l.cout)}</span><span className="r">{fcfa(l.recu)}</span><span className="r net">{fcfa(l.net)}</span>
            </div>
          ))}
          <div className="ft-tot">
            <span>Total</span><span className="adr">{tot.nb} cmd</span>
            <span className="r">{fcfa(tot.cout)}</span><span className="r">{fcfa(tot.recu)}</span><span className="r net">{fcfa(tot.net)}</span>
          </div>
        </div>
      )}

      <div className="fin-note"><i className="ti ti-info-circle" aria-hidden="true" /> Une vente compte pour son jour de confirmation. Le « Net » a déjà les frais de livraison déduits ; « Reçu » = encaissé auprès du client (net + frais).</div>
    </div>
  )
}

// Mémoïsé : ne se redessine pas à chaque tic d'horloge du parent (perf).
export default memo(Finance)
