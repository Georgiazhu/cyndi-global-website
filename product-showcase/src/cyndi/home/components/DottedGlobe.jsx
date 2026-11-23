import { useEffect, useRef } from 'react'
import { LAND_MASK } from '../landMask.js'

// Cardless-style animated dotted globe, recoloured in Dragon Fire orange.
// Ocean  -> a faint "×"
// Land interior -> a solid orange dot
// Land coastline (edge touching ocean) -> a hollow orange ring
// A gentle radial wave animates size + opacity across the map.
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

    const isLand = (i, j) =>
      i >= 0 && i < rows && j >= 0 && j < cols && LAND_MASK[i][j] === '1'

    // A coastline cell is land with at least one non-land 4-neighbour.
    const isCoast = (i, j) =>
      isLand(i, j) &&
      !(isLand(i - 1, j) && isLand(i + 1, j) && isLand(i, j - 1) && isLand(i, j + 1))

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
      const gapX = w / (cols + 1)
      const gapY = h / (rows + 1)
      const gap = Math.min(gapX, gapY)
      const oceanColor = '#E9A88B'   // faint dragon-fire tint
      const landColor = '#E2501D'    // dragon fire
      const cx = cols / 2
      const cy = rows / 2

      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const x = (j + 1) * gapX
          const y = (i + 1) * gapY
          // radial ripple from map centre
          const dist = Math.hypot((j - cx) * 0.7, (i - cy))
          const wave = reduce ? 0 : Math.sin(dist * 0.42 - t * 0.0015)
          const pulse = 1 + wave * 0.1

          if (!isLand(i, j)) {
            ctx.globalAlpha = 0.3 + (wave + 1) * 0.07
            ctx.strokeStyle = oceanColor
            ctx.lineWidth = Math.max(0.7, gap * 0.075)
            const s = gap * 0.14 * pulse
            ctx.beginPath()
            ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s)
            ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s)
            ctx.stroke()
          } else if (isCoast(i, j)) {
            // coastline: hollow ring, like Cardless
            ctx.globalAlpha = 0.8 + (wave + 1) * 0.1
            ctx.strokeStyle = landColor
            ctx.lineWidth = Math.max(0.9, gap * 0.1)
            const r = gap * 0.3 * pulse
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
          } else {
            // interior: solid filled dot, like Cardless
            ctx.globalAlpha = 0.82 + (wave + 1) * 0.09
            ctx.fillStyle = landColor
            const r = gap * 0.29 * pulse
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
          }
        }
      }
      ctx.globalAlpha = 1
      if (!reduce) raf = requestAnimationFrame(draw)
    }

    resize()
    raf = requestAnimationFrame(draw)
    const onResize = () => {
      resize()
      if (reduce) { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw) }
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}
