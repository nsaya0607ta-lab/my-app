// 株価APIキー（Finnhub）はサーバー側の環境変数（Vercelのプロジェクト設定）でのみ
// 保持し、フロントエンドには一切渡さない。クライアントはこのエンドポイントに
// ?symbols=AAPL,TSLA のようにティッカーをカンマ区切りで渡すだけで、実際の
// Finnhub呼び出しはここで行う（js/gemini.jsからのapi/gemini/chatと同じ考え方）。
const FINNHUB_QUOTE_URL = "https://finnhub.io/api/v1/quote";
const MAX_SYMBOLS = 20;
const UPSTREAM_TIMEOUT_MS = 8000;
// 同一サーバーレスインスタンス内での短時間の重複リクエスト（同じ銘柄を
// 別々のユーザーがほぼ同時に開いた場合など）をまとめ、Finnhub無料枠の
// レート制限（60回/分）を無駄に消費しないための簡易キャッシュ
const CACHE_TTL_MS = 20 * 1000;
const cache = new Map(); // symbol -> { data, ts }

async function fetchQuote(symbol, apiKey){
  const cached = cache.get(symbol);
  if(cached && (Date.now() - cached.ts) < CACHE_TTL_MS) return cached.data;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try{
    const url = `${FINNHUB_QUOTE_URL}?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
    const r = await fetch(url, { signal: controller.signal });
    if(!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    // 存在しない/無効なティッカーでもFinnhubは200 {c:0,...} を返すことがあるため、
    // 現在値が取れていないレスポンスはエラー扱いにする
    if(!j || typeof j.c !== "number" || j.c === 0) throw new Error("no-data");
    const data = {
      price: j.c,
      change: typeof j.d === "number" ? j.d : null,
      changePercent: typeof j.dp === "number" ? j.dp : null,
      prevClose: typeof j.pc === "number" ? j.pc : j.c,
      ts: typeof j.t === "number" ? j.t : Date.now()/1000,
    };
    cache.set(symbol, { data, ts: Date.now() });
    return data;
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
    console.error("stocks quote error: FINNHUB_API_KEY is not set");
    res.status(500).json({ error: "server-misconfigured" });
    return;
  }

  const raw = typeof req.query.symbols === "string" ? req.query.symbols : "";
  const symbols = [...new Set(raw.split(",").map(s => s.trim().toUpperCase()).filter(Boolean))].slice(0, MAX_SYMBOLS);
  if(!symbols.length){
    res.status(400).json({ error: "symbols-required" });
    return;
  }

  const quotes = {};
  const errors = [];
  await Promise.all(symbols.map(async (sym) => {
    try{ quotes[sym] = await fetchQuote(sym, apiKey); }
    catch(e){ errors.push(sym); }
  }));

  res.status(200).json({ quotes, errors });
};
