// Geminiを使った「NewsPicksニュースの自動取得・登録」用エンドポイント。
// 管理者用のGeminiボタン（簡易）専用で、以下の理由からサーバー側で厳格に
// ガードする（クライアント側のisGeminiNewsAdmin()判定はUI表示の制御にすぎず、
// エンドポイントを直接叩かれた場合の防御にはならないため）：
//   1) FirebaseのIDトークンを検証し、なりすましを防ぐ
//   2) 検証済みトークンのemailクレームがfor.administ@gmail.comと完全一致する
//      場合のみ許可し、それ以外は403で拒否する
const { verifyFirebaseIdTokenClaims } = require("../_lib/firebaseAdmin");

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const ADMIN_EMAIL = "for.administ@gmail.com";
const MAX_PROMPT_LEN = 500;
const MAX_ITEMS = 10;
const MAX_SUMMARY_LEN = 160;

// relaxed=falseの初回検索で0件だった場合にだけ、日付・キーワードの縛りを
// 緩めた2回目の検索を行う（buildFallbackPromptと組み合わせて使う）。
// 「実在する記事以外は使わない」という制約自体はrelaxedでも変えない
// （ここを緩めると記事のでっち上げに繋がるため）。
function buildSystemInstruction(category, relaxed){
  const categoryLabel = category === "world" ? "海外（世界経済）" : "日本（日本経済）";
  const lines = [
    "あなたはニュースアプリの管理者専用ツールに組み込まれた、ニュース収集アシスタントです。",
    "ニュースソースは必ず「NewsPicks」（newspicks.com）に限定してください。他のニュースサイトの記事は絶対に使わないでください。",
    `今回のカテゴリは「${categoryLabel}」です。ユーザーの依頼内容に沿って、該当する最新のNewsPicks記事を検索し、実在する記事のタイトル・URL・要約だけを使ってください。`,
    "記事のタイトル・URL・要約を推測・創作することは絶対に禁止です。検索結果から実在が確認できる記事だけを採用してください。",
    "URLは必ず https://newspicks.com/ から始まる実在のページのみを使ってください。",
  ];
  if(relaxed){
    lines.push(
      "ユーザーが指定した日付・キーワードに厳密に一致する記事が見つからない場合は、無理に諦めず、NewsPicksの直近24時間以内、それも無ければ直近で公開されている最新の記事（IT・ビジネス・経済など一般的なジャンルを問わない）を代わりに採用してください。",
      "日付やキーワードの一致にはこだわらなくてよいので、実在する記事であることだけを条件に、できるだけ件数を埋めてください。",
    );
  } else {
    lines.push("十分な件数が見つからない場合は、無理に件数を埋めず、見つかった分だけを返してください。");
  }
  lines.push(
    "出力は必ず次のJSON形式の配列のみとし、前後に説明文やMarkdownのコードフェンスを一切付けないでください：",
    '[{"title":"記事タイトル","url":"https://newspicks.com/...","summary":"記事内容を1〜2文で要約したもの"}, ...]',
    "summaryは記事の内容から実在する範囲で簡潔にまとめ、不明な場合は空文字にしてください（推測で埋めないこと）。",
    "該当する記事が1件も見つからない場合は空配列 [] のみを返してください。",
  );
  return lines.join("\n");
}

// 初回検索が0件だったときに使う、日付・キーワードを指定しない汎用プロンプト
function buildFallbackPrompt(category){
  const categoryLabel = category === "world" ? "海外・世界経済" : "日本・国内経済";
  return `NewsPicksに掲載されている${categoryLabel}関連の最新ニュースを、IT・ビジネス・経済など話題を問わず${MAX_ITEMS}件まで持ってきてください。`;
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
  if(start === -1) return null;
  const end = cleaned.lastIndexOf("]");
  if(end !== -1 && end > start){
    try{
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      if(Array.isArray(parsed)) return parsed;
    }catch(e){
      // 配列全体としては壊れている（末尾が閉じていない等）ので、下の
      // フォールバックで完成しているオブジェクトだけを個別に救い出す
    }
  }
  // maxOutputTokensでの打ち切りなどにより配列が正しく閉じていないケースに
  // 備え、波括弧の対応を数えながら完成している{...}だけを個別に取り出す
  // （末尾の壊れた1件だけを捨て、それより前の分は活かす）
  return extractCompleteObjects(cleaned.slice(start + 1));
}

function extractCompleteObjects(text){
  const results = [];
  let depth = 0;
  let objStart = -1;
  let inString = false;
  let escape = false;
  for(let i = 0; i < text.length; i++){
    const ch = text[i];
    if(inString){
      if(escape) escape = false;
      else if(ch === "\\") escape = true;
      else if(ch === '"') inString = false;
      continue;
    }
    if(ch === '"'){ inString = true; continue; }
    if(ch === "{"){
      if(depth === 0) objStart = i;
      depth++;
    } else if(ch === "}"){
      depth--;
      if(depth === 0 && objStart !== -1){
        try{ results.push(JSON.parse(text.slice(objStart, i + 1))); }
        catch(e){ /* このオブジェクトは壊れているのでスキップ */ }
        objStart = -1;
      }
    }
  }
  return results;
}

