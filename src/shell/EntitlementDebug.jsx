import { useShellStore } from '../state/shellStore.js'
import { resolveEntitlements } from '../entitlements/resolve.js'
import { PLANS, ADDONS } from '../domain/types.js'

const box = {
  position: 'fixed',
  bottom: 8,
  right: 8,
  zIndex: 99999,
  width: 240,
  maxHeight: 200,
  overflowY: 'auto',
  background: 'var(--surface-elevated, #161B22)',
  border: '1px solid var(--border, #1E2329)',
  borderRadius: 3,
  padding: 8,
  fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
  fontSize: 9,
  color: 'var(--text-secondary, #8B949E)',
}

const btn = {
  fontSize: 8,
  padding: '2px 5px',
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
  const entitlements = useShellStore(s => s.entitlements)
  const setEntitlements = useShellStore(s => s.setEntitlements)

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
      <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 6, letterSpacing: '0.08em', fontSize: 8 }}>
        DEV · TIERS
      </div>
      <div style={{ marginBottom: 4 }}>
        <strong>Plan:</strong> {entitlements.plan}
        <span style={{ marginLeft: 6, color: 'var(--text-muted)' }}>{entitlements.priceMode}</span>
      </div>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 6 }}>
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
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
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
    </div>
  )
}
