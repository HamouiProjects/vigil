export default function WHeader({ title, badge, badgeActive, onRefresh, onCollapse, collapsed, onClose, onFullscreen, isFullscreen }) {
  return (
    <div className="widget-header widget-drag-handle">
      <div className="widget-title-group">
        <span className="widget-title">{title}</span>
      </div>
      <div className="widget-actions">
        {badge && (
          <span className={`widget-badge${badgeActive ? '' : ' inactive'}`}>
            {badgeActive && <span className="badge-dot" />}
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
