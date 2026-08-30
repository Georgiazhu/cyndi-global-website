"""
把抓取的 50 个商品（products_patagonia + products_1688）转成 store 页需要的商品数据，
按 menuData.js 的 swagCategories 分品类，输出到 product-showcase/src/data/products.js。

字段映射到 ProductCard 需要的结构：
  id, name, brand, image, description, colors[], colorValues?, sizes, price[], quantity[],
  features?, category(用于分组), gallery[]（多图）

图片使用本地已下载的文件（远程 URL 有风控，页面加载会失败）：
  product-showcase/public/images/products/<folder>/<file>
"""
import json
import os
import re
from pathlib import Path

import openpyxl

ROOT = Path(__file__).parent
OUT_PATA = ROOT / "output" / "products_patagonia"
OUT_1688 = ROOT / "output" / "products_1688"
XLSX = "/Users/gufe/Downloads/品类选择表 (1).xlsx"
DATA_JS = ROOT.parent / "product-showcase" / "src" / "data" / "products.js"

# store 页图片的公开路径前缀（public/ 下）
IMG_BASE = "/images/products"

# 品类归一化：cat2 -> (section key, 二级标题, 一级品类 group)
# 一级/二级参考 cyndi.html 的 swagCategories
CATEGORY_MAP = {
    "T-shirts": ("tshirts", "T-shirts", "Apparel"),
    "polo": ("polos", "Polos", "Apparel"),
    "Polos": ("polos", "Polos", "Apparel"),
    "Hoodies & Crewnecks": ("hoodies", "Hoodies & Crewnecks", "Apparel"),
    "Jackets & Outerwear": ("jackets", "Jackets & Outerwear", "Apparel"),
    "Sports Shorts": ("shorts", "Sports Shorts", "Apparel"),
    "Beanies": ("beanies", "Beanies", "Headwear"),
}
# 一级品类展示顺序 + 其下二级 section 顺序
GROUP_ORDER = [
    ("Apparel", ["tshirts", "polos", "hoodies", "jackets", "shorts"]),
    ("Headwear", ["beanies"]),
]
SECTION_ORDER = [s for _, secs in GROUP_ORDER for s in secs]


def load_xlsx_categories():
    """offer_id / patagonia pid -> {cat1, cat2}，用于给 1688（缺 _category）补分类。"""
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb["品类选择"]
    by_id = {}
    for row in ws.iter_rows(min_row=2):
        lc = row[3]
        url = lc.hyperlink.target if lc.hyperlink else lc.value
        if not url:
            continue
        m = re.search(r"/offer/(\d+)", str(url)) or re.search(r"/(\d+)\.html", str(url))
        if m:
            by_id[m.group(1)] = {"cat1": row[0].value, "cat2": row[1].value, "brand": row[2].value}
    return by_id


def folder_first_image(folder: Path, data: dict):
    """返回该商品所有图的 store 公开路径列表（用本地下载文件）。"""
    di = data.get("downloaded_images") or []
    files = [x["file"] for x in di if "file" in x]
    if not files:
        imgdir = folder / "images"
        if imgdir.exists():
            files = sorted(p.name for p in imgdir.iterdir() if p.is_file())
    if not files:
        return None, []
    rel = f"{IMG_BASE}/{folder.name}"
    gallery = [f"{rel}/{f}" for f in files]
    return gallery[0], gallery


def build_color_options(folder: Path, data: dict, gallery: list, is_1688: bool):
    """生成 colorOptions[{name, code, swatch, images[]}]，把颜色和图片对应起来。"""
    rel = f"{IMG_BASE}/{folder.name}"
    colors = data.get("colors") or []
    di = data.get("downloaded_images") or []
    opts = []

    if not is_1688:
        # Patagonia：图片文件名 NN_<pid>_<CODE>[_scene].jpg，按颜色码分组
        from collections import defaultdict
        by_code = defaultdict(list)
        for x in di:
            f = x.get("file")
            if not f:
                continue
            m = re.match(r"\d+_\d+_([A-Z0-9]+)", f)
            if m:
                by_code[m.group(1)].append(f"{rel}/{f}")
        for c in colors:
            code = c.get("code")
            imgs = by_code.get(code) or []
            if not imgs:
                continue
            opts.append({
                "name": c.get("name") or code,
                "code": code,
                "swatch": imgs[0],   # 该颜色第一张作 swatch
                "images": imgs,
            })
    else:
        # 1688：颜色 swatch = imageUrl basename 匹配的下载文件；主图画廊各颜色共用
        # 建 src->本地路径 映射
        src_to_file = {}
        for x in di:
            if x.get("file"):
                src_to_file[os.path.basename(x["src"].split("?")[0])] = f"{rel}/{x['file']}"
        for c in colors:
            iu = c.get("imageUrl")
            swatch = None
            if iu:
                swatch = src_to_file.get(os.path.basename(iu.split("?")[0]))
            opts.append({
                "name": c.get("name"),
                "code": None,
                "swatch": swatch or (gallery[0] if gallery else None),
                "images": gallery,   # 1688 主图不分颜色，全颜色共用画廊
            })
    return opts


SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "ONE SIZE"]


def norm_size(raw: str):
    """把杂乱尺寸归一化到标准码。
    '3xl recommended 100-105kg' -> '3XL'; 'M recommendation 60-70kg' -> 'M'; 'XS'->'XS'."""
    if not raw:
        return None
    s = str(raw).strip().upper()
    # 先抓 2XL/3XL/4XL/XXL 之类
    m = re.match(r"^\s*(\d)\s*[- ]?\s*XL", s) or re.match(r"^\s*([2-5])XL", s)
    if m:
        return f"{m.group(1)}XL"
    if s.startswith("XXL"):
        return "2XL"
    if s.startswith("XXXL"):
        return "3XL"
    # 标准单字母/XL/XS 开头
    m = re.match(r"^\s*(XS|S|M|L|XL)\b", s)
    if m:
        return m.group(1)
    # 兜底：取开头连续字母
    m = re.match(r"^\s*([A-Z]{1,3})", s)
    return m.group(1) if m else None


