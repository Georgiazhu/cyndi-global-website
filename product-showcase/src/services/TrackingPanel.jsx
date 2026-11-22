import { useState } from 'react'

// 客户物流查询面板（中英双语）
// 数据源统一走 /api/tracking：燕文运单号实时查轨迹，自有产品编号查仓储记录。
// 与站点其余部分一致：米白底、深墨色字、橙色点缀、细边框。

const I18N = {
  en: {
    badge: 'SHIPMENT TRACKING',
    title: 'Where is my shipment?',
    intro: 'Enter a Yanwen waybill number or a Cyndi product number to see live tracking, milestones and warehouse records.',
    placeholder: 'e.g. UH183870291YP or CY-THERMOS-001',
    button: 'Track',
    searching: 'Searching…',
    hint: 'Try a sample:',
    hintYanwen: 'Yanwen waybill',
    hintProduct: 'Product number',
    required: 'Please enter a tracking or product number.',
    notFound: 'No record found for this number. Please check and try again.',
    notConfigured: 'Live Yanwen tracking is being set up. Please contact us for this shipment.',
    genericError: 'Tracking is temporarily unavailable. Please try again later.',
    sourceYanwen: 'Yanwen live tracking',
    sourceCyndi: 'Cyndi warehouse record',
    lastUpdate: 'Last update',
    route: 'Route',
    origin: 'Origin',
    destination: 'Destination',
    details: 'Shipment details',
    trackingNo: 'Tracking No.',
    waybillNo: 'Waybill No.',
    lastMileNo: 'Last-mile No.',
    carrier: 'Carrier',
    milestones: 'Tracking history',
    noMilestones: 'No milestones available yet.',
    locale: 'Location',
    warehouse: 'Warehouse storage',
    warehouseUpdated: 'Updated',
    noPhotos: 'No warehouse photos have been uploaded.',
    eta: 'Est. arrival',
    packages: 'Packages',
    units: 'Units',
    current: 'Current',
    langBtn: '中文',
    status: {
      delivered: 'Delivered', in_transit: 'In transit', out_for_delivery: 'Out for delivery',
      available_for_pickup: 'Ready for pickup', exception: 'Exception',
      delivery_failed: 'Delivery failed', returned: 'Returned', pending: 'Processing',
      not_found: 'Not found', closed: 'Closed', stored: 'In warehouse',
      production: 'In production', unknown: 'Updating',
    },
  },
  zh: {
    badge: '物流追踪',
    title: '查询我的货物',
    intro: '输入燕文运单号或 Cyndi 产品编号，查看实时轨迹、运输节点与仓储记录。',
    placeholder: '例如 UH183870291YP 或 CY-THERMOS-001',
    button: '查询',
    searching: '查询中…',
    hint: '可试示例：',
    hintYanwen: '燕文运单号',
    hintProduct: '产品编号',
    required: '请输入运单号或产品编号。',
    notFound: '未查询到该单号的记录，请核对后重试。',
    notConfigured: '燕文实时查询正在配置中，请联系我们获取该票货状态。',
    genericError: '物流服务暂时不可用，请稍后再试。',
    sourceYanwen: '燕文实时轨迹',
    sourceCyndi: 'Cyndi 仓储记录',
    lastUpdate: '最后更新',
    route: '运输路线',
    origin: '始发地',
    destination: '目的地',
    details: '运输详情',
    trackingNo: '物流单号',
    waybillNo: '燕文单号',
    lastMileNo: '尾程单号',
    carrier: '承运商',
    milestones: '物流轨迹',
    noMilestones: '暂无轨迹节点。',
    locale: '地点',
    warehouse: '仓储照片',
    warehouseUpdated: '更新于',
    noPhotos: '暂未上传仓储照片。',
    eta: '预计到达',
    packages: '箱数',
    units: '数量',
    current: '当前',
    langBtn: 'English',
    status: {
      delivered: '已妥投', in_transit: '运输中', out_for_delivery: '派送中',
      available_for_pickup: '待取件', exception: '异常',
      delivery_failed: '派送失败', returned: '已退回', pending: '处理中',
      not_found: '查询不到', closed: '追踪结束', stored: '仓储中',
      production: '生产中', unknown: '更新中',
    },
  },
}

