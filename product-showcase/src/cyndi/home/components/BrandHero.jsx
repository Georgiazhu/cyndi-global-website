// Cardless-inspired hero, recoloured in Dragon Fire orange.
import DottedGlobe from './DottedGlobe.jsx'

export default function BrandHero() {
  return (
    <section id="top" className="hero-wash relative overflow-hidden">
      <DottedGlobe className="pointer-events-none absolute inset-y-0 right-0 w-full md:w-3/5 opacity-85" />
      <div className="relative mx-auto max-w-7xl px-6 py-24 md:py-28">
        <h1 className="max-w-4xl text-4xl font-medium leading-[1.08] tracking-tight text-ink md:text-5xl lg:text-[4.25rem]">
          Your Dedicated<br /><span className="text-fire">SWAG Team</span>
        </h1>
        <p className="mt-7 max-w-md text-base leading-relaxed text-secondary md:text-lg">
          Luxury swag for brands, anywhere in the world. One global warehouse, door-to-door delivery to 200+ countries and regions.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-4">
          <a href="#quote" className="rounded-full bg-white px-8 py-4 text-sm font-semibold text-ink shadow-sm transition-colors hover:bg-white/80">Get a quote</a>
          <a href="#portal-login" className="text-sm font-semibold text-ink/70 underline-offset-4 transition-colors hover:text-ink hover:underline">Portal login</a>
        </div>
      </div>
    </section>
  )
}
