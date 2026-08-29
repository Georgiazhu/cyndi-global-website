"""
批量抓取 Patagonia PDP —— 从 品类选择表.xlsx 读 URL，串行 + 大间隔，规避风控。

整合已验证可行的三步（都在同一 Playwright profile 会话内完成，减少请求）：
  1) 用 profile 会话打开商品页，拿渲染后的 HTML
  2) 用 JsonCssExtractionStrategy 抽取 图片/颜色/尺码/价格/描述
  3) 在同一会话内用浏览器 fetch 下载高清图（能过 Akamai）

【安全设计】
- 串行，每个商品之间大间隔（DELAY_BETWEEN 秒，默认 45）。
- 失败（拿到 Not found / 非有效页）即【停止】，不重试、不硬刚，避免激发风控。
- 断点续跑：已成功的商品（存在 data.json）自动跳过。
- LIMIT 控制本次最多抓几个（先小批量验证）。
- 每个商品独立存 output/products_patagonia/<pid>/，绝不覆盖之前单品抓的 output/patagonia_pdp.json。

用法：
  # 先抓前 3 个，间隔 60 秒
  LIMIT=3 DELAY=60 PATAGONIA_PROFILE=~/.crawl4ai/profiles/patagonia \
    .crawl-venv/bin/python scripts/crawl_patagonia_batch.py

  # 验证 OK 后跑全部（续跑，已抓的跳过）
  DELAY=60 PATAGONIA_PROFILE=~/.crawl4ai/profiles/patagonia \
    .crawl-venv/bin/python scripts/crawl_patagonia_batch.py

【使用前必读】仅用于内部数据模型调研；遵守目标站 robots.txt 与 ToS，控制访问频率。
"""
import asyncio
import base64
import json
import os
import re
import sys
import urllib.parse
from pathlib import Path

import openpyxl
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
from crawl4ai.extraction_strategy import JsonCssExtractionStrategy

XLSX = "/Users/gufe/Downloads/品类选择表.xlsx"
PROFILE_DIR = os.environ.get("PATAGONIA_PROFILE", "").strip()
# 连接你已手动打开的浏览器（带 --remote-debugging-port 启动）。给了就复用，不自己启。
CDP_ENDPOINT = os.environ.get("PATAGONIA_CDP", "").strip()
LIMIT = int(os.environ.get("LIMIT", "3"))          # 本次最多抓几个（默认 3，先小批量）
DELAY = float(os.environ.get("DELAY", "330"))       # 商品之间的间隔秒数（默认 5.5 分钟，规避风控）
ONLY = os.environ.get("ONLY", "").strip()           # 只抓 URL 含此 pid 的商品（补抓单个用）
GOTO_TIMEOUT = int(os.environ.get("GOTO_TIMEOUT", "60000"))  # goto 超时 ms（慢页面可调大）

OUTPUT_DIR = Path(__file__).parent / "output"
PRODUCTS_DIR = OUTPUT_DIR / "products_patagonia"

# 抽取 schema（同单品脚本，baseSelector 用 body 最稳）
SCHEMA = {
    "name": "PatagoniaPDP",
    "baseSelector": "body",
    "fields": [
        {"name": "title", "selector": "h1#product-title", "type": "text"},
        {"name": "style_no", "selector": ".style-no .js-buy-config-color-code", "type": "text"},
        {"name": "price", "selector": "span.sales .value[itemprop='price']",
         "type": "attribute", "attribute": "content"},
        {"name": "currency", "selector": "meta[itemprop='priceCurrency']",
         "type": "attribute", "attribute": "content"},
        {"name": "description", "selector": "article.pdp__content-copy p[itemprop='description']",
         "type": "text"},
        {"name": "colors", "selector": "li.pdp-colors--swatches button.product-swatch",
         "type": "list", "fields": [
            {"name": "code", "type": "attribute", "attribute": "data-color"},
            {"name": "name", "type": "attribute", "attribute": "data-caption"},
            {"name": "online_instock", "type": "attribute", "attribute": "data-online-instock"},
         ]},
        {"name": "sizes", "selector": "label.pdp-size-select",
         "type": "list", "fields": [
            {"name": "size", "type": "attribute", "attribute": "data-attr-value"},
            {"name": "online_instock", "type": "attribute", "attribute": "data-online-instock"},
         ]},
        {"name": "image_sources",
         "selector": "ul.product-gallery li.product-asset__image source",
         "type": "list", "fields": [
            {"name": "srcset", "type": "attribute", "attribute": "srcset"},
         ]},
    ],
}


def best_from_srcset(srcset: str) -> str:
    if not srcset:
        return ""
    candidates = []
    for part in srcset.split(","):
        bits = part.strip().split()
        if len(bits) >= 2 and bits[1].endswith("w"):
            try:
                candidates.append((int(bits[1][:-1]), bits[0]))
            except ValueError:
                continue
    return max(candidates)[1] if candidates else srcset.strip().split()[0]


