"""
调研用一次性脚本：抓取单个 Patagonia 商品页，观察其商品信息结构。
仅用于内部数据模型调研（不入库、不对外展示第三方文案/图片）。
"""
import asyncio
import json
import sys

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode

URL = "https://www.patagonia.com/product/mens-baggies-lights-6-inch-shorts/58049.html?dwvar_58049_color=BSNG"


async def main():
    browser_cfg = BrowserConfig(headless=True)
    run_cfg = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        wait_until="domcontentloaded",
        page_timeout=60000,
    )
    async with AsyncWebCrawler(config=browser_cfg) as crawler:
        result = await crawler.arun(url=URL, config=run_cfg)
        if not result.success:
            print("FAILED:", result.error_message, file=sys.stderr)
            return
        md = result.markdown.raw_markdown if hasattr(result.markdown, "raw_markdown") else str(result.markdown)
        print("=== STATUS ===", result.status_code)
        print("=== MARKDOWN LENGTH ===", len(md))
        print("=== METADATA ===")
        print(json.dumps(result.metadata, ensure_ascii=False, indent=2)[:2000])
        print("=== MARKDOWN (first 4000 chars) ===")
        print(md[:4000])


if __name__ == "__main__":
    asyncio.run(main())
