import { useEffect, useRef } from 'react'
import { LAND_MASK } from '../landMask.js'

const ROWS = LAND_MASK.length
const COLS = LAND_MASK[0].length
const RAD = Math.PI / 180

// Sample the equirectangular land mask at a lat/lon (degrees).
function isLand(latDeg, lonDeg) {
  const i = Math.round((90 - latDeg) / 180 * (ROWS - 1))
  const lon = ((lonDeg + 180) % 360 + 360) % 360 - 180
  const j = Math.round((lon + 180) / 360 * (COLS - 1))
  const row = LAND_MASK[Math.max(0, Math.min(ROWS - 1, i))]
  return row && row[Math.max(0, Math.min(COLS - 1, j))] === '1'
}

// Cardless hero globe, recoloured in Dragon Fire orange.
// A huge dotted sphere, cropped by the bottom/right edge of the hero.
// Points sit on a lat/lon lattice on the sphere; a tilted polar axis makes
// the parallels read as curved arcs. Land = solid orange dots, ocean = faint
// orange dots, both fading towards the limb. Slow rotation + breathing pulse.
const LAT_STEP = 1.0
const LON_STEP = 1.0
const TILT = 0.22
const CT = Math.cos(TILT)
const ST = Math.sin(TILT)

// Pre-build the sphere lattice once (geo coords + land flag).
const POINTS = []
for (let lat = -89; lat <= 89; lat += LAT_STEP) {
  const la = lat * RAD
  const cla = Math.cos(la)
  const sla = Math.sin(la)
  for (let lon = -180; lon < 180; lon += LON_STEP) {
    POINTS.push({ cla, sla, lon, land: isLand(lat, lon) })
  }
}

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
      // The sphere is deliberately larger than the canvas: only its upper-left
      // arc is visible, the rest is cut off by the hero's bottom/right edge.
      const R = w * 0.50
      const cx = w * 0.54
      const cy = h * 0.40 + R
      const spin = (reduce ? 18 : 18 + t * 0.003) * RAD
      const wave = reduce ? 0 : Math.sin(t * 0.0011)
      const scale = R / 500
      const fire = '#E2501D'
      const ocean = '#E9A88B'
      const landPts = []

      for (let k = 0; k < POINTS.length; k++) {
        const p = POINTS[k]
        const cur = p.lon * RAD + spin
        const x = p.cla * Math.sin(cur)
        const z = p.cla * Math.cos(cur)
        // tilt the polar axis so parallels become curved arcs
        const yt = p.sla * CT - z * ST
        const zt = p.sla * ST + z * CT
        if (zt <= 0.03) continue                       // back hemisphere
        const sx = cx + x * R
        const sy = cy - yt * R
        if (sx < -3 || sx > w + 3 || sy < -3 || sy > h + 3) continue
        if (p.land) {
          landPts.push(sx, sy, zt)
        } else {
          const depth = 0.18 + zt * 0.82
          ctx.globalAlpha = 0.52 * depth
          const s = Math.max(0.75, 1.55 * scale * (0.55 + zt * 0.45))
          ctx.fillStyle = ocean
          ctx.fillRect(sx - s * 0.5, sy - s * 0.5, s, s)
        }
      }

      const pulse = 1 + wave * 0.08
      ctx.fillStyle = fire
      for (let k = 0; k < landPts.length; k += 3) {
        const zt = landPts[k + 2]
        const depth = 0.32 + zt * 0.68
        ctx.globalAlpha = 0.90 * depth
        const r = Math.max(0.7, 1.9 * scale * pulse * (0.55 + zt * 0.45))
        ctx.beginPath()
        ctx.arc(landPts[k], landPts[k + 1], r, 0, Math.PI * 2)
        ctx.fill()
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
