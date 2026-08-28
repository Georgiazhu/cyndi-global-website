# Patagonia PDP 抓取说明

抓取单个 Patagonia 商品详情页（PDP），提取 **图片 / 颜色 / 尺码 / 价格 / 描述** 并下载高清图。

> 仅用于内部数据模型调研（不入库、不对外展示第三方文案/图片）。遵守目标站 robots.txt 与 ToS，控制访问频率。

## 相关文件

| 文件 | 作用 |
|---|---|
| `crawl_patagonia_pdp.py` | 抓取 + 抽取（HTML → 结构化数据） |
| `download_pdp_images.py` | 从抓好的 JSON 读图片 URL，下载高清图 |
| `output/patagonia_pdp.json` | 结构化结果（价格/颜色/尺码/图片URL/描述/variants） |
| `output/_pdp_raw.html` | 抓到的原始页面（用于离线复跑抽取） |
| `output/pdp_images/` | 下载的高清图（1920×1920 JPEG） |
| `output/pdp_images_manifest.json` | 图片下载清单 |
| `output/_backup/` | 已爬数据的备份，不会被脚本覆盖 |

## 一次性准备：创建浏览器 profile

部分商品页对匿名请求返回 404（Akamai 边缘拦截），必须用带真实会话的浏览器 profile。

手动启动 Playwright 的 Chromium，打开目标商品页正常浏览一下（写入 cookie/会话），再关闭窗口：

```bash
"$HOME/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" \
  --user-data-dir="$HOME/.crawl4ai/profiles/patagonia" \
  "https://www.patagonia.com/product/<slug>/<pid>.html"
```

> `chromium-1234` 版本号按 `python -m playwright install --dry-run chromium` 的实际输出调整。

## 三段式流程（规避风控）

在 `crawl_patagonia_pdp.py` 顶部把 `URL` 改成目标商品页（需带正确 slug，只有 pid 不行）。

### 1. 抓取（联网，只抓一次，不重试）

```bash
PATAGONIA_PROFILE="$HOME/.crawl4ai/profiles/patagonia" \
  .crawl-venv/bin/python scripts/crawl_patagonia_pdp.py
```

- 用 profile 会话拿 HTML，成功才存 `output/_pdp_raw.html`（失败的 404 页不覆盖）。
- **不重试** —— 反复抓会触发 Akamai 风控。若这次 404，先让 IP 冷却，或重新手动喂一次会话。

### 2. 抽取（纯离线，0 网络请求，可反复调试）

```bash
PATAGONIA_HTML=scripts/output/_pdp_raw.html \
  .crawl-venv/bin/python scripts/crawl_patagonia_pdp.py
```

- 只读本地 HTML 跑抽取 schema，产出 `output/patagonia_pdp.json`。
- 调整 schema / 选择器时都用这个模式，完全不碰网络。

### 3. 下载图片（联网，会话内 fetch）

```bash
PATAGONIA_PROFILE="$HOME/.crawl4ai/profiles/patagonia" \
  .crawl-venv/bin/python scripts/download_pdp_images.py
```

- 从 `patagonia_pdp.json` 读图片 URL（不重抓页面），在 profile 浏览器会话内用 `fetch` 下载（能过 Akamai）。
- 存到 `output/pdp_images/`，只写图片目录，不覆盖已有数据。

## 踩过的坑（重要）

1. **URL 必须带正确 slug** —— 只有 pid（如 `42402.html`）猜的 slug 会 404 "Not found"。
2. **反反爬功能（stealth / Undetected Browser）解决不了这里的 404** —— 站点是「无有效会话就 404」，不是「识别指纹后拦截」。指纹伪装变不出真实会话。真正管用的是 **带新鲜人工会话的 profile 首次访问**。
3. **不要反复重试** —— 每次失败请求都在消耗 IP 信誉，容易触发 Akamai 风控。抓一次即止。
4. **`baseSelector` 用 `body`** —— 不同商品页外层容器 class 不一致（`page-pdp-2-col` 只在部分页出现），用 `body` 作根最稳，各字段选择器在整页里唯一。
5. **图片是 `<source srcset>` 里的高清图，不是 `<img src>`** —— 后者是 1x1 占位图。脚本从 srcset 挑最高分辨率。
6. **图片走 Akamai CDN，httpx 裸请求会被挡 404** —— 必须在浏览器会话内 `fetch`。
7. **profile 被占用会撞 SingletonLock** —— 跑脚本前确保没有残留的 "Google Chrome for Testing" 进程；脚本会自动清 lock 文件。

---

## 批量抓取（从 xlsx 读 URL）

`crawl_patagonia_batch.py` —— 从 `品类选择表.xlsx` 读一批商品 URL，串行 + 大间隔逐个抓，规避风控。整合了三步（抓 HTML → 抽取 → 会话内下图）到同一 profile 会话。

