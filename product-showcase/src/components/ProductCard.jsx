import { useState } from 'react'
import { useCart } from '../context/CartContext'
import Toast from './Toast'

export default function ProductCard({ product }) {
  const { addToCart } = useCart()
  const [showToast, setShowToast] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  const handleAddToCart = () => {
    addToCart(product)
    setShowToast(true)
  }

  return (
    <>
      <Toast
        message={`"${product.name}" added to cart!`}
        isVisible={showToast}
        onClose={() => setShowToast(false)}
      />

      <div className="group flex flex-col">
        {/* Image */}
        <div className="relative flex justify-center items-center aspect-[4/5] bg-[#f2efe9] overflow-hidden">
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-contain p-6 transition-transform duration-500 group-hover:scale-[1.03]"
          />
          <span className="absolute top-3 left-3 text-[11px] font-medium uppercase tracking-wide text-stone-600">
            {product.brand}
          </span>
        </div>

        {/* Body */}
        <div className="flex flex-col flex-1 pt-4">
          <h3 className="text-base font-semibold text-stone-900 leading-snug">{product.name}</h3>

          {product.description && (
            <p className="mt-1.5 text-sm text-stone-500 leading-relaxed line-clamp-2">
              {product.description}
            </p>
          )}

          {/* Colors */}
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[11px] font-medium text-stone-400 uppercase tracking-wide">Color</span>
            <div className="flex flex-wrap gap-1.5">
              {product.colorValues
                ? product.colorValues.map((color, idx) => (
                    <span
                      key={idx}
                      title={product.colors[idx]}
                      className="w-4 h-4 rounded-full border border-stone-300"
                      style={{ backgroundColor: color }}
                    />
                  ))
                : product.colors.map((color, idx) => (
                    <span key={idx} className="text-sm text-stone-500">{color}</span>
                  ))}
            </div>
          </div>

          {/* Sizes */}
          {product.sizes && (
            <p className="mt-2 text-xs text-stone-400">
              <span className="font-medium text-stone-500">Size:</span> {product.sizes}
            </p>
          )}

          {/* Price */}
          <div className="mt-3">
            <p className="text-[11px] text-stone-400 uppercase tracking-wide">
              from · {product.quantity?.[0]} units
            </p>
            <p className="mt-0.5 text-lg font-semibold text-stone-900">
              ${product.price[0]}
              <span className="text-sm font-normal text-stone-400"> /unit</span>
            </p>
          </div>

          {/* Details toggle */}
          <button
            onClick={() => setShowDetails(v => !v)}
            className="mt-3 self-start text-sm font-medium text-stone-700 underline underline-offset-4 decoration-stone-300 hover:decoration-stone-700 transition-colors"
          >
            {showDetails ? 'Hide details' : 'View details'}
          </button>

          {showDetails && (
            <div className="mt-4 space-y-4 border-t border-stone-200 pt-4 text-sm">
              {product.features?.length > 0 && (
                <ul className="text-stone-500 space-y-1">
                  {product.features.map((feature, idx) => (
                    <li key={idx}>• {feature}</li>
                  ))}
                </ul>
              )}

              {product.materials && (
                <p className="text-stone-500">
                  <strong className="text-stone-800 font-medium">Materials:</strong> {product.materials}
                </p>
              )}

              {product.priceIncludes && (
                <div>
                  <p className="font-medium text-stone-800 mb-1">Price Includes</p>
                  {product.priceIncludes.split('\n').map((line, idx) => (
                    <p key={idx} className="text-stone-500">{line}</p>
                  ))}
                  <p className="text-stone-400 italic mt-1">Pre tax. Pre shipping.</p>
                  <p className="text-stone-500 italic">Cost may vary based upon final approved artwork.</p>
                </div>
              )}

              {product.additionalCharges?.length > 0 && (
                <div>
                  <p className="font-medium text-stone-800 mb-1">Additional Charges</p>
                  {product.additionalCharges.map((charge, idx) => (
                    <p key={idx} className="text-stone-500">{charge}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Add to Cart */}
          <button
            onClick={handleAddToCart}
            className="mt-5 w-full border border-stone-900 text-stone-900 py-3 text-sm font-medium uppercase tracking-wide hover:bg-stone-900 hover:text-white transition-colors"
          >
            Add to Cart
          </button>
        </div>
      </div>
    </>
  )
}
