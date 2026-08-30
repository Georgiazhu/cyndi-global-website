import { products, sectionOrder } from '../data/products'

// 每个品类取第一个商品的图做封面，链接到对应 section 锚点
const categories = sectionOrder.map(section => {
  const first = products.find(p => p.category === section.key)
  const count = products.filter(p => p.category === section.key).length
  return {
    title: section.title,
    href: `#${section.key}`,
    image: first ? first.image : '',
    blurb: `${count} styles`,
  }
})

export default function Categories() {
  return (
    <section id="categories" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 scroll-mt-28">
      <div className="max-w-2xl mb-12">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">Shop by category</p>
        <h2 className="mt-3 text-3xl md:text-4xl font-semibold text-stone-900 tracking-tight">Find your next favorite piece</h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
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
                className="h-full w-full object-contain p-4 transition-transform duration-500 group-hover:scale-[1.04]"
              />
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
              <h3 className="font-semibold text-white text-sm">{cat.title}</h3>
              <p className="text-xs text-stone-200">{cat.blurb}</p>
            </div>
          </a>
        ))}
      </div>
    </section>
  )
}
