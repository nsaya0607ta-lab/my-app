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

// 日本経済ニュース画面用（東証銘柄は".T"サフィックス付きのFinnhubシンボル表記）。
// 日経平均・TOPIXは指数のため無料枠では取得できない可能性が高いが、他の銘柄と
// 同条件で取得を試み、失敗した銘柄だけ個別にサンプル表示へフォールバックする
export const STOCK_TICKERS_JP = ["^N225", "TOPIX", "7203.T", "8306.T", "6758.T", "9984.T"];
export const STOCK_NAMES_JP = {
  "^N225": "日経平均", "TOPIX": "TOPIX", "7203.T": "トヨタ自動車",
  "8306.T": "三菱UFJ", "6758.T": "ソニーG", "9984.T": "ソフトバンクG",
};
