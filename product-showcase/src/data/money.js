/**
 * Amount display helpers for the storefront.
 *
 * groupAmount() only inserts thousands separators — it deliberately keeps the
 * stored precision (8.5 stays "8.5", 1234.567 stays "1,234.567").
 * fixedAmount() is for computed totals, which have always shown 2 decimals.
 */
export function groupAmount(value) {
  const s = String(value ?? '').trim()
  const m = /^(\d+)((?:\.\d+)?)$/.exec(s)
  if (!m) return s
  return m[1].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + m[2]
}

export function fixedAmount(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0.00'
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}
