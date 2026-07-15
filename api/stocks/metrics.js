// PER・PBR・時価総額（Finnhub /stock/profile2 と /stock/metric をサーバー側で
// プロキシ）。株価そのもの（api/stocks/quote.js）とは違い、これらは決算ベースの
// ファンダメンタルズ情報で更新頻度が低いため、別エンドポイントに分け、
// キャッシュも長め（6時間）にしてFinnhub無料枠のレート制限を無駄に消費しない
// ようにする。APIキーはVercelの環境変数FINNHUB_API_KEYにのみ保持する。
//
// 重要：Finnhubのプランやカバレッジによってはこれらのフィールドが返ってこない
// （403やnullになる）ことがある。その場合は固定値や推測値で埋めず、対応する
// 項目をnullのまま返す。呼び出し側（js/stock-detail.js）はnullの項目を
// 画面から非表示にする。
const FINNHUB_PROFILE_URL = "https://finnhub.io/api/v1/stock/profile2";
const FINNHUB_METRIC_URL = "https://finnhub.io/api/v1/stock/metric";
const UPSTREAM_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6時間（ファンダメンタルズは頻繁に変わらない）
const cache = new Map(); // symbol -> { data, ts }

// PER/PBRはFinnhubのレスポンスでどのフィールドに実データが入っているかが
// 銘柄やプランによって異なることがあるため、存在する実数値を優先順に探す。
// 見つからなければnull（0や仮の数値で埋めない）
const PE_FIELDS = ["peBasicExclExtraTTM", "peExclExtraAnnual", "peInclExtraTTM", "peNormalizedAnnual"];
const PB_FIELDS = ["pbQuarterly", "pbAnnual"];

function validNum(v){ return typeof v === "number" && Number.isFinite(v); }

function pickPositiveField(obj, fields){
  if(!obj || typeof obj !== "object") return null;
  for(const f of fields){
    const v = obj[f];
    if(validNum(v) && v > 0) return v;
  }
  return null;
}

async function fetchJSON(url){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try{
    const r = await fetch(url, { signal: controller.signal });
    if(!r.ok) return null; // 403（プラン未対応）等は「データなし」として扱う
    return await r.json();
  }catch(e){
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchMetrics(symbol, apiKey){
  const cached = cache.get(symbol);
  if(cached && (Date.now() - cached.ts) < CACHE_TTL_MS) return cached.data;

  const [profile, metricRes] = await Promise.all([
    fetchJSON(`${FINNHUB_PROFILE_URL}?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`),
    fetchJSON(`${FINNHUB_METRIC_URL}?symbol=${encodeURIComponent(symbol)}&metric=all&token=${apiKey}`),
  ]);

  // 要求した銘柄と異なるティッカーのデータが紛れ込まないよう、プロフィールが
  // 自己申告するティッカーと一致する場合だけ採用する
  const profileOk = profile && typeof profile === "object" && (!profile.ticker || profile.ticker === symbol);
  const marketCap = profileOk && validNum(profile.marketCapitalization) && profile.marketCapitalization > 0
    ? profile.marketCapitalization : null;
  const currency = profileOk && typeof profile.currency === "string" && profile.currency ? profile.currency : null;

  const metricObj = metricRes && typeof metricRes === "object" ? metricRes.metric : null;
  const per = pickPositiveField(metricObj, PE_FIELDS);
  const pbr = pickPositiveField(metricObj, PB_FIELDS);

  const data = { per, pbr, marketCap, currency, fetchedAt: Date.now() };
  cache.set(symbol, { data, ts: Date.now() });
  return data;
}

module.exports = async (req, res) => {
  if(req.method !== "GET"){
    res.status(405).json({ error: "method-not-allowed" });
    return;
  }

  const apiKey = process.env.FINNHUB_API_KEY;
  if(!apiKey){
    console.error("stocks metrics error: FINNHUB_API_KEY is not set");
    res.status(500).json({ error: "server-misconfigured" });
    return;
  }

  const symbol = typeof req.query.symbol === "string" ? req.query.symbol.trim().toUpperCase() : "";
  if(!symbol || !/^[A-Z0-9.\-]{1,10}$/.test(symbol)){
    res.status(400).json({ error: "invalid-symbol" });
    return;
  }

  try{
    const data = await fetchMetrics(symbol, apiKey);
    res.status(200).json(data);
  }catch(e){
    res.status(502).json({ error: "upstream-error" });
  }
};