const STATUS_STYLE = {
  delivered: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  in_transit: 'bg-sky-50 text-sky-700 ring-sky-200',
  out_for_delivery: 'bg-sky-50 text-sky-700 ring-sky-200',
  available_for_pickup: 'bg-amber-50 text-amber-700 ring-amber-200',
  pending: 'bg-stone-100 text-stone-600 ring-stone-200',
  stored: 'bg-stone-100 text-stone-600 ring-stone-200',
  production: 'bg-stone-100 text-stone-600 ring-stone-200',
  exception: 'bg-red-50 text-red-700 ring-red-200',
  delivery_failed: 'bg-red-50 text-red-700 ring-red-200',
  returned: 'bg-orange-50 text-orange-700 ring-orange-200',
  not_found: 'bg-stone-100 text-stone-500 ring-stone-200',
  closed: 'bg-stone-100 text-stone-500 ring-stone-200',
  unknown: 'bg-sky-50 text-sky-700 ring-sky-200',
}

function localized(item, key, lang) {
  if (!item) return ''
  if (lang === 'zh') return item[key + 'Zh'] || item[key] || ''
  return item[key] || ''
}

function fmtDate(value, lang, withTime = true) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  try {
    return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-GB', {
      year: 'numeric', month: 'short', day: '2-digit',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    }).format(d)
  } catch { return String(value) }
}

