// 米国株など任意ティッカーの現在値取得（Finnhubの/quoteエンドポイント）。
// APIキーはサーバー側の環境変数（Vercelのプロジェクト設定）でのみ保持し、
// フロントエンドには一切渡さない（api/gemini/chat.js、api/stocks.jsと
// 同じ方針）。
//
// 必要な環境変数:
//   FINNHUB_API_KEY … Finnhubの無料APIキー
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const UPSTREAM_TIMEOUT_MS = 8000;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method-not-allowed" });
    return;
  }
  if (!FINNHUB_API_KEY) {
    res.status(500).json({ error: "not-configured" });
    return;
  }
  const symbol = String(req.query.symbol || "").trim().toUpperCase();
  if (!symbol || symbol.length > 10) {
    res.status(400).json({ error: "invalid-symbol" });
    return;
  }

  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!upstream.ok) {
      res.status(502).json({ error: "upstream-error" });
      return;
    }
    const data = await upstream.json();
    const price = Number(data.c); // current price（0=銘柄が見つからない場合もFinnhubの仕様）
    if (!Number.isFinite(price) || price <= 0) {
      res.status(404).json({ error: "not-found" });
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    res.status(200).json({ symbol, price, updatedAt: new Date().toISOString() });
  } catch (e) {
    clearTimeout(timer);
    res.status(502).json({ error: "fetch-failed" });
  }
}
