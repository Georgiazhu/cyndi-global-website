import { PORTAL_LOGIN_URL, QUOTE_URL } from '../content.js'

export default function Hero() {
  return (
    <section id="top" className="bg-white text-stone-900">
      <div className="mx-auto max-w-6xl px-6 py-28 md:py-36 text-center flex flex-col items-center">
        <p className="text-xs uppercase tracking-[0.28em] text-stone-500">Global swag &amp; brand management</p>
        <h1 className="mt-6 text-5xl md:text-7xl font-semibold tracking-tight leading-[1.05]">
          Cyndi
        </h1>
        <p className="mt-5 text-base md:text-lg text-stone-600 tracking-wide">
          Empowering Brands. Engaging People.
        </p>
        <p className="mt-8 text-sm md:text-base text-stone-500 max-w-2xl leading-relaxed">
          Your dedicated product team — luxury swag, one global warehouse, and door-to-door delivery to 200+ countries and regions.
        </p>
        <a href={QUOTE_URL} className="mt-10 border border-stone-900 px-9 py-3.5 text-xs uppercase tracking-widest font-medium text-stone-900 hover:bg-stone-900 hover:text-white transition-colors">
          Explore more &nbsp;→
        </a>
        <div className="mt-24 text-[10px] uppercase tracking-[0.3em] text-stone-400">Scroll</div>
      </div>
    </section>
  )
}
