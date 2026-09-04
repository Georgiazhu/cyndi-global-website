import { useState, useEffect } from 'react'

// 查订单弹窗：输入单号 → 校验存在 → 跳到订单确认页 (#order/<no>) 展示详情。
// 展示统一交给 OrderConfirmation，本弹窗只负责查号与跳转，避免维护两套订单视图。
export default function TrackOrderModal({ isOpen, onClose, initialOrderNo = '' }) {
  const [orderNo, setOrderNo] = useState(initialOrderNo)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen) { setOrderNo(initialOrderNo); setError('') }
  }, [isOpen, initialOrderNo])

  if (!isOpen) return null

  const handleClose = () => { setError(''); setOrderNo(''); onClose() }

  const lookup = async (e) => {
    e.preventDefault()
    const no = String(orderNo || '').trim()
    if (!no) return
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/orders?orderNo=${encodeURIComponent(no)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Order not found')
      // 查到了 → 跳确认页展示（关弹窗）
      onClose()
      window.location.hash = `order/${encodeURIComponent(data.orderNo || no)}`
    } catch (err) {
      setError(err.message || 'Order not found')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      <div className="relative w-full max-w-md bg-[#faf9f6] shadow-xl">
        <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
          <h2 className="text-base font-semibold uppercase tracking-wide text-stone-900">Track order</h2>
          <button onClick={handleClose} className="text-stone-400 hover:text-stone-900" aria-label="Close">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-stone-500">Enter your order number to view its status and details.</p>
          <form onSubmit={lookup} className="flex gap-2">
            <input
              type="text"
              value={orderNo}
              onChange={(e) => setOrderNo(e.target.value)}
              placeholder="e.g. SW-20260214-AB12CD"
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
        </div>
      </div>
    </div>
  )
}
