import { useState, useMemo } from 'react'
import { useCart } from '../context/CartContext'
import Toast from './Toast'

// PDP 商品详情页（参考 Patagonia）：左多图画廊，右信息(颜色/尺码/价格/描述/加购)。
export default function ProductDetail({ product, initialColor }) {
  const { addToCart } = useCart()
  const options = product.colorOptions?.length ? product.colorOptions : null

  const initialIdx = useMemo(() => {
    if (!options || !initialColor) return 0
    const i = options.findIndex(o => o.name === initialColor)
    return i >= 0 ? i : 0
  }, [options, initialColor])

  const [activeColor, setActiveColor] = useState(initialIdx)
  const [activeSize, setActiveSize] = useState(null)
  const [activeImg, setActiveImg] = useState(0)
  const [showToast, setShowToast] = useState(false)

  // 当前颜色对应的图集；无 colorOptions 时用整体 gallery
  const images = options ? (options[activeColor]?.images || []) : (product.gallery || [product.image])
  const sizes = product.sizeList || []

  const selectColor = (idx) => {
    setActiveColor(idx)
    setActiveImg(0)
  }

  const needSize = sizes.length > 0        // 有尺码的商品必须先选
  const canAdd = !needSize || !!activeSize

  const handleAddToCart = () => {
    if (!canAdd) return                    // 没选尺码：不加购
    const colorName = options ? options[activeColor]?.name : undefined
    addToCart({ ...product, selectedColor: colorName, selectedSize: activeSize })
    setShowToast(true)
  }

  const goBack = () => {
    // 返回到列表页对应品类锚点
    window.location.hash = product.category ? `#${product.category}` : ''
  }

  return (
    <>
      <Toast
        message={`"${product.name}" added to cart!`}
        isVisible={showToast}
        onClose={() => setShowToast(false)}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Breadcrumb / back */}
        <button
          onClick={goBack}
          className="mb-6 text-sm text-stone-500 hover:text-stone-900 transition-colors"
        >
          ← Back to {product.categoryTitle || 'all swag'}
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
                src={images[activeImg] || product.image}
                alt={product.name}
                className="h-full w-full object-contain p-8"
              />
            </div>
          </div>

          {/* Right: info */}
          <div className="flex flex-col">
            <span className="text-[11px] font-medium uppercase tracking-wide text-stone-500">{product.brand}</span>
            <h1 className="mt-2 text-2xl md:text-3xl font-semibold text-stone-900 leading-tight">{product.name}</h1>

            <p className="mt-4 text-2xl font-semibold text-stone-900">
              ${product.price[0]}
              {product.price[1] && product.price[1] !== product.price[0] && (
                <span className="text-stone-500"> – ${product.price[1]}</span>
              )}
              <span className="text-base font-normal text-stone-400"> /unit</span>
            </p>

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
            {product.description && (
              <div className="mt-8 border-t border-stone-200 pt-6">
                <p className="text-sm font-medium text-stone-800 mb-2">Description</p>
                <p className="text-sm text-stone-500 leading-relaxed">{product.description}</p>
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
