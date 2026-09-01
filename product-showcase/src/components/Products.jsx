import { useState, useMemo } from 'react'
import ProductCard from './ProductCard'
import Filters from './Filters'
import { useSearch } from '../context/SearchContext'
import { useProductsContext } from '../context/ProductsContext'

// 统一的响应式商品网格：手机1列 → sm2 → lg3 → xl4
const GRID = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-8 gap-y-12'

function ProductSection({ id, title, items }) {
  if (!items.length) return null
  return (
    <div id={id} className="mb-16 scroll-mt-28">
      <div className="flex items-baseline justify-between border-b border-stone-300 mb-8 pb-3">
        <h3 className="text-lg font-semibold uppercase tracking-wide text-stone-900">{title}</h3>
        <span className="text-xs uppercase tracking-wide text-stone-400">{items.length} items</span>
      </div>
      <div className={GRID}>
        {items.map(product => <ProductCard key={product.id} product={product} />)}
      </div>
    </div>
  )
}

export default function Products() {
  const { products, loading, error, groupOrder, sectionOrder } = useProductsContext()
  const PRICE_MAX = useMemo(
    () => Math.ceil((Math.max(0, ...products.map(p => parseFloat(p.price[0]) || 0))) / 10) * 10 || 100,
    [products]
  )
  const [filters, setFilters] = useState({ category: [], brand: [], size: [], maxPrice: Infinity })
  const [filterOpen, setFilterOpen] = useState(false)   // 窄屏折叠面板开关
  const { query } = useSearch()
  const q = query.trim().toLowerCase()

  const brands = useMemo(() => [...new Set(products.map(p => p.brand))], [products])
  const sizeSet = useMemo(() => {
    const s = new Set()
    products.forEach(p => (p.sizeNorm || []).forEach(x => s.add(x)))
    return [...s]
  }, [products])

  const filtered = useMemo(() => products.filter(p => {
    if (filters.category.length && !filters.category.includes(p.category)) return false
    if (filters.brand.length && !filters.brand.includes(p.brand)) return false
    if (filters.size.length && !(p.sizeNorm || []).some(s => filters.size.includes(s))) return false
    if (parseFloat(p.price[0]) > filters.maxPrice) return false
    // 搜索词：匹配商品名 / 品牌 / 分类
    if (q) {
      const hay = `${p.name} ${p.brand} ${p.category}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }), [products, filters, q])

  const activeCount =
    filters.category.length + filters.brand.length + filters.size.length + (filters.maxPrice < PRICE_MAX ? 1 : 0)
  // 有筛选项或有搜索词时，都走"扁平网格"视图
  const hasActive = activeCount > 0 || q.length > 0

  const filtersEl = (
    <Filters
      categories={sectionOrder}
      brands={brands}
      sizes={sizeSet}
      priceMax={PRICE_MAX}
      filters={{ ...filters, maxPrice: filters.maxPrice === Infinity ? PRICE_MAX : filters.maxPrice }}
      setFilters={setFilters}
      resultCount={filtered.length}
      totalCount={products.length}
    />
  )

  return (
    <section id="products" className="bg-[#faf9f6]">
      <div className="px-4 sm:px-6 lg:px-10 max-w-[1600px] mx-auto py-20 scroll-mt-24">
        <div className="max-w-2xl mb-10">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">The collection</p>
          <h2 className="mt-3 text-3xl md:text-4xl font-semibold text-stone-900 tracking-tight">All swag</h2>
          <p className="mt-4 text-sm text-stone-500 leading-relaxed">
            Prices are pre-tax and pre-shipping, considered confidential, and valid for 30 days.
          </p>
        </div>

        {/* 窄屏(<lg)：Filter 折叠按钮 */}
        <div className="lg:hidden mb-6">
          <button
            onClick={() => setFilterOpen(v => !v)}
            className="w-full flex items-center justify-between border border-stone-300 rounded-lg px-4 py-3 text-sm font-medium text-stone-900"
          >
            <span>Filter{activeCount ? ` · ${activeCount}` : ''}</span>
            <span className="text-stone-400">{filterOpen ? '▲' : '▼'}</span>
          </button>
          {filterOpen && <div className="mt-3">{filtersEl}</div>}
        </div>

        <div className="flex flex-col lg:flex-row gap-8 lg:gap-10">
          {/* 宽屏(≥lg)：左侧 sticky 侧栏 */}
          <div className="hidden lg:block lg:w-64 lg:shrink-0">
            {filtersEl}
          </div>

          <div className="flex-1 min-w-0">
            {loading ? (
              <p className="text-sm text-stone-500 py-20 text-center">Loading products…</p>
            ) : error ? (
              <p className="text-sm text-red-600 py-20 text-center">Failed to load products: {error}</p>
            ) : hasActive ? (
              filtered.length ? (
                <div className={GRID}>
                  {filtered.map(product => <ProductCard key={product.id} product={product} />)}
                </div>
              ) : (
                <p className="text-sm text-stone-500 py-20 text-center">
                  {q ? `No products match “${query.trim()}”.` : 'No products match your filters.'}
                </p>
              )
            ) : (
              groupOrder.map(group => (
                <div key={group.group} id={group.group.toLowerCase()} className="mb-24 scroll-mt-24">
                  <div className="mb-10">
                    <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-stone-900">{group.group}</h2>
                    <div className="mt-2 h-px w-16 bg-stone-900" />
                  </div>
                  {group.sections.map(section => (
                    <ProductSection
                      key={section.key}
                      id={section.key}
                      title={section.title}
                      items={products.filter(p => p.category === section.key)}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
