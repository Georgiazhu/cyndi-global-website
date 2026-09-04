"""
把全部商品（4 个来源目录）导入 D1（products / product_colors / product_skus）。

数据源：scripts/output/ 下的 4 个目录的 data.json：
  products_patagonia/<pid_slug>/data.json
  products_1688/<offer_id>/data.json
  products_taobao/<item_id>/data.json
  products_tmall/<item_id>/data.json

品类从 xlsx 的 hyperlink 匹配 offer_id/item_id/pid 得到 cat1/cat2/brand。
SPU = CY-{GROUP}-{SEQ}，每品类各自从 0001。
SKU = {SPU}-{COLOR}-{SIZE}，Patagonia 用原生色码，其它用 C01。

价格规则：
  Patagonia: 商品统一价 -> 所有 SKU
  1688:      最小起订量单价 -> 所有 SKU；tier_prices_json 保留
  淘宝/天猫: 真·变体价 (skuCore.sku2info) -> 按颜色对应

无库存字段。默认 tiered_pricing=0。

输出：scripts/output/_import_products.sql
用法：
  .crawl-venv/bin/python scripts/import_products_to_d1.py
  npx wrangler d1 execute DB --local --file=scripts/output/_import_products.sql
"""
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import openpyxl

ROOT = Path(__file__).parent
OUT_PATA = ROOT / "output" / "products_patagonia"
OUT_1688 = ROOT / "output" / "products_1688"
OUT_TB   = ROOT / "output" / "products_taobao"
OUT_TM   = ROOT / "output" / "products_tmall"
OUT_SQL  = Path(os.environ.get("OUT_SQL", str(ROOT / "output" / "_import_products.sql")))

# 最新全量 xlsx（含 Apparel/Headwear/Bags/Drinkware 全部品类）
XLSX = os.environ.get("XLSX", "/Users/gufe/Downloads/品类选择表-Drinkware.xlsx").strip()

GROUP_ABBR = {
    "Apparel": "APP", "Headwear": "HW", "Bags": "BAG", "Footwear": "FW",
    "Drinkware": "DRK", "Office": "OFF", "Tech": "TECH",
    "Lifestyle & Outdoor": "LIFE", "Events Essentials": "EVT",
}
# cat2 -> (section_key, section_title, group)
CATEGORY_MAP = {
    # Apparel
    "T-shirts": ("tshirts", "T-shirts", "Apparel"),
    "polo": ("polos", "Polos", "Apparel"),
    "Polos": ("polos", "Polos", "Apparel"),
    "Hoodies & Crewnecks": ("hoodies", "Hoodies & Crewnecks", "Apparel"),
    "Jackets & Outerwear": ("jackets", "Jackets & Outerwear", "Apparel"),
    "Sports Shorts": ("shorts", "Sports Shorts", "Apparel"),
    "Zips": ("zips", "Zips", "Apparel"),
    # Headwear
    "Beanies": ("beanies", "Beanies", "Headwear"),
    "Hats": ("hats", "Hats", "Headwear"),
    "Bucket Hats": ("buckethats", "Bucket Hats", "Headwear"),
    "Visors": ("visors", "Visors", "Headwear"),
    # Footwear
    "Sneakers": ("sneakers", "Sneakers", "Footwear"),
    "Slippers": ("slippers", "Slippers", "Footwear"),
    "Sandals": ("sandals", "Sandals", "Footwear"),
    "Flip Flops & Clogs": ("flipflops", "Flip Flops & Clogs", "Footwear"),
    "Socks": ("socks", "Socks", "Footwear"),
    # Bags
    "Totes": ("totes", "Totes", "Bags"),
    "Backpacks": ("backpacks", "Backpacks", "Bags"),
    "Sling Bags": ("sling", "Sling Bags", "Bags"),
    "Drawstring Bags": ("drawstring", "Drawstring Bags", "Bags"),
    "Luggage": ("luggage", "Luggage", "Bags"),
    # Drinkware
    "Tumblers": ("tumblers", "Tumblers", "Drinkware"),
    "Water Bottles": ("bottles", "Water Bottles", "Drinkware"),
    "Mugs": ("mugs", "Mugs", "Drinkware"),
    "Camp Cups": ("campcups", "Camp Cups", "Drinkware"),
    "Accessories": ("accessories", "Accessories", "Drinkware"),
}
CURRENCY_MAP = {"patagonia": "USD", "1688": "CNY", "taobao": "CNY", "tmall": "CNY"}
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
# 图片路径前缀：本地默认 /images/products（读本地 public）；
# 生产用 R2 公开 URL，设环境变量 IMG_BASE 覆盖，例如：
#   IMG_BASE="https://pub-xxxx.r2.dev/images/products"
IMG_BASE = os.environ.get("IMG_BASE", "/images/products").rstrip("/")


