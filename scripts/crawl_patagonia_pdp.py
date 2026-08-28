"""
抓取单个 Patagonia PDP（商品详情页），提取：图片 / 颜色 / 尺码 / 价格 / 商品描述。

采用 identity-based crawling（Managed Browser + 持久化 profile），因为部分商品页
对匿名/无会话请求返回 404 "Not found"。用你真实浏览器 profile 的 cookie/会话 +
美国区 locale/timezone/geolocation，让站点把你当作正常美国用户，从而拿到真实页面。
数据大多藏在 DOM 属性和内联 <script> 里，故用 JsonCssExtractionStrategy 抽取。

======================= 使用步骤 =======================
第 1 步：创建一个持久化浏览器 profile（只需一次，需手动交互）
    .crawl-venv/bin/crwl profiles
  - 选 "Create new profile"，起个名字（比如 patagonia）
  - 弹出的 Chromium 里，打开目标商品页，确认能看到商品（这会写入 cookie/会话）
  - 回到终端按 q 保存。profile 存到 ~/.crawl4ai/profiles/<名字>

第 2 步：把 profile 路径传给本脚本再运行
    PATAGONIA_PROFILE=~/.crawl4ai/profiles/patagonia .crawl-venv/bin/python scripts/crawl_patagonia_pdp.py

  不设 PATAGONIA_PROFILE 时，脚本回退到纯 stealth 模式（匿名，可能 404）。
========================================================

【使用前必读】
- 仅用于内部数据模型调研（不入库、不对外展示第三方文案/图片）。
- 遵守目标站 robots.txt 与 ToS，控制访问频率。

输出：
  scripts/output/patagonia_pdp.json  -- 结构化结果（价格/颜色/尺码/图片/描述）
  scripts/output/pdp_images/         -- 下载的图片（当 DOWNLOAD_IMAGES=True）
"""
import asyncio
import json
import os
import re
import sys
import urllib.parse
from pathlib import Path

import httpx
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
from crawl4ai.extraction_strategy import JsonCssExtractionStrategy

URL = "https://www.patagonia.com/product/mens-fitz-roy-trout-t-shirt/37846.html?dwvar_37846_color=DNBR"

# 持久化浏览器 profile 路径（用 crwl profiles 创建后，通过环境变量传入）
PROFILE_DIR = os.environ.get("PATAGONIA_PROFILE", "").strip()
# 离线抽取：直接对本地已保存的 HTML 跑抽取，完全不联网（最安全，可反复调试）
HTML_FILE = os.environ.get("PATAGONIA_HTML", "").strip()
# 反反爬最强档：Undetected Browser（深层浏览器补丁）+ stealth，对付 sophisticated 检测
USE_UNDETECTED = os.environ.get("PATAGONIA_UNDETECTED", "").strip() in ("1", "true", "yes")

OUTPUT_DIR = Path(__file__).parent / "output"
IMAGES_DIR = OUTPUT_DIR / "pdp_images"
DOWNLOAD_IMAGES = True   # 设为 False 则只存图片 URL、不下载文件

