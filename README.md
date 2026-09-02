# Cyndi Global 官网 · Swag 商城 · 物流平台

Cyndi Global Limited 的官方网站、Swag 定制商城与物流查询平台，部署在 Cloudflare Pages（项目 `cyndiglobal`），线上地址 <https://www.cyndiglobal.com>。

线上主体是 `product-showcase/`（React + Vite + Tailwind），由 Cloudflare Pages 构建发布；后端为 Pages Functions（`functions/`）+ D1 数据库 + R2 图片存储。

## 线上地址

| 页面 | 地址 | 说明 |
|---|---|---|
| 落地页 | `https://www.cyndiglobal.com/` | Cyndi 品牌首页（Swag / Service / Solution 导航）|
| Swag 商城 | `https://www.cyndiglobal.com/shop` | 商品列表 + 商品详情(PDP) + 购物车 + 下单 |
| 后台控制台 | `https://www.cyndiglobal.com/admin/` | 商品管理 + 物流管理（需登录）|
| 物流查询 | `https://www.cyndiglobal.com/catalog/logistics.html` | 公开运单查询 |

> 控制台使用见 [`ADMIN_GUIDE.md`](./ADMIN_GUIDE.md)。

## 技术栈

- 前端：React 19 + Vite + Tailwind CSS（`product-showcase/`），多入口：`index.html`（落地页）、`shop.html`（商城）。
- 后端：Cloudflare Pages Functions（`functions/api/`）。
- 数据库：Cloudflare D1 `cyndi-logistics`（绑定名 `DB`）——同时存商品与物流数据。
- 图片：Cloudflare R2 bucket `cyndi-products`（绑定名 `MEDIA`），公开域名 `https://img.cyndiglobal.com`。
- 部署：Cloudflare Pages，连接 GitHub `main` 分支自动部署。

## 商品数据模型（D1）

三级：SPU（款）→ 颜色 → SKU（可售单元）。

| 表 | 说明 |
|---|---|
| `products` | SPU（款号 `CY-{品类}-{序号}`，= 物流 productNo）、名称、品牌、品类、币种、价格区间、主图、上下架 status、阶梯定价开关 |
| `product_colors` | 每个颜色（颜色名/码、swatch、图片列表）|
| `product_skus` | SKU（`{SPU}-{颜色}-{尺码}`）、变体价、币种、阶梯价（无库存字段，按订单生产）|
| `orders` / `customers` | 订单（含 SKU 快照）/ 客户账户 |
| `admin_users` | 后台管理员（用户名 + 加盐哈希）|
| `logistics_records` / `logistics_media` / `logistics_record_versions` | 物流记录 / 图片 / 历史版本 |

- **SPU = 物流 productNo**（同一套 `CY-XXX-NNNN`），商城与物流打通。
- 价格：Patagonia 统一价；1688 取最小起订量单价（阶梯价存 `tier_prices_json`，开关默认关）；淘宝/天猫用真实分变体价。
- 币种：Patagonia = USD，1688/淘宝/天猫 = CNY（`currency` 字段，前台按币种显示 $ / ¥）。

## 目录结构

```text
.
├── product-showcase/            # 线上主体（React + Vite + Tailwind）
│   ├── index.html               #   落地页入口 (src/cyndi/)
│   ├── shop.html                #   商城入口 (src/main.jsx -> App.jsx)
│   ├── public/admin/            #   后台页面：index / products / logistics
│   ├── public/catalog/          #   物流查询公开页
│   └── src/                     #   React 源码（组件 / context / hooks）
├── functions/api/               # Pages Functions（API）
│   ├── products.js, products/[spu].js   # 商品读 API（含边缘缓存）
│   ├── register/login/me/logout.js      # 客户账户
│   ├── orders.js, orders/mine.js        # 下单 / 我的订单
│   ├── logistics.js, media.js           # 物流查询 / 图片
│   └── admin/                            # 后台 API（商品/物流/上传/登录）
├── migrations/                  # D1 迁移 SQL（0001-0009）
├── scripts/                     # 爬虫 + 导入脚本（build/import products, crawlers）
├── wrangler.toml                # 本地开发 + 部署配置
├── ADMIN_GUIDE.md               # 控制台使用说明
├── CLOUDFLARE_DEPLOY.md         # 部署说明
└── README.md
```

## 本地开发

商城（前后端同源，含 D1）：

```bash
cd product-showcase && npm install && npm run build && cd ..
npx wrangler pages dev --port 8788
# 商城   http://localhost:8788/shop
# 后台   http://localhost:8788/admin/
# 落地页 http://localhost:8788/
```

- 本地 D1：`npx wrangler d1 execute DB --local --file=migrations/000X.sql`（用 binding 名 `DB`，加 `--local`）。
- 导入商品到本地 D1：`.crawl-venv/bin/python scripts/import_products_to_d1.py` 生成 SQL，再 `wrangler d1 execute DB --local --file=scripts/output/_import_products.sql`。
- 纯前端预览（无后端，登录/下单不可用）：`cd product-showcase && npm run dev`（`http://localhost:5173/shop.html`）。

## 部署

推送到 GitHub `main` 触发 Cloudflare Pages 自动部署。Pages 配置：

- Build command：`cd product-showcase && npm install && npm run build`
- Build output：`product-showcase/dist`
- Bindings：D1 `DB` → `cyndi-logistics`；R2 `MEDIA` → `cyndi-products`
- Variables：`R2_PUBLIC_BASE` = `https://img.cyndiglobal.com`；`LOGISTICS_ADMIN_PASSWORD`（兜底后台密码）

生产 D1 建表/导数据（用真实 UUID，不加 `--local`）见 [`CLOUDFLARE_DEPLOY.md`](./CLOUDFLARE_DEPLOY.md)。

## 数据采集（scripts/）

商品来自 Patagonia / 1688 / 淘宝 / 天猫，用 `scripts/crawl_*_batch.py` 抓取（复用带调试端口的浏览器会话），`build`/`import` 脚本转成 D1 数据。图片下载到本地后用 `scripts/upload_images_to_r2.sh` 传到 R2。仅用于内部数据整理，请遵守目标站条款。
