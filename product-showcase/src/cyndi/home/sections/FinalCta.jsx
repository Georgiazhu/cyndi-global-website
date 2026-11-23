import { PORTAL_LOGIN_URL, QUOTE_URL } from '../content.js'

export default function FinalCta() {
  return (
    <section id="quote" className="relative overflow-hidden bg-fire text-white">
      <div className="dot-grid pointer-events-none absolute inset-0 text-white/15" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-6 py-28 text-center md:py-36">
        <p className="mb-5 text-sm font-medium tracking-wide text-white/75">Empowering Brands,Engaging People</p>
        <h2 className="mx-auto max-w-4xl text-4xl font-bold leading-tight tracking-tight md:text-6xl">Let's build your global swag program.</h2>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <a href={QUOTE_URL} className="rounded-full bg-white px-8 py-4 text-sm font-semibold text-fire shadow-sm transition-colors hover:bg-white/90">Get a quote</a>
          <a href={PORTAL_LOGIN_URL} className="rounded-full border border-white/70 px-8 py-4 text-sm font-semibold text-white transition-colors hover:bg-white/10">Portal login</a>
        </div>
      </div>
    </section>
  )
}
