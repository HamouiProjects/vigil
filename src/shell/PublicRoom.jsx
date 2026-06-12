import { useEffect, useState } from 'react'
import { ReactGridLayout as GridLayout, WidthProvider } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { ensureSession } from '../data/session.js'
import { loadPublicRoom, cloneRoom } from '../data/workspacesRepo.js'
import WidgetHost from './WidgetHost.jsx'
import AppErrorBoundary from './AppErrorBoundary.jsx'

const SizedGridLayout = WidthProvider(GridLayout)

const loaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100vh',
  fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
  fontSize: 10,
  color: 'var(--text-secondary)',
}

export default function PublicRoom({ slug }) {
  const [loading, setLoading] = useState(true)
  const [room, setRoom] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [cloning, setCloning] = useState(false)

  async function handleClone() {
    if (cloning) return
    setCloning(true)
    try {
      const uid = await ensureSession()
      await cloneRoom(uid, room)
      window.location.href = '/'
    } catch (e) {
      console.error(e)
      setCloning(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setNotFound(false)
    setRoom(null)
    loadPublicRoom(slug)
      .then(data => {
        if (cancelled) return
        if (!data) setNotFound(true)
        else setRoom(data)
      })
      .catch(() => {
        if (!cancelled) setNotFound(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [slug])

  if (loading) {
    return <div style={loaderStyle}>Loading room…</div>
  }

  if (notFound || !room) {
    return <div style={loaderStyle}>This room is not available.</div>
  }

  return (
    <div className="app">
      <div
        style={{
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          background: 'var(--surface-elevated)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--font-mono, JetBrains Mono, monospace)', fontSize: 11, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {room.name}
          </span>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
            Vigil tracks, it does not verify.
          </span>
        </div>
        <button type="button" className="nav-add-btn btn-primary" onClick={handleClone} disabled={cloning}>
          {cloning ? 'Cloning…' : 'Clone this room'}
        </button>
      </div>

      <div style={{ width: '100%', height: 'calc(100vh - 40px)', overflow: 'auto' }}>
        <AppErrorBoundary>
          <SizedGridLayout
            layout={room.layout}
            cols={24}
            rowHeight={32}
            margin={[6, 6]}
            containerPadding={[8, 8]}
            compactType="vertical"
            preventCollision={false}
            isResizable={false}
            isDraggable={false}
          >
            {room.widgets.map(widget => {
              const gridItem = room.layout.find(item => item.i === widget.id)
              if (!gridItem) return null
              return (
                <div
                  key={widget.id}
                  data-grid={{ ...gridItem }}
                  style={{ height: '100%', overflow: 'hidden' }}
                >
                  <WidgetHost
                    widget={widget}
                    workspacePaused={false}
                    widgetPaused={false}
                    entitlements={{}}
                    onSaveConfig={() => {}}
                    sources={room.sources ?? []}
                    readOnly
                  />
                </div>
              )
            })}
          </SizedGridLayout>
        </AppErrorBoundary>
      </div>
    </div>
  )
}
