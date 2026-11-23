import Section from '../components/Section.jsx'
import { capabilities } from '../content.js'

export default function WhoWeAre() {
  return (
    <Section id="why" title="Your swag shop and global supply-chain hub." intro="We plan, source, store, ship and distribute your brand's swag worldwide, as your external product team.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {capabilities.map((c, i) => (
          <div key={c.title} className="group rounded-2xl border border-line bg-white p-8 transition-all hover:-translate-y-1 hover:border-fire/40 hover:shadow-lg">
            <div className="text-4xl font-bold tracking-tight text-fire/90">{String(i + 1).padStart(2, '0')}</div>
            <h3 className="mt-6 text-lg font-semibold text-ink">{c.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-secondary">{c.text}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}
