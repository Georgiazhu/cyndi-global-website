// 首页联系区块 + 页脚（Company contact block + footer）
// 联系邮箱：info@cyndiglobal.com
// 表单为纯前端实现：提交后用访客本地邮件客户端预填收件人/主题/正文，无需后端。

import { useState } from 'react'

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

const FIELD_LABEL = 'block text-[11px] font-medium uppercase tracking-[0.18em] text-stone-400 mb-2'
const FIELD_INPUT =
  'w-full border-b border-stone-300 bg-transparent py-3 text-[15px] text-stone-900 ' +
  'placeholder:text-stone-300 focus:border-stone-900 outline-none transition-colors'

export default function CyndiContact() {
  const [form, setForm] = useState({ name: '', email: '', company: '', message: '' })
  const [sent, setSent] = useState(false)

  const update = key => e => setForm(f => ({ ...f, [key]: e.target.value }))

  function handleSubmit(e) {
    e.preventDefault()
    const subject = `Website inquiry${form.company ? ` — ${form.company}` : ''}`
    const body =
      `Name: ${form.name}\nEmail: ${form.email}` +
      (form.company ? `\nCompany: ${form.company}` : '') +
      `\n\n${form.message}`
    window.location.href =
      `mailto:info@cyndiglobal.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    setSent(true)
  }

  return (
    <>
      {/* ── Contact ── */}
      <section id="contact" className="bg-stone-50 border-t border-stone-200 px-6 py-20 lg:py-28">
        <div className="max-w-7xl mx-auto">
          <div className="grid gap-14 lg:gap-16 lg:grid-cols-12 items-start">

            {/* Left — intro + details */}
            <div className="lg:col-span-5 lg:sticky lg:top-28">
              <div className="flex items-center gap-3 mb-6">
                <span className="h-px w-8 bg-stone-400" />
                <span className="text-xs font-medium uppercase tracking-[0.22em] text-stone-400">Contact</span>
              </div>

              <h2 className="text-[clamp(30px,3.6vw,42px)] font-semibold leading-[1.15] tracking-tight text-stone-900 mb-5">
                Start a conversation
              </h2>

              <p className="text-[16px] leading-relaxed text-stone-600 max-w-[440px]">
                Custom swag, brand merchandise, or a full program &mdash; tell us what your team
                needs and we&rsquo;ll come back with options, timelines, and pricing.
              </p>

              <dl className="mt-12 pt-10 border-t border-stone-200 flex flex-col gap-7">
                {CONTACT_ITEMS.map(it => (
                  <div key={it.label} className="flex items-start gap-4">
                    <span className="text-stone-400 mt-0.5 shrink-0">
                      <Icon d={it.icon} />
                    </span>
                    <div className="min-w-0">
                      <dt className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-400 mb-1.5">
                        {it.label}
                      </dt>
                      <dd className="text-[15px] font-medium text-stone-900 leading-relaxed break-words">
                        {it.href ? (
                          <a href={it.href} className="hover:text-[#e07a3a] transition-colors">{it.value}</a>
                        ) : (
                          it.value
                        )}
                      </dd>
                    </div>
                  </div>
                ))}
              </dl>
            </div>

            {/* Right — inquiry form */}
            <div className="lg:col-span-7">
              <form
                onSubmit={handleSubmit}
                className="bg-white border border-stone-200 p-8 lg:p-10"
              >
                <div className="grid gap-8 sm:grid-cols-2">
                  <div>
                    <label htmlFor="ct-name" className={FIELD_LABEL}>Name</label>
                    <input id="ct-name" type="text" required value={form.name} onChange={update('name')}
                      placeholder="Your name" className={FIELD_INPUT} />
                  </div>
                  <div>
                    <label htmlFor="ct-email" className={FIELD_LABEL}>Email</label>
                    <input id="ct-email" type="email" required value={form.email} onChange={update('email')}
                      placeholder="you@company.com" className={FIELD_INPUT} />
                  </div>
                </div>

                <div className="mt-8">
                  <label htmlFor="ct-company" className={FIELD_LABEL}>Company <span className="normal-case tracking-normal text-stone-300">(optional)</span></label>
                  <input id="ct-company" type="text" value={form.company} onChange={update('company')}
                    placeholder="Company name" className={FIELD_INPUT} />
                </div>

                <div className="mt-8">
                  <label htmlFor="ct-message" className={FIELD_LABEL}>How can we help?</label>
                  <textarea id="ct-message" rows="4" required value={form.message} onChange={update('message')}
                    placeholder="Tell us about your project, quantities, and target date."
                    className={`${FIELD_INPUT} resize-none`} />
                </div>

                <div className="mt-10 flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-7">
                  <button type="submit"
                    className="group inline-flex items-center justify-center gap-2.5 bg-stone-900 text-white px-9 py-[15px] text-[13px] font-medium uppercase tracking-wider hover:bg-[#e07a3a] transition-colors">
                    Send Message
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" className="w-[15px] h-[15px] group-hover:translate-x-1 transition-transform">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </button>
                  <p className="text-[13px] leading-relaxed text-stone-500">
                    Or email us directly at{' '}
                    <a href="mailto:info@cyndiglobal.com" className="text-stone-900 hover:text-[#e07a3a] transition-colors">
                      info@cyndiglobal.com
                    </a>
                  </p>
                </div>

                {sent ? (
                  <p className="mt-6 text-[13px] leading-relaxed text-stone-500">
                    Your email app should be opening with the message ready to send. If nothing
                    happens, please write to us at info@cyndiglobal.com.
                  </p>
                ) : (
                  <p className="mt-6 text-[13px] leading-relaxed text-stone-400">
                    We reply within one business day, Hong Kong time.
                  </p>
                )}
              </form>
            </div>
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
            Global Swag &amp; Brand Management &mdash; Empowering Brands. Engaging People.
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
