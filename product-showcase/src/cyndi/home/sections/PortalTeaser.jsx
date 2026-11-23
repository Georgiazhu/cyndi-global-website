import Section from '../components/Section.jsx'
import { portalFeatures, PORTAL_LOGIN_URL } from '../content.js'

export default function PortalTeaser() {
  return (
    <Section id="portal" title="Everything your brand needs, in one portal" intro="Sign in once to manage orders, inventory and deliveries.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {portalFeatures.map((f) => (
          <div key={f.title} className="rounded-2xl border border-line bg-white p-8">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-oat-soft text-lg text-oat">✓</div>
            <h3 className="mt-5 text-base font-semibold text-ink">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-secondary">{f.text}</p>
          </div>
        ))}
      </div>
      <a href={PORTAL_LOGIN_URL} className="mt-12 inline-block rounded-full bg-fire px-9 py-4 text-xs font-semibold uppercase tracking-widest text-white shadow-sm transition-colors hover:bg-fire-dark">Portal login</a>
    </Section>
  )
}
