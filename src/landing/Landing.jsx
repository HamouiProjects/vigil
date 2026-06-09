import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { LAND } from './landData.js'
import './landing.css'

const DEMO_URL = '/?r=d4c736d45f18'

const FEATURES = [
  {
    title: 'The room',
    body: 'Your feeds, maps, and markets in one place, arranged how you think. You set it up once and it does not reset. One switch pauses the whole room, and everything stops with it.',
  },
  {
    title: 'The brief',
    body: 'Each morning, or each week if that suits your rhythm, Vigil reads your own room and writes a short summary of what actually changed. Every line links to the source it came from, so you can open the original and judge it yourself.',
  },
  {
    title: 'Alerts',
    body: 'Give Vigil the names, places, and keywords you cannot miss. When something new matching them lands in your room, you hear about it in the app, on your phone, or by email. Teams can send alerts straight into Slack or their own tools.',
  },
  {
    title: 'The newsletter',
    body: 'Your brief, in your inbox. The version you skim on your phone before a meeting, or when you are moving too fast to sit in front of the room.',
  },
]

const AUDIENCE = [
  { lead: 'Newsrooms and reporters', rest: ' on a beat' },
  { lead: 'NGOs and field teams', rest: ' keeping people safe' },
  { lead: 'Foreign policy and risk analysts', rest: '' },
]

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '€0',
    per: 'forever',
    recommended: false,
    features: ['1 room', 'Data on a 24 hour delay', '12 widgets', 'Weekly community newsletter', 'No brief, no alerts'],
  },
  {
    id: 'individual',
    name: 'Individual',
    price: '€8.99',
    per: 'a month, or €89 a year',
    recommended: true,
    features: ['3 rooms', 'Real time data', 'Daily or weekly brief', 'Email and push alerts', 'Newsletter'],
  },
  {
    id: 'team',
    name: 'Team',
    price: '€19',
    per: 'per seat a month, 3 seat minimum',
    recommended: false,
    features: ['10 shared rooms', 'Real time data', 'Brief shared across the team', 'Email, push, and Slack alerts', 'Newsletter'],
  },
]

// Honesty body kept as a string so the lone apostrophe in "room's" stays out of JSX text.
const HONESTY_BODY =
  " Every brief is a summary of your room's own sources, cited so you can check the original. It is built for the people who watch the world for a living and cannot expense a fifty thousand dollar terminal."

function VigilWord() {
  return (
    <>
      V<span className="lp-gi">I</span>G<span className="lp-gi">I</span>L
    </>
  )
}

// Resolve a CSS hex color token (read from getComputedStyle) to an "r,g,b" channel string for rgba().
function hexToRgb(value) {
  const hex = value.trim().replace('#', '')
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
  const n = parseInt(full, 16)
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
}

function isValidEmail(value) {
  const trimmed = value.trim()
  return trimmed.length >= 3 && trimmed.length <= 254 && trimmed.indexOf('@') > 0
}

