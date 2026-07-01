/* =========================================================================
   Finnhub（https://finnhub.io）の無料APIキー・銘柄設定。
   株価カード（stocks.js）と関連ニュース（news.js）の両方で共有する。

   【重要】Finnhubの利用には無料のAPIキーが必要です。
   1. https://finnhub.io/register で無料アカウントを作成
   2. ダッシュボードに表示される API Key をコピー
   3. 下の FINNHUB_API_KEY にそのまま貼り付ける
   キー未設定の間は株価・関連ニュースとも常にサンプル/フォールバック
   データが表示されます。
   ========================================================================= */

export const FINNHUB_API_KEY = "d92jlgpr01qs541v5g60d92jlgpr01qs541v5g6g";

export const STOCK_TICKERS = ["MSFT", "AMZN", "GOOGL"];
export const STOCK_NAMES = { MSFT: "Microsoft", AMZN: "Amazon", GOOGL: "Alphabet" };
