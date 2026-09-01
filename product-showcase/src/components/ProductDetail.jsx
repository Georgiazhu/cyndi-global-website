import { useState, useMemo, useEffect } from 'react'
import { useCart } from '../context/CartContext'
import Toast from './Toast'

const cur = (c) => (c === 'CNY' ? '¥' : '$')

// PDP 商品详情页（参考 Patagonia）：左多图画廊，右信息(颜色/尺码/价格/描述/加购)。
// 从 /api/products/:spu 拉详情，拿到每个颜色下的 SKU(含变体价/阶梯价)。
export default function ProductDetail({ product, initialColor }) {
  const { addToCart } = useCart()
  const spu = product.spu || product.id

  // 详情(含 SKU)：优先用 API 拉，失败回退到列表传入的 product
  const [detail, setDetail] = useState(product)
  useEffect(() => {
    let active = true
    fetch(`/api/products/${encodeURIComponent(spu)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'load failed')
        return data
      })
      .then((data) => { if (active && data.product) setDetail(data.product) })
      .catch(() => {})
    return () => { active = false }
  }, [spu])

  const options = detail.colorOptions?.length ? detail.colorOptions : null
  const currency = detail.currency || 'USD'

  const initialIdx = useMemo(() => {
    if (!options || !initialColor) return 0
    const i = options.findIndex(o => o.name === initialColor)
    return i >= 0 ? i : 0
  }, [options, initialColor])

  const [activeColor, setActiveColor] = useState(initialIdx)
  const [activeSize, setActiveSize] = useState(null)
  const [activeImg, setActiveImg] = useState(0)
  const [qty, setQty] = useState(1)
  const [showToast, setShowToast] = useState(false)

  useEffect(() => { setActiveColor(initialIdx) }, [initialIdx])

  const activeOpt = options ? options[activeColor] : null
  const images = options ? (activeOpt?.images || []) : (detail.gallery || [detail.image])
  // 该颜色下的 SKU（含 size/price/tierPrices）
  const colorSkus = activeOpt?.skus || []
  const sizes = colorSkus.length ? colorSkus.map(s => s.size) : (detail.sizeList || [])

  // 当前选中的 SKU（按颜色+尺码定位）
  const activeSku = useMemo(() => {
    if (!colorSkus.length) return null
    if (activeSize) return colorSkus.find(s => s.size === activeSize) || null
    return colorSkus.length === 1 ? colorSkus[0] : null
  }, [colorSkus, activeSize])

  // 展示价：选中 SKU 用其价；否则用该颜色 SKU 的区间；再否则商品区间
  const priceDisplay = useMemo(() => {
    if (activeSku) return { min: activeSku.price, max: activeSku.price, curr: activeSku.currency || currency }
    if (colorSkus.length) {
      const ps = colorSkus.map(s => s.price).filter(v => v != null)
      if (ps.length) return { min: Math.min(...ps), max: Math.max(...ps), curr: currency }
    }
    const [mn, mx] = detail.priceRange || []
    return { min: mn, max: mx, curr: currency }
  }, [activeSku, colorSkus, detail, currency])

  const tierPrices = activeSku?.tierPrices || (colorSkus[0] && colorSkus[0].tierPrices) || null

  const selectColor = (idx) => {
    setActiveColor(idx)
    setActiveImg(0)
    setActiveSize(null)
  }

  const needSize = sizes.length > 1        // 多个尺码必须先选；单尺码/无尺码可直接加
  const canAdd = !needSize || !!activeSize

  const handleAddToCart = () => {
    if (!canAdd) return
    const colorName = activeOpt?.name
    const sku = activeSku
    addToCart({
      id: detail.spu || detail.id,
      spu: detail.spu || detail.id,
      sku: sku?.sku,
      name: detail.name,
      brand: detail.brand,
      image: images[0] || detail.image,
      price: [String(sku?.price ?? priceDisplay.min ?? 0)],
      currency: sku?.currency || currency,
      tierPrices: sku?.tierPrices || tierPrices || null,
      selectedColor: colorName,
      selectedSize: activeSize || (sizes.length === 1 ? sizes[0] : null),
    }, qty)
    setShowToast(true)
  }

  const goBack = () => {
    // 返回到列表页对应品类锚点
    window.location.hash = detail.category ? `#${detail.category}` : ''
  }

  return (
    <>
      <Toast
        message={`"${detail.name}" added to cart!`}
        isVisible={showToast}
        onClose={() => setShowToast(false)}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Breadcrumb / back */}
        <button
          onClick={goBack}
          className="mb-6 text-sm text-stone-500 hover:text-stone-900 transition-colors"
        >
          ← Back to {detail.categoryTitle || 'all swag'}
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Left: gallery */}
          <div className="flex gap-4">
            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex flex-col gap-3 w-16 shrink-0">
                {images.slice(0, 8).map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImg(idx)}
                    className={`aspect-square overflow-hidden bg-[#f2efe9] border transition-all ${
                      idx === activeImg ? 'border-stone-900' : 'border-transparent hover:border-stone-300'
                    }`}
                  >
                    <img src={img} alt="" className="h-full w-full object-contain p-1" />
                  </button>
                ))}
              </div>
            )}
            {/* Main image */}
            <div className="flex-1 aspect-[4/5] bg-[#f2efe9] flex items-center justify-center overflow-hidden">
              <img
                src={images[activeImg] || detail.image}
                alt={detail.name}
                className="h-full w-full object-contain p-8"
              />
            </div>
          </div>

          {/* Right: info */}
          <div className="flex flex-col">
            <span className="text-[11px] font-medium uppercase tracking-wide text-stone-500">{detail.brand}</span>
            <h1 className="mt-2 text-2xl md:text-3xl font-semibold text-stone-900 leading-tight">{detail.name}</h1>

            <p className="mt-4 text-2xl font-semibold text-stone-900">
              {cur(priceDisplay.curr)}{priceDisplay.min}
              {priceDisplay.max != null && priceDisplay.max !== priceDisplay.min && (
                <span className="text-stone-500"> – {cur(priceDisplay.curr)}{priceDisplay.max}</span>
              )}
              <span className="text-base font-normal text-stone-400"> /unit</span>
            </p>

            {/* 阶梯价（1688 批发）：买越多越便宜 */}
            {tierPrices && tierPrices.length > 1 && (
              <div className="mt-2 text-xs text-stone-500">
                {tierPrices.map((t, i) => (
                  <span key={i} className="mr-3">≥{t.beginAmount}: {cur(priceDisplay.curr)}{t.price}</span>
                ))}
              </div>
            )}

            {activeSku && (
              <p className="mt-1 text-[11px] text-stone-400">SKU: {activeSku.sku}</p>
            )}

            {/* Colors */}
            {options && options.length > 0 && (
              <div className="mt-6">
                <p className="text-sm text-stone-700">
                  <span className="font-medium">Color:</span> {options[activeColor]?.name}
                </p>
                <div className="mt-3 flex flex-wrap gap-2.5">
                  {options.map((opt, idx) => (
                    <button
                      key={idx}
                      onClick={() => selectColor(idx)}
                      title={opt.name}
                      className={`h-11 w-11 overflow-hidden rounded-full border transition-all ${
                        idx === activeColor ? 'border-stone-900 ring-1 ring-stone-900' : 'border-stone-300 hover:border-stone-500'
                      }`}
                    >
                      {opt.swatch
                        ? <img src={opt.swatch} alt={opt.name} className="h-full w-full object-cover" />
                        : <span className="block h-full w-full bg-stone-200" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Sizes */}
            {sizes.length > 0 && (
              <div className="mt-6">
                <p className="text-sm font-medium text-stone-700">Size {activeSize && <span className="font-normal text-stone-500">· {activeSize}</span>}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {sizes.map(sz => (
                    <button
                      key={sz}
                      onClick={() => setActiveSize(sz)}
                      className={`min-w-11 px-3 py-2 text-sm border transition-colors ${
                        activeSize === sz ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 text-stone-700 hover:border-stone-900'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity 步进器 */}
            <div className="mt-6">
              <p className="text-sm font-medium text-stone-700 mb-2">Quantity</p>
              <div className="inline-flex items-center border border-stone-300">
                <button
                  onClick={() => setQty(q => Math.max(1, q - 1))}
                  className="w-11 h-11 text-lg text-stone-700 hover:bg-stone-100 disabled:text-stone-300"
                  disabled={qty <= 1}
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-14 h-11 text-center text-sm border-x border-stone-300 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  aria-label="Quantity"
                />
                <button
                  onClick={() => setQty(q => q + 1)}
                  className="w-11 h-11 text-lg text-stone-700 hover:bg-stone-100"
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
            </div>

            {/* Add to cart —— 有尺码未选时禁用并提示 */}
            <button
              onClick={handleAddToCart}
              disabled={!canAdd}
              className={`mt-8 w-full py-4 text-sm font-medium uppercase tracking-wide transition-colors ${
                canAdd
                  ? 'border border-stone-900 bg-stone-900 text-white hover:bg-stone-700'
                  : 'border border-stone-300 bg-stone-200 text-stone-500 cursor-not-allowed'
              }`}
            >
              {canAdd ? 'Add to Cart' : 'Select Size'}
            </button>

            {/* Description */}
            {detail.description && (
              <div className="mt-8 border-t border-stone-200 pt-6">
                <p className="text-sm font-medium text-stone-800 mb-2">Description</p>
                <p className="text-sm text-stone-500 leading-relaxed">{detail.description}</p>
              </div>
            )}

            <p className="mt-6 text-xs text-stone-400">
              Prices are pre-tax and pre-shipping. MOQ and lead time vary by product.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
