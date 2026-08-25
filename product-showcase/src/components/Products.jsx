import ProductCard from './ProductCard'

const umbrellas = [
  {
    id: 1,
    name: 'Umbrella - Transparent',
    brand: 'HRT Phuket Logo - Orange',
    image: '/images/umbrella.jpg',
    description: 'Transparent umbrella with HRT Phuket 2026 logo print. Orange accent frame with clear canopy for stylish rain protection.',
    features: [
      'Transparent POE canopy',
      'Orange frame accent',
      'HRT Phuket logo on panels',
      'Auto-open mechanism',
      'Curved handle',
    ],
    colors: ['Transparent/Orange'],
    colorValues: ['#e85d2f'],
    sizes: '52.45cm (W) × 18.78cm (H) × 38.89cm (L), 3cm fold',
    quantity: [300],
    price: ['12.50'],
    priceIncludes: '1-color logo print on 2 panels.',
    additionalCharges: ['Setup: $50'],
  },
]

const waterBottles = [
  {
    id: 2,
    name: 'Water Bottle - Adults 1000ml',
    brand: 'LocknLock',
    image: '/images/bottle-adult.jpg',
    description: 'LocknLock water bottle with HRT Lettermark + Heart Icon in orange. Double-walled construction with matte spray paint finish.',
    features: [
      '52mm Wide Caliber',
      'Quiet Non-slip Coaster',
      'Matte Spray Paint',
      'Smooth Anti-evaporation Button',
      'BPA free',
    ],
    colors: ['White'],
    colorValues: ['#ffffff'],
    sizes: '80mm × 315mm, Vol=1000ml',
    quantity: [300],
    price: ['18.90'],
    priceIncludes: 'Full-color digital print, 1 location.\nBottle body printing done by LocknLock factory with original manufacturing quality guaranteed.',
    additionalCharges: ['Setup: $65'],
  },
  {
    id: 3,
    name: 'Water Bottle - Kids 530ml',
    brand: 'LocknLock',
    image: '/images/bottle-kids.jpg',
    description: 'LocknLock kids water bottle with HRT Lettermark + Heart Icon in orange. Perfect size for children with safe materials.',
    features: [
      '52mm Wide Caliber',
      'Quiet Non-slip Coaster',
      'Matte Spray Paint',
      'Smooth Anti-evaporation Button',
      'BPA free',
      'Kid-friendly size',
    ],
    colors: ['White'],
    colorValues: ['#ffffff'],
    sizes: '75mm × 210mm, Vol=530ml',
    quantity: [300],
    price: ['15.60'],
    priceIncludes: 'Full-color digital print, 1 location.\nBottle body printing done by LocknLock factory with original manufacturing quality guaranteed.',
    additionalCharges: ['Setup: $65'],
  },
]

const toteBags = [
  {
    id: 4,
    name: 'Tote Bag - Waterproof styles2',
    brand: 'HRT Hudson River Trading - Light Blue',
    image: '/images/tote-waterproof.jpg',
    description: 'Waterproof tote bag in light blue with HRT logo. Features composite cloth exterior with lining fabric interior. Multiple compartments for organization.',
    features: [
      'Composite cloth + lining fabric',
      '1 independent zippered inner pocket with lining',
      '1 magnetic snap for main closure',
      '1 No.5 zipper for inner pocket',
      '1 No.5 zipper for the outer small pouch',
      'Front and back magnetic snap pockets',
    ],
    colors: ['Light Blue', 'Cream'],
    colorValues: ['#a8d4e6', '#f5f0e0'],
    sizes: 'Length: 47cm × Width: 15cm × Height: 35cm',
    quantity: [300],
    price: ['28.50'],
    priceIncludes: 'Full-color digital transfer imprint, 1 location.',
    additionalCharges: ['Setup (full color): $95'],
  },
  {
    id: 5,
    name: 'Tote Bag - Canvas styles1（Orange）',
    brand: 'HRT Phuket Logo - Orange Trim',
    image: '/images/tote-canvas-orange.jpg',
    description: 'Canvas tote bag with orange trim and HRT Phuket logo. Made from durable polyester-cotton canvas with magnetic snap closure.',
    features: [
      '16oz Polyester-Cotton Canvas',
      'Rubber Sole base',
      '1 Independent zippered pocket',
      'Mini Zipper Pocket',
      '1 Magnetic Snap closure',
      '#3 Zipper for Inner Pocket',
    ],
    materials: '16安涤棉帆布+四方格纹 (Poly Polyester-Cotton Canvas)',
    colors: ['White/Orange'],
    colorValues: ['#e85d2f'],
    sizes: 'Length: 50cm × Width: 15cm × Height: 35cm',
    quantity: [300],
    price: ['25.80'],
    priceIncludes: 'Full-color digital transfer imprint, 1 location.',
    additionalCharges: ['Setup (full color): $95'],
  },
  {
    id: 6,
    name: 'Tote Bag - Canvas styles2（Medium Green）',
    brand: 'HRT Phuket Logo - Green Trim',
    image: '/images/tote-canvas-green.jpg',
    description: 'Canvas tote bag with medium green trim and HRT Phuket logo. Same premium construction as styles1 with a nature-inspired color accent.',
    features: [
      '16oz Polyester-Cotton Canvas',
      'Rubber Sole base',
      '1 Independent zippered pocket',
      'Mini Zipper Pocket',
      '1 Magnetic Snap closure',
      '#3 Zipper for Inner Pocket',
    ],
    materials: '16安涤棉帆布+四方格纹 (Poly Polyester-Cotton Canvas)',
    colors: ['White/Green'],
    colorValues: ['#2d7a4f'],
    sizes: 'Length: 50cm × Width: 15cm × Height: 35cm',
    quantity: [300],
    price: ['25.80'],
    priceIncludes: 'Full-color digital transfer imprint, 1 location.',
    additionalCharges: ['Setup (full color): $95'],
  },
]

function ProductSection({ id, title, count, products }) {
  return (
    <div id={id} className="mb-20 scroll-mt-28">
      {/* Category Title */}
      <div className="flex items-baseline justify-between border-b border-stone-300 mb-10 pb-3">
        <h2 className="text-xl font-semibold uppercase tracking-wide text-stone-900">{title}</h2>
        <span className="text-xs uppercase tracking-wide text-stone-400">{count} items</span>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
        {products.map(product => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  )
}

export default function Products() {
  return (
    <section id="products" className="bg-[#faf9f6]">
      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto py-20 scroll-mt-24">
        <div className="max-w-2xl mb-16">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">The collection</p>
          <h2 className="mt-3 text-3xl md:text-4xl font-semibold text-stone-900 tracking-tight">All swag</h2>
          <p className="mt-4 text-sm text-stone-500 leading-relaxed">
            Prices are pre-tax and pre-shipping, considered confidential, and valid for 30 days.
            Pricing and availability are subject to change without notice.
          </p>
        </div>

        <ProductSection id="tote-bags" title="Tote Bags" count={toteBags.length} products={toteBags} />
        <ProductSection id="water-bottles" title="Water Bottles" count={waterBottles.length} products={waterBottles} />
        <ProductSection id="umbrellas" title="Umbrellas" count={umbrellas.length} products={umbrellas} />
      </div>
    </section>
  )
}
