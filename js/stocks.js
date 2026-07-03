/* =========================================================================
   株価カード（STOCKS）用の実株価取得。
   Finnhub（https://finnhub.io）の無料APIを使用する。
   - /quote : 現在値・前日終値のみを取得する（チャートは表示しないため
     日足candleの取得は行わない）

   APIキー・銘柄一覧は finnhub-config.js に集約している。米国株
   （STOCK_TICKERS）・日本株（STOCK_TICKERS_JP、東証銘柄は".T"サフィックス
   付きのFinnhubシンボル表記）のどちらも同じgetLiveStocksFor()を通すため、
   取得条件（キャッシュ・タイムアウト・銘柄ごとの成否判定）は完全に同一。

   Finnhubは元々ブラウザからの直接呼び出しを想定してCORSを許可しているため、
   まず直接fetchし、失敗した場合のみ無料CORSプロキシ経由にフォールバックする。
   ========================================================================= */

import { fetchDirectOrProxied } from './cors-proxy.js';
import { FINNHUB_API_KEY, STOCK_TICKERS, STOCK_NAMES, STOCK_TICKERS_JP, STOCK_NAMES_JP } from './finnhub-config.js';

export { STOCK_TICKERS, STOCK_TICKERS_JP };

const FETCH_TIMEOUT_MS = 8000;
const CACHE_KEY = "stocks_cache_v8"; // 6銘柄化・チャート再廃止に伴いキーを更新（旧キャッシュを無効化）
const CACHE_KEY_JP = "stocks_cache_jp_v1";
const CACHE_TTL_MS = 60 * 1000; // 60秒キャッシュ（Finnhub無料枠は60req/分なので十分余裕がある）

async function fetchQuote(ticker) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${FINNHUB_API_KEY}`;
  const res = await fetchDirectOrProxied(url, { timeoutMs: FETCH_TIMEOUT_MS });
  const q = await res.json();
  if (typeof q.c !== "number" || q.c === 0 || typeof q.pc !== "number") {
    throw new Error("invalid quote (APIキー未設定、無効なシンボル、または当該取引所が無料枠で未対応の可能性): " + JSON.stringify(q));
  }
  return q; // { c: 現在値, pc: 前日終値, d, dp, h, l, o, t }
}

async function fetchStockData(ticker, names) {
  const q = await fetchQuote(ticker);
  const previousClose = q.pc;
  const price = q.c;
  const change = ((price - previousClose) / previousClose) * 100; // 前日終値比

  return {
    ticker,
    name: (names && names[ticker]) || ticker,
    price,
    previousClose,
    change,
  };
}

function loadCache(cacheKey) {
  try {
    const raw = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (raw && Array.isArray(raw.items) && raw.items.length && (Date.now() - raw.savedAt) < CACHE_TTL_MS) {
      return raw.items;
    }
  } catch (e) {}
  return null;
}

function saveCache(cacheKey, items) {
  try { localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), items })); } catch (e) {}
}

// 実際の株価を取得。銘柄ごとに成否を判定し、失敗した銘柄は配列内で
// null を返す（呼び出し側はその銘柄だけフォールバックに回せる）。
// APIキー未設定の間は通信を試みず、常にサンプル表示にする。
async function getLiveStocksFor(tickers, names, cacheKey) {
  if (!FINNHUB_API_KEY || FINNHUB_API_KEY === "YOUR_FINNHUB_API_KEY") return null;

  const cached = loadCache(cacheKey);
  if (cached) return cached;

  const settled = await Promise.allSettled(tickers.map(t => fetchStockData(t, names)));
  const results = settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    console.warn(`[stocks] ${tickers[i]} の株価取得に失敗しました:`, r.reason?.message || r.reason);
    return null;
  });
  if (results.every(r => r === null)) return null;
  saveCache(cacheKey, results);
  return results;
}

// 米国株6銘柄（MSFT/AMZN/GOOGL/AAPL/META/NVDA）
export async function getLiveStocks() {
  return getLiveStocksFor(STOCK_TICKERS, STOCK_NAMES, CACHE_KEY);
}

// 日本株・国内指標（日経平均・TOPIX・トヨタ・三菱UFJ・ソニーG・ソフトバンクG）。
// 米国株と全く同じ取得条件（キャッシュ・タイムアウト・銘柄ごとのフォールバック）
export async function getLiveStocksJP() {
  return getLiveStocksFor(STOCK_TICKERS_JP, STOCK_NAMES_JP, CACHE_KEY_JP);
}
