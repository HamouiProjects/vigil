import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { getSettings, saveSettings, subscribeSettings } from '../../utils/settingsStore'

function Toggle({ checked, onChange }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative', flexShrink: 0,
        width: 36, height: 20, borderRadius: 10,
        border: 'none', padding: 0,
        background: checked ? 'var(--accent)' : 'var(--border)',
        cursor: 'pointer', transition: 'background 0.15s',
        outline: 'none',
      }}
    >
      <span style={{
        position: 'absolute', top: 2,
        left: checked ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%',
        background: '#fff', transition: 'left 0.15s',
        display: 'block',
      }} />
    </button>
  )
}

function SettingRow({ label, description, checked, onChange, last }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, marginBottom: last ? 0 : 20 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: 'var(--text-primary)', fontSize: 11, fontFamily: 'var(--font-mono)', marginBottom: 5, letterSpacing: '0.04em' }}>
          {label}
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-sans)', lineHeight: 1.6 }}>
          {description}
        </div>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

export default function SettingsModal({ onClose }) {
  const [s, setS] = useState(getSettings)
  useEffect(() => subscribeSettings(next => setS(next)), [])

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4,
        width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto',
        fontFamily: 'var(--font-mono)',
      }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-primary)', fontSize: 13, letterSpacing: '0.08em' }}>SETTINGS</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <div style={{ padding: '18px 20px 16px' }}>
          <div style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-muted)', marginBottom: 18 }}>DATA &amp; CONNECTIVITY</div>
          <SettingRow
            label="Pause inactive workspaces"
            description="Widgets stop fetching data when their workspace tab is not active. Recommended for limited data connections."
            checked={s.inactiveTabPause}
            onChange={v => saveSettings({ inactiveTabPause: v })}
          />
          <div style={{ height: 16 }} />
          <SettingRow
            label="Global live feed"
            description="Master switch. When off, all widget polling stops across all workspaces."
            checked={s.globalLive}
            onChange={v => saveSettings({ globalLive: v })}
            last
          />
        </div>

        <div style={{ height: 1, background: 'var(--border)', margin: '0 20px' }} />

        <div style={{ padding: '16px 20px 20px' }}>
          <div style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-muted)', marginBottom: 12 }}>PER-WIDGET CONTROL</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-sans)', lineHeight: 1.6 }}>
            Each widget can be individually paused using the{' '}
            <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>⏸ PAUSED</span>
            {' '}toggle in its header.
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
