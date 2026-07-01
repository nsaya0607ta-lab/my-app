/* =========================================================================
   外部ニュース取得（資格一覧画面 上部のニューステロップ用）
   ブラウザから直接 RSS を fetch すると CORS エラーになるため、
   無料のCORSプロキシ経由で取得する。1つのプロキシはダウン・レート制限が
   起きやすいため、複数のプロキシを順番に試し、全滅した場合のみ
   FALLBACK_NEWS を表示する。
   ========================================================================= */

// Yahoo!ニュース トピックス RSS（IT・科学カテゴリ）
const RSS_FEEDS = [
  "https://news.yahoo.co.jp/rss/topics/it.xml",
  "https://news.yahoo.co.jp/rss/topics/science.xml",
];

// CORSを回避するための無料プロキシ（上から順に試す）。第三者サービス経由のため、
// 取得内容は必ず esc() でエスケープしてから表示すること。
const CORS_PROXIES = [
  url => "https://api.allorigins.win/raw?url=" + encodeURIComponent(url),
  url => "https://corsproxy.io/?url=" + encodeURIComponent(url),
  url => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(url),
];

const MAX_ITEMS = 8;
const FETCH_TIMEOUT_MS = 8000;
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

function parseFeedXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("RSSの解析に失敗しました");
  return [...doc.querySelectorAll("item")].map(item => ({
    title: (item.querySelector("title")?.textContent || "").trim(),
    link: (item.querySelector("link")?.textContent || "").trim() || null,
  })).filter(n => n.title);
}

// 1つのプロキシがダウン・レート制限中でも他が使えるよう、順番に試す
async function fetchFeed(feedUrl) {
  let lastErr = new Error("no proxy available");
  for (const buildProxyUrl of CORS_PROXIES) {
    try {
      const res = await withTimeout(fetch(buildProxyUrl(feedUrl)), FETCH_TIMEOUT_MS);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const xmlText = await res.text();
      const items = parseFeedXml(xmlText);
      if (items.length) return items;
      throw new Error("0件でした");
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
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
