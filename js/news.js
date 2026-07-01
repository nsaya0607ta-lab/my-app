/* =========================================================================
   関連ニュース取得（ホーム画面のニュースダッシュボード用）
   株価カード（STOCKS）で表示している銘柄（MSFT/AMZN/GOOGL）に関連する
   ニュースを、Finnhubの会社別ニュース(/company-news)から取得する。
   APIキー・銘柄一覧は finnhub-config.js で株価カードと共有している。

   Finnhubは元々ブラウザからの直接呼び出しを想定してCORSを許可しているため、
   まず直接fetchし、失敗した場合のみ無料CORSプロキシ経由にフォールバックする。
   全銘柄で取得できなかった場合のみ FALLBACK_NEWS（ダミーの関連ニュース）を表示する。
   ========================================================================= */

import { fetchDirectOrProxied } from './cors-proxy.js';
import { FINNHUB_API_KEY, STOCK_TICKERS } from './finnhub-config.js';

const MAX_ITEMS = 5; // ニュースダッシュボードは5件を保持・巡回表示する
const SUMMARY_MAX_LEN = 90; // 要約の最大文字数（カード内で2行程度に収まる目安）
// Finnhubのsummaryが空で要約が取得できない場合の案内文。
// タイトルをそのまま繰り返すと誤解を招く（未確認の内容を捏造して表示するのも
// 不適切な）ため、事実を断定しない案内文のみを表示する。
const NO_SUMMARY_TEXT = "詳しい内容は下の「続きを読む」から元記事でご確認ください。";
const FETCH_TIMEOUT_MS = 8000;
const CACHE_KEY = "news_cache_v5"; // 取得元をYahoo RSS→Finnhub関連ニュースに変更したためバージョンを上げる
const CACHE_TTL_MS = 10 * 60 * 1000; // 10分キャッシュ（プロキシ・取得先への負荷軽減）
const NEWS_LOOKBACK_DAYS = 7; // 直近7日分の関連ニュースを対象にする

// 通信エラー・APIキー未設定などで1件も取得できなかった場合に表示する、
// ダミーの関連ニュース（実在の記事ではないため link はダミーURL）
export const FALLBACK_NEWS = [
  {
    title: "Microsoft、Azure向け新AIサービスを発表",
    summary: "マイクロソフトはAzure上で利用できる新たなAIサービスを発表。企業の生成AI活用をさらに後押しする狙いがあるという。",
    link: "https://www.microsoft.com/",
  },
  {
    title: "Amazon、クラウド部門AWSの増収を発表",
    summary: "アマゾンは決算発表でクラウド部門AWSの増収を報告。企業のクラウド移行需要が引き続き堅調であることを示した。",
    link: "https://aws.amazon.com/",
  },
  {
    title: "Alphabet、AI検索機能を主要市場で拡大へ",
    summary: "グーグルの持株会社アルファベットは、AIを活用した検索機能の提供地域を拡大すると発表。競合との差別化を図る。",
    link: "https://abc.xyz/",
  },
  {
    title: "IT大手3社、データセンター投資を積み増しへ",
    summary: "主要IT企業がAI需要の拡大を受け、データセンターへの設備投資を積み増す方針を相次いで表明している。",
    link: "https://news.yahoo.co.jp/",
  },
  {
    title: "クラウド資格取得者の需要が拡大、企業の採用ニーズ高まる",
    summary: "クラウド移行の加速に伴い、関連資格の取得者に対する企業の採用ニーズが拡大していると各社が報告している。",
    link: "https://news.yahoo.co.jp/",
  },
];

// Finnhubのsummaryは装飾を含まないプレーンテキストだが、念のため整形する
function cleanSummary(raw) {
  const text = (raw || "").replace(/\s+/g, " ").trim();
  if (!text) return NO_SUMMARY_TEXT; // 要約が空の場合にタイトルを繰り返すと重複表示になるため案内文を表示
  return text.length > SUMMARY_MAX_LEN ? text.slice(0, SUMMARY_MAX_LEN) + "…" : text;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD（Finnhubのfrom/toが要求する形式）
}

// 指定銘柄の直近ニュースを取得する。無料プランでは取得できる期間・件数に
// 制限がある場合があり、その場合は呼び出し側で他の銘柄にフォールバックする
async function fetchCompanyNews(ticker) {
  const to = new Date();
  const from = new Date(to.getTime() - NEWS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const url = `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${isoDate(from)}&to=${isoDate(to)}&token=${FINNHUB_API_KEY}`;
  const res = await fetchDirectOrProxied(url, { timeoutMs: FETCH_TIMEOUT_MS });
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("invalid company-news response");
  return data
    .filter(n => n.headline)
    .map(n => ({
      title: n.headline.trim(),
      summary: cleanSummary(n.summary),
      link: n.url || null,
      datetime: (n.datetime || 0) * 1000,
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

// 株価カードの銘柄（MSFT/AMZN/GOOGL）に関連するニュースを取得し、新しい順に
// 整形して返す。銘柄ごとに成否を判定し、1銘柄でも取得できればそれを使う。
// APIキー未設定・全銘柄で取得失敗の場合のみ FALLBACK_NEWS を返す。
export async function getNews() {
  if (!FINNHUB_API_KEY || FINNHUB_API_KEY === "YOUR_FINNHUB_API_KEY") return FALLBACK_NEWS;

  const cached = loadCache();
  if (cached) return cached;

  const settled = await Promise.allSettled(STOCK_TICKERS.map(fetchCompanyNews));
  const items = settled
    .filter(r => r.status === "fulfilled")
    .flatMap(r => r.value);
  settled.forEach((r, i) => {
    if (r.status === "rejected") console.warn(`[news] ${STOCK_TICKERS[i]} の関連ニュース取得に失敗しました:`, r.reason?.message || r.reason);
  });
  if (!items.length) return FALLBACK_NEWS;

  // 新しい順に並べ、同一見出しの重複を除いた上位件数だけを表示に使う
  const seen = new Set();
  const result = items
    .sort((a, b) => b.datetime - a.datetime)
    .filter(n => (seen.has(n.title) ? false : (seen.add(n.title), true)))
    .slice(0, MAX_ITEMS)
    .map(({ title, summary, link }) => ({ title, summary, link }));

  saveCache(result);
  return result;
}
