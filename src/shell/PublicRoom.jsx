import { useEffect, useState } from 'react'
import { ReactGridLayout as GridLayout, WidthProvider } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { loadPublicRoom } from '../data/workspacesRepo.js'
import WidgetHost from './WidgetHost.jsx'

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
        <span style={{ fontFamily: 'var(--font-mono, JetBrains Mono, monospace)', fontSize: 11, color: 'var(--text-primary)' }}>
          {room.name}
        </span>
        <a href="/" className="nav-add-btn">Build your own →</a>
      </div>

      <div style={{ width: '100%', height: 'calc(100vh - 40px)', overflow: 'auto' }}>
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
                  sources={[]}
                  readOnly
                />
              </div>
            )
          })}
        </SizedGridLayout>
      </div>
    </div>
  )
}
