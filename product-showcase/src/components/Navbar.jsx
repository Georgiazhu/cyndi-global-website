import { useState, useEffect } from 'react'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import AuthModal from './AuthModal'
import TrackOrderModal from './TrackOrderModal'
import MyOrdersModal from './MyOrdersModal'
import { groupOrder } from '../data/products'

// 顶部品类菜单：All Products + 一级品类（Apparel / Headwear），锚点指向 group div
const categories = [
  { label: 'All Products', href: '#products' },
  ...groupOrder.map(g => ({ label: g.group, href: `#${g.group.toLowerCase()}` })),
]

export default function Navbar() {
  const { cartCount, setIsCartOpen } = useCart()
  const { user, loading, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [trackOpen, setTrackOpen] = useState(false)
  const [trackInitial, setTrackInitial] = useState('')
  const [ordersOpen, setOrdersOpen] = useState(false)

  const openTrack = (no = '') => { setTrackInitial(no); setTrackOpen(true) }

  // Auto-open tracking if the URL carries ?orderNo= (e.g. from the cart success screen).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const no = params.get('orderNo')
    if (no) {
      setTrackInitial(no)
      setTrackOpen(true)
    }
  }, [])

  return (
    <header className="sticky top-0 z-40">
      {/* Promo bar */}
      <div className="bg-stone-900 text-stone-100 text-center text-xs py-2 px-4 tracking-wide uppercase">
        Free logo setup on your first order · Fast worldwide shipping
      </div>

      {/* Main nav */}
      <nav className="bg-[#faf9f6]/95 backdrop-blur border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Logo */}
            <a href="#top" className="flex items-center flex-shrink-0">
              <span className="font-semibold text-xl text-stone-900 tracking-tight uppercase">
                Swag
              </span>
            </a>

            {/* Desktop category nav */}
            <div className="hidden md:flex items-center gap-6">
              {categories.map(cat => (
                <a
                  key={cat.href}
                  href={cat.href}
                  className="text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors"
                >
                  {cat.label}
                </a>
              ))}
              <button
                onClick={() => { setTrackInitial(''); setTrackOpen(true) }}
                className="text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors"
              >
                Track order
              </button>
            </div>

            {/* Search (desktop) */}
            <div className="hidden lg:flex items-center flex-1 max-w-xs">
              <div className="relative w-full">
                <svg className="w-4 h-4 absolute left-0 top-1/2 -translate-y-1/2 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
                </svg>
                <input
                  type="search"
                  placeholder="Search"
                  className="w-full bg-transparent border-b border-stone-300 pl-6 pr-4 py-1.5 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-stone-900 transition-colors"
                />
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
              {categories.map(cat => (
                <a
                  key={cat.href}
                  href={cat.href}
                  onClick={() => setMobileOpen(false)}
                  className="px-1 py-2 text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors"
                >
                  {cat.label}
                </a>
              ))}
              <button
                onClick={() => { setMobileOpen(false); setTrackInitial(''); setTrackOpen(true) }}
                className="text-left px-1 py-2 text-sm font-medium text-stone-600 hover:text-stone-900"
              >
                Track order
              </button>
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
