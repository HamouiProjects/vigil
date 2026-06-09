import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import './landing.css'

const DEMO_URL = '/?r=d4c736d45f18'

const AUDIENCES = [
  'Journalists & newsrooms',
  'NGOs & duty-of-care teams',
  'Foreign-policy & risk analysts',
]

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '€0',
    period: null,
    features: [
      '1 room',
      '~24h delayed data',
      '12 widgets',
      'Weekly community newsletter',
      'No brief, no alerts',
    ],
    recommended: false,
  },
  {
    id: 'individual',
    name: 'Individual',
    price: '€8.99/mo',
    period: 'or €89/yr',
    features: [
      '3 rooms',
      'Real-time data',
      'Daily brief',
      'Email + push alerts',
      'Newsletter',
    ],
    recommended: true,
  },
  {
    id: 'team',
    name: 'Team/Org',
    price: '€19/seat/mo',
    period: 'or €180/seat/yr (3-seat minimum)',
    features: [
      '10 shared rooms',
      'Real-time',
      'Team-shared daily brief',
      'Email + push + webhook alerts',
      'Newsletter',
    ],
    recommended: false,
  },
]

const HONESTY =
  'Vigil tracks, it does not verify. Every brief is a cited summary of your room\'s own sources.'

function isValidEmail(value) {
  const trimmed = value.trim()
  return trimmed.length >= 3 && trimmed.length <= 254 && trimmed.includes('@') && trimmed.indexOf('@') > 0
}

export default function Landing() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')

  async function handleSignup() {
    if (status === 'submitting') return

    if (!isValidEmail(email)) {
      setStatus('error')
      setMessage('Please enter a valid email address.')
      return
    }

    setStatus('submitting')
    setMessage('')

    const { error } = await supabase
      .from('email_signups')
      .insert({ email: email.trim(), source: 'landing' })

    if (error) {
      setStatus('error')
      setMessage('Something went wrong — please try again.')
      return
    }

    setStatus('success')
    setMessage('You\'re on the list.')
    setEmail('')
  }

  return (
    <div className="landing">
      <main className="landing-main">
        <section className="landing-hero">
          <p className="vigil-wordmark landing-eyebrow">VIGIL</p>
          <h1 className="landing-headline">
            A reliable risk picture you didn&apos;t have to build — or babysit.
          </h1>
          <p className="landing-subhead">
            Vigil curates a live operations room for your beat or region — the feeds, the map,
            the markets — then briefs you on what changed. Affordable operational intelligence
            for the people the enterprise tools price out.
          </p>
          <p className="landing-honesty">{HONESTY}</p>

          <div className="landing-cta-block">
            {status === 'success' ? (
              <p className="landing-cta-success" role="status">{message}</p>
            ) : (
              <>
                <div className="landing-cta-row">
                  <input
                    type="email"
                    className="landing-email-input"
                    placeholder="you@newsroom.org"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSignup()}
                    disabled={status === 'submitting'}
                    autoComplete="email"
                    aria-label="Email address"
                  />
                  <button
                    type="button"
                    className="nav-add-btn btn-primary landing-cta-btn"
                    onClick={handleSignup}
                    disabled={status === 'submitting'}
                  >
                    {status === 'submitting' ? 'Submitting…' : 'Request early access'}
                  </button>
                </div>
                {status === 'error' && message && (
                  <p className="landing-cta-error" role="alert">{message}</p>
                )}
              </>
            )}
            <p className="landing-cta-microcopy">
              The brief, alerts, and newsletter are rolling out now — leave your email and
              we&apos;ll get you in.
            </p>
          </div>

          <a href={DEMO_URL} className="nav-add-btn btn-secondary landing-demo-link">
            See a live demo room
          </a>
        </section>

        <section className="landing-audience" aria-label="Who it's for">
          <ul className="landing-audience-list">
            {AUDIENCES.map((item, i) => (
              <li key={item} className="landing-audience-item">
                {i > 0 && <span className="landing-audience-sep" aria-hidden="true">·</span>}
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="landing-pricing" aria-labelledby="pricing-heading">
          <h2 id="pricing-heading" className="landing-pricing-heading">Pricing</h2>
          <div className="landing-pricing-grid">
            {PLANS.map((plan) => (
              <article
                key={plan.id}
                className={`landing-plan${plan.recommended ? ' landing-plan--recommended' : ''}`}
              >
                {plan.recommended && (
                  <span className="landing-plan-badge">Recommended</span>
                )}
                <h3 className="landing-plan-name">{plan.name}</h3>
                <p className="landing-plan-price">{plan.price}</p>
                {plan.period && <p className="landing-plan-period">{plan.period}</p>}
                <ul className="landing-plan-features">
                  {plan.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <p className="landing-pricing-note">
            Billed annually by default. Enterprise risk tools run €50k–€500k/yr. Vigil starts at €89.
          </p>
        </section>
      </main>

      <footer className="landing-footer">
        <p className="landing-footer-honesty">{HONESTY}</p>
        <a href={DEMO_URL} className="landing-footer-link">See a live demo room</a>
      </footer>
    </div>
  )
}
