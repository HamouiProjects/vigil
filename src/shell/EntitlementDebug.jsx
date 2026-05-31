import { useState } from 'react'
import { useShellStore, isWorkspacePaused } from '../state/shellStore.js'
import { resolveEntitlements } from '../entitlements/resolve.js'
import { PLANS, ADDONS } from '../domain/types.js'
import WidgetHost from './WidgetHost.jsx'

const DEMO_WS = 'demo-ws'
const DEMO_WEATHER_WIDGET = { id: 'demo-weather', type: 'weather', config: { city: 'Berlin', latLon: null, locName: 'Berlin' } }

const box = {
  position: 'fixed',
  top: 44,
  right: 8,
  zIndex: 99999,
  width: 280,
  maxHeight: 'calc(100vh - 52px)',
  overflowY: 'auto',
  background: 'var(--surface-elevated, #161B22)',
  border: '1px solid var(--border, #1E2329)',
  borderRadius: 3,
  padding: 10,
  fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
  fontSize: 10,
  color: 'var(--text-secondary, #8B949E)',
}

const btn = {
  fontSize: 9,
  padding: '3px 6px',
  borderRadius: 3,
  border: '1px solid var(--border, #1E2329)',
  background: 'var(--surface, #0D1117)',
  color: 'var(--text-primary, #E6EDF3)',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const activeBtn = {
  ...btn,
  borderColor: 'var(--accent, #00D4FF)',
  color: 'var(--accent, #00D4FF)',
}

export default function EntitlementDebug() {
  const globalLive = useShellStore(s => s.globalLive)
  const activeWs = useShellStore(s => s.activeWs)
  const pausedWorkspaces = useShellStore(s => s.pausedWorkspaces)
  const inactiveTabPause = useShellStore(s => s.inactiveTabPause)
  const entitlements = useShellStore(s => s.entitlements)
  const setGlobalLive = useShellStore(s => s.setGlobalLive)
  const setActiveWs = useShellStore(s => s.setActiveWs)
  const toggleWorkspacePause = useShellStore(s => s.toggleWorkspacePause)
  const setInactiveTabPause = useShellStore(s => s.setInactiveTabPause)
  const setEntitlements = useShellStore(s => s.setEntitlements)

  const [demoWidget, setDemoWidget] = useState(DEMO_WEATHER_WIDGET)

  const state = { globalLive, activeWs, pausedWorkspaces, inactiveTabPause }
  const demoPaused = isWorkspacePaused(state, DEMO_WS)

  function apply(plan, addOns) {
    setEntitlements(resolveEntitlements(plan, addOns))
  }

  function toggleAddon(addon) {
    const next = entitlements.addOns.includes(addon)
      ? entitlements.addOns.filter(a => a !== addon)
      : [...entitlements.addOns, addon]
    apply(entitlements.plan, next)
  }

  return (
    <div style={box}>
      <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 8, letterSpacing: '0.08em' }}>
        ENTITLEMENT DEBUG
      </div>

      <div style={{ marginBottom: 6 }}>
        <strong>Plan:</strong> {entitlements.plan}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
        {PLANS.map(p => (
          <button
            key={p}
            type="button"
            style={entitlements.plan === p ? activeBtn : btn}
            onClick={() => apply(p, entitlements.addOns)}
          >
            {p}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 4 }}>
        <strong>Add-ons:</strong> {entitlements.addOns.length ? entitlements.addOns.join(', ') : 'none'}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
        {ADDONS.map(a => (
          <button
            key={a}
            type="button"
            style={entitlements.addOns.includes(a) ? activeBtn : btn}
            onClick={() => toggleAddon(a)}
          >
            {a}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 4 }}>
        <strong>Limits:</strong> workspaces={String(entitlements.limits.workspaces)},
        widgets/ws={String(entitlements.limits.widgetsPerWorkspace)}
      </div>
      <div style={{ marginBottom: 4 }}>
        <strong>Capabilities:</strong>{' '}
        {[...entitlements.capabilities].join(', ') || 'none'}
      </div>
      <div style={{ marginBottom: 10 }}>
        <strong>priceMode:</strong> {entitlements.priceMode}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
        <div style={{ marginBottom: 6 }}>
          <strong>isWorkspacePaused(&apos;{DEMO_WS}&apos;):</strong>{' '}
          <span style={{ color: demoPaused ? 'var(--red)' : 'var(--green)' }}>
            {String(demoPaused)}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
          <button type="button" style={btn} onClick={() => setGlobalLive(v => !v)}>
            globalLive: {String(globalLive)}
          </button>
          <button type="button" style={btn} onClick={() => setActiveWs(activeWs === DEMO_WS ? null : DEMO_WS)}>
            activeWs: {activeWs ?? 'null'}
          </button>
          <button type="button" style={btn} onClick={() => setInactiveTabPause(v => !v)}>
            inactiveTabPause: {String(inactiveTabPause)}
          </button>
          <button type="button" style={btn} onClick={() => toggleWorkspacePause(DEMO_WS)}>
            pause {DEMO_WS}: {String(pausedWorkspaces.includes(DEMO_WS))}
          </button>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8 }}>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
          WidgetHost harness
        </div>
        <div style={{ height: 320, border: '1px solid var(--border)', borderRadius: 3, overflow: 'hidden' }}>
          <WidgetHost
            widget={demoWidget}
            workspacePaused={demoPaused}
            entitlements={entitlements}
            onSaveConfig={cfg => setDemoWidget(w => ({ ...w, config: cfg }))}
          />
        </div>
      </div>
    </div>
  )
}
