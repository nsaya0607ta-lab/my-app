/* =========================================================================
   外部ニュース取得（資格一覧画面 上部のニュースダッシュボード用）
   ブラウザから直接 RSS を fetch すると CORS エラーになるため、
   無料のCORSプロキシ経由で取得する。1つのプロキシはダウン・レート制限が
   起きやすいため、複数のプロキシを順番に試し、全滅した場合のみ
   FALLBACK_NEWS（ダミーのIT系ニュース）を表示する。
   ========================================================================= */

import { fetchViaProxies } from './cors-proxy.js';

// Yahoo!ニュース トピックス RSS（IT・科学カテゴリ）
const RSS_FEEDS = [
  "https://news.yahoo.co.jp/rss/topics/it.xml",
  "https://news.yahoo.co.jp/rss/topics/science.xml",
];

const MAX_ITEMS = 5; // ニュースダッシュボードは5件を保持・巡回表示する
const SUMMARY_MAX_LEN = 90; // 要約の最大文字数（カード内で2行程度に収まる目安）
// RSSのdescriptionが空で要約が取得できない場合の案内文。
// タイトルをそのまま繰り返すと誤解を招く（未確認の内容を捏造して表示するのも
// 不適切な）ため、事実を断定しない案内文のみを表示する。
const NO_SUMMARY_TEXT = "詳しい内容は下の「続きを読む」から元記事でご確認ください。";
const FETCH_TIMEOUT_MS = 8000;
const CACHE_KEY = "news_cache_v4"; // 要約重複バグ修正に伴いバージョンを上げ、古いキャッシュを無効化
const CACHE_TTL_MS = 10 * 60 * 1000; // 10分キャッシュ（プロキシ・取得先への負荷軽減）

// 通信エラー・API制限などで1件も取得できなかった場合に表示する、
// ダミーのIT/Azure系ニュース（実在の記事ではないため link はダミーURL・遷移させない想定）
export const FALLBACK_NEWS = [
  {
    title: "生成AIの業務活用が加速、国内企業の8割が導入を検討",
    summary: "国内主要企業を対象にした最新調査によると、8割以上が生成AIの業務活用を検討または既に導入していると回答。特に資料作成や問い合わせ対応での活用が進んでいる。",
    link: "https://news.yahoo.co.jp/",
  },
  {
    title: "Azure新リージョン開設、国内クラウド需要に対応",
    summary: "マイクロソフトはクラウド需要の高まりを受け、Azureの新リージョンを開設したと発表。データの国内保持ニーズに応え、金融・公共分野での採用が期待されている。",
    link: "https://azure.microsoft.com/",
  },
  {
    title: "次世代半導体の国内生産、大手メーカーが新工場を稼働へ",
    summary: "半導体大手が国内に新工場を稼働開始したと発表。次世代プロセスの量産体制を整え、AI需要の急拡大に伴う供給不足の解消を目指すとしている。",
    link: "https://news.yahoo.co.jp/",
  },
  {
    title: "量子コンピュータ研究で新たな成果、誤り訂正技術が前進",
    summary: "研究チームが量子ビットの誤り訂正に関する新手法を発表。実用的な量子コンピュータの実現に向けた課題とされてきた精度の課題解決に前進したという。",
    link: "https://news.yahoo.co.jp/",
  },
  {
    title: "クラウドセキュリティ人材の需要が急増、資格取得者にニーズ",
    summary: "クラウド移行の加速に伴い、セキュリティ人材の需要が急増していると各社が報告。関連資格の取得者は転職市場でも高く評価される傾向にあるという。",
    link: "https://news.yahoo.co.jp/",
  },
];

// RSSのdescriptionは装飾タグを含むことがあるため、テキストのみ抽出して整形する
function cleanSummary(raw) {
  const text = (raw || "").replace(/\s+/g, " ").trim();
  if (!text) return NO_SUMMARY_TEXT; // 要約が空の場合にタイトルを繰り返すと重複表示になるため案内文を表示
  return text.length > SUMMARY_MAX_LEN ? text.slice(0, SUMMARY_MAX_LEN) + "…" : text;
}

function parseFeedXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("RSSの解析に失敗しました");
  return [...doc.querySelectorAll("item")].map(item => {
    const title = (item.querySelector("title")?.textContent || "").trim();
    return {
      title,
      summary: cleanSummary(item.querySelector("description")?.textContent),
      link: (item.querySelector("link")?.textContent || "").trim() || null,
    };
  }).filter(n => n.title);
}

async function fetchFeed(feedUrl) {
  const res = await fetchViaProxies(feedUrl, { timeoutMs: FETCH_TIMEOUT_MS });
  const xmlText = await res.text();
  const items = parseFeedXml(xmlText);
  if (!items.length) throw new Error("0件でした");
  return items;
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

// 複数フィードから最新ニュースを取得（5件に整形）。失敗時はフォールバックを返す
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
