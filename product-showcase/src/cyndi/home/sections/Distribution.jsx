import Section from '../components/Section.jsx'
import { distribution } from '../content.js'

export default function Distribution() {
  return (
    <Section title="Four ways to get swag to your people" intro="All four draw from the same inventory, so stock always adds up.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {distribution.map((d) => (
          <div key={d.tag} className="rounded-2xl border border-line bg-white p-8 transition-all hover:-translate-y-1 hover:border-fire/40 hover:shadow-lg">
            <span className="inline-block rounded-full bg-fire-soft px-3 py-1 text-xs font-bold tracking-wider text-fire">{d.tag}</span>
            <h3 className="mt-5 text-lg font-semibold text-ink">{d.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-secondary">{d.text}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}
