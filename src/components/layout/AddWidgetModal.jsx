import { WIDGET_CATALOG } from '../../constants/widgetTypes'

export default function AddWidgetModal({ onAdd, onClose }) {
  return (
    <div className="modal-overlay" onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Add Widget</span>
          <button className="widget-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-grid">
          {WIDGET_CATALOG.map(w => (
            <button key={w.type} className="modal-card" onClick={() => onAdd(w.type)}>
              <span className="modal-card-icon">{w.icon}</span>
              <span className="modal-card-label">{w.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
