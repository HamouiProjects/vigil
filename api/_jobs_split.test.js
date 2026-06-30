// Smoke test for the api/jobs.js -> _jobs_*.js split (T9). Asserts the action router
// imports every handler and that each handler module exports a callable function. This
// guards against a future edit dropping or misnaming an export across the module boundary.
import { describe, it, expect } from 'vitest'
import handler from './jobs.js'
import { handleEmailBrief, sanitizeBrief, renderEmailHtml, renderEmailText } from './_jobs_email.js'
import { handleAlertDispatch, handleAlertPoll } from './_jobs_alerts.js'
import { handleDeleteAccount, handleEmailSignup, handleContact } from './_jobs_account.js'
import { handleSuggestSources } from './_jobs_suggest.js'
import { handleTelegramLinkStart, handleTelegramWebhook } from './_jobs_telegram.js'
import { dispatchScheduledBriefs, cleanupStaleRows } from './_jobs_scheduled.js'

describe('jobs split: action handlers', () => {
  it('default handler is a function', () => {
    expect(typeof handler).toBe('function')
  })

  it('every action handler is a callable function', () => {
    const handlers = {
      handleEmailBrief, handleAlertDispatch, handleAlertPoll,
      handleDeleteAccount, handleEmailSignup, handleContact,
      handleSuggestSources, handleTelegramLinkStart, handleTelegramWebhook,
    }
    for (const [name, fn] of Object.entries(handlers)) {
      expect(typeof fn, name).toBe('function')
    }
  })

  it('cross-module exports used by alerts and scheduled resolve', () => {
    expect(typeof dispatchScheduledBriefs).toBe('function')
    expect(typeof cleanupStaleRows).toBe('function')
    expect(typeof sanitizeBrief).toBe('function')
    expect(typeof renderEmailHtml).toBe('function')
    expect(typeof renderEmailText).toBe('function')
  })

  it('unknown action returns 400 UNKNOWN_ACTION', async () => {
    let statusCode = 0
    let payload = null
    const res = {
      setHeader() {},
      status(c) { statusCode = c; return this },
      json(p) { payload = p; return this },
      end() { return this },
    }
    await handler({ method: 'GET', query: { action: 'no-such-action' }, headers: {} }, res)
    expect(statusCode).toBe(400)
    expect(payload).toEqual({ error: 'UNKNOWN_ACTION' })
  })
})
