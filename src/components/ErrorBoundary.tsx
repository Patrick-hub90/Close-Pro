import { Component, type ReactNode } from 'react'

export default class ErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }

  static getDerivedStateFromError(err: Error) {
    return { err }
  }

  render() {
    if (this.state.err) {
      return (
        <div className="app">
          <div className="boot-err">
            <i className="ti ti-alert-triangle" aria-hidden="true" />
            <h3>Une erreur est survenue</h3>
            <p>{this.state.err.message || 'Erreur inattendue.'}</p>
            <button onClick={() => window.location.reload()}>
              <i className="ti ti-refresh" aria-hidden="true" /> Recharger l'application
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
