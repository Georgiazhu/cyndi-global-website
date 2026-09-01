-- 阶梯定价开关：默认关(0)，大多数商品用单一定价。
-- admin 可对个别商品打开(1)启用阶梯价。tier_prices_json 数据照存，开关关时前端不显示/不启用。
ALTER TABLE products ADD COLUMN tiered_pricing INTEGER NOT NULL DEFAULT 0;
