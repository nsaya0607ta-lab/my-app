// Geminiを使った「NewsPicksニュースの自動取得・登録」用エンドポイント。
// 管理者用のGeminiボタン（簡易）専用で、以下の理由からサーバー側で厳格に
// ガードする（クライアント側のisGeminiNewsAdmin()判定はUI表示の制御にすぎず、
// エンドポイントを直接叩かれた場合の防御にはならないため）：
//   1) FirebaseのIDトークンを検証し、なりすましを防ぐ
//   2) 検証済みトークンのemailクレームがadmin@gmail.comと完全一致する
//      場合のみ許可し、それ以外は403で拒否する
const { verifyFirebaseIdTokenClaims } = require("../_lib/firebaseAdmin");

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const ADMIN_EMAIL = "admin@gmail.com";
const MAX_PROMPT_LEN = 500;
const MAX_ITEMS = 10;

function buildSystemInstruction(category){
  const categoryLabel = category === "world" ? "海外（世界経済）" : "日本（日本経済）";
  return [
    "あなたはニュースアプリの管理者専用ツールに組み込まれた、ニュース収集アシスタントです。",
    `ニュースソースは必ず「NewsPicks」（newspicks.com）に限定してください。他のニュースサイトの記事は絶対に使わないでください。`,
    `今回のカテゴリは「${categoryLabel}」です。ユーザーの依頼内容に沿って、該当する最新のNewsPicks記事を検索し、実在する記事のタイトルとURLだけを使ってください。`,
    "記事のタイトルやURLを推測・創作することは禁止です。検索結果から実在が確認できる記事だけを採用してください。十分な件数が見つからない場合は、無理に件数を埋めず、見つかった分だけを返してください。",
    "URLは必ず https://newspicks.com/ から始まる実在のページのみを使ってください。",
    "出力は必ず次のJSON形式の配列のみとし、前後に説明文やMarkdownのコードフェンスを一切付けないでください：",
    '[{"title":"記事タイトル","url":"https://newspicks.com/..."}, ...]',
    "該当する記事が1件も見つからない場合は空配列 [] のみを返してください。",
  ].join("\n");
}

function isNewsPicksUrl(raw){
  try{
    const u = new URL(raw);
    if(u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    return host === "newspicks.com" || host.endsWith(".newspicks.com");
  }catch(e){
    return false;
  }
}

function extractJsonArray(text){
  if(typeof text !== "string") return null;
  let cleaned = text.trim();
  // ```json ... ``` のようなコードフェンスで返ってきた場合に備えて剥がす
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(cleaned);
  if(fenceMatch) cleaned = fenceMatch[1].trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if(start === -1 || end === -1 || end < start) return null;
  try{
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  }catch(e){
    return null;
  }
}

async function callGemini(apiKey, { prompt, category, useSearchGrounding }){
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    systemInstruction: { role: "system", parts: [{ text: buildSystemInstruction(category) }] },
    generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
  };
  if(useSearchGrounding) body.tools = [{ google_search: {} }];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method-not-allowed" });
    return;
  }

  let claims;
  try {
    claims = await verifyFirebaseIdTokenClaims(req);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
    return;
  }

  const email = (claims && claims.email) || "";
  if (email.trim().toLowerCase() !== ADMIN_EMAIL) {
    res.status(403).json({ error: "forbidden: admin-only feature" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("gemini news error: GEMINI_API_KEY is not set");
    res.status(500).json({ error: "server-misconfigured" });
    return;
  }

  const bodyIn = req.body || {};
  const prompt = typeof bodyIn.prompt === "string" ? bodyIn.prompt.trim() : "";
  const category = bodyIn.category === "world" ? "world" : "japan";
  if (!prompt) {
    res.status(400).json({ error: "prompt-required" });
    return;
  }
  if (prompt.length > MAX_PROMPT_LEN) {
    res.status(400).json({ error: "prompt-too-long" });
    return;
  }

  try {
    // まずGoogle検索によるグラウンディング付きで実在記事を探させ、万一
    // このモデル/プロジェクト設定で当該ツールが使えない場合（400エラー）は
    // グラウンディング無しで再試行する
    let result = await callGemini(apiKey, { prompt, category, useSearchGrounding: true });
    if (!result.ok) {
      console.error("gemini news api error (with search grounding):", result.status, result.data);
      result = await callGemini(apiKey, { prompt, category, useSearchGrounding: false });
    }
    if (!result.ok) {
      console.error("gemini news api error:", result.status, result.data);
      res.status(502).json({ error: (result.data && result.data.error && result.data.error.message) || "gemini-request-failed" });
      return;
    }

    const candidate = result.data && result.data.candidates && result.data.candidates[0];
    const parts = (candidate && candidate.content && candidate.content.parts) || [];
    const text = parts.map((p) => p.text || "").join("");

    const rawItems = extractJsonArray(text) || [];
    const items = [];
    for (const raw of rawItems) {
      if (!raw || typeof raw !== "object") continue;
      const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 200) : "";
      const url = typeof raw.url === "string" ? raw.url.trim() : "";
      if (!title || !url) continue;
      // NewsPicks以外のドメインが混じっていた場合はここで確実に弾く
      // （システム指示だけに頼らない多層防御）
      if (!isNewsPicksUrl(url)) continue;
      items.push({ title, url });
      if (items.length >= MAX_ITEMS) break;
    }

    res.status(200).json({ items });
  } catch (e) {
    console.error("gemini news error:", e);
    res.status(500).json({ error: "internal-error" });
  }
};
