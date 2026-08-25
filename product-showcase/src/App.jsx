import { CartProvider } from './context/CartContext'
import { AuthProvider } from './context/AuthContext'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Categories from './components/Categories'
import Features from './components/Features'
import Products from './components/Products'
import Cart from './components/Cart'

function App() {
  return (
    <AuthProvider>
    <CartProvider>
      <div className="min-h-screen bg-[#faf9f6]">
        <Navbar />
        <Hero />
        <Categories />
        <Products />
        <Features />
        <Cart />

        {/* Footer */}
        <footer className="bg-[#faf9f6] border-t border-stone-200 text-stone-600">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <div className="flex flex-col md:flex-row justify-between gap-10">
              <div className="max-w-sm">
                <span className="font-semibold text-lg text-stone-900 uppercase tracking-tight">Swag</span>
                <p className="mt-4 text-sm text-stone-500 leading-relaxed">
                  Premium custom branded merchandise for your team — designed,
                  produced, and delivered with boutique-level care.
                </p>
              </div>
              <div className="flex gap-16">
                <div>
                  <p className="text-stone-900 font-medium text-xs uppercase tracking-wide mb-4">Shop</p>
                  <ul className="space-y-2.5 text-sm">
                    <li><a href="#tote-bags" className="hover:text-stone-900 transition-colors">Tote Bags</a></li>
                    <li><a href="#water-bottles" className="hover:text-stone-900 transition-colors">Water Bottles</a></li>
                    <li><a href="#umbrellas" className="hover:text-stone-900 transition-colors">Umbrellas</a></li>
                  </ul>
                </div>
                <div>
                  <p className="text-stone-900 font-medium text-xs uppercase tracking-wide mb-4">Company</p>
                  <ul className="space-y-2.5 text-sm">
                    <li><a href="#categories" className="hover:text-stone-900 transition-colors">Categories</a></li>
                    <li><a href="#top" className="hover:text-stone-900 transition-colors">Back to top</a></li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="border-t border-stone-200 mt-12 pt-6 text-xs text-stone-400">
              © 2026 Swag store. All rights reserved.
            </div>
          </div>
        </footer>
      </div>
    </CartProvider>
    </AuthProvider>
  )
}

export default App