def norm_sizes(size_names):
    """归一化 + 去重 + 按标准顺序排序。"""
    out = []
    for sz in size_names:
        n = norm_size(sz)
        if n and n not in out:
            out.append(n)
    return sorted(out, key=lambda x: SIZE_ORDER.index(x) if x in SIZE_ORDER else 99)


def norm_price(price):
    """统一成 ['40.00'] 形式的字符串数组。
    price 可能是: 数字(49)、数字字符串('99', Patagonia)、区间对象({min,max}, 1688)。"""
    # 数字或数字字符串
    if isinstance(price, (int, float, str)):
        try:
            return [f"{float(price):.2f}"]
        except (ValueError, TypeError):
            return ["0.00"]
    if isinstance(price, dict):
        mn = price.get("min")
        mx = price.get("max")
        if mn is not None:
            return [f"{float(mn):.2f}"] if mn == mx or mx is None else [f"{float(mn):.2f}", f"{float(mx):.2f}"]
    return ["0.00"]


def build():
    xls_cat = load_xlsx_categories()
    products = []
    pid_counter = 0

    def add_dir(base: Path, brand_default: str, is_1688: bool):
        nonlocal pid_counter
        if not base.exists():
            return
        for folder in sorted(base.iterdir()):
            if not folder.is_dir():
                continue
            dj = folder / "data.json"
            if not dj.exists():
                continue
            d = json.load(open(dj, encoding="utf-8"))

            # 分类
            cat = d.get("_category")
            if not cat or not cat.get("cat2"):
                # 1688 或缺分类：按 id 从 xlsx 补
                key = folder.name.split("_")[0]
                cat = xls_cat.get(key) or {"cat1": "Apparel", "cat2": "T-shirts", "brand": brand_default}
            cat2 = cat.get("cat2")
            section = CATEGORY_MAP.get(cat2)
            if not section:
                continue  # 不在已知品类里，跳过
            section_key, section_title, group_title = section

            image, gallery = folder_first_image(folder, d)
            if not image:
                continue

            colors = d.get("colors") or []
            color_names = [c.get("name") for c in colors if c.get("name")]
            sizes = d.get("sizes") or []
            size_names = [s.get("size") or s.get("name") for s in sizes if (s.get("size") or s.get("name"))]
            color_options = build_color_options(folder, d, gallery, is_1688)

            raw_brand = (cat.get("brand") or brand_default).strip()
            brand_display = "Custom" if raw_brand in ("定制", "Custom") else raw_brand.title()

            pid_counter += 1
            products.append({
                "id": pid_counter,
                "name": (d.get("title") or "").strip(),
                "brand": brand_display,
                "image": image,                       # 默认主图（第一个颜色）
                "gallery": gallery,                   # 全部图
                "colorOptions": color_options,        # [{name, code, swatch, images[]}]
                "description": (d.get("description") or "").strip(),
                "colors": color_names or ["Default"],
                "sizeList": size_names,               # 原始尺码数组（PDP 展示用）
                "sizeNorm": norm_sizes(size_names),   # 归一化尺码（筛选用: XS/S/M/L/XL/2XL...）
                "sizes": ", ".join(size_names) if size_names else "",
                "price": norm_price(d.get("price")),
                "quantity": [1],
                "category": section_key,
                "categoryTitle": section_title,
                "group": group_title,
                "source": "1688" if is_1688 else "patagonia",
            })

    add_dir(OUT_PATA, "Patagonia", is_1688=False)
    add_dir(OUT_1688, "Custom", is_1688=True)

    # 生成 products.js
    DATA_JS.parent.mkdir(parents=True, exist_ok=True)
    header = ("// 自动生成，请勿手改。由 scripts/build_store_products.py 从抓取数据生成。\n"
              "// 商品图片在 product-showcase/public/images/products/<folder>/\n\n")
    body = "export const products = " + json.dumps(products, ensure_ascii=False, indent=2) + "\n\n"

    # 扁平 sectionOrder（兼容）
    flat = [{"key": k, "title": next((p["categoryTitle"] for p in products if p["category"] == k), k)}
            for k in SECTION_ORDER if any(p["category"] == k for p in products)]
    sections = "export const sectionOrder = " + json.dumps(flat, ensure_ascii=False, indent=2) + "\n\n"

    # 分组 groupOrder：一级品类 -> 其下二级 sections（含每个 section 商品数）
    groups = []
    for group_title, secs in GROUP_ORDER:
        section_list = []
        for k in secs:
            items = [p for p in products if p["category"] == k]
            if items:
                section_list.append({"key": k, "title": items[0]["categoryTitle"], "count": len(items)})
        if section_list:
            groups.append({"group": group_title, "sections": section_list})
    group_js = "export const groupOrder = " + json.dumps(groups, ensure_ascii=False, indent=2) + "\n"

    DATA_JS.write_text(header + body + sections + group_js, encoding="utf-8")

    # 统计
    from collections import Counter
    cnt = Counter(p["category"] for p in products)
    print(f"生成 {len(products)} 个商品 -> {DATA_JS}")
    for k in SECTION_ORDER:
        if cnt.get(k):
            print(f"  {k}: {cnt[k]}")


if __name__ == "__main__":
    build()
