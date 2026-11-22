// 燕文（YW56）物流轨迹查询归一化工具
// 只做纯函数，不依赖任何平台 API，便于单测与复用。
// 参考文档：https://opendocs.yw56.com.cn/webfile/7128663508291424256/

export const YANWEN_TRACK_URL = 'http://api.track.yw56.com.cn/api/tracking';

// 面向客户的所有文本统一用自有品牌，抹去上游承运商名称。
// 轨迹 message、承运商名等来自上游 API，可能夹杂第三方公司名，统一清洗后再下发。
export function scrubCarrierName(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/Yanwen\s*Logistics/gi, 'Cyndi Global')
    .replace(/Yanwen\s*Express/gi, 'Cyndi Global')
    .replace(/Yanwen/gi, 'Cyndi Global')
    .replace(/YW56/gi, 'Cyndi Global')
    .replace(/燕文物流/g, 'Cyndi Global')
    .replace(/燕文快递/g, 'Cyndi Global')
    .replace(/燕文/g, 'Cyndi Global');
}

// ── 一级状态（tracking_status_waybill.level1）→ 前端统一状态 ──
// 统一状态取值：delivered / in_transit / out_for_delivery / available_for_pickup /
//               exception / delivery_failed / returned / pending / not_found / closed / unknown
const LEVEL1 = {
  '1': { state: 'not_found',        en: 'Not found',          zh: '查询不到' },
  '2': { state: 'pending',          en: 'Order created',      zh: '制单完成' },
  '3': { state: 'in_transit',       en: 'In transit',         zh: '运输途中' },
  '4': { state: 'out_for_delivery', en: 'Out for delivery',   zh: '正在派送' },
  '5': { state: 'available_for_pickup', en: 'Available for pickup', zh: '到达待取' },
  '6': { state: 'delivered',        en: 'Delivered',          zh: '投递成功' },
  '7': { state: 'closed',           en: 'Tracking closed',    zh: '追踪结束' },
  '8': { state: 'delivery_failed',  en: 'Delivery failed',    zh: '投递失败' },
  '9': { state: 'exception',        en: 'Exception',          zh: '包裹异常' },
  '0': { state: 'returned',         en: 'Returned',           zh: '包裹退回' },
};

// ── 二级状态（level2）中文补充描述 ──
const LEVEL2 = {
  '0': '已制单', '1': '已发货', '2': '已收货', '3': '运输中', '4': '已妥投',
  '5': '已取消', '6': '已截留', '7': '投递失败', '8': '处理异常', '9': '退回中',
  '10': '退件签收', '11': '转运异常', '12': '派送中', '13': '待提取',
  '14': '未制单', '15': '追踪结束',
};

