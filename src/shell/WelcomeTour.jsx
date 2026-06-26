import { useEffect, useRef, useState, useCallback } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap.js'

const PHASE_WELCOME = 0
const PHASE_NEWROOM = 1
const PHASE_ADDWIDGET = 2
const PHASE_SUGGEST = 3
const PHASE_BRIEF = 4
const PHASE_ALARMS = 5
const PHASE_SHARE = 6
const PHASE_UNLOCK = 7

// Walk steps in setup-workflow order: make a room, fill it, then act on it.
const WALK_STEPS = [
  { phase: PHASE_NEWROOM, selector: '[data-tour="newroom"]', title: 'Your rooms', body: 'You are in a ready-made room. Spin up another any time with +.' },
  { phase: PHASE_ADDWIDGET, selector: '[data-tour="addwidget"]', title: 'Add a widget', body: 'Drop in feeds, charts, maps, and more to build out a room.' },
  { phase: PHASE_SUGGEST, selector: '[data-tour="suggest"]', title: 'Suggest sources', body: 'Give a topic and a region, get real sources to furnish the room.' },
  { phase: PHASE_BRIEF, selector: '[data-tour="brief"]', title: 'Room brief', body: 'One-click brief over the whole room, cited to its own sources.' },
  { phase: PHASE_ALARMS, selector: '[data-tour="alarms"]', title: 'Alarms', body: 'Set alarms on what you track. Available on paid plans.' },
  { phase: PHASE_SHARE, selector: '[data-tour="share"]', title: 'Share', body: 'Hand a colleague a link to this room.' },
]

const UNLOCK_FEATURES = [
  'Alerts',
  'Scheduled and cadence briefs',
  'More rooms and widgets',
  'Team seats',
]

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function isTargetVisible(el) {
  if (!el) return false
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function computeTooltipPosition(targetRect, tooltipWidth, tooltipHeight) {
  const gap = 10
  const pad = 12
  const vw = window.innerWidth
  const vh = window.innerHeight

  let placement = 'below'
  let top = targetRect.bottom + gap
  let left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2

  left = Math.max(pad, Math.min(left, vw - tooltipWidth - pad))

  if (top + tooltipHeight > vh - pad) {
    top = targetRect.top - gap - tooltipHeight
    placement = 'above'
  }

  if (top < pad) {
    top = pad
  }

  return { top, left, placement }
}

function caretOffset(targetRect, tooltipLeft, tooltipWidth) {
  const center = targetRect.left + targetRect.width / 2 - tooltipLeft
  return Math.max(14, Math.min(center, tooltipWidth - 14))
}

function TourDialog({ className, style, labelId, descId, primaryRef, dialogRef, children }) {
  const containerRef = useRef(null)

  const setRef = (node) => {
    containerRef.current = node
    if (dialogRef) dialogRef.current = node
  }

  useFocusTrap(containerRef)

  useEffect(() => {
    primaryRef.current?.focus()
  }, [primaryRef])

  return (
    <div
      ref={setRef}
      className={className}
      style={style}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelId}
      aria-describedby={descId}
    >
      {children}
    </div>
  )
}

function WelcomeStep({ motionClass, onStartTour, onDismiss }) {
  const primaryRef = useRef(null)

  return (
    <div className={`welcome-overlay${motionClass}`}>
      <TourDialog
        className="welcome-card"
        labelId="welcome-tour-title"
        descId="welcome-tour-desc"
        primaryRef={primaryRef}
      >
        <h2 id="welcome-tour-title" className="welcome-card-heading">
          Welcome to your risk room
        </h2>
        <p id="welcome-tour-desc" className="welcome-card-body">
          This is a live risk room. Every tile pulls from a real source.
        </p>
        <p className="welcome-card-body">
          Skim the feed, open a brief, or tune sources to match what you track.
        </p>
        <div className="welcome-card-actions">
          <button
            ref={primaryRef}
            type="button"
            className="nav-add-btn btn-primary welcome-card-btn"
            onClick={onStartTour}
          >
            Take the quick tour
          </button>
          <button
            type="button"
            className="nav-add-btn btn-secondary welcome-card-btn"
            onClick={onDismiss}
          >
            Explore on my own
          </button>
        </div>
        <button type="button" className="tour-skip" onClick={onDismiss}>
          Skip
        </button>
      </TourDialog>
    </div>
  )
}

