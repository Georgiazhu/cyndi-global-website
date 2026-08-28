"""
抓取本地 React 试点页面 (localhost:5173/cyndi.html)，演示 Crawl4AI 的 stealth 配置，
并把结果保存为 Markdown + JSON，图片信息存入 JSON、图片文件可选下载到本地。

目标是自有站点，用于验证 stealth / 反检测相关配置是否生效。

输出：
  scripts/output/cyndi.md      -- Markdown 正文
  scripts/output/cyndi.json    -- 结构化结果（含图片 URL 列表）
  scripts/output/images/       -- 下载的图片文件（当 DOWNLOAD_IMAGES=True）
"""
import asyncio
import json
import sys
import urllib.parse
from pathlib import Path

import httpx
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode

URL = "https://www.patagonia.com/product/mens-baggies-lights-6-inch-shorts/58049.html?dwvar_58049_color=BSNG"

OUTPUT_DIR = Path(__file__).parent / "output"
IMAGES_DIR = OUTPUT_DIR / "images"
DOWNLOAD_IMAGES = True   # 设为 False 则只存图片 URL、不下载文件


async def download_images(images, base_url):
    """把图片 URL 列表逐个下载到本地 images/ 目录，返回下载记录。"""
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    saved = []
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        for idx, img in enumerate(images):
            src = img.get("src")
            if not src:
                continue
            abs_url = urllib.parse.urljoin(base_url, src)
            # data: URI 内联图片跳过（无法当普通文件下载）
            if abs_url.startswith("data:"):
                continue
            try:
                resp = await client.get(abs_url)
                resp.raise_for_status()
                name = Path(urllib.parse.urlparse(abs_url).path).name or f"image_{idx}"
                if "." not in name:
                    name += ".img"
                dest = IMAGES_DIR / f"{idx:03d}_{name}"
                dest.write_bytes(resp.content)
                saved.append({"src": abs_url, "file": str(dest.relative_to(OUTPUT_DIR)), "bytes": len(resp.content)})
            except Exception as e:
                saved.append({"src": abs_url, "error": str(e)})
    return saved


async def main():
    # === stealth 相关配置 ===
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
        # 注意：Vite dev server 有 HMR 的常驻 WebSocket，networkidle 永远不会达成，
        # 会导致 Page.goto 超时。改用 domcontentloaded + 显式延迟等 React 渲染。
        wait_until="domcontentloaded",
        delay_before_return_html=2.0,  # 等 SPA 渲染完成
        page_timeout=60000,
        scan_full_page=True,          # 滚动整页，触发懒加载
    )

    async with AsyncWebCrawler(config=browser_cfg) as crawler:
        result = await crawler.arun(url=URL, config=run_cfg)
        if not result.success:
            print("FAILED:", result.error_message, file=sys.stderr)
            return

        md = result.markdown.raw_markdown if hasattr(result.markdown, "raw_markdown") else str(result.markdown)
        images = (result.media or {}).get("images", [])

        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

        # 1. 保存 Markdown
        md_path = OUTPUT_DIR / "cyndi.md"
        md_path.write_text(md, encoding="utf-8")

        # 2. 可选：下载图片文件
        downloaded = []
        if DOWNLOAD_IMAGES and images:
            downloaded = await download_images(images, URL)

        # 3. 保存结构化 JSON
        payload = {
            "url": URL,
            "status_code": result.status_code,
            "title": result.metadata.get("title") if result.metadata else None,
            "metadata": result.metadata,
            "markdown": md,
            "images": images,             # 图片元数据（src / alt / 宽高 / 打分）
            "downloaded_images": downloaded,
        }
        json_path = OUTPUT_DIR / "cyndi.json"
        json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

        print("=== STATUS ===", result.status_code)
        print("=== MARKDOWN LENGTH ===", len(md))
        print("=== IMAGES FOUND ===", len(images))
        print("=== IMAGES DOWNLOADED ===", len([d for d in downloaded if "file" in d]))
        print("=== SAVED ===")
        print(" ", md_path)
        print(" ", json_path)
        if downloaded:
            print(" ", IMAGES_DIR)


if __name__ == "__main__":
    asyncio.run(main())