// ── 常见操作状态码（checkpoints[].tracking_status）中文释义 ──
// 未命中的节点仍会展示燕文原始英文 message，不会丢失信息。
const OP_CODES = {
  OR10: '订单已生成', OR14: '尾程派送订单确认', OR16: '尾程创建订单成功',
  OR30: '订单已取消', OR35: '发货截留成功',
  PU10: '包裹已揽收', PU30: '揽收失败',
  SC00: '进入揽收仓', SC10: '录入成功', SC11: '组直封包', SC12: '组正式包',
  SC13: '大包接收', SC15: '交付成品库', SC16: '成品库接收', SC17: '大包装车',
  SC18: '大包发运', SC19: '口岸仓接收', SC20: '离开处理中心', SC21: '异常件录入',
  SC26: '揽收仓装车', SC27: '出库安检', SC34: '退件已领取', SC36: '异常件完结',
  SC37: '退件签收失败', SC38: '退件签收成功', SC40: '目的国承运商信息',
  SC45: '预上网', SC63: '成品大包出库', SC80: '退件发运', SC85: '司机退件送达',
  S201: '待发运', S202: '待交航', S203: '节假日影响待交航', S204: '天气影响待交航',
  S205: '海关查验待交航', S206: '航司处理中', S207: '海关检查准备起飞',
  S208: '安检中准备起飞', S209: '交航起飞', S210: '起飞延误', S211: '天气起飞延误',
  S212: '落地延误', S213: '运输中', S301: '海外机场提货中', S302: '航司理货中',
  S303: '进口清关中', S304: '海外转运延误', S305: '节假日转运延误',
  S306: '当地政策转运延误',
  EC10: '提交出口报关信息', EC20: '出口报关放行', EC30: '出口报关异常',
  IC50: '开始进口清关', IC51: '进口清关异常', IC54: '进口海关查验',
  IC55: '确认海关销毁', IC60: '进口清关完成', IC61: '境外干线清关行发运',
  IC70: '进口清关失败', IC80: '代缴税确认', IC81: '收件人付税完成',
  IC82: '等待收件人付税',
  LH07: '机场海关安检', LH08: '场站入库', LH09: '国内干线到达',
  LH10: '航司接收', LH11: '到达始发点', LH12: '场站制单', LH13: '查验放行',
  LH14: '查验扣留', LH15: '场站打板', LH16: '舱单确认', LH20: '离开始发点',
  LH21: '到达中转点', LH22: '离开中转点', LH23: '货物分批', LH24: '卡车航班出发',
  LH25: '国际运输中转', LH26: '卡车航班到达', LH30: '到达运输终点',
  LH31: '境外干线提货', LH32: '境外干线发运', LH33: '抵达目的地仓库',
  LH34: '目的港理货完成', LH35: '国际运输延误', LH36: '货物损坏',
  LH37: '拆板异常', LH38: '目的港提货', LH39: '提货完成', LH40: '批次交货',
  LH45: '离开运输终点', LH49: '境外干线送达',
  LM03: '小件操作扫描', LM09: '到达EP仓', LM10: '到达目的国',
  LM11: '离开派送处理中心', LM12: '到达中转中心', LM13: '离开中转中心',
  LM15: '国内中转', LM20: '到达最后派送点', LM25: '派送中',
  LM30: '到达待取', LM35: '尝试投递', LM40: '妥投成功',
  LM40E: '预计妥投', LM45: '海外退件签收成功', LM50: '派送失败',
  LM54: '海外退件入库确认', LM55: '重派转单获取成功', LM56: '确认海外销毁',
  LM57: '确认海外重派', LM60: '派送延迟', LM70: '需确认收件人信息',
  LM75: '收件人拒签', LM85: '包裹丢失', LM90: '包裹退回',
  NT10: '通知客户确认信息', OTHER: '其他信息', OTHERS: '其他信息',
};

// ── 国家/地区码 → 中英文名称（常见目的国，未命中回退为原码）──
const COUNTRIES = {
  CN: ['China', '中国'], HK: ['Hong Kong, China', '中国香港'],
  TW: ['Taiwan, China', '中国台湾'], MO: ['Macao, China', '中国澳门'],
  US: ['United States', '美国'], CA: ['Canada', '加拿大'],
  GB: ['United Kingdom', '英国'], DE: ['Germany', '德国'],
  FR: ['France', '法国'], NL: ['Netherlands', '荷兰'],
  IT: ['Italy', '意大利'], ES: ['Spain', '西班牙'],
  AU: ['Australia', '澳大利亚'], NZ: ['New Zealand', '新西兰'],
  JP: ['Japan', '日本'], KR: ['South Korea', '韩国'],
  SG: ['Singapore', '新加坡'], MY: ['Malaysia', '马来西亚'],
  TH: ['Thailand', '泰国'], VN: ['Vietnam', '越南'],
  ID: ['Indonesia', '印度尼西亚'], PH: ['Philippines', '菲律宾'],
  IN: ['India', '印度'], AE: ['United Arab Emirates', '阿联酋'],
  SA: ['Saudi Arabia', '沙特阿拉伯'], BR: ['Brazil', '巴西'],
  MX: ['Mexico', '墨西哥'], ZA: ['South Africa', '南非'],
};

function country(code) {
  if (!code) return { en: '', zh: '' };
  const key = String(code).toUpperCase();
  const hit = COUNTRIES[key];
  return hit ? { en: hit[0], zh: hit[1] } : { en: key, zh: key };
}

/** 把燕文 time_stamp（本地时间无时区）+ time_zone（如 +08）拼成可解析的 ISO 字符串 */
function parseTrackTime(timeStamp, timeZone) {
  if (!timeStamp) return '';
  const raw = String(timeStamp);
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) return raw; // 已带时区
  let tz = String(timeZone || '').trim();
  if (!/^[+-]\d{2}:?\d{2}$/.test(tz)) tz = '+08:00';
  tz = tz.replace(/^([+-]\d{2})(\d{2})$/, '$1:$2');
  return raw + tz;
}

