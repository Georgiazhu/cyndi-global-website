import CyndiNavbar from './CyndiNavbar.jsx'
import CyndiHero from './CyndiHero.jsx'
import CyndiContact from './CyndiContact.jsx'

export default function CyndiApp() {
  return (
    <div className="min-h-screen bg-white font-sans text-stone-900">
      <CyndiNavbar />
      <CyndiHero />
      <CyndiContact />
    </div>
  )
}
