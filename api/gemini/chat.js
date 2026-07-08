// Gemini APIキーはサーバー側の環境変数（Vercelのプロジェクト設定）でのみ保持し、
// フロントエンドには一切渡さない。クライアントはこのエンドポイントにメッセージを
// POSTするだけで、実際のGemini呼び出しはここで行う。
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_MESSAGE_LEN = 2000;
const MAX_HISTORY_TURNS = 20;

// ユーザーが「予定を入れて」のように話しかけたとき、Geminiにこの関数を
// 呼び出させて日付・時刻・タイトルを構造化データとして抽出させる。実際の
// カレンダーへの書き込み・変更・削除はクライアント側（js/gemini.js経由で
// render.js内の既存のカレンダー登録処理）が行うため、ここでは抽出のみを担当する。
// register_scheduleについては、抽出結果をもとにクライアント側がまず
// チャット上の確認カード（プレビュー）を表示するだけで、実際の登録は
// ユーザーがカードで確定操作をするまで行われない
const SCHEDULE_FUNCTION_NAMES = new Set(["register_schedule", "update_schedule", "delete_schedule"]);

const SCHEDULE_TOOLS = [{
  functionDeclarations: [
    {
      name: "register_schedule",
      description: "ユーザーが日時と内容を指定して予定・スケジュールの登録を明確に依頼したときだけ呼び出す。単なる質問や相談の場合は呼び出さないこと。",
      parameters: {
        type: "OBJECT",
        properties: {
          date: { type: "STRING", description: "予定の日付。YYYY-MM-DD形式（例:2026-07-09）。「明日」「来週火曜」「今週末」等の相対表現は、与えられた本日の日付・曜日を基準に絶対日付へ変換すること。繰り返し予定の場合は最初の1回目の日付を入れる。" },
          start_time: { type: "STRING", description: "開始時刻。HH:MM形式24時間表記（例:16:00）。relative_anchor_titleを指定する場合や、終日予定の場合は省略してよい。" },
          end_time: { type: "STRING", description: "終了時刻。HH:MM形式24時間表記（例:17:00）。指定が無い場合は省略。" },
          title: { type: "STRING", description: "予定のタイトル。以下の2点を厳守すること。(1)「〜の予定を入れて」等の依頼表現をそのまま入れず、文脈から本質的なイベント名だけを抽出する（例：「仕事」「会議」「デート」「美容院」）。(2)「役所に行く」「歯医者に行く」「資料を作成する」のような動詞・タスク表現は、そのまま入れず適切な名詞に変換する（例：「15時に役所に行く」→「役所」、「レポートを提出する」→「レポート提出」）。" },
          relative_anchor_title: { type: "STRING", description: "「〜のあと」「〜の前」のように、既存の別の予定を基準にした相対的な時間指定がされた場合の、基準となる予定のタイトル（例：「明日の仕事のあとに美容院」→「仕事」）。この場合、自分で時刻を推測せずstart_time/end_timeは省略し、この項目とrelative_positionだけを指定すること。実際の時刻はアプリ側が基準予定の実在時刻から自動計算する。" },
          relative_position: { type: "STRING", enum: ["after", "before"], description: "relative_anchor_titleで指定した予定に対して、新しい予定が「あと（直後）」なのか「前（直前）」なのかを指定する。省略時はafter扱い。" },
          recurrence: { type: "STRING", enum: ["none", "daily", "weekly", "monthly"], description: "繰り返し予定の種類。「毎日」→daily、「毎週〇曜日」→weekly、「毎月〇日」→monthly。単発の予定なら省略またはnone。" },
        },
        required: ["date", "title"],
      },
    },
    {
      name: "update_schedule",
      description: "登録済みの予定の日時やタイトルの変更をユーザーが依頼したときに呼び出す（例：「さっきの予定、10時からに後ろ倒しして」「タイトルを『ミーティング』に変えて」）。",
      parameters: {
        type: "OBJECT",
        properties: {
          target: { type: "STRING", description: "対象の指定方法。ユーザーが「さっきの」「今の」のように直前に登録した予定を指している場合は'last'を指定する。" },
          date: { type: "STRING", description: "変更対象を日付とタイトルで特定する場合の、元の予定の日付。YYYY-MM-DD形式。targetが'last'の場合は省略可。" },
          original_title: { type: "STRING", description: "変更対象を特定するための元のタイトル（分かる場合のみ）。" },
          new_date: { type: "STRING", description: "変更後の日付。YYYY-MM-DD形式。日付を変更しない場合は省略。" },
          new_start_time: { type: "STRING", description: "変更後の開始時刻。HH:MM形式24時間表記。変更しない場合は省略。" },
          new_end_time: { type: "STRING", description: "変更後の終了時刻。HH:MM形式24時間表記。変更しない場合は省略。" },
          new_title: { type: "STRING", description: "変更後のタイトル。変更しない場合は省略。" },
        },
        required: [],
      },
    },
    {
      name: "delete_schedule",
      description: "登録済みの予定の削除・取り消し・キャンセルをユーザーが依頼したときに呼び出す（例：「今のやつ消して」「予定を取り消して」「さっきのキャンセルして」）。",
      parameters: {
        type: "OBJECT",
        properties: {
          target: { type: "STRING", description: "ユーザーが「今の」「さっきの」のように直前に登録した予定を指している場合は'last'を指定する。" },
          date: { type: "STRING", description: "削除対象を日付とタイトルで特定する場合の日付。YYYY-MM-DD形式。targetが'last'の場合は省略可。" },
          title: { type: "STRING", description: "削除対象を特定するためのタイトル（分かる場合のみ）。" },
        },
        required: [],
      },
    },
  ],
}];

