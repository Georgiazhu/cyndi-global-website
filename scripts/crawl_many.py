"""
批量抓取多个网页模板 —— 限制并发 + 请求延迟，结果分页保存为 Markdown + JSON。

【使用前必读】
- 只抓你【自有】或【已获授权 / robots 与 ToS 允许】的站点。
- 不要对设置了反爬防护的第三方站点使用；遵守目标站 robots.txt 与访问频率限制。
- URLS 列表默认留空，自己在下面填要抓的地址。

运行：
  .crawl-venv/bin/python scripts/crawl_many.py

输出：
  scripts/output_many/<序号>_<域名路径>.md     -- 每页 Markdown
  scripts/output_many/<序号>_<域名路径>.json    -- 每页结构化结果
  scripts/output_many/summary.json              -- 全部页面汇总
  scripts/output_many/images/                   -- 下载的图片（当 DOWNLOAD_IMAGES=True）
"""
import asyncio
import json
import re
import sys
import urllib.parse
from pathlib import Path

import httpx
from crawl4ai import (
    AsyncWebCrawler,
    BrowserConfig,
    CrawlerRunConfig,
    CacheMode,
    MemoryAdaptiveDispatcher,
    RateLimiter,
)

# ============================================================
# 1) 在这里填你要抓的地址（每行一个）——务必是你有权抓的站点
# ============================================================
URLS = [
    # "https://your-own-site.com/page-1",
    # "https://your-own-site.com/page-2",
]

# ============================================================
# 2) 并发 / 延迟 / 输出 参数（按需调整）
# ============================================================
MAX_CONCURRENT = 3          # 最大并发数（对外部站建议 2~5，别太高）
DELAY_MIN = 1.0             # 每次请求之间的最小延迟（秒）
DELAY_MAX = 3.0             # 每次请求之间的最大延迟（秒），实际取区间随机
PAGE_TIMEOUT_MS = 60000    # 单页加载超时
DOWNLOAD_IMAGES = False    # True 则把图片文件下载到 images/；False 只在 JSON 里存图片 URL

OUTPUT_DIR = Path(__file__).parent / "output_many"
IMAGES_DIR = OUTPUT_DIR / "images"


def slugify(url: str, idx: int) -> str:
    """把 URL 转成安全的文件名。"""
    parsed = urllib.parse.urlparse(url)
    raw = f"{parsed.netloc}{parsed.path}".strip("/")
    slug = re.sub(r"[^a-zA-Z0-9._-]+", "_", raw) or "page"
    return f"{idx:03d}_{slug[:80]}"


async def download_images(images, base_url, prefix):
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    saved = []
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        for i, img in enumerate(images):
            src = img.get("src")
            if not src or src.startswith("data:"):
                continue
            abs_url = urllib.parse.urljoin(base_url, src)
            try:
                resp = await client.get(abs_url)
                resp.raise_for_status()
                name = Path(urllib.parse.urlparse(abs_url).path).name or f"img_{i}"
                if "." not in name:
                    name += ".img"
                dest = IMAGES_DIR / f"{prefix}_{i:03d}_{name}"
                dest.write_bytes(resp.content)
                saved.append({"src": abs_url, "file": str(dest.relative_to(OUTPUT_DIR)), "bytes": len(resp.content)})
            except Exception as e:
                saved.append({"src": abs_url, "error": str(e)})
    return saved


async def main():
    if not URLS:
        print("URLS 为空。请先在 scripts/crawl_many.py 顶部的 URLS 列表里填入你有权抓取的地址。", file=sys.stderr)
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # === stealth 相关配置（用于自有 / 授权站点）===
    browser_cfg = BrowserConfig(
        headless=True,
        enable_stealth=True,
        user_agent_mode="random",
        verbose=True,
    )

    run_cfg = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        wait_until="domcontentloaded",   # SPA 友好；避免 networkidle 因长连接超时
        delay_before_return_html=2.0,    # 等待动态渲染
        page_timeout=PAGE_TIMEOUT_MS,
        scan_full_page=True,
    )

    # === 并发 + 延迟：调度器控制 ===
    dispatcher = MemoryAdaptiveDispatcher(
        max_session_permit=MAX_CONCURRENT,                       # 限制并发
        rate_limiter=RateLimiter(base_delay=(DELAY_MIN, DELAY_MAX)),  # 请求间随机延迟
    )

    summary = []
    async with AsyncWebCrawler(config=browser_cfg) as crawler:
        results = await crawler.arun_many(URLS, config=run_cfg, dispatcher=dispatcher)

        for idx, result in enumerate(results):
            prefix = slugify(result.url, idx)
            entry = {"url": result.url, "success": result.success}

            if not result.success:
                entry["error"] = result.error_message
                summary.append(entry)
                print(f"[FAIL] {result.url} -> {result.error_message}")
                continue

            md = result.markdown.raw_markdown if hasattr(result.markdown, "raw_markdown") else str(result.markdown)
            images = (result.media or {}).get("images", [])

            (OUTPUT_DIR / f"{prefix}.md").write_text(md, encoding="utf-8")

            downloaded = []
            if DOWNLOAD_IMAGES and images:
                downloaded = await download_images(images, result.url, prefix)

            payload = {
                "url": result.url,
                "status_code": result.status_code,
                "title": result.metadata.get("title") if result.metadata else None,
                "metadata": result.metadata,
                "markdown": md,
                "images": images,
                "downloaded_images": downloaded,
            }
            (OUTPUT_DIR / f"{prefix}.json").write_text(
                json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
            )

            entry.update({
                "status_code": result.status_code,
                "title": payload["title"],
                "markdown_length": len(md),
                "images": len(images),
                "files": [f"{prefix}.md", f"{prefix}.json"],
            })
            summary.append(entry)
            print(f"[OK]   {result.url} -> {len(md)} chars, {len(images)} imgs")

    (OUTPUT_DIR / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    ok = sum(1 for s in summary if s.get("success"))
    print(f"\n=== DONE === {ok}/{len(summary)} 成功，输出目录：{OUTPUT_DIR}")


if __name__ == "__main__":
    asyncio.run(main())
