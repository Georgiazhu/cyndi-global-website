import { useState, useEffect, useLayoutEffect } from 'react'
import { CartProvider } from './context/CartContext'
import { AuthProvider } from './context/AuthContext'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Categories from './components/Categories'
import Features from './components/Features'
import Products from './components/Products'
import ProductDetail from './components/ProductDetail'
import Cart from './components/Cart'
import { products } from './data/products'

// 解析 hash：#product/<id>?color=<name> -> { productId, color }
function parseHash() {
  const h = window.location.hash || ''
  const m = h.match(/^#product\/(\d+)(?:\?color=([^&]*))?/)
  if (!m) return null
  return { productId: Number(m[1]), color: m[2] ? decodeURIComponent(m[2]) : null }
}

// 品类锚点（#tshirts 等）：section 由 JS 异步渲染，浏览器原生锚点滚动会赶不上，
// 这里重试直到元素出现再滚过去。
function scrollToCurrentHash() {
  const id = (window.location.hash || '').replace(/^#/, '')
  if (!id || id.startsWith('product/')) return
  let tries = 0
  const tick = () => {
    const el = document.getElementById(id)
    if (el) {
      // 临时禁用全局 scroll-behavior:smooth，实现即时定位（不滚动动画）
      const html = document.documentElement
      const prev = html.style.scrollBehavior
      html.style.scrollBehavior = 'auto'
      el.scrollIntoView({ block: 'start' })
      // 下一帧恢复，保留页面内其他锚点的平滑效果
      requestAnimationFrame(() => { html.style.scrollBehavior = prev })
    } else if (tries++ < 30) {
      setTimeout(tick, 80)
    }
  }
  tick()
}

function App() {
  const [route, setRoute] = useState(parseHash())

  useEffect(() => {
    const onHash = () => {
      const r = parseHash()
      setRoute(r)
      if (r) window.scrollTo(0, 0)        // 进入 PDP：回顶部
      else scrollToCurrentHash()          // 品类锚点：滚到对应 section
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // 首次加载（从 cyndi 菜单跳来带 #tshirts）：渲染后滚到品类
  // 首次加载（从 cyndi 菜单带 #tshirts 跳来）：用 useLayoutEffect 在浏览器绘制前
  // 同步定位，避免先在顶部绘一帧再跳过去的"闪一下顶部"。
  useLayoutEffect(() => {
    if (!parseHash()) scrollToCurrentHash()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeProduct = route ? products.find(p => p.id === route.productId) : null

  return (
    <AuthProvider>
    <CartProvider>
      <div className="min-h-screen bg-[#faf9f6]">
        <Navbar />
        {activeProduct ? (
          <div className="pt-20">
            <ProductDetail product={activeProduct} initialColor={route.color} />
          </div>
        ) : (
          <>
            <Hero />
            <Categories />
            <Products />
            <Features />
          </>
        )}
        <Cart />

        {/* Footer */}
        <footer className="bg-[#faf9f6] border-t border-stone-200 text-stone-600">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <div className="flex flex-col md:flex-row justify-between gap-10">
              <div className="max-w-sm">
                <span className="font-semibold text-lg text-stone-900 uppercase tracking-tight">Swag</span>
                <p className="mt-4 text-sm text-stone-500 leading-relaxed">
                  Premium custom branded merchandise for your team — designed,
                  produced, and delivered with boutique-level care.
                </p>
              </div>
              <div className="flex gap-16">
                <div>
                  <p className="text-stone-900 font-medium text-xs uppercase tracking-wide mb-4">Shop</p>
                  <ul className="space-y-2.5 text-sm">
                    <li><a href="#tote-bags" className="hover:text-stone-900 transition-colors">Tote Bags</a></li>
                    <li><a href="#water-bottles" className="hover:text-stone-900 transition-colors">Water Bottles</a></li>
                    <li><a href="#umbrellas" className="hover:text-stone-900 transition-colors">Umbrellas</a></li>
                  </ul>
                </div>
                <div>
                  <p className="text-stone-900 font-medium text-xs uppercase tracking-wide mb-4">Company</p>
                  <ul className="space-y-2.5 text-sm">
                    <li><a href="#categories" className="hover:text-stone-900 transition-colors">Categories</a></li>
                    <li><a href="#top" className="hover:text-stone-900 transition-colors">Back to top</a></li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="border-t border-stone-200 mt-12 pt-6 text-xs text-stone-400">
              © 2026 Swag store. All rights reserved.
            </div>
          </div>
        </footer>
      </div>
    </CartProvider>
    </AuthProvider>
  )
}

export default App