# ---- helpers ----

def sql_str(v):
    if v is None: return "NULL"
    return "'" + str(v).replace("'", "''") + "'"

def sql_num(v):
    if v is None: return "NULL"
    try: return str(float(v))
    except: return "NULL"


def load_xlsx_categories():
    """id -> {cat1, cat2, brand}。id 是 offer_id / item_id / patagonia pid。"""
    wb = openpyxl.load_workbook(XLSX, data_only=False)
    ws = wb["品类选择"]
    by_id = {}
    for row in ws.iter_rows(min_row=2):
        lc = row[3]
        url = lc.hyperlink.target if lc.hyperlink else lc.value
        if not url: continue
        url = str(url)
        # 1688 offer_id
        m = re.search(r"/offer/(\d+)", url)
        if m: by_id[m.group(1)] = {"cat1": row[0].value, "cat2": row[1].value, "brand": row[2].value}
        # taobao/tmall item id
        m = re.search(r"[?&]id=(\d+)", url)
        if m: by_id[m.group(1)] = {"cat1": row[0].value, "cat2": row[1].value, "brand": row[2].value}
        # patagonia pid
        m = re.search(r"/(\d+)\.html", url)
        if m: by_id[m.group(1)] = {"cat1": row[0].value, "cat2": row[1].value, "brand": row[2].value}
    return by_id


SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "OS"]

def norm_size(raw):
    if not raw: return None
    s = str(raw).strip().upper()
    m = re.match(r"^\s*(\d)\s*-?\s*XL", s)
    if m: return f"{m.group(1)}XL"
    if s.startswith("XXL"): return "2XL"
    if s.startswith("XXXL"): return "3XL"
    m = re.match(r"^\s*(XS|S|M|L|XL|ALL|ONE SIZE)\b", s)
    if m: return "OS" if m.group(1) in ("ALL", "ONE SIZE") else m.group(1)
    m = re.match(r"^\s*([A-Z0-9]{1,5})", s)
    return m.group(1) if m else None

def norm_sizes(names):
    out = []
    for n in names:
        s = norm_size(n)
        if s and s not in out: out.append(s)
    return sorted(out, key=lambda x: SIZE_ORDER.index(x) if x in SIZE_ORDER else 99)


def folder_images(folder, d):
    """返回 (default_image, gallery[]) 用本地路径。"""
    di = d.get("downloaded_images") or []
    files = [x["file"] for x in di if "file" in x]
    if not files:
        imgdir = folder / "images"
        if imgdir.exists():
            files = sorted(p.name for p in imgdir.iterdir() if p.is_file())
    if not files: return None, []
    rel = f"{IMG_BASE}/{folder.name}"
    gallery = [f"{rel}/{f}" for f in files]
    return gallery[0], gallery


# ---- source-specific loaders ----

def load_patagonia(xls_cat):
    """Yield normalized product dicts from patagonia data."""
    if not OUT_PATA.exists(): return
    from collections import defaultdict
    for folder in sorted(OUT_PATA.iterdir()):
        dj = folder / "data.json"
        if not dj.exists(): continue
        d = json.load(open(dj, encoding="utf-8"))
        pid = folder.name.split("_")[0]
        cat = d.get("_category") or xls_cat.get(pid, {})
        image, gallery = folder_images(folder, d)
        if not image: continue
        # colors with images grouped by code
        by_code = defaultdict(list)
        for x in (d.get("downloaded_images") or []):
            f = x.get("file")
            if not f: continue
            m_c = re.match(r"\d+_\d+_([A-Z0-9]+)", f)
            if m_c: by_code[m_c.group(1)].append(f"{IMG_BASE}/{folder.name}/{f}")
        colors = []
        for c in (d.get("colors") or []):
            code = c.get("code")
            imgs = by_code.get(code, [])
            if not imgs: continue
            colors.append({"name": c.get("name") or code, "code": code, "swatch": imgs[0], "images": imgs})
        sizes_raw = [s.get("size") or s.get("name") for s in (d.get("sizes") or []) if (s.get("size") or s.get("name"))]
        price = float(d.get("price") or 0)
        yield {
            "source": "patagonia", "source_id": pid, "title": d.get("title", ""),
            "brand": (cat.get("brand") or "Patagonia"), "cat": cat,
            "description": d.get("description", ""), "currency": "USD",
            "image": image, "gallery": gallery, "colors": colors,
            "sizes": norm_sizes(sizes_raw), "base_price": price, "tiers": None,
            "variant_prices": None,  # patagonia: single price
        }


