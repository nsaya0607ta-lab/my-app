/* =========================================================================
   米国株など任意ティッカーの検索・現在値取得（Finnhub経由）。
   FinnhubのAPIキーはサーバー側（api/stock-quote.js, api/stock-search.js）の
   環境変数にのみ保持し、フロントには一切渡さない（api/gemini/chat.js、
   js/stocks.jsと同じ方針）。
   日本株はGoogleスプレッドシート側（js/stocks.js）でカバーしているため、
   ここは米国本体上場銘柄の検索・現在値取得に専念する。
   ========================================================================= */

const QUOTE_CACHE_KEY = "us_stock_quote_cache_v1";
const QUOTE_CACHE_TTL_MS = 5 * 60 * 1000; // 5分キャッシュ（Finnhub無料枠のレート制限対策）
const FETCH_TIMEOUT_MS = 8000;

function readQuoteCache() {
  try {
    const c = JSON.parse(localStorage.getItem(QUOTE_CACHE_KEY) || "null");
    return (c && typeof c === "object") ? c : {};
  } catch (e) {
    return {};
  }
}
function writeQuoteCache(cache) {
  try {
    localStorage.setItem(QUOTE_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {}
}

// ネットワークに触れず、ローカルキャッシュにある分だけ同期的に返す
// （画面を開いた瞬間の初期描画用。期限切れでも構わず返す）
export function loadCachedUsPrices(tickers) {
  const cache = readQuoteCache();
  const result = {};
  for (const t of tickers) {
    if (cache[t]) result[t] = cache[t].price;
  }
  return result;
}

// tickers（配列）分の現在値をまとめて取得し、{ TICKER: price, ... } を返す。
// 個別の銘柄で取得に失敗した場合は、古いキャッシュがあればそれにフォールバック
// する（無ければその銘柄はキーごと省略される＝呼び出し側は静的な基準価格を使う）
export async function fetchUsStockPrices(tickers, { force = false } = {}) {
  const cache = readQuoteCache();
  const now = Date.now();
  const result = {};
  const need = [];
  for (const t of tickers) {
    const c = cache[t];
    if (!force && c && now - c.fetchedAt < QUOTE_CACHE_TTL_MS) result[t] = c.price;
    else need.push(t);
  }
  await Promise.all(need.map(async (t) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(`/api/stock-quote?symbol=${encodeURIComponent(t)}`, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (Number.isFinite(data.price)) {
        result[t] = data.price;
        cache[t] = { price: data.price, fetchedAt: now };
      } else if (cache[t]) {
        result[t] = cache[t].price;
      }
    } catch (e) {
      clearTimeout(timer);
      if (cache[t]) result[t] = cache[t].price;
    }
  }));
  writeQuoteCache(cache);
  return result;
}

// 銘柄検索（会社名・ティッカーの部分一致）。最大10件まで { symbol, name } の配列で返す
export async function searchStocks(query) {
  const q = (query || "").trim();
  if (!q) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`/api/stock-search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    return Array.isArray(data.results) ? data.results : [];
  } catch (e) {
    clearTimeout(timer);
    return [];
  }
}
