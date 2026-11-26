-- 0018_order_channels.sql — separate M1/M2 company orders from M3/M4 individual orders.
-- Mirrors functions/_lib/order-channels.js ensureOrderChannelSchema(); the functions
-- apply this defensively on first use, so manual migration is optional.

ALTER TABLE orders ADD COLUMN order_channel TEXT NOT NULL DEFAULT 'M1';
ALTER TABLE orders ADD COLUMN origin_type TEXT NOT NULL DEFAULT 'COMPANY';

-- Backfill existing rows. source_type is created by migration 0017.
UPDATE orders SET order_channel='M2', origin_type='COMPANY' WHERE source_type='REWARDS_STORE' AND order_channel='M1';
UPDATE orders SET order_channel='M3', origin_type='INDIVIDUAL' WHERE source_type='PERSONAL_LINK' AND order_channel='M1';
UPDATE orders SET order_channel='M4', origin_type='INDIVIDUAL' WHERE source_type='OPEN_PORTAL' AND order_channel='M1';

CREATE INDEX IF NOT EXISTS idx_orders_channel ON orders(order_channel, status);
