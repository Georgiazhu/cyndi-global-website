# Cyndi Global 官网与物流平台

Cyndi Global Limited 的官方网站与物流查询平台，部署在 Cloudflare Pages（`cyndiglobal`），线上地址 <https://www.cyndiglobal.com>。

本仓库包含三部分：

1. **官网**（静态单页）—— 品牌落地页，含 Swag / Service / Solution / Brand 导航、Hero、关于、团队、作品展示等。
2. **物流查询与后台**（Cloudflare Pages Functions + D1）—— 公开的运单查询页和带鉴权的物流数据管理后台。
3. **React 试点**（`product-showcase/`）—— 用 React + Tailwind 重建官网 Hero + 导航的评估性试点（详见下文，非线上使用）。

## 技术栈

- 官网：纯静态 `index.html`（原生 HTML / CSS / JS，无框架），中 / 英双语切换。
- 后端：Cloudflare Pages Functions（`functions/`）+ 根部 `_worker.js`。
- 数据库：Cloudflare D1（`cyndi-logistics`，Pages 绑定名 `DB`）。
- 图片存储：D1 表 `logistics_media`；可选 Cloudflare R2（bucket `cyndi-logistics-media`，绑定名 `MEDIA`）。
- 部署：Cloudflare Pages。

## 目录结构

```text
.
├── index.html               # 官网主页（静态单页）
├── _worker.js               # Cloudflare Worker：内联物流查询页 + 后台页
├── functions/               # Pages Functions（API）
│   ├── _lib/auth.js         # 后台鉴权
│   └── api/
│       ├── logistics.js     # 公开物流查询 API
│       ├── media.js         # 图片读取
│       └── admin/           # 后台 API（登录 / 记录 / 上传 / 登出）
├── migrations/              # D1 数据库迁移 SQL
├── admin/                   # 后台页面入口
├── catalog/                 # 物流查询页面入口
├── product-showcase/        # React + Tailwind 试点（见下）
├── CLOUDFLARE_DEPLOY.md      # 部署与后台使用说明
├── LOGISTICS_API.md          # 物流 API 文档
└── LOGISTICS_VERSIONS.md     # 物流记录版本说明
```

## 官网

单个 `index.html`，样式和脚本内联。主要模块：

- 固定导航栏：Swag / Service / Solution / Brand 四个下拉菜单（Swag 为两级菜单）。
- Hero、关于我们、团队、作品展示、联系方式等区块。
- 基于 `data-i18n` 的中英双语切换，滚动进场动画。

本地预览：用任意静态服务器打开 `index.html`（例如 `npx serve .`）。

## 物流查询与后台

- **公开查询页**：`/catalog/logistics.html` —— 输入产品编号查询物流状态、运输轨迹和仓库图片。
- **管理后台**：`/admin/logistics.html` —— 管理员密码登录，编辑物流记录（JSON / 文本）、批量上传仓库图片、查看历史版本、修改密码。
- **公开 API**：`GET /api/logistics?productNo=CY-THERMOS-001`

物流记录以 JSON 存储，除 `productNo`、`productName` 外可自由扩展字段（订单、货物、报关、运输、联系人、文件、备注等）。单条记录建议控制在 1.9MB 以内，图片通过后台批量上传，不放入 JSON。

详见 [`CLOUDFLARE_DEPLOY.md`](./CLOUDFLARE_DEPLOY.md) 与 [`LOGISTICS_API.md`](./LOGISTICS_API.md)。

## 部署（Cloudflare Pages）

绑定要求：

- D1 数据库 `cyndi-logistics`，Pages 绑定名 `DB`。
- Pages Secret `LOGISTICS_ADMIN_PASSWORD`（后台登录密码）。
- 可选 R2 bucket `cyndi-logistics-media`，绑定名 `MEDIA`。

数据库结构见 `migrations/` 下的迁移文件。完整步骤见 [`CLOUDFLARE_DEPLOY.md`](./CLOUDFLARE_DEPLOY.md)。

## React 试点（product-showcase/）

`product-showcase/cyndi.html` + `src/cyndi/` 是用 **React 19 + Vite + Tailwind CSS** 重建官网 Hero + 导航的评估性试点，用于对比静态官网、评估迁移收益。

- 入口：`product-showcase/cyndi.html`
- 组件：`product-showcase/src/cyndi/`（`CyndiApp` / `CyndiNavbar` / `CyndiHero` / `menuData`）
- 品牌 logo：`product-showcase/public/images/brands/`

本地运行：

```bash
cd product-showcase
npm install
npm run dev
# 打开 http://localhost:5173/cyndi.html
```

> 说明：React 试点仅用于评估，与线上静态官网（`index.html`）并存、互不影响，线上仍以静态官网为准。
