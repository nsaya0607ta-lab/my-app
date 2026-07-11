// answer.js が「もしかして」サジェスト（status:"suggest"）を返したあと、
// ユーザーがその提案を受け入れる／拒否するときに呼ばれるAPI。
//   accept:true  → サジェストされた曲名で正解確定（報酬あり）
//   accept:false → サジェストを取り下げ、入力欄に戻す（試行回数が上限に
//                  達していれば、そのまま強制開示にする）
//
// 正解の曲名はクライアントから受け取らず、必ずセッションに保存済みの
// pendingSuggestion（answer.js が算出したサーバー側の判定結果）を使う。
// これにより、クライアントが任意の曲名を送りつけて正解にすることはできない。
const { verifyFirebaseIdToken, getAdmin } = require("../_lib/firebaseAdmin");
const { finalizeSession, SESSION_TTL_MS, MAX_ATTEMPTS_PER_SESSION } = require("../_lib/introQuizDaily");

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
  const accept = body.accept === true;
  if (!sessionId) {
    res.status(400).json({ error: "bad-request" });
    return;
  }

  let admin;
  try {
    admin = getAdmin();
  } catch (e) {
    console.error("intro-quiz confirm: admin init failed:", e);
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
        const e = new Error("session-not-found"); e.statusCode = 404; throw e;
      }
      if (session.used) {
        const e = new Error("session-already-used"); e.statusCode = 409; throw e;
      }
      if (!session.pendingSuggestion) {
        const e = new Error("no-pending-suggestion"); e.statusCode = 409; throw e;
      }
      if (Date.now() - session.createdAt > SESSION_TTL_MS) {
        const e = new Error("session-expired"); e.statusCode = 410; throw e;
      }

      if (accept) {
        const fin = await finalizeSession(tx, db, { uid, sessionRef, correct: true });
        return {
          done: true, correct: true, bp: fin.reward.bp, ac: fin.reward.ac, capReached: fin.capReached,
          videoId: session.videoId, title: session.title, artist: session.artist,
        };
      }

      const attempts = session.attempts || 0;
      if (attempts >= MAX_ATTEMPTS_PER_SESSION) {
        const fin = await finalizeSession(tx, db, { uid, sessionRef, correct: false });
        return {
          done: true, correct: false, bp: 0, ac: 0, capReached: fin.capReached,
          videoId: session.videoId, title: session.title, artist: session.artist,
        };
      }

      tx.set(sessionRef, { pendingSuggestion: null }, { merge: true });
      return { done: false, status: "incorrect", attemptsLeft: MAX_ATTEMPTS_PER_SESSION - attempts };
    });

    res.status(200).json(Object.assign({ ok: true }, result));
  } catch (e) {
    const statusCode = e.statusCode || 500;
    if (statusCode >= 500) console.error("intro-quiz confirm error:", e);
    res.status(statusCode).json({ error: e.message || "internal-error" });
  }
};
