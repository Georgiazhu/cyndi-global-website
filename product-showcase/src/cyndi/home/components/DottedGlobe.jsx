import { useEffect, useRef } from 'react'
import { LAND_MASK } from '../landMask.js'

/*
 * Cardless hero dot field — rebuilt from the shipped runtime (SOURCE FIRST).
 *
 * Recovered from the site's own canvas module (parity / reverse-any-website
 * methodology), not guessed from screenshots. The original is a two-layer
 * canvas state machine:
 *
 *   1. INTRO (~1700 ms): every dot pops in from the centre outwards. Dots carry
 *      a `pop` delay derived from their radius; size uses a damped-spring
 *      overshoot, alpha a smoothstep fade. Static dots use a radial stagger.
 *   2. STEADY: the static layer is painted ONCE and never touched again. Only
 *      the outer "free" dots keep animating, displaced each frame by a flow
 *      field made of three superposed travelling sine waves.
 *   3. Glyphs are three-state (dot / ring / cross), assigned along each radial
 *      band by a seeded random walk, which produces the concentric arc stripes.
 *
 * Only the palette is changed here: cardless greens -> Cyndi Dragon Fire orange.
 */
const ROWS = LAND_MASK.length
const COLS = LAND_MASK[0].length
const RAD = Math.PI / 180

function isLand(latDeg, lonDeg) {
  const i = Math.round((90 - latDeg) / 180 * (ROWS - 1))
  const lon = ((lonDeg + 180) % 360 + 360) % 360 - 180
  const j = Math.round((lon + 180) / 360 * (COLS - 1))
  const row = LAND_MASK[Math.max(0, Math.min(ROWS - 1, i))]
  return row && row[Math.max(0, Math.min(COLS - 1, j))] === '1'
}

/* ---- recovered constants ------------------------------------------------ */
const WAVES = [                       // travelling-wave flow field
  { kx: 0.011, ky: 0.007, w: 0.42, p: 0.4 },
  { kx: -0.006, ky: 0.012, w: 0.33, p: 2.1 },
  { kx: 0.014, ky: -0.005, w: 0.51, p: 4.3 },
]
const DI = 380                        // pop duration
const FI = 380                        // static-dot fade duration
const PI = 120                        // radial stagger
const MI = 320                        // earliest pop
const UI = 1000                       // radial spread of pops
const HI = MI + UI + DI               // 1700 ms — intro end
const GLYPHS = ['dot', 'ring', 'cross']

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const lerp = (a, b, t) => a + (b - a) * t
const smooth = (e) => e * e * (3 - 2 * e)

// Damped spring with overshoot — recovered as Di(e).
function spring(e) {
  const k = 14 * Math.sqrt(0.64)
  return 1 - Math.exp(-8.4 * e) * (Math.cos(k * e) + (8.4 / k) * Math.sin(k * e))
}

// Divergence-free-ish flow field — recovered as Vt(x, y, t); t in seconds.
function flow(x, y, t) {
  let dx = 0
  let dy = 0
  for (const a of WAVES) {
    const o = Math.cos(a.kx * x + a.ky * y + a.w * t + a.p)
    const s = Math.hypot(a.kx, a.ky)
    dx += (a.ky / s) * o
    dy -= (a.kx / s) * o
  }
  return [dx / WAVES.length, dy / WAVES.length]
}

// Deterministic PRNG so the field is identical on every mount/resize.
function rng(seed) {
  let t = seed | 0
  return () => {
    t = (t + 1831565813) | 0
    let e = Math.imul(t ^ (t >>> 15), 1 | t)
    e = e + Math.imul(e ^ (e >>> 7), 61 | e) ^ e
    return ((e ^ (e >>> 14)) >>> 0) / 4294967296
  }
}

/* Dragon Fire palette (cardless used a green palette here) */
const INK_DEEP = '226,80,29'          // #E2501D land / solid
const INK_MID = '226,108,66'         // rings
const INK_FAINT = '235,150,116'      // crosses / ocean
const RING_SCALE = 1.45              // recovered ei
const CROSS_SCALE = 1.2              // recovered ti
const LINE_W = 0.65                  // recovered ni

/* ---- sphere lattice (geometry only, glyph/pop assigned per resize) ------- */
const LAT_STEP = 1.25
const LON_STEP = 1.25
const TILT = 0.24
const CT = Math.cos(TILT)
const ST = Math.sin(TILT)

const LATTICE = []
for (let lat = -89; lat <= 89; lat += LAT_STEP) {
  const la = lat * RAD
  const cla = Math.cos(la)
  const sla = Math.sin(la)
  for (let lon = -180; lon < 180; lon += LON_STEP) {
    LATTICE.push({ cla, sla, lon, land: isLand(lat, lon) })
  }
}

