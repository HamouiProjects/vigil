import { useState } from 'react'
import './pricing.css'
import ContactForm from '../components/ContactForm.jsx'

function isValidEmail(value) {
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.includes('@')
}

async function submitEmailSignup(email, source) {
  const res = await fetch('/api/jobs?action=email-signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), source }),
  })
  if (res.status === 429) {
    throw new Error('Too many attempts. Try again in a minute.')
  }
  if (!res.ok) {
    throw new Error('Something went wrong. Please try again.')
  }
  const data = await res.json().catch(() => ({}))
  if (!data.ok) {
    throw new Error('Something went wrong. Please try again.')
  }
}

function PlanSignup({ planLabel, source }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState(null)

  async function handleSubmit() {
    if (loading || success) return
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await submitEmailSignup(email, source)
      setSuccess(`You are on the ${planLabel} early access list. We will email you when it opens.`)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return <p className="pricing-feedback pricing-feedback-ok">{success}</p>
  }

  if (!open) {
    return (
      <button
        type="button"
        className="pricing-btn pricing-btn-primary"
        onClick={() => setOpen(true)}
      >
        Request early access
      </button>
    )
  }

  return (
    <div className="pricing-inline-signup">
      <div className="pricing-inline-row">
        <input
          type="email"
          className="pricing-input"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
        />
        <button
          type="button"
          className="pricing-btn pricing-btn-primary"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? 'Sending' : 'Join list'}
        </button>
      </div>
      {error && <p className="pricing-feedback pricing-feedback-err">{error}</p>}
    </div>
  )
}

export default function PricingPage() {
  return (
    <div className="pricing">
      <header className="pricing-chrome">
        <a className="pricing-wordmark" href="/">VIGIL</a>
      </header>
      <main className="pricing-main">
        <div className="pricing-intro">
          <h1 className="pricing-title">Pricing</h1>
          <p className="pricing-lede">
            Vigil is a room-based monitoring workspace. Choose the plan that fits how many rooms
            you need and how you want briefs and alerts delivered.
          </p>
          <p className="pricing-note">Vigil tracks, it does not verify.</p>
        </div>

        <div className="pricing-table-wrap">
          <table className="pricing-table">
            <thead>
              <tr>
                <th scope="col" aria-hidden="true" />
                <th scope="col">
                  <span className="pricing-plan-name">Free</span>
                  <span className="pricing-plan-price">EUR 0</span>
                  <span className="pricing-plan-period">forever</span>
                </th>
                <th scope="col">
                  <span className="pricing-plan-name">Pro</span>
                  <span className="pricing-plan-price">EUR 19</span>
                  <span className="pricing-plan-period">per month</span>
                  <span className="pricing-plan-alt">EUR 190 per year, 2 months free</span>
                </th>
                <th scope="col">
                  <span className="pricing-plan-name">Team</span>
                  <span className="pricing-plan-price">EUR 15</span>
                  <span className="pricing-plan-period">per seat per month</span>
                  <span className="pricing-plan-alt">3-seat minimum</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="pricing-cat-row">
                <th colSpan={4} scope="colgroup" className="pricing-cat-title">Rooms & workspace</th>
              </tr>
              <tr>
                <th scope="row">Rooms</th>
                <td data-plan="Free"><span className="pricing-num">2</span></td>
                <td data-plan="Pro"><span className="pricing-num">6</span></td>
                <td data-plan="Team"><span className="pricing-num">12</span></td>
              </tr>
              <tr>
                <th scope="row">Widget library</th>
                <td data-plan="Free">Full</td>
                <td data-plan="Pro">Full</td>
                <td data-plan="Team">Full</td>
              </tr>
            </tbody>
            <tbody>
              <tr className="pricing-cat-row">
                <th colSpan={4} scope="colgroup" className="pricing-cat-title">Live data</th>
              </tr>
              <tr>
                <th scope="row">Real-time news and prices</th>
                <td data-plan="Free">Included</td>
                <td data-plan="Pro">Included</td>
                <td data-plan="Team">Included</td>
              </tr>
            </tbody>
            <tbody>
              <tr className="pricing-cat-row">
                <th colSpan={4} scope="colgroup" className="pricing-cat-title">Briefs</th>
              </tr>
              <tr>
                <th scope="row">Briefs per month</th>
                <td data-plan="Free"><span className="pricing-num">15</span></td>
                <td data-plan="Pro"><span className="pricing-num">100</span></td>
                <td data-plan="Team"><span className="pricing-num">300</span></td>
              </tr>
              <tr>
                <th scope="row">Scheduled briefs</th>
                <td data-plan="Free"><span className="pricing-muted">None</span></td>
                <td data-plan="Pro">Daily and weekly</td>
                <td data-plan="Team">Daily and weekly</td>
              </tr>
            </tbody>
            <tbody>
              <tr className="pricing-cat-row">
                <th colSpan={4} scope="colgroup" className="pricing-cat-title">Alerts</th>
              </tr>
              <tr>
                <th scope="row">Alerts</th>
                <td data-plan="Free"><span className="pricing-muted">None</span></td>
                <td data-plan="Pro">
                  <span className="pricing-num">10</span> rules, all channels
                </td>
                <td data-plan="Team">
                  <span className="pricing-num">25</span> rules, all channels, plus webhook
                </td>
              </tr>
            </tbody>
            <tbody>
              <tr className="pricing-cat-row">
                <th colSpan={4} scope="colgroup" className="pricing-cat-title">Team</th>
              </tr>
              <tr>
                <th scope="row">White-label</th>
                <td data-plan="Free"><span className="pricing-muted">None</span></td>
                <td data-plan="Pro"><span className="pricing-muted">None</span></td>
                <td data-plan="Team">Included</td>
              </tr>
            </tbody>
            <tbody>
              <tr>
                <th scope="row">Get started</th>
                <td className="pricing-cta-cell" data-plan="Free">
                  <button
                    type="button"
                    className="pricing-btn pricing-btn-primary"
                    onClick={() => { window.location.href = '/' }}
                  >
                    Enter Vigil
                  </button>
                </td>
                <td className="pricing-cta-cell" data-plan="Pro">
                  <PlanSignup planLabel="Pro" source="pricing-pro" />
                </td>
                <td className="pricing-cta-cell" data-plan="Team">
                  <PlanSignup planLabel="Team" source="pricing-team" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="pricing-note">
          Pro and Team are not live yet. Join the early access list and we will email you when
          each plan opens. No payment is taken today.
        </p>

        <ContactForm />

        <nav className="pricing-foot">
          <a href="/?p=about">About</a>
          <a href="/?p=faq">FAQ</a>
          <a href="/?p=impressum">Impressum</a>
          <a href="/?p=privacy">Privacy</a>
          <a href="/?p=terms">Terms</a>
          <a href="/?p=contact">Contact</a>
          <a href="/">Back to Vigil</a>
        </nav>
      </main>
    </div>
  )
}
