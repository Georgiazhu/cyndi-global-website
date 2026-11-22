# 客户物流查询模块 · 部署说明

## 本次新增/改动的文件

只新增文件 + 改动 1 个目标页面，未触碰仓库里已有的其他未提交改动。

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `functions/_lib/yanwen.js` | 新增 | 燕文轨迹归一化：状态码/国家码翻译、时间解析、查询键识别（纯函数） |
| `functions/api/tracking.js` | 新增 | 统一查询入口 `/api/tracking`，双通道（燕文实时 / 自有 D1） |
| `product-showcase/src/services/TrackingPanel.jsx` | 新增 | 客户查询面板：中英双语、状态徽章、路线、详情、时间轴、仓储照片 |
| `product-showcase/src/services/Shipping.jsx` | 改动 | 查询区块置于页面顶部主体，3D 地球缩小移至右侧栏 |

## 工作原理

- 客户在 `/services/shipping` 页面顶部输入单号。
- 前端 `GET /api/tracking?q=<单号>`。
- 后端自动判别：
  - **燕文运单号 / 尾程单号**（如 `UH183870291YP`、纯数字尾程号）→ 服务端代理调用
    `http://api.track.yw56.com.cn/api/tracking?nums=<单号>`，Header 带 `Authorization: <商户号>`，
    返回轨迹归一化后给前端。**凭证只在服务端使用，绝不下发浏览器**（燕文接口是 http，浏览器直连会被混合内容拦截且泄露密钥）。
  - **自有产品编号**（如 `CY-THERMOS-001`）→ 查 D1 `logistics_records` 表，返回既有仓储记录与照片。
- 也兼容旧参数名 `trackingNo=` / `productNo=` / `nums=`。

## 需要你在 Cloudflare 后台配置的环境变量

进入 Cloudflare Pages → 项目 `cyndi-global-website` → Settings → Environment variables：

| 变量名 | 值 | 环境 |
| --- | --- | --- |
| `YANWEN_AUTH_CODE` | 燕文商户号（或包裹对应的制单账号），从燕文客户中心 → 账号管理 → 制单账号管理获取 | Production（如需预览环境测试也可加到 Preview） |

> 不配置也能上线：自有产品编号查询正常；输入燕文单号时前端会提示"实时查询配置中，请联系我们"，不会报错崩溃。

## 验证结果

- 前端：`npx vite build` 通过，无编译错误；`shipping-*.js` 产物含新面板，地球仍为独立懒加载 chunk。
- 后端纯函数：燕文响应归一化、状态翻译、时间排序、查询键识别自测通过。
- API handler 三分支（产品号 / 无凭证 / 有凭证代理）模拟测试全部通过。

## 本地预览（可选）

```bash
cd cyndi-global-website/product-showcase
npm run dev          # Vite 前端，/api 默认转发到 8788
# 另开终端：
npx wrangler pages dev product-showcase/dist --port 8788
```

本地跑 wrangler 时如需测燕文实时查询，在项目根 `.dev.vars` 写入 `YANWEN_AUTH_CODE=你的商户号`（该文件已在 .gitignore 中，不会提交）。

## 待办 / 建议

- 上线后用一个真实燕文单号验证实时轨迹（示例 `UH183870291YP` 来自官方文档，可能已过查询期限）。
- 如客户需要"一票多包裹"，燕文接口支持 `nums` 逗号分隔最多 30 个单号，可在现有基础上扩展。
- 查询频次建议后续加简单速率限制，避免接口被刷（当前未加）。
