#!/bin/bash
# Fetch Patagonia product images for authorized use.
# Reads scripts/patagonia-products.csv (id,color,slug,url) and downloads hi-res
# images into public/images/patagonia/. Rate-limited: 3 products per batch.
# Usage:  bash scripts/fetch-patagonia-images.sh
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CSV="$SCRIPT_DIR/patagonia-products.csv"
OUT_DIR="$PROJECT_DIR/public/images/patagonia"

BATCH_SIZE=3
BATCH_PAUSE=8
IMG_DELAY=1.5
MAX_RETRIES=3
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
VIEWS=("" "_ALTFRONT" "_BK1" "_DTL1")
CDN_BASE="https://www.patagonia.com/dw/image/v2/BDJB_PRD/on/demandware.static/-/Sites-patagonia-master/default/images/hi-res"
IMG_PARAMS="sw=1400&sh=1400&sfrm=png&q=90"

mkdir -p "$OUT_DIR"
[[ -f "$CSV" ]] || { echo "ERROR: manifest not found: $CSV" >&2; exit 1; }

download_one() {
  local url="$1" dest="$2" code attempt=1
  if [[ -s "$dest" ]]; then echo "    skip (exists): $(basename "$dest")"; return 0; fi
  while (( attempt <= MAX_RETRIES )); do
    code=$(curl -sS -L -A "$UA" -w "%{http_code}" -o "$dest" "$url" 2>/dev/null)
    if [[ "$code" == "200" && -s "$dest" ]]; then echo "    ok: $(basename "$dest") ($code)"; return 0; fi
    rm -f "$dest"; (( attempt++ )); sleep 2
  done
  echo "    miss: $(basename "$dest") (last code: ${code:-none})"; return 1
}

count=0
tail -n +2 "$CSV" | while IFS=, read -r id color slug url; do
  [[ -z "$id" ]] && continue
  echo "[$((count+1))] $slug ($id / $color)"
  for view in "${VIEWS[@]}"; do
    src="${CDN_BASE}/${id}_${color}${view}.jpg?${IMG_PARAMS}"
    dest="${OUT_DIR}/${slug}_${color}${view}.jpg"
    download_one "$src" "$dest"
    sleep "$IMG_DELAY"
  done
  count=$((count+1))
  if (( count % BATCH_SIZE == 0 )); then
    echo "--- batch of $BATCH_SIZE done, pausing ${BATCH_PAUSE}s ---"
    sleep "$BATCH_PAUSE"
  fi
done
echo "Done. Images saved to: $OUT_DIR"
