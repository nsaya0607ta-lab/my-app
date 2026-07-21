// utils.js — 共通ユーティリティ（フォーマット・日付・DOM）
// 依存なし。全モジュールから import して使う。

export const uid = (p = 'id') =>
  p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---- 数値フォーマット ----
export const yen = (n, { sign = false } = {}) => {
  const v = Math.round(Number(n) || 0);
  const s = '¥' + Math.abs(v).toLocaleString('ja-JP');
  if (sign && v > 0) return '+' + s;
  if (v < 0) return '−' + s;
  return s;
};

// シークレットモード用のマスク表示
export const yenMasked = (n, secret, opts) => (secret ? '＊＊＊＊＊＊' : yen(n, opts));

export const num = (n) => (Number(n) || 0).toLocaleString('ja-JP');

// ---- 日付ヘルパー ----
export const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toISO(new Date());
export const parseISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const ym = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate(); // m:0-11
export const clampDay = (y, m, day) => Math.min(day, daysInMonth(y, m));
export const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate());

const WD = ['日', '月', '火', '水', '木', '金', '土'];
export const fmtDate = (iso) => {
  const d = parseISO(iso);
  return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`;
};
export const fmtDateLong = (iso) => {
  const d = parseISO(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${WD[d.getDay()]})`;
};
export const fmtMonth = (ymStr) => {
  const [y, m] = ymStr.split('-');
  return `${y}年${Number(m)}月`;
};
export const weekdayName = (i) => WD[i];

// 「毎月末」を許容する日指定を実日に変換（day='end' or 数値）
export const resolveDay = (y, m, day) => {
  if (day === 'end' || day === 0) return daysInMonth(y, m);
  return clampDay(y, m, Number(day));
};

// ---- DOM ヘルパー ----
export const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(c));
  }
  return node;
};
export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 軽い触覚フィードバック（対応端末のみ）
export const haptic = (ms = 8) => { try { navigator.vibrate?.(ms); } catch {} };
