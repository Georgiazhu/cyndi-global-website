import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import CyndiNavbar from '../cyndi/CyndiNavbar'
import TrackingPanel from './TrackingPanel'

// 3D 地球模块（含 three.js，约 2MB）懒加载：
// 页面先秒开，地球模块仅在滚动进入可视区后才下载和渲染
const Globe = lazy(() => import('react-globe.gl'))

// Shipping 服务页：顶部为客户物流查询（TrackingPanel），
// 3D 点阵地球缩小置于右侧，作为全球路由网络的视觉佐证。
// 标签只显示朝向镜头的跨洲枢纽，彻底避免城市名叠字。

const SZ = { lat: 22.5431, lng: 114.0579 }   // Shenzhen — 全球仓库中心

// 短程（亚洲）与远程（欧洲 / 北美 / 大洋洲）两组，用颜色区分
const SHORT = '#e7a23c'
const LONG = '#e2571a'

const DESTINATIONS = [
  { name: 'Singapore', lat: 1.3521, lng: 103.8198, color: SHORT },
  { name: 'Hong Kong', lat: 22.3193, lng: 114.1694, color: SHORT },
  { name: 'Kuala Lumpur', lat: 3.1390, lng: 101.6869, color: SHORT },
  { name: 'Penang', lat: 5.4141, lng: 100.3288, color: SHORT },
  { name: 'Johor Bahru', lat: 1.4927, lng: 103.7414, color: SHORT },
  { name: 'Bangkok', lat: 13.7563, lng: 100.5018, color: SHORT },
  { name: 'Chiang Mai', lat: 18.7883, lng: 98.9853, color: SHORT },
  { name: 'Phuket', lat: 7.8804, lng: 98.3923, color: SHORT },
  { name: 'Hanoi', lat: 21.0278, lng: 105.8342, color: SHORT },
  { name: 'Ho Chi Minh City', lat: 10.8231, lng: 106.6297, color: SHORT },
  { name: 'Tokyo', lat: 35.6762, lng: 139.6503, color: SHORT },
  { name: 'Osaka', lat: 34.6937, lng: 135.5023, color: SHORT },
  { name: 'Nagoya', lat: 35.1815, lng: 136.9066, color: SHORT },
  { name: 'London', lat: 51.5074, lng: -0.1278, color: LONG },
  { name: 'Paris', lat: 48.8566, lng: 2.3522, color: LONG },
  { name: 'Amsterdam', lat: 52.3676, lng: 4.9041, color: LONG },
  { name: 'Rotterdam', lat: 51.9244, lng: 4.4777, color: LONG },
  { name: 'Los Angeles', lat: 34.0522, lng: -118.2437, color: LONG },
  { name: 'Dallas', lat: 32.7767, lng: -96.7970, color: LONG },
  { name: 'New York', lat: 40.7128, lng: -74.0060, color: LONG },
  { name: 'Miami', lat: 25.7617, lng: -80.1912, color: LONG },
  { name: 'Chicago', lat: 41.8781, lng: -87.6298, color: LONG },
  { name: 'Philadelphia', lat: 39.9526, lng: -75.1652, color: LONG },
  { name: 'Toronto', lat: 43.6532, lng: -79.3832, color: LONG },
  { name: 'Vancouver', lat: 49.2827, lng: -123.1207, color: LONG },
  { name: 'Montreal', lat: 45.5017, lng: -73.5674, color: LONG },
  { name: 'Calgary', lat: 51.0447, lng: -114.0719, color: LONG },
  { name: 'Sydney', lat: -33.8688, lng: 151.2093, color: LONG },
  { name: 'Melbourne', lat: -37.8136, lng: 144.9631, color: LONG },
  { name: 'Brisbane', lat: -27.4698, lng: 153.0251, color: LONG },
  { name: 'Perth', lat: -31.9523, lng: 115.8613, color: LONG },
]

// 弧线只画到精选的跨洲枢纽 + 少量代表城市，避免 31 条线挤成一团
const ARC_CITIES = DESTINATIONS.filter(d =>
  ['Singapore', 'Tokyo', 'London', 'New York', 'Sydney', 'Los Angeles',
   'Paris', 'Dubai', 'Bangkok', 'Vancouver'].includes(d.name)
)
const ARCS = ARC_CITIES.map(d => ({
  startLat: SZ.lat, startLng: SZ.lng,
  endLat: d.lat, endLng: d.lng,
  color: d.color,
  alt: Math.min(0.42, 0.05 + haversine(SZ, d) / 26000),
}))

