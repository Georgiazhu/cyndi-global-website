// Restored from the original design: deep-navy footer with brand links.
export default function BrandFooter() {
  return (
    <footer className="bg-brand-deep text-brand-light">
      <div className="mx-auto max-w-6xl px-6 py-12 flex flex-col md:flex-row justify-between gap-8 text-sm">
        <div>
          <div className="text-white text-lg font-bold">Cyndi Global</div>
          <p className="mt-2 max-w-sm">Luxury swag for brands, anywhere in the world.</p>
          <p className="mt-2 opacity-80">Hong Kong</p>
          <a href="mailto:info@cyndiglobal.com" className="mt-2 block opacity-80 hover:text-white">info@cyndiglobal.com</a>
        </div>
        <div className="flex gap-10">
          <a href="#portal-login" className="hover:text-white">Portal login</a>
          <a href="mailto:info@cyndiglobal.com" className="hover:text-white">Get a quote</a>
          <a href="/catalog/logistics.html" className="hover:text-white">Track a shipment</a>
        </div>
      </div>
    </footer>
  )
}
