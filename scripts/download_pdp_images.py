"""
独立图片下载脚本：从已抓好的 patagonia_pdp.json 读取图片 URL，
用 Playwright + 持久化 profile 会话在浏览器上下文内 fetch 图片（能过 Akamai 边缘），
存到 scripts/output/pdp_images/。

【设计原则】
- 不重新抓商品页 HTML —— URL 已在 JSON 里，避免再骚扰有风控的页面服务。
- 只写入 pdp_images/ 和 pdp_images_manifest.json，绝不覆盖 _pdp_raw.html / patagonia_pdp.json。
- 图片下载在浏览器会话内用 fetch 完成（httpx 裸请求会被 Akamai 挡 404）。

用法：
  PATAGONIA_PROFILE=~/.crawl4ai/profiles/patagonia .crawl-venv/bin/python scripts/download_pdp_images.py
"""
import asyncio
import base64
import json
import os
import sys
import urllib.parse
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent / "output"
JSON_PATH = OUTPUT_DIR / "patagonia_pdp.json"
IMAGES_DIR = OUTPUT_DIR / "pdp_images"
MANIFEST_PATH = OUTPUT_DIR / "pdp_images_manifest.json"

PROFILE_DIR = os.environ.get("PATAGONIA_PROFILE", "").strip()
# 图片来源页（用作 Referer + 会话入口，可用已存的 JSON 里的 _source_url）
REFERER = None


async def main():
    if not PROFILE_DIR:
        print("FAILED: 需要 PATAGONIA_PROFILE 指向 profile 目录（图片走 Akamai，需要真实会话）。",
              file=sys.stderr)
        return
    if not JSON_PATH.exists():
        print(f"FAILED: 找不到 {JSON_PATH}，请先抓取生成商品数据。", file=sys.stderr)
        return

    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    image_urls = data.get("images", [])
    source_url = data.get("_source_url", "https://www.patagonia.com/")
    if not image_urls:
        print("FAILED: JSON 里没有 images。", file=sys.stderr)
        return

    print(f"[INFO] 待下载 {len(image_urls)} 张图，来源会话页：{source_url}")

    from playwright.async_api import async_playwright

    profile_path = str(Path(PROFILE_DIR).expanduser())
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    saved = []

    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir=profile_path,
            headless=False,             # 非无头，配合 profile 会话过 Akamai
            locale="en-US",
            timezone_id="America/New_York",
            viewport={"width": 1440, "height": 900},
        )
        page = context.pages[0] if context.pages else await context.new_page()
        # 先落地到来源页，建立同源会话（图片和页面同域，带上 Referer/cookie 才放行）
        try:
            await page.goto(source_url, wait_until="domcontentloaded", timeout=60000)
            await page.wait_for_timeout(1500)
        except Exception as e:
            print(f"[WARN] 打开来源页失败（继续尝试直接 fetch 图片）：{e}")

        for idx, url in enumerate(image_urls):
            # 在浏览器上下文内 fetch 图片 -> 返回 base64（带着会话 cookie，能过 Akamai）
            try:
                result = await page.evaluate(
                    """async (u) => {
                        const resp = await fetch(u, { credentials: 'include' });
                        if (!resp.ok) return { ok: false, status: resp.status };
                        const buf = await resp.arrayBuffer();
                        let binary = '';
                        const bytes = new Uint8Array(buf);
                        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                        return { ok: true, status: resp.status,
                                 b64: btoa(binary),
                                 type: resp.headers.get('content-type') };
                    }""",
                    url,
                )
            except Exception as e:
                saved.append({"src": url, "error": f"evaluate failed: {e}"})
                print(f"  [{idx:02d}] ERROR {e}")
                continue

            if not result or not result.get("ok"):
                status = result.get("status") if result else "no-result"
                saved.append({"src": url, "error": f"http {status}"})
                print(f"  [{idx:02d}] FAIL http {status}")
                continue

            content = base64.b64decode(result["b64"])
            name = Path(urllib.parse.urlparse(url).path).name or f"image_{idx}"
            dest = IMAGES_DIR / f"{idx:02d}_{name}"
            dest.write_bytes(content)
            saved.append({
                "src": url,
                "file": str(dest.relative_to(OUTPUT_DIR)),
                "bytes": len(content),
                "content_type": result.get("type"),
            })
            print(f"  [{idx:02d}] OK {len(content)} bytes -> {dest.name}")

            # 图片间小延迟，别打太快
            await page.wait_for_timeout(400)

        await context.close()

    ok = [s for s in saved if "file" in s]
    MANIFEST_PATH.write_text(json.dumps(saved, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n=== DONE === {len(ok)}/{len(image_urls)} 张成功")
    print("图片目录：", IMAGES_DIR)
    print("清单：", MANIFEST_PATH)


if __name__ == "__main__":
    asyncio.run(main())
