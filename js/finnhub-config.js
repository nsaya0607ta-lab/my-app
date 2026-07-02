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

// STOCKSカード右側に常時固定表示する為替・指数（ドル円、FANG+）。
// Finnhubの銘柄コードで指定する（為替は OANDA:XXX_YYY 形式）。
export const FIXED_INSTRUMENTS = [
  { symbol: "OANDA:USD_JPY", name: "USD/JPY" },
  { symbol: "FNGS", name: "FANG+" },
];