function buildSystemInstruction(today){
  const lines = [
    "あなたはIT資格対策アプリ（Microsoft Azure/SC-300、LPICなど）に組み込まれた学習アシスタントです。",
    "Azure・LPIC・ITインフラ全般や資格試験の学習に関する質問に、初学者にも分かりやすい日本語で簡潔に答えてください。",
    "雑談程度の話題には常識の範囲で軽く答えて構いませんが、医療・法律・金融など専門外の断定的なアドバイスは避けてください。",
    "このアプリにはカレンダー機能があり、予定の登録・変更・削除をユーザーに代わって行えます。以下のルールに従ってください。",
    "【予定の登録】ユーザーが日時と内容を示して予定登録を明確に依頼した場合は、テキストで返答せず register_schedule 関数を呼び出してください。titleには「〜の予定を入れて」等の依頼表現をそのまま入れず、文脈から本質的なイベント名だけを抽出してください（例：「明日の9時から仕事の予定を入れて」→title=「仕事」、「金曜の夜に美容院の予定を追加して」→title=「美容院」）。また「15時に役所に行く」「資料を作成する」のような動詞・タスク表現も、そのまま入れず適切な名詞に変換してください（例：「役所に行く」→title=「役所」）。日付・内容が不明瞭で判断できない場合のみ、関数を呼ばずに聞き返してください。register_scheduleを呼び出すと、実際の登録はまだ行われず、アプリ側がユーザーに確認カードを表示して最終確認を取ります。重複の警告もそのカード上に自動で表示されるため、あなたが重複の有無を気にしたり、確認や再呼び出しをする必要はありません。",
    "【相対的な時間指定（文脈連携）】「明日の仕事のあとに美容院」「会議の前にランチ」のように、既存の別の予定を基準にした時間指定がされた場合は、自分で時刻を推測しないでください。start_time/end_timeは省略し、relative_anchor_title（基準となる予定のタイトル、例：「仕事」）とrelative_position（「あと」ならafter、「前」ならbefore）を指定してregister_scheduleを呼び出してください。実際の時刻は、アプリ側がカレンダー上の基準予定の実在時刻を調べて自動計算します。",
    "【日時が曖昧な表現】「明日の朝」「今週末の昼」「来週の仕事終わり」のように具体的な時刻が無い場合は、一般的な生活時間帯から違和感のない時刻を常識的に推測してregister_scheduleを呼び出してください（目安：朝＝9:00、昼＝12:00、夜・仕事終わり＝19:00）。推測が難しい場合のみ、関数を呼ばずに「何時頃にしますか？」のように自然に聞き返してください。",
    "【曜日・日付の解釈】「来週の火曜」「今週末」のように感覚がズレやすい表現は、与えられた本日の日付・曜日を基準に、会話の前後の文脈も踏まえて最も可能性の高い正確な日付を計算してください。「今週末」は直近の土曜日（すでに週末なら当日）を指すのが基本ですが、文脈上「日曜」を指していそうな場合はそちらを優先してください。",
    "【繰り返し予定の自動検知】「毎週火曜日」「毎月1日」「毎日」のように繰り返しを示す表現が含まれる場合は、単発の予定ではなく繰り返し予定として扱い、register_scheduleのrecurrenceに daily/weekly/monthly のいずれかを指定してください（dateには1回目の日付を入れてください）。繰り返しを示す表現が無い場合はrecurrenceを省略してください。",
    "【予定の削除・取り消し】ユーザーが「今のやつ消して」「予定を取り消して」「さっきのをキャンセルして」のように予定の削除を依頼した場合はdelete_schedule関数を呼び出してください。直前にこの会話で登録した予定を指している場合はtargetに'last'を指定し、date/titleは省略してください。特定の日付やタイトルで対象が分かる場合はそちらを指定してください。",
    "【予定の変更】「さっきの予定、10時からに後ろ倒しして」「タイトルを『ミーティング』に変えて」のように、登録済みの予定の日時やタイトルの変更を依頼された場合はupdate_schedule関数を呼び出してください。対象の指定方法はdelete_scheduleと同様です。変更したい項目（new_date/new_start_time/new_end_time/new_title）だけを指定し、変更しない項目は省略してください。",
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

    const functionCallPart = parts.find((p) => p.functionCall && SCHEDULE_FUNCTION_NAMES.has(p.functionCall.name));
    if (functionCallPart) {
      res.status(200).json({ functionCall: { name: functionCallPart.functionCall.name, args: functionCallPart.functionCall.args || {} } });
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
