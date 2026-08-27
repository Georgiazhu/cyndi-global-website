export default function CyndiHero() {
  return (
    <section id="top" className="relative min-h-screen flex items-center justify-center bg-white px-6 pt-32 pb-20">
      <div className="max-w-[760px] text-center flex flex-col items-center animate-fade-up">
        <span className="text-xs font-medium uppercase tracking-[0.22em] text-stone-400 mb-5">
          Global Swag &amp; Brand Management
        </span>
        <h1 className="text-[clamp(56px,10vw,112px)] font-semibold leading-none tracking-tight text-stone-900 mb-5">
          Cyndi
        </h1>
        <p className="text-[clamp(17px,2.2vw,21px)] leading-relaxed text-stone-600 max-w-[520px] mb-10">
          Empowering Brands. Engaging People.
        </p>
        <a
          href="#about"
          className="group inline-flex items-center gap-2.5 border border-stone-900 text-stone-900 px-9 py-[15px] text-[13px] font-medium uppercase tracking-wider hover:bg-stone-900 hover:text-white transition-colors"
        >
          Explore More
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" className="w-[15px] h-[15px] group-hover:translate-x-1 transition-transform">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </a>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.2em] text-stone-400">Scroll</span>
        <span className="w-px h-9 bg-gradient-to-b from-stone-400 to-transparent" />
      </div>
    </section>
  )
}
