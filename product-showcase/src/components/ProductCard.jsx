import { useState } from 'react'
import { useCart } from '../context/CartContext'
import Toast from './Toast'

// PLP 卡片（参考 Patagonia 列表页）：可切换颜色的主图 + swatch，点图进 PDP。
// hover 图片底部滑出 Quick Add：展开尺寸 + 价格，选尺寸直接加购。
export default function ProductCard({ product }) {
  const { addToCart } = useCart()
  const options = product.colorOptions?.length ? product.colorOptions : null
  const [activeColor, setActiveColor] = useState(0)
  const [quickOpen, setQuickOpen] = useState(false)
  const [showToast, setShowToast] = useState(false)

  const sizes = product.sizeList || []

  const mainImage =
    options && options[activeColor]?.images?.[0]
      ? options[activeColor].images[0]
      : product.image

  const goToPdp = () => {
    const color = options ? options[activeColor]?.name : undefined
    const q = color ? `?color=${encodeURIComponent(color)}` : ''
    window.location.hash = `#product/${product.id}${q}`
  }

  const quickAdd = (size) => {
    const colorName = options ? options[activeColor]?.name : undefined
    addToCart({ ...product, selectedColor: colorName, selectedSize: size })
    setShowToast(true)
    setQuickOpen(false)
  }

  return (
    <>
      <Toast
        message={`"${product.name}" added to cart!`}
        isVisible={showToast}
        onClose={() => setShowToast(false)}
      />

      <div className="group flex flex-col">
        {/* Image + Quick Add overlay */}
        <div className="relative aspect-[4/5] bg-[#f2efe9] overflow-hidden">
          <button
            onClick={goToPdp}
            className="flex h-full w-full items-center justify-center"
            aria-label={`View ${product.name}`}
          >
            <img
              src={mainImage}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-contain p-6 transition-transform duration-500 group-hover:scale-[1.03]"
            />
          </button>
          <span className="pointer-events-none absolute top-3 left-3 text-[11px] font-medium uppercase tracking-wide text-stone-600">
            {product.brand}
          </span>

          {/* Quick Add：hover 时从底部滑出 */}
          <div
            className={`absolute inset-x-0 bottom-0 transition-transform duration-300 ${
              quickOpen ? 'translate-y-0' : 'translate-y-full group-hover:translate-y-0'
            }`}
          >
            {!quickOpen ? (
              <button
                onClick={() => setQuickOpen(true)}
                className="w-full bg-white/95 backdrop-blur py-3 text-sm font-medium uppercase tracking-wide text-stone-900 border-t border-stone-200 hover:bg-white"
              >
                Quick Add
              </button>
            ) : (
              <div className="bg-white/97 backdrop-blur border-t border-stone-200 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-stone-900">
                    ${product.price[0]}
                    {product.price[1] && product.price[1] !== product.price[0] && (
                      <span className="text-stone-500"> – ${product.price[1]}</span>
                    )}
                    <span className="text-xs font-normal text-stone-400"> /unit</span>
                  </span>
                  <button
                    onClick={() => setQuickOpen(false)}
                    className="text-stone-400 hover:text-stone-900 text-sm"
                    aria-label="Close quick add"
                  >
                    ✕
                  </button>
                </div>
                {sizes.length > 0 ? (
                  <>
                    <p className="text-[11px] uppercase tracking-wide text-stone-400 mb-1.5">Select size to add</p>
                    <div className="flex flex-wrap gap-1.5">
                      {sizes.map(sz => (
                        <button
                          key={sz}
                          onClick={() => quickAdd(sz)}
                          className="min-w-9 px-2.5 py-1.5 text-xs border border-stone-300 text-stone-700 hover:border-stone-900 hover:bg-stone-900 hover:text-white transition-colors"
                        >
                          {sz}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <button
                    onClick={() => quickAdd(null)}
                    className="w-full border border-stone-900 bg-stone-900 text-white py-2 text-xs font-medium uppercase tracking-wide hover:bg-stone-700"
                  >
                    Add to Cart
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Color swatches */}
        {options && options.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {options.map((opt, idx) => (
              <button
                key={idx}
                onMouseEnter={() => setActiveColor(idx)}
                onClick={() => setActiveColor(idx)}
                title={opt.name}
                className={`h-9 w-9 overflow-hidden rounded-full border transition-all ${
                  idx === activeColor ? 'border-stone-900 ring-1 ring-stone-900' : 'border-stone-300'
                }`}
              >
                {opt.swatch ? (
                  <img src={opt.swatch} alt={opt.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="block h-full w-full bg-stone-200" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex flex-col flex-1 pt-3">
          <button onClick={goToPdp} className="text-left">
            <h3 className="text-base font-semibold text-stone-900 leading-snug hover:underline underline-offset-4">
              {product.name}
            </h3>
          </button>

          {options && (
            <p className="mt-1 text-xs text-stone-500">
              {options[activeColor]?.name}
              {options.length > 1 && <span className="text-stone-400"> · {options.length} colors</span>}
            </p>
          )}

          {/* Price */}
          <div className="mt-2">
            <p className="text-lg font-semibold text-stone-900">
              ${product.price[0]}
              {product.price[1] && product.price[1] !== product.price[0] && (
                <span className="text-stone-500"> – ${product.price[1]}</span>
              )}
              <span className="text-sm font-normal text-stone-400"> /unit</span>
            </p>
          </div>

          {/* View details -> PDP */}
          <button
            onClick={goToPdp}
            className="mt-3 self-start text-sm font-medium text-stone-700 underline underline-offset-4 decoration-stone-300 hover:decoration-stone-700 transition-colors"
          >
            View details
          </button>
        </div>
      </div>
    </>
  )
}
