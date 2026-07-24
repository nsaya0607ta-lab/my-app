// securities.js — 証券口座（現金・元本・評価額・保有銘柄・積立）のロジック層。
// 設計方針: store.js / calc.js と同じく「純粋関数の集合＋stateを受け取って書き換える処理」で構成し、
// UI（app.js）から独立させる。すべての金額はユーザーが入力したデータのみから計算する（外部API・ダミー値は使わない）。
//
// 保有銘柄は2種類を1つの holdings[] 配列に kind で判別して保持する:
//   ・個別株(kind:'stock')  … 米国株。USD建て＋ドル円で円換算
//       { name, ticker, kind:'stock', quantity, costUsd, priceUsd, fxRate, memo }
//   ・インデックス(kind:'index') … 円建て。数量・基準価額は管理しない
//       { name, kind:'index', nisaFrame:'growth'|'tsumitate', cost, value, memo }

import { pad, toISO } from './utils.js?v=20260724c';
import { isBusinessDay, prevISO } from './holidays.js?v=20260724c';

// ===== 証券口座の判定・取得 =====
export const isSecurities = (a) => a && a.type === 'securities';
export const securitiesAccounts = (state) => state.accounts.filter(isSecurities);
export const hasSecurities = (state) => state.accounts.some(isSecurities);

const n = (v) => Number(v) || 0;
export const isIndex = (h) => h.kind === 'index';
export const isStock = (h) => h.kind !== 'index';

// NISA区分ラベル
export const NISA_FRAMES = [
  { value: 'growth', label: '成長投資枠' },
  { value: 'tsumitate', label: 'つみたて投資枠' },
];
export const nisaLabel = (v) => (NISA_FRAMES.find((f) => f.value === v) || NISA_FRAMES[0]).label;

// ===== 1銘柄の評価 =====
// 個別株: 保有数量 × 現在株価(USD) × ドル円 ／ インデックス: 現在保有額(円)
export function holdingValue(h) {
  if (isIndex(h)) return n(h.value);
  return n(h.quantity) * n(h.priceUsd) * n(h.fxRate);
}
// 個別株: 保有数量 × 取得単価(USD) × ドル円 ／ インデックス: 取得価額(円)
export function holdingCost(h) {
  if (isIndex(h)) return n(h.cost);
  return n(h.quantity) * n(h.costUsd) * n(h.fxRate);
}
// 損益・損益率
export function holdingPL(h) {
  const value = holdingValue(h);
  const cost = holdingCost(h);
  const diff = value - cost;
  return { value, cost, diff, rate: cost > 0 ? (diff / cost) * 100 : null };
}

// ===== 口座単位の集計 =====
export const accountHoldings = (acc) => acc.holdings || [];
export const accountCash = (acc) => n(acc.cash);
// 評価額（保有銘柄の円換算評価額合計。現金は含めない）
export const accountValuation = (acc) => accountHoldings(acc).reduce((s, h) => s + holdingValue(h), 0);
// 元本（取得額合計）
export const accountCost = (acc) => accountHoldings(acc).reduce((s, h) => s + holdingCost(h), 0);
// 区分別の評価額
export function accountValuationByKind(acc) {
  let index = 0, stock = 0;
  for (const h of accountHoldings(acc)) {
    if (isIndex(h)) index += holdingValue(h);
    else stock += holdingValue(h);
  }
  return { index, stock };
}
// 合計残高（総資産への寄与）＝ 現金 ＋ 評価額
export const accountTotal = (acc) => accountCash(acc) + accountValuation(acc);

// 証券口座の balance を「現金＋評価額」で再計算して同期する（総資産計算はbalanceを参照するため）
export function recomputeAccount(acc) {
  if (!isSecurities(acc)) return;
  acc.cash = Math.round(n(acc.cash));
  acc.balance = Math.round(accountTotal(acc));
}
export function recomputeAll(state) {
  for (const a of securitiesAccounts(state)) recomputeAccount(a);
}

