import { useState, useEffect } from 'react'
import { getSettings, subscribeSettings } from '../../utils/settingsStore'

export function LiveBtn({ isLive, workspacePaused, onToggle }) {
  const [globalLive, setGlobalLive] = useState(() => getSettings().globalLive)
  useEffect(() => subscribeSettings(s => setGlobalLive(s.globalLive)), [])

  const overridden = !globalLive || workspacePaused
  const paused = overridden || !isLive

  return (
    <button
      className={`widget-live-btn${paused ? ' is-paused' : ' is-live'}${overridden ? ' is-overridden' : ''}`}
      onClick={overridden ? undefined : onToggle}
      title={
        !globalLive     ? 'Global live feed is paused — manage in Settings' :
        workspacePaused ? 'Workspace is paused — right-click the tab to resume' :
        isLive          ? 'Click to pause this widget' : 'Click to resume this widget'
      }
    >
      {!paused && <span className="live-pulse" />}
      {paused ? '⏸ PAUSED' : 'LIVE'}
    </button>
  )
}

export default function WHeader({ title, onToggleLive, isLive = true, workspacePaused = false, onRefresh, onCollapse, collapsed, onClose, onFullscreen, isFullscreen }) {
  return (
    <div className="widget-header widget-drag-handle">
      <div className="widget-title-group">
        <span className="widget-title">{title}</span>
      </div>
      <div className="widget-actions">
        {onToggleLive && <LiveBtn isLive={isLive} workspacePaused={workspacePaused} onToggle={onToggleLive} />}
        {onRefresh    && <button className="widget-btn" onClick={onRefresh}    title="Refresh">↻</button>}
        {onCollapse   && <button className="widget-btn" onClick={onCollapse}   title={collapsed ? 'Expand' : 'Collapse'}>{collapsed ? '+' : '—'}</button>}
        {onFullscreen && <button className="widget-btn" onClick={onFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{isFullscreen ? '⤡' : '⤢'}</button>}
        {onClose      && <button className="widget-btn" onClick={onClose}      title="Close">✕</button>}
      </div>
    </div>
  )
}
