import { useEffect, useRef, useState } from 'react'
import Globe from 'react-globe.gl'
import CyndiNavbar from '../cyndi/CyndiNavbar'

// Shipping 服务页：可鼠标拖拽旋转的 3D 地球 + 广州出发的运输航线弧。
// 球体上不渲染任何文字（labelsData 恒为空、不给任何 *Label 访问器）。
// 贴图自托管在 public/images/shipping/（来源 three-globe 官方示例，NASA 影像）。

const GZ = { lat: 23.1291, lng: 113.2644 }   // Guangzhou

// 短程（亚洲）与远程（欧美）两组，用颜色区分，避免任何文字标注。
const SHORT = '#ffc271'
const LONG = '#ff7a2f'

const DESTINATIONS = [
  // 亚洲 / 东南亚
  { lat: 1.3521, lng: 103.8198, color: SHORT },      // Singapore
  { lat: 22.3193, lng: 114.1694, color: SHORT },     // Hong Kong
  { lat: 3.1390, lng: 101.6869, color: SHORT },      // Malaysia — Kuala Lumpur
  { lat: 5.4141, lng: 100.3288, color: SHORT },      // Malaysia — Penang
  { lat: 1.4927, lng: 103.7414, color: SHORT },      // Malaysia — Johor Bahru
  { lat: 13.7563, lng: 100.5018, color: SHORT },     // Thailand — Bangkok
  { lat: 18.7883, lng: 98.9853, color: SHORT },      // Thailand — Chiang Mai
  { lat: 7.8804, lng: 98.3923, color: SHORT },       // Thailand — Phuket
  { lat: 21.0278, lng: 105.8342, color: SHORT },     // Vietnam — Hanoi
  { lat: 10.8231, lng: 106.6297, color: SHORT },     // Vietnam — Ho Chi Minh City
  // 欧美
  { lat: 51.5074, lng: -0.1278, color: LONG },       // London
  { lat: 48.8566, lng: 2.3522, color: LONG },        // Paris
  { lat: 52.3676, lng: 4.9041, color: LONG },        // Netherlands — Amsterdam
  { lat: 51.9244, lng: 4.4777, color: LONG },        // Netherlands — Rotterdam
  { lat: 34.0522, lng: -118.2437, color: LONG },     // CA
  { lat: 32.7767, lng: -96.7970, color: LONG },      // TX
  { lat: 40.7128, lng: -74.0060, color: LONG },      // NY
  { lat: 25.7617, lng: -80.1918, color: LONG },      // FL
  { lat: 41.8781, lng: -87.6298, color: LONG },      // IL
  { lat: 39.9526, lng: -75.1652, color: LONG },      // PA
]

const ARCS = DESTINATIONS.map(d => ({
  startLat: GZ.lat, startLng: GZ.lng,
  endLat: d.lat, endLng: d.lng,
  color: d.color,
  alt: Math.min(0.55, 0.06 + haversine(GZ, d) / 22000),
}))

const POINTS = [
  { lat: GZ.lat, lng: GZ.lng, color: '#ffffff', size: 0.42 },
  ...DESTINATIONS.map(d => ({ lat: d.lat, lng: d.lng, color: d.color, size: 0.24 })),
]

// 广州出发的脉冲环（纯图形，无文字）
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
  // 提亮暗色贴图、空闲自转；禁用缩放/平移，避免滚轮被地球“吃掉”导致页面无法滚动
  function handleGlobeReady() {
    const g = globeRef.current
    if (!g) return
    try {
      g.lights().forEach(l => {
        if (l.isAmbientLight) l.intensity = 2.4
        else if (l.isDirectionalLight) l.intensity = 1.5
      })
    } catch { /* 光照配置失败不影响渲染 */ }
    try {
      const c = g.controls()
      if (c) {
        c.autoRotate = true
        c.autoRotateSpeed = 0.45
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
          Guangzhou warehouses to Asia, Europe and North America &mdash; by sea and by air.
        </p>
      </div>

      {/* ── 3D Globe（区域内无任何文字） ── */}
      <section
        className="relative w-full h-[62vh] md:h-[80vh] overflow-hidden"
        style={{ background: 'radial-gradient(circle at 50% 45%, #122038 0%, #05080f 68%)' }}
      >
        <div ref={wrapRef} className="absolute inset-0 cursor-grab active:cursor-grabbing">
          {size.w > 0 && (
            <Globe
              ref={globeRef}
              width={size.w}
              height={size.h}
              backgroundColor="rgba(0,0,0,0)"
              globeImageUrl="/images/shipping/earth-dark.jpg"
              bumpImageUrl="/images/shipping/earth-topology.png"
              showAtmosphere
              atmosphereColor="#5b8fd6"
              atmosphereAltitude={0.18}
              onGlobeReady={handleGlobeReady}
              /* 航线 */
              arcsData={ARCS}
              arcColor="color"
              arcAltitude="alt"
              arcStroke={0.45}
              arcDashLength={0.45}
              arcDashGap={0.18}
              arcDashAnimateTime={2400}
              arcCurveResolution={64}
              /* 端点（无标签） */
              pointsData={POINTS}
              pointColor="color"
              pointAltitude={0.012}
              pointRadius="size"
              pointResolution={10}
              /* 广州脉冲环 */
              ringsData={RINGS}
              ringColor={() => t => `rgba(255,255,255,${(1 - t) * 0.5})`}
              ringMaxRadius={5}
              ringPropagationSpeed={2.2}
              ringRepeatPeriod={1100}
              /* 明确不渲染任何文字 */
              labelsData={[]}
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
