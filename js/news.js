/* =========================================================================
   ニュース取得（ホーム画面のニュースダッシュボード用）
   NewsAPI（https://newsapi.org）の /v2/top-headlines から、日本（country=jp）
   の主要ニュースを取得する。銘柄には紐付けず、日本語の記事であれば
   ジャンルを問わず表示する。

   【重要】NewsAPIの利用には無料のAPIキーが必要です。
   1. https://newsapi.org/register で無料アカウントを作成
   2. ダッシュボードに表示される API Key をコピー
   3. 下の NEWSAPI_KEY にそのまま貼り付ける
   キー未設定の間は常にサンプルデータ（FALLBACK_NEWS）が表示されます。

   NewsAPIはブラウザから直接呼び出すとブロックされる場合があるため、
   まず直接fetchし、失敗した場合のみ無料CORSプロキシ経由にフォールバックする。
   取得できなかった場合のみ FALLBACK_NEWS（ダミーニュース）を表示する。
   ========================================================================= */

import { fetchDirectOrProxied } from './cors-proxy.js';

// NewsAPI（https://newsapi.org）の無料APIキー
const NEWSAPI_KEY = "f424f16df6064957a4478cacb1d47e6d";

const MAX_ITEMS = 5; // ニュースダッシュボードは5件を保持・巡回表示する
const SUMMARY_MAX_LEN = 90; // 要約の最大文字数（カード内で2行程度に収まる目安）
// NewsAPIのdescriptionが空で要約が取得できない場合の案内文。
// タイトルをそのまま繰り返すと誤解を招く（未確認の内容を捏造して表示するのも
// 不適切な）ため、事実を断定しない案内文のみを表示する。
const NO_SUMMARY_TEXT = "詳しい内容は下の「続きを読む」から元記事でご確認ください。";
const FETCH_TIMEOUT_MS = 8000;
const CACHE_KEY = "news_cache_v8"; // 銘柄検索をやめ日本の主要ニュースに変更したためバージョンを上げる
const CACHE_TTL_MS = 10 * 60 * 1000; // 10分キャッシュ（プロキシ・取得先への負荷軽減）

// 通信エラー・APIキー未設定などで1件も取得できなかった場合に表示する、
// ダミーニュース（実在の記事ではないため link はダミーURL）
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

// NewsAPIのdescriptionは装飾を含まないプレーンテキストだが、念のため整形する
function cleanSummary(raw) {
  const text = (raw || "").replace(/\s+/g, " ").trim();
  if (!text) return NO_SUMMARY_TEXT; // 要約が空の場合にタイトルを繰り返すと重複表示になるため案内文を表示
  return text.length > SUMMARY_MAX_LEN ? text.slice(0, SUMMARY_MAX_LEN) + "…" : text;
}

// 日本（country=jp）の主要ニュースを取得する。銘柄・キーワードでは絞り込まず、
// 日本語の記事であればジャンルを問わない
async function fetchTopHeadlines() {
  const params = new URLSearchParams({
    country: "jp",
    pageSize: String(MAX_ITEMS),
    apiKey: NEWSAPI_KEY,
  });
  const url = `https://newsapi.org/v2/top-headlines?${params.toString()}`;
  const res = await fetchDirectOrProxied(url, { timeoutMs: FETCH_TIMEOUT_MS });
  const data = await res.json();
  if (data.status !== "ok" || !Array.isArray(data.articles)) {
    throw new Error("invalid NewsAPI response: " + (data.message || data.status));
  }
  return data.articles
    .filter(a => a.title && a.title !== "[Removed]")
    .map(a => ({
      title: a.title.trim(),
      summary: cleanSummary(a.description),
      link: a.url || null,
    }));
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

// 日本の主要ニュースを取得して整形して返す。
// APIキー未設定・取得失敗の場合のみ FALLBACK_NEWS を返す。
// force=true の場合、10分キャッシュを無視して必ずAPIへ再フェッチしにいく
// （手動更新ボタン用。取得できればキャッシュも上書きし、10分の有効期限をリセットする）。
export async function getNews(force = false) {
  if (!NEWSAPI_KEY || NEWSAPI_KEY === "YOUR_NEWSAPI_KEY") return FALLBACK_NEWS;

  if (!force) {
    const cached = loadCache();
    if (cached) return cached;
  }

  try {
    const items = await fetchTopHeadlines();
    if (!items.length) return FALLBACK_NEWS;
    const result = items.slice(0, MAX_ITEMS);
    saveCache(result);
    return result;
  } catch (e) {
    console.warn("[news] ニュース取得に失敗しました:", e.message);
    return FALLBACK_NEWS;
  }
}