/**
 * 归一化燕文轨迹响应为前端统一结构。
 * @param {object} payload 燕文 /api/tracking 的原始 JSON
 * @param {string} queriedNo 用户输入的查询单号
 */
export function normalizeYanwen(payload, queriedNo) {
  if (!payload || payload.code !== 0 || !Array.isArray(payload.result) || payload.result.length === 0) {
    const msg = payload && payload.message ? scrubCarrierName(payload.message) : 'No tracking record found';
    return { found: false, source: 'live', query: queriedNo, error: msg };
  }

  const r = payload.result[0] || {};
  const w = r.tracking_status_waybill || {};
  const l1 = LEVEL1[String(w.level1)] || { state: 'unknown', en: 'Updating', zh: '轨迹更新中' };
  const level2Code = String(w.level2 ?? '');
  const points = Array.isArray(r.checkpoints) ? r.checkpoints : [];

  // 时间升序（燕文一般已按时间排，这里做保险）
  const sorted = points.slice().sort((a, b) => {
    const ta = Date.parse(parseTrackTime(a.time_stamp, a.time_zone)) || 0;
    const tb = Date.parse(parseTrackTime(b.time_stamp, b.time_zone)) || 0;
    return ta - tb;
  });

  const events = sorted.map((cp, idx) => {
    const code = String(cp.tracking_status || '');
    const isLast = idx === sorted.length - 1;
    const zh = OP_CODES[code] || '';
    return {
      time: parseTrackTime(cp.time_stamp, cp.time_zone),
      timeZone: cp.time_zone || '',
      status: isLast ? 'current' : 'done',
      rawStatus: code,
      title: scrubCarrierName(cp.message) || zh || code || 'Tracking update',
      titleZh: zh || scrubCarrierName(cp.message) || '轨迹更新',
      description: isLast ? (l1.zh || '') : '',
      descriptionZh: isLast ? (l1.zh || '') : '',
      location: scrubCarrierName(cp.location) || '',
      locationZh: scrubCarrierName(cp.location) || '',
      lastMile: Number(cp.is_last_mile_checkpoint) === 1,
      extra: cp.extraProperties || null,
    };
  });

  const origin = country(r.origin_country);
  const destination = country(r.destination_country);
  const lastUpdated = events.length ? events[events.length - 1].time : '';

  return {
    found: true,
    source: 'live',
    query: queriedNo,
    trackingNo: r.tracking_number || queriedNo,
    waybillNo: r.waybill_number || '',
    exchangeNo: r.exchange_number || '', // 尾程单号
    // 面向客户一律显示为自有品牌，不使用上游尾程承运商名称。
    carrier: 'Cyndi Global',
    // 上游承运商的官网/电话属于第三方信息，不下发给客户。
    carrierWebsite: '',
    carrierPhone: '',
    status: l1.state,
    statusLabel: l1.en,
    statusLabelZh: l1.zh + (LEVEL2[level2Code] ? ` · ${LEVEL2[level2Code]}` : ''),
    origin: origin.en,
    originZh: origin.zh,
    destination: destination.en,
    destinationZh: destination.zh,
    eta: '',
    packages: null,
    quantity: null,
    warehouseLocation: '',
    warehouseLocationZh: '',
    warehouseUpdated: '',
    lastUpdated,
    events,
    warehouseImages: [],
    lastMileExpected: Boolean(r.last_mile_tracking_expected),
  };
}

/** 判断查询键是否更像燕文运单号（否则按自有产品编号处理） */
export function looksLikeYanwenNo(value) {
  const s = String(value || '').trim().toUpperCase();
  if (!s) return false;
  // 燕文单号典型：2 位字母 + 9 位数字 + 2 位字母（如 UH183870291YP）
  if (/^[A-Z]{2}\d{6,12}[A-Z]{2}$/.test(s)) return true;
  // 尾程单号：纯数字，通常 8 ~ 22 位
  if (/^\d{8,22}$/.test(s)) return true;
  // 其他字母数字混合且不含连字符、长度足够，也交给燕文试查
  if (/^[A-Z0-9]{9,24}$/.test(s) && !s.includes('-')) return true;
  return false;
}
