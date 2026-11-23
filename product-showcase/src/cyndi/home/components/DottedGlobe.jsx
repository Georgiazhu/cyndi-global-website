import { useEffect, useRef } from 'react'
import { LAND_MASK } from '../landMask.js'

/*
 * Cardless hero dotted globe — Cyndi deep-oat palette.
 *
 * The reference is a RIGID spherical dot lattice: its silhouette never
 * changes. Every dot is pinned to a fixed lat/lon position on a unit sphere,
 * and each frame ALL dots are re-projected through ONE shared rotation
 * matrix. The globe can therefore only turn as a solid body — it can never
 * stretch, ripple or deform.
 *
 * Interaction: pointer position drives a damped yaw/pitch tilt of the whole
 * sphere, and a soft spotlight enlarges / brightens the dots near the
 * cursor. Moving the mouse turns the globe; leaving settles it back to rest.
 *
 * Intro (dots popping in from the centre outwards), the dot/ring/cross
 * glyphs, the concentric arc bands, the bottom soft crop and the pole fade
 * are kept from the previous build, so the resting frame is unchanged.
 */
const ROWS = LAND_MASK.length
const COLS = LAND_MASK[0].length
const RAD = Math.PI / 180
const TAU = Math.PI * 2

function isLand(latDeg, lonDeg) {
  const i = Math.round((90 - latDeg) / 180 * (ROWS - 1))
  const lon = ((lonDeg + 180) % 360 + 360) % 360 - 180
  const j = Math.round((lon + 180) / 360 * (COLS - 1))
  const row = LAND_MASK[Math.max(0, Math.min(ROWS - 1, i))]
  return row && row[Math.max(0, Math.min(COLS - 1, j))] === '1'
}

/* ---- intro timing -------------------------------------------------------- */
const DI = 380                        // pop duration
const FI = 380                        // fade duration
const PI = 120                        // radial stagger
const MI = 320                        // earliest pop
const UI = 1000                       // radial spread of pops
const HI = MI + UI + DI               // 1700 ms — intro end
const GLYPHS = ['dot', 'ring', 'cross']

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const smooth = (e) => e * e * (3 - 2 * e)

// Damped spring with overshoot.
function spring(e) {
  const k = 14 * Math.sqrt(0.64)
  return 1 - Math.exp(-8.4 * e) * (Math.cos(k * e) + (8.4 / k) * Math.sin(k * e))
}

function rng(seed) {
  let t = seed | 0
  return () => {
    t = (t + 1831565813) | 0
    let e = Math.imul(t ^ (t >>> 15), 1 | t)
    e = e + Math.imul(e ^ (e >>> 7), 61 | e) ^ e
    return ((e ^ (e >>> 14)) >>> 0) / 4294967296
  }
}

/* Deep oat palette */
const COLORS = ['140,123,102', '158,141,117', '181,167,147']
const INK_DEEP = 0, INK_MID = 1, INK_FAINT = 2
const RING_SCALE = 1.45
const CROSS_SCALE = 1.2
const LINE_W = 0.65
const ALPHA_BINS = 12

/* ---- rigid sphere lattice: fixed lat/lon -> unit vector ------------------ */
const LAT_STEP = 1.4
const LON_STEP = 1.4
const TILT = 0.21                     // resting pitch
const BASE_SPIN = 8 * RAD             // resting longitude
const SPHERE = []
for (let lat = -89; lat <= 89; lat += LAT_STEP) {
  const la = lat * RAD
  const cla = Math.cos(la)
  const sla = Math.sin(la)
  for (let lon = -180; lon < 180; lon += LON_STEP) {
    const lo = lon * RAD
    SPHERE.push({
      x: cla * Math.sin(lo),
      y: sla,
      z: cla * Math.cos(lo),
      land: isLand(lat, lon),
    })
  }
}

/* ---- pointer interaction ------------------------------------------------- */
const YAW_RANGE = 0.20                // full-width travel -> +/- 0.10 rad
const PITCH_RANGE = 0.10              // full-height travel -> +/- 0.05 rad
const EASE = 0.07                     // damped follow
const HOVER_FRACTION = 0.30           // spotlight radius vs. min(w,h)

