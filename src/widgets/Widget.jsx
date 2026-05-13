export default function Widget({ title, icon, badge, badgeActive = true, onRefresh, children }) {
  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title-group">
          <span className="widget-icon">{icon}</span>
          <span className="widget-title">{title}</span>
          {badge && (
            <span className={`widget-badge${badgeActive ? '' : ' inactive'}`}>
              {badge}
            </span>
          )}
        </div>
        <div className="widget-actions">
          {onRefresh && (
            <button className="widget-btn" title="Refresh" onClick={onRefresh}>↻</button>
          )}
          <button className="widget-btn" title="Expand">⤢</button>
        </div>
      </div>
      <div className="widget-body">{children}</div>
    </div>
  )
}