/* Paint one dot in its three-state glyph. Recovered as en(ctx, glyph, x, y, s). */
function paint(ctx, glyph, x, y, size, color, alpha) {
  if (alpha <= 0.004) return
  ctx.beginPath()
  if (glyph === 'ring') {
    ctx.arc(x, y, size * RING_SCALE, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(${color},${alpha})`
    ctx.lineWidth = LINE_W
    ctx.stroke()
    return
  }
  if (glyph === 'cross') {
    const t = size * CROSS_SCALE
    ctx.moveTo(x - t, y - t); ctx.lineTo(x + t, y + t)
    ctx.moveTo(x - t, y + t); ctx.lineTo(x + t, y - t)
    ctx.strokeStyle = `rgba(${color},${alpha})`
    ctx.lineWidth = LINE_W
    ctx.stroke()
    return
  }
  ctx.arc(x, y, size, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(${color},${alpha})`
  ctx.fill()
}

export default function DottedGlobe({ className = '' }) {
  const wrapRef = useRef(null)
  const stillRef = useRef(null)
  const driftRef = useRef(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const still = stillRef.current
    const drift = driftRef.current
    if (!wrap || !still || !drift) return
    const sctx = still.getContext('2d')
    const dctx = drift.getContext('2d')
    if (!sctx || !dctx) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    let raf = 0
    let w = 0, h = 0, dpr = 1
    let staticDots = []
    let driftDots = []
    let introAt = 0
    let stillFrozen = false

    const build = () => {
      const rect = wrap.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = Math.max(1, rect.width)
      h = Math.max(1, rect.height)
      for (const c of [still, drift]) {
        c.width = Math.round(w * dpr)
        c.height = Math.round(h * dpr)
      }
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      dctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Huge sphere, cropped by bottom/right — matches the reference frame.
      const R = w * 0.60
      const cx = w * 0.56
      const cy = h * 0.26 + R
      const spin = 8 * RAD            // fixed longitude; the field does not spin
      const scale = R / 500
      const rand = rng(7303)

      // Project the sphere into screen space first.
      const proj = []
      for (let k = 0; k < LATTICE.length; k++) {
        const p = LATTICE[k]
        const cur = p.lon * RAD + spin
        const x = p.cla * Math.sin(cur)
        const z = p.cla * Math.cos(cur)
        const yt = p.sla * CT - z * ST
        const zt = p.sla * ST + z * CT
        if (zt <= 0.03) continue
        const sx = cx + x * R
        const sy = cy - yt * R
        if (sx < -4 || sx > w + 4 || sy < -4 || sy > h + 4) continue
        const rr = Math.hypot(sx - cx, sy - cy) / R   // 0 centre -> 1 rim
        proj.push({ sx, sy, zt, rr, land: p.land, ang: Math.atan2(cy - sy, sx - cx) })
      }

      // Group into radial bands, walk each band by angle assigning glyphs.
      // This is what creates the concentric arc stripes in the original.
      const BANDS = 26
      const bands = Array.from({ length: BANDS }, () => [])
      for (const p of proj) bands[Math.min(BANDS - 1, Math.floor(p.rr * BANDS))].push(p)

      const dots = []
      for (let b = 0; b < BANDS; b++) {
        const band = bands[b].sort((m, n) => m.ang - n.ang)
        let walk = rand() * 2
        for (const p of band) {
          const nxt = walk + clamp(0.5 + 0.18 * (rand() - 0.5), 0, 2)
          let glyph = GLYPHS[clamp(Math.floor(nxt) - Math.floor(walk), 0, 2)]
          walk = nxt
          // Land is a solid-dot cluster; ocean keeps ring/cross arcs light.
          if (p.land) glyph = 'dot'
          const depth = 0.30 + p.zt * 0.70
          const size = Math.max(0.72, 1.6 * scale * (0.55 + p.zt * 0.45) * (p.land ? 1.28 : 1))
          // Fade toward the hero bottom edge so the crop is soft, not a hard line.
          const edgeFade = clamp((h - p.sy) / (h * 0.26), 0, 1)
          const alpha = (p.land ? 1.0 : 0.72) * depth * (0.35 + 0.65 * smooth(edgeFade))
          const color = p.land ? INK_DEEP : (glyph === 'cross' ? INK_FAINT : INK_MID)
          // Outer free dots drift; the inner field stays pinned.
          const free = clamp((p.rr - 0.58) / 0.42, 0, 1)
          const drifting = free > 0.06
          const drift = drifting ? lerp(1.2, 5, free) * scale * 7 : 0
          const pop = MI + UI * smooth(clamp(p.rr * 1.05, 0, 1)) + (rand() - 0.5) * 90
          dots.push({ x: p.sx, y: p.sy, glyph, size, alpha, color, pop, drift, rr: p.rr })
        }
      }
      staticDots = dots.filter((d) => d.drift === 0)
      driftDots = dots.filter((d) => d.drift > 0)
    }

    /* Recovered tn(): intro timing + flow displacement. */
    const renderLayer = (ctx, list, since, time) => {
      ctx.clearRect(0, 0, w, h)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (const d of list) {
        let size = d.size
        let alpha = d.alpha
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
        let x = d.x
        let y = d.y
        if (time !== undefined && d.drift > 0 && !reduce) {
          const [fx, fy] = flow(d.x, d.y, time)
          x += fx * d.drift
          y += fy * d.drift
        }
        paint(ctx, d.glyph, x, y, size, d.color, alpha)
      }
    }

    const frame = (now) => {
      if (!introAt) introAt = now
      const since = now - introAt
      const time = now / 1000
      const done = since >= HI || reduce
      if (done) {
        // Static layer is painted exactly once at rest, then left untouched.
        if (!stillFrozen) {
          renderLayer(sctx, staticDots, undefined, time)
          stillFrozen = true
        }
      } else {
        renderLayer(sctx, staticDots, since, time)
      }
      renderLayer(dctx, driftDots, done ? undefined : since, time)
      if (done && reduce) return
      raf = requestAnimationFrame(frame)
    }

    build()
    stillFrozen = false
    introAt = 0
    raf = requestAnimationFrame(frame)
    const onResize = () => {
      cancelAnimationFrame(raf)
      build()
      renderLayer(sctx, staticDots, undefined, performance.now() / 1000)
      renderLayer(dctx, driftDots, undefined, performance.now() / 1000)
      stillFrozen = true
      if (!reduce) raf = requestAnimationFrame(frame)
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div ref={wrapRef} className={className} aria-hidden="true">
      <canvas ref={stillRef} className="absolute inset-0 h-full w-full" />
      <canvas ref={driftRef} className="absolute inset-0 h-full w-full" />
    </div>
  )
}
