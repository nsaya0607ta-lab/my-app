/* =========================================================================
   株価カード（STOCKS）用の実株価取得。
   Yahoo Finance の公開APIをCORSプロキシ経由で取得する。
   - v7/finance/quote  : 現在値・前日終値・プレ/アフターマーケット価格・
                          市場の状態（PRE/REGULAR/POST/CLOSED）
   - v8/finance/chart  : 分足（1分間隔・プレ/アフターマーケット込み）の
                          Intraday時系列データ（チャート用）
   取得できない場合は null を返し、呼び出し側（render.js）が
   保持しているサンプル株価・擬似変動で動作を継続する。

   ※ Alpha VantageのTIME_SERIES_INTRADAYも候補だったが、無料枠が
   1日25リクエストと非常に少なく、45秒間隔での定期更新には不向きなため、
   APIキー不要でプレ/アフターマーケットも1本のデータで返してくれる
   Yahoo Financeの分足チャートAPIを採用している。
   ========================================================================= */

import { fetchViaProxies } from './cors-proxy.js';

export const STOCK_TICKERS = ["MSFT", "AMZN", "GOOGL"];
const STOCK_NAMES = { MSFT: "Microsoft", AMZN: "Amazon", GOOGL: "Alphabet" };

const FETCH_TIMEOUT_MS = 8000;
const CACHE_KEY = "stocks_cache_v3";
const CACHE_TTL_MS = 45 * 1000; // 45秒キャッシュ（相場は動くのでニュースより短め）

async function fetchSnapshot(ticker) {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${ticker}`;
  const res = await fetchViaProxies(url, { timeoutMs: FETCH_TIMEOUT_MS });
  const json = await res.json();
  const q = json?.quoteResponse?.result?.[0];
  if (!q) throw new Error("no quote for " + ticker);
  return q;
}

// 分足（1分間隔）のIntraday時系列データ。includePrePost=true で
// プレマーケット～アフターマーケットまでを1本の連続した配列として取得する
async function fetchIntradaySeries(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1d&interval=1m&includePrePost=true`;
  const res = await fetchViaProxies(url, { timeoutMs: FETCH_TIMEOUT_MS });
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error("no chart data for " + ticker);
  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  return timestamps
    .map((t, i) => ({ t: t * 1000, close: closes[i] }))
    .filter(p => typeof p.close === "number");
}

// 現在の市場状態（PRE/REGULAR/POST/CLOSED）から、表示すべき価格とラベルを判定
function pickSessionPrice(q) {
  const state = (q.marketState || "REGULAR").toUpperCase();
  if (state === "PRE" && typeof q.preMarketPrice === "number") {
    return { session: "pre", label: "Pre-market", price: q.preMarketPrice };
  }
  if ((state === "POST" || state === "POSTPOST") && typeof q.postMarketPrice === "number") {
    return { session: "post", label: "After-hours", price: q.postMarketPrice };
  }
  return { session: "regular", label: null, price: q.regularMarketPrice };
}

async function fetchQuote(ticker) {
  const [q, series] = await Promise.all([fetchSnapshot(ticker), fetchIntradaySeries(ticker)]);
  const previousClose = q.regularMarketPreviousClose;
  if (typeof previousClose !== "number") throw new Error("invalid previousClose for " + ticker);

  const { session, label, price } = pickSessionPrice(q);
  const displayPrice = typeof price === "number" ? price : q.regularMarketPrice;
  // 増減率は常に「前日終値比」（日足ベース）で計算する。時間外価格でも基準は変えない
  const change = ((displayPrice - previousClose) / previousClose) * 100;

  return {
    ticker,
    name: STOCK_NAMES[ticker] || ticker,
    price: displayPrice,
    previousClose,
    change,
    session,
    sessionLabel: label,
    series: series.length ? series : [{ t: Date.now(), close: displayPrice }],
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

// 実際の株価を取得（3銘柄）。銘柄ごとに成否を判定し、失敗した銘柄は配列内で
// null を返す（呼び出し側はその銘柄だけフォールバックに回せる）。
// 全銘柄が失敗した場合のみ null を返す。
export async function getLiveStocks() {
  const cached = loadCache();
  if (cached) return cached;

  const settled = await Promise.allSettled(STOCK_TICKERS.map(fetchQuote));
  const results = settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    // デバッグ用：実機で取得に失敗する場合はここに理由が出る（CORSプロキシの
    // ダウン・レート制限・Yahoo側のブロックなど）
    console.warn(`[stocks] ${STOCK_TICKERS[i]} の株価取得に失敗しました:`, r.reason?.message || r.reason);
    return null;
  });
  if (results.every(r => r === null)) return null;
  saveCache(results);
  return results;
}
