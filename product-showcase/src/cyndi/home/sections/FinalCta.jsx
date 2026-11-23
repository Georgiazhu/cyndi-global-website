import { PORTAL_LOGIN_URL, QUOTE_URL } from '../content.js'

export default function FinalCta() {
  return (
    <section id="quote" className="bg-stone-900 text-white">
      <div className="mx-auto max-w-6xl px-6 py-24 text-center">
        <p className="text-xs uppercase tracking-[0.28em] text-stone-500">Contact</p>
        <h2 className="mt-4 text-3xl md:text-4xl font-semibold tracking-tight">Start a conversation</h2>
        <p className="mt-4 text-sm text-stone-400">Tell us what your team needs and we'll come back with options, timelines, and pricing.</p>
        <div className="mt-10 flex justify-center gap-4">
          <a href={QUOTE_URL} className="bg-white px-9 py-3.5 text-xs uppercase tracking-widest font-medium text-stone-900 hover:bg-stone-200">Get a quote</a>
          <a href={PORTAL_LOGIN_URL} className="border border-white/60 px-9 py-3.5 text-xs uppercase tracking-widest font-medium text-white hover:bg-white/10">Portal login</a>
        </div>
      </div>
    </section>
  )
}
