import { useState, useEffect } from 'react'
import CyndiNavbar from '../cyndi/CyndiNavbar'

// Warehousing & Fulfillment 服务展示页：复用 CyndiNavbar + 数据亮点带 + 仓库实拍网格 + lightbox。
// 注意：仓库约定 public/images/services/ 下的展示图走 R2（且被 .gitignore 忽略），
// 本页图片量小（4 张 ~1MB），故放在 public/images/warehousing/ 由 Pages 直接托管（同 brands 做法）。

const IMAGES = [
  { src: '/images/warehousing/warehouse-1.jpg', alt: 'Guangzhou warehouse — inbound check beside container loading bay' },
  { src: '/images/warehousing/warehouse-2.jpg', alt: 'Guangzhou warehouse — order verification and labelling' },
  { src: '/images/warehousing/warehouse-3.jpg', alt: 'Guangzhou warehouse — photo record of packed pallets' },
  { src: '/images/warehousing/warehouse-4.jpg', alt: 'Guangzhou warehouse — packed cartons ready for dispatch' },
]

const STATS = [
  { place: 'Guangzhou', desc: '2 owned warehouses' },
  { place: 'HK, London & beyond', desc: 'partner warehouses' },
  { place: '20+ countries', desc: 'served worldwide' },
]

export default function Warehousing() {
  const [lb, setLb] = useState(-1)   // lightbox 当前索引，-1 关闭

  useEffect(() => {
    const onKey = (e) => {
      if (lb < 0) return
      if (e.key === 'Escape') setLb(-1)
      if (e.key === 'ArrowLeft') setLb(i => (i - 1 + IMAGES.length) % IMAGES.length)
      if (e.key === 'ArrowRight') setLb(i => (i + 1) % IMAGES.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lb])

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
        <h1 className="mt-4 text-4xl md:text-5xl font-bold tracking-tight">Warehousing &amp; Fulfillment</h1>
        <p className="mt-3.5 max-w-2xl text-stone-500 leading-relaxed text-[15px]">
          Cyndi Global &mdash; global warehousing &amp; transport solutions, backed by experienced
          logistics, tax, and warehouse experts. Vertically integrated storage, pick &amp; pack
          and kitting &mdash; orders ship the same day.
        </p>
      </div>

      {/* ── Stats band ── */}
      <div className="max-w-[1280px] mx-auto px-6 mt-8">
        <div className="rounded-2xl bg-white ring-1 ring-stone-200/70 shadow-sm grid grid-cols-1 sm:grid-cols-3 sm:divide-x divide-y sm:divide-y-0 divide-stone-100">
          {STATS.map(s => (
            <div key={s.place} className="px-8 py-7">
              <div className="text-xl font-semibold tracking-tight">{s.place}</div>
              <div className="mt-1 text-[14px] text-stone-500">{s.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Gallery ── */}
      <div className="max-w-[1280px] mx-auto px-6 pb-20">
        <section className="mt-11">
          <h2 className="text-xl font-semibold tracking-tight">Inside Our Warehouses</h2>
          <div className="h-px bg-stone-200 my-3.5" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {IMAGES.map((img, i) => (
              <button
                key={img.src}
                onClick={() => setLb(i)}
                className="group relative aspect-[3/4] bg-[#efede8] rounded-xl overflow-hidden"
              >
                <img src={img.src} alt={img.alt} loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* ── CTA ── */}
      <section>
        <div className="max-w-[1280px] mx-auto px-6 pb-20">
          <div className="rounded-2xl bg-white ring-1 ring-stone-200/70 shadow-sm px-6 py-12 sm:px-10 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">Need storage &amp; fulfillment?</h2>
            <p className="mt-2.5 text-stone-500 text-[15px] leading-relaxed max-w-xl mx-auto">
              Tell us your volumes and target markets &mdash; our logistics team will come back
              with a warehousing plan and quote.
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

      {/* Lightbox */}
      {lb >= 0 && IMAGES[lb] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={(e) => { if (e.currentTarget === e.target) setLb(-1) }}
        >
          <span onClick={() => setLb(-1)}
            className="absolute top-5 right-6 text-white text-3xl cursor-pointer leading-none">×</span>
          <span onClick={() => setLb(i => (i - 1 + IMAGES.length) % IMAGES.length)}
            className="absolute left-0 top-1/2 -translate-y-1/2 text-white text-4xl cursor-pointer px-5 opacity-80 hover:opacity-100 select-none">‹</span>
          <img src={IMAGES[lb].src} alt={IMAGES[lb].alt} className="max-w-[92vw] max-h-[88vh] object-contain rounded" />
          <span onClick={() => setLb(i => (i + 1) % IMAGES.length)}
            className="absolute right-0 top-1/2 -translate-y-1/2 text-white text-4xl cursor-pointer px-5 opacity-80 hover:opacity-100 select-none">›</span>
        </div>
      )}
    </div>
  )
}
