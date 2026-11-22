// 统一物流查询入口（客户面向）
// GET /api/tracking?q=<单号或产品编号>
//   - 燕文运单号 / 尾程单号 → 实时代理调用燕文 API，返回归一化轨迹
//   - 自有产品编号（如 CY-THERMOS-001）→ 查 D1 logistics_records
//   - 也兼容 ?trackingNo= / ?productNo= / ?nums= 旧参数名
//
// 凭证：Cloudflare Pages 环境变量 YANWEN_AUTH_CODE（商户号 / 制单账号）。
// 该凭证只在服务端使用，绝不下发到前端；燕文接口是 http，从浏览器直连会被
// 混合内容拦截且暴露密钥，因此必须经此 Worker 代理。

import { corsHeaders, json } from '../_lib/auth.js';
import { YANWEN_TRACK_URL, normalizeYanwen, looksLikeYanwenNo } from '../_lib/yanwen.js';

const TIMEOUT_MS = 8000;

export async function onRequestGet({ request, env }) {
  const headers = corsHeaders(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get('q')
    || url.searchParams.get('trackingNo')
    || url.searchParams.get('nums')
    || url.searchParams.get('productNo')
    || '').trim();

  if (!q) return json({ error: 'Please enter a tracking number or product number.' }, 400, headers);

  const looksYanwen = looksLikeYanwenNo(q);

  if (looksYanwen) {
    const auth = (env.YANWEN_AUTH_CODE || '').trim();
    if (!auth) {
      return json({
        error: 'Live tracking is not configured yet. Please contact us.',
        code: 'LIVE_TRACKING_NOT_CONFIGURED',
      }, 503, headers);
    }
    return queryYanwen(q, auth, headers);
  }

  return queryLocal(q, env, headers);
}

async function queryYanwen(trackingNo, auth, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetch(`${YANWEN_TRACK_URL}?nums=${encodeURIComponent(trackingNo)}`, {
      method: 'GET',
      headers: {
        Authorization: auth,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!upstream.ok) {
      return json({
        found: false,
        source: 'live',
        query: trackingNo,
        error: `Tracking service returned ${upstream.status}`,
        code: 'TRACKING_UPSTREAM_ERROR',
      }, 502, headers);
    }

    const payload = await upstream.json().catch(() => null);
    const normalized = normalizeYanwen(payload, trackingNo);
    if (!normalized.found) {
      return json(normalized, 404, headers);
    }
    return json(normalized, 200, headers);
  } catch (err) {
    const timedOut = err && err.name === 'AbortError';
    return json({
      found: false,
      source: 'live',
      query: trackingNo,
      error: timedOut ? 'Tracking service timed out. Please try again.' : 'Unable to reach tracking service.',
      code: timedOut ? 'TRACKING_TIMEOUT' : 'TRACKING_NETWORK_ERROR',
    }, 504, headers);
  } finally {
    clearTimeout(timer);
  }
}

async function queryLocal(productNo, env, headers) {
  const key = productNo.trim().toUpperCase();
  if (!env.DB) {
    return json({ error: 'Database binding is not configured.' }, 503, headers);
  }
  try {
    const row = await env.DB
      .prepare('SELECT data_json FROM logistics_records WHERE product_no = ?1')
      .bind(key)
      .first();

    if (!row) {
      return json({ found: false, source: 'cyndi', query: productNo, error: 'No logistics record found for this number.' }, 404, headers);
    }

    const record = JSON.parse(row.data_json);
    // 统一结构：补齐 source / found 字段，保留自有库原有事件与仓库照片
    return json({
      ...record,
      found: true,
      source: 'cyndi',
      // 面向客户一律显示为自有品牌，覆盖自有库中可能存在的承运商字段。
      carrier: 'Cyndi Global',
      query: productNo,
      statusLabel: record.statusLabel || '',
      statusLabelZh: record.statusLabelZh || '',
      trackingNo: record.trackingNo || '',
      events: Array.isArray(record.events) ? record.events : [],
      warehouseImages: Array.isArray(record.warehouseImages) ? record.warehouseImages : [],
    }, 200, headers);
  } catch (err) {
    return json({ error: 'Unable to read logistics record.' }, 500, headers);
  }
}
