import Section from '../components/Section.jsx'
import { portalFeatures, PORTAL_LOGIN_URL } from '../content.js'

export default function PortalTeaser() {
  return (
    <Section id="portal" title="Everything your brand needs, in one portal" intro="Sign in once to manage orders, inventory and deliveries.">
      <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-4 bg-line border border-line">
        {portalFeatures.map((f) => (
          <div key={f.title} className="bg-white p-7">
            <div className="text-lg text-stone-400">✓</div>
            <h3 className="mt-3 text-base font-semibold text-ink">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-body">{f.text}</p>
          </div>
        ))}
      </div>
      <a href={PORTAL_LOGIN_URL} className="mt-10 inline-block border border-stone-900 px-8 py-3 text-xs uppercase tracking-widest font-medium text-stone-900 hover:bg-stone-900 hover:text-white transition-colors">Portal login</a>
    </Section>
  )
}
