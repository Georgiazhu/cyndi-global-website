import Section from '../components/Section.jsx'
import { compare } from '../content.js'

export default function WhyOneWarehouse() {
  return (
    <Section title="Why one global warehouse" dark>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-10">
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">Without Cyndi</h3>
          <ul className="mt-8 space-y-4 text-base text-white/60">
            {compare.without.map((t) => <li key={t} className="flex gap-3"><span className="text-white/30">–</span>{t}</li>)}
          </ul>
        </div>
        <div className="rounded-2xl bg-white p-10">
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-oat">With Cyndi Global</h3>
          <ul className="mt-8 space-y-4 text-base font-medium text-ink">
            {compare.withCyndi.map((t) => <li key={t} className="flex gap-3"><span className="text-oat">✓</span>{t}</li>)}
          </ul>
        </div>
      </div>
    </Section>
  )
}
