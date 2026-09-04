import { useState, useEffect } from 'react'
import CyndiNavbar from '../cyndi/CyndiNavbar'

// 展示页图片托管在 R2（img.cyndiglobal.com），不进 git、不随 Pages 部署。
// manifest 里存相对路径，运行时统一加此前缀。
const IMG_BASE = 'https://img.cyndiglobal.com'
const withBase = (p) => (typeof p === 'string' && p.startsWith('/images/')) ? IMG_BASE + p : p
// 递归给 manifest 里所有图路径加前缀
const rebase = (cats) => cats.map(c => ({
  ...c,
  cover: withBase(c.cover),
  projects: (c.projects || []).map(p => ({ ...p, images: p.images.map(withBase) })),
}))

// Booth Construction / Exhibit Fabrication
//  - 无 ?cat=  → 目录页：3 个分类入口卡片
//  - ?cat=full-scale|booth|components → 该分类详情页
//      full-scale / booth：按案例(project)分排，每案例标题 + 一排图
//      components：2×2 大图网格 + 副标题
//  所有图可点开放大 lightbox（黑底大图 + ‹ › 翻页 + Esc 关）
export default function ExhibitFabrication() {
  const [cats, setCats] = useState([])
  const params = new URLSearchParams(window.location.search)
  const catSlug = params.get('cat')

  useEffect(() => {
    fetch('/images/services/exhibit-fabrication-manifest.json')
      .then(r => r.json())
      .then(data => setCats(rebase(data)))
      .catch(() => {})
  }, [])

  const current = catSlug ? cats.find(c => c.slug === catSlug) : null

  return (
    <div className="min-h-screen bg-[#faf9f6] text-stone-900">
      <CyndiNavbar />
      {catSlug
        ? <CategoryDetail cat={current} />
        : <CategoryIndex cats={cats} />}
      <footer className="border-t border-stone-200 py-8 text-center text-stone-500 text-[13px]">
        © 2026 Cyndi Global Limited · Hong Kong
      </footer>
    </div>
  )
}

// ---- 目录页：3 个分类入口 ----
function CategoryIndex({ cats }) {
  return (
    <>
      <div id="top" className="max-w-[1280px] mx-auto px-6 pt-28 pb-6">
        <a href="/#top"
          className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-400 hover:bg-stone-50 hover:text-stone-900">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
          Back to Home
        </a>
        <h1 className="mt-4 text-4xl md:text-5xl font-bold tracking-tight">Booth Construction &amp; Exhibit Fabrication</h1>
        <p className="mt-3.5 max-w-2xl text-stone-500 leading-relaxed text-[15px]">
          From full-scale trade-show booths to compact displays and custom lightbox assemblies —
          we design, build and finish exhibits end to end.
        </p>
      </div>
      <div className="max-w-[1280px] mx-auto px-6 pb-24 grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
        {cats.map((cat) => (
          <a key={cat.slug} href={`?cat=${cat.slug}`} className="group block">
            <div className="relative aspect-[4/3] bg-[#efede8] rounded-2xl overflow-hidden">
              <img src={cat.cover} alt={cat.title} loading="lazy"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/0" />
              <h2 className="absolute left-5 bottom-4 right-5 text-white text-xl font-semibold tracking-tight">{cat.title}</h2>
            </div>
            <p className="mt-2.5 text-sm text-stone-500 leading-relaxed">{cat.blurb}</p>
          </a>
        ))}
      </div>
    </>
  )
}

// ---- 分类详情页 ----
function CategoryDetail({ cat }) {
  const [lb, setLb] = useState(-1)
  const flat = cat ? cat.projects.flatMap(p => p.images.map(src => ({ src, name: p.name }))) : []

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

  if (!cat) {
    return <div className="max-w-[1280px] mx-auto px-6 pt-28 pb-24 text-stone-500">Loading…</div>
  }

  const indexOf = (src) => flat.findIndex(x => x.src === src)
  const isGrid = cat.layout === 'grid'

  return (
    <>
      <div id="top" className="max-w-[1280px] mx-auto px-6 pt-28 pb-6">
        <a href="?"
          className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-400 hover:bg-stone-50 hover:text-stone-900">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
          All Exhibit Fabrication
        </a>
        <h1 className="mt-4 text-4xl md:text-5xl font-bold tracking-tight">{cat.title}</h1>
        {cat.subtitle && <p className="mt-3.5 max-w-2xl text-stone-500 leading-relaxed text-[15px]">{cat.subtitle}</p>}
      </div>

      <div className="max-w-[1280px] mx-auto px-6 pb-20">
        {isGrid ? (
          // Exhibit Components：2×2 起的大图网格
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {flat.map(({ src }) => (
              <button key={src} onClick={() => setLb(indexOf(src))}
                className="group relative aspect-[4/3] bg-[#efede8] rounded-2xl overflow-hidden">
                <img src={src} alt={cat.title} loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
              </button>
            ))}
          </div>
        ) : (
          // Full-Scale / Booth：按案例分排
          cat.projects.map((proj) => (
            <div key={proj.name} className="mt-9 first:mt-2">
              <h2 className="text-lg font-semibold tracking-tight">{proj.name}</h2>
              <div className="h-px bg-stone-200 mt-3 mb-4" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {proj.images.map((src) => (
                  <button key={src} onClick={() => setLb(indexOf(src))}
                    className="group relative aspect-square bg-[#efede8] rounded-xl overflow-hidden">
                    <img src={src} alt={proj.name} loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Lightbox */}
      {lb >= 0 && flat[lb] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={(e) => { if (e.currentTarget === e.target) setLb(-1) }}>
          <div className="absolute top-5 left-0 right-0 flex items-center justify-between px-6 text-white">
            <span className="text-sm font-medium">{flat[lb].name} · {lb + 1}/{flat.length}</span>
            <span onClick={() => setLb(-1)} className="text-3xl cursor-pointer leading-none">×</span>
          </div>
          <span onClick={() => setLb(i => (i - 1 + flat.length) % flat.length)}
            className="absolute left-0 top-1/2 -translate-y-1/2 text-white text-4xl cursor-pointer px-5 opacity-80 hover:opacity-100 select-none">‹</span>
          <img src={flat[lb].src} alt="" className="max-w-[92vw] max-h-[84vh] object-contain rounded" />
          <span onClick={() => setLb(i => (i + 1) % flat.length)}
            className="absolute right-0 top-1/2 -translate-y-1/2 text-white text-4xl cursor-pointer px-5 opacity-80 hover:opacity-100 select-none">›</span>
        </div>
      )}
    </>
  )
}
