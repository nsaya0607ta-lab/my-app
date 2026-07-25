// securities.js — 証券口座（預り金・出金余力・決済待ち・元本・評価額・保有銘柄・積立）のロジック層。
// 設計方針: store.js / calc.js と同じく「純粋関数の集合＋stateを受け取って書き換える処理」で構成し、
// UI（app.js）から独立させる。すべての金額はユーザーが入力したデータのみから計算する（外部API・ダミー値は使わない）。
//
// 【現金まわりの3つの金額】証券会社の画面と同じ考え方で、次の3つを別々に管理する。
//   ・預り金(acc.cash)     … 証券口座に表示されている現金残高。買付の受渡日に正式に減る。
//   ・決済待ち(acc.pending) … 約定済みだがまだ受渡が済んでいない買付代金の合計。
//   ・出金余力              … 預り金 − 決済待ち。いま銀行へ出金できる金額。
// 株を購入・約定した時点では預り金はまだ減らないが、その代金は使用予定のため出金できない。
//   例) 預り金10万円で3万円購入 → 直後: 預り金10万/出金余力7万/決済待ち3万
//                                正式反映後: 預り金7万/出金余力7万/決済待ち0
// 受渡日（＝預り金へ正式反映される日）は約定日の SETTLE_BUSINESS_DAYS 営業日後。
// 日本または米国が休みの日は数えず、日本時間10時ごろに反映される想定で処理する。
//
// 保有銘柄は2種類を1つの holdings[] 配列に kind で判別して保持する:
//   ・個別株(kind:'stock')  … 米国株。USD建て＋ドル円で円換算
//       { name, ticker, kind:'stock', quantity, costUsd, priceUsd, fxRate, memo }
//   ・インデックス(kind:'index') … 円建て。数量・基準価額は管理しない
//       { name, kind:'index', nisaFrame:'growth'|'tsumitate', cost, value, memo }

import { pad, toISO } from './utils.js?v=20260725b';
import { isBusinessDay, prevISO, tradeSettlementDate } from './holidays.js?v=20260725b';

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

// ===== 受渡（決済）の既定値 =====
// 米国株・米国指数の積立は、通常 購入（約定）から2営業日後に預り金へ正式反映される。
export const SETTLE_BUSINESS_DAYS = 2;
// 受渡が反映される日本時間の時刻（この時刻を過ぎた受渡日ぶんを預り金へ反映する）
export const SETTLE_HOUR_JST = 10;

// ===== 口座単位の集計 =====
export const accountHoldings = (acc) => acc.holdings || [];
// 決済待ち（約定済み・受渡前の買付代金）の明細 [{id,kind,holdingId,holdingName,amount,tradeDate,settleDate,memo}]
export const accountPendings = (acc) => acc.pending || [];
// 預り金＝証券口座に表示されている現金残高（受渡前の買付代金はまだ引かれていない）
export const accountDeposit = (acc) => n(acc.cash);
// 決済待ち＝受渡前の買付代金の合計
export const accountPendingTotal = (acc) => accountPendings(acc).reduce((s, p) => s + n(p.amount), 0);
// 出金余力＝預り金 − 決済待ち（いま銀行へ出金できる金額）
export const accountWithdrawable = (acc) => accountDeposit(acc) - accountPendingTotal(acc);
// ※ 旧 accountCash は廃止。「現金」は預り金(accountDeposit)と出金余力(accountWithdrawable)の
//    どちらを指すかが曖昧なため、呼び出し側で必ずどちらかを明示する。
// 口座ごとの受渡日数（営業日）。未設定なら既定の2営業日。
export function accountSettleDays(acc) {
  const v = Number(acc?.settleDays);
  return Number.isFinite(v) && v >= 0 ? Math.round(v) : SETTLE_BUSINESS_DAYS;
}
// 約定日に対する受渡日（日本・米国の祝日を除いた営業日で数える）
export const settleDateFor = (acc, tradeISO) => tradeSettlementDate(tradeISO, accountSettleDays(acc));

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
// 合計残高（総資産への寄与）＝ 預り金 ＋ 評価額（インデックス評価額＋個別株評価額）。
// 証券会社の口座画面に表示される残高に合わせるため、預り金をそのまま使う（出金余力は使わない）。
export const accountTotal = (acc) => accountDeposit(acc) + accountValuation(acc);

// 証券口座の balance を「預り金＋評価額」で再計算して同期する（総資産計算はbalanceを参照するため）
export function recomputeAccount(acc) {
  if (!isSecurities(acc)) return;
  acc.cash = Math.round(n(acc.cash));
  for (const p of accountPendings(acc)) p.amount = Math.round(n(p.amount));
  acc.balance = Math.round(accountTotal(acc));
}
export function recomputeAll(state) {
  for (const a of securitiesAccounts(state)) recomputeAccount(a);
}

