import { useEffect } from 'react'
import { widgetRegistryMeta, WIDGET_CATEGORIES } from './widgetRegistry.js'

export default function WidgetPicker({ onPick, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal widget-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Add Widget</span>
          <button type="button" className="widget-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          {WIDGET_CATEGORIES.map((cat) => (
            <section key={cat.label}>
              <h3 className="widget-picker-cat">{cat.label}</h3>
              <div className="modal-grid">
                {cat.types.map((type) => {
                  const meta = widgetRegistryMeta[type]
                  if (!meta) return null
                  const Icon = meta.Icon
                  return (
                    <button
                      key={type}
                      type="button"
                      className="modal-card"
                      onClick={() => onPick(type)}
                    >
                      <span className="modal-card-icon" aria-hidden>
                        <Icon size={24} strokeWidth={1.75} color="currentColor" />
                      </span>
                      <span className="modal-card-label">{meta.label}</span>
                      <span className="modal-card-desc">{meta.desc}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
