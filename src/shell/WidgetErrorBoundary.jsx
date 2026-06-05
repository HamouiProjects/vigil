import { Component } from 'react'

/**
 * WidgetErrorBoundary — wraps a single widget's body so a render/lifecycle
 * crash in one widget shows an honest in-widget error state instead of
 * blacking out the whole room. The host header (title / pause / fullscreen /
 * close) lives OUTSIDE this boundary and keeps working, so a broken widget
 * can always be closed. Resets automatically when resetKeys change (e.g. the
 * widget's config is edited) and via the Retry button.
 *
 * Note: React error boundaries catch render / lifecycle / constructor errors
 * in descendants. They do NOT catch errors thrown inside event handlers or
 * async callbacks — those still need their own try/catch.
 */
export default class WidgetErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Surface for QA without taking down the app.
    console.error('[WidgetErrorBoundary]', this.props.title || 'widget', error, info)
  }

  componentDidUpdate(prevProps) {
    if (!this.state.error) return
    const a = prevProps.resetKeys || []
    const b = this.props.resetKeys || []
    if (a.length !== b.length || a.some((k, i) => k !== b[i])) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error?.message || String(this.state.error)
      return (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: 16,
            textAlign: 'center',
            background: 'var(--color-surface-1)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
              fontSize: 10,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--color-error)',
            }}
          >
            ⚠ Widget error
          </span>
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', maxWidth: 280 }}>
            This widget ran into a problem. The rest of your room is unaffected.
          </span>
          <code
            style={{
              fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
              fontSize: 11,
              color: 'var(--color-text-muted)',
              maxWidth: 320,
              maxHeight: 48,
              overflow: 'hidden',
              wordBreak: 'break-word',
            }}
          >
            {msg}
          </code>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 4,
              padding: '5px 14px',
              fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
              fontSize: 11,
              letterSpacing: '0.06em',
              color: 'var(--color-brand)',
              background: 'transparent',
              border: '1px solid var(--color-border-strong)',
              borderRadius: 3,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