function AnchoredTooltipStep({
  motionClass,
  selector,
  labelId,
  descId,
  title,
  body,
  primaryLabel,
  onAdvance,
  onEnd,
}) {
  const primaryRef = useRef(null)
  const dialogRef = useRef(null)
  const skippedRef = useRef(false)
  const [anchorRect, setAnchorRect] = useState(null)
  const [tooltipPlacement, setTooltipPlacement] = useState('below')
  const [tooltipPos, setTooltipPos] = useState(null)
  const [caretX, setCaretX] = useState(24)

  const measure = useCallback(() => {
    const el = document.querySelector(selector)
    if (!isTargetVisible(el)) {
      setAnchorRect(null)
      if (!skippedRef.current) {
        skippedRef.current = true
        onAdvance()
      }
      return
    }

    const rect = el.getBoundingClientRect()
    setAnchorRect(rect)

    const tip = dialogRef.current
    if (!tip) return

    const tipRect = tip.getBoundingClientRect()
    const w = tipRect.width || 280
    const h = tipRect.height || 120
    const pos = computeTooltipPosition(rect, w, h)
    setTooltipPos({ top: pos.top, left: pos.left })
    setTooltipPlacement(pos.placement)
    setCaretX(caretOffset(rect, pos.left, w))
  }, [selector, onAdvance])

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      measure()
      requestAnimationFrame(measure)
    })

    function onLayout() {
      measure()
    }

    window.addEventListener('resize', onLayout)
    window.addEventListener('scroll', onLayout, true)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onLayout)
      window.removeEventListener('scroll', onLayout, true)
    }
  }, [measure])

  if (!anchorRect) return null

  const initialPos = computeTooltipPosition(anchorRect, 280, 120)
  const pos = tooltipPos ?? { top: initialPos.top, left: initialPos.left }
  const placement = tooltipPos ? tooltipPlacement : initialPos.placement

  return (
    <TourDialog
      className={`tour-tooltip tour-tooltip--${placement}${motionClass}`}
      style={{ top: pos.top, left: pos.left, '--tour-caret-x': `${caretX}px` }}
      labelId={labelId}
      descId={descId}
      primaryRef={primaryRef}
      dialogRef={dialogRef}
    >
      <div className="tour-tooltip-inner">
        <h3 id={labelId} className="tour-tooltip-heading">
          {title}
        </h3>
        <p id={descId} className="tour-tooltip-body">
          {body}
        </p>
        <div className="tour-actions">
          <button
            ref={primaryRef}
            type="button"
            className="nav-add-btn btn-primary"
            onClick={onAdvance}
          >
            {primaryLabel}
          </button>
          <button type="button" className="tour-skip" onClick={onEnd}>
            Skip
          </button>
        </div>
      </div>
    </TourDialog>
  )
}

function UnlockStep({ motionClass, onUpgrade, onDismiss }) {
  const primaryRef = useRef(null)

  return (
    <div className={`welcome-overlay${motionClass}`}>
      <TourDialog
        className="welcome-card welcome-unlock-card"
        labelId="welcome-unlock-title"
        descId="welcome-unlock-desc"
        primaryRef={primaryRef}
      >
        <span className="welcome-unlock-label">Preview of paid plans</span>
        <h2 id="welcome-unlock-title" className="welcome-card-heading">
          More when you need it
        </h2>
        <p id="welcome-unlock-desc" className="welcome-unlock-note">
          These features are not active on your current plan.
        </p>
        <ul className="welcome-unlock-list">
          {UNLOCK_FEATURES.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <div className="welcome-unlock-actions">
          <button
            ref={primaryRef}
            type="button"
            className="nav-add-btn btn-primary"
            onClick={onUpgrade}
          >
            Get early access
          </button>
          <button type="button" className="nav-add-btn btn-secondary" onClick={onDismiss}>
            Done
          </button>
        </div>
        <button type="button" className="tour-skip" onClick={onDismiss}>
          Skip
        </button>
      </TourDialog>
    </div>
  )
}

export default function WelcomeTour({
  open,
  onClose,
  onDone,
  onUpgrade,
}) {
  const [phase, setPhase] = useState(PHASE_WELCOME)
  const reducedMotion = prefersReducedMotion()

  const dismiss = useCallback(() => {
    onDone()
    onClose()
  }, [onDone, onClose])

  useEffect(() => {
    if (open) setPhase(PHASE_WELCOME)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    function onKey(e) {
      if (e.key === 'Escape') dismiss()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, dismiss])

  if (!open) return null

  const motionClass = reducedMotion ? ' welcome-tour--instant' : ''

  if (phase === PHASE_WELCOME) {
    return (
      <WelcomeStep
        motionClass={motionClass}
        onStartTour={() => setPhase(PHASE_NEWROOM)}
        onDismiss={dismiss}
      />
    )
  }

  const walk = WALK_STEPS.find((s) => s.phase === phase)
  if (walk) {
    const isLast = walk.phase === PHASE_SHARE
    const advance = () => setPhase(isLast ? PHASE_UNLOCK : phase + 1)
    return (
      <AnchoredTooltipStep
        motionClass={motionClass}
        selector={walk.selector}
        labelId={`tour-${walk.phase}-title`}
        descId={`tour-${walk.phase}-desc`}
        title={walk.title}
        body={walk.body}
        primaryLabel={isLast ? 'Finish' : 'Next'}
        onAdvance={advance}
        onEnd={dismiss}
      />
    )
  }

  return (
    <UnlockStep
      motionClass={motionClass}
      onUpgrade={onUpgrade}
      onDismiss={dismiss}
    />
  )
}
