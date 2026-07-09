// ポートフォリオ画面の株価は、Googleスプレッドシート上のGOOGLEFINANCE関数が
// 自動更新している値をSheets APIで読み出して使う。APIキーはサーバー側の
// 環境変数（Vercelのプロジェクト設定）でのみ保持し、フロントエンドには一切
// 渡さない（api/gemini/chat.jsと同じ方針）。
//
// 必要な環境変数:
//   GOOGLE_SHEETS_API_KEY … Google CloudのSheets API用APIキー
//   GOOGLE_SHEETS_ID      … スプレッドシートのID（URLの/d/と/edit の間の文字列）
//   GOOGLE_SHEETS_RANGE   … 読み取り範囲。省略時は "Stocks!A:B"
//                            （A列=ティッカー, B列==GOOGLEFINANCE(...)の価格）
const SHEETS_API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
const SHEETS_ID = process.env.GOOGLE_SHEETS_ID;
const SHEETS_RANGE = process.env.GOOGLE_SHEETS_RANGE || "Stocks!A:B";
const UPSTREAM_TIMEOUT_MS = 8000;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method-not-allowed" });
    return;
  }
  if (!SHEETS_API_KEY || !SHEETS_ID) {
    res.status(500).json({ error: "not-configured" });
    return;
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SHEETS_ID)}/values/${encodeURIComponent(SHEETS_RANGE)}?key=${SHEETS_API_KEY}`;
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
    const rows = Array.isArray(data.values) ? data.values : [];
    // 先頭行が見出し（"ticker","price"等）でも数値化に失敗して自然に無視される
    const prices = {};
    for (const row of rows) {
      const ticker = String(row[0] ?? "").trim().toUpperCase();
      const price = parseFloat(row[1]);
      if (ticker && Number.isFinite(price)) prices[ticker] = price;
    }
    // Vercelのエッジ/CDNキャッシュを軽く効かせ、Sheets APIの呼び出し回数を抑える
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.status(200).json({ prices, updatedAt: new Date().toISOString() });
  } catch (e) {
    clearTimeout(timer);
    res.status(502).json({ error: "fetch-failed" });
  }
}
