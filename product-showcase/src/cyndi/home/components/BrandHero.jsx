// New brand hero: Cardless-inspired warm wash, Dragon Fire orange accent, new logo.
import DottedGlobe from './DottedGlobe.jsx'

export default function BrandHero() {
  return (
    <section id="top" className="hero-wash relative overflow-hidden">
      <DottedGlobe className="pointer-events-none absolute inset-y-0 right-0 w-full md:w-3/5 opacity-80" />
      <div className="relative mx-auto max-w-7xl px-6 py-20 md:py-24">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-fire">Global swag supply chain</p>
        <h1 className="mt-5 max-w-5xl text-5xl font-bold leading-[1.05] tracking-tight text-ink md:text-7xl lg:text-[5.5rem]">
          Cyndi Global —<br />Your Dedicated <span className="text-fire">SWAG Team</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-secondary md:text-xl">
          Luxury swag for brands, anywhere in the world. One global warehouse, door-to-door delivery to 200+ countries and regions.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <a href="#quote" className="rounded-full bg-fire px-8 py-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-fire-dark">Get a quote</a>
          <a href="#portal-login" className="rounded-full border border-ink/20 px-8 py-4 text-sm font-semibold text-ink transition-colors hover:border-ink/60">Portal login</a>
        </div>
      </div>
    </section>
  )
}
