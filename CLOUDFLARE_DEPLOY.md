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
