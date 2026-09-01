"""
天猫批量抓取 —— 从 xlsx 读 detail.tmall.com URL，CDP 复用已登录会话。

天猫与淘宝页面结构完全一致（同为阿里 ICE SSR，var b -> loaderData.home.data.res），
故本脚本复用 crawl_taobao_batch.py 的解析/下载函数，仅改：URL 过滤(tmall)、
商品页 URL(detail.tmall.com)、输出目录(products_tmall)、标签匹配(tmall)。

【前提】9222 浏览器登录淘宝/天猫(同阿里账号)，打开任一天猫商品页保持登录。

用法：
  LIMIT=2 PATAGONIA_CDP=http://localhost:9222 \
    XLSX="/Users/gufe/Downloads/品类选择表-Drinkware.xlsx" \
    .crawl-venv/bin/python scripts/crawl_tmall_batch.py

环境变量：LIMIT / DELAY_MIN / DELAY_MAX / GOTO_TIMEOUT / PATAGONIA_CDP / XLSX
输出：scripts/output/products_tmall/<itemId>/data.json + raw.html + images/
断点续跑：已抓过(存在 data.json)的自动跳过。复用已打开标签，不新开/关闭其它标签。
"""
import asyncio
import json
import os
import random
import re
import sys
from pathlib import Path

import openpyxl

# 复用淘宝爬虫的解析/构建/下载逻辑（结构完全一致）
import crawl_taobao_batch as tb

XLSX = os.environ.get("XLSX", "/Users/gufe/Downloads/品类选择表-Drinkware.xlsx").strip()
CDP = os.environ.get("PATAGONIA_CDP", "http://localhost:9222").strip()
LIMIT = int(os.environ.get("LIMIT", "2"))
DELAY_MIN = float(os.environ.get("DELAY_MIN", "120"))
DELAY_MAX = float(os.environ.get("DELAY_MAX", "180"))
GOTO_TIMEOUT = int(os.environ.get("GOTO_TIMEOUT", "90000"))

OUTPUT_DIR = Path(__file__).parent / "output"
PRODUCTS_DIR = OUTPUT_DIR / "products_tmall"


def read_tmall_urls():
    wb = openpyxl.load_workbook(XLSX, data_only=False)
    ws = wb["品类选择"]
    items = []
    for row in ws.iter_rows(min_row=2):
        lc = row[3]
        url = lc.hyperlink.target if lc.hyperlink else lc.value
        if url and "detail.tmall.com" in str(url):
            m = re.search(r"[?&]id=(\d+)", str(url))
            iid = m.group(1) if m else None
            clean = f"https://detail.tmall.com/item.htm?id={iid}" if iid else str(url)
            items.append({"cat1": row[0].value, "cat2": row[1].value, "brand": row[2].value,
                          "item_id": iid, "url": clean})
    return items


async def _sleep(page):
    d = random.uniform(DELAY_MIN, DELAY_MAX)
    print(f"        [WAIT] {d:.0f}s ...")
    await page.wait_for_timeout(int(d * 1000))


async def main():
    from playwright.async_api import async_playwright

    items = read_tmall_urls()
    print(f"[INFO] 天猫共 {len(items)} 个；LIMIT={LIMIT}，间隔随机 {DELAY_MIN}-{DELAY_MAX}s")
    PRODUCTS_DIR.mkdir(parents=True, exist_ok=True)

    processed = 0
    async with async_playwright() as p:
        print(f"[MODE] CDP: {CDP}")
        browser = await p.chromium.connect_over_cdp(CDP)
        ctx = browser.contexts[0]
        # 复用已打开的天猫/淘宝商品标签(不新开/不关闭其它标签)
        page = next((pg for pg in ctx.pages if "tmall.com/item" in pg.url and "login" not in pg.url), None)
        if page is None:
            page = next((pg for pg in ctx.pages if ("tmall.com" in pg.url or "taobao.com/item" in pg.url) and "login" not in pg.url), None)
        if page is None:
            print("[ERR] 浏览器里没有天猫标签页。请先在 9222 浏览器登录并打开一个天猫商品页。", file=sys.stderr)
            return

        for i, item in enumerate(items):
            if processed >= LIMIT:
                print(f"[STOP] 已达 LIMIT={LIMIT}。")
                break
            iid = item["item_id"]
            if not iid:
                print(f"[SKIP] 无 item_id: {item['url'][:60]}")
                continue
            pdir = PRODUCTS_DIR / iid
            if (pdir / "data.json").exists():
                print(f"[SKIP] {iid} 已抓过。")
                continue

            print(f"\n[{i+1}/{len(items)}] item={iid}  {item['cat1']}/{item['cat2']}")
            try:
                await page.goto(item["url"], wait_until="domcontentloaded", timeout=GOTO_TIMEOUT)
                await page.wait_for_timeout(3500)
                await page.mouse.wheel(0, 2500)
                await page.wait_for_timeout(2000)
                html = await page.content()
            except Exception as e:
                msg = str(e).lower()
                if any(k in msg for k in ("closed", "disconnected", "connection", "target", "crash")):
                    print(f"        [DISCONNECTED] 浏览器断开：{e}。重连后重跑续跑。", file=sys.stderr)
                    break
                print(f"        [SKIP-ERROR] {e} -> 跳过继续。", file=sys.stderr)
                await _sleep(page)
                continue

            if "login.taobao.com" in page.url or "login.tmall.com" in page.url or "_____tmd_____" in page.url:
                print(f"        [BLOCKED] 被要求登录/验证。url={page.url[:80]}", file=sys.stderr)
                print(f"        已抓 {processed} 个。请在浏览器确认登录态后重跑续跑。", file=sys.stderr)
                break

            res = tb.extract_res_from_html(html)
            if not res or not (res.get("item") or {}).get("title"):
                print(f"        [BLOCKED/EMPTY] 未解析到商品数据(res 空)。url={page.url[:80]}", file=sys.stderr)
                print(f"        已抓 {processed} 个。可能页面结构变化或未就绪；请确认页面正常后重跑。", file=sys.stderr)
                break

            record = tb.build_record(res, item)
            pdir.mkdir(parents=True, exist_ok=True)
            (pdir / "raw.html").write_text(html, encoding="utf-8")
            dl = await tb.download_images(page, record["images"], pdir / "images")
            record["downloaded_images"] = dl
            (pdir / "data.json").write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")

            n_ok = len([x for x in dl if "file" in x])
            print(f"        [OK] {record['title'][:42]} | 起￥{record.get('base_price')} | "
                  f"{len(record['props'])}属性 {len(record['skus'])}SKU | 图 {n_ok}/{len(record['images'])}")
            processed += 1

            if processed < LIMIT and i < len(items) - 1:
                await _sleep(page)

    print(f"\n=== TMALL BATCH DONE === 本次成功 {processed} 个，输出：{PRODUCTS_DIR}")


if __name__ == "__main__":
    asyncio.run(main())
