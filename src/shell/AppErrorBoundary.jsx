import { Component } from 'react'
import GlobeGlyph from '../brand/GlobeGlyph.jsx'

/**
 * AppErrorBoundary — top-level guard so a render/lifecycle crash in route
 * content or a shared room grid shows a calm recovery screen instead of a
 * white screen. Catches render / lifecycle / constructor errors in descendants.
 */
export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[AppErrorBoundary]', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: 24,
            background: 'var(--color-bg)',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              maxWidth: 360,
              textAlign: 'center',
              padding: '24px 28px',
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              borderRadius: 4,
            }}
          >
            <GlobeGlyph size={28} />
            <span
              style={{
                fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
                fontSize: 11,
                color: 'var(--color-text-primary)',
              }}
            >
              Something went wrong.
            </span>
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                lineHeight: 1.5,
                color: 'var(--color-text-secondary)',
              }}
            >
              Reload to get back to your room.
            </span>
            <button
              type="button"
              className="nav-add-btn btn-secondary"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
