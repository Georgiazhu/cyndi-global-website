export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-stone-900 text-white">
      {/* Background image */}
      <div className="absolute inset-0">
        <img
          src="/images/tote-canvas-orange.jpg"
          alt=""
          aria-hidden="true"
          className="w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-stone-900 via-stone-900/70 to-stone-900/40" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-28 md:py-40">
        <div className="max-w-2xl">
          <span className="inline-block text-xs font-medium uppercase tracking-[0.2em] text-stone-300">
            Branded Merch
          </span>
          <h1 className="mt-5 text-4xl md:text-5xl lg:text-6xl font-semibold leading-[1.05] tracking-tight">
            Swag your team will actually love.
          </h1>
          <p className="mt-6 text-base md:text-lg text-stone-200 max-w-lg leading-relaxed">
            Premium custom tote bags, drinkware, and umbrellas — designed, produced,
            and delivered with boutique-level care.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <a
              href="#products"
              className="bg-white text-stone-900 px-8 py-3 text-sm font-medium uppercase tracking-wide hover:bg-stone-200 transition-colors"
            >
              Shop the collection
            </a>
            <a
              href="#categories"
              className="border border-white/60 text-white px-8 py-3 text-sm font-medium uppercase tracking-wide hover:bg-white/10 transition-colors"
            >
              Browse categories
            </a>
          </div>

          {/* Stats */}
          <div className="mt-14 flex gap-12 border-t border-white/15 pt-8">
            {[
              { value: '300+', label: 'Units per style' },
              { value: '3', label: 'Product lines' },
              { value: '100%', label: 'Custom branded' },
            ].map(stat => (
              <div key={stat.label}>
                <p className="text-2xl md:text-3xl font-semibold">{stat.value}</p>
                <p className="text-xs text-stone-300 mt-1 uppercase tracking-wide">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