export default function TrackingPanel() {
  const [lang, setLang] = useState('en')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const t = I18N[lang]

  async function submit(e) {
    e?.preventDefault()
    const q = query.trim()
    if (!q) { setError(t.required); setResult(null); return }
    setLoading(true); setError(''); setResult(null)
    try {
      const res = await fetch(`/api/tracking?q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body.found === false || body.error) {
        if (body.code === 'YANWEN_NOT_CONFIGURED') setError(t.notConfigured)
        else if (res.status === 404 || body.found === false) setError(t.notFound)
        else setError(body.error || t.genericError)
        return
      }
      setResult(body)
    } catch {
      setError(t.genericError)
    } finally {
      setLoading(false)
    }
  }

  function sample(value) {
    setQuery(value); setError(''); setResult(null)
  }

  const statusKey = result ? (result.status || 'unknown') : ''
  const statusText = result
    ? (lang === 'zh' && result.statusLabelZh ? result.statusLabelZh : (result.statusLabel || t.status[statusKey] || statusKey))
    : ''

  return (
    <div className="rounded-2xl bg-white ring-1 ring-stone-200/70 shadow-[0_10px_40px_rgba(15,31,58,0.06)]">
      <div className="p-6 sm:p-8">
        {/* heading row */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#e07a3a]">{t.badge}</p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-stone-900">{t.title}</h2>
          </div>
          <button
            type="button"
            onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
            className="shrink-0 rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 transition-colors"
            aria-label="Switch language"
          >{t.langBtn}</button>
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-stone-500 max-w-xl">{t.intro}</p>

        {/* search */}
        <form onSubmit={submit} className="mt-6 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t.placeholder}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-4 py-3.5 text-[15px] text-stone-800 placeholder-stone-400 outline-none focus:border-[#1e5a8a] focus:ring-4 focus:ring-sky-100 transition"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-stone-900 px-7 py-3.5 text-[13px] font-semibold uppercase tracking-wider text-white hover:bg-stone-700 transition-colors disabled:opacity-50"
          >{loading ? t.searching : t.button}</button>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-stone-500">
          <span>{t.hint}</span>
          <button type="button" onClick={() => sample('UH183870291YP')} className="text-[#1e5a8a] hover:underline">
            {t.hintYanwen} <code className="font-mono">UH183870291YP</code>
          </button>
          <button type="button" onClick={() => sample('CY-THERMOS-001')} className="text-[#1e5a8a] hover:underline">
            {t.hintProduct} <code className="font-mono">CY-THERMOS-001</code>
          </button>
        </div>

        {error && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-700" role="status">
            {error}
          </div>
        )}
      </div>

      {result && (
        <div className="border-t border-stone-200 p-6 sm:p-8 space-y-7">
          {/* result head */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-lg font-semibold text-stone-900 font-mono">{result.trackingNo || result.productNo || result.query}</span>
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ${STATUS_STYLE[statusKey] || STATUS_STYLE.unknown}`}>
                  {statusText}
                </span>
              </div>
              <p className="mt-1.5 text-[12px] text-stone-500">
                {result.source === 'yanwen' ? t.sourceYanwen : t.sourceCyndi}
                <span className="mx-2 text-stone-300">·</span>
                {t.lastUpdate} {fmtDate(result.lastUpdated, lang)}
              </p>
            </div>
          </div>

          {/* route */}
          {(result.origin || result.destination) && (
            <div className="rounded-xl border border-stone-200 bg-[#faf9f6] px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">{t.route}</p>
              <div className="mt-2 flex items-center gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] text-stone-400">{t.origin}</p>
                  <p className="truncate text-[15px] font-medium text-stone-800">
                    {localized({ ...result, origin: result.origin, originZh: result.originZh }, 'origin', lang) || '—'}
                  </p>
                </div>
                <svg className="w-8 h-8 shrink-0 text-[#e07a3a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
                <div className="min-w-0">
                  <p className="text-[11px] text-stone-400">{t.destination}</p>
                  <p className="truncate text-[15px] font-medium text-stone-800">
                    {localized({ ...result, destination: result.destination, destinationZh: result.destinationZh }, 'destination', lang) || '—'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* details grid */}
          <div>
            <p className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-stone-400">{t.details}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
              <Detail label={t.carrier} value={result.carrier} />
              <Detail label={t.trackingNo} value={result.trackingNo || result.productNo} mono />
              {result.waybillNo && <Detail label={t.waybillNo} value={result.waybillNo} mono />}
              {result.exchangeNo && <Detail label={t.lastMileNo} value={result.exchangeNo} mono />}
              {result.eta && <Detail label={t.eta} value={fmtDate(result.eta, lang, false)} />}
              {result.packages != null && <Detail label={t.packages} value={result.packages} />}
              {result.quantity != null && <Detail label={t.units} value={result.quantity} />}
              {result.warehouseLocation && (
                <Detail label={lang === 'zh' ? '仓库位置' : 'Warehouse'} value={lang === 'zh' ? (result.warehouseLocationZh || result.warehouseLocation) : result.warehouseLocation} />
              )}
            </div>
          </div>

          {/* timeline */}
          {Array.isArray(result.events) && result.events.length > 0 && (
            <div>
              <p className="mb-4 text-[12px] font-semibold uppercase tracking-wider text-stone-400">{t.milestones}</p>
              <ol className="relative ml-1 border-l border-stone-200 pl-6">
                {result.events.slice().reverse().map((ev, i) => (
                  <li key={i} className="relative pb-6 last:pb-0">
                    <span className={`absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-white ring-1 ${ev.status === 'current' ? 'bg-[#e07a3a] ring-[#e07a3a]' : 'bg-stone-300 ring-stone-300'}`} />
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <time className="text-[11px] text-stone-400">{fmtDate(ev.time, lang)}</time>
                      {ev.status === 'current' && (
                        <span className="rounded bg-orange-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#c8652c]">{t.current}</span>
                      )}
                    </div>
                    <p className="mt-1 text-[14px] font-medium text-stone-800">{lang === 'zh' ? (ev.titleZh || ev.title) : (ev.title || ev.titleZh)}</p>
                    {ev.description && <p className="mt-0.5 text-[12px] text-stone-500">{ev.description}</p>}
                    {ev.location && <p className="mt-0.5 text-[12px] text-[#1e5a8a]">⌖ {ev.location}</p>}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* warehouse photos (Cyndi records only) */}
          {Array.isArray(result.warehouseImages) && result.warehouseImages.length > 0 && (
            <div className="border-t border-stone-200 pt-6">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-[12px] font-semibold uppercase tracking-wider text-stone-400">{t.warehouse}</p>
                {result.warehouseUpdated && <p className="text-[11px] text-stone-400">{t.warehouseUpdated} {fmtDate(result.warehouseUpdated, lang, false)}</p>}
              </div>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {result.warehouseImages.map((img, i) => (
                  <figure key={i} className="overflow-hidden rounded-lg bg-stone-100">
                    <img src={img.url} alt={localized(img, 'caption', lang) || ''} loading="lazy" className="h-28 w-full object-cover" />
                    <figcaption className="px-2.5 py-2 text-[11px] leading-snug text-stone-600">
                      {localized(img, 'caption', lang)}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Detail({ label, value, mono }) {
  if (value == null || value === '') return null
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-stone-400">{label}</dt>
      <dd className={`mt-1 truncate text-[14px] font-medium text-stone-800 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}
