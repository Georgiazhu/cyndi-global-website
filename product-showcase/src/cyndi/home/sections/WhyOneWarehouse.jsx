import Section from '../components/Section.jsx'
import { compare } from '../content.js'

export default function WhyOneWarehouse() {
  return (
    <Section title="Why one global warehouse" dark>
      <div className="grid md:grid-cols-2 gap-px bg-white/10 border border-white/10">
        <div className="bg-stone-900 p-8">
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Without Cyndi</h3>
          <ul className="mt-6 space-y-3 text-sm text-stone-400">{compare.without.map((t) => <li key={t}>– {t}</li>)}</ul>
        </div>
        <div className="bg-white p-8">
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">With Cyndi Global</h3>
          <ul className="mt-6 space-y-3 text-sm text-stone-900">{compare.withCyndi.map((t) => <li key={t}>✓ {t}</li>)}</ul>
        </div>
      </div>
    </Section>
  )
}
