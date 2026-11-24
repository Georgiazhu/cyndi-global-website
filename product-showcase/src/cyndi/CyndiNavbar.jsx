import { useState, useEffect, useRef } from 'react'
import { serviceItems, solutionItems, brandLogos, swagCategories, swagItemLinks } from './menuData'

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

// Small chevron on the top-level triggers; rotates when its panel is open.
function NavChevron({ open }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      className={`w-3 h-3 shrink-0 transition-all duration-200 ${open ? 'rotate-180 text-oat' : 'text-stone-400'}`}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

// Shared animated dropdown shell. Kept mounted so enter/exit can transition
// (opacity + slight slide) instead of snapping in and out via conditional render.
function MegaShell({ open, children, width, align = 'right' }) {
  const edge = align === 'left' ? 'left-0 origin-top-left' : 'right-0 origin-top-right'
  return (
    <div
      aria-hidden={!open}
      className={`absolute top-full -mt-4 z-50 pt-1.5 transition-all duration-200 ease-out ${edge} ${width} ${
        open
          ? 'opacity-100 translate-y-0 visible pointer-events-auto'
          : 'opacity-0 -translate-y-2 invisible pointer-events-none'
      }`}
    >
      {/* invisible bridge over the gap so the pointer can travel trigger -> panel */}
      <span className="absolute left-0 right-0 top-0 h-1.5 block" />
      {children}
    </div>
  )
}

export default function CyndiNavbar() {
  const [scrolled, setScrolled] = useState(false)
  const [openMenu, setOpenMenu] = useState(null)   // 'swag' | 'service' | 'solution' | 'brand' | null
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

  // Top-level trigger: active state = tinted pill + orange underline + chevron flip.
  const triggerCls = (active) =>
    `relative flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
      active ? 'text-stone-900 bg-stone-100' : 'text-stone-600 hover:text-stone-900 hover:bg-stone-50'
    }`

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-white/90 backdrop-blur shadow-[0_1px_0_rgba(0,0,0,0.06)]' : 'bg-white'
      }`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 h-20 flex items-center justify-between gap-3">
        {/* Logo — scroll-collapse: the wordmark folds into the mark on scroll (Anthropic-style),
            then unfolds when back at the top. */}
        <a href="/#top" aria-label="Cyndi Global home" className="flex items-center shrink-0 overflow-hidden">
          <img src="/cyndi-logo-mark-v5.png" alt="" className="h-8 w-auto shrink-0" />
          <span
            className="inline-flex items-center overflow-hidden whitespace-nowrap motion-reduce:transition-none transition-[max-width,opacity,transform] duration-[450ms] ease-[cubic-bezier(.65,0,.35,1)]"
            style={{
              maxWidth: scrolled ? '0px' : '140px',
              opacity: scrolled ? 0 : 1,
              transform: scrolled ? 'translateX(-14px) scaleX(.55)' : 'translateX(0) scaleX(1)',
              transformOrigin: 'left center',
            }}
          >
            <img src="/cyndi-logo-word-v5.png" alt="" className="h-8 w-auto" />
          </span>
        </a>

        {/* Nav links */}
        <ul className="hidden md:flex items-center gap-1" onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
          <li className="relative h-20 flex items-center" onMouseEnter={() => openWith('swag')}>
            <button type="button" className={triggerCls(openMenu === 'swag')} aria-expanded={openMenu === 'swag'}>
              Swag <NavChevron open={openMenu === 'swag'} />
            </button>
            <span className={`pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-3 h-0.5 rounded-full bg-oat transition-all duration-200 ${openMenu === 'swag' ? 'w-6 opacity-100' : 'w-0 opacity-0'}`} />
            <MegaShell open={openMenu === 'swag'} width="w-[560px]" align="left">
              <SwagMega />
            </MegaShell>
          </li>

          <li className="relative h-20 flex items-center" onMouseEnter={() => openWith('service')}>
            <button type="button" className={triggerCls(openMenu === 'service')} aria-expanded={openMenu === 'service'}>
              Service <NavChevron open={openMenu === 'service'} />
            </button>
            <span className={`pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-3 h-0.5 rounded-full bg-oat transition-all duration-200 ${openMenu === 'service' ? 'w-6 opacity-100' : 'w-0 opacity-0'}`} />
            <MegaShell open={openMenu === 'service'} width="w-[392px]">
              <SimpleMega items={serviceItems} />
            </MegaShell>
          </li>

          <li className="relative h-20 flex items-center" onMouseEnter={() => openWith('solution')}>
            <button type="button" className={triggerCls(openMenu === 'solution')} aria-expanded={openMenu === 'solution'}>
              Solution <NavChevron open={openMenu === 'solution'} />
            </button>
            <span className={`pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-3 h-0.5 rounded-full bg-oat transition-all duration-200 ${openMenu === 'solution' ? 'w-6 opacity-100' : 'w-0 opacity-0'}`} />
            <MegaShell open={openMenu === 'solution'} width="w-[392px]">
              <SimpleMega items={solutionItems} />
            </MegaShell>
          </li>

          <li className="relative h-20 flex items-center" onMouseEnter={() => openWith('brand')}>
            <button type="button" className={triggerCls(openMenu === 'brand')} aria-expanded={openMenu === 'brand'}>
              Brand <NavChevron open={openMenu === 'brand'} />
            </button>
            <span className={`pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-3 h-0.5 rounded-full bg-oat transition-all duration-200 ${openMenu === 'brand' ? 'w-6 opacity-100' : 'w-0 opacity-0'}`} />
            <MegaShell open={openMenu === 'brand'} width="w-[420px]">
              <div className="-mt-1">
                <BrandMega />
              </div>
            </MegaShell>
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
            <span className="text-oat text-[15px] leading-none">↗</span>
          </span>
          <span className="block mt-1 text-[12px] leading-snug text-stone-500">Product proposals</span>
        </a>
        <a href="/admin/" onClick={onNavigate}
          className="rounded-xl border border-stone-200 bg-[#faf9f6] p-3.5 active:bg-stone-100 transition-colors">
          <span className="flex items-center justify-between gap-1">
            <strong className="text-[15px] font-semibold text-stone-900">Admin</strong>
            <span className="text-oat text-[15px] leading-none">↗</span>
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
// Rich rows: icon chip, title + blurb, slide-in arrow, press feedback.
// Items with children expand their sub-list inline with a smooth max-height transition.
function SimpleMega({ items }) {
  const [expanded, setExpanded] = useState(null)

  return (
    <div className="bg-white border border-stone-200 rounded-2xl shadow-[0_24px_60px_-12px_rgba(0,0,0,0.18)] p-2.5 overflow-hidden">
      <div className="flex flex-col gap-0.5" onMouseLeave={() => setExpanded(null)}>
        {items.map(it => {
          const hasChildren = Array.isArray(it.children) && it.children.length > 0
          const isOpen = expanded === it.title
          const iconChip = (hover) =>
            `w-11 h-11 rounded-xl grid place-items-center shrink-0 transition-all duration-200 ${hover
              ? 'bg-white text-oat shadow-sm'
              : 'bg-stone-100 text-stone-500'}`

          if (!hasChildren) {
            return (
              <a key={it.title} href={it.href || '#'}
                onMouseEnter={() => setExpanded(null)}
                className="group relative flex items-center gap-3 p-2.5 rounded-xl transition-all duration-200 hover:bg-[#fdf5ef] active:scale-[0.98] active:bg-[#fbe7d7]">
                <span className={iconChip(false)}>
                  <Icon d={it.icon} className="w-5 h-5" />
                </span>
                <span className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <strong className="text-[15px] font-semibold text-stone-900 transition-colors duration-200 group-hover:text-[#b7410e]">{it.title}</strong>
                  <em className="not-italic text-[12.5px] text-stone-500 leading-snug">{it.blurb}</em>
                </span>
                <span className="text-oat text-lg leading-none opacity-0 -translate-x-2 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0">›</span>
              </a>
            )
          }

          // Group header with children (e.g. Swag Platform > Showcase)
          return (
            <div key={it.title}
              className={`rounded-xl transition-all duration-200 ${isOpen ? 'bg-[#fdf5ef]' : ''}`}
              onMouseEnter={() => setExpanded(it.title)}>
              <button type="button" onClick={() => setExpanded(isOpen ? null : it.title)}
                className="w-full flex items-center gap-3 p-2.5 text-left">
                <span className={iconChip(isOpen)}>
                  <Icon d={it.icon} className="w-5 h-5" />
                </span>
                <span className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <strong className={`text-[15px] font-semibold flex items-center gap-1.5 transition-colors ${isOpen ? 'text-[#b7410e]' : 'text-stone-900'}`}>
                    {it.title}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className={`text-stone-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </strong>
                  <em className="not-italic text-[12.5px] text-stone-500 leading-snug">{it.blurb}</em>
                </span>
              </button>

              {/* children list, animated open/close */}
              <div className={`overflow-hidden transition-all duration-200 ${isOpen ? 'max-h-32 opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="pb-2 pl-[68px] pr-3 flex flex-col gap-0.5">
                  {it.children.map((child) => (
                    <a key={child.title} href={child.href || '#'}
                      className="group flex items-center gap-2 py-2 px-3 rounded-lg text-[13px] text-stone-600 transition-all duration-200 hover:text-[#b7410e] hover:bg-white hover:shadow-sm active:scale-[0.98]">
                      <span className="w-1.5 h-1.5 rounded-full bg-stone-300 group-hover:bg-oat transition-colors shrink-0" />
                      <span className="font-medium">{child.title}</span>
                      {child.blurb && <em className="not-italic text-[11px] text-stone-400 ml-auto">{child.blurb}</em>}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Swag mega: category grid ──
// Groups swagCategories into a compact multi-column grid; every item that has a
// matching anchor in swagItemLinks links straight to that shop section.
function SwagMega() {
  const columns = [swagCategories.slice(0, 3), swagCategories.slice(3, 6), swagCategories.slice(6)]
  return (
    <div className="bg-white border border-stone-200 rounded-2xl shadow-[0_24px_60px_-12px_rgba(0,0,0,0.18)] p-4">
      <a href="/shop.html"
        className="group mb-3 flex items-center justify-between rounded-xl bg-stone-900 px-4 py-3 transition-colors hover:bg-stone-800">
        <span className="flex items-center gap-2.5">
          <Icon d="M4 7h16l-1 13H5z M9 7V5a3 3 0 0 1 6 0v2" className="w-5 h-5 text-white" />
          <strong className="text-[14px] font-semibold text-white">Shop all swag</strong>
        </span>
        <span className="text-white/80 text-lg leading-none transition-transform duration-200 group-hover:translate-x-1">›</span>
      </a>
      <div className="grid grid-cols-3 gap-x-4 gap-y-1">
        {columns.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-0.5">
            {col.map(cat => (
              <div key={cat.name} className="rounded-lg px-2 py-1.5 hover:bg-[#fdf5ef] transition-colors">
                <p className="flex items-center gap-2 text-[13px] font-semibold text-stone-900">
                  <Icon d={cat.icon} className="w-4 h-4 text-oat" />
                  {cat.name}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-y-0.5 pl-6">
                  {cat.items.map((item, ii) => {
                    const href = swagItemLinks[item]
                    const node = href
                      ? <a key={item} href={href} className="text-[11px] leading-snug text-stone-500 hover:text-[#b7410e]">{item}</a>
                      : <span key={item} className="text-[11px] leading-snug text-stone-400">{item}</span>
                    return ii < cat.items.length - 1
                      ? <span key={item + '-w'} className="inline-flex items-center">{node}<span className="mx-1 text-stone-300">·</span></span>
                      : node
                    })}
                </p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Brand mega: logo grid ──
function BrandMega() {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl shadow-[0_24px_60px_-12px_rgba(0,0,0,0.18)] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400 mb-3 px-1">Featured brands</p>
      <div className="grid grid-cols-2 gap-2.5">
        {brandLogos.map(b => (
          <a key={b.alt} href="#brand"
            className="group relative flex items-center justify-center bg-[#faf9f6] border border-stone-200 rounded-xl px-6 py-5 transition-all duration-200 hover:border-[#eaa177] hover:bg-white hover:shadow-md hover:-translate-y-0.5 active:scale-[0.97] active:shadow-sm">
            <img src={b.src} alt={b.alt} loading="lazy"
              className="max-h-10 w-auto object-contain grayscale opacity-75 group-hover:grayscale-0 group-hover:opacity-100 transition duration-200" />
            <span className="absolute top-2 right-2 text-oat text-sm leading-none opacity-0 -translate-y-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0">↗</span>
          </a>
        ))}
      </div>
    </div>
  )
}
