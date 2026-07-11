// 「諦めて答えを見る」ボタンから呼ばれるAPI。セッションを不正解として確定し
// （報酬なし）、正解の曲名・動画を開示する。日次の挑戦回数（1日3回までの
// 報酬対象カウント）はこのプレイでも1回分消費する（＝答えを見ずに退出しても
// 挑戦したことには変わらないため）。
const { verifyFirebaseIdToken, getAdmin } = require("../_lib/firebaseAdmin");
const { finalizeSession, SESSION_TTL_MS } = require("../_lib/introQuizDaily");

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
  if (!sessionId) {
    res.status(400).json({ error: "bad-request" });
    return;
  }

  let admin;
  try {
    admin = getAdmin();
  } catch (e) {
    console.error("intro-quiz reveal: admin init failed:", e);
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
      if (Date.now() - session.createdAt > SESSION_TTL_MS) {
        const e = new Error("session-expired"); e.statusCode = 410; throw e;
      }

      const fin = await finalizeSession(tx, db, { uid, sessionRef, correct: false });
      return {
        done: true, correct: false, bp: 0, ac: 0, capReached: fin.capReached,
        videoId: session.videoId, title: session.title, artist: session.artist,
      };
    });

    res.status(200).json(Object.assign({ ok: true }, result));
  } catch (e) {
    const statusCode = e.statusCode || 500;
    if (statusCode >= 500) console.error("intro-quiz reveal error:", e);
    res.status(statusCode).json({ error: e.message || "internal-error" });
  }
};
