import { useState, useEffect } from 'react'

const STATUS_LABELS = {
  pending: 'Order received',
  received: 'Order received',
  processing: 'Processing',
  confirmed: 'Confirmed',
  producing: 'In production',
  shipped: 'Shipped',
  in_transit: 'In transit',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
}
// 进度时间线的步骤（cancelled 不在其中，单独处理）
const STATUS_STEPS = ['pending', 'processing', 'shipped', 'in_transit', 'delivered']
// 把后端可能出现的别名归一到时间线步骤
const STEP_ALIAS = {
  received: 'pending',
  confirmed: 'processing',
  producing: 'processing',
  completed: 'delivered',
}
const symOf = (c) => (c === 'CNY' ? '¥' : '$')

function formatDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d)) return value
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function OrderConfirmation({ orderNo }) {
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true); setError('')
    fetch(`/api/orders?orderNo=${encodeURIComponent(orderNo)}`, { credentials: 'include' })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.error || 'Order not found')
        return data
      })
      .then((data) => { if (alive) setOrder(data) })
      .catch((e) => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [orderNo])

  if (loading) {
    return <div className="max-w-3xl mx-auto px-6 py-24 text-center text-stone-500">Loading your order…</div>
  }
  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold text-stone-900">Order not found</h1>
        <p className="mt-3 text-stone-500">We couldn’t find order <span className="font-medium">{orderNo}</span>.</p>
        <a href="/shop" className="inline-block mt-6 bg-stone-900 text-white px-6 py-3 text-sm font-medium uppercase tracking-wide hover:bg-stone-700 transition-colors">Back to shop</a>
      </div>
    )
  }

  const items = order.items || []
  // 按币种分别合计（购物车/明细可能混 ¥ 和 $）
  const totalsByCurrency = items.reduce((acc, it) => {
    const c = it.currency || 'USD'
    acc[c] = (acc[c] || 0) + (Number(it.price) || 0) * (it.quantity || 0)
    return acc
  }, {})
  const totalText = Object.entries(totalsByCurrency).map(([c, v]) => `${symOf(c)}${v.toFixed(2)}`).join('  +  ') || '$0.00'

  const isCancelled = order.status === 'cancelled'
  const normStep = STEP_ALIAS[order.status] || order.status
  const currentStepIndex = STATUS_STEPS.indexOf(normStep)
  const c = order.customer || {}

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="text-center">
        <div className="w-16 h-16 border border-stone-900 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-stone-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl md:text-3xl font-semibold text-stone-900">Order Confirmed</h1>
        <p className="mt-2 text-stone-500">Thank you. We’ve received your order and will be in touch shortly.</p>
      </div>

      {/* Order number + meta */}
      <div className="mt-8 border border-stone-300 bg-white px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-stone-400 mb-0.5">Order number</p>
          <p className="text-lg font-semibold text-stone-900 select-all">{order.orderNo}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-stone-400 mb-0.5">Placed</p>
          <p className="text-sm text-stone-700">{formatDate(order.createdAt)}</p>
        </div>
        <span className="text-xs font-medium uppercase tracking-wide text-stone-900 border border-stone-900 px-2.5 py-1">
          {STATUS_LABELS[order.status] || order.status}
        </span>
      </div>

      {/* Status timeline */}
      {!isCancelled && (
        <div className="mt-6 flex items-center justify-between">
          {STATUS_STEPS.map((step, idx) => (
            <div key={step} className="flex-1 flex flex-col items-center relative">
              {idx > 0 && (
                <span className={`absolute top-1.5 right-1/2 w-full h-px ${idx <= currentStepIndex ? 'bg-stone-900' : 'bg-stone-300'}`} />
              )}
              <span className={`relative w-3 h-3 rounded-full ${idx <= currentStepIndex ? 'bg-stone-900' : 'bg-stone-300'}`} />
              <span className={`mt-1.5 text-[10px] uppercase tracking-wide text-center ${idx <= currentStepIndex ? 'text-stone-900' : 'text-stone-400'}`}>
                {STATUS_LABELS[step]}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Items */}
      <div className="mt-8">
        <h2 className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-3">Items</h2>
        <div className="border border-stone-200 bg-white divide-y divide-stone-100">
          {items.map((it, i) => (
            <div key={it.sku || it.id || i} className="flex gap-4 p-4">
              {it.image && <img src={it.image} alt={it.name} className="w-16 h-16 object-contain shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-900">{it.name}</p>
                {(it.selectedColor || it.selectedSize) && (
                  <p className="text-[11px] text-stone-400 mt-0.5">
                    {[it.selectedColor, it.selectedSize].filter(Boolean).join(' · ')}
                  </p>
                )}
                <p className="text-xs text-stone-500 mt-1">{symOf(it.currency)}{Number(it.price).toFixed(2)} × {it.quantity}</p>
              </div>
              <div className="text-sm font-medium text-stone-900 whitespace-nowrap">
                {symOf(it.currency)}{(Number(it.price) * it.quantity).toFixed(2)}
              </div>
            </div>
          ))}
          <div className="flex justify-between items-center p-4 font-semibold text-stone-900">
            <span>Total</span>
            <span>{totalText}</span>
          </div>
        </div>
      </div>

      {/* Contact info */}
      <div className="mt-8">
        <h2 className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-3">Contact</h2>
        <div className="border border-stone-200 bg-white p-4 text-sm text-stone-700 space-y-1">
          {c.name && <p><span className="text-stone-400">Name: </span>{c.name}</p>}
          {c.email && <p><span className="text-stone-400">Email: </span>{c.email}</p>}
          {c.phone && <p><span className="text-stone-400">Phone: </span>{c.phone}</p>}
          {c.company && <p><span className="text-stone-400">Company: </span>{c.company}</p>}
          {order.notes && <p><span className="text-stone-400">Notes: </span>{order.notes}</p>}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-8 flex flex-col sm:flex-row gap-3">
        <a href="/shop" className="flex-1 text-center border border-stone-300 text-stone-900 py-3 text-sm font-medium uppercase tracking-wide hover:bg-stone-100 transition-colors">
          Continue shopping
        </a>
      </div>
    </div>
  )
}
