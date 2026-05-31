import { useState, useEffect } from 'react'
import { getSettings, subscribeSettings } from '../../utils/settingsStore'

export function InfoTooltip({ text, wide }) {
  return (
    <span className="info-tip-wrap">
      <span className="info-tip-btn">?</span>
      <span className={`info-tip-box${wide ? ' info-tip-box-wide' : ''}`}>{text}</span>
    </span>
  )
}

const LiveBtn = ({ isLive, workspacePaused, onToggle }) => {
  const [globalLive, setGlobalLive] = useState(() => getSettings().globalLive);
  useEffect(() => subscribeSettings((s) => setGlobalLive(s.globalLive)), []);
  const overridden = !globalLive || workspacePaused;
  const paused = overridden || !isLive;

  return (
    <button
      className={`widget-live-btn${paused ? ' is-paused' : ' is-live'}${overridden ? ' is-overridden' : ''}`}
      onClick={overridden ? undefined : onToggle}
      title={
        !globalLive ? 'Global live feed is paused — manage in Settings'
        : workspacePaused ? 'Workspace is paused — right-click the tab to resume'
        : isLive ? 'Pause this widget'
        : 'Resume this widget'
      }
    >
      {paused ? (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="1.5" y="1" width="3" height="8" fill="currentColor"/>
          <rect x="5.5" y="1" width="3" height="8" fill="currentColor"/>
        </svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon points="2,1 9,5 2,9" fill="currentColor"/>
        </svg>
      )}
    </button>
  );
};

export default function WHeader({ title, onToggleLive, isLive = true, workspacePaused = false, onRefresh, onCollapse, collapsed, onClose, onFullscreen, isFullscreen, children }) {
  return (
    <div className="widget-header widget-drag-handle">
      <div className="widget-title-group">
        <span className="widget-title">{title}</span>
      </div>
      <div className="widget-actions">
        {onToggleLive && <LiveBtn isLive={isLive} workspacePaused={workspacePaused} onToggle={onToggleLive} />}
        {children}
        {onRefresh    && <button className="widget-btn" onClick={onRefresh}    title="Refresh">↻</button>}
        {onCollapse   && <button className="widget-btn" onClick={onCollapse}   title={collapsed ? 'Expand' : 'Collapse'}>{collapsed ? '+' : '—'}</button>}
        {onFullscreen && <button className="widget-btn" onClick={onFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{isFullscreen ? '⤡' : '⤢'}</button>}
        {onClose      && <button className="widget-btn widget-btn-close" onClick={onClose}      title="Close">✕</button>}
      </div>
    </div>
  )
}
