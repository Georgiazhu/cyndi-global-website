// 首页联系区块 + 页脚（Company contact block + footer）
// 联系邮箱：info@cyndiglobal.com

const CONTACT_ITEMS = [
  {
    label: 'Email',
    value: 'info@cyndiglobal.com',
    href: 'mailto:info@cyndiglobal.com',
    icon: 'M3 7.5 12 13l9-5.5M4.5 5.5h15a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17V7a1.5 1.5 0 0 1 1.5-1.5Z',
  },
  {
    label: 'Address',
    value: "RM 1307, 13/F, Kenbo Commercial Building, 335-339 Queen's Road West, Hong Kong",
    icon: 'M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  },
  {
    label: 'Website',
    value: 'cyndiglobal.com',
    href: 'https://www.cyndiglobal.com',
    icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z',
  },
]

function Icon({ d, className = 'w-5 h-5' }) {
  const parts = d.split(/(?=M)/).map(s => s.trim()).filter(Boolean)
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      {parts.map((p, i) => <path key={i} d={p} />)}
    </svg>
  )
}

export default function CyndiContact() {
  return (
    <>
      {/* ── Contact ── */}
      <section id="contact" className="bg-white border-t border-stone-200 px-6 py-24 lg:py-28">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center text-center">
            <span className="text-xs font-medium uppercase tracking-[0.22em] text-stone-400 mb-5">Contact</span>
            <h2 className="text-[clamp(34px,5vw,56px)] font-semibold leading-tight tracking-tight text-stone-900 mb-5">
              Let&rsquo;s Talk
            </h2>
            <p className="text-[clamp(16px,1.9vw,18px)] leading-relaxed text-stone-600 max-w-[560px]">
              Custom swag, brand merchandise, or a full program — tell us what your team needs.
              We usually reply within one business day.
            </p>
          </div>

          <div className="grid gap-10 md:grid-cols-3 max-w-5xl mx-auto mt-16">
            {CONTACT_ITEMS.map(it => (
              <div key={it.label} className="flex flex-col items-center text-center gap-3 md:items-start md:text-left">
                <span className="text-stone-400">
                  <Icon d={it.icon} />
                </span>
                <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-400">{it.label}</span>
                {it.href ? (
                  <a href={it.href} className="text-[15px] font-medium text-stone-900 hover:text-[#e07a3a] transition-colors break-words">
                    {it.value}
                  </a>
                ) : (
                  <p className="text-[15px] font-medium text-stone-900 leading-relaxed break-words">{it.value}</p>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-center mt-14">
            <a href="mailto:info@cyndiglobal.com"
              className="group inline-flex items-center gap-2.5 border border-stone-900 text-stone-900 px-9 py-[15px] text-[13px] font-medium uppercase tracking-wider hover:bg-stone-900 hover:text-white transition-colors">
              Email Us
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                className="w-[15px] h-[15px] group-hover:translate-x-1 transition-transform">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-stone-900 text-stone-400 px-6 py-14">
        <div className="max-w-7xl mx-auto flex flex-col items-center text-center gap-5">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-white text-stone-900 grid place-items-center text-sm font-bold">C</span>
            <span className="text-xl font-semibold tracking-tight text-white">Cyndi</span>
          </div>
          <p className="text-[13px] leading-relaxed max-w-md">
            Global Swag &amp; Brand Management — Empowering Brands. Engaging People.
          </p>
          <a href="mailto:info@cyndiglobal.com" className="text-[13px] text-white hover:text-[#e07a3a] transition-colors">
            info@cyndiglobal.com
          </a>
          <div className="w-full pt-6 mt-2 border-t border-stone-800 text-[12px] text-stone-500">
            &copy; 2026 Cyndi Global Limited. All rights reserved. &middot; Hong Kong
          </div>
        </div>
      </footer>
    </>
  )
}
