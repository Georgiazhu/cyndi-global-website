const categories = [
  {
    title: 'Tote Bags',
    href: '#tote-bags',
    image: '/images/tote-canvas-green.jpg',
    blurb: 'Canvas & waterproof styles',
  },
  {
    title: 'Water Bottles',
    href: '#water-bottles',
    image: '/images/bottle-adult.jpg',
    blurb: 'LocknLock, adult & kids',
  },
  {
    title: 'Umbrellas',
    href: '#umbrellas',
    image: '/images/umbrella.jpg',
    blurb: 'Auto-open, logo print',
  },
]

export default function Categories() {
  return (
    <section id="categories" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 scroll-mt-28">
      <div className="max-w-2xl mb-12">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">Shop by category</p>
        <h2 className="mt-3 text-3xl md:text-4xl font-semibold text-stone-900 tracking-tight">Find your next favorite piece</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {categories.map(cat => (
          <a
            key={cat.href}
            href={cat.href}
            className="group relative overflow-hidden bg-[#f2efe9]"
          >
            <div className="aspect-[4/5] flex items-center justify-center overflow-hidden">
              <img
                src={cat.image}
                alt={cat.title}
                className="h-full w-full object-contain p-8 transition-transform duration-500 group-hover:scale-[1.04]"
              />
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/60 to-transparent">
              <h3 className="font-semibold text-white text-lg">{cat.title}</h3>
              <p className="text-sm text-stone-200">{cat.blurb}</p>
              <span className="mt-2 inline-block text-xs font-medium uppercase tracking-wide text-white underline underline-offset-4 decoration-white/50 group-hover:decoration-white transition-colors">
                Shop now
              </span>
            </div>
          </a>
        ))}
      </div>
    </section>
  )
}
