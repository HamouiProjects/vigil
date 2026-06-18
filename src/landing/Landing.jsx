import { useEffect, useRef } from 'react'
import { track } from '@vercel/analytics'
import { LAND } from './landData.js'
import GlobeGlyph from '../brand/GlobeGlyph.jsx'
import './landing.css'

const DEMO_URL = '/?r=91dd31b84220'

const CARDS = [
  {
    title: 'The room',
    body: 'The room is one screen you arrange yourself. Drop in the feeds, the map, the markets, and the social accounts you actually watch, lay them out how your eye moves, and leave it running. Hit pause when you step away and it freezes exactly there, so you pick up where you stopped.',
  },
  {
    title: 'The brief',
    body: 'When you want a read on what changed, Vigil reads your own room and writes a short, plain summary on the go. Every line links to the source it came from, so you can open the original and judge it for yourself. It summarizes what your sources said. It never decides for you.',
  },
  {
    title: 'The alerts',
    body: 'Some things you cannot afford to miss. Name the places, people, and keywords that matter, and when something new matching them lands in your room, Vigil flags it in its daily digest, in the app, by email, or straight into Slack for teams. A quiet, cited heads up.',
  },
]

function hexToRgb(value) {
  const hex = value.trim().replace('#', '')
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
  const n = parseInt(full, 16)
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
}

export default function Landing() {
  const canvasRef = useRef(null)
  const rafRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const root = getComputedStyle(document.documentElement)
    const brand = hexToRgb(root.getPropertyValue('--color-brand'))
    const success = hexToRgb(root.getPropertyValue('--color-success'))
    const neutral = hexToRgb(root.getPropertyValue('--color-text-secondary'))

    const points = []
    for (let i = 0; i < LAND.length; i += 3) points.push([LAND[i], LAND[i + 1], LAND[i + 2]])

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
      const parent = canvas.parentElement
      if (!parent) return
      const rect = parent.getBoundingClientRect()
      canvas.width = Math.round(rect.width * DPR)
      canvas.height = Math.round(rect.height * DPR)
      canvas.style.width = rect.width + 'px'
      canvas.style.height = rect.height + 'px'
      if (reduce) draw(performance.now())
    }

    function draw(now) {
      const W = canvas.width
      const H = canvas.height
      const cx = W * 0.64
      const cy = H * 0.5
      const R = Math.min(W, H) * 0.46
      const ca = Math.cos(ang)
      const sa = Math.sin(ang)
      ctx.clearRect(0, 0, W, H)

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
        const base = 0.2 + depth * 0.58
        const rad = (1.1 + depth * 1.6) * DPR
        ctx.beginPath()
        ctx.arc(sx, sy, rad, 0, 6.2832)
        ctx.fillStyle = `rgba(${neutral},${(base * 0.95).toFixed(3)})`
        ctx.fill()
      }

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
  }, [])

  function handleEnter() {
    track('demo_click')
    window.location.href = DEMO_URL
  }

  function onHeroKey(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleEnter()
    }
  }

  function onPromptKey(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      handleEnter()
    }
  }

  return (
    <div className="lp">
      <header className="lp-chrome">
        <div className="lp-wordmark" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <GlobeGlyph size={24} />
          VIGIL
        </div>
        <div className="lp-live">
          <span className="lp-livedot" aria-hidden="true" />
          LIVE
        </div>
      </header>

      <section
        className="lp-hero"
        role="button"
        tabIndex={0}
        aria-label="Enter Vigil live room"
        onClick={handleEnter}
        onKeyDown={onHeroKey}
      >
        <canvas ref={canvasRef} className="lp-globe" aria-hidden="true" />
        <div className="lp-veil" aria-hidden="true" />
        <div className="lp-hero-inner">
          <div className="lp-hgroup">
            <span className="lp-eyebrow">EARLY ACCESS</span>
            <h1 className="lp-headline">
              The world on one screen.
              <br />
              <span className="lp-headline-accent">Not twenty tabs.</span>
            </h1>
            <p className="lp-sub">
              Right now you probably have a wire feed, two news sites, a markets ticker, a map, and three
              social accounts open in separate tabs. By the time you have checked them all, the first one has
              changed and you start over. And that is only one topic you are following.
            </p>
            <p className="lp-sub">
              Vigil puts all of it on one screen. You build the room once and it keeps running. Step away, hit
              pause, and it holds still, so you come back to <strong>where you left off</strong> instead of
              reopening everything. And no more doom scrolling social media hoping to catch the one update that
              matters.
            </p>
            <p className="lp-sub">
              Then Vigil does the watching with you. Ask for a brief whenever you need one, or have it arrive on a schedule: a short, cited
              summary of what your own room is saying, sent to your screen or your inbox. Set alerts on the
              places, people, and keywords you cannot afford to miss, and Vigil flags what landed, in the app,
              by email, or in Slack.
            </p>
          </div>
        </div>
      </section>

      <section className="lp-content">
        <div className="lp-lead">WHAT IT DOES</div>
        <div className="lp-cards">
          {CARDS.map((card) => (
            <article key={card.title} className="lp-card">
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </article>
          ))}
        </div>
        <div
          className="lp-enter-prompt"
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation()
            handleEnter()
          }}
          onKeyDown={onPromptKey}
        >
          <span className="lp-prompt-dot" aria-hidden="true" />
          click anywhere to enter
        </div>
        <div className="lp-closing">
          <p>
            Built for those who have to stay vigilant. The analysts, the field teams, the newsrooms, anyone
            whose job is to stay informed and notice things before everyone else does. You already know the cost
            of the work: a dozen apps that never agree, notifications firing all over the place, and an evening
            lost to scrolling a feed in case the one post that matters slips past. Vigil ends that.
          </p>
          <p>
            Picture a single screen that holds your whole watch, still running while you are waiting for your
            plane or the train, on a weak signal, or away from your desk. You open it, see what moved, ask for a
            brief if you need one, and close it again. Pause it or pause any parts that you don't look at.
          </p>
        </div>
      </section>

      <footer className="lp-footer" onClick={(e) => e.stopPropagation()}>
        <div className="lp-foot-notes">
          <span className="lp-foot-note">Vigil tracks, it does not verify.</span>
          <span className="lp-foot-data">
            Your room and account data are stored in the EU. Delete your account and everything with it at any
            time, in the app.
          </span>
        </div>
        <nav className="lp-foot-links">
          <a href="/?p=about">About</a>
          <a href="/?p=faq">FAQ</a>
          <a href="/?p=impressum">Impressum</a>
          <a href="/?p=privacy">Privacy</a>
          <a href="/?p=terms">Terms</a>
        </nav>
        <span className="lp-foot-meta">© {new Date().getFullYear()} Vigil</span>
      </footer>
    </div>
  )
}
