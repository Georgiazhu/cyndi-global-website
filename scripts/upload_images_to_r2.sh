#!/usr/bin/env bash
# 批量上传商品图片到 Cloudflare R2 bucket `cyndi-products`。
# 用你本地已登录的 wrangler（交互式终端直接跑，无需 API token）。
#
# 用法：
#   bash scripts/upload_images_to_r2.sh
#
# R2 key 结构：images/products/<folder>/<file>  （与站点路径 /images/products/... 对齐）
# 断点续传：--skip-existing 跳过已传的（wrangler 无此选项时会覆盖，安全）。

set -u
BUCKET="cyndi-products"
SRC="product-showcase/public/images/products"
REMOTE_PREFIX="images/products"

if [ ! -d "$SRC" ]; then
  echo "找不到 $SRC"; exit 1
fi

total=$(find "$SRC" -type f | wc -l | tr -d ' ')
echo "准备上传 $total 个文件到 R2 bucket=$BUCKET ..."
n=0
fail=0
find "$SRC" -type f | while read -r f; do
  # rel = <folder>/<file>
  rel="${f#$SRC/}"
  key="$REMOTE_PREFIX/$rel"
  n=$((n+1))
  # --remote 传到线上 R2（不加则传本地模拟）
  if npx wrangler r2 object put "$BUCKET/$key" --file="$f" --remote >/dev/null 2>&1; then
    [ $((n % 25)) -eq 0 ] && echo "  [$n/$total] ... $key"
  else
    echo "  [FAIL] $key"
    fail=$((fail+1))
  fi
done
echo "完成。失败数见上方 [FAIL]。"
