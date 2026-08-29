"""
1688 批量抓取 —— 从 品类选择表 (1).xlsx 读 1688 URL，CDP 复用你已验证的会话，
串行导航逐个抓，随机 2-3 分钟间隔，检测到滑块/空数据即停（让你重新滑后续跑）。

【前提】先手动开带调试端口的浏览器、打开任一 1688 商品页、手动滑过验证码、保持窗口。
（实测：滑一次后同会话内脚本导航其它 1688 商品短期内不再弹滑块。）

用法：
  LIMIT=5 PATAGONIA_CDP=http://localhost:9222 \
    .crawl-venv/bin/python scripts/crawl_1688_batch.py

环境变量：
  LIMIT       本次最多抓几个（默认 5）
  DELAY_MIN   间隔下限秒（默认 120）
  DELAY_MAX   间隔上限秒（默认 180）—— 实际每次在 [MIN,MAX] 随机
  GOTO_TIMEOUT goto 超时 ms（默认 90000）

输出：scripts/output/products_1688/<offerId>/data.json + images/
断点续跑：已抓过（存在 data.json）的自动跳过。
弹滑块/空数据：立即停整批（不硬刚），你重新滑验证后重跑即可续。
"""
import asyncio
import base64
import json
import os
import random
import re
import sys
import urllib.parse
from pathlib import Path

import openpyxl

XLSX = "/Users/gufe/Downloads/品类选择表 (1).xlsx"
CDP = os.environ.get("PATAGONIA_CDP", "http://localhost:9222").strip()
LIMIT = int(os.environ.get("LIMIT", "5"))
DELAY_MIN = float(os.environ.get("DELAY_MIN", "120"))
DELAY_MAX = float(os.environ.get("DELAY_MAX", "180"))
GOTO_TIMEOUT = int(os.environ.get("GOTO_TIMEOUT", "90000"))

OUTPUT_DIR = Path(__file__).parent / "output"
PRODUCTS_DIR = OUTPUT_DIR / "products_1688"

# 抽取脚本（与 crawl_1688.py 一致）
EXTRACT_JS = r"""
() => {
    const unescapeHtml = (s) => typeof s === 'string'
        ? s.replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&amp;/g,'&').replace(/&quot;/g,'"') : s;
    const c = window.context && window.context.result;
    if (!c) return { error: 'no window.context.result' };
    const d = c.data || {};
    const model = (c.global && c.global.globalData && c.global.globalData.model) || {};
    const out = {};
    try { out.subject = d.gallery.fields.subject; } catch(e) {}
    try { if (!out.subject) out.subject = model.offerDetail.subject; } catch(e) {}
    try { out.offerId = model.offerDetail.offerId; } catch(e) {}
    try {
        const pm = d.mainPrice.fields.priceModel;
        out.priceModel = { priceDisplayType: pm.priceDisplayType, currentPrices: pm.currentPrices,
            currentPricesWithOnePiece: pm.currentPricesWithOnePiece, advRate: pm.priceAdv && pm.priceAdv.advRate };
    } catch(e) {}
    try {
        const sku = d.Root.fields.dataJson.skuModel;
        out.skuProps = (sku.skuProps || []).map(p => ({ prop: p.prop,
            values: (p.value || []).map(v => ({ name: unescapeHtml(v.name), imageUrl: v.imageUrl || null })) }));
        out.skuInfoMap = {};
        if (sku.skuInfoMap) for (const k of Object.keys(sku.skuInfoMap)) {
            const v = sku.skuInfoMap[k];
            out.skuInfoMap[unescapeHtml(k)] = { skuId: v.skuId, specId: v.specId,
                canBookCount: v.canBookCount, saleCount: v.saleCount, specAttrs: unescapeHtml(v.specAttrs) };
        }
    } catch(e) { out.skuError = String(e); }
    try {
        let imgs = d.gallery.fields.offerImgList || [];
        out.images = imgs.map(x => typeof x === 'string' ? x : (x.fullPathImageURI || x.imageURI || x.url || ''));
    } catch(e) {}
    try { if ((!out.images || !out.images.length) && model.offerDetail.imageList) out.images = model.offerDetail.imageList; } catch(e) {}
    try { const a = d.productAttributes && d.productAttributes.fields; if (a) out.attributes = a.attributes || a.list || a; } catch(e) {}
    out._url = location.href;
    return out;
}
"""


def normalize_price(pm):
    if not pm:
        return None
    try:
        cp = pm.get("currentPrices") or pm.get("currentPricesWithOnePiece") or []
        prices = [float(x["price"]) for x in cp if x.get("price")]
        if prices:
            return {"min": min(prices), "max": max(prices), "display": pm.get("priceDisplayType"), "raw": cp}
    except Exception:
        pass
    return {"raw": pm}


def read_1688_urls():
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb["品类选择"]
    items = []
    for row in ws.iter_rows(min_row=2):
        lc = row[3]
        url = lc.hyperlink.target if lc.hyperlink else lc.value
        if url and "1688.com/offer" in str(url):
            m = re.search(r"/offer/(\d+)", str(url))
            clean = f"https://detail.1688.com/offer/{m.group(1)}.html" if m else str(url)
            items.append({"cat1": row[0].value, "cat2": row[1].value, "brand": row[2].value,
                          "offer_id": m.group(1) if m else None, "url": clean})
    return items


