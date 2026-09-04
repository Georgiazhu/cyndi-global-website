import { useState, useEffect } from 'react'
import CyndiNavbar from '../cyndi/CyndiNavbar'

// 展示页图片托管在 R2（img.cyndiglobal.com），不进 git、不随 Pages 部署。
const IMG_BASE = 'https://img.cyndiglobal.com'
const withBase = (p) => (typeof p === 'string' && p.startsWith('/images/')) ? IMG_BASE + p : p

// Office Furniture Procurement 作品展示页：复用 CyndiNavbar 顶部导航 + 按品类分区网格 + lightbox。
export default function OfficeFurniture() {
  const [cats, setCats] = useState([])
  const [flat, setFlat] = useState([])
  const [lb, setLb] = useState(-1)   // lightbox 当前索引，-1 关闭

  useEffect(() => {
    fetch('/images/services/office-furniture-manifest.json')
      .then(r => r.json())
      .then(raw => {
        const data = raw.map(c => ({ ...c, images: c.images.map(withBase) }))
        setCats(data)
        setFlat(data.flatMap(c => c.images))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (lb < 0) return
      if (e.key === 'Escape') setLb(-1)
      if (e.key === 'ArrowLeft') setLb(i => (i - 1 + flat.length) % flat.length)
      if (e.key === 'ArrowRight') setLb(i => (i + 1) % flat.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lb, flat.length])

  const indexOf = (src) => flat.indexOf(src)

  return (
    <div className="min-h-screen bg-[#faf9f6] text-stone-900">
      <CyndiNavbar />

      <div id="top" className="max-w-[1280px] mx-auto px-6 pt-28 pb-6">
        <a href="/#top"
          className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-400 hover:bg-stone-50 hover:text-stone-900">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
          Back to Home
        </a>
        <h1 className="mt-4 text-4xl md:text-5xl font-bold tracking-tight">Office Furniture Procurement</h1>
        <p className="mt-3.5 max-w-2xl text-stone-500 leading-relaxed text-[15px]">
          We source and outfit workspaces end to end — reception seating, workstations, cubicles,
          private offices and conference rooms. A selection of past work below.
        </p>
      </div>

      <div className="max-w-[1280px] mx-auto px-6 pb-20">
        {cats.map((cat) => (
          <section key={cat.title} className="mt-11">
            <h2 className="text-xl font-semibold tracking-tight">{cat.title}</h2>
            <div className="h-px bg-stone-200 my-3.5" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {cat.images.map((src) => (
                <button
                  key={src}
                  onClick={() => setLb(indexOf(src))}
                  className="group relative aspect-square bg-[#efede8] rounded-xl overflow-hidden"
                >
                  <img src={src} alt={cat.title} loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Manufacturing Partners */}
      <section>
        <div className="max-w-[1280px] mx-auto px-6 py-16">
          <div className="rounded-2xl bg-white ring-1 ring-stone-200/70 shadow-sm px-6 py-10 sm:px-10">
            <img
              src="https://img.cyndiglobal.com/images/services/office-furniture/manufacturing-partners.png"
              alt="A Few of Our Manufacturing Partners: HON, AIS, OFS, SitOnIt Seating, AMQ, Enwork, Kimball International, Encore, Arcadia, HAT Collective, Via Seating, COE, FLOR, Global, Design Within Reach, Clear Design, Blu Dot, Groupe Lacasse"
              loading="lazy"
              className="w-full max-w-4xl mx-auto"
            />
          </div>
        </div>
      </section>

      <footer className="border-t border-stone-200 py-8 text-center text-stone-500 text-[13px]">
        © 2026 Cyndi Global Limited · Hong Kong
      </footer>

      {/* Lightbox */}
      {lb >= 0 && flat[lb] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={(e) => { if (e.currentTarget === e.target) setLb(-1) }}
        >
          <span onClick={() => setLb(-1)}
            className="absolute top-5 right-6 text-white text-3xl cursor-pointer leading-none">×</span>
          <span onClick={() => setLb(i => (i - 1 + flat.length) % flat.length)}
            className="absolute left-0 top-1/2 -translate-y-1/2 text-white text-4xl cursor-pointer px-5 opacity-80 hover:opacity-100 select-none">‹</span>
          <img src={flat[lb]} alt="" className="max-w-[92vw] max-h-[88vh] object-contain rounded" />
          <span onClick={() => setLb(i => (i + 1) % flat.length)}
            className="absolute right-0 top-1/2 -translate-y-1/2 text-white text-4xl cursor-pointer px-5 opacity-80 hover:opacity-100 select-none">›</span>
        </div>
      )}
    </div>
  )
}
