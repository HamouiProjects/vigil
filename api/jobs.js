import { applyCors } from './_cors.js'
import { handleEmailBrief } from './_jobs_email.js'
import { handleAlertDispatch, handleAlertPoll } from './_jobs_alerts.js'
import { handleDeleteAccount, handleEmailSignup, handleContact } from './_jobs_account.js'
import { handleSuggestSources } from './_jobs_suggest.js'
import { handleTelegramLinkStart, handleTelegramWebhook } from './_jobs_telegram.js'

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Future actions (scheduled-brief, newsletter, alert-dispatch) route here too.
  // Never add a per-job function.
  const action = req.query.action
  switch (action) {
    case 'email-brief':
      return handleEmailBrief(req, res)
    case 'alert-dispatch':
      return handleAlertDispatch(req, res)
    case 'alert-poll':
      return handleAlertPoll(req, res)
    case 'delete-account':
      return handleDeleteAccount(req, res)
    case 'email-signup':
      return handleEmailSignup(req, res)
    case 'contact':
      return handleContact(req, res)
    case 'suggest-sources':
      return handleSuggestSources(req, res)
    case 'telegram-link-start':
      return handleTelegramLinkStart(req, res)
    case 'telegram-webhook':
      return handleTelegramWebhook(req, res)
    default:
      return res.status(400).json({ error: 'UNKNOWN_ACTION' })
  }
}
