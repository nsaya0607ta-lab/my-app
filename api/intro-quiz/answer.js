// ユーザーがテキスト入力欄に曲名を入力して送信したときに呼ばれるAPI。
//
// 3択ボタンをやめ、自由記述の回答文字列（answerText）をレーベンシュタイン距離
// ベースの類似度で判定する（api/_lib/textMatch.js）。判定結果は3パターン：
//   1) 完全一致（表記ゆれ正規化後）        → 即正解として確定
//   2) 8割以上一致（だが完全一致ではない）  → 「もしかして」サジェストを返し、
//                                            確定はしない（/confirm 待ち）
//   3) それ未満                            → 不正解。試行回数の上限内なら
//                                            再入力を促し、上限に達したら
//                                            強制的に答えを開示して確定する
//
// 「1セッション＝1プレイ」に対して報酬・日次カウンターの加算は必ず1回だけ
// （セッション確定＝session.used=trueになる瞬間）に行う。共通処理は
// api/_lib/introQuizDaily.js の finalizeSession() に集約している。
const { verifyFirebaseIdToken, getAdmin } = require("../_lib/firebaseAdmin");
const { matchAnswer } = require("../_lib/textMatch");
const { finalizeSession, SESSION_TTL_MS, MAX_ATTEMPTS_PER_SESSION } = require("../_lib/introQuizDaily");

// この類似度以上なら「もしかして」サジェストの対象にする（8割程度一致）
const SUGGEST_THRESHOLD = 0.8;
const MATCH_FIELDS = ["title", "titleKana", "titleRomaji", "titleEn"];

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method-not-allowed" });
    return;
  }

  let uid;
  try {
    uid = await verifyFirebaseIdToken(req);
  } catch (e) {
    res.status(e.statusCode || 401).json({ error: e.message });
    return;
  }

  const body = req.body || {};
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : "";
  const answerText = typeof body.answerText === "string" ? body.answerText.slice(0, 200) : "";
  if (!sessionId || !answerText.trim()) {
    res.status(400).json({ error: "bad-request" });
    return;
  }

  let admin;
  try {
    admin = getAdmin();
  } catch (e) {
    console.error("intro-quiz answer: admin init failed:", e);
    res.status(500).json({ error: "server-misconfigured" });
    return;
  }
  const db = admin.firestore();
  const sessionRef = db.collection("introQuizSessions").doc(sessionId);

  try {
    const result = await db.runTransaction(async (tx) => {
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists) {
        const e = new Error("session-not-found"); e.statusCode = 404; throw e;
      }
      const session = sessionSnap.data();
      if (session.uid !== uid) {
        // 他人のセッションIDを流用しようとした場合も「見つからない」と同じ扱いにする
        const e = new Error("session-not-found"); e.statusCode = 404; throw e;
      }
      if (session.used) {
        const e = new Error("session-already-used"); e.statusCode = 409; throw e;
      }
      if (Date.now() - session.createdAt > SESSION_TTL_MS) {
        const e = new Error("session-expired"); e.statusCode = 410; throw e;
      }

      const attempts = (session.attempts || 0) + 1;
      const candidates = MATCH_FIELDS
        .map((f) => ({ field: f, value: session.match && session.match[f] }))
        .filter((c) => c.value);
      const match = matchAnswer(answerText, candidates);

      if (match.exact) {
        const fin = await finalizeSession(tx, db, { uid, sessionRef, correct: true });
        return {
          done: true, correct: true, bp: fin.reward.bp, ac: fin.reward.ac, capReached: fin.capReached,
          videoId: session.videoId, title: session.title, artist: session.artist,
        };
      }

      if (match.score >= SUGGEST_THRESHOLD) {
        tx.set(sessionRef, { attempts, pendingSuggestion: { title: session.title, score: match.score } }, { merge: true });
        return {
          done: false, status: "suggest",
          suggestedTitle: session.title, suggestedArtist: session.artist, score: match.score,
        };
      }

      if (attempts >= MAX_ATTEMPTS_PER_SESSION) {
        // 試行回数の上限に達した→強制的に答えを開示して確定する（不正解扱い、報酬なし）
        const fin = await finalizeSession(tx, db, { uid, sessionRef, correct: false });
        return {
          done: true, correct: false, bp: 0, ac: 0, capReached: fin.capReached,
          videoId: session.videoId, title: session.title, artist: session.artist,
        };
      }

      tx.set(sessionRef, { attempts }, { merge: true });
      return { done: false, status: "incorrect", attemptsLeft: MAX_ATTEMPTS_PER_SESSION - attempts };
    });

    res.status(200).json(Object.assign({ ok: true }, result));
  } catch (e) {
    const statusCode = e.statusCode || 500;
    if (statusCode >= 500) console.error("intro-quiz answer error:", e);
    res.status(statusCode).json({ error: e.message || "internal-error" });
  }
};
