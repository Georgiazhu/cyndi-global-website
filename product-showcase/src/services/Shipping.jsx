import { useEffect, useRef, useState } from 'react'
import Globe from 'react-globe.gl'
import CyndiNavbar from '../cyndi/CyndiNavbar'

// Shipping 服务页：可鼠标拖拽旋转的 3D 地球 + 广州出发的运输航线弧。
// 底色与网站底色一致（#faf9f6），不做任何面板/渐变，让地球"悬浮"在页面上。
// 起始点（Guangzhou）与每个终点都标注城市英文名。

const GZ = { lat: 23.1291, lng: 113.2644 }   // Guangzhou

// 短程（亚洲）与远程（欧洲 / 北美 / 大洋洲）两组，用颜色区分
const SHORT = '#f59e0b'
const LONG = '#e2571a'

// 每条航线：终点坐标 + 城市英文名（结束点标注用）
const DESTINATIONS = [
  // ── 亚洲 / 东南亚 ──
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
  // ── 日本 ──
  { name: 'Tokyo', lat: 35.6762, lng: 139.6503, color: SHORT },
  { name: 'Osaka', lat: 34.6937, lng: 135.5023, color: SHORT },
  { name: 'Nagoya', lat: 35.1815, lng: 136.9066, color: SHORT },
  // ── 欧洲 ──
  { name: 'London', lat: 51.5074, lng: -0.1278, color: LONG },
  { name: 'Paris', lat: 48.8566, lng: 2.3522, color: LONG },
  { name: 'Amsterdam', lat: 52.3676, lng: 4.9041, color: LONG },
  { name: 'Rotterdam', lat: 51.9244, lng: 4.4777, color: LONG },
  // ── 美国 ──
  { name: 'Los Angeles', lat: 34.0522, lng: -118.2437, color: LONG },
  { name: 'Dallas', lat: 32.7767, lng: -96.7970, color: LONG },
  { name: 'New York', lat: 40.7128, lng: -74.0060, color: LONG },
  { name: 'Miami', lat: 25.7617, lng: -80.1918, color: LONG },
  { name: 'Chicago', lat: 41.8781, lng: -87.6298, color: LONG },
  { name: 'Philadelphia', lat: 39.9526, lng: -75.1652, color: LONG },
  // ── 加拿大 ──
  { name: 'Toronto', lat: 43.6532, lng: -79.3832, color: LONG },
  { name: 'Vancouver', lat: 49.2827, lng: -123.1207, color: LONG },
  { name: 'Montreal', lat: 45.5019, lng: -73.5674, color: LONG },
  { name: 'Calgary', lat: 51.0447, lng: -114.0719, color: LONG },
  // ── 大洋洲 ──
  { name: 'Sydney', lat: -33.8688, lng: 151.2093, color: LONG },
  { name: 'Melbourne', lat: -37.8136, lng: 144.9631, color: LONG },
  { name: 'Brisbane', lat: -27.4698, lng: 153.0251, color: LONG },
  { name: 'Perth', lat: -31.9523, lng: 115.8613, color: LONG },
]

const ARCS = DESTINATIONS.map(d => ({
  startLat: GZ.lat, startLng: GZ.lng,
  endLat: d.lat, endLng: d.lng,
  color: d.color,
  alt: Math.min(0.55, 0.06 + haversine(GZ, d) / 22000),
}))

// 端点（球面上的小点）
const POINTS = [
  { lat: GZ.lat, lng: GZ.lng, color: '#c2410c', size: 0.5 },
  ...DESTINATIONS.map(d => ({ lat: d.lat, lng: d.lng, color: d.color, size: 0.26 })),
]

// 文字标注：起始点 Guangzhou + 每个终点城市英文名（统一白色）
// 注意：labelSize 单位是“度”（1 度 ≈ 球半径的 1/57），需 2~4 才可读
const LABELS = [
  { lat: GZ.lat, lng: GZ.lng, text: 'Guangzhou', color: '#ffffff', size: 4.2, altitude: 0.024 },
  ...DESTINATIONS.map(d => ({
    lat: d.lat, lng: d.lng, text: d.name, color: '#ffffff', size: 2.0, altitude: 0.018,
  })),
]

