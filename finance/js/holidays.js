// holidays.js — 日本・米国の祝日カレンダー・営業日判定
// （証券口座の積立実行日判定と、買付の受渡日＝預り金へ正式反映される日の算出に使用）
// 方針: 日本時間(Asia/Tokyo)の暦日(YYYY-MM-DD)だけを扱い、UTC変換で前後にずらさない。
//   ・国民の祝日（祝日法）を年ごとに算出（固定日・ハッピーマンデー・春分/秋分・振替休日・国民の休日）。
//   ・証券市場の年末年始休場（12/31・1/2・1/3）も非営業日として扱う。
//   ・米国市場(NYSE)の休場日も年ごとに算出する（米国株の受渡日計算に必要なため）。
//   ・外部API・ダミー値は使わず、暦の計算のみで判定する。
// 春分・秋分の近似式は概ね1980〜2099年で有効。

import { pad } from './utils.js?v=20260725b';

const cache = new Map();   // year -> Map<iso, name>（日本の祝日）
const usCache = new Map(); // year -> Map<iso, name>（米国市場の休場日）

const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const dow = (isoStr) => { const [y, m, d] = isoStr.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const addDaysISO = (isoStr, delta) => {
  const [y, m, d] = isoStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};
export const prevISO = (isoStr) => addDaysISO(isoStr, -1);
export const nextISO = (isoStr) => addDaysISO(isoStr, 1);

// 指定月(1-12)の第nth週の指定曜日(0=日..6=土)の「日」
function nthWeekday(year, month, weekday, nth) {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=日..6=土
  return 1 + ((weekday - firstDow + 7) % 7) + (nth - 1) * 7;
}
const nthMonday = (year, month, nth) => nthWeekday(year, month, 1, nth);
// 指定月の最終月曜日の「日」（米国のメモリアルデー用）
function lastMonday(year, month) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let d = nthWeekday(year, month, 1, 1);
  while (d + 7 <= last) d += 7;
  return d;
}
const vernalEquinox = (y) => Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));   // 春分の日
const autumnalEquinox = (y) => Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4)); // 秋分の日

function computeHolidays(year) {
  const base = new Map(); // 振替・国民の休日を足す前の「本来の祝日」
  const add = (m, d, name) => base.set(iso(year, m, d), name);
  add(1, 1, '元日');
  base.set(iso(year, 1, nthMonday(year, 1, 2)), '成人の日');
  add(2, 11, '建国記念の日');
  if (year >= 2020) add(2, 23, '天皇誕生日');
  add(3, vernalEquinox(year), '春分の日');
  add(4, 29, '昭和の日');
  add(5, 3, '憲法記念日');
  add(5, 4, 'みどりの日');
  add(5, 5, 'こどもの日');
  base.set(iso(year, 7, nthMonday(year, 7, 3)), '海の日');
  if (year >= 2016) add(8, 11, '山の日');
  base.set(iso(year, 9, nthMonday(year, 9, 3)), '敬老の日');
  add(9, autumnalEquinox(year), '秋分の日');
  base.set(iso(year, 10, nthMonday(year, 10, 2)), 'スポーツの日');
  add(11, 3, '文化の日');
  add(11, 23, '勤労感謝の日');

  const result = new Map(base);
  // 振替休日: 日曜と重なった祝日は、次の「祝日でない日」を休日にする。
  for (const [d] of base) {
    if (dow(d) === 0) {
      let nx = nextISO(d);
      while (result.has(nx)) nx = nextISO(nx);
      result.set(nx, '振替休日');
    }
  }
  // 国民の休日: 前後を祝日に挟まれた平日（例: シルバーウィーク）を休日にする。
  for (const [d] of base) {
    const prev = addDaysISO(d, -2), mid = addDaysISO(d, -1);
    if (base.has(prev) && !result.has(mid) && dow(mid) !== 0) result.set(mid, '国民の休日');
  }
  return result;
}

// 祝日名（祝日でなければ null）
export function holidayName(isoStr) {
  const y = Number(isoStr.slice(0, 4));
  if (!cache.has(y)) cache.set(y, computeHolidays(y));
  return cache.get(y).get(isoStr) || null;
}
export const isHoliday = (isoStr) => !!holidayName(isoStr);
export const isWeekend = (isoStr) => { const w = dow(isoStr); return w === 0 || w === 6; };

// 証券口座の営業日か（土日・祝日・年末年始 12/31〜1/3 は非営業日）
export function isBusinessDay(isoStr) {
  if (isWeekend(isoStr) || isHoliday(isoStr)) return false;
  const md = isoStr.slice(5); // MM-DD
  if (md === '12-31' || md === '01-02' || md === '01-03') return false; // 市場の年末年始休場
  return true;
}
// 非営業日か（＝土日祝日・年末年始）
export const isNonBusinessDay = (isoStr) => !isBusinessDay(isoStr);

