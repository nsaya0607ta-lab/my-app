// 復習掲示板（LPIC-1ホーム画面）の各復習項目に対する回答・解説を生成するAPI。
// api/gemini/chat.js と同じく、Gemini APIキーはサーバー側の環境変数のみで
// 保持し、フロントエンドには一切渡さない。チャットと違い1件の質問に対する
// 短い解説を都度1回だけ返せばよいので、ストリーミングは使わずシンプルな
// JSONレスポンスにしている。
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_QUESTION_LEN = 300;
const UPSTREAM_TIMEOUT_MS = 25000;
// chat.jsと同じ方針：クォータの浪費を避けるため、リトライは最大1回・
// 間隔は3秒以上空ける
const UPSTREAM_MAX_ATTEMPTS = 2;
const UPSTREAM_RETRY_DELAY_MS = 3000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchGeminiWithRetry(url, options){
  let lastErr;
  for(let attempt = 0; attempt < UPSTREAM_MAX_ATTEMPTS; attempt++){
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try{
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if((res.status === 429 || res.status >= 500) && attempt < UPSTREAM_MAX_ATTEMPTS - 1){
        await sleep(UPSTREAM_RETRY_DELAY_MS);
        continue;
      }
      return res;
    }catch(e){
      clearTimeout(timer);
      lastErr = e;
      if(attempt < UPSTREAM_MAX_ATTEMPTS - 1){
        await sleep(UPSTREAM_RETRY_DELAY_MS);
        continue;
      }
    }
  }
  throw lastErr || new Error("gemini-request-failed");
}

// LPIC-1学習者向けの解説になるよう役割・出力ルールを固定するシステム指示。
// ユーザー入力（question）はここには含めず、後段のcontentsで別メッセージとして
// 渡すことで、プロンプトインジェクションでルール自体を上書きされにくくする
function buildSystemInstruction(){
  return [
    "あなたはLPIC Level1（Linux技術者認定の入門レベル）を学習中のユーザー向けに、復習項目への回答・解説を書くアシスタントです。",
    "渡される「復習項目」は、ユーザーが自分用にその日の復習ノートとして箇条書きで登録した1行です。「〇〇は何をする操作か」のような問いかけの形のこともあれば、「dfとduの違い」のような見出しのような形のこともあります。どちらの形でも、その項目について解説する自然な回答を書いてください。",
    "以下のルールを必ず守ってください。",
    "1. 結論を最初の1文で述べてから、補足の説明を続けてください。",
    "2. LPIC Level1の初学者にも分かるやさしい日本語で書いてください。専門用語を使う場合は、その場で短く補足してください。",
    "3. 単なる一文で終わらせず、なぜそうなるのか・どう使うのかが分かるように、2〜4文程度でしっかり説明してください。ただし長くなりすぎないよう、全体を300文字程度までを目安にまとめてください。",
    "4. 具体的なコマンドの実行例を示すと理解の助けになる場合は、コマンド例を含めてください。その際は必ず```で囲んだコードブロックにし、1行目をプロンプト記号「$ 」から始まるコマンド、2行目以降をプロンプト記号なしの実行結果例としてください（例：\n```\n$ rpm -ql httpd\n/etc/httpd/conf/httpd.conf\n/usr/sbin/httpd\n```\n）。コマンド例が不要な項目では無理に付けなくて構いません。",
    "5. 断定できない・自信の持てない内容は断定せず、一般的に言われている範囲にとどめてください。不確かな数値や仕様の詳細を創作しないでください。",
    "6. 絵文字は一切使わないでください。#のような見出し記号や、**のような強調記号も使わないでください。箇条書きが必要な場合は行頭に「・」を使ってください（ただし上記のコマンド例の```ブロックはこの制限の対象外です）。",
    "7. 回答本文だけを出力してください。「回答：」のような接頭辞や前置き・挨拶は不要です。",
  ].join("\n");
}

module.exports = async (req, res) => {
  if(req.method !== "POST"){
    res.status(405).json({ error: "method-not-allowed" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if(!apiKey){
    console.error("gemini review-answer error: GEMINI_API_KEY is not set");
    res.status(500).json({ error: "server-misconfigured" });
    return;
  }

  const body = req.body || {};
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if(!question){
    res.status(400).json({ error: "question-required" });
    return;
  }
  if(question.length > MAX_QUESTION_LEN){
    res.status(400).json({ error: "question-too-long" });
    return;
  }

  try{
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
    const r = await fetchGeminiWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `復習項目：${question}` }] }],
        systemInstruction: { role: "system", parts: [{ text: buildSystemInstruction() }] },
        generationConfig: { temperature: 0.5, maxOutputTokens: 768 },
      }),
    });

    if(!r.ok){
      let data = null;
      try{ data = await r.json(); }catch(_){ /* ボディが無い/JSONでない場合は無視 */ }
      console.error("gemini review-answer api error:", r.status, data);
      res.status(502).json({ error: (data && data.error && data.error.message) || "gemini-request-failed" });
      return;
    }

    const data = await r.json();
    const candidate = data && data.candidates && data.candidates[0];
    const parts = (candidate && candidate.content && candidate.content.parts) || [];
    const answer = parts.map(p => (typeof p.text === "string" ? p.text : "")).join("").trim();
    const blockReason = data && data.promptFeedback && data.promptFeedback.blockReason;
    const finishReason = candidate && candidate.finishReason;

    if(!answer){
      console.error(
        "gemini review-answer: empty response.",
        "blockReason=", blockReason,
        "finishReason=", finishReason
      );
      res.status(502).json({ error: "empty-response" });
      return;
    }

    res.status(200).json({ answer });
  }catch(e){
    console.error("gemini review-answer error:", e);
    res.status(500).json({ error: "internal-error" });
  }
};
