# Cloudflare 部署与物流后台

物流查询页已经接入 Cloudflare Pages 项目 `cyndiglobal`，公开地址：

```text
https://www.cyndiglobal.com/catalog/logistics.html
```

后台编辑地址：

```text
https://www.cyndiglobal.com/admin/logistics.html
```

## 后台如何更新

1. 打开后台地址，输入 Cloudflare Pages 环境变量 `LOGISTICS_ADMIN_PASSWORD` 对应的密码。
2. 在“产品编号”中填写要编辑的编号，例如 `CY-THERMOS-001`。
3. 在 JSON 编辑区修改产品名称、物流状态、运输节点、仓库位置和 `warehouseImages`。
4. 点击“保存物流记录”，公开查询页会立即读取最新数据。

## 图片如何上传

1. 填写产品编号并一次选择多张仓库图片。
2. 点击“批量上传图片”，系统会把图片地址自动追加到当前 JSON 的 `warehouseImages` 数组。
3. 可以继续编辑每张图片的 `caption`、`captionZh` 和 `date`。
4. 点击“保存物流记录”。

每次最多上传 20 张；未启用 R2 时，每张图片最大 1.5MB，图片会单独保存到 D1 的 `logistics_media` 表，不会挤占物流 JSON 字段。启用 R2 后，图片会自动改存 R2，适合更大量的仓库图片。

## 绑定要求

- D1 数据库：`cyndi-logistics`，Pages 绑定名：`DB`。
- D1 图片表：`logistics_media`，迁移文件：`migrations/0002_logistics_media.sql`。
- R2 bucket（可选）：`cyndi-logistics-media`，Pages 绑定名：`MEDIA`。
- Pages Secret：`LOGISTICS_ADMIN_PASSWORD`。
- 物流表结构见 `migrations/0001_logistics_records.sql`，图片表结构见 `migrations/0002_logistics_media.sql`。

## 字段空间

物流记录使用 JSON 保存，除了 `productNo` 和 `productName` 外，可以继续增加任意对象、数组和自定义字段，例如订单、货物、报关、运输、联系人、文件和备注。后台已预留这些示例分组：`order`、`cargo`、`customs`、`transport`、`contacts`、`documents`、`notes`、`customFields`。单条记录建议控制在 1.9MB 以内；图片不要放进 JSON，直接使用批量上传按钮。

## 数据接口

公开查询：

```text
GET /api/logistics?productNo=CY-THERMOS-001
```

管理员保存记录：

```text
POST /api/admin/record
```

管理员上传图片：

```text
POST /api/admin/upload
```

后台页面已经封装这些接口，日常不需要手动调用 API。

## 密码管理

在 Cloudflare Dashboard 的 Pages 项目 `cyndiglobal` → Settings → Environment variables 中修改 `LOGISTICS_ADMIN_PASSWORD`。修改后重新部署一次 Pages 项目，使新密码生效。

## 客户账户与 Showcase 登录（`CUSTOMER_SESSION_SECRET`）

商城（`/shop`）和 Showcase（`/showcase/`）共用同一套客户账户（D1 `customers` 表，cookie `customer_session`）。每个人只看到自己下的订单。后台 `/admin/customers.html` 管理客户公司（clients）和客户账户：改邮箱 / 用户名 / 显示名 / 所属客户 / Showcase 权限 / 启用禁用、重置密码（不填密码时生成一次性临时密码，只显示一次）。

- **Pages Secret：`CUSTOMER_SESSION_SECRET`（必填）**。客户会话的签名密钥，没有任何兜底：缺了它，客户登录、注册、`/api/me`、我的订单、整个 Showcase 都会返回 503 `Customer sessions are not configured`（fail closed）。
  - 生成：`openssl rand -base64 48`。
  - 设置：Pages 项目 `cyndiglobal` → Settings → Environment variables → Production（Preview 也要单独设）→ 添加为 **Secret**。设置后重新部署一次才生效。
  - 更换密钥会让所有客户会话失效（需要重新登录），不影响密码。
- 可选：`CUSTOMER_PBKDF2_ITERATIONS`（默认且最大 100000，Cloudflare Workers 的 PBKDF2 上限；最小 10000）。新密码用 PBKDF2-SHA256，格式 `pbkdf2$<次数>$<salt>$<hash>`；旧的 SHA-256 哈希登录成功后自动升级。如果 Workers Free 计划登录时出现 CPU 超限（1102 错误），可以调低到 50000。
- 本地开发：在仓库根目录 `.dev.vars`（已被 `.gitignore` 忽略）写一行 `CUSTOMER_SESSION_SECRET=<随机串>`，然后重启 `wrangler pages dev`。
- 迁移：`migrations/0011_customer_showcase_access.sql`（clients 表、customers 新增 `client_id` / `showcase_access` / `username`，把原 Showcase 的 HRT 账号复制成客户账户并保留原密码，回填 HRT 的 SC- 订单）。线上执行：

  ```bash
  npx wrangler d1 execute cyndi-logistics --remote --file=migrations/0011_customer_showcase_access.sql
  ```

  该文件只能执行一次（含 `ALTER TABLE ADD COLUMN`）。**必须先执行迁移，再部署新代码**，否则登录会因为缺列报错。
- 管理员会话 token 现在带 `aud:'admin'`，部署后所有已登录的管理员需要重新登录一次。

