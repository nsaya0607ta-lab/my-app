/* =========================================================================
   外部ニュース取得（資格一覧画面 上部のニューステロップ用）
   ブラウザから直接 RSS を fetch すると CORS エラーになるため、
   無料の allorigins プロキシ経由で取得する。
   取得に失敗した場合は FALLBACK_NEWS を表示する。
   ========================================================================= */

// Yahoo!ニュース トピックス RSS（IT・科学カテゴリ）
const RSS_FEEDS = [
  "https://news.yahoo.co.jp/rss/topics/it.xml",
  "https://news.yahoo.co.jp/rss/topics/science.xml",
];

// CORSを回避するための無料プロキシ（allorigins）。第三者サービス経由のため、
// 取得内容は必ず esc() でエスケープしてから表示すること。
const CORS_PROXY = "https://api.allorigins.win/raw?url=";

const MAX_ITEMS = 8;
const FETCH_TIMEOUT_MS = 6000;
const CACHE_KEY = "news_cache_v1";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10分キャッシュ（プロキシ・取得先への負荷軽減）

// 通信エラー・API制限などで1件も取得できなかった場合に表示する固定のお知らせ
export const FALLBACK_NEWS = [
  { title: "今日も学習を始めましょう！", link: null },
  { title: "コツコツ続けることが合格への近道です。", link: null },
  { title: "スキマ時間に1問だけでも解いてみましょう。", link: null },
];

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

async function fetchFeed(feedUrl) {
  const res = await withTimeout(fetch(CORS_PROXY + encodeURIComponent(feedUrl)), FETCH_TIMEOUT_MS);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const xmlText = await res.text();
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("RSSの解析に失敗しました");
  return [...doc.querySelectorAll("item")].map(item => ({
    title: (item.querySelector("title")?.textContent || "").trim(),
    link: (item.querySelector("link")?.textContent || "").trim() || null,
  })).filter(n => n.title);
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

// 複数フィードから最新ニュースを取得（5〜10件程度に整形）。失敗時はフォールバックを返す
export async function getNews() {
  const cached = loadCache();
  if (cached) return cached;

  try {
    const results = await Promise.allSettled(RSS_FEEDS.map(fetchFeed));
    const items = results
      .filter(r => r.status === "fulfilled")
      .flatMap(r => r.value)
      .slice(0, MAX_ITEMS);
    if (!items.length) throw new Error("ニュースを取得できませんでした");
    saveCache(items);
    return items;
  } catch (e) {
    return FALLBACK_NEWS;
  }
}
