import { useState, useEffect } from 'react'

const STATUS_LABELS = {
  received: 'Order received',
  processing: 'Processing',
  shipped: 'Shipped',
  in_transit: 'In transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

function formatDate(value) {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return value
  }
}

export default function MyOrdersModal({ isOpen, onClose, onTrack }) {
  const [orders, setOrders] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    let active = true
    setLoading(true); setError('')
    fetch('/api/orders/mine', { credentials: 'include' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Could not load orders')
        return data
      })
      .then((data) => { if (active) setOrders(data.orders || []) })
      .catch((err) => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-[#faf9f6] shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-[#faf9f6] flex items-center justify-between border-b border-stone-200 px-6 py-4">
          <h2 className="text-base font-semibold uppercase tracking-wide text-stone-900">My orders</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-900" aria-label="Close">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          {loading && <p className="text-sm text-stone-500">Loading…</p>}
          {error && <p className="text-sm text-[#b7410e]">{error}</p>}
          {!loading && !error && orders.length === 0 && (
            <p className="text-sm text-stone-500 text-center py-8">You have no orders yet.</p>
          )}

          <div className="divide-y divide-stone-200">
            {orders.map((o) => (
              <button
                key={o.orderNo}
                onClick={() => onTrack(o.orderNo)}
                className="w-full flex items-center justify-between py-4 text-left hover:bg-stone-100 transition-colors px-2 -mx-2"
              >
                <div>
                  <p className="text-sm font-semibold text-stone-900">{o.orderNo}</p>
                  <p className="text-xs text-stone-400">{formatDate(o.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-stone-600">{STATUS_LABELS[o.status] || o.status}</p>
                  <p className="text-sm font-medium text-stone-900">${Number(o.total).toFixed(2)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
