import { useState, useEffect, useRef } from 'react'
import { serviceItems, solutionItems, brandLogos } from './menuData'

// Stroke-icon helper. Multi-subpath strings are split on each "M" (moveto) command.
function Icon({ d, className = 'w-[22px] h-[22px]' }) {
  const parts = d.split(/(?=M)/).map(s => s.trim()).filter(Boolean)
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      {parts.map((p, i) => <path key={i} d={p} />)}
    </svg>
  )
}

export default function CyndiNavbar() {
  const [scrolled, setScrolled] = useState(false)
  const [openMenu, setOpenMenu] = useState(null)   // 'service' | 'solution' | 'brand' | null
  const closeTimer = useRef(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.pageYOffset > 60)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Delayed close so the mouse can travel from the trigger to the fixed/absolute panel
  // without the menu snapping shut (fixes the hover "dead zone").
  function openWith(menu) {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
    setOpenMenu(menu)
  }
  function scheduleClose() {
    closeTimer.current = setTimeout(() => { setOpenMenu(null) }, 260)
  }
  function cancelClose() {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
  }

  const navLink = 'text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors cursor-pointer'

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-white/90 backdrop-blur shadow-[0_1px_0_rgba(0,0,0,0.06)]' : 'bg-white'
      }`}
    >
      <nav className="max-w-7xl mx-auto px-6 lg:px-12 h-20 flex items-center justify-between">
        {/* Logo */}
        <a href="/#top" className="flex items-center gap-3 shrink-0">
          <span className="w-9 h-9 rounded-full bg-stone-900 text-white grid place-items-center text-sm font-bold">C</span>
          <span className="text-xl font-bold tracking-tight text-stone-900">Cyndi</span>
        </a>

        {/* Nav links */}
        <ul className="hidden md:flex items-center" onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
          <li className="relative h-20 flex items-center px-4" onMouseEnter={() => openWith(null)}>
            <a href="/shop.html" className={navLink}>Swag</a>
          </li>

          <li className="relative h-20 flex items-center px-4" onMouseEnter={() => openWith('service')}>
            <span className={navLink}>Service</span>
            {openMenu === 'service' && <SimpleMega items={serviceItems} onEnter={cancelClose} onLeave={scheduleClose} />}
          </li>

          <li className="relative h-20 flex items-center px-4" onMouseEnter={() => openWith('solution')}>
            <span className={navLink}>Solution</span>
            {openMenu === 'solution' && <SimpleMega items={solutionItems} onEnter={cancelClose} onLeave={scheduleClose} />}
          </li>

          <li className="relative h-20 flex items-center px-4" onMouseEnter={() => openWith('brand')}>
            <a href="#brand" className={navLink}>Brand</a>
            {openMenu === 'brand' && <BrandMega onEnter={cancelClose} onLeave={scheduleClose} />}
          </li>
        </ul>

        {/* Lang */}
        <button className="border border-stone-300 rounded-lg px-3.5 py-1.5 text-[13px] font-medium text-stone-900 hover:bg-stone-100 transition-colors flex items-center gap-1.5 shrink-0">
          <span>🌐</span> English <span className="text-[10px]">▼</span>
        </button>
      </nav>
    </header>
  )
}

// ── Service / Solution mega ──
// 支持二级：items 中带 children 的项，hover 展开子菜单（如 Swag Platform > Showcase）
function SimpleMega({ items, onEnter, onLeave }) {
  const [expanded, setExpanded] = useState(null)

  return (
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="absolute right-0 top-full mt-2.5 bg-white border border-stone-200 shadow-[0_20px_50px_rgba(0,0,0,0.12)] p-5 w-[380px]"
    >
      <span className="absolute left-0 right-0 -top-2.5 h-2.5 block" />
      <div className="flex flex-col gap-1">
        {items.map(it => {
          const hasChildren = Array.isArray(it.children) && it.children.length > 0
          const isOpen = expanded === it.title

          if (!hasChildren) {
            return (
              <a key={it.title} href={it.href || '#'} className="group flex items-start gap-3.5 p-3 rounded-xl hover:bg-stone-100 transition-colors">
                <span className="text-stone-500 group-hover:text-[#e07a3a] shrink-0 mt-0.5 transition-colors">
                  <Icon d={it.icon} className="w-6 h-6" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <strong className="text-[15px] font-semibold text-stone-900">{it.title}</strong>
                  <em className="not-italic text-[13px] text-stone-500 leading-snug">{it.blurb}</em>
                </span>
              </a>
            )
          }

          // 带子项：标题本身作为分组头，子项缩进展示
          return (
            <div
              key={it.title}
              className="rounded-xl transition-colors hover:bg-stone-100"
              onMouseEnter={() => setExpanded(it.title)}
            >
              <div className="flex items-start gap-3.5 p-3">
                <span className="text-stone-500 group-hover:text-[#e07a3a] shrink-0 mt-0.5 transition-colors">
                  <Icon d={it.icon} className="w-6 h-6" />
                </span>
                <span className="flex flex-col gap-0.5 flex-1">
                  <strong className="text-[15px] font-semibold text-stone-900 flex items-center gap-1.5">
                    {it.title}
                    <svg
                      width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className={`text-stone-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </strong>
                  <em className="not-italic text-[13px] text-stone-500 leading-snug">{it.blurb}</em>
                </span>
              </div>

              {/* 子项 */}
              <div className="pb-2 pl-12 pr-3 flex flex-col gap-0.5">
                {it.children.map((child) => (
                  <a
                    key={child.title}
                    href={child.href || '#'}
                    className="group flex items-center gap-2 py-2 px-3 rounded-lg text-[14px] text-stone-600 hover:text-[#e07a3a] hover:bg-white transition-colors border-l-2 border-stone-200 hover:border-[#e07a3a]"
                  >
                    {child.icon && (
                      <span className="shrink-0 text-stone-400 group-hover:text-[#e07a3a] transition-colors">
                        <Icon d={child.icon} className="w-4 h-4" />
                      </span>
                    )}
                    <span className="font-medium">{child.title}</span>
                    {child.blurb && (
                      <em className="not-italic text-[12px] text-stone-400 ml-auto">{child.blurb}</em>
                    )}
                  </a>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Brand mega: logo grid ──
function BrandMega({ onEnter, onLeave }) {
  return (
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="absolute right-0 top-full mt-2.5 bg-white border border-stone-200 shadow-[0_20px_50px_rgba(0,0,0,0.12)] p-5 w-[420px]"
    >
      <span className="absolute left-0 right-0 -top-2.5 h-2.5 block" />
      <div className="grid grid-cols-2 gap-3.5">
        {brandLogos.map(b => (
          <a key={b.alt} href="#brand"
            className="group flex items-center justify-center bg-stone-100 border border-stone-200 rounded-xl px-6 py-5 transition-transform hover:-translate-y-0.5">
            <img src={b.src} alt={b.alt} loading="lazy"
              className="max-h-10 w-auto object-contain grayscale opacity-75 group-hover:grayscale-0 group-hover:opacity-100 transition" />
          </a>
        ))}
      </div>
    </div>
  )
}
