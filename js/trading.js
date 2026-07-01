/* =========================================================================
   模擬投資（ペーパートレード）ロジック
   株価カード（STOCKS）向けの売買シミュレーション。実際の証券口座とは
   一切連携しない、アプリ内通貨(AC)だけで完結するお遊び機能。
   価格は js/render.js 側で保持するサンプル株価（擬似的に変動）を使う。
   ========================================================================= */

import { saveCoins } from './core.js';
import { S } from './state.js';

export const FEE_RATE = 0.005; // 取引額の0.5%を手数料として徴収

const PORTFOLIO_KEY = "trading_portfolio_v1";
const ORDERS_KEY = "trading_orders_v1";

export let portfolio = {};     // { MSFT: { shares, avgCost }, ... }
export let pendingOrders = []; // [{ id, ticker, side, qty, limitPrice, createdAt }]

export function loadPortfolio() {
  try { portfolio = JSON.parse(localStorage.getItem(PORTFOLIO_KEY) || "{}") || {}; } catch (e) { portfolio = {}; }
  try { pendingOrders = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]") || []; } catch (e) { pendingOrders = []; }
}

function savePortfolio() {
  try { localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(portfolio)); } catch (e) {}
  try { localStorage.setItem(ORDERS_KEY, JSON.stringify(pendingOrders)); } catch (e) {}
}

export function getPosition(ticker) {
  return portfolio[ticker] || { shares: 0, avgCost: 0 };
}

// 手数料は円未満（セント未満）を四捨五入して見やすくする
export function calcFee(amount) {
  return Math.round(amount * FEE_RATE * 100) / 100;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// 成行注文：現在価格で即時に売買を成立させる
export function executeMarketOrder(ticker, side, qty, price) {
  qty = Math.max(1, Math.floor(qty));
  const pos = getPosition(ticker);

  if (side === "buy") {
    const cost = price * qty;
    const fee = calcFee(cost);
    const total = round2(cost + fee);
    if ((S.coins || 0) < total) {
      return { ok: false, msg: `ACが不足しています（必要 ${total.toFixed(2)} AC）` };
    }
    S.coins = round2((S.coins || 0) - total);
    const newShares = pos.shares + qty;
    const newAvgCost = (pos.shares * pos.avgCost + qty * price) / newShares;
    portfolio[ticker] = { shares: newShares, avgCost: newAvgCost };
    saveCoins(S.coins);
    savePortfolio();
    return { ok: true, side, qty, price, cost: round2(cost), fee, total };
  }

  // side === "sell"
  if (pos.shares < qty) {
    return { ok: false, msg: `保有株数が不足しています（保有 ${pos.shares}株）` };
  }
  const proceeds = price * qty;
  const fee = calcFee(proceeds);
  const net = round2(proceeds - fee);
  S.coins = round2((S.coins || 0) + net);
  const remainShares = pos.shares - qty;
  if (remainShares > 0) portfolio[ticker] = { shares: remainShares, avgCost: pos.avgCost };
  else delete portfolio[ticker];
  saveCoins(S.coins);
  savePortfolio();
  return { ok: true, side, qty, price, proceeds: round2(proceeds), fee, net };
}

// 指値注文：条件に一致するまで予約しておく（checkLimitOrders が定期的に判定）
export function placeLimitOrder(ticker, side, qty, limitPrice) {
  qty = Math.max(1, Math.floor(qty));
  if (!(limitPrice > 0)) return { ok: false, msg: "指値価格を正しく入力してください。" };
  if (side === "sell") {
    const pos = getPosition(ticker);
    if (pos.shares < qty) return { ok: false, msg: `保有株数が不足しています（保有 ${pos.shares}株）` };
  }
  const order = { id: Date.now() + "-" + Math.random().toString(36).slice(2), ticker, side, qty, limitPrice, createdAt: Date.now() };
  pendingOrders.push(order);
  savePortfolio();
  return { ok: true, order };
}

export function cancelOrder(id) {
  pendingOrders = pendingOrders.filter(o => o.id !== id);
  savePortfolio();
}

export function ordersFor(ticker) {
  return pendingOrders.filter(o => o.ticker === ticker);
}

// 現在価格を渡し、条件を満たした指値注文だけ成行として約定させる
export function checkLimitOrders(getPriceFn) {
  const remaining = [];
  const executed = [];
  pendingOrders.forEach(o => {
    const price = getPriceFn(o.ticker);
    const triggered = price != null && (o.side === "buy" ? price <= o.limitPrice : price >= o.limitPrice);
    if (!triggered) { remaining.push(o); return; }
    const res = executeMarketOrder(o.ticker, o.side, o.qty, price);
    if (res.ok) executed.push({ order: o, result: res });
    else remaining.push(o); // AC・株数不足なら注文を残して次回再判定
  });
  pendingOrders = remaining;
  savePortfolio();
  return executed;
}

// 評価損益（含み損益）。保有していない場合は 0 を返す
export function unrealizedPL(ticker, currentPrice) {
  const pos = getPosition(ticker);
  if (!pos.shares) return { shares: 0, avgCost: 0, amount: 0, pct: 0 };
  const amount = round2((currentPrice - pos.avgCost) * pos.shares);
  const pct = pos.avgCost ? ((currentPrice - pos.avgCost) / pos.avgCost) * 100 : 0;
  return { shares: pos.shares, avgCost: pos.avgCost, amount, pct };
}
