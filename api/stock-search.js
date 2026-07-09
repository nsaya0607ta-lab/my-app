// 銘柄名・ティッカーによる検索（Finnhubの/searchエンドポイント）。
// APIキーはサーバー側の環境変数にのみ保持する（api/stock-quote.jsと同じ方針）。
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const UPSTREAM_TIMEOUT_MS = 8000;
const MAX_RESULTS = 10;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method-not-allowed" });
    return;
  }
  if (!FINNHUB_API_KEY) {
    res.status(500).json({ error: "not-configured" });
    return;
  }
  const q = String(req.query.q || "").trim();
  if (!q || q.length > 50) {
    res.status(400).json({ error: "invalid-query" });
    return;
  }

  const url = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINNHUB_API_KEY}`;
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
    const items = Array.isArray(data.result) ? data.result : [];
    // シンボルに"."を含む銘柄（東証".T"やロンドン".L"などの海外派生シンボル）は
    // 対象外にし、米国本体上場銘柄に絞る（日本株はGoogleスプレッドシート側で
    // 別途カバーしているため、ここで重複してカバーする必要はない）
    const results = items
      .filter(it => it.symbol && !it.symbol.includes("."))
      .slice(0, MAX_RESULTS)
      .map(it => ({ symbol: it.symbol, name: it.description || it.symbol }));
    res.setHeader("Cache-Control", "public, max-age=300");
    res.status(200).json({ results });
  } catch (e) {
    clearTimeout(timer);
    res.status(502).json({ error: "fetch-failed" });
  }
}
