// 商品筛选侧栏：品类 / 品牌 / 尺寸 / 价格。竖排，sticky 跟随滚动。
const STD_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL']

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs border rounded-full transition-colors ${
        active
          ? 'border-stone-900 bg-stone-900 text-white'
          : 'border-stone-300 text-stone-600 hover:border-stone-900'
      }`}
    >
      {children}
    </button>
  )
}

function Group({ title, children }) {
  return (
    <div className="py-5 border-b border-stone-200 last:border-b-0">
      <p className="text-[11px] uppercase tracking-wide text-stone-400 mb-3">{title}</p>
      {children}
    </div>
  )
}

export default function Filters({
  categories, brands, sizes, priceMax,
  filters, setFilters, resultCount, totalCount,
}) {
  const toggle = (key, val) => {
    setFilters(prev => {
      const set = new Set(prev[key])
      set.has(val) ? set.delete(val) : set.add(val)
      return { ...prev, [key]: [...set] }
    })
  }
  const clearAll = () => setFilters({ category: [], brand: [], size: [], maxPrice: priceMax })

  const hasActive =
    filters.category.length || filters.brand.length || filters.size.length || filters.maxPrice < priceMax

  return (
    <aside className="lg:sticky lg:top-28 lg:self-start">
      <div className="border border-stone-200 rounded-lg bg-white/70 px-5 pb-2">
        <div className="flex items-center justify-between pt-5 pb-4 border-b border-stone-200">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-900">Filter</h3>
          {hasActive ? (
            <button onClick={clearAll} className="text-xs text-stone-500 underline hover:text-stone-900">
              Clear all
            </button>
          ) : null}
        </div>

        <Group title="Category">
          <div className="flex flex-wrap gap-1.5">
            {categories.map(c => (
              <Chip key={c.key} active={filters.category.includes(c.key)} onClick={() => toggle('category', c.key)}>
                {c.title}
              </Chip>
            ))}
          </div>
        </Group>

        <Group title="Brand">
          <div className="flex flex-wrap gap-1.5">
            {brands.map(b => (
              <Chip key={b} active={filters.brand.includes(b)} onClick={() => toggle('brand', b)}>
                {b}
              </Chip>
            ))}
          </div>
        </Group>

        <Group title="Size">
          <div className="flex flex-wrap gap-1.5">
            {STD_SIZES.filter(s => sizes.includes(s)).map(s => (
              <Chip key={s} active={filters.size.includes(s)} onClick={() => toggle('size', s)}>
                {s}
              </Chip>
            ))}
          </div>
        </Group>

        <Group title={`Max price · $${filters.maxPrice}`}>
          <input
            type="range"
            min={0}
            max={priceMax}
            step={10}
            value={filters.maxPrice}
            onChange={e => setFilters(prev => ({ ...prev, maxPrice: Number(e.target.value) }))}
            className="w-full accent-stone-900"
          />
          <div className="flex justify-between text-[10px] text-stone-400 mt-1">
            <span>$0</span><span>${priceMax}</span>
          </div>
        </Group>

        <div className="py-4 text-xs text-stone-400">{resultCount} / {totalCount} items</div>
      </div>
    </aside>
  )
}
