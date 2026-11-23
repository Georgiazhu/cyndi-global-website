import { useEffect, useRef } from 'react'
import { LAND_MASK } from '../landMask.js'

const ROWS = LAND_MASK.length
const COLS = LAND_MASK[0].length

// Sample the equirectangular land mask at a lat/lon (degrees).
function isLand(latDeg, lonDeg) {
  const i = Math.round((90 - latDeg) / 180 * (ROWS - 1))
  const lon = ((lonDeg + 180) % 360 + 360) % 360 - 180
  const j = Math.round((lon + 180) / 360 * (COLS - 1))
  const row = LAND_MASK[Math.max(0, Math.min(ROWS - 1, i))]
  return row && row[Math.max(0, Math.min(COLS - 1, j))] === '1'
}

// Cardless hero composition, recoloured in Dragon Fire orange:
//  - a field of faint "×" cells (ocean / background lattice)
//  - an L-shaped guide drawn with hollow rings
//  - a circular dotted globe (orthographic projection of the land mask)
//    with slow rotation + a gentle breathing pulse.
export default function DottedGlobe({ className = '' }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
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
      const gap = Math.max(12, Math.min(19, w / 56))
      const cols = Math.ceil(w / gap)
      const rows = Math.ceil(h / gap)
      const px = (j) => (j + 0.5) * gap
      const py = (i) => (i + 0.5) * gap
      const ocean = '#E9A88B'
      const fire = '#E2501D'
      const wave = reduce ? 0 : Math.sin(t * 0.0012)

      // 1) faint × lattice over the whole area
      ctx.strokeStyle = ocean
      ctx.lineWidth = Math.max(0.6, gap * 0.055)
      const cross = (x, y, s, alpha) => {
        ctx.globalAlpha = alpha
        ctx.beginPath()
        ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s)
        ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s)
        ctx.stroke()
      }
      const s = gap * 0.13
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          cross(px(j), py(i), s, 0.26 + (wave + 1) * 0.035)
        }
      }

      // 2) L-shaped guide of hollow rings (cardless signature)
      const elbowCol = Math.round(cols * 0.06)
      const elbowRow = Math.round(rows * 0.30)
      ctx.strokeStyle = fire
      ctx.lineWidth = Math.max(0.9, gap * 0.09)
      const ring = (x, y, r, alpha) => {
        ctx.globalAlpha = alpha
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
      }
      const rRing = gap * 0.30
      for (let j = elbowCol; j < cols; j++) ring(px(j), py(elbowRow), rRing, 0.5)
      for (let i = elbowRow; i < rows; i++) ring(px(elbowCol), py(i), rRing, 0.5)

      // 3) circular dotted globe
      const cx = w * 0.44
      const cy = h * 0.62
      const R = Math.min(w * 0.32, h * 0.36)
      const spin = reduce ? 0.06 : 0.06 + t * 0.000045   // central longitude (Africa/Europe), in turns
      const pulse = 1 + wave * 0.09

      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const x = px(j), y = py(i)
          const nx = (x - cx) / R
          const ny = (y - cy) / R
          const r2 = nx * nx + ny * ny
          if (r2 > 1) continue
          const z = Math.sqrt(Math.max(0, 1 - r2))
          const lat = Math.asin(Math.max(-1, Math.min(1, -ny)))          // north up
          const dLon = Math.atan2(nx, Math.max(1e-4, z))
          const lon = spin * Math.PI * 2 + dLon
          const land = isLand(lat * 180 / Math.PI, lon * 180 / Math.PI)
          const depth = 0.45 + z * 0.55   // fade near the limb

          if (land) {
            ctx.fillStyle = fire
            ctx.globalAlpha = (0.78 + (wave + 1) * 0.1) * depth
            const r = gap * 0.27 * pulse * (0.7 + z * 0.3)
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
          } else {
            cross(x, y, s * 0.8, 0.3 * depth)
          }
        }
      }

      // 4) hollow-ring circle outlining the globe
      ctx.strokeStyle = fire
      ctx.lineWidth = Math.max(0.9, gap * 0.09)
      const seg = Math.max(28, Math.round(2 * Math.PI * R / gap))
      for (let k = 0; k < seg; k++) {
        const a = k / seg * Math.PI * 2
        ring(cx + Math.cos(a) * R, cy + Math.sin(a) * R, rRing, 0.55)
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
