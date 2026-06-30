import { describe, it, expect } from 'vitest'
import { resolveEntitlements } from './resolve.js'

describe('resolveEntitlements: plan caps (the resolve.js yardstick)', () => {
  it('free: 2 rooms, 0 alert rules, 15 briefs, unlimited widgets', () => {
    const e = resolveEntitlements('free')
    expect(e.limits.workspaces).toBe(2)
    expect(e.limits.alertRules).toBe(0)
    expect(e.limits.briefsPerMonth).toBe(15)
    expect(e.limits.widgetsPerWorkspace).toBe(Infinity)
    expect(e.priceMode).toBe('realtime')
  })

  it('pro: 6 rooms, 10 alert rules, 100 briefs', () => {
    const e = resolveEntitlements('pro')
    expect(e.limits.workspaces).toBe(6)
    expect(e.limits.alertRules).toBe(10)
    expect(e.limits.briefsPerMonth).toBe(100)
  })

  it('team: 12 rooms, 25 alert rules, 300 briefs', () => {
    const e = resolveEntitlements('team')
    expect(e.limits.workspaces).toBe(12)
    expect(e.limits.alertRules).toBe(25)
    expect(e.limits.briefsPerMonth).toBe(300)
  })
})

describe('resolveEntitlements: capabilities', () => {
  it('realtime + full widget library are free on every tier', () => {
    for (const plan of ['free', 'pro', 'team']) {
      const c = resolveEntitlements(plan).capabilities
      expect(c.has('realtime_news')).toBe(true)
      expect(c.has('realtime_prices')).toBe(true)
      expect(c.has('full_widget_library')).toBe(true)
    }
  })

  it('alerts and scheduled_briefs are gated off free, on for pro and team', () => {
    expect(resolveEntitlements('free').capabilities.has('alerts')).toBe(false)
    expect(resolveEntitlements('free').capabilities.has('scheduled_briefs')).toBe(false)
    expect(resolveEntitlements('pro').capabilities.has('alerts')).toBe(true)
    expect(resolveEntitlements('pro').capabilities.has('scheduled_briefs')).toBe(true)
  })

  it('white_label and alerts_webhook are team-only', () => {
    expect(resolveEntitlements('pro').capabilities.has('white_label')).toBe(false)
    expect(resolveEntitlements('pro').capabilities.has('alerts_webhook')).toBe(false)
    expect(resolveEntitlements('team').capabilities.has('white_label')).toBe(true)
    expect(resolveEntitlements('team').capabilities.has('alerts_webhook')).toBe(true)
  })

  it('capabilities is a Set', () => {
    expect(resolveEntitlements('pro').capabilities).toBeInstanceOf(Set)
  })
})

describe('resolveEntitlements: status fallback to free', () => {
  it('null/active/trialing all let the plan apply', () => {
    for (const status of [null, 'active', 'trialing']) {
      expect(resolveEntitlements('team', [], status).limits.workspaces).toBe(12)
    }
  })

  it('any inactive status collapses a paid plan to free caps', () => {
    for (const status of ['past_due', 'unpaid', 'incomplete', 'canceled']) {
      const e = resolveEntitlements('team', [], status)
      expect(e.plan).toBe('free')
      expect(e.limits.workspaces).toBe(2)
      expect(e.capabilities.has('alerts')).toBe(false)
    }
  })
})

describe('resolveEntitlements: unknown plan and add-ons', () => {
  it('unknown plan resolves to free', () => {
    const e = resolveEntitlements('enterprise_unknown')
    expect(e.plan).toBe('free')
    expect(e.limits.workspaces).toBe(2)
  })

  it('valid add-ons apply only while active; invalid ones are dropped', () => {
    const active = resolveEntitlements('pro', ['brokerage', 'not_a_real_addon'], 'active')
    expect(active.addOns).toEqual(['brokerage'])
    expect(active.capabilities.has('brokerage')).toBe(true)
  })

  it('add-ons are stripped when the subscription is inactive', () => {
    const inactive = resolveEntitlements('pro', ['brokerage'], 'canceled')
    expect(inactive.addOns).toEqual([])
    expect(inactive.capabilities.has('brokerage')).toBe(false)
  })
})
