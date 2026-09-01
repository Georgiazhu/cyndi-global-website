"""
把商品导入 D1（products / product_colors / product_skus）。

数据源：product-showcase/src/data/products.js（已解析好颜色/图片/尺码/价格）。
1688 的阶梯价明细回 scripts/output/products_1688/<offer_id>/data.json 补。

生成 SPU（CY-{GROUP}-{SEQ}，每品类从 0001）、颜色码、SKU（{spu}-{COLOR}-{SIZE}，无尺码→OS）。
无库存字段。价格：Patagonia 统一价；1688 取阶梯最小起订量单价 + tier_prices。

输出：scripts/output/_import_products.sql（可审查），再由调用方 wrangler d1 execute 应用。

用法：
  .crawl-venv/bin/python scripts/import_products_to_d1.py
  # 然后： npx wrangler d1 execute DB --local --file=scripts/output/_import_products.sql
"""
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent
PRODUCTS_JS = ROOT.parent / "product-showcase" / "src" / "data" / "products.js"
OUT_1688 = ROOT / "output" / "products_1688"
OUT_SQL = ROOT / "output" / "_import_products.sql"

# 一级品类 -> SPU 缩写
GROUP_ABBR = {
    "Apparel": "APP", "Headwear": "HW", "Bags": "BAG", "Footwear": "FW",
    "Drinkware": "DRK", "Office": "OFF", "Tech": "TECH",
    "Lifestyle & Outdoor": "LIFE", "Events Essentials": "EVT",
}
CURRENCY = {"patagonia": "USD", "1688": "CNY", "taobao": "CNY", "tmall": "CNY"}

NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_products_js():
    txt = PRODUCTS_JS.read_text(encoding="utf-8")
    m = re.search(r'export const products = (\[.*?\])\n\nexport const sectionOrder', txt, re.S)
    if not m:
        raise SystemExit("无法从 products.js 解析 products 数组")
    return json.loads(m.group(1))


def offer_id_from_folder(path_in_image):
    """从图片路径 /images/products/<folder>/... 取 folder（1688 是纯 offer_id）。"""
    m = re.search(r"/images/products/([^/]+)/", path_in_image or "")
    return m.group(1) if m else None


def load_1688_tier(offer_id):
    """回原始 data.json 取 1688 阶梯价 -> (min_price, tier_list)。"""
    dj = OUT_1688 / str(offer_id) / "data.json"
    if not dj.exists():
        return None, None
    d = json.load(open(dj, encoding="utf-8"))
    price = d.get("price")
    if not isinstance(price, dict):
        return None, None
    raw = price.get("raw") or []
    tiers = []
    for r in raw:
        try:
            tiers.append({"beginAmount": int(r.get("beginAmount")), "price": float(r.get("price"))})
        except (TypeError, ValueError):
            continue
    if not tiers:
        return price.get("min"), None
    tiers.sort(key=lambda t: t["beginAmount"])
    min_qty_price = tiers[0]["price"]
    return min_qty_price, tiers


def color_code_for(opt, source, seq):
    """颜色码：Patagonia 用原生 code，其它按顺序 C01/C02。"""
    if source == "patagonia" and opt.get("code"):
        return opt["code"]
    return f"C{seq:02d}"


def sql_str(v):
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def sql_num(v):
    if v is None:
        return "NULL"
    try:
        return str(float(v))
    except (TypeError, ValueError):
        return "NULL"


def main():
    products = load_products_js()
    seq_by_group = {}
    lines = []
    n_prod = n_color = n_sku = 0

    for p in products:
        group = p.get("group") or "Apparel"
        abbr = GROUP_ABBR.get(group, "MISC")
        seq_by_group[abbr] = seq_by_group.get(abbr, 0) + 1
        spu = f"CY-{abbr}-{seq_by_group[abbr]:04d}"

        source = p.get("source") or "patagonia"
        currency = CURRENCY.get(source, "USD")
        price_arr = p.get("price") or []
        try:
            price_vals = [float(x) for x in price_arr]
        except (TypeError, ValueError):
            price_vals = []

        # 1688 阶梯价 -> 起订价 + tiers
        tiers = None
        base_price = price_vals[0] if price_vals else None
        if source == "1688":
            oid = offer_id_from_folder(p.get("image"))
            mp, tl = load_1688_tier(oid)
            if mp is not None:
                base_price = float(mp)
            tiers = tl

        # 尺码：sizeNorm 为空 -> ['OS']
        sizes = p.get("sizeNorm") or []
        if not sizes:
            sizes = ["OS"]

        # 默认单一定价：price_min/max = 每个 SKU 的价(base_price，即起订价)。
        # 阶梯明细保留在 tier_prices_json，开关打开时才用区间。
        price_min = base_price
        price_max = base_price

        # products
        lines.append(
            "INSERT INTO products (spu,name,brand,group_name,category,category_title,source,source_id,"
            "currency,description,price_min,price_max,default_image,attributes_json,status,tiered_pricing,sort,source_url,"
            "created_at,updated_at) VALUES ("
            f"{sql_str(spu)},{sql_str(p.get('name'))},{sql_str(p.get('brand'))},{sql_str(group)},"
            f"{sql_str(p.get('category'))},{sql_str(p.get('categoryTitle'))},{sql_str(source)},"
            f"{sql_str(offer_id_from_folder(p.get('image')))},{sql_str(currency)},"
            f"{sql_str(p.get('description'))},{sql_num(price_min)},{sql_num(price_max)},"
            f"{sql_str(p.get('image'))},NULL,'active',0,{n_prod},NULL,{sql_str(NOW)},{sql_str(NOW)});"
        )
        n_prod += 1

        color_opts = p.get("colorOptions") or []
        if not color_opts:
            color_opts = [{"name": (p.get("colors") or ["Default"])[0], "code": None,
                           "swatch": p.get("image"), "images": p.get("gallery") or []}]

        tier_json = json.dumps(tiers, ensure_ascii=False) if tiers else None

        for ci, opt in enumerate(color_opts, start=1):
            code = color_code_for(opt, source, ci)
            imgs = opt.get("images") or []
            lines.append(
                "INSERT INTO product_colors (spu,color_name,color_code,swatch,images_json,sort) VALUES ("
                f"{sql_str(spu)},{sql_str(opt.get('name'))},{sql_str(code)},{sql_str(opt.get('swatch'))},"
                f"{sql_str(json.dumps(imgs, ensure_ascii=False))},{ci});"
            )
            n_color += 1

            for size in sizes:
                sku = f"{spu}-{code}-{size}"
                lines.append(
                    "INSERT INTO product_skus (sku,spu,color_code,color_name,size,price,currency,"
                    "tier_prices_json,status,created_at,updated_at) VALUES ("
                    f"{sql_str(sku)},{sql_str(spu)},{sql_str(code)},{sql_str(opt.get('name'))},"
                    f"{sql_str(size)},{sql_num(base_price)},{sql_str(currency)},{sql_str(tier_json)},"
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