def load_1688(xls_cat):
    if not OUT_1688.exists(): return
    for folder in sorted(OUT_1688.iterdir()):
        dj = folder / "data.json"
        if not dj.exists(): continue
        d = json.load(open(dj, encoding="utf-8"))
        oid = folder.name
        cat = d.get("_category") or xls_cat.get(oid, {})
        image, gallery = folder_images(folder, d)
        if not image: continue
        # colors
        src_to_file = {}
        for x in (d.get("downloaded_images") or []):
            if x.get("file"):
                src_to_file[os.path.basename(x["src"].split("?")[0])] = f"{IMG_BASE}/{folder.name}/{x['file']}"
        colors = []
        for c in (d.get("colors") or []):
            iu = c.get("imageUrl")
            swatch = src_to_file.get(os.path.basename((iu or "").split("?")[0])) if iu else None
            colors.append({"name": c.get("name"), "code": None, "swatch": swatch or (gallery[0] if gallery else None), "images": gallery})
        sizes_raw = [s.get("size") or s.get("name") for s in (d.get("sizes") or []) if (s.get("size") or s.get("name"))]
        # tier pricing
        price_obj = d.get("price") or {}
        raw_tiers = price_obj.get("raw") or [] if isinstance(price_obj, dict) else []
        tiers = []
        for r in raw_tiers:
            try: tiers.append({"beginAmount": int(r["beginAmount"]), "price": float(r["price"])})
            except: continue
        tiers.sort(key=lambda t: t["beginAmount"])
        base = tiers[0]["price"] if tiers else (float(price_obj.get("min") or price_obj.get("max") or 0) if isinstance(price_obj, dict) else 0)
        raw_brand = (cat.get("brand") or "Custom").strip()
        brand = "Custom" if raw_brand in ("定制", "Custom") else raw_brand
        yield {
            "source": "1688", "source_id": oid, "title": d.get("title", ""),
            "brand": brand, "cat": cat,
            "description": "", "currency": "CNY",
            "image": image, "gallery": gallery, "colors": colors if colors else [{"name": "Default", "code": None, "swatch": image, "images": gallery}],
            "sizes": norm_sizes(sizes_raw), "base_price": base,
            "tiers": tiers if len(tiers) > 1 else None,
            "variant_prices": None,
        }


def load_taobao_tmall(out_dir, source_name, xls_cat):
    """Load taobao or tmall products (identical structure)."""
    if not out_dir.exists(): return
    for folder in sorted(out_dir.iterdir()):
        dj = folder / "data.json"
        if not dj.exists(): continue
        d = json.load(open(dj, encoding="utf-8"))
        iid = folder.name
        cat = d.get("_category") or xls_cat.get(iid, {})
        image, gallery = folder_images(folder, d)
        if not image: continue
        # props -> colors; skus -> variant prices keyed by propPath vid
        props = d.get("props") or []
        skus = d.get("skus") or []
        # Build vid -> sku price mapping
        vid_price = {}
        for s in skus:
            pp = s.get("propPath", "")
            parts = pp.split(":")
            vid = parts[-1] if len(parts) >= 2 else pp
            try: vid_price[vid] = float(s.get("priceText") or d.get("base_price") or 0)
            except: pass
        colors = []
        if props:
            for v in props[0].get("values", []):
                name = v.get("name")
                vid = v.get("vid", "")
                img_url = v.get("image")
                # find matching downloaded file for swatch
                swatch = None
                if img_url:
                    bn = os.path.basename(img_url.split("?")[0])
                    for x in (d.get("downloaded_images") or []):
                        if x.get("file") and bn in x.get("src", ""):
                            swatch = f"{IMG_BASE}/{folder.name}/{x['file']}"; break
                colors.append({
                    "name": name, "code": None, "swatch": swatch or image,
                    "images": gallery,
                    "_vid": vid, "_price": vid_price.get(vid),
                })
        if not colors:
            colors = [{"name": "Default", "code": None, "swatch": image, "images": gallery, "_vid": None, "_price": None}]
        base = float(d.get("base_price") or 0)
        raw_brand = (cat.get("brand") or "Custom").strip()
        brand = "Custom" if raw_brand in ("定制", "Custom") else raw_brand
        yield {
            "source": source_name, "source_id": iid, "title": d.get("title", ""),
            "brand": brand, "cat": cat,
            "description": "", "currency": "CNY",
            "image": image, "gallery": gallery, "colors": colors,
            "sizes": ["OS"],  # taobao/tmall: typically no size dimension, just color variants
            "base_price": base, "tiers": None,
            "variant_prices": True,  # flag: use per-color price from _price
        }


