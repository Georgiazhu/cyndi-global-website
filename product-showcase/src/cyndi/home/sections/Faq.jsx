import Section from '../components/Section.jsx'
import { faq } from '../content.js'

export default function Faq() {
  return (
    <Section id="faq" title="Frequently asked questions">
      <div className="divide-y divide-line">
        {faq.map((f) => (
          <details key={f.q} className="py-4">
            <summary className="cursor-pointer text-base font-medium text-ink">{f.q}</summary>
            <p className="mt-3 text-sm leading-relaxed text-body max-w-3xl">{f.a}</p>
          </details>
        ))}
      </div>
    </Section>
  )
}
