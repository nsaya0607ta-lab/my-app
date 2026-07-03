/* =========================================================================
   Finnhub（https://finnhub.io）の無料APIキー・銘柄設定（stocks.js用）。

   【重要】Finnhubの利用には無料のAPIキーが必要です。
   1. https://finnhub.io/register で無料アカウントを作成
   2. ダッシュボードに表示される API Key をコピー
   3. 下の FINNHUB_API_KEY にそのまま貼り付ける
   キー未設定の間は株価カードは常にサンプルデータが表示されます。
   ========================================================================= */

export const FINNHUB_API_KEY = "d92jlgpr01qs541v5g60d92jlgpr01qs541v5g6g";

export const STOCK_TICKERS = ["MSFT", "AMZN", "GOOGL", "AAPL", "META", "NVDA"];
export const STOCK_NAMES = { MSFT: "Microsoft", AMZN: "Amazon", GOOGL: "Alphabet", AAPL: "Apple", META: "Meta", NVDA: "NVIDIA" };

// 日本経済ニュース画面用。東証プライム市場の個別銘柄（".T"サフィックス）や
// 日経平均・TOPIXなどの指数は、Finnhub無料枠のリアルタイムデータ提供対象外
// （実際に接続確認したところ全銘柄で取得不可）のため使用しない。
// 代わりに、Finnhub無料枠が通常のNYSE/NASDAQ上場銘柄として問題なく対応できる
// 「日本の主要企業がニューヨーク証券取引所に上場しているADR（米国預託証券）」
// を採用する。米国株と全く同じ取引所・同じ取得経路のため、米国株側と同条件で
// 実データ取得できる
export const STOCK_TICKERS_JP = ["TM", "SONY", "HMC", "MUFG", "MFG", "NMR"];
export const STOCK_NAMES_JP = {
  TM: "トヨタ自動車(ADR)", SONY: "ソニーG(ADR)", HMC: "本田技研(ADR)",
  MUFG: "三菱UFJ(ADR)", MFG: "みずほFG(ADR)", NMR: "野村HD(ADR)",
};
