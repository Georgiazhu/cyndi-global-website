"""
1688 商品页抓取 —— 从 window.context 运行时对象直接读结构化数据。

与 Patagonia 不同：1688 数据不在 DOM 属性里，而在 JS 运行时对象 window.context 下。
故用 page.evaluate 直接读（比解析 HTML 里的巨型 JSON 干净可靠）。

数据路径（探路确认）：
  标题     context.result.data.gallery.fields.subject
  图片     context.result.data.gallery.fields.offerImgList
  SKU      context.result.data.Root.fields.dataJson.skuModel  (skuProps + skuInfoMap)
  价格     context.result.data.mainPrice.fields.priceModel
  详情     context.result.global.globalData.model.offerDetail

【前提】1688 有滑块验证码。必须：
  1. 手动开带调试端口的浏览器打开 1688 商品页
  2. 手动滑过验证码，确认商品页正常
  3. 保持窗口打开，本脚本 CDP 连接复用会话（不重新导航，避免再触发滑块）

用法：
  # 单个（复用当前已打开且验证通过的标签）
  PATAGONIA_CDP=http://localhost:9222 .crawl-venv/bin/python scripts/crawl_1688.py

  # 指定 URL（会导航，可能触发滑块，需你手动过）
  URL_1688="https://detail.1688.com/offer/xxx.html" PATAGONIA_CDP=... python scripts/crawl_1688.py

输出：scripts/output/products_1688/<offerId>/data.json + images/
"""
import asyncio
import base64
import json
import os
import re
import sys
import urllib.parse
from pathlib import Path

CDP = os.environ.get("PATAGONIA_CDP", "http://localhost:9222").strip()
URL_1688 = os.environ.get("URL_1688", "").strip()   # 给了就导航到它；否则复用当前 1688 标签
DOWNLOAD_IMAGES = os.environ.get("DOWNLOAD_IMAGES", "1").strip() not in ("0", "false", "no")

OUTPUT_DIR = Path(__file__).parent / "output"
PRODUCTS_DIR = OUTPUT_DIR / "products_1688"

# 在浏览器里读取 window.context 的抽取脚本
EXTRACT_JS = r"""
() => {
    const unescapeHtml = (s) => typeof s === 'string'
        ? s.replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&amp;/g,'&').replace(/&quot;/g,'"') : s;
    const c = window.context && window.context.result;
    if (!c) return { error: 'no window.context.result' };
    const d = c.data || {};
    const model = (c.global && c.global.globalData && c.global.globalData.model) || {};
    const out = {};

    // 标题
    try { out.subject = d.gallery.fields.subject; } catch(e) {}
    try { if (!out.subject) out.subject = model.offerDetail.subject; } catch(e) {}

    // offerId
    try { out.offerId = model.offerDetail.offerId; } catch(e) {}

    // 价格
    try {
        const pm = d.mainPrice.fields.priceModel;
        out.priceModel = {
            priceDisplayType: pm.priceDisplayType,
            currentPrices: pm.currentPrices,
            currentPricesWithOnePiece: pm.currentPricesWithOnePiece,
            advRate: pm.priceAdv && pm.priceAdv.advRate,
        };
    } catch(e) {}

    // SKU：颜色 / 尺码 / 组合库存价格
    try {
        const sku = d.Root.fields.dataJson.skuModel;
        out.skuProps = (sku.skuProps || []).map(p => ({
            prop: p.prop,
            values: (p.value || []).map(v => ({ name: unescapeHtml(v.name), imageUrl: v.imageUrl || null })),
        }));
        out.skuInfoMap = {};
        if (sku.skuInfoMap) {
            for (const k of Object.keys(sku.skuInfoMap)) {
                const v = sku.skuInfoMap[k];
                out.skuInfoMap[unescapeHtml(k)] = {
                    skuId: v.skuId, specId: v.specId,
                    canBookCount: v.canBookCount, saleCount: v.saleCount,
                    specAttrs: unescapeHtml(v.specAttrs),
                };
            }
        }
    } catch(e) { out.skuError = String(e); }

    // 图片
    try {
        let imgs = d.gallery.fields.offerImgList || [];
        out.images = imgs.map(x => typeof x === 'string' ? x : (x.fullPathImageURI || x.imageURI || x.url || JSON.stringify(x)));
    } catch(e) {}
    try { if ((!out.images || !out.images.length) && model.offerDetail.imageList)
        out.images = model.offerDetail.imageList; } catch(e) {}

    // 商品属性/描述
    try {
        const attrs = d.productAttributes && d.productAttributes.fields;
        if (attrs) out.attributes = attrs.attributes || attrs.list || attrs;
    } catch(e) {}

    out._url = location.href;
    return out;
}
"""


