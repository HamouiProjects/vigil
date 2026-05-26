import { useState } from 'react'
import { FEEDS_TABS } from '../../constants/atlasData'

export default function FeedsWidget({ onClose, onFullscreen, isFullscreen, onCollapse, collapsed }) {
  const [activeTab, setActiveTab] = useState(FEEDS_TABS[0].id)
  const [loadError, setLoadError] = useState(false)

  const tab = FEEDS_TABS.find(t => t.id === activeTab) ?? FEEDS_TABS[0]

  function switchTab(id) { setActiveTab(id); setLoadError(false) }

  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <div className="widget-header widget-drag-handle">
        <span className="widget-title">Feeds</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div className="map-tabs" onPointerDownCapture={e => e.stopPropagation()}>
            {FEEDS_TABS.map(t => (
              <button key={t.id} className={`map-tab-btn${activeTab === t.id ? ' active' : ''}`} onClick={() => switchTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          {onCollapse   && <button className="widget-btn" onClick={onCollapse} title={collapsed ? 'Expand' : 'Collapse'}>{collapsed ? '+' : '—'}</button>}
          {onFullscreen && <button className="widget-btn" onClick={onFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{isFullscreen ? '⤡' : '⤢'}</button>}
          {onClose      && <button className="widget-btn" onClick={onClose} title="Close">✕</button>}
        </div>
      </div>
      <div style={{ height: 'calc(100% - 36px)', width: '100%', position: 'relative', overflow: 'hidden' }}>
        <iframe
          key={tab.id}
          src={tab.src}
          style={{ width: '100%', height: '100%', border: 'none', outline: 'none', display: 'block' }}
          title={tab.label}
          allowFullScreen
          onError={() => setLoadError(true)}
          onLoad={() => setLoadError(false)}
        />
        {loadError && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', background: '#080f18' }}>
            <div style={{ fontSize: '11px', color: '#6e8098', textAlign: 'center', padding: '0 20px' }}>{tab.label} does not allow embedding.</div>
            <a href={tab.src} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', fontWeight: 600, color: '#00c6ff', background: 'rgba(0,198,255,0.1)', border: '1px solid rgba(0,198,255,0.3)', borderRadius: '4px', padding: '5px 14px', textDecoration: 'none', letterSpacing: '0.05em' }}>
              Open in new tab →
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
