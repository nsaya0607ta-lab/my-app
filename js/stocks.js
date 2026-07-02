/* =========================================================================
   株価カード（STOCKS）用の実株価取得。
   Finnhub（https://finnhub.io）の無料APIを使用する。
   - /quote : 現在値・前日終値のみを取得する（チャートは表示しないため
     日足candleの取得は行わない）

   APIキー・銘柄一覧は finnhub-config.js に集約している。

   Finnhubは元々ブラウザからの直接呼び出しを想定してCORSを許可しているため、
   まず直接fetchし、失敗した場合のみ無料CORSプロキシ経由にフォールバックする。
   ========================================================================= */

import { fetchDirectOrProxied } from './cors-proxy.js';
import { FINNHUB_API_KEY, STOCK_TICKERS, STOCK_NAMES, FIXED_INSTRUMENTS } from './finnhub-config.js';

export { STOCK_TICKERS, FIXED_INSTRUMENTS };

const FETCH_TIMEOUT_MS = 8000;
const CACHE_KEY = "stocks_cache_v8"; // 6銘柄化・チャート再廃止に伴いキーを更新（旧キャッシュを無効化）
const CACHE_TTL_MS = 60 * 1000; // 60秒キャッシュ（Finnhub無料枠は60req/分なので十分余裕がある）
const FIXED_CACHE_KEY = "stocks_fixed_cache_v1";
const FIXED_CACHE_TTL_MS = 60 * 1000;

async function fetchQuote(ticker) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_API_KEY}`;
  const res = await fetchDirectOrProxied(url, { timeoutMs: FETCH_TIMEOUT_MS });
  const q = await res.json();
  if (typeof q.c !== "number" || q.c === 0 || typeof q.pc !== "number") {
    throw new Error("invalid quote (APIキー未設定または無効な可能性): " + JSON.stringify(q));
  }
  return q; // { c: 現在値, pc: 前日終値, d, dp, h, l, o, t }
}

async function fetchStockData(ticker) {
  const q = await fetchQuote(ticker);
  const previousClose = q.pc;
  const price = q.c;
  const change = ((price - previousClose) / previousClose) * 100; // 前日終値比

  return {
    ticker,
    name: STOCK_NAMES[ticker] || ticker,
    price,
    previousClose,
    change,
  };
}

function loadCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (raw && Array.isArray(raw.items) && raw.items.length && (Date.now() - raw.savedAt) < CACHE_TTL_MS) {
      return raw.items;
    }
  } catch (e) {}
  return null;
}

function saveCache(items) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items })); } catch (e) {}
}

// 実際の株価を取得（6銘柄）。銘柄ごとに成否を判定し、失敗した銘柄は配列内で
// null を返す（呼び出し側はその銘柄だけフォールバックに回せる）。
// APIキー未設定の間は通信を試みず、常にサンプル表示にする。
export async function getLiveStocks() {
  if (!FINNHUB_API_KEY || FINNHUB_API_KEY === "YOUR_FINNHUB_API_KEY") return null;

  const cached = loadCache();
  if (cached) return cached;

  const settled = await Promise.allSettled(STOCK_TICKERS.map(fetchStockData));
  const results = settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    console.warn(`[stocks] ${STOCK_TICKERS[i]} の株価取得に失敗しました:`, r.reason?.message || r.reason);
    return null;
  });
  if (results.every(r => r === null)) return null;
  saveCache(results);
  return results;
}

async function fetchFixedInstrumentData(item) {
  const q = await fetchQuote(item.symbol);
  const previousClose = q.pc;
  const price = q.c;
  const change = ((price - previousClose) / previousClose) * 100;
  return { symbol: item.symbol, name: item.name, price, previousClose, change };
}

function loadFixedCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(FIXED_CACHE_KEY) || "null");
    if (raw && Array.isArray(raw.items) && raw.items.length && (Date.now() - raw.savedAt) < FIXED_CACHE_TTL_MS) {
      return raw.items;
    }
  } catch (e) {}
  return null;
}

function saveFixedCache(items) {
  try { localStorage.setItem(FIXED_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items })); } catch (e) {}
}

// STOCKSカード右側に固定表示するドル円・FANG+の実値を取得する。
// 個別株と同じ耐障害設計（銘柄ごとにnull許容・全滅時のみnull）。
export async function getFixedInstruments() {
  if (!FINNHUB_API_KEY || FINNHUB_API_KEY === "YOUR_FINNHUB_API_KEY") return null;

  const cached = loadFixedCache();
  if (cached) return cached;

  const settled = await Promise.allSettled(FIXED_INSTRUMENTS.map(fetchFixedInstrumentData));
  const results = settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    console.warn(`[stocks] ${FIXED_INSTRUMENTS[i].name} の取得に失敗しました:`, r.reason?.message || r.reason);
    return null;
  });
  if (results.every(r => r === null)) return null;
  saveFixedCache(results);
  return results;
}
