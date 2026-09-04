import { useState } from 'react'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'

const symOf = (c) => (c === 'CNY' ? '¥' : '$')

// 整页订单复核：可改数量 / 删除 / 就地编辑联系信息，确认后 Place Order。
export default function OrderReview() {
  const { cart, updateQuantity, removeFromCart, lineKey, checkoutInfo, setCheckoutInfo, clearCart } = useCart()
  const { user } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [editingContact, setEditingContact] = useState(false)
  const [form, setForm] = useState({
    name: checkoutInfo?.name || '',
    email: checkoutInfo?.email || '',
    phone: checkoutInfo?.phone || '',
    company: checkoutInfo?.company || '',
    notes: checkoutInfo?.notes || '',
  })

  // 按币种分别合计（购物车可能混 ¥ / $）
  const totalsByCurrency = cart.reduce((acc, item) => {
    const c = item.currency || 'USD'
    acc[c] = (acc[c] || 0) + parseFloat(item.price[0]) * item.quantity
    return acc
  }, {})
  const totalText = Object.entries(totalsByCurrency).map(([c, v]) => `${symOf(c)}${v.toFixed(2)}`).join('  +  ') || '$0.00'

  const info = checkoutInfo || {}
  const contactName = user ? user.displayName : info.name
  const contactEmail = user ? user.email : info.email

  // 就地编辑联系信息
  const startEdit = () => {
    setForm({
      name: info.name || '',
      email: info.email || '',
      phone: info.phone || '',
      company: info.company || '',
      notes: info.notes || '',
    })
    setEditingContact(true)
  }
  const saveContact = (e) => {
    e.preventDefault()
    setCheckoutInfo({ ...form })
    setEditingContact(false)
  }
  const backToShop = () => { window.location.hash = '' }

  const placeOrder = async () => {
    setError(''); setSubmitting(true)
    try {
      const payload = user
        ? { phone: info.phone, company: info.company, notes: info.notes, items: cart }
        : { name: info.name, email: info.email, phone: info.phone, company: info.company, notes: info.notes, items: cart }
      const res = await fetch('/api/orders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not place order')
      clearCart()
      window.location.hash = `order/${encodeURIComponent(data.orderNo)}`
    } catch (e) {
      setError(e.message || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (!cart.length) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold text-stone-900">Your cart is empty</h1>
        <a href="/shop" className="inline-block mt-6 bg-stone-900 text-white px-6 py-3 text-sm font-medium uppercase tracking-wide hover:bg-stone-700 transition-colors">Back to shop</a>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-6 lg:px-10 pt-4 pb-12">
      <button onClick={backToShop} className="inline-flex items-center gap-2 text-sm text-stone-500 hover:text-stone-900 mb-4">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
        Continue shopping
      </button>
      <h1 className="text-3xl font-bold tracking-tight text-stone-900">Review your order</h1>
      <p className="mt-2 text-stone-500">Check your items and details, then place your order.</p>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 左：商品（可编辑）*/}
        <div className="lg:col-span-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-3">Items ({cart.length})</h2>
          <div className="border border-stone-200 bg-white divide-y divide-stone-100">
            {cart.map(item => {
              const key = lineKey(item)
              const sym = symOf(item.currency)
              return (
                <div key={key} className="flex gap-4 p-4">
                  <img src={item.image} alt={item.name} className="w-20 h-20 object-contain shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900">{item.name}</p>
                    {(item.selectedColor || item.selectedSize) && (
                      <p className="text-[11px] text-stone-400 mt-0.5">{[item.selectedColor, item.selectedSize].filter(Boolean).join(' · ')}</p>
                    )}
                    <p className="text-xs text-stone-500 mt-1">{sym}{item.price[0]} each</p>
                    {/* 数量步进 + 删除 */}
                    <div className="flex items-center gap-2 mt-3">
                      <button onClick={() => updateQuantity(key, item.quantity - 1)}
                        className="w-7 h-7 border border-stone-300 text-sm flex items-center justify-center hover:bg-stone-100">−</button>
                      <span className="text-sm font-medium w-8 text-center">{item.quantity}</span>
                      <button onClick={() => updateQuantity(key, item.quantity + 1)}
                        className="w-7 h-7 border border-stone-300 text-sm flex items-center justify-center hover:bg-stone-100">+</button>
                      <button onClick={() => removeFromCart(key)}
                        className="ml-3 text-xs text-stone-400 hover:text-[#b7410e] uppercase tracking-wide">Remove</button>
                    </div>
                  </div>
                  <div className="text-sm font-medium text-stone-900 whitespace-nowrap">
                    {sym}{(parseFloat(item.price[0]) * item.quantity).toFixed(2)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 右：联系信息 + 合计 + 下单 */}
        <div className="lg:col-span-1 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-medium uppercase tracking-wide text-stone-500">Contact</h2>
              {!editingContact && (
                <button onClick={startEdit} className="text-xs text-stone-500 hover:text-stone-900 underline">Edit</button>
              )}
            </div>
            {editingContact ? (
              <form onSubmit={saveContact} className="border border-stone-200 bg-white p-4 space-y-3">
                {user ? (
                  <div className="text-sm">
                    <p className="font-medium text-stone-900">{user.displayName}</p>
                    <p className="text-stone-500">{user.email}</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-[11px] font-medium uppercase tracking-wide text-stone-500 mb-1">Name *</label>
                      <input type="text" required value={form.name}
                        onChange={e => setForm({ ...form, name: e.target.value })}
                        className="w-full border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:border-stone-900" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium uppercase tracking-wide text-stone-500 mb-1">Email *</label>
                      <input type="email" required value={form.email}
                        onChange={e => setForm({ ...form, email: e.target.value })}
                        className="w-full border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:border-stone-900" />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-stone-500 mb-1">Phone</label>
                  <input type="tel" value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    className="w-full border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:border-stone-900" />
                </div>
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-stone-500 mb-1">Company</label>
                  <input type="text" value={form.company}
                    onChange={e => setForm({ ...form, company: e.target.value })}
                    className="w-full border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:border-stone-900" />
                </div>
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-stone-500 mb-1">Notes</label>
                  <textarea rows={2} value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    className="w-full border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:border-stone-900 resize-none" />
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setEditingContact(false)}
                    className="flex-1 border border-stone-300 text-stone-700 py-2 text-xs font-medium uppercase tracking-wide hover:bg-stone-100">Cancel</button>
                  <button type="submit"
                    className="flex-1 bg-stone-900 text-white py-2 text-xs font-medium uppercase tracking-wide hover:bg-stone-700">Save</button>
                </div>
              </form>
            ) : (
              <div className="border border-stone-200 bg-white p-4 text-sm space-y-2">
                {contactName && (
                  <div><span className="text-[11px] uppercase tracking-wide text-stone-400">Name</span><p className="text-stone-900 font-medium">{contactName}</p></div>
                )}
                {contactEmail && (
                  <div><span className="text-[11px] uppercase tracking-wide text-stone-400">Email</span><p className="text-stone-700">{contactEmail}</p></div>
                )}
                {info.phone && (
                  <div><span className="text-[11px] uppercase tracking-wide text-stone-400">Phone</span><p className="text-stone-700">{info.phone}</p></div>
                )}
                {info.company && (
                  <div><span className="text-[11px] uppercase tracking-wide text-stone-400">Company</span><p className="text-stone-700">{info.company}</p></div>
                )}
                {info.notes && (
                  <div className="pt-2 mt-1 border-t border-stone-100"><span className="text-[11px] uppercase tracking-wide text-stone-400">Notes</span><p className="text-stone-700">{info.notes}</p></div>
                )}
              </div>
            )}
          </div>

          <div className="border border-stone-200 bg-white p-4">
            <div className="flex justify-between font-semibold text-stone-900">
              <span>Total</span>
              <span>{totalText}</span>
            </div>
            {error && <p className="text-sm text-[#b7410e] mt-3">{error}</p>}
            <button onClick={placeOrder} disabled={submitting}
              className="w-full mt-4 bg-stone-900 text-white py-3 text-sm font-medium uppercase tracking-wide hover:bg-stone-700 transition-colors disabled:opacity-50">
              {submitting ? 'Placing…' : 'Place Order'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
