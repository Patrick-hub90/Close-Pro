type Row = { id: string; nom: string; score: number; total: number; late: number; conf: number }

/** Classement des closeuses (réservé au propriétaire) — ponctualité sur les commandes actives. */
export default function Classement({ rows }: { rows: Row[] }) {
  if (!rows.length) return null
  const medal = ['🥇', '🥈', '🥉']
  return (
    <div className="clt">
      <div className="clt-h"><i className="ti ti-trophy" aria-hidden="true" /> Classement des closeuses</div>
      {rows.map((r, i) => (
        <div className="clt-row" key={r.id}>
          <span className="clt-rk">{medal[i] ?? i + 1}</span>
          <div className="clt-main">
            <div className="clt-nom">{r.nom}</div>
            <div className="clt-sub">
              {r.total} cmd{r.total > 1 ? 's' : ''} · {r.conf} confirmée{r.conf > 1 ? 's' : ''}
              {r.late ? <span className="clt-late"> · {r.late} en retard</span> : null}
            </div>
          </div>
          <span className={`clt-score ${r.score >= 85 ? '' : r.score >= 60 ? 'mid' : 'low'}`}>{r.score}</span>
        </div>
      ))}
      <div className="clt-note">Ponctualité sur les commandes actives. Visible par toi seul.</div>
    </div>
  )
}