// isoStr 以降で最初の営業日（isoStr 自身が営業日ならその日）
export function nextBusinessDay(isoStr) {
  let c = isoStr, guard = 0;
  while (guard < 40 && !isBusinessDay(c)) { c = nextISO(c); guard++; }
  return c;
}

// ===================================================================
// 米国市場（NYSE）の休場日
// ===================================================================
// 米国株・米国指数の買付は米国市場の営業日ベースで受け渡されるため、
// 受渡日（預り金へ正式反映される日）の計算に日本の祝日とあわせて使用する。

// 復活祭（グレゴリオ暦のAnonymous Gregorian算法）。聖金曜日はこの2日前。
function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
}

function computeUsHolidays(year) {
  const map = new Map();
  // 日付固定の祝日の振替ルール: 土曜は前日の金曜、日曜は翌日の月曜が休場。
  // 元日だけは土曜と重なっても前年12/31を休場にしない（NYSEの運用に合わせる）。
  const observed = (m, d, name, shiftSaturday = true) => {
    let s = iso(year, m, d);
    const w = dow(s);
    if (w === 0) s = nextISO(s);
    else if (w === 6) { if (!shiftSaturday) return; s = prevISO(s); }
    map.set(s, name);
  };
  observed(1, 1, '元日', false);
  map.set(iso(year, 1, nthMonday(year, 1, 3)), 'キング牧師記念日');
  map.set(iso(year, 2, nthMonday(year, 2, 3)), 'ワシントン誕生日');
  map.set(addDaysISO(easterSunday(year), -2), 'グッドフライデー');
  map.set(iso(year, 5, lastMonday(year, 5)), 'メモリアルデー');
  if (year >= 2022) observed(6, 19, 'ジューンティーンス');
  observed(7, 4, '独立記念日');
  map.set(iso(year, 9, nthMonday(year, 9, 1)), 'レイバーデー');
  map.set(iso(year, 11, nthWeekday(year, 11, 4, 4)), '感謝祭');
  observed(12, 25, 'クリスマス');
  return map;
}

// 米国市場の休場日名（休場でなければ null）
export function usHolidayName(isoStr) {
  const y = Number(isoStr.slice(0, 4));
  if (!usCache.has(y)) usCache.set(y, computeUsHolidays(y));
  // 土曜振替で前年12月へずれる祝日は無いが、日曜振替で翌年1月へ入ることも無いため年内のみ参照する。
  return usCache.get(y).get(isoStr) || null;
}
export const isUsHoliday = (isoStr) => !!usHolidayName(isoStr);
// 米国市場の営業日か（土日・米国市場の休場日は非営業日）
export const isUsBusinessDay = (isoStr) => !isWeekend(isoStr) && !isUsHoliday(isoStr);

// ===================================================================
// 受渡日の計算（日本・米国どちらも営業日である日を数える）
// ===================================================================
// 約定日から起算して受渡日を求める。日本または米国が休みの日は日数に数えず、
// 受渡日そのものも「日本・米国ともに営業日」の日まで後ろへずらす。
// 例: 金曜約定・2営業日後 → 土日を除いて火曜。祝日があればその分だけ翌営業日へずれる。
export const isSettlementBusinessDay = (isoStr) => isBusinessDay(isoStr) && isUsBusinessDay(isoStr);

// isoStr 以降で最初の「日米ともに営業日」（isoStr 自身が該当すればその日）
export function nextSettlementBusinessDay(isoStr) {
  let c = isoStr, guard = 0;
  while (guard < 60 && !isSettlementBusinessDay(c)) { c = nextISO(c); guard++; }
  return c;
}

// 約定日 tradeISO の days 営業日後の受渡日。days=0 なら約定日以降の最初の営業日。
export function tradeSettlementDate(tradeISO, days = 2) {
  let c = nextSettlementBusinessDay(tradeISO);
  let left = Math.max(0, Math.round(Number(days) || 0));
  let guard = 0;
  while (left > 0 && guard < 200) {
    c = nextSettlementBusinessDay(nextISO(c));
    left--; guard++;
  }
  return c;
}

// 受渡日が「日本・米国どちらの休日で後ろへずれたか」の説明（画面のヒント表示用）
export function tradeSettlementShiftNote(tradeISO, settleISO) {
  const names = [];
  let c = nextISO(tradeISO), guard = 0;
  while (c <= settleISO && guard < 60) {
    if (!isWeekend(c)) {
      const jp = holidayName(c);
      const us = usHolidayName(c);
      if (jp) names.push(`${c.slice(5).replace('-', '/')} ${jp}（日本）`);
      else if (us) names.push(`${c.slice(5).replace('-', '/')} ${us}（米国）`);
    }
    c = nextISO(c); guard++;
  }
  return names;
}