# ---- main ----

def main():
    xls_cat = load_xlsx_categories()
    seq_by_group = {}
    lines = []
    n_prod = n_color = n_sku = 0

    all_products = []
    all_products.extend(load_patagonia(xls_cat))
    all_products.extend(load_1688(xls_cat))
    all_products.extend(load_taobao_tmall(OUT_TB, "taobao", xls_cat))
    all_products.extend(load_taobao_tmall(OUT_TM, "tmall", xls_cat))

    for p in all_products:
        cat = p["cat"]
        cat2 = (cat.get("cat2") or "").strip()
        sec = CATEGORY_MAP.get(cat2)
        if not sec:
            continue  # unknown category, skip
        section_key, section_title, group = sec
        abbr = GROUP_ABBR.get(group, "MISC")
        seq_by_group[abbr] = seq_by_group.get(abbr, 0) + 1
        spu = f"CY-{abbr}-{seq_by_group[abbr]:04d}"

        source = p["source"]
        currency = p["currency"]
        base_price = p["base_price"]
        tiers = p.get("tiers")
        tier_json = json.dumps(tiers, ensure_ascii=False) if tiers else None

        sizes = p["sizes"] or ["OS"]
        price_min = base_price
        price_max = base_price

        lines.append(
            "INSERT INTO products (spu,name,brand,group_name,category,category_title,source,source_id,"
            "currency,description,price_min,price_max,default_image,attributes_json,status,tiered_pricing,sort,source_url,"
            "created_at,updated_at) VALUES ("
            f"{sql_str(spu)},{sql_str(p['title'])},{sql_str(p['brand'])},{sql_str(group)},"
            f"{sql_str(section_key)},{sql_str(section_title)},{sql_str(source)},"
            f"{sql_str(p['source_id'])},{sql_str(currency)},"
            f"{sql_str(p['description'])},{sql_num(price_min)},{sql_num(price_max)},"
            f"{sql_str(p['image'])},NULL,'active',0,{n_prod},NULL,{sql_str(NOW)},{sql_str(NOW)});"
        )
        n_prod += 1

        colors = p["colors"]
        for ci, c in enumerate(colors, start=1):
            code = c.get("code") or f"C{ci:02d}"
            if source == "patagonia" and c.get("code"):
                code = c["code"]
            imgs = c.get("images") or []
            swatch = c.get("swatch") or (imgs[0] if imgs else None)
            lines.append(
                "INSERT INTO product_colors (spu,color_name,color_code,swatch,images_json,sort) VALUES ("
                f"{sql_str(spu)},{sql_str(c.get('name'))},{sql_str(code)},{sql_str(swatch)},"
                f"{sql_str(json.dumps(imgs, ensure_ascii=False))},{ci});"
            )
            n_color += 1

            # per-color variant price (taobao/tmall)
            color_price = c.get("_price") if p.get("variant_prices") else None

            for size in sizes:
                sku = f"{spu}-{code}-{size}"
                sku_price = color_price if color_price is not None else base_price
                lines.append(
                    "INSERT INTO product_skus (sku,spu,color_code,color_name,size,price,currency,"
                    "tier_prices_json,status,created_at,updated_at) VALUES ("
                    f"{sql_str(sku)},{sql_str(spu)},{sql_str(code)},{sql_str(c.get('name'))},"
                    f"{sql_str(size)},{sql_num(sku_price)},{sql_str(currency)},{sql_str(tier_json)},"
                    f"'active',{sql_str(NOW)},{sql_str(NOW)});"
                )
                n_sku += 1

    header = ("-- 自动生成，勿手改。由 scripts/import_products_to_d1.py 生成。\n"
              "DELETE FROM product_skus;\nDELETE FROM product_colors;\nDELETE FROM products;\n\n")
    OUT_SQL.parent.mkdir(parents=True, exist_ok=True)
    OUT_SQL.write_text(header + "\n".join(lines) + "\n", encoding="utf-8")
    print(f"生成 SQL -> {OUT_SQL}")
    print(f"  products: {n_prod}  colors: {n_color}  skus: {n_sku}")
    print(f"  SPU 分配: {seq_by_group}")


if __name__ == "__main__":
    main()