// ===== 全証券口座の横断集計（ホーム画面・利益率） =====
export function portfolio(state) {
  const accs = securitiesAccounts(state);
  let cash = 0, cost = 0, index = 0, stock = 0;
  for (const a of accs) {
    cash += accountCash(a);
    cost += accountCost(a);
    const k = accountValuationByKind(a);
    index += k.index; stock += k.stock;
  }
  const valuation = index + stock;               // 総評価額（保有銘柄のみ）
  const profit = valuation - cost;               // 評価損益 = 評価額 − 元本(取得額)
  const profitRate = cost > 0 ? (profit / cost) * 100 : null; // 利益率(%)
  return {
    accounts: accs, count: accs.length,
    cash, cost, principal: cost, valuation, index, stock, profit, profitRate,
    total: cash + valuation,
  };
}

// ===== 保有割合（インデックス / 個別株 / 現金。米国株は円換算後の評価額） =====
export function allocation(state) {
  const p = portfolio(state);
  const base = p.index + p.stock + p.cash;
  const pct = (v) => (base > 0 ? (v / base) * 100 : 0);
  return {
    base,
    index: { value: p.index, pct: pct(p.index) },
    stock: { value: p.stock, pct: pct(p.stock) },
    cash: { value: p.cash, pct: pct(p.cash) },
  };
}

// ===== 買い増しヘルパー（個別株の取得単価USDを加重平均で更新） =====
export function applyBuyUsd(holding, addQty, unitUsd, fx) {
  const prevQty = n(holding.quantity);
  const prevCost = prevQty * n(holding.costUsd);
  const newQty = prevQty + addQty;
  holding.quantity = newQty;
  holding.costUsd = newQty > 0 ? (prevCost + addQty * unitUsd) / newQty : 0;
  holding.priceUsd = unitUsd;          // 直近の購入単価を現在株価として設定
  if (fx > 0) holding.fxRate = fx;
}

// ===== 個別株の購入 =====
// 現金から購入金額（円＝株数×購入単価USD×ドル円）を引き、保有数量・取得単価を更新。
// 元本は取得額の合計として自動的に増える。現金不足なら実行しない。
export function purchaseStock(state, accountId, holdingId, shares, priceUsd, fx, dateISO) {
  const acc = state.accounts.find((a) => a.id === accountId);
  if (!acc || !isSecurities(acc)) return { ok: false, reason: 'account' };
  const h = accountHoldings(acc).find((x) => x.id === holdingId);
  if (!h || isIndex(h)) return { ok: false, reason: 'holding' };
  const rate = n(fx) || n(h.fxRate);
  const amount = Math.round(n(shares) * n(priceUsd) * rate);
  if (amount <= 0) return { ok: false, reason: 'amount' };
  if (accountCash(acc) < amount) return { ok: false, reason: 'cash', amount };
  acc.cash = accountCash(acc) - amount;
  applyBuyUsd(h, n(shares), n(priceUsd), rate);
  (acc.purchases ||= []).push({ id: 'pur_' + Date.now().toString(36), holdingId, holdingName: h.name, shares: n(shares), priceUsd: n(priceUsd), fxRate: rate, amount, date: dateISO });
  recomputeAccount(acc);
  return { ok: true, amount };
}

// ===================================================================
// 積立処理（日本時間23:00・ONのインデックスのみ・任意のオプトイン機能）
// ===================================================================
// クライアントアプリのため真のサーバーcronは持てない。アプリ起動時に
// 「前回処理日の翌日〜直近の実行対象日」まで日ごとに追いかけて実行する（キャッチアップ方式）。

