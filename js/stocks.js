/* =========================================================================
   株価カード（STOCKS）用の実株価取得。
   Finnhub（https://finnhub.io）の無料APIを使用する。
   - /quote        : 現在値・前日終値
   - /stock/candle : 日足（Daily）の時系列データ（カード内の簡易トレンド
     ラインの描画用）。無料プランでは取得できない場合があり、その場合は
     価格のみ実データ・トレンドラインはサンプルのまま、という状態になる
     ことがある（不具合ではない）

   APIキー・銘柄一覧は finnhub-config.js に集約（news.js の関連ニュース
   取得とも共有している）。

   Finnhubは元々ブラウザからの直接呼び出しを想定してCORSを許可しているため、
   まず直接fetchし、失敗した場合のみ無料CORSプロキシ経由にフォールバックする。
   ========================================================================= */

import { fetchDirectOrProxied } from './cors-proxy.js';
import { FINNHUB_API_KEY, STOCK_TICKERS, STOCK_NAMES } from './finnhub-config.js';

export { STOCK_TICKERS };

const FETCH_TIMEOUT_MS = 8000;
const CACHE_KEY = "stocks_cache_v7"; // 6銘柄化・日足トレンドライン復活に伴いキーを更新（旧キャッシュを無効化）
const CACHE_TTL_MS = 60 * 1000; // 60秒キャッシュ（Finnhub無料枠は60req/分なので十分余裕がある）
const DAILY_LOOKBACK_DAYS = 60; // 直近60日分の日足を取得

async function fetchQuote(ticker) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_API_KEY}`;
  const res = await fetchDirectOrProxied(url, { timeoutMs: FETCH_TIMEOUT_MS });
  const q = await res.json();
  if (typeof q.c !== "number" || q.c === 0 || typeof q.pc !== "number") {
    throw new Error("invalid quote (APIキー未設定または無効な可能性): " + JSON.stringify(q));
  }
  return q; // { c: 現在値, pc: 前日終値, d, dp, h, l, o, t }
}

// 日足（Daily）の時系列データ
async function fetchDailyCandles(ticker) {
  const to = Math.floor(Date.now() / 1000);
  const from = to - DAILY_LOOKBACK_DAYS * 24 * 60 * 60;
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=D&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;
  const res = await fetchDirectOrProxied(url, { timeoutMs: FETCH_TIMEOUT_MS });
  const data = await res.json();
  if (data.s !== "ok" || !Array.isArray(data.t) || !data.t.length) {
    throw new Error(`日足candle取得不可(s=${data.s})`);
  }
  return data.t
    .map((t, i) => ({ t: t * 1000, close: data.c[i] }))
    .filter(p => typeof p.close === "number");
}

async function fetchStockData(ticker) {
  const q = await fetchQuote(ticker); // 現在値が取れなければこの銘柄は丸ごとサンプルへ
  const previousClose = q.pc;
  const price = q.c;
  const change = ((price - previousClose) / previousClose) * 100; // 前日終値比

  let series = null;
  try {
    series = await fetchDailyCandles(ticker);
  } catch (e) {
    // トレンドラインだけ取得できない場合。価格は実データのまま、ラインは
    // 呼び出し側（render.js）が持っているサンプル系列を使い続ける
    console.warn(`[stocks] ${ticker} の日足トレンドライン取得に失敗しました（価格は実データを使用します）:`, e.message);
  }

  return {
    ticker,
    name: STOCK_NAMES[ticker] || ticker,
    price,
    previousClose,
    change,
    series, // null の場合あり＝トレンドラインはサンプルのまま
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