def parse_stock(value):
    if not value:
        return value
    try:
        return json.loads(value)
    except (ValueError, TypeError):
        return value


def extract_boldmetrics_product(html: str):
    m = re.search(r"product:\s*(\{.*?\}),\s*[\r\n]", html, re.S)
    if not m:
        return None
    text = m.group(1)
    depth = 0
    end = 0
    for i, ch in enumerate(text):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    try:
        return json.loads(text[:end])
    except ValueError:
        return None


def pid_from_url(url: str) -> str:
    m = re.search(r"/(\d+)\.html", url)
    return m.group(1) if m else re.sub(r"[^a-zA-Z0-9]+", "_", url)[-20:]


def folder_from_url(url: str) -> str:
    """商品文件夹名：<pid>_<slug>，直观可读。
    例：https://.../product/mens-fitz-roy-trout-t-shirt/37846.html -> 37846_mens-fitz-roy-trout-t-shirt"""
    pid = pid_from_url(url)
    m = re.search(r"/product/([^/]+)/\d+\.html", url)
    slug = m.group(1) if m else "product"
    slug = re.sub(r"[^a-zA-Z0-9\-]+", "-", slug)[:60]
    return f"{pid}_{slug}"


def read_urls():
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb["品类选择"]
    items = []
    for row in ws.iter_rows(min_row=2):
        cat1, cat2, brand = row[0].value, row[1].value, row[2].value
        linkcell = row[3]
        url = linkcell.hyperlink.target if linkcell.hyperlink else linkcell.value
        if url and "patagonia.com/product" in str(url):
            items.append({"cat1": cat1, "cat2": cat2, "brand": brand, "url": str(url)})
    return items


async def extract_from_html(html: str):
    """对 HTML 跑抽取 schema，返回清洗后的 record。"""
    strategy = JsonCssExtractionStrategy(SCHEMA)
    run_cfg = CrawlerRunConfig(extraction_strategy=strategy, cache_mode=CacheMode.BYPASS)
    async with AsyncWebCrawler(config=BrowserConfig(headless=True)) as crawler:
        result = await crawler.arun(url=f"raw://{html}", config=run_cfg)
    data = json.loads(result.extracted_content or "[]")
    record = data[0] if isinstance(data, list) and data else {}

    for c in record.get("colors", []):
        c["online_instock"] = parse_stock(c.get("online_instock"))
    for s in record.get("sizes", []):
        s["online_instock"] = parse_stock(s.get("online_instock"))

    image_urls, seen = [], set()
    for src in record.get("image_sources", []):
        u = best_from_srcset(src.get("srcset", ""))
        if u and u not in seen:
            seen.add(u)
            image_urls.append(u)
    record["images"] = image_urls
    record.pop("image_sources", None)

    bm = extract_boldmetrics_product(html)
    if bm:
        record["boldmetrics_product"] = bm
    return record, image_urls


async def download_images_in_session(page, image_urls, dest_dir):
    """在已建立会话的 page 里用浏览器 fetch 下载图片（过 Akamai）。"""
    dest_dir.mkdir(parents=True, exist_ok=True)
    saved = []
    for idx, url in enumerate(image_urls):
        try:
            res = await page.evaluate(
                """async (u) => {
                    const resp = await fetch(u, { credentials: 'include' });
                    if (!resp.ok) return { ok: false, status: resp.status };
                    const buf = await resp.arrayBuffer();
                    let binary = ''; const bytes = new Uint8Array(buf);
                    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                    return { ok: true, b64: btoa(binary), type: resp.headers.get('content-type') };
                }""",
                url,
            )
        except Exception as e:
            saved.append({"src": url, "error": f"evaluate: {e}"})
            continue
        if not res or not res.get("ok"):
            saved.append({"src": url, "error": f"http {res.get('status') if res else 'none'}"})
            continue
        content = base64.b64decode(res["b64"])
        name = Path(urllib.parse.urlparse(url).path).name or f"image_{idx}"
        dest = dest_dir / f"{idx:02d}_{name}"
        dest.write_bytes(content)
        saved.append({"src": url, "file": dest.name, "bytes": len(content)})
        await page.wait_for_timeout(400)
    return saved


