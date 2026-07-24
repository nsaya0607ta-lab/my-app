// recurrence.js — 定期処理（固定収支・固定振替・カード・積立）の日付計算エンジン（共通化）
// 方針:
//   ・「登録日／今日」を発生日・実行日・引落日の代わりに使わない。
//   ・開始日は「この日以降から有効」。最初の実行日は「開始日以降で、設定した実行日に一致する最初の日」。
//   ・すべて日本時間(Asia/Tokyo)で処理。日付のみの値(YYYY-MM-DD)はUTC変換で前後にずらさない。
//   ・月末指定(29/30/31・末)は、その日が存在しない月では自動的に月末へ丸める。
// この1モジュールに集約し、画面ごとの個別実装をなくす（calc/cashflow/store/app はここを import する）。

import { pad, resolveDay, toISO } from './utils.js?v=20260724e';

// ===== 日本時間の「今日」 =====
// サーバー・端末のタイムゾーンに依存せず、常に Asia/Tokyo(UTC+9) の暦日を返す。
// 日付のみ(YYYY-MM-DD)として扱い、時刻・UTC変換によるズレを防ぐ。
export function jstTodayISO() {
  const d = new Date(Date.now() + 9 * 3600 * 1000); // UTC+9 へシフトして UTC ゲッタで読む
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// ===== 実行日が月末に丸められ得る指定か（画面表示ヒント用） =====
export const isMonthEndDay = (day) => day === 'end' || day === 0 || Number(day) >= 29;

// ===== 有効期間の判定（開始日以降・終了日以前。日付のみの文字列比較で時刻誤判定を防ぐ） =====
export const recurringActiveOn = (item, dateISO) =>
  (!item.startDate || dateISO >= item.startDate) && (!item.endDate || dateISO <= item.endDate);

// ===== ある年月(0-11)の実行日を実日付へ（存在しない日は月末へ丸め） =====
export const occurrenceInMonth = (y, m, day) => `${y}-${pad(m + 1)}-${pad(resolveDay(y, m, day))}`;

// ===== 月ごとの実行日を列挙（fromMonthISO〜toMonthISO の各月・両端含む） =====
// 各要素 { y, m(0-11), date }。呼び出し側で日付範囲や有効期間の絞り込みを行う。
export function monthlyOccurrences(fromMonthISO, toMonthISO, day) {
  const [fy, fm] = fromMonthISO.split('-').map(Number);
  const [ty, tm] = toMonthISO.split('-').map(Number);
  const endIdx = ty * 12 + (tm - 1);
  const out = [];
  let idx = fy * 12 + (fm - 1);
  let guard = 0;
  while (idx <= endIdx && guard < 1200) {
    const y = Math.floor(idx / 12), m = idx % 12;
    out.push({ y, m, date: occurrenceInMonth(y, m, day) });
    idx++; guard++;
  }
  return out;
}

// ===== 開始日以降で、実行日に一致する「最初の日」 =====
// 例) 開始 7/31・実行日15 → 8/15 ／ 開始 7/15・実行日15 → 7/15 ／ 開始 7/16・実行日15 → 8/15。
export function firstOccurrenceOnOrAfter(startISO, day) {
  const [y, m0] = startISO.split('-').map(Number);
  for (let k = 0; k < 25; k++) {
    const idx = (y * 12 + (m0 - 1)) + k;
    const cy = Math.floor(idx / 12), cm = idx % 12;
    const iso = occurrenceInMonth(cy, cm, day);
    if (iso >= startISO) return iso;
  }
  return null;
}

// ===== 次回実行予定日 =====
// 基準日(refISO・既定は日本時間の今日)以降で最初の実行日。開始日が未来なら開始日を優先。
// 「登録日・今日」ではなく、開始日と実行日から算出する。終了日を過ぎていれば null。
export function nextRecurringDate(item, refISO = jstTodayISO()) {
  if (!item || item.day == null) return null;
  const base = item.startDate && item.startDate > refISO ? item.startDate : refISO;
  const iso = firstOccurrenceOnOrAfter(base, item.day);
  if (!iso) return null;
  if (item.endDate && iso > item.endDate) return null;
  return iso;
}

// ===== カード利用1件の引落日 =====
// 発生日(利用日)と引落日を分離して管理する。締日を過ぎた利用は翌サイクルへ、
// payMonthOffset ヶ月後の payDay に引き落とす（存在しない日は月末へ丸め）。
export function settlementDateFor(txISO, card) {
  if (!card) return txISO;
  const [y, m, dd] = txISO.split('-').map(Number);
  const closeDay = resolveDay(y, m - 1, card.closingDay);
  // 締日以前の利用は当月締め、締日を過ぎた利用は翌月締めサイクルへ
  const closeIdx = dd <= closeDay ? (y * 12 + (m - 1)) : (y * 12 + m);
  const payIdx = closeIdx + (card.payMonthOffset ?? 1);
  const py = Math.floor(payIdx / 12), pm = payIdx % 12;
  return occurrenceInMonth(py, pm, card.payDay);
}

// ===== 次回引落予定日（カード払いの固定支出用） =====
// 次回発生日(実行日)を求め、そのカードの締日・引落日設定に基づく引落日を返す。
// 発生日に処理できなくても、この引落予定日は独立して保持される。
export function nextSettlementDate(item, card, refISO = jstTodayISO()) {
  const run = nextRecurringDate(item, refISO);
  if (!run || !card) return null;
  return settlementDateFor(run, card);
}

// ===== 二重処理防止用の一意キー =====
// 同じ (利用者・定期取引・本来の実行予定日・処理種別) は1回だけ処理する。
export const dedupeKey = (recurringId, scheduledISO, kind, userId = 'local') =>
  [userId, recurringId, scheduledISO, kind].join('|');

// resolveDay / toISO を再輸出（呼び出し側の import を1本化するため）
export { resolveDay, toISO };
