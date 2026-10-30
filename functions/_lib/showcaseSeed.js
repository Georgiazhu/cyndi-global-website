/**
 * Showcase seed data.
 * Mirrors src/data/showcase.json in the showcase repo; used to seed D1 on first access.
 * Once the admin saves anything, the database wins and the seed is never used again.
 */
export const showcaseSeed = {
  meta: {
    title: 'SHOWCASE',
    subtitle: 'Cyndi Global — Custom Swag Proposal',
    projectName: 'Cyndi Global | Corporate Gifting 2026',
    date: '10/29/26',
    recipients: [{ name: 'Sarah Song', email: 'sarah@cyndiglobal.com' }],
    jobs: [{ label: 'Job', value: 'CY-2026-SWAG-001' }],
    disclaimer:
      'All prices herein are pre-tax and pre-shipping unless otherwise noted, are considered confidential, and are valid for 30 days from receipt of quote. Pricing and availability are subject to change without notice.',
  },
  categories: [
    {
      id: 'canvas-totes',
      name: 'Canvas Totes',
      products: [
        {
          id: 'cy-tote-001',
          sku: 'T3265271',
          name: 'Heritage Supply Co. Legacy Tote',
          description:
            'From work to weekend to travel, the Legacy Tote moves with ease. Sleek recycled materials and smart interior organization ensure timeless style — so you’re always polished and prepared.',
          features: [
            'Zippered top access to main compartment with interior organization and a laptop sleeve with secured flap',
            'Additional front panel zippered pocket for smaller essentials and back panel trolley tunnel',
            'Vegan leather wrapped tote handles for comfortable hand carry',
            'Durable construction using recycled materials with reinforced vegan leather bottom panel',
          ],
          materials: '210D rPET/PU Canvas, 100% Recycled Poly Foam, 58% Recycled PU',
          image: '/showcase/images/products/canvas-totes/legacy-tote.jpg',
          gallery: ['/showcase/images/products/canvas-totes/legacy-tote.jpg'],
          colors: [
            { name: 'Black', hex: '#1c1917', image: '/showcase/images/products/canvas-totes/legacy-tote.jpg' },
            { name: 'Trench Coat', hex: '#c3b49a', image: '/showcase/images/products/canvas-totes/legacy-tote.jpg' },
          ],
          sizes: ['14.5"L x 15"H x 4.75"W'],
          pricing: [{ quantity: 300, price: 39.98 }],
          priceIncludes: '1-color heat transfer imprint, 1 location.',
          priceNotes: ['Pre tax. Pre shipping', 'Cost may vary based upon final approved artwork.'],
          additionalCharges: [
            { label: 'Setup (per color)', amount: 70 },
            { label: 'Setup (full color)', amount: 110 },
            { label: "Add'l color/location run charge (per unit)", amount: 1.25 },
          ],
          currency: '$',
        },
        {
          id: 'cy-tote-002',
          sku: 'T3265267',
          name: 'FEED Organic Cotton Rivet Tote',
          description:
            'More than just a tote — this tote helps provide 5 school meals to kids around the world. A stylish and versatile tote for the market, the library, or the office.',
          features: [
            'Open main compartment for easy access',
            'Exterior side pocket for daily essentials',
            'FEED brand giveback message printed on the interior',
            'Crafted using 8oz. 100% GOTS certified organic cotton with copper rivets',
          ],
          materials: '8oz. 100% GOTS Certified Organic Cotton, Copper Rivets',
          image: '/showcase/images/products/canvas-totes/feed-rivet-tote.jpg',
          gallery: ['/showcase/images/products/canvas-totes/feed-rivet-tote.jpg'],
          colors: [
            { name: 'Natural', hex: '#e7e0d0', image: '/showcase/images/products/canvas-totes/feed-rivet-tote.jpg' },
            { name: 'Black', hex: '#1c1917', image: '/showcase/images/products/canvas-totes/feed-rivet-tote.jpg' },
          ],
          sizes: ['15"L x 16"H x 4"W'],
          pricing: [{ quantity: 300, price: 29.5 }],
          priceIncludes: '1-color print, 1 location (2 color max).',
          priceNotes: ['Pre tax. Pre shipping'],
          additionalCharges: [
            { label: 'Setup (per color)', amount: 70 },
            { label: "Add'l color/location run charge (per unit)", amount: 1.25 },
          ],
          currency: '$',
        },
      ],
    },
    {
      id: 'squeeze-bottles',
      name: 'Squeeze Bottles',
      products: [
        {
          id: 'cy-bottle-001',
          sku: 'T3264605',
          name: '21oz CamelBak Podium 3.0 Chill',
          description:
            'A 21 oz vacuum-insulated stainless steel bottle with a leak-proof lid designed to keep drinks cold and carbonated.',
          features: [
            '21oz vacuum-insulated stainless steel construction',
            'Leak-proof Chug Cap lid',
            'Powder-coated finish for grip and durability',
            'BPA-free and dishwasher safe',
          ],
          materials: '18/8 Stainless Steel, BPA-Free Polypropylene Lid',
          image: '/showcase/images/products/squeeze-bottles/camelbak-podium.jpg',
          gallery: ['/showcase/images/products/squeeze-bottles/camelbak-podium.jpg'],
          colors: [
            { name: 'Aluminum', hex: '#c8c8c8', image: '/showcase/images/products/squeeze-bottles/camelbak-podium.jpg' },
            { name: 'Aqua Blue', hex: '#8cc5e0', image: '/showcase/images/products/squeeze-bottles/camelbak-podium.jpg' },
            { name: 'Black', hex: '#1c1917', image: '/showcase/images/products/squeeze-bottles/camelbak-podium.jpg' },
          ],
          sizes: ['21 oz / 620 ml'],
          pricing: [{ quantity: 300, price: 34.0 }],
          priceIncludes: 'Laser Engrave, 1 location on lid.',
          priceNotes: ['Pre tax. Pre shipping'],
          additionalCharges: [
            { label: 'Setup (per color)', amount: 70 },
            { label: 'Setup (full color)', amount: 110 },
          ],
          currency: '$',
        },
        {
          id: 'cy-bottle-002',
          sku: 'T3264602',
          name: '22oz Van Metro Sport Bottle — Push/Pull Cap 4CP Duplex',
          description:
            'A streamlined 22oz sport bottle with push/pull cap and 4-color duplex print for a bold brand statement.',
          features: [
            '22oz capacity with push/pull sport cap',
            '4-color duplex printing available',
            'BPA-free, reusable, and eco-friendly',
          ],
          materials: 'Food-grade PP, Tritan',
          image: '/showcase/images/products/squeeze-bottles/van-metro.jpg',
          gallery: ['/showcase/images/products/squeeze-bottles/van-metro.jpg'],
          colors: [
            { name: 'Clear', hex: '#eef6fb', image: '/showcase/images/products/squeeze-bottles/van-metro.jpg' },
            { name: 'Black', hex: '#1c1917', image: '/showcase/images/products/squeeze-bottles/van-metro.jpg' },
          ],
          sizes: ['22 oz'],
          pricing: [{ quantity: 300, price: 22.75 }],
          priceIncludes: 'Full-color digital transfer imprint, 1 location.',
          priceNotes: ['Pre tax. Pre shipping'],
          additionalCharges: [{ label: 'Setup (full color)', amount: 110 }],
          currency: '$',
        },
      ],
    },
    {
      id: 'drinkware',
      name: 'Drinkware',
      products: [
        {
          id: 'cy-drink-001',
          sku: 'T3263348',
          name: 'Jett Aluminum Chug Lid Hydration Bottle — 16 Oz.',
          description:
            'A lightweight 16 oz aluminum hydration bottle with a chug lid, built for active days on the job.',
          features: [
            'Single-wall aluminum construction',
            'Chug lid with leak-resistant seal',
            'Fits standard car cup holders',
          ],
          materials: 'Aluminum, Polypropylene Lid',
          image: '/showcase/images/products/drinkware/jett-aluminum.jpg',
          gallery: ['/showcase/images/products/drinkware/jett-aluminum.jpg'],
          colors: [
            { name: 'Black', hex: '#1c1917', image: '/showcase/images/products/drinkware/jett-aluminum.jpg' },
            { name: 'Silver', hex: '#c8c8c8', image: '/showcase/images/products/drinkware/jett-aluminum.jpg' },
          ],
          sizes: ['16 oz'],
          pricing: [{ quantity: 300, price: 18.9 }],
          priceIncludes: 'Laser Engrave, 1 location on lid.',
          priceNotes: ['Pre tax. Pre shipping'],
          additionalCharges: [{ label: 'Setup (per color)', amount: 70 }],
          currency: '$',
        },
        {
          id: 'cy-drink-002',
          sku: 'T3263350',
          name: 'Zigoo Silicone Collapsible Bottle 18oz',
          description:
            'A collapsible 18oz silicone bottle that folds down for easy packing — great for travel and events.',
          features: [
            'Collapses to half its height',
            'Food-grade, BPA-free silicone',
            'Leak-resistant screw cap',
          ],
          materials: 'Food-grade BPA-Free Silicone, PP Cap',
          image: '/showcase/images/products/drinkware/zigoo-collapsible.jpg',
          gallery: ['/showcase/images/products/drinkware/zigoo-collapsible.jpg'],
          colors: [
            { name: 'Aqua Blue', hex: '#8cc5e0', image: '/showcase/images/products/drinkware/zigoo-collapsible.jpg' },
            { name: 'Black', hex: '#1c1917', image: '/showcase/images/products/drinkware/zigoo-collapsible.jpg' },
          ],
          sizes: ['18 oz'],
          pricing: [{ quantity: 300, price: 16.4 }],
          priceIncludes: '1-color print, 1 location.',
          priceNotes: ['Pre tax. Pre shipping'],
          additionalCharges: [{ label: 'Setup (per color)', amount: 70 }],
          currency: '$',
        },
      ],
    },
  ],
}
