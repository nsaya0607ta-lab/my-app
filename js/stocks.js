/* =========================================================================
   ポートフォリオ画面用の株価取得。
   実データはGoogleスプレッドシート上のGOOGLEFINANCE関数が保持しており、
   APIキーを持つのはサーバー側（api/stocks.js）のみ。フロントはAPIキーを
   一切持たず、同一オリジンの/api/stocksをfetchするだけ
   （api/gemini/chat.jsと同じ「キーはサーバー側にのみ保持」の方針）。
   取得結果は15分キャッシュし、取得に失敗した場合は古いキャッシュ（無ければ
   null）を返すことで、ポートフォリオ画面側は常にフォールバック値
   （静的な基準価格）で表示を継続できる。
   ========================================================================= */

const CACHE_KEY = "stock_prices_cache_v1";
const CACHE_TTL_MS = 15 * 60 * 1000; // 15分キャッシュ
const FETCH_TIMEOUT_MS = 8000;

function readCacheEntry() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    return (c && typeof c === "object") ? c : null;
  } catch (e) {
    return null;
  }
}
function writeCache(prices) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ prices, fetchedAt: Date.now() }));
  } catch (e) {}
}

// 期限切れでも構わず、保存済みの最後の取得結果を返す（フェッチ失敗時の最終フォールバック用）
export function loadCachedPrices() {
  const c = readCacheEntry();
  return (c && c.prices) || null;
}

// 画面に「◯時◯分時点」を表示するための取得時刻つきキャッシュ取得
export function loadCachedPricesMeta() {
  return readCacheEntry(); // { prices, fetchedAt } または null
}

// キャッシュがまだ有効期限内ならその値を、無ければnullを返す
function readFreshCache() {
  const c = readCacheEntry();
  if (!c || Date.now() - c.fetchedAt > CACHE_TTL_MS) return null;
  return c.prices || null;
}

// { TICKER: price, ... } を返す。取得に失敗した場合は古いキャッシュ
// （無ければnull）を返す。呼び出し側は常にnullの可能性を考慮し、静的な
// 基準価格へフォールバックすること。
export async function fetchStockPrices({ force = false } = {}) {
  if (!force) {
    const fresh = readFreshCache();
    if (fresh) return fresh;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch("/api/stocks", { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (!data || typeof data.prices !== "object") throw new Error("bad-response");
    writeCache(data.prices);
    return data.prices;
  } catch (e) {
    clearTimeout(timer);
    return loadCachedPrices();
  }
}
