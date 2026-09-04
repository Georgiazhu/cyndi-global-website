import { useState } from 'react'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'

export default function Cart() {
  const { cart, isCartOpen, setIsCartOpen, removeFromCart, updateQuantity, clearCart, checkoutInfo, setCheckoutInfo } = useCart()
  const { user } = useAuth()

  // 按币种分别合计（购物车可能混 ¥ 和 $，不能直接相加）
  const symOf = (c) => (c === 'CNY' ? '¥' : '$')
  const totalsByCurrency = cart.reduce((acc, item) => {
    const c = item.currency || 'USD'
    acc[c] = (acc[c] || 0) + parseFloat(item.price[0]) * item.quantity
    return acc
  }, {})
  const totalText = Object.entries(totalsByCurrency)
    .map(([c, v]) => `${symOf(c)}${v.toFixed(2)}`)
    .join(' + ') || '$0.00'
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [submitError, setSubmitError] = useState('')
  // 表单预填之前填过的信息（Edit details 回来时能看到）
  const [formData, setFormData] = useState({
    name: checkoutInfo?.name || '',
    email: checkoutInfo?.email || '',
    phone: checkoutInfo?.phone || '',
    company: checkoutInfo?.company || '',
    notes: checkoutInfo?.notes || '',
  })

  if (!isCartOpen) return null

  // 表单提交 → 存联系信息，关抽屉，跳到整页复核页 #review
  const handleReviewOrder = (e) => {
    e.preventDefault()
    setSubmitError('')
    setCheckoutInfo({
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      company: formData.company,
      notes: formData.notes,
    })
    setShowOrderForm(false)
    setIsCartOpen(false)
    window.location.hash = 'review'
  }

  const resetAndClose = () => {
    setShowOrderForm(false)
    setSubmitError('')
    setIsCartOpen(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => setIsCartOpen(false)}
      />

      {/* Cart Panel */}
      <div className="relative w-full max-w-md bg-[#faf9f6] h-full overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="sticky top-0 bg-[#faf9f6] border-b border-stone-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-base font-semibold uppercase tracking-wide text-stone-900">
            {showOrderForm ? 'Your Details' : `Cart (${cart.length} items)`}
          </h2>
          <button
            onClick={resetAndClose}
            className="text-stone-400 hover:text-stone-900"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {showOrderForm ? (
          /* Order Form（已登录用户；name/email 来自账户，无需填写）*/
          <form onSubmit={handleReviewOrder} className="p-6 space-y-4">
            {user && (
              <div className="border border-stone-200 bg-white px-3 py-2.5 text-sm">
                <p className="text-xs uppercase tracking-wide text-stone-400 mb-0.5">Ordering as</p>
                <p className="font-medium text-stone-900">{user.displayName}</p>
                <p className="text-stone-500">{user.email}</p>
              </div>
            )}
            {/* 游客：填 name/email；已登录：来自账户，不显示 */}
            {!user && (
              <>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-stone-500 mb-1.5">Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:outline-none focus:border-stone-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-stone-500 mb-1.5">Email *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    className="w-full border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:outline-none focus:border-stone-900"
                  />
                </div>
              </>
            )}
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-stone-500 mb-1.5">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                className="w-full border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:outline-none focus:border-stone-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-stone-500 mb-1.5">Company</label>
              <input
                type="text"
                value={formData.company}
                onChange={e => setFormData({ ...formData, company: e.target.value })}
                className="w-full border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:outline-none focus:border-stone-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-stone-500 mb-1.5">Notes</label>
              <textarea
                rows={3}
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                className="w-full border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:outline-none focus:border-stone-900 resize-none"
                placeholder="Any special requirements..."
              />
            </div>

            {/* Total（明细在下一步复核页完整展示）*/}
            <div className="border-t border-stone-200 pt-4 flex justify-between font-semibold text-stone-900">
              <span>Total</span>
              <span>{totalText}</span>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowOrderForm(false)}
                className="flex-1 border border-stone-300 text-stone-900 py-3 text-sm font-medium uppercase tracking-wide hover:bg-stone-100 transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                className="flex-1 bg-stone-900 text-white py-3 text-sm font-medium uppercase tracking-wide hover:bg-stone-700 transition-colors"
              >
                Review Order
              </button>
            </div>
          </form>
        ) : (
          /* Cart Items */
          <div className="p-6">
            {cart.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-16 h-16 text-stone-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                <p className="text-stone-500">Your cart is empty</p>
              </div>
            ) : (
              <>
                <div className="space-y-4 mb-6">
                  {cart.map(item => (
                    <div key={item.sku || item.id} className="flex gap-3 p-3 border border-stone-200 bg-white">
                      <img src={item.image} alt={item.name} className="w-16 h-16 object-contain" />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-stone-900 truncate">{item.name}</h4>
                        {(item.selectedColor || item.selectedSize) && (
                          <p className="text-[11px] text-stone-400">
                            {[item.selectedColor, item.selectedSize].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        <p className="text-xs text-stone-500">{item.currency === 'CNY' ? '¥' : '$'}{item.price[0]} each</p>
                        {item.tierPrices && item.tierPrices.length > 1 && (
                          <p className="text-[11px] text-stone-400 mt-0.5">
                            Bulk: {item.tierPrices.map((t, i) => `≥${t.beginAmount} ${item.currency === 'CNY' ? '¥' : '$'}${t.price}`).join(' · ')}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={() => updateQuantity(item.sku || item.id, item.quantity - 1)}
                            className="w-6 h-6 border border-stone-300 text-xs flex items-center justify-center hover:bg-stone-100"
                          >
                            -
                          </button>
                          <span className="text-sm font-medium">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.sku || item.id, item.quantity + 1)}
                            className="w-6 h-6 border border-stone-300 text-xs flex items-center justify-center hover:bg-stone-100"
                          >
                            +
                          </button>
                          <button
                            onClick={() => removeFromCart(item.sku || item.id)}
                            className="ml-auto text-stone-400 hover:text-[#b7410e]"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Total & Actions */}
                <div className="border-t border-stone-200 pt-4">
                  <div className="flex justify-between items-center mb-4">
                    <span className="font-semibold text-stone-900">Total</span>
                    <span className="text-xl font-semibold text-stone-900">{totalText}</span>
                  </div>
                  {user ? (
                    <button
                      onClick={() => setShowOrderForm(true)}
                      className="w-full bg-stone-900 text-white py-3 text-sm font-medium uppercase tracking-wide hover:bg-stone-700 transition-colors"
                    >
                      Proceed to Order
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => { setIsCartOpen(false); window.dispatchEvent(new CustomEvent('open-auth')) }}
                        className="w-full bg-stone-900 text-white py-3 text-sm font-medium uppercase tracking-wide hover:bg-stone-700 transition-colors"
                      >
                        Sign in to Order
                      </button>
                      <button
                        onClick={() => setShowOrderForm(true)}
                        className="w-full mt-2 border border-stone-900 text-stone-900 py-3 text-sm font-medium uppercase tracking-wide hover:bg-stone-100 transition-colors"
                      >
                        Order as Guest
                      </button>
                      <p className="mt-2 text-center text-xs text-stone-400">Sign in to save your details, or check out as a guest.</p>
                    </>
                  )}
                  <button
                    onClick={clearCart}
                    className="w-full mt-2 text-sm text-stone-500 hover:text-[#b7410e] py-2"
                  >
                    Clear Cart
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
