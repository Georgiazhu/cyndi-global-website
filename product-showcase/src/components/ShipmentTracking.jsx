// Shipment tracking block for the order page (Requirement 5).
// Data comes from GET /api/orders?orderNo=… as `shipments` (already ownership-checked server-side).
// All text is rendered as React children; links and images are re-checked before use.

// Tracking links: absolute http(s) only.
function safeLinkUrl(url) {
  if (typeof url !== 'string') return ''
  const s = url.trim()
  if (!/^https?:\/\//i.test(s)) return ''
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : ''
  } catch {
    return ''
  }
}

// Photos: only the same-origin, ownership-checked proxy.
const PHOTO_PREFIX = '/api/orders/shipment-photo?'
function safePhotoUrl(url) {
  return typeof url === 'string' && url.startsWith(PHOTO_PREFIX) ? url : ''
}

function formatDate(value, withTime = true) {
  if (!value) return ''
  // ETA is a plain YYYY-MM-DD date: show it without shifting time zones.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
  if (isNaN(d)) return value
  return withTime
    ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : d.toLocaleDateString(undefined, { dateStyle: 'medium' })
}

function pillClass(status) {
  if (status === 'delivered') return 'border-emerald-700 text-emerald-800'
  if (status === 'exception') return 'border-red-700 text-red-800'
  return 'border-stone-900 text-stone-900'
}

function ShipmentCard({ s }) {
  const link = safeLinkUrl(s.trackingUrl)
  const events = Array.isArray(s.events) ? s.events : []
  const photos = (Array.isArray(s.photos) ? s.photos : [])
    .map((p) => ({ ...p, src: safePhotoUrl(p.url) }))
    .filter((p) => p.src)
  const meta = [
    s.origin || s.destination ? ['Route', [s.origin, s.destination].filter(Boolean).join(' → ')] : null,
    s.packages != null ? ['Packages', String(s.packages)] : null,
    s.shippedAt ? ['Shipped', formatDate(s.shippedAt)] : null,
    s.eta ? ['ETA', formatDate(s.eta, false)] : null,
    s.deliveredAt ? ['Delivered', formatDate(s.deliveredAt)] : null,
  ].filter(Boolean)

  return (
    <div className="border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-stone-900">Shipment {s.index}</p>
          {(s.carrier || s.trackingNo) && (
            <p className="text-xs text-stone-500 mt-0.5 break-words">
              {s.carrier}
              {s.carrier && s.trackingNo && ' · '}
              {s.trackingNo && (link ? (
                <a href={link} target="_blank" rel="noopener noreferrer" className="underline hover:text-stone-900">
                  {s.trackingNo}
                </a>
              ) : s.trackingNo)}
            </p>
          )}
        </div>
        <span className={`text-xs font-medium uppercase tracking-wide border px-2.5 py-1 ${pillClass(s.status)}`}>
          {s.statusLabel || s.status}
        </span>
      </div>

      {meta.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
          {meta.map(([k, v]) => (
            <div key={k}>
              <dt className="text-stone-400 uppercase tracking-wide text-[10px]">{k}</dt>
              <dd className="text-stone-800 break-words">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {s.note && <p className="mt-3 text-sm text-stone-700 whitespace-pre-line break-words">{s.note}</p>}

      {events.length > 0 && (
        <ol className="mt-4 space-y-3">
          {events.map((e, i) => (
            <li key={e.id} className="flex gap-3">
              <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${i === 0 ? 'bg-stone-900' : 'bg-stone-300'}`} aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[11px] text-stone-400">
                  {formatDate(e.time)}
                  {e.statusLabel && <span className="ml-2 uppercase tracking-wide">{e.statusLabel}</span>}
                </p>
                <p className={`text-sm break-words ${i === 0 ? 'font-semibold text-stone-900' : 'text-stone-700'}`}>{e.title}</p>
                {e.location && <p className="text-xs text-stone-500 break-words">{e.location}</p>}
                {e.description && <p className="text-xs text-stone-500 whitespace-pre-line break-words">{e.description}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}

      {photos.length > 0 && (
        <div className="mt-4 grid grid-cols-3 sm:grid-cols-5 gap-2">
          {photos.map((p, i) => (
            <a key={p.id} href={p.src} target="_blank" rel="noopener noreferrer" className="block border border-stone-200">
              <img src={p.src} alt={p.caption || `Shipment photo ${i + 1}`} loading="lazy" className="w-full aspect-square object-cover" />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ShipmentTracking({ shipments }) {
  if (!Array.isArray(shipments) || shipments.length === 0) return null
  return (
    <div className="mt-8">
      <h2 className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-3">Shipment tracking</h2>
      <div className="space-y-3">
        {shipments.map((s) => <ShipmentCard key={s.id} s={s} />)}
      </div>
    </div>
  )
}