export default function DottedGlobe({ className = '' }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

    let raf = 0
    let loop = null
    let w = 0, h = 0, dpr = 1
    let R = 0, cx = 0, cy = 0, scale = 1, hoverR = 180
    let dots = []
    let introAt = 0

    const mouse = { x: -1e5, y: -1e5, inside: false }
    let targetYaw = 0, targetPitch = 0
    let curYaw = 0, curPitch = 0

    // Reused every frame: [colorIdx][glyphIdx][alphaBin] -> flat x,y,r triples.
    const groups = Array.from({ length: 3 * 3 * ALPHA_BINS }, () => [])

    /*
     * Build dot attributes at the RESTING attitude. The primary set is
     * exactly the old on-screen set (same iteration order, same PRNG), so
     * the resting frame is pixel-identical. The margin set only supplies
     * dots that rotate into view at the rim when the globe turns.
     */
    const build = () => {
      const rect = wrap.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = Math.max(1, rect.width)
      h = Math.max(1, rect.height)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Huge sphere, cropped by bottom/right — matches the reference frame.
      R = w * 0.60
      cx = w * 0.56
      cy = h * 0.32 + R
      scale = R / 500
      hoverR = Math.min(w, h) * HOVER_FRACTION

      const A = Math.cos(BASE_SPIN), B = Math.sin(BASE_SPIN)
      const C = Math.cos(TILT), D = Math.sin(TILT)
      const MARGIN = Math.max(w, h) * 0.32
      const projIn = []
      const projOut = []
      for (const s of SPHERE) {
        const x1 = s.x * A + s.z * B
        const z1 = -s.x * B + s.z * A
        const y2 = s.y * C - z1 * D
        const z2 = s.y * D + z1 * C
        if (z2 <= 0.03) continue
        const sx = cx + x1 * R
        const sy = cy - y2 * R
        if (sx < -MARGIN || sx > w + MARGIN || sy < -MARGIN || sy > h + MARGIN) continue
        const rr = Math.hypot(sx - cx, sy - cy) / R
        const item = { s, sx, sy, z2, rr, ang: Math.atan2(cy - sy, sx - cx) }
        if (sx >= -4 && sx <= w + 4 && sy >= -4 && sy <= h + 4) projIn.push(item)
        else projOut.push(item)
      }

      const make = (list, rand) => {
        const BANDS = 26
        const bands = Array.from({ length: BANDS }, () => [])
        for (const p of list) bands[Math.min(BANDS - 1, Math.floor(p.rr * BANDS))].push(p)
        const out = []
        for (let b = 0; b < BANDS; b++) {
          const band = bands[b].sort((m, n) => m.ang - n.ang)
          let walk = rand() * 2
          for (const p of band) {
            const nxt = walk + clamp(0.5 + 0.18 * (rand() - 0.5), 0, 2)
            let glyph = GLYPHS[clamp(Math.floor(nxt) - Math.floor(walk), 0, 2)]
            walk = nxt
            if (p.s.land) glyph = 'dot'
            const size = Math.max(0.66, 1.3 * scale * (0.55 + p.z2 * 0.45) * (p.s.land ? 1.5 : 1))
            const colorIdx = p.s.land ? INK_DEEP : (glyph === 'cross' ? INK_FAINT : INK_MID)
            const pop = MI + UI * smooth(clamp(p.rr * 1.05, 0, 1)) + (rand() - 0.5) * 90
            out.push({
              s: p.s, glyphIdx: GLYPHS.indexOf(glyph), colorIdx,
              size, baseAlpha: p.s.land ? 1.0 : 0.72, pop, rr: p.rr,
            })
          }
        }
        return out
      }
      dots = make(projIn, rng(7303)).concat(make(projOut, rng(911)))
    }

    /* ONE shared rotation matrix per frame => the silhouette is invariant. */
    const render = (since) => {
      curYaw += (targetYaw - curYaw) * EASE
      curPitch += (targetPitch - curPitch) * EASE
      const yaw = BASE_SPIN + curYaw
      const pitch = TILT + curPitch
      const A = Math.cos(yaw), B = Math.sin(yaw)
      const C = Math.cos(pitch), D = Math.sin(pitch)

      ctx.clearRect(0, 0, w, h)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (const a of groups) a.length = 0

      for (const d of dots) {
        const s = d.s
        const x1 = s.x * A + s.z * B
        const z1 = -s.x * B + s.z * A
        const y2 = s.y * C - z1 * D
        const z2 = s.y * D + z1 * C
        if (z2 <= 0.03) continue
        const sx = cx + x1 * R
        const sy = cy - y2 * R
        if (sx < -4 || sx > w + 4 || sy < -4 || sy > h + 4) continue

        let size = d.size
        let alpha = d.baseAlpha
        if (since !== undefined) {
          if (d.pop > 0) {
            const e = clamp((since - d.pop) / DI, 0, 1)
            if (e <= 0) continue
            size *= spring(e)
            alpha *= Math.min(1, e * 2.5)
          } else {
            const e = clamp((since - PI * Math.min(d.rr / 0.45, 1.5)) / FI, 0, 1)
            if (e <= 0) continue
            alpha *= smooth(e)
          }
        }

        // Depth, bottom soft crop and pole fade from the CURRENT frame.
        alpha *= 0.30 + z2 * 0.70
        const edgeFade = clamp((h - sy) / (h * 0.26), 0, 1)
        const rr = Math.hypot(sx - cx, sy - cy) / R
        const poleFade = clamp((rr - 0.02) / 0.16, 0, 1)
        alpha *= (0.35 + 0.65 * smooth(edgeFade)) * (0.65 + 0.35 * smooth(poleFade))

        // Pointer spotlight: dots grow and brighten near the cursor.
        if (mouse.inside) {
          const dd = Math.hypot(sx - mouse.x, sy - mouse.y)
          if (dd < hoverR) {
            const g = smooth(1 - dd / hoverR)
            size *= 1 + 0.6 * g
            alpha *= 1 + 1.1 * g
          }
        }
        alpha = clamp(alpha, 0, 1)

        const bin = Math.min(ALPHA_BINS - 1, Math.floor(alpha * ALPHA_BINS))
        const r = d.glyphIdx === 1 ? size * RING_SCALE
          : (d.glyphIdx === 2 ? size * CROSS_SCALE : size)
        groups[(d.colorIdx * 3 + d.glyphIdx) * ALPHA_BINS + bin].push(sx, sy, r)
      }

      for (let c = 0; c < 3; c++) {
        for (let g = 0; g < 3; g++) {
          for (let b = 0; b < ALPHA_BINS; b++) {
            const arr = groups[(c * 3 + g) * ALPHA_BINS + b]
            if (!arr.length) continue
            const alpha = (b + 0.5) / ALPHA_BINS
            ctx.beginPath()
            for (let i = 0; i < arr.length; i += 3) {
              const x = arr[i], y = arr[i + 1], r = arr[i + 2]
              if (g === 2) {
                ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r)
                ctx.moveTo(x - r, y + r); ctx.lineTo(x + r, y - r)
              } else {
                ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU)
              }
            }
            if (g === 0) {
              ctx.fillStyle = `rgba(${COLORS[c]},${alpha})`
              ctx.fill()
            } else {
              ctx.strokeStyle = `rgba(${COLORS[c]},${alpha})`
              ctx.lineWidth = LINE_W
              ctx.stroke()
            }
          }
        }
      }
    }

    build()
    introAt = 0

    if (reduce) {
      render(HI)
    } else {
      loop = (now) => {
        if (!introAt) introAt = now
        render(now - introAt)
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    }

    const onMove = (e) => {
      if (reduce) return
      const rect = wrap.getBoundingClientRect()
      mouse.x = e.clientX - rect.left
      mouse.y = e.clientY - rect.top
      mouse.inside = mouse.x >= 0 && mouse.x <= rect.width && mouse.y >= 0 && mouse.y <= rect.height
      targetYaw = (mouse.x / rect.width - 0.5) * YAW_RANGE
      targetPitch = (mouse.y / rect.height - 0.5) * PITCH_RANGE
    }
    const onLeave = () => {
      mouse.inside = false
      targetYaw = 0
      targetPitch = 0
    }
    const onResize = () => {
      cancelAnimationFrame(raf)
      build()
      introAt = 0
      if (reduce) render(HI)
      else raf = requestAnimationFrame(loop)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('mouseleave', onLeave)
    window.addEventListener('blur', onLeave)
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('blur', onLeave)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div ref={wrapRef} className={className} aria-hidden="true">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  )
}
