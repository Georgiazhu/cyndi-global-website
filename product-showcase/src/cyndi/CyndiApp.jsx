import CyndiNavbar from './CyndiNavbar.jsx'
import CyndiHero from './CyndiHero.jsx'

export default function CyndiApp() {
  return (
    <div className="min-h-screen bg-white font-sans text-stone-900">
      <CyndiNavbar />
      <CyndiHero />
      {/* Spacer so you can scroll and see the nav "scrolled" state */}
      <section className="h-[120vh] bg-white flex items-start justify-center pt-24">
        <p className="text-stone-400 text-sm">Scroll area — rest of the page would go here.</p>
      </section>
    </div>
  )
}