# ============================================================
# CSS 抽取 schema：把 DOM 属性映射成结构化字段
# ============================================================
SCHEMA = {
    "name": "PatagoniaPDP",
    # 用 body 作根：不同商品页外层容器 class 不一致（page-pdp-2-col 只在部分页面出现），
    # 而下面各字段选择器在整页里都是唯一的，所以用 body 最稳。
    "baseSelector": "body",
    "fields": [
        {"name": "title", "selector": "h1#product-title", "type": "text"},
        {"name": "style_no", "selector": ".style-no .js-buy-config-color-code", "type": "text"},
        # 价格取 content 属性（比可见文本 "$129" 干净）
        {"name": "price", "selector": "span.sales .value[itemprop='price']",
         "type": "attribute", "attribute": "content"},
        {"name": "currency", "selector": "meta[itemprop='priceCurrency']",
         "type": "attribute", "attribute": "content"},
        {"name": "description", "selector": "article.pdp__content-copy p[itemprop='description']",
         "type": "text"},
        # 颜色列表：每个 swatch 一条（名称 / 色码 / 在线库存）
        {"name": "colors", "selector": "li.pdp-colors--swatches button.product-swatch",
         "type": "list", "fields": [
            {"name": "code", "type": "attribute", "attribute": "data-color"},
            {"name": "name", "type": "attribute", "attribute": "data-caption"},
            {"name": "online_instock", "type": "attribute", "attribute": "data-online-instock"},
         ]},
        # 尺码列表：尺码值 + 在线库存
        {"name": "sizes", "selector": "label.pdp-size-select",
         "type": "list", "fields": [
            {"name": "size", "type": "attribute", "attribute": "data-attr-value"},
            {"name": "online_instock", "type": "attribute", "attribute": "data-online-instock"},
         ]},
        # 图片：注意 <img src> 是 1x1 占位图，真实图在 <source srcset> 里
        {"name": "image_sources",
         "selector": "ul.product-gallery li.product-asset__image source",
         "type": "list", "fields": [
            {"name": "srcset", "type": "attribute", "attribute": "srcset"},
         ]},
    ],
}


def best_from_srcset(srcset: str) -> str:
    """从 srcset（多分辨率）里挑分辨率最高的那个 URL。"""
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
    """data-online-instock 是 JSON 字符串，如 '["L","M"]'，尝试解析成列表。"""
    if not value:
        return value
    try:
        return json.loads(value)
    except (ValueError, TypeError):
        return value


def extract_boldmetrics_product(html: str):
    """从内联 <script> window._boldmetrics = {..., product: {...}, ...} 里
    抽取 product 对象（含完整 variants + description）。"""
    m = re.search(r"product:\s*(\{.*?\}),\s*[\r\n]", html, re.S)
    if not m:
        return None
    # 收缩到平衡的花括号，避免贪婪匹配吞掉后面内容
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


async def download_images(images, base_url):
    """把图片 URL 逐个下载到本地 pdp_images/ 目录。"""
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    saved = []
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        for idx, url in enumerate(images):
            if not url or url.startswith("data:"):
                continue
            abs_url = urllib.parse.urljoin(base_url, url)
            try:
                resp = await client.get(abs_url)
                resp.raise_for_status()
                name = Path(urllib.parse.urlparse(abs_url).path).name or f"image_{idx}"
                if "." not in name:
                    name += ".jpg"
                dest = IMAGES_DIR / f"{idx:03d}_{name}"
                dest.write_bytes(resp.content)
                saved.append({"src": abs_url, "file": str(dest.relative_to(OUTPUT_DIR)), "bytes": len(resp.content)})
            except Exception as e:
                saved.append({"src": abs_url, "error": str(e)})
    return saved


