/* =========================================================================
   株価カード（STOCKS）用の実株価取得。
   Yahoo Finance の公開チャートAPIをCORSプロキシ経由で取得する。
   取得できない場合は null を返し、呼び出し側（render.js）が
   保持しているサンプル株価で動作を継続する。
   ========================================================================= */

import { fetchViaProxies } from './cors-proxy.js';

export const STOCK_TICKERS = ["MSFT", "AMZN", "GOOGL"];
const STOCK_NAMES = { MSFT: "Microsoft", AMZN: "Amazon", GOOGL: "Alphabet" };

const FETCH_TIMEOUT_MS = 8000;
const CACHE_KEY = "stocks_cache_v1";
const CACHE_TTL_MS = 45 * 1000; // 45秒キャッシュ（相場は動くのでニュースより短め）

async function fetchQuote(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1mo&interval=1d`;
  const res = await fetchViaProxies(url, { timeoutMs: FETCH_TIMEOUT_MS });
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error("no data for " + ticker);

  const meta = result.meta || {};
  const price = meta.regularMarketPrice;
  const prevClose = meta.previousClose ?? meta.chartPreviousClose;
  if (typeof price !== "number" || !prevClose) throw new Error("invalid quote for " + ticker);

  const closes = (result.indicators?.quote?.[0]?.close || []).filter(v => typeof v === "number");
  const change = ((price - prevClose) / prevClose) * 100;

  return {
    ticker,
    name: STOCK_NAMES[ticker] || ticker,
    price,
    change,
    trend: closes.length ? closes : [prevClose, price],
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

// 実際の株価を取得（3銘柄）。1銘柄でも失敗すれば全体を失敗として null を返す
// （一部だけ実データ・一部だけモックの混在は表示が不自然になるため避ける）
export async function getLiveStocks() {
  const cached = loadCache();
  if (cached) return cached;

  try {
    const results = await Promise.all(STOCK_TICKERS.map(fetchQuote));
    saveCache(results);
    return results;
  } catch (e) {
    return null;
  }
}
