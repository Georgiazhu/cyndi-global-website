// New brand footer: deep-ink background with the white logo wordmark.
export default function BrandFooter() {
  return (
    <footer className="bg-ink text-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-12">
        <div className="flex flex-col justify-between gap-10 md:flex-row">
          <div>
            <img src="/cyndi-logo-full-white-v5.png" alt="Cyndi Global" className="h-8 w-auto" />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/50">Luxury swag for brands, anywhere in the world.</p>
            <p className="mt-1 text-sm text-white/50">Hong Kong</p>
            <a href="mailto:info@cyndiglobal.com" className="mt-3 inline-block text-sm text-white/70 transition-colors hover:text-oat">info@cyndiglobal.com</a>
          </div>
          <div className="flex flex-col gap-3 text-sm sm:flex-row sm:gap-14">
            <a href="#portal-login" className="text-white/70 transition-colors hover:text-oat">Portal login</a>
            <a href="mailto:info@cyndiglobal.com" className="text-white/70 transition-colors hover:text-oat">Get a quote</a>
            <a href="/catalog/logistics.html" className="text-white/70 transition-colors hover:text-oat">Track a shipment</a>
          </div>
        </div>
        <div className="mt-14 border-t border-white/10 pt-6 text-xs text-white/40">
          © 2026 Cyndi Global Limited. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
