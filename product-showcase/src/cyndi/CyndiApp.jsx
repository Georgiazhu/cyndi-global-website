import CyndiNavbar from './CyndiNavbar.jsx'
// Restored brand-blue hero / final CTA / footer (original design)
import BrandHero from './home/components/BrandHero.jsx'
import BrandFinalCta from './home/components/BrandFinalCta.jsx'
import BrandFooter from './home/components/BrandFooter.jsx'
// New monochrome narrative sections (self-contained under ./home)
import WhoWeAre from './home/sections/WhoWeAre.jsx'
import WhyOneWarehouse from './home/sections/WhyOneWarehouse.jsx'
import SixSteps from './home/sections/SixSteps.jsx'
import Distribution from './home/sections/Distribution.jsx'
import PortalTeaser from './home/sections/PortalTeaser.jsx'
import Faq from './home/sections/Faq.jsx'

export default function CyndiApp() {
  return (
    <div className="min-h-screen bg-white font-sans text-stone-900">
      <CyndiNavbar />
      <BrandHero />
      <main>
        <WhoWeAre />
        <WhyOneWarehouse />
        <SixSteps />
        <Distribution />
        <PortalTeaser />
        <Faq />
      </main>
      <BrandFinalCta />
      <BrandFooter />
    </div>
  )
}
