// Order status enum + allowed transitions — the single source of truth for the admin
// orders API (functions/api/admin/orders.js). Values match what the shop front end
// already understands (product-showcase/src/components/OrderConfirmation.jsx).

export const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'in_transit', 'delivered', 'cancelled'];

export const STATUS_LABELS = {
  pending: 'Pending',
  processing: 'Processing',
  shipped: 'Shipped',
  in_transit: 'In transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

// from -> statuses an admin may move the order to. delivered / cancelled are terminal.
const TRANSITIONS = {
  pending: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled', 'pending'],
  shipped: ['in_transit', 'delivered', 'processing'],
  in_transit: ['delivered', 'shipped'],
  delivered: [],
  cancelled: [],
};

// Legacy / unknown values already in the DB can still be listed, and may only be
// moved into the managed flow via processing or cancelled.
const LEGACY_NEXT = ['processing', 'cancelled'];

export function isKnownStatus(status) {
  return ORDER_STATUSES.includes(status);
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || String(status || '');
}

export function allowedNext(from) {
  return [...(Object.prototype.hasOwnProperty.call(TRANSITIONS, from) ? TRANSITIONS[from] : LEGACY_NEXT)];
}

// Returns null when the change is allowed, else a human-readable reason.
export function transitionError(from, to) {
  if (!isKnownStatus(to)) return `Unknown status "${to}". Allowed values: ${ORDER_STATUSES.join(', ')}`;
  if (from === to) return `Order is already ${statusLabel(from)}`;
  const next = allowedNext(from);
  if (!next.length) return `${statusLabel(from)} is a final status and cannot be changed`;
  if (!next.includes(to)) {
    return `Cannot change status from ${statusLabel(from)} to ${statusLabel(to)}. Allowed: ${next.map(statusLabel).join(', ')}`;
  }
  return null;
}
