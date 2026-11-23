export default function Section({ id, title, intro, dark = false, children }) {
  return (
    <section id={id} className={dark ? 'bg-ink text-white' : 'bg-white'}>
      <div className="mx-auto max-w-7xl px-6 py-14 md:py-20">
        {title && <h2 className={'max-w-4xl text-3xl font-bold leading-tight tracking-tight md:text-5xl ' + (dark ? 'text-white' : 'text-ink')}>{title}</h2>}
        {intro && <p className={'mt-5 max-w-2xl text-base leading-relaxed md:text-lg ' + (dark ? 'text-white/60' : 'text-secondary')}>{intro}</p>}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  )
}
