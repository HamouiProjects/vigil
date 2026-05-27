export default function WHeader({ title, badge, badgeActive, badgePaused, onBadgeClick, onRefresh, onCollapse, collapsed, onClose, onFullscreen, isFullscreen }) {
  return (
    <div className="widget-header widget-drag-handle">
      <div className="widget-title-group">
        <span className="widget-title">{title}</span>
      </div>
      <div className="widget-actions">
        {badge && (
          <span
            className={`widget-badge${badgePaused ? '' : badgeActive ? '' : ' inactive'}`}
            onClick={onBadgeClick}
            role={onBadgeClick ? 'button' : undefined}
            tabIndex={onBadgeClick ? 0 : undefined}
            title={onBadgeClick ? (badgePaused ? 'Resume polling' : 'Pause polling') : undefined}
            style={{
              ...(onBadgeClick ? { cursor: 'pointer' } : {}),
              ...(badgePaused ? { color: 'var(--amber)', background: 'rgba(210,153,34,0.08)', borderColor: 'rgba(210,153,34,0.35)' } : {}),
            }}
          >
            {badgeActive && !badgePaused && <span className="badge-dot" />}
            {badge}
          </span>
        )}
        {onRefresh    && <button className="widget-btn" onClick={onRefresh}    title="Refresh">↻</button>}
        {onCollapse   && <button className="widget-btn" onClick={onCollapse}   title={collapsed ? 'Expand' : 'Collapse'}>{collapsed ? '+' : '—'}</button>}
        {onFullscreen && <button className="widget-btn" onClick={onFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{isFullscreen ? '⤡' : '⤢'}</button>}
        {onClose      && <button className="widget-btn" onClick={onClose}      title="Close">✕</button>}
      </div>
    </div>
  )
}
