import { useState, useEffect, useCallback } from 'react'

const STATUS_LABELS = {
  received: 'Order received',
  processing: 'Processing',
  shipped: 'Shipped',
  in_transit: 'In transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

const STATUS_STEPS = ['received', 'processing', 'shipped', 'in_transit', 'delivered']

function formatDate(value) {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return value
  }
}

export default function TrackOrderModal({ isOpen, onClose, initialOrderNo = '' }) {
  const [orderNo, setOrderNo] = useState(initialOrderNo)
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const lookup = useCallback(async (no) => {
    const query = String(no || '').trim()
    if (!query) return
    setLoading(true); setError(''); setOrder(null)
    try {
      const res = await fetch(`/api/orders?orderNo=${encodeURIComponent(query)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Order not found')
      setOrder(data.order)
    } catch (err) {
      setError(err.message || 'Order not found')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen && initialOrderNo) {
      setOrderNo(initialOrderNo)
      lookup(initialOrderNo)
    }
  }, [isOpen, initialOrderNo, lookup])

  if (!isOpen) return null

  const handleClose = () => {
    setOrder(null); setError(''); setOrderNo('')
    onClose()
  }

  const currentStepIndex = order ? STATUS_STEPS.indexOf(order.status) : -1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      <div className="relative w-full max-w-lg bg-[#faf9f6] shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-[#faf9f6] flex items-center justify-between border-b border-stone-200 px-6 py-4">
          <h2 className="text-base font-semibold uppercase tracking-wide text-stone-900">Track order</h2>
          <button onClick={handleClose} className="text-stone-400 hover:text-stone-900" aria-label="Close">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          <form onSubmit={(e) => { e.preventDefault(); lookup(orderNo) }} className="flex gap-2">
            <input
              type="text"
              value={orderNo}
              onChange={(e) => setOrderNo(e.target.value)}
              placeholder="Enter order number (e.g. ORD-...)"
              className="flex-1 border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-stone-900"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-stone-900 text-white px-5 py-2 text-sm font-medium uppercase tracking-wide hover:bg-stone-700 transition-colors disabled:opacity-50"
            >
              {loading ? '…' : 'Track'}
            </button>
          </form>

          {error && <p className="text-sm text-[#b7410e]">{error}</p>}

          {order && (
            <div className="space-y-6">
              <div className="flex items-baseline justify-between border-b border-stone-200 pb-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-stone-400">Order</p>
                  <p className="text-sm font-semibold text-stone-900">{order.orderNo}</p>
                </div>
                <span className="text-xs font-medium uppercase tracking-wide text-stone-900 border border-stone-900 px-2 py-1">
                  {STATUS_LABELS[order.status] || order.status}
                </span>
              </div>

              {order.status !== 'cancelled' && (
                <div className="flex items-center justify-between">
                  {STATUS_STEPS.map((step, idx) => (
                    <div key={step} className="flex-1 flex flex-col items-center text-center">
                      <span className={`w-3 h-3 rounded-full ${idx <= currentStepIndex ? 'bg-stone-900' : 'bg-stone-300'}`} />
                      <span className={`mt-1 text-[10px] uppercase tracking-wide ${idx <= currentStepIndex ? 'text-stone-900' : 'text-stone-400'}`}>
                        {STATUS_LABELS[step]}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <p className="text-xs uppercase tracking-wide text-stone-400 mb-2">Items</p>
                <div className="space-y-2">
                  {order.items.map((it, idx) => (
                    <div key={idx} className="flex items-center gap-3 text-sm">
                      {it.image && <img src={it.image} alt={it.name} className="w-10 h-10 object-contain bg-white border border-stone-200" />}
                      <span className="flex-1 text-stone-700">{it.name} × {it.quantity}</span>
                      <span className="text-stone-500">${(it.price * it.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between border-t border-stone-200 mt-3 pt-2 text-sm font-semibold text-stone-900">
                  <span>Total</span>
                  <span>${Number(order.total).toFixed(2)}</span>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-stone-400 mb-3">History</p>
                <ol className="border-l border-stone-300 ml-1.5 space-y-4">
                  {(order.events || []).map((ev, idx) => (
                    <li key={idx} className="relative pl-5">
                      <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-stone-900 border-2 border-[#faf9f6]" />
                      <p className="text-xs text-stone-400">{formatDate(ev.time)}</p>
                      <p className="text-sm font-medium text-stone-900">{ev.title}</p>
                      {ev.description && <p className="text-sm text-stone-500">{ev.description}</p>}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
