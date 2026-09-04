import { useState, useEffect } from 'react'

// 一级品类展示顺序 + 其下二级 section 顺序（与后端 category 值对应）
const GROUP_LAYOUT = [
  { group: 'Apparel', sections: [
    { key: 'tshirts', title: 'T-shirts' },
    { key: 'polos', title: 'Polos' },
    { key: 'hoodies', title: 'Hoodies & Crewnecks' },
    { key: 'zips', title: 'Zips' },
    { key: 'jackets', title: 'Jackets & Outerwear' },
    { key: 'shorts', title: 'Sports Shorts' },
  ]},
  { group: 'Headwear', sections: [
    { key: 'hats', title: 'Hats' },
    { key: 'beanies', title: 'Beanies' },
    { key: 'buckethats', title: 'Bucket Hats' },
    { key: 'visors', title: 'Visors' },
  ]},
  { group: 'Bags', sections: [
    { key: 'totes', title: 'Totes' },
    { key: 'backpacks', title: 'Backpacks' },
    { key: 'sling', title: 'Sling Bags' },
    { key: 'drawstring', title: 'Drawstring Bags' },
    { key: 'luggage', title: 'Luggage' },
  ]},
  { group: 'Drinkware', sections: [
    { key: 'tumblers', title: 'Tumblers' },
    { key: 'bottles', title: 'Water Bottles' },
    { key: 'mugs', title: 'Mugs' },
    { key: 'campcups', title: 'Camp Cups' },
    { key: 'accessories', title: 'Accessories' },
  ]},
  { group: 'Footwear', sections: [
    { key: 'sneakers', title: 'Sneakers' },
    { key: 'slippers', title: 'Slippers' },
    { key: 'sandals', title: 'Sandals' },
    { key: 'flipflops', title: 'Flip Flops & Clogs' },
    { key: 'socks', title: 'Socks' },
  ]},
]

// 把 API 商品适配成组件期望的形状：
// - id: 用 spu（路由/key）
// - price: ['min','max'] 字符串数组（兼容原 ProductCard 的 product.price[0]/[1]）
// - 保留 currency / priceRange / sizeList / colorOptions
function adapt(p) {
  const [mn, mx] = p.priceRange || []
  const price = mn == null ? ['0'] : (mx != null && mx !== mn ? [String(mn), String(mx)] : [String(mn)])
  return {
    ...p,
    id: p.spu,
    price,
    sizeList: p.sizeList || [],
    sizeNorm: p.sizeList || [],
  }
}

export function useProducts() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetch('/api/products')
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to load products')
        return data
      })
      .then((data) => {
        if (!active) return
        setProducts((data.products || []).map(adapt))
        setError(null)
      })
      .catch((e) => { if (active) setError(e.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  // 只保留有商品的分组/section
  const groupOrder = GROUP_LAYOUT
    .map((g) => ({
      group: g.group,
      sections: g.sections
        .filter((s) => products.some((p) => p.category === s.key))
        .map((s) => ({ ...s, count: products.filter((p) => p.category === s.key).length })),
    }))
    .filter((g) => g.sections.length)

  const sectionOrder = groupOrder.flatMap((g) => g.sections.map((s) => ({ key: s.key, title: s.title })))

  return { products, loading, error, groupOrder, sectionOrder }
}