async def main():
    if PROFILE_DIR:
        # === identity-based：Managed Browser + 你的持久化 profile ===
        profile_path = str(Path(PROFILE_DIR).expanduser())
        print(f"[MODE] Managed Browser profile: {profile_path}")
        browser_cfg = BrowserConfig(
            headless=True,
            use_managed_browser=True,     # 启用持久化浏览器策略
            user_data_dir=profile_path,   # 复用你的 cookie/会话/指纹
            browser_type="chromium",
            verbose=True,
        )
    else:
        # === 回退：纯 stealth（匿名，部分商品可能 404）===
        print("[MODE] 纯 stealth（未提供 PATAGONIA_PROFILE，匿名请求可能 404）")
        browser_cfg = BrowserConfig(
            headless=True,
            enable_stealth=True,          # 开启 playwright-stealth，抹掉自动化痕迹
            user_agent_mode="random",     # 随机真实浏览器 UA
            verbose=True,
        )

    run_cfg = CrawlerRunConfig(
        magic=True,                   # 一组"更像人"的默认行为
        simulate_user=True,           # 模拟用户交互
        mean_delay=1.0,               # 请求间隔，避免打爆站点
        cache_mode=CacheMode.BYPASS,
        # 让站点把你当作正常美国用户（若 404 是地域限制，这几项是关键）
        locale="en-US",
        timezone_id="America/New_York",
        # SPA / AJAX 友好：buy-config（颜色/尺码）是懒加载的，需要显式等待
        wait_until="domcontentloaded",
        delay_before_return_html=3.0,  # 等 buy-config 那块 AJAX 渲染出来
        page_timeout=60000,
        scan_full_page=True,          # 滚动整页，触发图片懒加载
        extraction_strategy=JsonCssExtractionStrategy(SCHEMA),
    )

    # === 路径 0：纯离线抽取（不联网，反复调也不碰网络，最安全）===
    if HTML_FILE:
        p = Path(HTML_FILE).expanduser()
        print(f"[MODE] 离线抽取本地 HTML: {p}")
        html = p.read_text(encoding="utf-8")
        if "page-pdp-2-col" not in html:
            print("FAILED: 该 HTML 不是有效的 PDP 页面。", file=sys.stderr)
            return
        await process_html(html, "local-file")
        return

    if USE_UNDETECTED:
        # === 路径 U：Undetected Browser + stealth（反反爬最强档，只抓一次，不重试）===
        from crawl4ai import UndetectedAdapter
        from crawl4ai.async_crawler_strategy import AsyncPlaywrightCrawlerStrategy

        print("[MODE] Undetected Browser + stealth（headless=False）")
        undetected_cfg = BrowserConfig(
            headless=False,               # 文档：无头更易被检测
            enable_stealth=True,          # 叠加 stealth
            user_agent_mode="random",
            verbose=True,
        )
        adapter = UndetectedAdapter()
        strategy = AsyncPlaywrightCrawlerStrategy(
            browser_config=undetected_cfg,
            browser_adapter=adapter,
        )
        async with AsyncWebCrawler(crawler_strategy=strategy, config=undetected_cfg) as crawler:
            result = await crawler.arun(url=URL, config=run_cfg)
            if not result.success or "page-pdp-2-col" not in (result.html or ""):
                print(f"FAILED: undetected 也未拿到有效页面 -> "
                      f"{result.error_message or (str(len(result.html or ''))+' bytes')}。"
                      f"不重试以免触发风控。", file=sys.stderr)
                return
            await process_html(result.html, result.status_code)
        return

    if PROFILE_DIR:
        # === 路径 A：Playwright persistent context 复用 profile（绕开 CDP，只抓一次，不重试）===
        html, status = await fetch_with_persistent_profile()
        if "page-pdp-2-col" not in html:
            print(f"FAILED: 未拿到有效页面（{len(html or '')} bytes）。"
                  f"不重试以免触发风控。可稍后手动再跑一次，或用 PATAGONIA_HTML 离线抽取。",
                  file=sys.stderr)
            return
        await process_html(html, status)
    else:
        # === 路径 B：crawl4ai 纯 stealth（匿名）===
        async with AsyncWebCrawler(config=browser_cfg) as crawler:
            result = await crawler.arun(url=URL, config=run_cfg)
            if not result.success:
                print("FAILED:", result.error_message, file=sys.stderr)
                return
            await process_html(result.html, result.status_code)


