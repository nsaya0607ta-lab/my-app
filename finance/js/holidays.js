// holidays.js — 日本の祝日カレンダー・営業日判定（証券口座の積立実行日判定に使用）
// 方針: 日本時間(Asia/Tokyo)の暦日(YYYY-MM-DD)だけを扱い、UTC変換で前後にずらさない。
//   ・国民の祝日（祝日法）を年ごとに算出（固定日・ハッピーマンデー・春分/秋分・振替休日・国民の休日）。
//   ・証券市場の年末年始休場（12/31・1/2・1/3）も非営業日として扱う。
//   ・外部API・ダミー値は使わず、暦の計算のみで判定する。
// 春分・秋分の近似式は概ね1980〜2099年で有効。

import { pad } from './utils.js?v=20260724c';

const cache = new Map(); // year -> Map<iso, name>

const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const dow = (isoStr) => { const [y, m, d] = isoStr.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const addDaysISO = (isoStr, delta) => {
  const [y, m, d] = isoStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};
export const prevISO = (isoStr) => addDaysISO(isoStr, -1);
export const nextISO = (isoStr) => addDaysISO(isoStr, 1);

// 指定月(1-12)の第nth月曜日の「日」
function nthMonday(year, month, nth) {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=日..6=土
  return 1 + ((1 - firstDow + 7) % 7) + (nth - 1) * 7;
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
