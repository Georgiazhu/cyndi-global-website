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
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileSection, setMobileSection] = useState(null)  // expanded accordion section
  const closeTimer = useRef(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.pageYOffset > 60)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { setMobileOpen(false); setOpenMenu(null) }
    }
    const onResize = () => { if (window.innerWidth >= 768) setMobileOpen(false) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // The mobile panel scrolls internally; freeze the page behind it while open.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  function closeMobile() {
    setMobileOpen(false)
    setMobileSection(null)
  }
  function toggleMobileSection(key) {
    setMobileSection(cur => cur === key ? null : key)
  }

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
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 h-20 flex items-center justify-between gap-3">
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

        {/* Language + mobile menu toggle */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button className="border border-stone-300 rounded-lg px-2.5 sm:px-3.5 py-1.5 text-[12px] sm:text-[13px] font-medium text-stone-900 hover:bg-stone-100 transition-colors flex items-center gap-1.5 shrink-0">
            <span>🌐</span> English <span className="text-[10px]">▼</span>
          </button>
          <button
            type="button"
            className="md:hidden grid place-items-center w-10 h-10 rounded-lg border border-stone-300 text-stone-900 hover:bg-stone-100 transition-colors"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            aria-controls="cyndi-mobile-menu"
            onClick={() => setMobileOpen(v => !v)}
          >
            {mobileOpen
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="w-5 h-5"><path d="M6 6l12 12M18 6L6 18" /></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="w-5 h-5"><path d="M4 7h16M4 12h16M4 17h16" /></svg>}
          </button>
        </div>
      </nav>

      {/* Mobile menu: the desktop <ul> above is hidden below md, so without this
          panel phones have no way to reach the shop, Showcase or the admin console. */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 top-20 bg-stone-900/25 z-40"
            onClick={closeMobile}
            aria-hidden="true"
          />
          <div
            id="cyndi-mobile-menu"
            className="md:hidden absolute top-full left-0 right-0 z-50 bg-white border-t border-stone-200 shadow-[0_20px_40px_rgba(0,0,0,0.12)] max-h-[calc(100dvh-80px)] overflow-y-auto overscroll-contain"
          >
            <MobileMenu section={mobileSection} onToggle={toggleMobileSection} onNavigate={closeMobile} />
          </div>
        </>
      )}
    </header>
  )
}

// ── Mobile menu (shown below md) ──
// The desktop <ul> is hidden on phones. This accordion keeps every desktop
// section reachable and puts the two working destinations (Showcase and the
// admin console) at the top as tappable cards.
function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" className="w-4 h-4 text-stone-400 shrink-0">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  )
}
function ChevronIcon({ open }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"
      className={`w-4 h-4 text-stone-400 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}
function MobileMenu({ section, onToggle, onNavigate }) {
  const row = 'flex items-center justify-between min-h-[48px] px-1 text-[15px] font-medium text-stone-900 border-b border-stone-100'
  const sub = 'flex items-center justify-between min-h-[42px] py-2 pl-3 pr-1 text-[14px] text-stone-600 border-b border-stone-100'

  return (
    <nav aria-label="Mobile menu" className="px-5 py-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400 mb-3">Platform</p>
      <div className="grid grid-cols-2 gap-2.5">
        <a href="/showcase/" onClick={onNavigate}
          className="rounded-xl border border-stone-200 bg-[#faf9f6] p-3.5 active:bg-stone-100 transition-colors">
          <span className="flex items-center justify-between gap-1">
            <strong className="text-[15px] font-semibold text-stone-900">Showcase</strong>
            <span className="text-[#e07a3a] text-[15px] leading-none">↗</span>
          </span>
          <span className="block mt-1 text-[12px] leading-snug text-stone-500">Product proposals</span>
        </a>
        <a href="/admin/" onClick={onNavigate}
          className="rounded-xl border border-stone-200 bg-[#faf9f6] p-3.5 active:bg-stone-100 transition-colors">
          <span className="flex items-center justify-between gap-1">
            <strong className="text-[15px] font-semibold text-stone-900">Admin</strong>
            <span className="text-[#e07a3a] text-[15px] leading-none">↗</span>
          </span>
          <span className="block mt-1 text-[12px] leading-snug text-stone-500">Admin console</span>
        </a>
      </div>

      <div className="mt-5">
        <a href="/shop.html" onClick={onNavigate} className={row}>Swag <ArrowIcon /></a>

        <button type="button" onClick={() => onToggle('service')} aria-expanded={section === 'service'}
          className={`w-full ${row}`}>
          Service <ChevronIcon open={section === 'service'} />
        </button>
        {section === 'service' && (
          <div className="pb-2">
            {serviceItems.map(it => (
              <div key={it.title}>
                {it.href
                  ? <a href={it.href} onClick={onNavigate} className={sub}>{it.title}<ArrowIcon /></a>
                  : <div className={`${sub} text-stone-500`}>{it.title}</div>}
                {(it.children || []).map(ch => (
                  <a key={ch.title} href={ch.href || '#'} onClick={onNavigate}
                    className={`${sub} pl-6 text-[13px] text-[#b7410e]`}>
                    {ch.title}<span className="text-[11px] text-stone-400">{ch.blurb}</span>
                  </a>
                ))}
              </div>
            ))}
          </div>
        )}

        <button type="button" onClick={() => onToggle('solution')} aria-expanded={section === 'solution'}
          className={`w-full ${row}`}>
          Solution <ChevronIcon open={section === 'solution'} />
        </button>
        {section === 'solution' && (
          <div className="pb-2">
            {solutionItems.map(it => (
              <div key={it.title} className="flex items-start gap-2 py-2.5 pl-3 pr-1 border-b border-stone-100">
                <span className="text-[14px] text-stone-700">{it.title}</span>
                <span className="text-[11px] leading-snug text-stone-400 ml-auto text-right max-w-[55%]">{it.blurb}</span>
              </div>
            ))}
          </div>
        )}

        <button type="button" onClick={() => onToggle('brand')} aria-expanded={section === 'brand'}
          className={`w-full ${row}`}>
          Brand <ChevronIcon open={section === 'brand'} />
        </button>
        {section === 'brand' && (
          <div className="grid grid-cols-2 gap-2 py-3">
            {brandLogos.map(b => (
              <span key={b.alt} className="rounded-lg bg-stone-100 px-3 py-2.5 text-[13px] text-stone-600 text-center">
                {b.alt}
              </span>
            ))}
          </div>
        )}

        <a href="#contact" onClick={onNavigate} className={`${row} border-b-0`}>Contact <ArrowIcon /></a>
      </div>
      <p className="mt-3 text-[11px] text-stone-400">Cyndi Global · Global Swag &amp; Brand Management</p>
    </nav>
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