async def download_images(page, image_urls, dest_dir):
    dest_dir.mkdir(parents=True, exist_ok=True)
    saved = []
    for idx, url in enumerate(image_urls):
        if not url or not str(url).startswith("http"):
            continue
        try:
            res = await page.evaluate(
                """async (u) => { const r = await fetch(u); if(!r.ok) return {ok:false,status:r.status};
                    const b=await r.arrayBuffer(); let s='';const a=new Uint8Array(b);
                    for(let i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);
                    return {ok:true,b64:btoa(s)}; }""", url)
        except Exception as e:
            saved.append({"src": url, "error": str(e)}); continue
        if not res or not res.get("ok"):
            saved.append({"src": url, "error": f"http {res.get('status') if res else 'none'}"}); continue
        content = base64.b64decode(res["b64"])
        name = Path(urllib.parse.urlparse(url).path).name or f"img_{idx}"
        if "." not in name:
            name += ".jpg"
        (dest_dir / f"{idx:02d}_{name}").write_bytes(content)
        saved.append({"src": url, "file": f"{idx:02d}_{name}", "bytes": len(content)})
        await page.wait_for_timeout(250)
    return saved


async def main():
    from playwright.async_api import async_playwright

    items = read_1688_urls()
    print(f"[INFO] 1688 共 {len(items)} 个；LIMIT={LIMIT}，间隔随机 {DELAY_MIN}-{DELAY_MAX}s")
    PRODUCTS_DIR.mkdir(parents=True, exist_ok=True)

    processed = 0
    async with async_playwright() as p:
        print(f"[MODE] CDP: {CDP}")
        browser = await p.chromium.connect_over_cdp(CDP)
        ctx = browser.contexts[0]
        page = next((pg for pg in ctx.pages if "1688.com" in pg.url), ctx.pages[0] if ctx.pages else None)
        if page is None:
            page = await ctx.new_page()

        for i, item in enumerate(items):
            if processed >= LIMIT:
                print(f"[STOP] 已达 LIMIT={LIMIT}。")
                break
            oid = item["offer_id"]
            pdir = PRODUCTS_DIR / oid
            if (pdir / "data.json").exists():
                print(f"[SKIP] {oid} 已抓过。")
                continue

            print(f"\n[{i+1}/{len(items)}] offer={oid}  {item['cat1']}/{item['cat2']}")
            try:
                await page.goto(item["url"], wait_until="domcontentloaded", timeout=GOTO_TIMEOUT)
                await page.wait_for_timeout(2500)
                await page.mouse.wheel(0, 3000)
                await page.wait_for_timeout(1500)
                data = await page.evaluate(EXTRACT_JS)
                html = await page.content()
            except Exception as e:
                msg = str(e).lower()
                if any(k in msg for k in ("closed", "disconnected", "connection", "target", "crash")):
                    print(f"        [DISCONNECTED] 浏览器断开：{e}。重连后重跑续跑。", file=sys.stderr)
                    break
                print(f"        [SKIP-ERROR] {e} -> 跳过继续。", file=sys.stderr)
                await _sleep(page); continue

            # 检测滑块/风控：拿不到 context.result 或标题为空
            if data.get("error") or not data.get("subject"):
                cur = page.url
                slider = any(k in cur for k in ("punish", "captcha", "sufei"))
                print(f"        [BLOCKED] 未拿到数据（可能弹滑块）。url={cur[:80]}", file=sys.stderr)
                print(f"        已抓 {processed} 个。请在浏览器手动滑过验证码，然后重跑续跑。", file=sys.stderr)
                break

            record = {
                "offer_id": str(data.get("offerId") or oid),
                "title": data.get("subject"),
                "price": normalize_price(data.get("priceModel")),
                "colors": next((pp["values"] for pp in data.get("skuProps", []) if pp["prop"].lower() == "color"), []),
                "sizes": next((pp["values"] for pp in data.get("skuProps", []) if pp["prop"].lower() == "size"), []),
                "sku_props": data.get("skuProps"),
                "sku_combinations": data.get("skuInfoMap"),
                "images": data.get("images", []),
                "attributes": data.get("attributes"),
                "_category": {"cat1": item["cat1"], "cat2": item["cat2"], "brand": item["brand"]},
                "_source_url": page.url,
            }
            pdir.mkdir(parents=True, exist_ok=True)
            (pdir / "raw.html").write_text(html, encoding="utf-8")   # 保留原始 HTML，便于离线重抽
            dl = await download_images(page, record["images"], pdir / "images")
            record["downloaded_images"] = dl
            (pdir / "data.json").write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")

            pm = record["price"] or {}
            print(f"        [OK] {record['title'][:45]} | ¥{pm.get('min')}~{pm.get('max')} | "
                  f"{len(record['colors'])}色 {len(record['sizes'])}码 "
                  f"{len(record['sku_combinations'] or {})}组合 | 图 "
                  f"{len([x for x in dl if 'file' in x])}/{len(record['images'])}")
            processed += 1

            if processed < LIMIT and i < len(items) - 1:
                await _sleep(page)

    print(f"\n=== 1688 BATCH DONE === 本次成功 {processed} 个，输出：{PRODUCTS_DIR}")


async def _sleep(page):
    wait = random.uniform(DELAY_MIN, DELAY_MAX)
    print(f"        ... 随机等待 {wait:.0f}s ...")
    await page.wait_for_timeout(int(wait * 1000))


if __name__ == "__main__":
    asyncio.run(main())