def normalize_price(pm):
    """从 priceModel 提出简明价格。"""
    if not pm:
        return None
    try:
        cp = pm.get("currentPrices") or pm.get("currentPricesWithOnePiece") or []
        if cp:
            prices = [float(x["price"]) for x in cp if x.get("price")]
            if prices:
                return {"min": min(prices), "max": max(prices), "raw": cp,
                        "display": pm.get("priceDisplayType")}
    except Exception:
        pass
    return {"raw": pm}


async def download_images(page, image_urls, dest_dir):
    dest_dir.mkdir(parents=True, exist_ok=True)
    saved = []
    for idx, url in enumerate(image_urls):
        if not url or not str(url).startswith("http"):
            continue
        try:
            res = await page.evaluate(
                """async (u) => {
                    const resp = await fetch(u);
                    if (!resp.ok) return { ok:false, status: resp.status };
                    const buf = await resp.arrayBuffer();
                    let b=''; const a=new Uint8Array(buf);
                    for (let i=0;i<a.length;i++) b+=String.fromCharCode(a[i]);
                    return { ok:true, b64: btoa(b), type: resp.headers.get('content-type') };
                }""", url)
        except Exception as e:
            saved.append({"src": url, "error": f"evaluate: {e}"}); continue
        if not res or not res.get("ok"):
            saved.append({"src": url, "error": f"http {res.get('status') if res else 'none'}"}); continue
        content = base64.b64decode(res["b64"])
        name = Path(urllib.parse.urlparse(url).path).name or f"img_{idx}"
        if "." not in name:
            name += ".jpg"
        dest = dest_dir / f"{idx:02d}_{name}"
        dest.write_bytes(content)
        saved.append({"src": url, "file": dest.name, "bytes": len(content)})
        await page.wait_for_timeout(300)
    return saved


async def main():
    from playwright.async_api import async_playwright
    print(f"[MODE] CDP: {CDP}")
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(CDP)
        ctx = browser.contexts[0] if browser.contexts else await browser.new_context()

        # 找已打开的 1688 标签；或按 URL_1688 导航
        page = None
        for pg in ctx.pages:
            if "1688.com/offer" in pg.url:
                page = pg; break
        if page is None:
            page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        if URL_1688:
            print(f"[GOTO] {URL_1688}（可能触发滑块，需手动过）")
            await page.goto(URL_1688, wait_until="domcontentloaded", timeout=90000)
            await page.wait_for_timeout(3000)
        else:
            print(f"[REUSE] 复用标签: {page.url[:80]}")

        # 读运行时数据
        data = await page.evaluate(EXTRACT_JS)
        if data.get("error"):
            print(f"FAILED: {data['error']}（页面可能未加载完/被验证码挡）", file=sys.stderr)
            return

        offer_id = str(data.get("offerId") or re.search(r"/offer/(\d+)", page.url).group(1))
        record = {
            "offer_id": offer_id,
            "title": data.get("subject"),
            "price": normalize_price(data.get("priceModel")),
            "colors": next((p["values"] for p in data.get("skuProps", []) if p["prop"].lower() == "color"), []),
            "sizes": next((p["values"] for p in data.get("skuProps", []) if p["prop"].lower() == "size"), []),
            "sku_props": data.get("skuProps"),
            "sku_combinations": data.get("skuInfoMap"),
            "images": data.get("images", []),
            "attributes": data.get("attributes"),
            "_source_url": page.url,
        }

        pdir = PRODUCTS_DIR / offer_id
        pdir.mkdir(parents=True, exist_ok=True)
        try:
            (pdir / "raw.html").write_text(await page.content(), encoding="utf-8")  # 保留原始 HTML
        except Exception:
            pass

        downloaded = []
        if DOWNLOAD_IMAGES and record["images"]:
            downloaded = await download_images(page, record["images"], pdir / "images")
            record["downloaded_images"] = downloaded

        (pdir / "data.json").write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")

        pm = record["price"] or {}
        print(f"\n=== OFFER {offer_id} ===")
        print(f"标题: {record['title']}")
        print(f"价格: {pm.get('min')}~{pm.get('max')} ({pm.get('display')})")
        print(f"颜色: {len(record['colors'])} | 尺码: {len(record['sizes'])} | "
              f"SKU组合: {len(record['sku_combinations'] or {})} | 图片: {len(record['images'])}")
        print(f"图片下载: {len([d for d in downloaded if 'file' in d])}/{len(record['images'])}")
        print(f"保存: {pdir}")


if __name__ == "__main__":
    asyncio.run(main())