### 输出结构：每个商品单独一个文件夹

```
output/products/
└── <pid>_<slug>/              # 每个商品独立文件夹，命名如 37846_mens-fitz-roy-trout-t-shirt
    ├── data.json              # 结构化数据（价格/颜色/尺码/图片URL/描述/品类/variants）
    ├── raw.html               # 原始页面
    └── images/                # 该商品的高清图
```

### 运行

```bash
# 先小批量验证（抓前 3 个未抓过的，间隔 5.5 分钟）
LIMIT=3 DELAY=330 PATAGONIA_PROFILE="$HOME/.crawl4ai/profiles/patagonia" \
  .crawl-venv/bin/python scripts/crawl_patagonia_batch.py

# 验证 OK 后全量（续跑，已抓的自动跳过）
LIMIT=27 DELAY=330 PATAGONIA_PROFILE="$HOME/.crawl4ai/profiles/patagonia" \
  .crawl-venv/bin/python scripts/crawl_patagonia_batch.py
```

环境变量：
- `LIMIT`：本次最多抓几个（默认 3，先小批量）
- `DELAY`：商品之间的间隔秒数（默认 330 = 5.5 分钟）
- `PATAGONIA_PROFILE`：profile 目录（必填）

### 安全行为

- **串行 + 大间隔**（默认 5.5 分钟/个），控制频率。
- **失败即停** —— 任一商品拿到 404/Not found（风控）就立即停止整批，不重试、不硬刚，避免加深风控。已成功的照常保留。
- **断点续跑** —— 已抓过（存在 `data.json`）的商品自动跳过，被打断后可直接重跑续上。
- 每个商品独立存，绝不覆盖单品脚本的 `output/patagonia_pdp.json`。

### 批量的现实限制（重要）

- **单 IP + 单会话批量抓有风控硬上限**。之前密集请求会让 Akamai 拦截该 IP，导致连正常商品页也返回 404。
- 遇到批量第一个就 404，通常是 **IP 处于风控冷却期** —— 先停手，隔几小时后**手动**用浏览器确认能打开商品页，再重新喂一次会话、然后跑。
- 长期/大量抓取建议：住宅代理 IP 轮换、官方数据源/feed、或分散到多天极低频跑。

---

## CDP 模式：连接你手动打开的浏览器（批量抓取的关键）

实测发现：反反爬功能（stealth / Undetected Browser）对部分商品的 404 无效 —— 站点是「无有效人工会话就 404」。**唯一稳定的批量方案是连接你手动打开的真实浏览器会话（CDP）**，借你的会话逐个抓，全程不关你的窗口。

### 步骤

**1. 你手动启动带调试端口的浏览器**（保持窗口打开，别关）：

```bash
"$HOME/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.crawl4ai/profiles/patagonia" \
  "https://www.patagonia.com/product/<任一商品>"
```

在窗口里确认能看到商品（浏览一下、点几个颜色，喂新鲜会话）。

**2. 确认 CDP 连通**：

```bash
curl -s http://localhost:9222/json/version    # 返回 Browser: Chrome/... 即可
```

**3. 分批跑**（连接 CDP，复用你的会话）：

```bash
# 分批小跑更稳；每批跑完浏览器不关，可直接接着跑下一批
LIMIT=5 DELAY=240 PATAGONIA_CDP="http://localhost:9222" \
  .crawl-venv/bin/python scripts/crawl_patagonia_batch.py
```

CDP 模式下脚本**只断开连接、绝不关闭你的浏览器**（`own_context=False`）。已抓的自动跳过，可反复接批直到全部完成。

### 新增环境变量

- `PATAGONIA_CDP`：CDP 端点（如 `http://localhost:9222`）。给了就连你的浏览器，不自己启。
- `ONLY`：只抓 URL 含此 pid 的商品（补抓单个用，如 `ONLY=22766`）。
- `GOTO_TIMEOUT`：页面加载超时毫秒（默认 60000；遇到加载慢的商品补抓时调大，如 `120000`）。

### 抗断行为

- **浏览器/CDP 断连** → 干净退出、保住已抓进度，重连后重跑自动续跑（不丢数据）。
- **单页面加载超时（非 404）** → 跳过该商品继续，不中断整批。可事后用 `ONLY=<pid> GOTO_TIMEOUT=120000` 补抓。
- **明确 404 / Not found** → 判定风控，立即停整批，不硬刚。

### 实测经验

- 分批 + 4 分钟间隔，连续抓 15+ 个商品零风控、零封 IP。
- Chrome 启动时刷的 `DEPRECATED_ENDPOINT`（GCM 推送注册）日志无害，与抓取无关。
- 每个商品独立存 `output/products/<pid>_<slug>/`（data.json + raw.html + images/）。
