// Gemini APIキーはサーバー側の環境変数（Vercelのプロジェクト設定）でのみ保持し、
// フロントエンドには一切渡さない。クライアントはこのエンドポイントにメッセージを
// POSTするだけで、実際のGemini呼び出しはここで行う。
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_MESSAGE_LEN = 2000;
const MAX_HISTORY_TURNS = 20;

// ユーザーが「予定を入れて」のように話しかけたとき、Geminiにこの関数を
// 呼び出させて日付・時刻・タイトルを構造化データとして抽出させる。実際の
// カレンダーへの書き込みはクライアント側（js/gemini.js経由でrender.js内の
// 既存のカレンダー登録処理）が行うため、ここでは抽出のみを担当する
const SCHEDULE_TOOLS = [{
  functionDeclarations: [{
    name: "register_schedule",
    description: "ユーザーが日時とタイトルを指定して予定・スケジュールの登録を明確に依頼したときだけ呼び出す。単なる質問や相談の場合は呼び出さないこと。",
    parameters: {
      type: "OBJECT",
      properties: {
        date: { type: "STRING", description: "予定の日付。YYYY-MM-DD形式（例:2026-07-09）。「明日」「来週火曜」等の相対表現は、与えられた本日の日付を基準に絶対日付へ変換すること。" },
        start_time: { type: "STRING", description: "開始時刻。HH:MM形式24時間表記（例:16:00）。指定が無い終日予定の場合は省略。" },
        end_time: { type: "STRING", description: "終了時刻。HH:MM形式24時間表記（例:17:00）。指定が無い場合は省略。" },
        title: { type: "STRING", description: "予定のタイトル・内容。" },
      },
      required: ["date", "title"],
    },
  }],
}];

function buildSystemInstruction(today){
  const lines = [
    "あなたはIT資格対策アプリ（Microsoft Azure/SC-300、LPICなど）に組み込まれた学習アシスタントです。",
    "Azure・LPIC・ITインフラ全般や資格試験の学習に関する質問に、初学者にも分かりやすい日本語で簡潔に答えてください。",
    "雑談程度の話題には常識の範囲で軽く答えて構いませんが、医療・法律・金融など専門外の断定的なアドバイスは避けてください。",
    "このアプリにはカレンダー機能があり、ユーザーが「7月9日16時から17時で予定を入れて」のように予定登録を明確に依頼した場合は、テキストで返答せず register_schedule 関数を呼び出してください。日付・タイトルが不明瞭で判断できない場合のみ、関数を呼ばずに聞き返してください。",
  ];
  if(today && today.date){
    lines.push(`本日の日付は${today.date}${today.weekday ? `（${today.weekday}曜日）` : ""}です。現在時刻は${today.time || "不明"}です。相対的な日付表現はこれを基準に解釈してください。`);
  }
  return lines.join("");
}

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

  // クライアント（ブラウザ）のローカル日時。「明日」「来週」等の相対的な
  // 日付表現をユーザーの実際のタイムゾーンを基準に解釈させるために使う
  const today = body.today && typeof body.today === "object" ? {
    date: typeof body.today.date === "string" ? body.today.date.slice(0, 10) : "",
    weekday: typeof body.today.weekday === "string" ? body.today.weekday.slice(0, 4) : "",
    time: typeof body.today.time === "string" ? body.today.time.slice(0, 5) : "",
  } : null;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        tools: SCHEDULE_TOOLS,
        systemInstruction: { role: "system", parts: [{ text: buildSystemInstruction(today) }] },
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
    const parts = (candidate && candidate.content && candidate.content.parts) || [];

    const functionCallPart = parts.find((p) => p.functionCall && p.functionCall.name === "register_schedule");
    if (functionCallPart) {
      res.status(200).json({ functionCall: { name: "register_schedule", args: functionCallPart.functionCall.args || {} } });
      return;
    }

    const reply = parts.map((p) => p.text || "").join("");
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
