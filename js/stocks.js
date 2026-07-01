/* =========================================================================
   株価カード（STOCKS）用の実株価取得。
   Finnhub（https://finnhub.io）の無料APIを使用する。
   - /quote        : リアルタイムに近い現在値・前日終値
   - /stock/candle : 分足（ローソク足）の時系列データ（チャート用）

   【重要】Finnhubの利用には無料のAPIキーが必要です。
   1. https://finnhub.io/register で無料アカウントを作成
   2. ダッシュボードに表示される API Key をコピー
   3. 下の FINNHUB_API_KEY にそのまま貼り付ける
   キー未設定の間は常にサンプルデータ（render.js側のフォールバック）が
   表示されます。また、Finnhubの無料プランは株式のローソク足(candle)取得が
   制限されている場合があり、その場合は現在値のみ実データ・チャートは
   サンプルのまま、という状態になることがあります（不具合ではありません）。

   Finnhubは元々ブラウザからの直接呼び出しを想定してCORSを許可しているため、
   まず直接fetchし、失敗した場合のみ無料CORSプロキシ経由にフォールバックする。
   ========================================================================= */

import { fetchDirectOrProxied } from './cors-proxy.js';

// ここに https://finnhub.io/register で取得した無料APIキーを貼り付けてください
const FINNHUB_API_KEY = "YOUR_FINNHUB_API_KEY";

export const STOCK_TICKERS = ["MSFT", "AMZN", "GOOGL"];
const STOCK_NAMES = { MSFT: "Microsoft", AMZN: "Amazon", GOOGL: "Alphabet" };

const FETCH_TIMEOUT_MS = 8000;
const CACHE_KEY = "stocks_cache_v4";
const CACHE_TTL_MS = 45 * 1000; // 45秒キャッシュ（Finnhub無料枠は60req/分なので十分余裕がある）
const CANDLE_LOOKBACK_SEC = 6 * 60 * 60; // 直近6時間分の分足を取得

// 米国東部時間（ET）の現在時刻から、プレ/通常/アフター/クローズを判定する。
// FinnhubのAPIレスポンス自体には市場状態のフィールドが無いため、クライアント側の
// 時計だけで判定する（土日・夜間はclosed扱い＝ラベル無し）。
function currentUSSession() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour12: false,
    hour: "2-digit", minute: "2-digit", weekday: "short",
  }).formatToParts(new Date());
  const get = (type) => parts.find(p => p.type === type)?.value;
  const weekday = get("weekday");
  if (weekday === "Sat" || weekday === "Sun") return { session: "closed", label: null };
  const mins = parseInt(get("hour"), 10) * 60 + parseInt(get("minute"), 10);
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return { session: "pre", label: "Pre-market" };
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return { session: "regular", label: null };
  if (mins >= 16 * 60 && mins < 20 * 60) return { session: "post", label: "After-hours" };
  return { session: "closed", label: null };
}

async function fetchQuote(ticker) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_API_KEY}`;
  const res = await fetchDirectOrProxied(url, { timeoutMs: FETCH_TIMEOUT_MS });
  const q = await res.json();
  if (typeof q.c !== "number" || q.c === 0 || typeof q.pc !== "number") {
    throw new Error("invalid quote (APIキー未設定または無効な可能性): " + JSON.stringify(q));
  }
  return q; // { c: 現在値, pc: 前日終値, d, dp, h, l, o, t }
}

// 分足（5分足）のIntraday時系列データ。Finnhubの無料プランでは株式のローソク足が
// 使えない場合があり、その場合は s !== "ok" になるため呼び出し側でフォールバックする
async function fetchCandles(ticker) {
  const to = Math.floor(Date.now() / 1000);
  const from = to - CANDLE_LOOKBACK_SEC;
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=5&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;
  const res = await fetchDirectOrProxied(url, { timeoutMs: FETCH_TIMEOUT_MS });
  const data = await res.json();
  if (data.s !== "ok" || !Array.isArray(data.t) || !data.t.length) {
    throw new Error(`candle取得不可(s=${data.s})。無料プランでは株式のローソク足が制限されている場合があります`);
  }
  return data.t
    .map((t, i) => ({ t: t * 1000, close: data.c[i] }))
    .filter(p => typeof p.close === "number");
}

async function fetchStockData(ticker) {
  const q = await fetchQuote(ticker); // 現在値が取れなければこの銘柄は丸ごとサンプルへ
  const previousClose = q.pc;
  const price = q.c;
  const change = ((price - previousClose) / previousClose) * 100; // 前日終値比（日足ベース）
  const { session, label } = currentUSSession();

  let series = null;
  try {
    series = await fetchCandles(ticker);
  } catch (e) {
    // チャートだけ取得できない場合。価格は実データのまま、チャートは
    // 呼び出し側（render.js）が持っているサンプル系列を使い続ける
    console.warn(`[stocks] ${ticker} のチャート取得に失敗しました（価格は実データを使用します）:`, e.message);
  }

  return {
    ticker,
    name: STOCK_NAMES[ticker] || ticker,
    price,
    previousClose,
    change,
    session,
    sessionLabel: label,
    series, // null の場合あり＝チャートはサンプルのまま
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
