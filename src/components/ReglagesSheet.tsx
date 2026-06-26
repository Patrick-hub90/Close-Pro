import { useState } from 'react'

export default function ReglagesSheet({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'equilibre' | 'performance' | 'manuel'>('performance')
  const [prio, setPrio] = useState(60)
  const [plancher, setPlancher] = useState(15)
  const [capacite, setCapacite] = useState(30)

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="handle" />
        <h3>Réglages d'attribution · Cameroun</h3>

        <div className="flab">Mode</div>
        <div className="seg3">
          <button className={mode === 'equilibre' ? 'on' : ''} onClick={() => setMode('equilibre')}>Équilibré</button>
          <button className={mode === 'performance' ? 'on' : ''} onClick={() => setMode('performance')}>Performance</button>
          <button className={mode === 'manuel' ? 'on' : ''} onClick={() => setMode('manuel')}>Manuel</button>
        </div>

        <div className="flab">Priorité d'attribution</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="range" min={0} max={100} step={1} value={prio} onChange={(e) => setPrio(+e.target.value)} style={{ flex: 1 }} />
          <span className="slval">Performance {prio}</span>
        </div>
        <div className="ends"><span>Équité totale</span><span>Performance max</span></div>

        <div className="frow">
          <div><div className="d">Plancher par closeuse</div><div className="dd">volume minimum garanti</div></div>
          <div className="stp">
            <button onClick={() => setPlancher(Math.max(0, plancher - 5))}>−</button>
            <span className="val">{plancher}%</span>
            <button onClick={() => setPlancher(Math.min(50, plancher + 5))}>+</button>
          </div>
        </div>

        <div className="frow">
          <div><div className="d">Capacité max</div><div className="dd">file pleine → déborde</div></div>
          <div className="stp">
            <button onClick={() => setCapacite(Math.max(5, capacite - 5))}>−</button>
            <span className="val">{capacite}</span>
            <button onClick={() => setCapacite(capacite + 5)}>+</button>
          </div>
        </div>

        <div className="fnote">
          <i className="ti ti-shield-check" aria-hidden="true" />
          La performance oriente les commandes sans jamais mettre une closeuse à zéro.
        </div>

        <div className="facts">
          <button className="cancel" onClick={onClose}>Annuler</button>
          <button className="save" onClick={onClose}>Enregistrer</button>
        </div>
      </div>
    </div>
  )
}
