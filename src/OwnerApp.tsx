import { useState } from 'react'
import Attribution from './components/Attribution'
import Dashboard from './components/Dashboard'
import ArchiveView from './components/ArchiveView'
import Compte from './components/Compte'
import type { Agent } from './lib/supabase'

type Tab = 'attribution' | 'dashboard' | 'archive' | 'moi'

export default function OwnerApp({ onSwitchRole, live, agent }: { onSwitchRole: () => void; live?: boolean; agent?: Agent | null }) {
  const [tab, setTab] = useState<Tab>('attribution')

  return (
    <div className="app">
      {tab === 'attribution' && <Attribution />}
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'archive' && <ArchiveView />}
      {tab === 'moi' && (live ? (
        <Compte agent={agent} onLogout={onSwitchRole} />
      ) : (
        <div className="profil">
          <div className="av" style={{ background: 'var(--blue-bg)', color: 'var(--blue-tx)' }}>PB</div>
          <h3>Patrick</h3>
          <p>Propriétaire · 3 pays · 3 closeuses</p>
          <button className="roleswitch" onClick={onSwitchRole}>
            <i className="ti ti-arrows-left-right" aria-hidden="true" />Passer en vue closeuse
          </button>
        </div>
      ))}

      <nav className="nav">
        <div className="nav-inner">
          <button className={tab === 'attribution' ? 'on' : ''} onClick={() => setTab('attribution')}>
            <i className="ti ti-arrows-split-2" aria-hidden="true" />Attribution
          </button>
          <button className={tab === 'dashboard' ? 'on' : ''} onClick={() => setTab('dashboard')}>
            <i className="ti ti-chart-bar" aria-hidden="true" />Tableau
          </button>
          <button className={tab === 'archive' ? 'on' : ''} onClick={() => setTab('archive')}>
            <i className="ti ti-archive" aria-hidden="true" />Archive
          </button>
          <button className={tab === 'moi' ? 'on' : ''} onClick={() => setTab('moi')}>
            <i className="ti ti-user" aria-hidden="true" />Moi
          </button>
        </div>
      </nav>
    </div>
  )
}
