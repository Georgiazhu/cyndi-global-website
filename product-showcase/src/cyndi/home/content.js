// All homepage copy lives here. Items marked PLACEHOLDER need real data from the client.
export const PORTAL_LOGIN_URL = '#portal-login' // PLACEHOLDER until the OIDC portal exists
export const QUOTE_URL = '#quote'

export const nav = [
  { label: 'Why Cyndi', href: '#why' },
  { label: 'How it works', href: '#how' },
  { label: 'FAQ', href: '#faq' },
]

export const capabilities = [
  { title: 'Luxury, custom swag', text: 'Natural materials and richer embroidery craft, so every piece lifts your brand image.' },
  { title: 'Fast sampling', text: 'Physical samples within 3 days, so you can feel the quality before you order.' },
  { title: 'Global cloud warehouse', text: 'One central stock pool, located where your business needs it.' },
  { title: 'Tax and freight optimized', text: 'The most economical duty and freight route, planned for you.' },
  { title: 'Door-to-door transport', text: 'Sea and air lanes across Asia, Europe, North America and Oceania.' },
  { title: 'On-site distribution', text: 'Our people can hand out and deliver locally at your event.' },
]

export const compare = {
  without: ['Many vendors in many countries', 'Duplicated stock and shipments', 'Surprise duties and customs delays', 'No single view of inventory'],
  withCyndi: ['One warehouse, one stock pool', 'One bill with duties itemized (DDP)', 'One door-to-door network', 'One real-time inventory view'],
}

export const steps = [
  { n: 1, side: 'client', title: 'Create a Project', text: 'Choose categories and describe what you need.' },
  { n: 2, side: 'cyndi', title: 'Build the Showcase', text: 'We curate options matched to your brief.' },
  { n: 3, side: 'client', title: 'Confirm selection', text: 'Pick your products on the selection sheet.', gate: 'Gate 1 · no mockup until confirmed' },
  { n: 4, side: 'cyndi', title: 'Design mockups', text: 'We submit designs for your approval.' },
  { n: 5, side: 'client', title: 'Approve mockup', text: 'Sign off the final design.', gate: 'Gate 2 · no order until approved' },
  { n: 6, side: 'cyndi', title: 'Final order & ship', text: 'We add any additional charges for your re-confirmation, then produce and deliver.' },
]

export const distribution = [
  { tag: 'M1', title: 'Bulk shipment', text: 'One order delivered to your event; your team distributes on site.' },
  { tag: 'M2', title: 'Employee rewards store', text: 'You issue points; employees redeem them for gifts from a catalog you choose. Each redemption approved by your admin.' },
  { tag: 'M3', title: 'Personal links', text: 'A unique link per person. Each order approved by your admin.' },
  { tag: 'M4', title: 'Open portal', text: 'One shared link. Every order approved by your admin before fulfilment.' },
]

export const portalFeatures = [
  { title: 'Smooth selection and design', text: 'A clear, guided path from showcase to approved mockup.' },
  { title: 'Four ways to order', text: 'Bulk, rewards store, personal links or open portal: one fits every global team.' },
  { title: 'Reliable global delivery', text: 'Stable door-to-door delivery, with progress you can check every day.' },
  { title: 'One admin, every order', text: 'Manage every order type from a single admin account.' },
]

export const faq = [
  { q: 'Who pays import duties?', a: 'We ship DDP. Cyndi Global pays duties on your behalf and itemizes them on your bill.' },
  { q: 'Which countries can you deliver to?', a: 'More than 200 countries and regions, including the US, Canada, the UK, the EU, Australia, Japan, Korea, Singapore, Malaysia and Thailand. Last-mile delivery runs through local carriers.' },
  { q: 'Can I reuse products from an earlier project?', a: 'Yes. Reused items are re-quoted, and quotes are valid for 30 days.' },
  { q: 'Do you support single sign-on?', a: 'Yes. The client portal supports OIDC single sign-on.' },
  { q: 'Which currencies do you support?', a: 'Prices can be shown and settled in multiple currencies. Details to be confirmed.' },
]
