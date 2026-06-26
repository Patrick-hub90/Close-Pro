import { useMemo, useState } from 'react'
import { fcfa } from '../lib'
import archive from '../data/archive.json'

const MOIS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc']

function frDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  if (!m) return iso || ''
  return `${Number(m[3])} ${MOIS[Number(m[2]) - 1] ?? ''}`
}
function shortProd(p: string): string {
  return p.length > 26 ? p.slice(0, 24) + '…' : p
}
/** Colonnes ville (Address 1) et region (City) sont sales : numeros, "-", vide. */
function cleanLoc(ville: string, region: string): string {
  const ok = (s: string) => {
    const v = (s || '').trim()
    return v && v.length >= 2 && !/^[\d+\s().\-/]+$/.test(v) ? v : ''
  }
  return ok(ville) || ok(region) || '—'
}

interface ArchOrder {
  id: string; numero: string; client: string; produit: string
  ville: string; region: string; telephone: string; total: number
  date: string; commentaire: string; clientCount: number
}

export default function ArchiveView() {
  const [q, setQ] = useState('')
  const orders = archive.orders as ArchOrder[]

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return orders
    return orders.filter((o) =>
      `${o.client} ${o.numero} ${o.telephone} ${o.produit} ${o.ville} ${o.region}`.toLowerCase().includes(s)
    )
  }, [q, orders])

  const shown = filtered.slice(0, 80)

  return (
    <>
      <div className="hdr">
        <span className="who">
          <i className="ti ti-archive" aria-hidden="true" />
          Archive · <b>{archive.total.toLocaleString('fr-FR')}</b> commandes
        </span>
      </div>

      <div className="search">
        <i className="ti ti-search" aria-hidden="true" />
        <input
          placeholder="Nom, téléphone, n°, produit"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q ? (
          <button className="clr" onClick={() => setQ('')} aria-label="Effacer">
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="count">{filtered.length.toLocaleString('fr-FR')} résultat{filtered.length > 1 ? 's' : ''}</div>

      {shown.map((o) => (
        <div className="arow" key={o.id}>
          <div className="arn">
            <div className="arnm">{o.client}</div>
            <div className="arsub">{shortProd(o.produit)} · {cleanLoc(o.ville, o.region)}</div>
            {o.clientCount > 1 || o.commentaire ? (
              <div className="abadges">
                {o.clientCount > 1 ? (
                  <span className="bdg"><i className="ti ti-repeat" aria-hidden="true" /> client ×{o.clientCount}</span>
                ) : null}
                {o.commentaire ? (
                  <span className="bdg"><i className="ti ti-message" aria-hidden="true" /> {o.commentaire}</span>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="arr">
            <div className="amt">{fcfa(o.total)}</div>
            <div className="adate">{frDate(o.date)}</div>
          </div>
        </div>
      ))}

      {filtered.length === 0 ? (
        <div className="empty"><i className="ti ti-search-off" aria-hidden="true" />Aucune commande trouvée.</div>
      ) : null}
      {filtered.length > shown.length ? (
        <div className="more">+ {(filtered.length - shown.length).toLocaleString('fr-FR')} autres — affinez la recherche</div>
      ) : null}
    </>
  )
}
