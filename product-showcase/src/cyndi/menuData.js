// Swag 二级菜单项 -> store 页(index.html)对应品类锚点。
// 仅这些品类当前有商品；未列出的项暂无商品，链接为占位。
export const swagItemLinks = {
  'T-shirts': '/index.html#tshirts',
  'Polos': '/index.html#polos',
  'Hoodies & Crewnecks': '/index.html#hoodies',
  'Jackets & Outerwear': '/index.html#jackets',
  'Sports Shorts': '/index.html#shorts',
  'Beanies': '/index.html#beanies',
}

// Swag two-level categories
export const swagCategories = [
  {
    name: 'Apparel',
    icon: 'M8 4L4 7l2 3 2-1v8h8V9l2 1 2-3-4-3-2 2H10z',
    items: ['T-shirts', 'Polos', 'Hoodies & Crewnecks', 'Zips', 'Jackets & Outerwear', 'Sports Shorts'],
  },
  {
    name: 'Headwear',
    icon: 'M4 16c0-5 3.5-8 8-8s8 3 8 8 M3 16h18',
    items: ['Hats', 'Beanies', 'Bucket Hats', 'Visors'],
  },
  {
    name: 'Bags',
    icon: 'M6 8h12l1 12H5z M9 8V6a3 3 0 0 1 6 0v2',
    items: ['Backpacks', 'Totes', 'Duffels', 'Drawstring Bags', 'Luggage', 'Pouches'],
  },
  {
    name: 'Footwear',
    icon: 'M3 7v7c0 1 1 2 2 2h14a2 2 0 0 0 2-2c0-2-3-2-6-4l-3-3H5a2 2 0 0 0-2 2z M3 16h18',
    items: ['Socks', 'Sneakers', 'Slippers', 'Sandals', 'FlipFlops & Clogs'],
  },
  {
    name: 'Drinkware',
    icon: 'M8 2h8l-1 3H9z M9 5h6l1 14a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z M8 11h8',
    items: ['Water Bottles', 'Tumblers', 'Mugs', 'Camp Cups', 'Can Coolers', 'Accessories'],
  },
  {
    name: 'Office',
    icon: 'M16 3l5 5L8 21H3v-5z M13 6l5 5',
    items: ['Notebooks & Pens', 'Desk Accessories'],
  },
  {
    name: 'Tech',
    icon: 'M4 13v-1a8 8 0 0 1 16 0v1 M3 13h4v6H3z M17 13h4v6h-4z',
    items: ['Audio', 'Chargers', 'Wearables', 'Travel Adapters', 'Tech Accessories'],
  },
  {
    name: 'Lifestyle & Outdoor',
    icon: 'M3 20h18L14 8l-3 5-2-3z',
    items: ['Home & Wellness', 'Towels & Blankets', 'Travel Accessories', 'Outdoor Living', 'Sun & Rain'],
  },
  {
    name: 'Events Essentials',
    icon: 'M5 3v18 M5 4h11l-2 3 2 3H5',
    items: ['Signage & Banners', 'Flash Cards', 'Stickers', 'Booklets', 'Standup Displays', 'Themed Balloons'],
  },
]

// Service dropdown (icon + title + blurb)
export const serviceItems = [
  { icon: 'M3 4h18v12H3z M8 20h8 M12 16v4', title: 'Swag Platform', blurb: 'Everything you need to manage swag well' },
  { icon: 'M6 10V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4 M5 10h14a1 1 0 0 1 1 1v3H4v-3a1 1 0 0 1 1-1z M6 14v6 M18 14v6', title: 'Office Furniture Procurement', blurb: 'Source and outfit your workspace end to end' },
  { icon: 'M3 21h18 M5 21V8l7-4 7 4v13 M9 21v-6h6v6', title: 'Booth Construction & Exhibit Fabrication', blurb: 'Custom builds that make your brand stand out' },
  { icon: 'M3 21V9l9-5 9 5v12 M8 21v-6h8v6 M8 12h8', title: 'Warehousing & Fulfillment', blurb: 'Vertically integrated warehousing, ships same day' },
  { icon: 'M1 5h11v11H1z M12 8h5l4 4v4h-9z', title: 'Shipping', blurb: 'Lower costs, better deliverability, fewer problems' },
  { icon: 'M6 8h12l-1 12H7z M9 8V6a3 3 0 0 1 6 0v2', title: 'Employee Purchase Platform', blurb: 'Let your team order branded gear on demand' },
]

// Solution dropdown
export const solutionItems = [
  { icon: 'M9 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1', title: 'Human Resources', blurb: 'Onboarding kits and wellness swag for your team' },
  { icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', title: 'Sales & Marketing', blurb: 'Pre and post-show gifts that spark connections' },
  { icon: 'M12 20.5S4 15 4 9.5A3.5 3.5 0 0 1 12 7a3.5 3.5 0 0 1 8 2.5c0 5.5-8 11-8 11z', title: 'Customer Success', blurb: 'Milestone rewards that delight customers' },
  { icon: 'M3 20h18 M4 20l8-14 8 14 M12 6v14', title: 'Events & Trade Shows', blurb: 'Coordinate swag logistics for any event' },
  { icon: 'M3 8h18v3H3z M5 11v9h14v-9 M12 8v12', title: 'Kitting', blurb: 'Custom kits packed and shipped from our warehouse' },
  { icon: 'M8 4l4 3 4-3 5 3-2 4-3-1v10H8V10L5 11 3 7z', title: 'Custom Uniforms', blurb: 'Outfit every location with consistent uniforms' },
]

// Brand logos
export const brandLogos = [
  { src: '/images/brands/adidas.png', alt: 'adidas' },
  { src: '/images/brands/nike.png', alt: 'Nike' },
  { src: '/images/brands/patagonia.png', alt: 'Patagonia' },
  { src: '/images/brands/thenorthface.png', alt: 'The North Face' },
  { src: '/images/brands/uniqlo.png', alt: 'UNIQLO' },
  { src: '/images/brands/on.png', alt: 'On' },
  { src: '/images/brands/stanley.png', alt: 'Stanley' },
  { src: '/images/brands/montbell.png', alt: 'mont-bell' },
]