// 广州出发的脉冲环
const RINGS = [{ lat: GZ.lat, lng: GZ.lng }]

// 初始相机视角（正对广州/华南）
const INITIAL_POV = { lat: 22, lng: 108, altitude: 2.5 }

function haversine(a, b) {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export default function Shipping() {
  const globeRef = useRef(null)
  const wrapRef = useRef(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  // 跟随容器尺寸（响应式）
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

  // 地球初始化完成后再配相机与控制器（pointOfView 作为 prop 在当前版本被忽略，必须用方法调用）：
  // 提亮环境光让蓝色地球通透、悬浮感更强；空闲自转；禁用缩放/平移，避免滚轮被地球“吃掉”
  function handleGlobeReady() {
    const g = globeRef.current
    if (!g) return
    try {
      g.lights().forEach(l => {
        if (l.isAmbientLight) l.intensity = 3.0
        else if (l.isDirectionalLight) l.intensity = 0.7
      })
    } catch { /* 光照配置失败不影响渲染 */ }
    try {
      const c = g.controls()
      if (c) {
        c.autoRotate = true
        c.autoRotateSpeed = 0.32
        c.enableZoom = false
        c.enablePan = false
        c.minPolarAngle = Math.PI / 5
        c.maxPolarAngle = Math.PI - Math.PI / 5
      }
    } catch { /* 控制器配置失败不影响渲染 */ }
    try {
      g.pointOfView(INITIAL_POV, 0)
    } catch { /* 视角设置失败不影响渲染 */ }
  }

  return (
    <div className="min-h-screen bg-[#faf9f6] text-stone-900">
      <CyndiNavbar />

      {/* ── Header ── */}
      <div id="top" className="max-w-[1280px] mx-auto px-6 pt-28 pb-6">
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
          Guangzhou warehouses to Asia, Europe, North America and Oceania &mdash; by sea and by air.
        </p>
      </div>

      {/* ── 3D Globe：无面板、无渐变，地球直接悬浮在网页底色上 ── */}
      <section className="relative w-full h-[62vh] md:h-[80vh] mt-2">
        <div ref={wrapRef} className="absolute inset-0 cursor-grab active:cursor-grabbing">
          {size.w > 0 && (
            <Globe
              ref={globeRef}
              width={size.w}
              height={size.h}
              backgroundColor="rgba(0,0,0,0)"
              globeImageUrl="/images/shipping/earth-blue-marble.jpg"
              bumpImageUrl="/images/shipping/earth-topology.png"
              showAtmosphere
              atmosphereColor="#aebfc9"
              atmosphereAltitude={0.18}
              onGlobeReady={handleGlobeReady}
              /* 航线（发射速度放慢） */
              arcsData={ARCS}
              arcColor="color"
              arcAltitude="alt"
              arcStroke={0.5}
              arcDashLength={0.4}
              arcDashGap={0.2}
              arcDashAnimateTime={6000}
              arcCurveResolution={64}
              /* 端点 */
              pointsData={POINTS}
              pointColor="color"
              pointAltitude={0.012}
              pointRadius="size"
              pointResolution={10}
              /* 广州脉冲环（节奏同步放慢） */
              ringsData={RINGS}
              ringColor={() => t => `rgba(226,87,26,${(1 - t) * 0.55})`}
              ringMaxRadius={5}
              ringPropagationSpeed={1.1}
              ringRepeatPeriod={2200}
              /* 起始点 / 结束点城市英文名 */
              labelsData={LABELS}
              labelText="text"
              labelColor="color"
              labelSize="size"
              labelAltitude="altitude"
              labelIncludeDot={false}
              labelResolution={2}
            />
          )}
        </div>
      </section>

      {/* ── CTA ── */}
      <section>
        <div className="max-w-[1280px] mx-auto px-6 py-20">
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
