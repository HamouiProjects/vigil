const PLAN_BASE = {
  free: {
    limits: { workspaces: 2, widgetsPerWorkspace: Infinity, alertRules: 0, briefsPerMonth: 15 },
    capabilities: ['realtime_news', 'realtime_prices', 'full_widget_library'],
    priceMode: 'realtime',
  },
  pro: {
    limits: { workspaces: 6, widgetsPerWorkspace: Infinity, alertRules: 10, briefsPerMonth: 100 },
    capabilities: ['realtime_news', 'realtime_prices', 'full_widget_library', 'alerts', 'scheduled_briefs'],
    priceMode: 'realtime',
  },
  team: {
    limits: { workspaces: 12, widgetsPerWorkspace: Infinity, alertRules: 25, briefsPerMonth: 300 },
    capabilities: ['realtime_news', 'realtime_prices', 'full_widget_library', 'white_label', 'alerts', 'alerts_webhook', 'scheduled_briefs'],
    priceMode: 'realtime',
  },
}

const ADDON_CAPABILITIES = {
  brokerage: 'brokerage',
  licensed_data: 'licensed_data',
  ai_reports: 'ai_reports',
  premium_layers: 'premium_layers',
}

/**
 * @param {string} plan
 * @param {string[]} addOns
 */
export function resolveEntitlements(plan, addOns = [], status = null) {
  // A paid plan and its add-ons apply only while the subscription is active/trialing.
  // Any other status (past_due, unpaid, incomplete, canceled, ...) falls back to Free.
  const active = status == null || status === 'active' || status === 'trialing'
  const effectivePlan = active ? plan : 'free'
  const base = PLAN_BASE[effectivePlan] ?? PLAN_BASE.free
  const capabilities = new Set(base.capabilities)
  const normalizedAddOns = active ? addOns.filter(a => ADDON_CAPABILITIES[a]) : []
  for (const addon of normalizedAddOns) capabilities.add(ADDON_CAPABILITIES[addon])
  let priceMode = base.priceMode
  if (normalizedAddOns.includes('licensed_data')) priceMode = 'realtime'
  return {
    plan: PLAN_BASE[effectivePlan] ? effectivePlan : 'free',
    addOns: normalizedAddOns,
    limits: { ...base.limits },
    capabilities,
    priceMode,
  }
}
