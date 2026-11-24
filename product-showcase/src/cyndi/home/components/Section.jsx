export default function Section({ id, title, intro, dark = false, tone, children }) {
  const bg = tone === 'oat' ? 'bg-oat-soft' : dark ? 'bg-ink text-white' : 'bg-white'
  return (
    <section id={id} className={bg}>
      <div className="mx-auto max-w-7xl px-6 py-10 md:py-12">
        {title && <h2 className={'max-w-4xl text-3xl font-bold leading-tight tracking-tight md:text-5xl ' + (dark ? 'text-white' : 'text-ink')}>{title}</h2>}
        {intro && <p className={'mt-4 max-w-2xl text-base leading-relaxed md:text-lg ' + (dark ? 'text-white/60' : 'text-secondary')}>{intro}</p>}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  )
}
