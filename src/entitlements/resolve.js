const PLAN_BASE = {
  free: {
    limits: { workspaces: 2, widgetsPerWorkspace: 3 },
    capabilities: [],
    priceMode: 'delayed',
  },
  pro: {
    limits: { workspaces: Infinity, widgetsPerWorkspace: Infinity },
    capabilities: ['realtime_news', 'realtime_prices', 'full_widget_library'],
    priceMode: 'realtime',
  },
  team: {
    limits: { workspaces: Infinity, widgetsPerWorkspace: Infinity },
    capabilities: ['realtime_news', 'realtime_prices', 'full_widget_library', 'white_label'],
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
export function resolveEntitlements(plan, addOns = []) {
  const base = PLAN_BASE[plan] ?? PLAN_BASE.free
  const capabilities = new Set(base.capabilities)
  const normalizedAddOns = addOns.filter(a => ADDON_CAPABILITIES[a])

  for (const addon of normalizedAddOns) {
    capabilities.add(ADDON_CAPABILITIES[addon])
  }

  let priceMode = base.priceMode
  if (normalizedAddOns.includes('licensed_data')) {
    priceMode = 'realtime'
  }

  return {
    plan: PLAN_BASE[plan] ? plan : 'free',
    addOns: normalizedAddOns,
    limits: { ...base.limits },
    capabilities,
    priceMode,
  }
}