function jstDate(ms = Date.now()) { return new Date(ms + 9 * 3600 * 1000); }
export function jstTodayISO() {
  const d = jstDate();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
// 日本時間の日付＋時刻（詳細履歴の更新日時に使用。例 "2026-07-23T23:15:04+09:00"）
export function jstNowISO() {
  const d = jstDate();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+09:00`;
}

// ===================================================================
// 投資実績スナップショット（日次履歴・実績グラフのもと）
// ===================================================================
// 全証券口座を横断し、NISA(インデックス)と個別株を分けて元本・評価額・現金・損益を集計する。
// 各銘柄の保有数量・評価額も内訳として保持する。すべて登録済みデータからの計算のみ（ダミー値なし）。
export function performanceSnapshot(state) {
  const accs = securitiesAccounts(state);
  let secCash = 0, nisaPrincipal = 0, nisaValue = 0, stockPrincipal = 0, stockValue = 0;
  const holdings = [];
  for (const a of accs) {
    secCash += accountCash(a);
    for (const h of accountHoldings(a)) {
      const value = holdingValue(h);
      const cost = holdingCost(h);
      const index = isIndex(h);
      if (index) { nisaPrincipal += cost; nisaValue += value; }
      else { stockPrincipal += cost; stockValue += value; }
      holdings.push({
        id: h.id, name: h.name, kind: index ? 'index' : 'stock',
        nisaFrame: index ? (h.nisaFrame || 'growth') : null,
        quantity: index ? null : n(h.quantity),
        value: Math.round(value), cost: Math.round(cost),
      });
    }
  }
  const principal = nisaPrincipal + stockPrincipal;   // 投資元本合計（現金は含めない）
  const valuation = nisaValue + stockValue;            // 投資評価額合計
  const profit = valuation - principal;                // 評価損益 = 評価額 − 元本
  const profitRate = principal > 0 ? (profit / principal) * 100 : null; // 利益率(%)
  return {
    secCash: Math.round(secCash),
    nisaPrincipal: Math.round(nisaPrincipal), nisaValue: Math.round(nisaValue),
    stockPrincipal: Math.round(stockPrincipal), stockValue: Math.round(stockValue),
    principal: Math.round(principal), valuation: Math.round(valuation),
    profit: Math.round(profit), profitRate,
    holdings,
  };
}
// 23:00 を過ぎて確定済みとみなせる「最新の対象日」。JST23時以降なら今日、未満なら昨日。
export function lastAccrualISO() {
  const d = jstDate();
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  if (d.getUTCHours() >= 23) return `${y}-${pad(m + 1)}-${pad(day)}`;
  const prev = new Date(Date.UTC(y, m, day - 1));
  return `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`;
}
const nextISO = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  const nd = new Date(Date.UTC(y, m - 1, d + 1));
  return `${nd.getUTCFullYear()}-${pad(nd.getUTCMonth() + 1)}-${pad(nd.getUTCDate())}`;
};
// 積立停止日〜積立再開日の期間は積立を止める（積立停止日のみ設定時は再開日未設定として無期限停止）。
const inPause = (a, iso) => {
  if (!a.pauseStart) return false;
  if (a.pauseEnd) return iso >= a.pauseStart && iso <= a.pauseEnd;
  return iso >= a.pauseStart;
};
const accumActiveOn = (a, iso) =>
  a.enabled !== false && (!a.startDate || iso >= a.startDate) && (!a.endDate || iso <= a.endDate) && !inPause(a, iso);

// 経過日数（startDateからisoまで。0始まり）
function daysSince(startISO, iso) {
  const [sy, sm, sd] = startISO.split('-').map(Number);
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(sy, sm - 1, sd)) / 86400000);
}

// ===== 積立設定の頻度計算（実際の積立処理・将来シミュレーションの両方から共通利用） =====
// スケジュール上その日に発生する積立額（土日祝日の判定は考慮しない「生の金額」）。対象日でなければ0。
// frequency: 'daily'|'weekly'|'monthly'
function rawContribution(a, iso) {
  if (!accumActiveOn(a, iso)) return 0;
  const freq = a.frequency || 'daily';
  if (freq === 'monthly') {
    const day = Number(iso.split('-')[2]);
    const startDay = a.startDate ? Number(a.startDate.split('-')[2]) : day;
    const [y, m] = iso.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    if (day !== Math.min(startDay, last)) return 0;
    return Math.round(n(a.monthlyAmount));
  }
  if (freq === 'weekly') {
    if (!a.startDate) return 0;
    const diff = daysSince(a.startDate, iso);
    if (diff < 0 || diff % 7 !== 0) return 0;
    return Math.round(n(a.dailyAmount));
  }
  return Math.round(n(a.dailyAmount)); // daily
}

// 指定日に実際に約定する積立額。土日祝日の実行設定・非営業日の扱いを反映する。
// ・includeHolidays !== false : 土日祝日も含めてスケジュール通り実行（従来動作）。
// ・includeHolidays === false : 土日祝日（非営業日）は実行しない。
//     nonBusinessDay==='carryover' のときは、直前の連続する非営業日に予定されていた積立を
//     この営業日へまとめて反映する（各予定日は1回だけ・二重処理しない）。
// 実際の積立処理(runAccrualForDate)と将来シミュレーション(futureSim.project)の両方が
// この共通関数を通るため、土日祝日の扱いは全画面で一致する。
export function contributionForDate(a, iso) {
  if (!accumActiveOn(a, iso)) return 0;
  if (a.includeHolidays !== false) return rawContribution(a, iso); // 土日祝日も実行
  if (!isBusinessDay(iso)) return 0;                               // 非営業日は実行しない
  let total = rawContribution(a, iso);                             // 当営業日のスケジュール分
  if ((a.nonBusinessDay || 'skip') === 'carryover') {
    // 直前の連続する非営業日ぶんを繰り越して加算（前の営業日まで遡って一度だけ）
    let cur = prevISO(iso), guard = 0;
    while (guard < 40 && !isBusinessDay(cur) && accumActiveOn(a, cur)) {
      total += rawContribution(a, cur);
      cur = prevISO(cur); guard++;
    }
  }
  return total;
}

// 1口座・1日分の積立を実行（対象はONのインデックス積立設定のみ）。履歴に成否を記録。
// インデックス投資は円建てのため、積立額を 取得価額(cost) と 現在保有額(value) の両方へ加算する。
function runAccrualForDate(acc, iso) {
  for (const a of acc.accumulations || []) {
    const amount = contributionForDate(a, iso);
    if (amount <= 0) continue;
    const h = accountHoldings(acc).find((x) => x.id === a.holdingId);
    const holdingName = h ? h.name : '積立対象';
    if (!h || !isIndex(h)) { pushHistory(acc, { date: iso, holdingId: a.holdingId, holdingName, amount, status: 'failed', reason: '対象ファンドなし' }); continue; }
    if (accountCash(acc) < amount) { pushHistory(acc, { date: iso, holdingId: a.holdingId, holdingName, amount, status: 'failed', reason: '現金不足' }); continue; }
    acc.cash = accountCash(acc) - amount;   // ① 現金から積立額を引く
    h.cost = n(h.cost) + amount;            // ② 総元本へ加算（毎晩23時の積立はここに積み上がる）
    h.value = n(h.value) + amount;          // ③ 現在保有額へ同額を反映（総資産の整合性維持。実評価額は手入力で上書き可）
    pushHistory(acc, { date: iso, holdingId: a.holdingId, holdingName, amount, status: 'success' });
  }
}
function pushHistory(acc, rec) {
  (acc.accumHistory ||= []).push({ id: 'ah_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...rec });
  if (acc.accumHistory.length > 400) acc.accumHistory = acc.accumHistory.slice(-400);
}

// 全証券口座の積立をキャッチアップ実行。実行があれば true。
export function runAccumulations(state) {
  const target = lastAccrualISO();
  let changed = false;
  for (const acc of securitiesAccounts(state)) {
    if (!acc.lastAccumDate) { acc.lastAccumDate = target; continue; } // 初回は遡及しない
    let cur = acc.lastAccumDate, guard = 0;
    while (cur < target && guard < 400) { cur = nextISO(cur); runAccrualForDate(acc, cur); guard++; changed = true; }
    acc.lastAccumDate = target;
    recomputeAccount(acc);
  }
  return changed;
}
