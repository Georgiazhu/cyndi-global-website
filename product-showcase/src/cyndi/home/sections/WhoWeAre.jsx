import Section from '../components/Section.jsx'
import { capabilities } from '../content.js'

export default function WhoWeAre() {
  return (
    <Section id="why" title="Your swag shop and global supply-chain hub." intro="We plan, source, store, ship and distribute your brand's swag worldwide, as your external product team.">
      <div className="grid md:grid-cols-3 gap-px bg-line border border-line">
        {capabilities.map((c) => (
          <div key={c.title} className="bg-white p-7">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink">{c.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-body">{c.text}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}
