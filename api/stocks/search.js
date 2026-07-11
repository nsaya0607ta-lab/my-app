// 銘柄検索API（Finnhub /search をサーバー側でプロキシ）。api/stocks/quote.js と
// 同じ考え方で、APIキーはVercelの環境変数FINNHUB_API_KEYにのみ保持し、
// フロントには一切渡さない。クライアントはこのエンドポイントに ?q=IONQ の
// ように検索語を渡すだけで、幅広いティッカー・企業名から候補を引ける。
const FINNHUB_SEARCH_URL = "https://finnhub.io/api/v1/search";
const UPSTREAM_TIMEOUT_MS = 8000;
const MAX_RESULTS = 15;
const MIN_QUERY_LEN = 1;
const MAX_QUERY_LEN = 40;
// 同じ検索語の連打（入力のたびの再検索）でFinnhub無料枠のレート制限
// （60回/分）を無駄に消費しないための簡易キャッシュ
const CACHE_TTL_MS = 30 * 1000;
const cache = new Map(); // query -> { data, ts }

async function fetchSearch(q, apiKey){
  const cached = cache.get(q);
  if(cached && (Date.now() - cached.ts) < CACHE_TTL_MS) return cached.data;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try{
    const url = `${FINNHUB_SEARCH_URL}?q=${encodeURIComponent(q)}&token=${apiKey}`;
    const r = await fetch(url, { signal: controller.signal });
    if(!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const rawResults = Array.isArray(j && j.result) ? j.result : [];
    // 普通株のみに絞り、優先株/ワラント/OTCの重複ティッカー（"AAPL.SW"など
    // ドット付きの海外上場分）を除外して、米国の主要ティッカーだけを残す
    const results = rawResults
      .filter(r => r && r.symbol && !r.symbol.includes(".") && (!r.type || r.type === "Common Stock"))
      .slice(0, MAX_RESULTS)
      .map(r => ({ symbol: r.symbol, name: r.description || r.symbol }));
    cache.set(q, { data: results, ts: Date.now() });
    return results;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async (req, res) => {
  if(req.method !== "GET"){
    res.status(405).json({ error: "method-not-allowed" });
    return;
  }

  const apiKey = process.env.FINNHUB_API_KEY;
  if(!apiKey){
    console.error("stocks search error: FINNHUB_API_KEY is not set");
    res.status(500).json({ error: "server-misconfigured" });
    return;
  }

  const q = (typeof req.query.q === "string" ? req.query.q : "").trim();
  if(q.length < MIN_QUERY_LEN || q.length > MAX_QUERY_LEN){
    res.status(400).json({ error: "invalid-query" });
    return;
  }

  try{
    const results = await fetchSearch(q, apiKey);
    res.status(200).json({ results });
  }catch(e){
    res.status(502).json({ error: "upstream-error" });
  }
};