async def fetch_with_persistent_profile():
    """用 Playwright launch_persistent_context 复用 ~/.crawl4ai 的 profile 目录，
    直接打开页面拿渲染后的 HTML。不走 CDP / 9222，规避 Managed Browser 的连接问题。"""
    from playwright.async_api import async_playwright

    profile_path = str(Path(PROFILE_DIR).expanduser())
    print(f"[MODE] Playwright persistent context: {profile_path}")
    async with async_playwright() as p:
        # channel="chromium" 用 Playwright 自带的 Chromium；headless=False 更不易被识别
        context = await p.chromium.launch_persistent_context(
            user_data_dir=profile_path,
            headless=False,
            locale="en-US",
            timezone_id="America/New_York",
            viewport={"width": 1440, "height": 900},
        )
        page = context.pages[0] if context.pages else await context.new_page()
        resp = await page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        status = resp.status if resp else None
        # 等 buy-config（颜色/尺码）AJAX 渲染 + 滚动触发懒加载
        await page.wait_for_timeout(1500)
        await page.mouse.wheel(0, 4000)
        await page.wait_for_timeout(2000)
        html = await page.content()
        await context.close()

        valid = "page-pdp-2-col" in html and len(html) > 5000
        dbg = OUTPUT_DIR / "_pdp_raw.html"
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        # 只在拿到有效页面时才写盘，避免失败的 "Not found" 覆盖已保存的成功 HTML
        if valid:
            dbg.write_text(html, encoding="utf-8")
            print(f"[FETCH OK] {len(html)} bytes -> {dbg}（已保存，后续可用 PATAGONIA_HTML 离线复用）")
        else:
            print(f"[FETCH BAD] 只拿到 {len(html)} bytes（可能是 Not found / 风控）。"
                  f"不覆盖已保存的 HTML，也不重试。")
        return html, status


async def process_html(html: str, status):
    """对拿到的 HTML 跑抽取 schema + 清洗 + 保存。两条路径共用。
    用 crawl4ai 的 raw: 方案把本地 HTML 交给抽取策略（比调内部 run() 稳）。"""
    strategy = JsonCssExtractionStrategy(SCHEMA)
    run_cfg = CrawlerRunConfig(
        extraction_strategy=strategy,
        cache_mode=CacheMode.BYPASS,
    )
    async with AsyncWebCrawler(config=BrowserConfig(headless=True)) as crawler:
        result = await crawler.arun(url=f"raw://{html}", config=run_cfg)
    data = json.loads(result.extracted_content or "[]")
    record = data[0] if isinstance(data, list) and data else {}

    # 清洗颜色 / 尺码库存字段
    for c in record.get("colors", []):
        c["online_instock"] = parse_stock(c.get("online_instock"))
    for s in record.get("sizes", []):
        s["online_instock"] = parse_stock(s.get("online_instock"))

    # 清洗图片：srcset -> 最高清 URL，去重
    image_urls = []
    seen = set()
    for src in record.get("image_sources", []):
        url = best_from_srcset(src.get("srcset", ""))
        if url and url not in seen:
            seen.add(url)
            image_urls.append(url)
    record["images"] = image_urls
    record.pop("image_sources", None)

    # 补抓内联 _boldmetrics.product（含完整 variants + description，做冗余）
    bm = extract_boldmetrics_product(html)
    if bm:
        record["boldmetrics_product"] = bm

    # 可选：下载图片文件
    downloaded = []
    if DOWNLOAD_IMAGES and image_urls:
        downloaded = await download_images(image_urls, URL)
        record["downloaded_images"] = downloaded

    record["_source_url"] = URL
    record["_status_code"] = status

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    json_path = OUTPUT_DIR / "patagonia_pdp.json"
    json_path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")

    print("=== STATUS ===", status)
    print("=== TITLE ===", record.get("title"))
    print("=== PRICE ===", record.get("price"), record.get("currency"))
    print("=== COLORS ===", len(record.get("colors", [])))
    print("=== SIZES ===", [s.get("size") for s in record.get("sizes", [])])
    print("=== IMAGES ===", len(image_urls))
    print("=== IMAGES DOWNLOADED ===", len([d for d in downloaded if "file" in d]))
    print("=== DESCRIPTION ===", (record.get("description") or "")[:120])
    print("=== SAVED ===", json_path)
    if downloaded:
        print("            ", IMAGES_DIR)


if __name__ == "__main__":
    asyncio.run(main())
