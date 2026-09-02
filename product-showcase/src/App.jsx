import { useState, useEffect } from 'react'
import { CartProvider } from './context/CartContext'
import { AuthProvider } from './context/AuthContext'
import { SearchProvider } from './context/SearchContext'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Categories from './components/Categories'
import Features from './components/Features'
import Products from './components/Products'
import ProductDetail from './components/ProductDetail'
import Cart from './components/Cart'
import { ProductsProvider, useProductsContext } from './context/ProductsContext'

// 解析 hash：#product/<spu>?color=<name> -> { spu, color }
function parseHash() {
  const h = window.location.hash || ''
  const m = h.match(/^#product\/([^?]+)(?:\?color=([^&]*))?/)
  if (!m) return null
  return { spu: decodeURIComponent(m[1]), color: m[2] ? decodeURIComponent(m[2]) : null }
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

function AppBody() {
  const { products, loading } = useProductsContext()
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

  // 品类锚点定位：等商品数据加载完成、section 真正渲染后再定位，
  // 避免在 loading 空白态先滚一次（那会"闪一下空白商品页"）。
  useEffect(() => {
    if (!loading && !parseHash()) scrollToCurrentHash()
  }, [loading])

  // PDP 不依赖列表数据：有 route.spu 就渲染详情，由 ProductDetail 自行 fetch。
  // 若列表已加载且有该商品，用它做初始占位(更快出图)，否则传最小对象靠 API 拉。
  const activeProduct = route
    ? (products.find(p => p.id === route.spu) || { spu: route.spu, id: route.spu, colorOptions: [] })
    : null

  return (
    <>
      <div className="min-h-screen bg-[#faf9f6]">
        <Navbar />
        {activeProduct ? (
          <div className="pt-20">
            <ProductDetail product={activeProduct} initialColor={route.color} />
          </div>
        ) : (
          <>
            {/* 暂时隐藏 Hero 和 Shop by category（Categories），先只展示商品 */}
            {/* <Hero /> */}
            {/* <Categories /> */}
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
    </>
  )
}

function App() {
  return (
    <AuthProvider>
    <CartProvider>
    <SearchProvider>
    <ProductsProvider>
      <AppBody />
    </ProductsProvider>
    </SearchProvider>
    </CartProvider>
    </AuthProvider>
  )
}

export default App
