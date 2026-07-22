// securities.js — 証券口座（現金・元本・評価額・保有銘柄・積立・株価取得）のロジック層。
// 設計方針: store.js / calc.js と同じく「純粋関数の集合＋stateを受け取って書き換える処理」で構成し、
// UI（app.js）から独立させる。将来の銘柄追加・別データソース連携は holdings 配列と
// fetchQuotes() の差し替えだけで拡張できる。

import { pad, toISO } from './utils.js?v=20260722s';

// ===== 証券口座の判定・取得 =====
export const isSecurities = (a) => a && a.type === 'securities';
export const securitiesAccounts = (state) => state.accounts.filter(isSecurities);
export const hasSecurities = (state) => state.accounts.some(isSecurities);

// 各種フィールドの安全な数値化
const n = (v) => Number(v) || 0;

// ===== 保有銘柄の評価 =====
// 1銘柄の現在単価（株価取得済みなら price、未取得なら平均取得単価で代用）
export const holdingPrice = (h) => (n(h.price) > 0 ? n(h.price) : n(h.avgPrice));
// 1銘柄の評価額 = 保有数量 × 現在単価
export const holdingValue = (h) => n(h.quantity) * holdingPrice(h);
// 1銘柄の取得原価 = 保有数量 × 平均取得単価
export const holdingCost = (h) => n(h.quantity) * n(h.avgPrice);
// 1銘柄の損益・損益率
export function holdingPL(h) {
  const value = holdingValue(h);
  const cost = holdingCost(h);
  const diff = value - cost;
  return { value, cost, diff, rate: cost > 0 ? (diff / cost) * 100 : null };
}
// 1銘柄の前日比（株価取得時のみ算出可能）
export function holdingDayChange(h) {
  const price = holdingPrice(h);
  const prev = n(h.prevClose);
  if (prev <= 0 || n(h.price) <= 0) return null;
  const diff = (price - prev) * n(h.quantity);
  const pct = prev > 0 ? ((price - prev) / prev) * 100 : null;
  return { diff, pct, priceDiff: price - prev };
}

// ===== 口座単位の集計 =====
export const accountHoldings = (acc) => acc.holdings || [];
// 口座の評価額（保有銘柄の評価額合計。現金は含めない）
export const accountValuation = (acc) =>
  accountHoldings(acc).reduce((s, h) => s + holdingValue(h), 0);
// 区分別の評価額
export function accountValuationByKind(acc) {
  let index = 0, stock = 0;
  for (const h of accountHoldings(acc)) {
    if (h.kind === 'stock') stock += holdingValue(h);
    else index += holdingValue(h);
  }
  return { index, stock };
}
export const accountCash = (acc) => n(acc.cash);
export const accountPrincipal = (acc) => n(acc.principal);
// 口座の合計残高（総資産への寄与）＝ 現金 ＋ 評価額
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
  let cash = 0, principal = 0, index = 0, stock = 0;
  for (const a of accs) {
    cash += accountCash(a);
    principal += accountPrincipal(a);
    const k = accountValuationByKind(a);
    index += k.index; stock += k.stock;
  }
  const valuation = index + stock;              // 総評価額（保有銘柄のみ）
  const profit = valuation - principal;          // 評価損益 = 評価額 − 元本
  const profitRate = principal > 0 ? (profit / principal) * 100 : null; // 利益率(%)
  return {
    accounts: accs, count: accs.length,
    cash, principal, valuation, index, stock, profit, profitRate,
    total: cash + valuation,
  };
}

// ===== 保有割合（インデックス / 個別株 / 現金） =====
// 評価額ベースの構成比。現金割合も含める。
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
// 保有銘柄だけの割合（インデックス vs 個別株。現金を除く）
export function holdingAllocation(state) {
  const p = portfolio(state);
  const base = p.index + p.stock;
  const pct = (v) => (base > 0 ? (v / base) * 100 : 0);
  return { base, index: { value: p.index, pct: pct(p.index) }, stock: { value: p.stock, pct: pct(p.stock) } };
}

// ===== 元本・取得単価の更新（購入・積立で共通） =====
// 数量を買い増し、平均取得単価を加重平均で更新する純粋ヘルパー。
export function applyBuy(holding, addQty, unitPrice) {
  const prevQty = n(holding.quantity);
  const prevCost = prevQty * n(holding.avgPrice);
  const newQty = prevQty + addQty;
  const newCost = prevCost + addQty * unitPrice;
  holding.quantity = newQty;
  holding.avgPrice = newQty > 0 ? newCost / newQty : 0;
}

// ===== 個別株の購入 =====
// 現金から購入金額を引き、元本へ加算、保有数量・平均取得単価を更新。
// 現金不足の場合は実行せず false を返す。
export function purchaseStock(state, accountId, holdingId, shares, price, dateISO) {
  const acc = state.accounts.find((a) => a.id === accountId);
  if (!acc || !isSecurities(acc)) return { ok: false, reason: 'account' };
  const h = accountHoldings(acc).find((x) => x.id === holdingId);
  if (!h) return { ok: false, reason: 'holding' };
  const amount = Math.round(n(shares) * n(price));
  if (amount <= 0) return { ok: false, reason: 'amount' };
  if (accountCash(acc) < amount) return { ok: false, reason: 'cash', amount };
  acc.cash = accountCash(acc) - amount;
  acc.principal = accountPrincipal(acc) + amount;
  applyBuy(h, n(shares), n(price));
  // 直近価格が無い銘柄は購入単価を暫定の現在値として設定
  if (n(h.price) <= 0) h.price = n(price);
  (acc.purchases ||= []).push({ id: 'pur_' + Date.now().toString(36), holdingId, holdingName: h.name, shares: n(shares), price: n(price), amount, date: dateISO });
  recomputeAccount(acc);
  return { ok: true, amount };
}

