export default function Section({ id, title, intro, dark = false, children }) {
  return (
    <section id={id} className={dark ? 'bg-stone-900 text-white' : 'bg-white'}>
      <div className="mx-auto max-w-6xl px-6 py-20">
        {title && <h2 className={'text-2xl md:text-4xl font-semibold tracking-tight ' + (dark ? 'text-white' : 'text-ink')}>{title}</h2>}
        {intro && <p className={'mt-4 max-w-2xl text-base ' + (dark ? 'text-stone-400' : 'text-body')}>{intro}</p>}
        <div className="mt-12">{children}</div>
      </div>
    </section>
  )
}