const POINTS = [
  { lat: SZ.lat, lng: SZ.lng, color: '#c2410c', size: 0.55 },
  ...DESTINATIONS.map(d => ({ lat: d.lat, lng: d.lng, color: d.color, size: 0.22 })),
]

const RINGS = [{ lat: SZ.lat, lng: SZ.lng }]

// 只给地理上分散的跨洲枢纽打标签；其余城市保留发光点与弧线。
// 中心 Shenzhen 单独作为起点标签。
const HUBS = [
  { lat: SZ.lat, lng: SZ.lng, text: 'Shenzhen', origin: true },
  { lat: 1.3521, lng: 103.8198, text: 'Singapore', origin: false },
  { lat: 35.6762, lng: 139.6503, text: 'Tokyo', origin: false },
  { lat: 51.5074, lng: -0.1278, text: 'London', origin: false },
  { lat: 40.7128, lng: -74.0060, text: 'New York', origin: false },
  { lat: -33.8688, lng: 151.2093, text: 'Sydney', origin: false },
]

const INITIAL_POV = { lat: 20, lng: 100, altitude: 2.45 }

function haversine(a, b) {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

// 球面角距（度）——用于判断枢纽是否落在镜头可见半球
function angularDistance(a, b) {
  const la1 = a.lat * Math.PI / 180, lo1 = a.lng * Math.PI / 180
  const la2 = b.lat * Math.PI / 180, lo2 = b.lng * Math.PI / 180
  const d = Math.sin(la1) * Math.sin(la2) + Math.cos(la1) * Math.cos(la2) * Math.cos(lo2 - lo1)
  return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI
}

// 每个可见枢纽渲染成精致的 HTML 徽章
function makeHubElement(hub) {
  const el = document.createElement('div')
  el.style.cssText = [
    'display:inline-flex', 'align-items:center', 'gap:5px',
    'padding:3px 9px 3px 7px', 'border-radius:999px',
    'background:rgba(255,255,255,0.94)',
    'border:1px solid ' + (hub.origin ? '#e8b79c' : '#e7e2da'),
    'box-shadow:0 2px 8px rgba(60,45,30,0.13)',
    'white-space:nowrap', 'pointer-events:none',
    'font-family:Inter,ui-sans-serif,system-ui,sans-serif',
    'font-size:11px', 'line-height:1.4', 'font-weight:600',
    'color:' + (hub.origin ? '#b4400f' : '#44403c'),
  ].join(';')
  const dot = document.createElement('span')
  dot.style.cssText = [
    'width:6px', 'height:6px', 'border-radius:50%',
    'background:' + (hub.origin ? '#c2410c' : '#e2571a'),
  ].join(';')
  const txt = document.createElement('span')
  txt.textContent = hub.text
  el.appendChild(dot)
  el.appendChild(txt)
  return el
}

function MiniGlobe() {
  const globeRef = useRef(null)
  const wrapRef = useRef(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [inView, setInView] = useState(false)
  const [visibleHubs, setVisibleHubs] = useState(() =>
    HUBS.filter(h => angularDistance(h, { lat: INITIAL_POV.lat, lng: INITIAL_POV.lng }) < 78)
  )

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const r = entries[0].contentRect
      setSize({ w: Math.round(r.width), h: Math.round(r.height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) { setInView(true); io.disconnect() }
    }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // 地球自动旋转时，持续计算落在可见半球的枢纽；只在集合变化时更新 state。
  useEffect(() => {
    if (!inView) return
    let raf = 0
    let lastKey = ''
    const tick = () => {
      const g = globeRef.current
      if (g) {
        try {
          const pov = g.pointOfView()
          const center = { lat: pov.lat, lng: pov.lng }
          const vis = HUBS.filter(h => angularDistance(h, center) < 80)
          const key = vis.map(v => v.text).join('|')
          if (key !== lastKey) { lastKey = key; setVisibleHubs(vis) }
        } catch { /* ignore */ }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView])

  function handleGlobeReady() {
    const g = globeRef.current
    if (!g) return
    try {
      g.lights().forEach(l => {
        if (l.isAmbientLight) l.intensity = 3.2
        else if (l.isDirectionalLight) l.intensity = 0.45
      })
    } catch { /* ignore */ }
    try {
      const c = g.controls()
      if (c) {
        c.autoRotate = true; c.autoRotateSpeed = 0.28
        c.enableZoom = false; c.enablePan = false
        c.minPolarAngle = Math.PI / 5
        c.maxPolarAngle = Math.PI - Math.PI / 5
      }
    } catch { /* ignore */ }
    try { g.pointOfView(INITIAL_POV, 0) } catch { /* ignore */ }
  }

  return (
    <div ref={wrapRef} className="relative h-[340px] lg:h-[420px] w-full cursor-grab active:cursor-grabbing">
      {!inView && (
        <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <div className="w-10 h-10 rounded-full border-2 border-stone-200 border-t-[#e2571a] animate-spin" />
        </div>
      )}
      {inView && size.w > 0 && (
        <Suspense fallback={null}>
          <Globe
            ref={globeRef}
            width={size.w}
            height={size.h}
            backgroundColor="rgba(0,0,0,0)"
            globeImageUrl="/images/shipping/earth-dots-light.png"
            showAtmosphere
            atmosphereColor="#cfd8dd"
            atmosphereAltitude={0.16}
            onGlobeReady={handleGlobeReady}
            arcsData={ARCS}
            arcColor="color"
            arcAltitude="alt"
            arcStroke={0.5}
            arcDashLength={0.5}
            arcDashGap={0.3}
            arcDashAnimateTime={6000}
            arcCurveResolution={64}
            pointsData={POINTS}
            pointColor="color"
            pointAltitude="0.014"
            pointRadius="size"
            pointResolution={10}
            ringsData={RINGS}
            ringColor={() => t => `rgba(194,65,12,${(1 - t) * 0.5})`}
            ringMaxRadius={5}
            ringPropagationSpeed={1.1}
            ringRepeatPeriod={2400}
            htmlElementsData={visibleHubs}
            htmlElement={makeHubElement}
            htmlAltitude={0.02}
            htmlTransitionDuration={350}
          />
        </Suspense>
      )}
    </div>
  )
}

export default function Shipping() {
  return (
    <div className="min-h-screen bg-[#faf9f6] text-stone-900">
      <CyndiNavbar />

      {/* ── Header ── */}
      <div id="top" className="max-w-[1280px] mx-auto px-6 pt-28 pb-4">
        <a href="/#top"
          className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-400 hover:bg-stone-50 hover:text-stone-900">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
          Back to Home
        </a>
        <h1 className="mt-4 text-4xl md:text-5xl font-bold tracking-tight">Shipping</h1>
        <p className="mt-3.5 max-w-2xl text-stone-500 leading-relaxed text-[15px]">
          Lower costs, better deliverability, fewer problems. Our route network radiates from our
          Shenzhen warehouse to Asia, Europe, North America and Oceania &mdash; by sea and by air.
        </p>
      </div>

      {/* ── 主体：左查询 + 右小地球 ── */}
      <section className="max-w-[1280px] mx-auto px-6 pt-4 pb-10">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)] gap-8 items-start">
          <TrackingPanel />

          <aside className="rounded-2xl bg-white ring-1 ring-stone-200/70 px-3 pt-6 pb-2 self-start lg:sticky lg:top-28">
            <div className="px-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#e07a3a]">OUR NETWORK</p>
              <h3 className="mt-2 text-lg font-semibold text-stone-900">From Cyndi to the world</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-stone-500">
                One global warehouse, door-to-door delivery across Asia, Europe, North America and Oceania.
              </p>
            </div>
            <MiniGlobe />
            <div className="flex flex-wrap gap-2 px-3 pb-2">
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">Asia</span>
              <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-medium text-[#c8652c]">Europe</span>
              <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-medium text-[#c8652c]">North America</span>
              <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-medium text-[#c8652c]">Oceania</span>
            </div>
          </aside>
        </div>
      </section>

      {/* ── CTA ── */}
      <section>
        <div className="max-w-[1280px] mx-auto px-6 pb-20">
          <div className="rounded-2xl bg-white ring-1 ring-stone-200/70 shadow-sm px-6 py-12 sm:px-10 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">Ship with us</h2>
            <p className="mt-2.5 text-stone-500 text-[15px] leading-relaxed max-w-xl mx-auto">
              Tell us your origin, destination and volumes &mdash; we&rsquo;ll come back with
              routing options, transit times and a quote.
            </p>
            <a href="mailto:info@cyndiglobal.com"
              className="group mt-7 inline-flex items-center gap-2.5 border border-stone-900 text-stone-900 px-9 py-[15px] text-[13px] font-medium uppercase tracking-wider hover:bg-stone-900 hover:text-white transition-colors">
              Talk to Our Team
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                className="w-[15px] h-[15px] group-hover:translate-x-1 transition-transform">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-stone-200 py-8 text-center text-stone-500 text-[13px]">
        © 2026 Cyndi Global Limited · Hong Kong
      </footer>
    </div>
  )
}
