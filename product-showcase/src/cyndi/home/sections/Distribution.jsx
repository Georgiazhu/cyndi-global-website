import Section from '../components/Section.jsx'
import { distribution } from '../content.js'

export default function Distribution() {
  return (
    <Section title="Four ways to get swag to your people" intro="All four draw from the same inventory, so stock always adds up.">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-line border border-line">
        {distribution.map((d) => (
          <div key={d.tag} className="bg-white p-7">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">{d.tag}</div>
            <h3 className="mt-3 text-base font-semibold text-ink">{d.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-body">{d.text}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}
