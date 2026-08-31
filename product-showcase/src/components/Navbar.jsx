import { useState, useEffect, useRef } from 'react'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import AuthModal from './AuthModal'
import TrackOrderModal from './TrackOrderModal'
import MyOrdersModal from './MyOrdersModal'
import SwagMenu from './SwagMenu'
import { useSearch } from '../context/SearchContext'
import { swagCategories, swagItemLinks } from '../cyndi/menuData'

export default function Navbar() {
  const { cartCount, setIsCartOpen } = useCart()
  const { user, loading, logout } = useAuth()
  const { query, setQuery } = useSearch()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [trackOpen, setTrackOpen] = useState(false)
  const [trackInitial, setTrackInitial] = useState('')
  const [ordersOpen, setOrdersOpen] = useState(false)
  const [swagOpen, setSwagOpen] = useState(false)   // "All Products" 两级目录展开状态
  const swagWrapRef = useRef(null)

  const openTrack = (no = '') => { setTrackInitial(no); setTrackOpen(true) }

  // 点击面板外部时关闭 Swag 两级目录
  useEffect(() => {
    if (!swagOpen) return
    const onDown = (e) => {
      if (swagWrapRef.current && !swagWrapRef.current.contains(e.target)) setSwagOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [swagOpen])

  // Auto-open tracking if the URL carries ?orderNo= (e.g. from the cart success screen).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const no = params.get('orderNo')
    if (no) {
      setTrackInitial(no)
      setTrackOpen(true)
    }
  }, [])

  // 其他组件（如购物车"Sign in to Order"）派发 open-auth 事件时打开登录框
  useEffect(() => {
    const openAuth = () => setAuthOpen(true)
    window.addEventListener('open-auth', openAuth)
    return () => window.removeEventListener('open-auth', openAuth)
  }, [])

  return (
    <header className="sticky top-0 z-40">
      {/* Promo bar */}
      <div className="bg-stone-900 text-stone-100 text-center text-xs py-2 px-4 tracking-wide uppercase">
        Free logo setup on your first order · Fast worldwide shipping
      </div>

      {/* Main nav */}
      <nav ref={swagWrapRef} className="relative bg-[#faf9f6]/95 backdrop-blur border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Back to Cyndi + Logo */}
            <div className="flex items-center gap-4 flex-shrink-0">
              <a
                href="/"
                className="flex items-center gap-1.5 text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors"
                title="Back to Cyndi"
              >
                <span className="text-base leading-none">←</span>
                <span className="hidden sm:inline">Cyndi</span>
              </a>
              <span className="h-5 w-px bg-stone-300 hidden sm:block" />
              <a href="#top" className="flex items-center">
                <span className="font-semibold text-xl text-stone-900 tracking-tight uppercase">
                  Swag
                </span>
              </a>
            </div>

            {/* Desktop category nav */}
            <div className="hidden md:flex items-center gap-6">
              <button
                onClick={() => setSwagOpen(v => !v)}
                aria-expanded={swagOpen}
                className={`flex items-center gap-1 text-sm font-medium transition-colors ${
                  swagOpen ? 'text-stone-900' : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                All Products
                <svg className={`w-3.5 h-3.5 transition-transform ${swagOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            {/* Search (desktop) */}
            <div className="hidden lg:flex items-center flex-1 max-w-xs">
              <div className="relative w-full">
                <svg className="w-4 h-4 absolute left-0 top-1/2 -translate-y-1/2 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search products"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => {
                    // 聚焦搜索时，若不在商品区则跳到商品列表，方便看到过滤结果
                    if (!window.location.hash.startsWith('#product/')) {
                      const el = document.getElementById('products')
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                  }}
                  className="w-full bg-transparent border-b border-stone-300 pl-6 pr-6 py-1.5 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-stone-900 transition-colors"
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    aria-label="Clear search"
                    className="absolute right-0 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-5">
              <button
                onClick={() => setIsCartOpen(true)}
                className="relative text-stone-700 hover:text-stone-900 transition-colors"
                aria-label="Open cart"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                {cartCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-[#b7410e] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                    {cartCount}
                  </span>
                )}
              </button>
              {!loading && (
                user ? (
                  <div className="hidden sm:flex items-center gap-3">
                    <button
                      onClick={() => setOrdersOpen(true)}
                      className="text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors"
                    >
                      My orders
                    </button>
                    <span className="text-sm font-medium text-stone-700" title={user.email}>
                      {user.displayName}
                    </span>
                    <button
                      onClick={logout}
                      className="text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors"
                    >
                      Log out
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAuthOpen(true)}
                    className="hidden sm:block text-sm font-medium text-stone-700 hover:text-stone-900 transition-colors"
                  >
                    Sign in
                  </button>
                )
              )}
              {/* Mobile menu toggle */}
              <button
                className="md:hidden text-stone-800"
                onClick={() => setMobileOpen(v => !v)}
                aria-label="Toggle menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
                </svg>
              </button>
            </div>
          </div>

          {/* Mobile category menu */}
          {mobileOpen && (
            <div className="md:hidden pb-4 flex flex-col gap-1">
              <details className="group">
                <summary className="px-1 py-2 text-sm font-medium text-stone-600 hover:text-stone-900 cursor-pointer list-none flex items-center justify-between">
                  All Products
                  <svg className="w-4 h-4 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="pl-3 pb-2 flex flex-col gap-2 mt-1">
                  {swagCategories.map(c => (
                    <div key={c.name}>
                      <p className="text-xs font-semibold text-stone-900 uppercase tracking-wide mt-2 mb-1">{c.name}</p>
                      <div className="flex flex-col gap-0.5">
                        {c.items.map(item => {
                          const link = swagItemLinks[item]
                          return (
                            <a
                              key={item}
                              href={link || '#'}
                              onClick={() => setMobileOpen(false)}
                              className={`text-sm py-0.5 ${link ? 'text-stone-600 hover:text-stone-900' : 'text-stone-400'}`}
                            >
                              {item}
                            </a>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
              {!loading && (
                user ? (
                  <div className="flex items-center justify-between px-1 py-2 border-t border-stone-200 mt-1">
                    <span className="text-sm font-medium text-stone-700">{user.displayName}</span>
                    <button onClick={logout} className="text-sm font-medium text-stone-500 hover:text-stone-900">Log out</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setMobileOpen(false); setAuthOpen(true) }}
                    className="text-left px-1 py-2 text-sm font-medium text-stone-700 hover:text-stone-900 border-t border-stone-200 mt-1"
                  >
                    Sign in
                  </button>
                )
              )}
            </div>
          )}
        </div>

        {/* All Products -> Swag 两级目录面板（桌面） */}
        {swagOpen && (
          <div className="hidden md:block">
            <SwagMenu onNavigate={() => setSwagOpen(false)} />
          </div>
        )}
      </nav>

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
      <TrackOrderModal isOpen={trackOpen} onClose={() => setTrackOpen(false)} initialOrderNo={trackInitial} />
      <MyOrdersModal
        isOpen={ordersOpen}
        onClose={() => setOrdersOpen(false)}
        onTrack={(no) => { setOrdersOpen(false); openTrack(no) }}
      />
    </header>
  )
}
