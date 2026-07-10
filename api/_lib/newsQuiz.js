// 「今日のニュース検定」共通ロジック：日付/時間帯の判定、当日ニュースの
// 存在チェック、クイズの取得・自動生成（Gemini）をまとめる。
// 正解判定・AC付与はここでは行わない（api/news-quiz/answer.js側のトランザクションで実施）。

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const QUIZ_START_HOUR = 20; // 20:00〜23:59（isWithinQuizWindowはUTC変換後のJST時刻で判定）
const QUIZ_END_HOUR = 24;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_TIMEOUT_MS = 20000;
const MAX_SOURCE_NEWS = 5;

// サーバーのタイムゾーン設定（Vercelの実行環境はUTC）に依存せず、常に
// 日本時間(JST)を基準に「今日」「現在時刻」を判定する。newsコレクションの
// dateKeyは管理者がブラウザのローカル日付（実運用上は日本時間）で登録して
// いるため、ここで基準を揃えないと日付境界（21〜24時台）でズレが起きる。
function jstNow() {
  return new Date(Date.now() + JST_OFFSET_MS);
}

function jstDateKey(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function isWithinQuizWindow(d) {
  const h = d.getUTCHours();
  return h >= QUIZ_START_HOUR && h < QUIZ_END_HOUR;
}

// 当日dateKeyのニュースを新しい順に最大5件だけ取得する（Geminiへ渡す
// プロンプトが際限なく膨らまないようにするための上限）
async function fetchTodaysNews(firestore, dateKey) {
  const snap = await firestore.collection("news").where("dateKey", "==", dateKey).get();
  const rows = [];
  snap.forEach((doc) => rows.push(doc.data()));
  rows.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return rows.slice(0, MAX_SOURCE_NEWS);
}

// 当日のニュース本文をもとに、Geminiへ3択クイズの生成を依頼する。
// レスポンスはresponseSchemaで構造を固定し、パース失敗時は例外を投げる
// （呼び出し側でエラーとして扱い、クイズを出さないだけに留める）。
async function generateQuizFromNews(newsItems) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("gemini-not-configured");

  const source = newsItems
    .map((n, i) => `[${i + 1}] (${n.category === "japan" ? "日本" : "海外"}) ${n.title}\n${n.content}`)
    .join("\n\n");
  const prompt = [
    "あなたはニュース検定クイズの作問者です。以下は本日登録された主要ニュースです。",
    "この中から1つを選び、事実確認できる3択クイズを1問だけ作成してください。",
    "・questionには曖昧な意見や将来予測ではなく、本文に書かれた具体的な事実を問う設問を作ること。",
    "・choicesは必ず3つ。正解は1つだけとし、誤りの選択肢2つも本文の文脈から見て紛らわしいが明確に誤りとわかる内容にすること。",
    "・correctIndexはchoices配列の中の正解の添字（0〜2の整数）。",
    "・explanationには正解の根拠を本文に基づいて1〜2文で簡潔に書くこと。",
    "",
    source,
  ].join("\n");

  const reqBody = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.4,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          question: { type: "STRING" },
          choices: { type: "ARRAY", items: { type: "STRING" }, minItems: 3, maxItems: 3 },
          correctIndex: { type: "INTEGER" },
          explanation: { type: "STRING" },
        },
        required: ["question", "choices", "correctIndex", "explanation"],
      },
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
        signal: controller.signal,
      }
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error("gemini-http-" + res.status);

  const data = await res.json();
  const text =
    data &&
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text;
  if (!text) throw new Error("gemini-empty-response");

  const parsed = JSON.parse(text);
  if (
    !parsed ||
    typeof parsed.question !== "string" ||
    !Array.isArray(parsed.choices) ||
    parsed.choices.length !== 3 ||
    typeof parsed.correctIndex !== "number" ||
    parsed.correctIndex < 0 ||
    parsed.correctIndex > 2
  ) {
    throw new Error("gemini-invalid-shape");
  }

  return {
    question: parsed.question.slice(0, 200),
    choices: parsed.choices.map((c) => String(c).slice(0, 120)),
    correctIndex: Math.trunc(parsed.correctIndex),
    explanation: String(parsed.explanation || "").slice(0, 300),
  };
}

// dailyQuiz/{dateKey} を取得する。無ければ当日のnewsから生成して保存する。
// 当日ニュースが1件も無ければnullを返す（＝クイズイベント自体を発生させない）。
async function getOrCreateDailyQuiz(firestore, dateKey) {
  const ref = firestore.collection("dailyQuiz").doc(dateKey);
  const snap = await ref.get();
  if (snap.exists) return snap.data();

  const newsItems = await fetchTodaysNews(firestore, dateKey);
  if (!newsItems.length) return null;

  const generated = await generateQuizFromNews(newsItems);
  const doc = Object.assign({ dateKey, createdAt: new Date().toISOString() }, generated);

  // create()は既に存在する場合に失敗する。ほぼ同時刻に複数ユーザーの
  // 最初のリクエストが競合しても、先に書き込まれた1件だけを全員で共有する
  // ようにするための単純な排他制御（Cloud Functionsのコールドスタート
  // 毎に別インスタンスで動くため、メモリ上のロックでは代用できない）。
  try {
    await ref.create(doc);
    return doc;
  } catch (e) {
    const existing = await ref.get();
    if (existing.exists) return existing.data();
    throw e;
  }
}

module.exports = { jstNow, jstDateKey, isWithinQuizWindow, fetchTodaysNews, getOrCreateDailyQuiz };
