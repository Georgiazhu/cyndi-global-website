"""
淘宝批量抓取 —— 从 品类选择表-bags.xlsx 读 item.taobao.com URL，CDP 复用你已登录的会话。

【前提】先在带调试端口(9222)的浏览器里登录淘宝、打开任一商品页，保持登录。
（淘宝商品详情必须登录态才能访问。）

数据来源：淘宝 PC 详情页 SSR 注入的 ICE 数据 —— 页面 HTML 里有
  !(function(){var a=window.__ICE_APP_CONTEXT__||{};var b = {...};...})()
其中 b.loaderData.home.data.res 含：
  res.item.title / res.item.images / res.item.itemId,spuId
  res.skuBase.props[] (颜色/尺码属性) / res.skuBase.skus[] (propPath<->skuId)
  res.skuCore.sku2info[skuId].price.{priceText,priceMoney,priceDesc} (分变体价)
  res.skuCore.sku2info[skuId].quantity (分变体库存)

用法：
  LIMIT=2 PATAGONIA_CDP=http://localhost:9222 \
    XLSX="/Users/gufe/Downloads/品类选择表-bags.xlsx" \
    .crawl-venv/bin/python scripts/crawl_taobao_batch.py

环境变量：LIMIT / DELAY_MIN / DELAY_MAX / GOTO_TIMEOUT / PATAGONIA_CDP / XLSX

输出：scripts/output/products_taobao/<itemId>/data.json + raw.html + images/
断点续跑：已抓过(存在 data.json)的自动跳过。
【复用你已打开的淘宝标签导航，绝不新开/关闭其它标签。】

【使用前必读】仅用于内部数据模型调研；遵守目标站 robots.txt 与 ToS，控制访问频率。
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

XLSX = os.environ.get("XLSX", "/Users/gufe/Downloads/品类选择表-bags.xlsx").strip()
CDP = os.environ.get("PATAGONIA_CDP", "http://localhost:9222").strip()
LIMIT = int(os.environ.get("LIMIT", "2"))
DELAY_MIN = float(os.environ.get("DELAY_MIN", "120"))
DELAY_MAX = float(os.environ.get("DELAY_MAX", "180"))
GOTO_TIMEOUT = int(os.environ.get("GOTO_TIMEOUT", "90000"))

OUTPUT_DIR = Path(__file__).parent / "output"
PRODUCTS_DIR = OUTPUT_DIR / "products_taobao"


def read_taobao_urls():
    wb = openpyxl.load_workbook(XLSX, data_only=False)
    ws = wb["品类选择"]
    items = []
    for row in ws.iter_rows(min_row=2):
        lc = row[3]
        url = lc.hyperlink.target if lc.hyperlink else lc.value
        if url and "taobao.com" in str(url):
            m = re.search(r"[?&]id=(\d+)", str(url))
            iid = m.group(1) if m else None
            clean = f"https://item.taobao.com/item.htm?id={iid}" if iid else str(url)
            items.append({"cat1": row[0].value, "cat2": row[1].value, "brand": row[2].value,
                          "item_id": iid, "url": clean})
    return items


def extract_res_from_html(html):
    """从淘宝详情页 HTML 提取 SSR 的 var b={...} 并返回 loaderData.home.data.res。"""
    m = re.search(r'var a = window\.__ICE_APP_CONTEXT__ \|\| \{\};var b = ', html)
    if not m:
        return None
    start = m.end()
    depth = 0
    i = start
    instr = False
    esc = False
    end = None
    while i < len(html):
        ch = html[i]
        if instr:
            if esc:
                esc = False
            elif ch == '\\':
                esc = True
            elif ch == '"':
                instr = False
        else:
            if ch == '"':
                instr = True
            elif ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        i += 1
    if end is None:
        return None
    try:
        b = json.loads(html[start:end])
        return b.get("loaderData", {}).get("home", {}).get("data", {}).get("res", {})
    except Exception:
        return None


def build_record(res, item):
    it = res.get("item", {}) or {}
    sku_base = res.get("skuBase", {}) or {}
    sku_core = res.get("skuCore", {}) or {}
    sku2info = sku_core.get("sku2info", {}) or {}

    # 属性(颜色/尺码): props[{name, values:[{name, vid, image}]}]
    props = []
    for pr in sku_base.get("props", []) or []:
        props.append({
            "name": pr.get("name"),
            "pid": pr.get("pid"),
            "values": [{"name": v.get("name"), "vid": v.get("vid"), "image": v.get("image")}
                       for v in (pr.get("values") or [])],
        })

    # SKU 组合: skus[{propPath, skuId}] + sku2info 里的价/量
    skus = []
    for s in sku_base.get("skus", []) or []:
        sid = str(s.get("skuId"))
        info = sku2info.get(sid, {}) or {}
        price = info.get("price", {}) or {}
        skus.append({
            "skuId": sid,
            "propPath": s.get("propPath"),
            "priceText": price.get("priceText"),
            "priceMoney": price.get("priceMoney"),  # 分
            "quantity": info.get("quantity"),
        })

    # 起始价(skuId=0 兜底)
    base_price = None
    if "0" in sku2info:
        base_price = (sku2info["0"].get("price") or {}).get("priceText")

    images = it.get("images", []) or []
    # 补协议头
    images = [("https:" + u) if u.startswith("//") else u for u in images]

    return {
        "item_id": str(it.get("itemId") or item.get("item_id")),
        "spu_id": it.get("spuId"),
        "title": it.get("title"),
        "base_price": base_price,
        "props": props,
        "skus": skus,
        "images": images,
        "_category": {"cat1": item["cat1"], "cat2": item["cat2"], "brand": item["brand"]},
        "_source_url": item["url"],
    }


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
            saved.append({"src": url, "error": str(e)})
            continue
        if not res or not res.get("ok"):
            saved.append({"src": url, "error": f"http {res.get('status') if res else 'none'}"})
            continue
        content = base64.b64decode(res["b64"])
        name = Path(urllib.parse.urlparse(url).path).name or f"img_{idx}"
        if "." not in name:
            name += ".jpg"
        (dest_dir / f"{idx:02d}_{name}").write_bytes(content)
        saved.append({"src": url, "file": f"{idx:02d}_{name}", "bytes": len(content)})
        await page.wait_for_timeout(250)
    return saved


async def _sleep(page):
    d = random.uniform(DELAY_MIN, DELAY_MAX)
    print(f"        [WAIT] {d:.0f}s ...")
    await page.wait_for_timeout(int(d * 1000))


async def main():
    from playwright.async_api import async_playwright

    items = read_taobao_urls()
    print(f"[INFO] 淘宝共 {len(items)} 个；LIMIT={LIMIT}，间隔随机 {DELAY_MIN}-{DELAY_MAX}s")
    PRODUCTS_DIR.mkdir(parents=True, exist_ok=True)

    processed = 0
    async with async_playwright() as p:
        print(f"[MODE] CDP: {CDP}")
        browser = await p.chromium.connect_over_cdp(CDP)
        ctx = browser.contexts[0]
        # 复用已打开的淘宝商品标签(不新开/不关闭其它标签)；天猫标签也可复用(同阿里登录)
        page = next((pg for pg in ctx.pages if "taobao.com/item" in pg.url and "login" not in pg.url), None)
        if page is None:
            page = next((pg for pg in ctx.pages if "taobao.com" in pg.url), None)
        if page is None:
            page = next((pg for pg in ctx.pages if "tmall.com" in pg.url and "login" not in pg.url), None)
        if page is None:
            print("[ERR] 浏览器里没有淘宝/天猫标签页。请先在 9222 浏览器登录并打开一个商品页。", file=sys.stderr)
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

            # 登录/风控检测
            if "login.taobao.com" in page.url or "_____tmd_____" in page.url:
                print(f"        [BLOCKED] 被要求登录/验证。url={page.url[:80]}", file=sys.stderr)
                print(f"        已抓 {processed} 个。请在浏览器确认登录态后重跑续跑。", file=sys.stderr)
                break

            res = extract_res_from_html(html)
            if not res or not (res.get("item") or {}).get("title"):
                print(f"        [BLOCKED/EMPTY] 未解析到商品数据(res 空)。url={page.url[:80]}", file=sys.stderr)
                print(f"        已抓 {processed} 个。可能页面结构变化或未就绪；请确认页面正常后重跑。", file=sys.stderr)
                break

            record = build_record(res, item)
            pdir.mkdir(parents=True, exist_ok=True)
            (pdir / "raw.html").write_text(html, encoding="utf-8")   # 保留原始 HTML
            dl = await download_images(page, record["images"], pdir / "images")
            record["downloaded_images"] = dl
            (pdir / "data.json").write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")

            n_ok = len([x for x in dl if "file" in x])
            print(f"        [OK] {record['title'][:42]} | 起￥{record.get('base_price')} | "
                  f"{len(record['props'])}属性 {len(record['skus'])}SKU | 图 {n_ok}/{len(record['images'])}")
            processed += 1

            if processed < LIMIT and i < len(items) - 1:
                await _sleep(page)

    print(f"\n=== TAOBAO BATCH DONE === 本次成功 {processed} 个，输出：{PRODUCTS_DIR}")


if __name__ == "__main__":
    asyncio.run(main())