async function callGemini(apiKey, { prompt, category, useSearchGrounding, relaxed }){
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    systemInstruction: { role: "system", parts: [{ text: buildSystemInstruction(category, relaxed) }] },
    generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
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

// グラウンディングあり→無しの順で試し、どちらも失敗したらnullを返す
async function callGeminiWithGroundingFallback(apiKey, { prompt, category, relaxed }){
  let result = await callGemini(apiKey, { prompt, category, useSearchGrounding: true, relaxed });
  if (!result.ok) {
    console.error("gemini news api error (with search grounding):", result.status, result.data);
    result = await callGemini(apiKey, { prompt, category, useSearchGrounding: false, relaxed });
  }
  if (!result.ok) {
    console.error("gemini news api error:", result.status, result.data);
    return null;
  }
  return result;
}

function getReplyText(result){
  const candidate = result.data && result.data.candidates && result.data.candidates[0];
  const parts = (candidate && candidate.content && candidate.content.parts) || [];
  return parts.map((p) => p.text || "").join("");
}

// groundingMetadataの有無・実行された検索クエリを見れば、Gemini側で
// 実際にGoogle検索（グラウンディング）が動いたのかどうかを切り分けられる。
// これが無い/空なら、検索自体が行われずモデルの内部知識だけで
// 「実在確認できない」として空配列を返している可能性が高い
function getGroundingSummary(result){
  const candidate = result.data && result.data.candidates && result.data.candidates[0];
  const gm = candidate && candidate.groundingMetadata;
  const finishReason = candidate && candidate.finishReason;
  const gmText = gm
    ? `webSearchQueries=${JSON.stringify(gm.webSearchQueries || [])} groundingChunks=${(gm.groundingChunks || []).length}`
    : "groundingMetadata=none";
  return `${gmText} finishReason=${finishReason || "unknown"}`;
}

// Geminiのレスポンスからtitle/url/summaryを抽出し、NewsPicks以外のURLや
// 重複URLを弾いた上で検証済みのitems配列にする（システム指示だけに頼らない多層防御）
function extractItems(result){
  const text = getReplyText(result);
  const rawItems = extractJsonArray(text) || [];
  const items = [];
  const seenUrls = new Set();
  for (const raw of rawItems) {
    if (!raw || typeof raw !== "object") continue;
    const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 200) : "";
    const url = typeof raw.url === "string" ? raw.url.trim() : "";
    if (!title || !url) continue;
    if (!isNewsPicksUrl(url)) continue;
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);
    const summary = typeof raw.summary === "string" ? raw.summary.trim().slice(0, MAX_SUMMARY_LEN) : "";
    items.push({ title, url, summary });
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

const URL_CHECK_TIMEOUT_MS = 6000;

// グラウンディングが機能していない場合、Geminiが検索結果の裏付け無しに
// もっともらしいタイトル・URLを作文してしまうことがある（groundingChunksが
// 0でもテキストとしては出力されうる）。プロンプト指示だけに頼らず、実際に
// そのURLが存在するかをサーバー側でも取得確認し、存在しないものは弾く
async function urlLooksReachable(url){
  try{
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), URL_CHECK_TIMEOUT_MS);
    const r = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NewsVerifyBot/1.0)" },
    });
    clearTimeout(timer);
    return r.ok;
  }catch(e){
    return false;
  }
}

async function filterReachableItems(items){
  if(!items.length) return items;
  const reachable = await Promise.all(items.map((it) => urlLooksReachable(it.url)));
  return items.filter((_, i) => reachable[i]);
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
    // 1回目：ユーザーの依頼プロンプトのまま、日付・キーワードに厳密に
    // 沿った検索を行う（グラウンディングあり→無しの順で試す）
    const result = await callGeminiWithGroundingFallback(apiKey, { prompt, category, relaxed: false });
    if (!result) {
      res.status(502).json({ error: "gemini-request-failed" });
      return;
    }

    let items = await filterReachableItems(extractItems(result));
    let fallbackResult = null;

    // 2回目（フォールバック）：厳密一致で0件だった場合のみ、日付・キーワードの
    // 縛りを緩めた汎用プロンプトで再検索する。実在記事のみという制約は
    // 変えないため、それでも0件なら素直に空配列を返す
    if (items.length === 0) {
      fallbackResult = await callGeminiWithGroundingFallback(apiKey, {
        prompt: buildFallbackPrompt(category),
        category,
        relaxed: true,
      });
      if (fallbackResult) items = await filterReachableItems(extractItems(fallbackResult));
    }

    // 0件のままの場合、GoogleのAPI呼び出し自体は成功しているのに実在記事が
    // 見つからない状態なので、原因調査のためGeminiの生テキストをログに残す
    // （NewsPicks限定という制約に対し検索がそもそもヒットしていない可能性が高い）
    if (items.length === 0) {
      console.error(
        "gemini news: no items found.",
        "prompt=", prompt.slice(0, 200),
        "category=", category,
        "firstReplyText=", getReplyText(result).slice(0, 800),
        "firstGrounding=", getGroundingSummary(result),
        "fallbackReplyText=", fallbackResult ? getReplyText(fallbackResult).slice(0, 800) : "(fallback call failed)",
        "fallbackGrounding=", fallbackResult ? getGroundingSummary(fallbackResult) : "(fallback call failed)"
      );
    }

    res.status(200).json({ items });
  } catch (e) {
    console.error("gemini news error:", e);
    res.status(500).json({ error: "internal-error" });
  }
};
