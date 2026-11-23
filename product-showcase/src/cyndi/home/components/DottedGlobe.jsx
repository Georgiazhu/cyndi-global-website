import { useEffect, useRef } from 'react'
import { LAND_MASK } from '../landMask.js'

// Cardless-style animated dotted world map.
// Ocean cells render as a light "×", land cells as a darker mix of
// hollow rings / solid dots / small squares, with a gentle wave ripple.
export default function DottedGlobe({ className = '' }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const rows = LAND_MASK.length
    const cols = LAND_MASK[0].length
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    let raf = 0
    let w = 0
    let h = 0
    let dpr = 1

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = Math.max(1, rect.width)
      h = Math.max(1, rect.height)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const draw = (t) => {
      ctx.clearRect(0, 0, w, h)
      // grid spacing in css px; leave a little breathing room
      const gapX = w / (cols + 1)
      const gapY = h / (rows + 1)
      const base = Math.min(gapX, gapY)
      const rOcean = Math.max(0.7, base * 0.13)
      const rLand = Math.max(1.0, base * 0.26)
      const oceanColor = '#E2A88F'   // light dragon-fire tint
      const landColor = '#E2501D'    // dragon fire

      for (let i = 0; i < rows; i++) {
        const line = LAND_MASK[i]
        for (let j = 0; j < cols; j++) {
          const land = line[j] === '1'
          const x = (j + 1) * gapX
          const y = (i + 1) * gapY
          // radial ripple from map centre + small positional phase
          const cx = cols / 2
          const cy = rows / 2
          const dist = Math.hypot((j - cx) * 0.7, (i - cy))
          const wave = reduce ? 0 : Math.sin(dist * 0.45 - t * 0.0016)
          const pulse = 1 + wave * 0.12

          if (!land) {
            ctx.globalAlpha = 0.32 + (wave + 1) * 0.06
            ctx.strokeStyle = oceanColor
            ctx.lineWidth = Math.max(0.7, base * 0.09)
            const s = rOcean * 0.9 * pulse
            ctx.beginPath()
            ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s)
            ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s)
            ctx.stroke()
          } else {
            // land: cycle between solid dot, hollow ring and tiny square
            ctx.globalAlpha = 0.55 + (wave + 1) * 0.2
            ctx.fillStyle = landColor
            ctx.strokeStyle = landColor
            const phase = (i * 7 + j * 13) % 9
            const rr = rLand * pulse
            if (phase < 3) {
              ctx.fillRect(x - rr * 0.8, y - rr * 0.8, rr * 1.6, rr * 1.6)
            } else if (phase < 6) {
              ctx.beginPath(); ctx.arc(x, y, rr * 0.9, 0, Math.PI * 2); ctx.fill()
            } else {
              ctx.lineWidth = Math.max(0.9, base * 0.11)
              ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke()
            }
          }
        }
      }
      ctx.globalAlpha = 1
      if (!reduce) raf = requestAnimationFrame(draw)
    }

    resize()
    raf = requestAnimationFrame(draw)
    const onResize = () => { resize(); if (reduce) cancelAnimationFrame(raf), raf = requestAnimationFrame(draw) }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}
