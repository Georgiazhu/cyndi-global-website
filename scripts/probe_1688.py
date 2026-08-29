"""
1688 商品页探路脚本 —— 只 dump HTML + 分析数据结构，不做抽取。

因为 1688（阿里系）页面结构、反爬、数据存放方式与 Patagonia 完全不同，
先探清楚数据藏在哪（DOM 明文 / 加密 JSON / 需要接口），再决定抽取方案。

用 CDP 连接你手动打开的浏览器（复用真实会话，规避阿里风控）。

用法：
  # 1. 手动开带调试端口的浏览器并打开该 1688 页面（保持窗口打开）
  # 2. 运行：
  PATAGONIA_CDP=http://localhost:9222 .crawl-venv/bin/python scripts/probe_1688.py

输出：
  scripts/output/_1688_probe.html   -- 原始 HTML
  控制台打印结构分析
"""
import asyncio
import json
import os
import re
import sys
from pathlib import Path

URL = "https://detail.1688.com/offer/910218461655.html"
CDP = os.environ.get("PATAGONIA_CDP", "http://localhost:9222").strip()
OUTPUT_DIR = Path(__file__).parent / "output"


async def main():
    from playwright.async_api import async_playwright

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        print(f"[MODE] 连接 CDP: {CDP}")
        browser = await p.chromium.connect_over_cdp(CDP)
        context = browser.contexts[0] if browser.contexts else await browser.new_context()
        page = context.pages[0] if context.pages else await context.new_page()

        # 找到已经打开 1688 商品页的标签（不重新 goto，避免又触发滑块）
        target = None
        for pg in context.pages:
            if "1688.com/offer" in pg.url:
                target = pg
                break
        if target is None:
            # 没找到现成标签，退而 goto（可能触发滑块）
            print(f"[GOTO] 未找到已开的 1688 标签，导航到 {URL}")
            target = page
            resp = await target.goto(URL, wait_until="domcontentloaded", timeout=90000)
            status = resp.status if resp else None
        else:
            print(f"[REUSE] 复用已打开的标签: {target.url[:80]}")
            status = "reused-tab"
        page = target
        await page.wait_for_timeout(1500)
        await page.mouse.wheel(0, 3000)
        await page.wait_for_timeout(2000)
        html = await page.content()
        title = await page.title()

        out = OUTPUT_DIR / "_1688_probe.html"
        out.write_text(html, encoding="utf-8")

        print(f"\n=== STATUS === {status}")
        print(f"=== PAGE TITLE === {title}")
        print(f"=== HTML LENGTH === {len(html)} bytes -> {out}")

        # 风控/验证码检测
        blockers = ["滑块", "验证", "captcha", "punish", "nc_1_n1z", "SLIDE", "拖动", "安全验证", "访问异常"]
        hit = [b for b in blockers if b in html]
        print(f"=== 风控/验证码迹象 === {hit if hit else '未发现明显验证码'}")

        # 常见阿里数据容器
        print("\n=== 数据容器探测 ===")
        containers = [
            "window.__INIT_DATA__", "window.__GLOBAL_DATA", "window.runParams",
            "window.__STORE__", "__NEXT_DATA__", "window.context",
            "detailData", "skuModel", "orderParamModel", "offerData",
            "iDetailData", "window.__AB_DATA__", "window.__INITIAL_STATE__",
        ]
        for c in containers:
            print(f"  {'✓' if c in html else '·'} {c}")

        # 价格 / SKU / 图片线索（关键词命中）
        print("\n=== 关键字段线索 ===")
        for kw in ["price", "skuId", "skuMap", "priceRange", "img", "mainImage",
                   "gallery", "subject", "颜色", "尺码", "规格"]:
            cnt = html.count(kw)
            if cnt:
                print(f"  '{kw}': {cnt} 次")

        # 尝试提取一个疑似 JSON 块的开头，看结构
        for pat in [r"window\.__INIT_DATA__\s*=\s*(\{)", r"window\.runParams\s*=\s*(\{)",
                    r"__NEXT_DATA__[^>]*>\s*(\{)"]:
            m = re.search(pat, html)
            if m:
                snippet = html[m.start():m.start()+300]
                print(f"\n=== 命中数据块（{pat[:30]}...）片段 ===")
                print(snippet[:300])
                break

        await browser.close() if False else None  # 不关你的浏览器
        # CDP 模式：只断开，不关浏览器（connect_over_cdp 的 browser.close 只断连接）


if __name__ == "__main__":
    asyncio.run(main())
