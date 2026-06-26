import { useState } from 'react'
import { CLOSEUSES, A_ATTRIBUER, type Closeuse } from '../ownerData'
import ReglagesSheet from './ReglagesSheet'

function avStyle(ton: Closeuse['ton']): React.CSSProperties {
  if (ton === 'green') return { background: 'var(--green-bg)', color: 'var(--green-tx)' }
  if (ton === 'amber') return { background: 'var(--amber-bg)', color: 'var(--amber-tx)' }
  return { background: 'var(--surface-2)', color: 'var(--text-2)' }
}
function chargeColor(ton: Closeuse['ton']): string {
  if (ton === 'amber') return 'var(--amber)'
  if (ton === 'gray') return 'var(--text-3)'
  return 'var(--blue)'
}

export default function Attribution() {
  const [mode, setMode] = useState<'auto' | 'manuel'>('auto')
  const [sheet, setSheet] = useState(false)

  return (
    <>
      <div className="ohdr">
        <span className="t">Attribution</span>
        <span className="av">PB</span>
      </div>

      <div className="selrow">
        <span className="cpill">Cameroun <i className="ti ti-chevron-down" aria-hidden="true" /></span>
        <span className="modeseg">
          <button className={mode === 'auto' ? 'on' : ''} onClick={() => setMode('auto')}>Auto</button>
          <button className={mode === 'manuel' ? 'on' : ''} onClick={() => setMode('manuel')}>Manuel</button>
        </span>
      </div>

      <div className="sumchips">
        <span className="sc"><i className="ti ti-bolt" aria-hidden="true" />Performance</span>
        <span className="sc">Équité 60</span>
        <span className="sc"><i className="ti ti-shield-check" aria-hidden="true" />Plancher 15%</span>
        <button className="sc act" onClick={() => setSheet(true)}><i className="ti ti-adjustments" aria-hidden="true" />Réglages</button>
      </div>

      <div className="ass">
        <div className="assh"><span><b>{A_ATTRIBUER}</b> commandes à attribuer</span><i className="ti ti-inbox" aria-hidden="true" /></div>
        <button className="bigbtn"><i className="ti ti-wand" aria-hidden="true" />Auto-répartir</button>
        <button className="ghostbtn"><i className="ti ti-hand-finger" aria-hidden="true" />Sélection manuelle</button>
      </div>

      <div className="sectitle">
        Closeuses · Cameroun
        <button className="link"><i className="ti ti-refresh" aria-hidden="true" /> Rééquilibrer</button>
      </div>

      {CLOSEUSES.map((c) => (
        <div className={`ccard ${c.apprentissage ? 'appr' : ''}`} key={c.id}>
          <div className="cch">
            <span className="cav" style={avStyle(c.ton)}>{c.initiales}</span>
            <div className="cinfo">
              <div className="cnm">
                {c.nom}
                {c.apprentissage ? <span className="tagw" style={{ marginLeft: 8 }}>apprentissage</span> : <span className="cdot" />}
              </div>
              <div className="cmeta">
                {c.apprentissage ? (
                  <><i className="ti ti-shield-check" aria-hidden="true" /> plancher garanti 15%</>
                ) : (
                  <>{c.charge}/{c.capacite} · score {c.score} · fort {c.forts[0]}</>
                )}
              </div>
            </div>
            <button className="addbtn" aria-label={`Attribuer à ${c.nom}`}><i className="ti ti-plus" aria-hidden="true" /></button>
          </div>
          <div className="charge"><i style={{ width: `${Math.round((c.charge / c.capacite) * 100)}%`, background: chargeColor(c.ton) }} /></div>
        </div>
      ))}

      {sheet && <ReglagesSheet onClose={() => setSheet(false)} />}
    </>
  )
}
