import { PORTAL_LOGIN_URL, QUOTE_URL } from '../content.js'

export default function Hero() {
  return (
    <section id="top" className="hero-wash relative overflow-hidden">
      {/* dotted grid decoration */}
      <div className="dot-grid pointer-events-none absolute inset-y-0 right-0 w-1/2 text-fire/25" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-6 py-28 md:py-40">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-fire">Global swag supply chain</p>
        <h1 className="mt-7 max-w-5xl text-5xl font-bold leading-[1.05] tracking-tight text-ink md:text-7xl lg:text-[5.5rem]">
          Cyndi Global —<br />Your Dedicated <span className="text-fire">SWAG Team</span>
        </h1>
        <p className="mt-8 max-w-2xl text-lg leading-relaxed text-secondary md:text-xl">
          Luxury swag for brands, anywhere in the world. One global warehouse, door-to-door delivery to 200+ countries and regions.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <a href={QUOTE_URL} className="rounded-full bg-fire px-8 py-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-fire-dark">Get a quote</a>
          <a href={PORTAL_LOGIN_URL} className="rounded-full border border-ink/20 px-8 py-4 text-sm font-semibold text-ink transition-colors hover:border-ink/60">Portal login</a>
        </div>
        {/* mini stat strip, cardless style */}
        <dl className="mt-20 flex flex-wrap gap-x-14 gap-y-6 border-t border-line pt-8">
          <div><dt className="text-3xl font-bold tracking-tight text-ink md:text-4xl">200+</dt><dd className="mt-1 text-sm text-muted">countries &amp; regions</dd></div>
          <div><dt className="text-3xl font-bold tracking-tight text-ink md:text-4xl">1</dt><dd className="mt-1 text-sm text-muted">global warehouse</dd></div>
          <div><dt className="text-3xl font-bold tracking-tight text-ink md:text-4xl">DDP</dt><dd className="mt-1 text-sm text-muted">duties itemized</dd></div>
        </dl>
      </div>
    </section>
  )
}