async def main():
    if not PROFILE_DIR and not CDP_ENDPOINT:
        print("FAILED: 需要 PATAGONIA_PROFILE 或 PATAGONIA_CDP。", file=sys.stderr)
        return

    items = read_urls()
    print(f"[INFO] xlsx 共 {len(items)} 个商品；本次 LIMIT={LIMIT}，间隔 DELAY={DELAY}s")

    from playwright.async_api import async_playwright
    profile_path = str(Path(PROFILE_DIR).expanduser())
    PRODUCTS_DIR.mkdir(parents=True, exist_ok=True)

    processed = 0
    async with async_playwright() as p:
        if CDP_ENDPOINT:
            # === 连接你已手动打开的浏览器（会话最真，窗口不用关）===
            print(f"[MODE] 连接已开浏览器 CDP: {CDP_ENDPOINT}")
            browser = await p.chromium.connect_over_cdp(CDP_ENDPOINT)
            context = browser.contexts[0] if browser.contexts else await browser.new_context()
            page = context.pages[0] if context.pages else await context.new_page()
            own_context = False
        else:
            # === 自己启动 persistent context ===
            context = await p.chromium.launch_persistent_context(
                user_data_dir=profile_path,
                headless=False,
                locale="en-US",
                timezone_id="America/New_York",
                viewport={"width": 1440, "height": 900},
            )
            page = context.pages[0] if context.pages else await context.new_page()
            own_context = True

        for i, item in enumerate(items):
            if processed >= LIMIT:
                print(f"[STOP] 已达 LIMIT={LIMIT}，停止。")
                break

            url = item["url"]
            pid = pid_from_url(url)
            # ONLY 模式：只抓指定 pid，其它跳过（不计入 processed）
            if ONLY and ONLY not in url:
                continue
            folder = folder_from_url(url)
            pdir = PRODUCTS_DIR / folder
            data_path = pdir / "data.json"

            # 断点续跑：已成功的跳过（不重复请求）。兼容旧的纯 pid 目录。
            if data_path.exists() or (PRODUCTS_DIR / pid / "data.json").exists():
                print(f"[SKIP] {folder} 已抓过，跳过。")
                continue

            print(f"\n[{i+1}/{len(items)}] {folder}  {item['cat1']}/{item['cat2']}")
            print(f"        {url}")

            html = ""
            status = None
            try:
                resp = await page.goto(url, wait_until="domcontentloaded", timeout=GOTO_TIMEOUT)
                status = resp.status if resp else None
                await page.wait_for_timeout(1500)
                await page.mouse.wheel(0, 4000)
                await page.wait_for_timeout(2000)
                html = await page.content()
            except Exception as e:
                msg = str(e).lower()
                # 浏览器/CDP 断连 —— 干净退出，保住已抓进度，提示重连续跑（不丢数据）
                if any(k in msg for k in ("closed", "disconnected", "connection", "crash", "target")):
                    print(f"        [DISCONNECTED] 浏览器/CDP 断开：{e}", file=sys.stderr)
                    print(f"        已抓 {processed} 个（本次会话）。重连浏览器后重跑即可续跑，"
                          f"已抓的会自动跳过。", file=sys.stderr)
                    break
                # 页面偶发加载失败（超时等）不停整批，跳过该商品继续
                print(f"        [SKIP-ERROR] goto 失败：{e} -> 跳过该商品，继续。", file=sys.stderr)
                if processed < LIMIT and i < len(items) - 1:
                    print(f"        ... 等待 {DELAY}s 再抓下一个 ...")
                    await page.wait_for_timeout(int(DELAY * 1000))
                continue

            # 明确的 404 / Not found（风控信号）才停整批
            is_notfound = ("Not found" in html and len(html) < 500) or (status == 404)
            if is_notfound:
                print(f"        [BLOCKED] {len(html)} bytes / status={status}（Not found / 风控）。"
                      f"停止批量以免加深风控。已完成 {processed} 个。", file=sys.stderr)
                break
            # 拿到页面但结构不符（非 404）：跳过该商品，不停整批
            if "product-title" not in html or len(html) < 5000:
                print(f"        [SKIP-BAD] 页面结构异常（{len(html)} bytes, status={status}），跳过。",
                      file=sys.stderr)
                if processed < LIMIT and i < len(items) - 1:
                    print(f"        ... 等待 {DELAY}s 再抓下一个 ...")
                    await page.wait_for_timeout(int(DELAY * 1000))
                continue

            # 抽取
            record, image_urls = await extract_from_html(html)
            record["_source_url"] = url
            record["_status_code"] = status
            record["_category"] = {"cat1": item["cat1"], "cat2": item["cat2"], "brand": item["brand"]}

            # 下图（同会话）
            saved_imgs = await download_images_in_session(page, image_urls, pdir / "images")
            record["downloaded_images"] = saved_imgs

            pdir.mkdir(parents=True, exist_ok=True)
            (pdir / "raw.html").write_text(html, encoding="utf-8")
            data_path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")

            ok_imgs = len([s for s in saved_imgs if "file" in s])
            print(f"        [OK] {record.get('title')} | ${record.get('price')} | "
                  f"{len(record.get('colors', []))}色 {len(record.get('sizes', []))}码 | "
                  f"图 {ok_imgs}/{len(image_urls)} -> {pdir}")
            processed += 1

            # 大间隔（最后一个不用等）
            if processed < LIMIT and i < len(items) - 1:
                print(f"        ... 等待 {DELAY}s 再抓下一个 ...")
                await page.wait_for_timeout(int(DELAY * 1000))

        # CDP 模式：只断开连接，不关你手动开的浏览器
        if own_context:
            await context.close()

    print(f"\n=== BATCH DONE === 本次成功 {processed} 个，输出目录：{PRODUCTS_DIR}")


if __name__ == "__main__":
    asyncio.run(main())
