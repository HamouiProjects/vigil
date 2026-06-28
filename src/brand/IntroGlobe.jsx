import { useEffect, useRef } from 'react'
import { LAND } from '../landing/landData.js'

function hexToRgb(value) {
  const hex = value.trim().replace('#', '')
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
  const n = parseInt(full, 16)
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
}

export default function IntroGlobe({ className, centerX = 0.64 }) {
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
      const cx = W * centerX
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
  }, [centerX])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}
