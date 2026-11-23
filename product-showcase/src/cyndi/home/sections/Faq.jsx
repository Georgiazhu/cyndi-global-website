import Section from '../components/Section.jsx'
import { faq } from '../content.js'

export default function Faq() {
  return (
    <Section id="faq" title="Frequently asked questions">
      <div className="divide-y divide-line border-y border-line">
        {faq.map((f) => (
          <details key={f.q} className="group py-6">
            <summary className="flex cursor-pointer list-none items-center justify-between text-base font-semibold text-ink">
              {f.q}
              <span className="text-2xl font-light text-oat transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-secondary">{f.a}</p>
          </details>
        ))}
      </div>
    </Section>
  )
}