export default function Landing() {
  const [entered, setEntered] = useState(false)
  const [introGone, setIntroGone] = useState(false)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')

  const canvasRef = useRef(null)
  const rafRef = useRef(0)
  const enteredRef = useRef(false)

  // Globe intro animation. Stops once entered; cancels its frame on unmount.
  useEffect(() => {
    if (entered) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Read theme tokens once so the globe follows the active theme (no hardcoded hex).
    const root = getComputedStyle(document.documentElement)
    const brand = hexToRgb(root.getPropertyValue('--color-brand'))
    const success = hexToRgb(root.getPropertyValue('--color-success'))
    const neutral = hexToRgb(root.getPropertyValue('--color-text-secondary'))

    // Flat LAND array -> [x, y, z] points on the unit sphere.
    const points = []
    for (let i = 0; i < LAND.length; i += 3) points.push([LAND[i], LAND[i + 1], LAND[i + 2]])

    // 16 land points that flash with teal/green activity.
    const active = []
    for (let k = 0; k < 16; k++) active.push({ i: (Math.random() * points.length) | 0, ph: Math.random() * 6.283 })

    const DPR = Math.min(window.devicePixelRatio || 1, 2)
    const SPEED = 0.1
    const TILT = 0.41
    const ct = Math.cos(TILT)
    const st = Math.sin(TILT)
    let ang = 2.1
    let last = performance.now()

    function sizeCanvas() {
      const size = Math.min(window.innerWidth * 0.78, window.innerHeight * 0.74, 600)
      canvas.style.width = size + 'px'
      canvas.style.height = size + 'px'
      canvas.width = Math.round(size * DPR)
      canvas.height = Math.round(size * DPR)
      if (reduce) draw(performance.now())
    }

    function draw(now) {
      const W = canvas.width
      const H = canvas.height
      const cx = W / 2
      const cy = H / 2
      const R = W * 0.43
      const ca = Math.cos(ang)
      const sa = Math.sin(ang)
      ctx.clearRect(0, 0, W, H)

      // Halo ring.
      ctx.beginPath()
      ctx.arc(cx, cy, R * 1.02, 0, 6.2832)
      ctx.strokeStyle = `rgba(${brand},0.10)`
      ctx.lineWidth = 1.4 * DPR
      ctx.stroke()

      // Land dots, front/back depth shading.
      for (let i = 0; i < points.length; i++) {
        const p = points[i]
        const x = p[0] * ca - p[2] * sa
        const z = p[0] * sa + p[2] * ca
        const y = p[1]
        const y2 = y * ct - z * st
        const z2 = y * st + z * ct
        const sx = cx + x * R
        const sy = cy - y2 * R
        const depth = (z2 + 1) / 2
        if (z2 > 0) {
          ctx.beginPath()
          ctx.arc(sx, sy, (0.8 + depth * 1.0) * DPR, 0, 6.2832)
          ctx.fillStyle = `rgba(${neutral},${(0.28 + depth * 0.5).toFixed(3)})`
          ctx.fill()
        } else {
          ctx.beginPath()
          ctx.arc(sx, sy, 0.7 * DPR, 0, 6.2832)
          ctx.fillStyle = `rgba(${neutral},${(0.05 + depth * 0.06).toFixed(3)})`
          ctx.fill()
        }
      }

      // Teal / green activity flashes on the lit hemisphere.
      for (let j = 0; j < active.length; j++) {
        const p = points[active[j].i]
        if (!p) continue
        const x = p[0] * ca - p[2] * sa
        const z = p[0] * sa + p[2] * ca
        const y = p[1]
        const y2 = y * ct - z * st
        const z2 = y * st + z * ct
        if (z2 <= 0) continue
        const sx = cx + x * R
        const sy = cy - y2 * R
        const pulse = reduce ? 0.7 : 0.5 + 0.5 * Math.sin(now * 0.0035 + active[j].ph)
        const col = j % 3 === 0 ? success : brand
        ctx.beginPath()
        ctx.arc(sx, sy, (2 + pulse * 2.4) * DPR, 0, 6.2832)
        ctx.fillStyle = `rgba(${col},${(0.4 + pulse * 0.55).toFixed(3)})`
        ctx.fill()
        ctx.beginPath()
        ctx.arc(sx, sy, (5 + pulse * 7) * DPR, 0, 6.2832)
        ctx.strokeStyle = `rgba(${col},${(0.08 + pulse * 0.16).toFixed(3)})`
        ctx.lineWidth = 1 * DPR
        ctx.stroke()
      }
    }

    function frame(now) {
      const dt = (now - last) / 1000
      last = now
      ang += SPEED * dt
      draw(now)
      rafRef.current = requestAnimationFrame(frame)
    }

    sizeCanvas()
    window.addEventListener('resize', sizeCanvas)

    if (reduce) {
      draw(performance.now())
    } else {
      rafRef.current = requestAnimationFrame(frame)
    }

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', sizeCanvas)
    }
  }, [entered])

  function handleEnter() {
    if (enteredRef.current) return
    enteredRef.current = true
    setEntered(true)
    // Let the fade play, then unmount the intro entirely.
    window.setTimeout(() => setIntroGone(true), 820)
  }

  function onIntroKey(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleEnter()
    }
  }

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
    setEmail('')
  }

  return (
    <div className="lp">
      {!introGone && (
        <div
          className={`lp-intro${entered ? ' is-gone' : ''}`}
          role="button"
          tabIndex={0}
          aria-label="Enter Vigil"
          onClick={handleEnter}
          onKeyDown={onIntroKey}
        >
          <canvas ref={canvasRef} className="lp-globe" aria-hidden="true" />
          <div className="lp-intro-wm">
            <VigilWord />
          </div>
          <div className="lp-intro-foot">
            <div className="lp-intro-chip">
              <span className="lp-dot" />
              Watching the world
            </div>
            <div className="lp-intro-prompt">Click anywhere to enter</div>
          </div>
        </div>
      )}

      <div className={`lp-site${entered ? ' is-in' : ''}`}>
        <div className="lp-topbar">
          <span className="lp-wm">
            <VigilWord />
          </span>
          <span className="lp-chip">
            <span className="lp-dot" />
            Live
          </span>
        </div>

        <div className="lp-wrap">
          <section className="lp-hero">
            <div className="lp-wordmark-big">
              <VigilWord />
            </div>
            <h1 className="lp-headline">The world on one screen. Not twenty tabs.</h1>
            <div className="lp-lede">
              <p>
                Right now you probably have a wire feed, two news sites, a markets ticker, a map, and three
                social accounts open in separate tabs. By the time you have checked them all, the first one has
                changed and you start over. And that is only one topic you are following.
              </p>
              <p>
                Vigil puts all of it on one screen. You build the room once and it keeps running. Step away, hit
                pause, and it holds still, so you come back to <strong>where you left off</strong> instead of
                reopening everything. And no more doom scrolling social media hoping to catch the one update that
                matters.
              </p>
              <p>
                Then Vigil does the watching for you. It briefs you each morning or week on what changed, alerts
                you the moment something you are tracking moves, and leaves a short read in your inbox for the
                days you cannot sit in front of it.
              </p>
            </div>

            <div className="lp-cta">
              {status === 'success' ? (
                <div className="lp-ok" role="status">
                  You are on the list. We will be in touch.
                </div>
              ) : (
                <div className="lp-cta-row">
                  <input
                    className="lp-email"
                    type="email"
                    placeholder="you@example.com"
                    aria-label="Email address"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSignup()}
                    disabled={status === 'submitting'}
                  />
                  <button
                    type="button"
                    className="lp-btn"
                    onClick={handleSignup}
                    disabled={status === 'submitting'}
                  >
                    {status === 'submitting' ? '…' : 'Request early access'}
                  </button>
                </div>
              )}
              {status === 'error' && message && (
                <p className="lp-cta-error" role="alert">
                  {message}
                </p>
              )}
              <p className="lp-micro">
                The brief, alerts, and newsletter are still rolling out. Leave your email and we will get you in
                as we open it up.
              </p>
            </div>

            <a className="lp-demo" href={DEMO_URL}>
              Step into a live room →
            </a>
          </section>

          <section className="lp-section">
            <div className="lp-eyebrow">What you get</div>
            <div className="lp-features">
              {FEATURES.map((feat) => (
                <div key={feat.title} className="lp-feat">
                  <h3>{feat.title}</h3>
                  <p>{feat.body}</p>
                </div>
              ))}
            </div>
            <p className="lp-honesty">
              <b>Vigil tracks. It does not verify.</b>
              {HONESTY_BODY}
            </p>
          </section>

          <section className="lp-section">
            <div className="lp-eyebrow">Who it is for</div>
            <div className="lp-audience">
              {AUDIENCE.map((a) => (
                <span key={a.lead}>
                  <b>{a.lead}</b>
                  {a.rest}
                </span>
              ))}
            </div>
          </section>

          <section className="lp-section">
            <div className="lp-eyebrow">Pricing</div>
            <div className="lp-plans">
              {PLANS.map((plan) => (
                <article key={plan.id} className={`lp-plan${plan.recommended ? ' is-rec' : ''}`}>
                  {plan.recommended && <span className="lp-badge">Recommended</span>}
                  <div className="lp-pname">{plan.name}</div>
                  <div className="lp-pprice">{plan.price}</div>
                  <div className="lp-pper">{plan.per}</div>
                  <ul className="lp-pf">
                    {plan.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        </div>

        <footer className="lp-footer">
          <span className="lp-fnote">Vigil tracks, it does not verify.</span>
          <a className="lp-flink" href={DEMO_URL}>
            Step into a live room →
          </a>
        </footer>
      </div>
    </div>
  )
}
