// Shipment status enum — single source of truth for shipments (functions/api/admin/shipments.js,
// functions/_lib/shipments.js). SEPARATE from order status (functions/_lib/order-status.js):
// no shipment code writes orders.status. No transition rules: admins may set any value.
export const SHIPMENT_STATUSES = ['pending', 'shipped', 'in_transit', 'customs', 'out_for_delivery', 'delivered', 'exception'];
export const SHIPMENT_STATUS_LABELS = {
  pending: 'Pending', shipped: 'Shipped', in_transit: 'In transit', customs: 'Customs clearance',
  out_for_delivery: 'Out for delivery', delivered: 'Delivered', exception: 'Exception',
};
export function isShipmentStatus(s) { return SHIPMENT_STATUSES.includes(s); }
export function shipmentStatusLabel(s) { return SHIPMENT_STATUS_LABELS[s] || String(s || ''); }
export function shipmentStatusOptions() { return SHIPMENT_STATUSES.map((value) => ({ value, label: SHIPMENT_STATUS_LABELS[value] })); }
