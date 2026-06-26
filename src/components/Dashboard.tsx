import { KPIS, PAYS_STATS, CLASSEMENT } from '../ownerData'

function kpiColor(tone: string): string | undefined {
  if (tone === 'green') return 'var(--green-tx)'
  if (tone === 'red') return 'var(--red-tx)'
  if (tone === 'amber') return 'var(--amber-tx)'
  return undefined
}
function avStyle(ton: string): React.CSSProperties {
  if (ton === 'green') return { background: 'var(--green-bg)', color: 'var(--green-tx)' }
  if (ton === 'amber') return { background: 'var(--amber-bg)', color: 'var(--amber-tx)' }
  return { background: 'var(--surface-2)', color: 'var(--text-2)' }
}

export default function Dashboard() {
  return (
    <>
      <div className="ohdr">
        <span className="t">Tableau de bord</span>
        <span className="period">Aujourd'hui <i className="ti ti-chevron-down" aria-hidden="true" /></span>
      </div>

      <div className="kpis">
        {KPIS.map((k) => (
          <div className="kpi" key={k.l}>
            <div className="l">{k.l}</div>
            <div className="v" style={{ color: kpiColor(k.tone) }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div className="alertbar">
        <i className="ti ti-alert-triangle" aria-hidden="true" />
        7 commandes en retard maintenant
        <i className="ti ti-chevron-right ar" aria-hidden="true" />
      </div>

      <div className="sectitle">Vos pays</div>
      <div className="box">
        {PAYS_STATS.map((p) => (
          <div className="brow" key={p.nom}>
            <div><div className="bn">{p.nom}</div><div className="bm">{p.commandes} commandes</div></div>
            <span style={{ color: kpiColor(p.tone), fontWeight: 500 }}>{p.aTemps}%</span>
          </div>
        ))}
      </div>

      <div className="sectitle">Closeuses · Cameroun</div>
      <div className="box">
        {CLASSEMENT.map((c) => (
          <div className="lrow" key={c.rang}>
            <span className="lrk">{c.rang}</span>
            <span className="cav" style={avStyle(c.ton)}>{c.ini}</span>
            <div className="lnm2"><div className="t">{c.nom}</div><div className="s">{c.s}</div></div>
            <span className="lsv" style={{ color: kpiColor(c.ton) }}>{c.score}</span>
          </div>
        ))}
      </div>
    </>
  )
}