// ===== 全証券口座の横断集計（ホーム画面・利益率） =====
export function portfolio(state) {
  const accs = securitiesAccounts(state);
  let deposit = 0, pending = 0, cost = 0, index = 0, stock = 0;
  for (const a of accs) {
    deposit += accountDeposit(a);
    pending += accountPendingTotal(a);
    cost += accountCost(a);
    const k = accountValuationByKind(a);
    index += k.index; stock += k.stock;
  }
  const withdrawable = deposit - pending;        // 出金余力
  const valuation = index + stock;               // 総評価額（保有銘柄のみ）
  const profit = valuation - cost;               // 評価損益 = 評価額 − 元本(取得額)
  const profitRate = cost > 0 ? (profit / cost) * 100 : null; // 利益率(%)
  return {
    accounts: accs, count: accs.length,
    deposit, pending, withdrawable,
    cash: withdrawable, // 資産計算に使う「現金」は二重計上を避けるため出金余力
    cost, principal: cost, valuation, index, stock, profit, profitRate,
    total: deposit + valuation,
  };
}

// ===== 保有割合（インデックス / 個別株 / 現金。米国株は円換算後の評価額） =====
// 「現金」は出金余力を使う。決済待ちぶんは保有銘柄の評価額側に既に含まれているため。
export function allocation(state) {
  const p = portfolio(state);
  const base = p.index + p.stock + p.withdrawable;
  const pct = (v) => (base > 0 ? (v / base) * 100 : 0);
  return {
    base,
    index: { value: p.index, pct: pct(p.index) },
    stock: { value: p.stock, pct: pct(p.stock) },
    cash: { value: p.withdrawable, pct: pct(p.withdrawable) },
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

// ===== 決済待ち（受渡前の買付代金）の記録 =====
const newId = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// 約定した買付を「決済待ち」へ積む。預り金はこの時点では減らさず、受渡日に減る。
export function addPending(acc, { kind, holdingId, holdingName, amount, tradeDate, memo }) {
  const rec = {
    id: newId('pnd'), kind, holdingId: holdingId || null, holdingName: holdingName || '',
    amount: Math.round(n(amount)), tradeDate,
    settleDate: settleDateFor(acc, tradeDate), memo: memo || '',
  };
  (acc.pending ||= []).push(rec);
  return rec;
}

// 受渡済みの記録（履歴表示用。最新200件を保持）
function pushSettled(acc, p, settledOn) {
  (acc.settlements ||= []).push({ ...p, id: newId('stl'), pendingId: p.id, settledOn });
  if (acc.settlements.length > 200) acc.settlements = acc.settlements.slice(-200);
}

// ===== 個別株の購入 =====
// 購入金額（円＝株数×購入単価USD×ドル円）を決済待ちへ積み、保有数量・取得単価を更新。
// 預り金はこの時点では減らさず、受渡日（既定で2営業日後）に正式反映される。
// 元本は取得額の合計として自動的に増える。出金余力が不足していれば実行しない。
export function purchaseStock(state, accountId, holdingId, shares, priceUsd, fx, dateISO) {
  const acc = state.accounts.find((a) => a.id === accountId);
  if (!acc || !isSecurities(acc)) return { ok: false, reason: 'account' };
  const h = accountHoldings(acc).find((x) => x.id === holdingId);
  if (!h || isIndex(h)) return { ok: false, reason: 'holding' };
  const rate = n(fx) || n(h.fxRate);
  const amount = Math.round(n(shares) * n(priceUsd) * rate);
  if (amount <= 0) return { ok: false, reason: 'amount' };
  const available = accountWithdrawable(acc);
  if (available < amount) return { ok: false, reason: 'cash', amount, available };
  const tradeDate = dateISO || jstTodayISO();
  applyBuyUsd(h, n(shares), n(priceUsd), rate);
  const pend = addPending(acc, { kind: 'stock', holdingId, holdingName: h.name, amount, tradeDate });
  (acc.purchases ||= []).push({
    id: newId('pur'), holdingId, holdingName: h.name, shares: n(shares), priceUsd: n(priceUsd),
    fxRate: rate, amount, date: tradeDate, settleDate: pend.settleDate, pendingId: pend.id,
  });
  recomputeAccount(acc);
  return { ok: true, amount, settleDate: pend.settleDate };
}

// 決済待ちを手動で「今すぐ預り金へ反映」する（受渡日前でも実際の口座に合わせられるように）。
export function settlePendingNow(state, accountId, pendingId) {
  const acc = state.accounts.find((a) => a.id === accountId);
  if (!acc || !isSecurities(acc)) return false;
  const p = accountPendings(acc).find((x) => x.id === pendingId);
  if (!p) return false;
  acc.cash = n(acc.cash) - n(p.amount);
  acc.pending = accountPendings(acc).filter((x) => x.id !== pendingId);
  pushSettled(acc, p, jstTodayISO());
  recomputeAccount(acc);
  return true;
}

// 決済待ちを取り消す（誤登録の削除。預り金は動かさない）。
export function removePending(state, accountId, pendingId) {
  const acc = state.accounts.find((a) => a.id === accountId);
  if (!acc || !isSecurities(acc)) return false;
  const before = accountPendings(acc).length;
  acc.pending = accountPendings(acc).filter((x) => x.id !== pendingId);
  recomputeAccount(acc);
  return acc.pending.length !== before;
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
  // secCash は「証券口座の現金」として合計資産に足される値のため、二重計上を避けて出金余力を使う。
  // 預り金・決済待ちは内訳として別に持つ。
  let secCash = 0, secDeposit = 0, secPending = 0;
  let nisaPrincipal = 0, nisaValue = 0, stockPrincipal = 0, stockValue = 0;
  const holdings = [];
  for (const a of accs) {
    secCash += accountWithdrawable(a);
    secDeposit += accountDeposit(a);
    secPending += accountPendingTotal(a);
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
    secDeposit: Math.round(secDeposit), secPending: Math.round(secPending),
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
// 積立代金は約定した時点では預り金から引かず「決済待ち」へ積み、受渡日に預り金へ正式反映する。
function runAccrualForDate(acc, iso) {
  for (const a of acc.accumulations || []) {
    const amount = contributionForDate(a, iso);
    if (amount <= 0) continue;
    const h = accountHoldings(acc).find((x) => x.id === a.holdingId);
    const holdingName = h ? h.name : '積立対象';
    if (!h || !isIndex(h)) { pushHistory(acc, { date: iso, holdingId: a.holdingId, holdingName, amount, status: 'failed', reason: '対象ファンドなし' }); continue; }
    // 判定は預り金ではなく出金余力（＝すでに使用予定の決済待ちを除いた金額）で行う。
    if (accountWithdrawable(acc) < amount) { pushHistory(acc, { date: iso, holdingId: a.holdingId, holdingName, amount, status: 'failed', reason: '出金余力不足' }); continue; }
    h.cost = n(h.cost) + amount;            // ① 総元本へ加算（毎晩23時の積立はここに積み上がる）
    h.value = n(h.value) + amount;          // ② 現在保有額へ同額を反映（総資産の整合性維持。実評価額は手入力で上書き可）
    // ③ 代金は決済待ちへ。預り金は受渡日（既定で2営業日後の日本時間10時ごろ）に減る。
    const pend = addPending(acc, { kind: 'index', holdingId: a.holdingId, holdingName, amount, tradeDate: iso });
    pushHistory(acc, { date: iso, holdingId: a.holdingId, holdingName, amount, status: 'success', settleDate: pend.settleDate });
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

// ===================================================================
// 受渡処理（決済待ち → 預り金への正式反映）
// ===================================================================
// 受渡日の日本時間10時ごろに、その買付代金が預り金から正式に引かれる。
// 積立と同じくアプリ起動時のキャッチアップ方式で、受渡日を過ぎた決済待ちをまとめて反映する。

// 「10時を過ぎて反映済みとみなせる最新の受渡日」。JST10時以降なら今日、未満なら昨日。
export function lastSettlementISO() {
  const d = jstDate();
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  if (d.getUTCHours() >= SETTLE_HOUR_JST) return `${y}-${pad(m + 1)}-${pad(day)}`;
  const prev = new Date(Date.UTC(y, m, day - 1));
  return `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`;
}

// 全証券口座で、受渡日を過ぎた決済待ちを預り金へ反映する。反映があれば true。
export function runSettlements(state) {
  const target = lastSettlementISO();
  let changed = false;
  for (const acc of securitiesAccounts(state)) {
    const due = accountPendings(acc).filter((p) => p.settleDate && p.settleDate <= target);
    if (!due.length) continue;
    for (const p of due) {
      acc.cash = n(acc.cash) - n(p.amount); // 預り金から正式に引かれる（出金余力は変わらない）
      pushSettled(acc, p, target);
    }
    acc.pending = accountPendings(acc).filter((p) => !(p.settleDate && p.settleDate <= target));
    recomputeAccount(acc);
    changed = true;
  }
  return changed;
}
