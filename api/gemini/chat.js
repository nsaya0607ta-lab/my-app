// Gemini APIキーはサーバー側の環境変数（Vercelのプロジェクト設定）でのみ保持し、
// フロントエンドには一切渡さない。クライアントはこのエンドポイントにメッセージを
// POSTするだけで、実際のGemini呼び出しはここで行う。
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_MESSAGE_LEN = 2000;
const MAX_HISTORY_TURNS = 20;

const SYSTEM_INSTRUCTION = [
  "あなたはIT資格対策アプリ（Microsoft Azure/SC-300、LPICなど）に組み込まれた学習アシスタントです。",
  "Azure・LPIC・ITインフラ全般や資格試験の学習に関する質問に、初学者にも分かりやすい日本語で簡潔に答えてください。",
  "雑談程度の話題には常識の範囲で軽く答えて構いませんが、医療・法律・金融など専門外の断定的なアドバイスは避けてください。",
].join("");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method-not-allowed" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("gemini chat error: GEMINI_API_KEY is not set");
    res.status(500).json({ error: "server-misconfigured" });
    return;
  }

  const body = req.body || {};
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    res.status(400).json({ error: "message-required" });
    return;
  }
  if (message.length > MAX_MESSAGE_LEN) {
    res.status(400).json({ error: "message-too-long" });
    return;
  }

  // フロント側は直近のやり取りだけを送ってくる想定だが、念のためサーバー側でも
  // 件数・型・長さの上限をかけて不正な形のリクエストを弾く
  const rawHistory = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY_TURNS) : [];
  const contents = [];
  for (const turn of rawHistory) {
    if (!turn || (turn.role !== "user" && turn.role !== "model")) continue;
    const text = typeof turn.text === "string" ? turn.text.slice(0, MAX_MESSAGE_LEN) : "";
    if (!text) continue;
    contents.push({ role: turn.role, parts: [{ text }] });
  }
  contents.push({ role: "user", parts: [{ text: message }] });

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: { role: "system", parts: [{ text: SYSTEM_INSTRUCTION }] },
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      console.error("gemini api error:", data);
      res.status(502).json({ error: (data && data.error && data.error.message) || "gemini-request-failed" });
      return;
    }

    const candidate = data && data.candidates && data.candidates[0];
    const reply = candidate && candidate.content && candidate.content.parts
      ? candidate.content.parts.map((p) => p.text || "").join("")
      : "";

    if (!reply) {
      const blocked = data && data.promptFeedback && data.promptFeedback.blockReason;
      res.status(200).json({
        reply: blocked
          ? "この内容にはお答えできませんでした。別の聞き方でもう一度お試しください。"
          : "回答を生成できませんでした。もう一度お試しください。",
      });
      return;
    }

    res.status(200).json({ reply });
  } catch (e) {
    console.error("gemini chat error:", e);
    res.status(500).json({ error: "internal-error" });
  }
};
