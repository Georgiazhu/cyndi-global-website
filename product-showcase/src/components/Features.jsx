const features = [
  {
    title: 'Custom Design',
    desc: 'Logo setup and full-color prints tailored to your brand.',
  },
  {
    title: 'Quality Production',
    desc: 'Factory-grade manufacturing with strict quality control.',
  },
  {
    title: 'Warehousing',
    desc: 'We store your swag and ship on demand, worldwide.',
  },
  {
    title: 'Global Delivery',
    desc: 'Full customs clearance and reliable cross-border shipping.',
  },
]

export default function Features() {
  return (
    <section className="bg-stone-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10">
          {features.map((f, idx) => (
            <div key={f.title} className="flex flex-col items-start border-t border-white/20 pt-5">
              <span className="text-xs font-medium text-stone-400">0{idx + 1}</span>
              <h3 className="mt-3 font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm text-stone-300 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