// ===================================================================
// 積立処理（日本時間23:00）
// ===================================================================
// クライアントアプリのため真のサーバーcronは持てない。代わりにアプリ起動時に
// 「前回処理日の翌日〜直近の実行対象日」までを日ごとに追いかけて実行する（キャッチアップ方式）。
// これにより端末を開くたびに、経過した各日の23:00積立が確定する。

// 現在の日本時間（UTC+9）を Date として返す（getUTC* で JST の年月日時が読める）
function jstDate(ms = Date.now()) { return new Date(ms + 9 * 3600 * 1000); }
export function jstTodayISO() {
  const d = jstDate();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
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

const accumActiveOn = (a, iso) =>
  a.enabled !== false && (!a.startDate || iso >= a.startDate) && (!a.endDate || iso <= a.endDate);

// 1口座・1日分の積立を実行（対象はONのインデックス積立設定のみ）。履歴に成否を記録。
function runAccrualForDate(acc, iso) {
  for (const a of acc.accumulations || []) {
    if (!accumActiveOn(a, iso)) continue;
    const h = accountHoldings(acc).find((x) => x.id === a.holdingId);
    const holdingName = h ? h.name : '積立対象';
    const amount = Math.round(n(a.dailyAmount));
    if (amount <= 0) continue;
    if (!h) {
      pushHistory(acc, { date: iso, holdingId: a.holdingId, holdingName, amount, status: 'failed', reason: '対象銘柄なし' });
      continue;
    }
    if (accountCash(acc) < amount) {
      pushHistory(acc, { date: iso, holdingId: a.holdingId, holdingName, amount, status: 'failed', reason: '現金不足' });
      continue;
    }
    // ① 現金から積立額を引く ② 元本へ加算 ③ 数量・平均取得単価を更新
    acc.cash = accountCash(acc) - amount;
    acc.principal = accountPrincipal(acc) + amount;
    const unit = holdingPrice(h);
    if (unit > 0) applyBuy(h, amount / unit, unit);
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
    // 初回（未設定）は当日以前の遡及を避けるため、対象日を基準として次回から実行
    if (!acc.lastAccumDate) { acc.lastAccumDate = target; continue; }
    let cur = acc.lastAccumDate;
    let guard = 0;
    while (cur < target && guard < 400) {
      cur = nextISO(cur);
      runAccrualForDate(acc, cur);
      guard++;
      changed = true;
    }
    acc.lastAccumDate = target;
    recomputeAccount(acc);
  }
  return changed;
}

// ===================================================================
// 株価の取得と反映（毎日自動更新）
// ===================================================================
// サーバー側プロキシ /api/stocks/quote?symbols=... を利用（APIキーはサーバー保持）。
// ティッカー未設定・取得失敗の銘柄はスキップし、他銘柄の更新は止めない。

// 更新対象のティッカー一覧（重複排除）
export function tickersToUpdate(state) {
  const set = new Set();
  for (const acc of securitiesAccounts(state))
    for (const h of accountHoldings(acc))
      if (h.ticker && String(h.ticker).trim()) set.add(String(h.ticker).trim().toUpperCase());
  return [...set];
}

// 今日（JST）まだ株価を更新していなければ true
export function quotesStale(state) {
  const accs = securitiesAccounts(state);
  if (!accs.length) return false;
  if (!tickersToUpdate(state).length) return false;
  const today = jstTodayISO();
  return accs.some((a) => (a.lastQuoteDate || '') !== today);
}

// /api/stocks/quote を呼び、{ SYM: {price, prevClose, ...} } を返す。失敗銘柄は errors。
export async function fetchQuotes(tickers) {
  if (!tickers.length) return { quotes: {}, errors: tickers };
  try {
    const res = await fetch(`/api/stocks/quote?symbols=${encodeURIComponent(tickers.join(','))}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    return { quotes: j.quotes || {}, errors: j.errors || [] };
  } catch (e) {
    return { quotes: {}, errors: tickers, error: e };
  }
}

// 取得済みquotesをstateへ反映（純粋なmutator）。取得できた銘柄のみ price/prevClose を更新。
export function applyQuotes(state, quotes) {
  const today = jstTodayISO();
  const nowISO = toISO(new Date());
  let updated = 0;
  for (const acc of securitiesAccounts(state)) {
    for (const h of accountHoldings(acc)) {
      const sym = h.ticker && String(h.ticker).trim().toUpperCase();
      const q = sym && quotes[sym];
      if (q && Number(q.price) > 0) {
        h.price = q.price;
        if (Number(q.prevClose) > 0) h.prevClose = q.prevClose;
        h.updatedAt = nowISO;
        updated++;
      }
    }
    acc.lastQuoteDate = today;
    // 評価額履歴（日次スナップショット。同日は上書き）
    recomputeAccount(acc);
    const value = accountValuation(acc);
    acc.valuations ||= [];
    const last = acc.valuations[acc.valuations.length - 1];
    if (last && last.date === today) last.value = value;
    else acc.valuations.push({ date: today, value });
    if (acc.valuations.length > 400) acc.valuations = acc.valuations.slice(-400);
  }
  return updated;
}
