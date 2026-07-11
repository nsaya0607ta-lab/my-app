// ユーザーが3択の回答を送信したときに呼ばれるAPI。
// ここで初めて「正誤判定」「本日の挑戦回数のインクリメント」「回数に応じた
// BP/ACの加算」を行う。videoId・正解の選択肢・回数カウントはすべて
// サーバー側（Firestore）だけで管理し、フロントから送られてくるのは
// sessionId と choiceKey（選んだ選択肢のkey）だけ。
//
// 二重加算・連打対策として、1セッション（1回のstart呼び出し）につき
// 回答は1回しか受け付けない（Firestoreトランザクションでsession.usedを
// 確認・更新する）。日次の挑戦回数もトランザクション内でアトミックに
// インクリメントする。
const { verifyFirebaseIdToken, getAdmin } = require("../_lib/firebaseAdmin");
const { FieldValue } = require("firebase-admin/firestore");

// セッションの有効期限。開始から長時間放置された回答（＝別タブで使い回す
// 等）を無効化するための保険で、通常のプレイでは問題にならない長さにする
const SESSION_TTL_MS = 10 * 60 * 1000;

// 日本時間基準の日付キー（YYYY-MM-DD）。UTC基準のままだと日本時間の
// 深夜0時〜9時台に「日付が前日のまま」ズレてしまうため、明示的にJSTへ変換する
function jstDateKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

// その日の何回目の挑戦かに応じた報酬（正解時のみ加算される）
//   1回目: 50BP + 10AC / 2〜3回目: 50BPのみ / 4回目以降: 0BP・0AC
function rewardForAttempt(attemptNumber) {
  if (attemptNumber === 1) return { bp: 50, ac: 10 };
  if (attemptNumber === 2 || attemptNumber === 3) return { bp: 50, ac: 0 };
  return { bp: 0, ac: 0 };
}

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
  const choiceKey = typeof body.choiceKey === "string" ? body.choiceKey.slice(0, 8) : "";
  if (!sessionId || !choiceKey) {
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
  const dateKey = jstDateKey(new Date());
  const dailyRef = db.collection("introQuizDaily").doc(`${uid}_${dateKey}`);
  const userRef = db.collection("users").doc(uid);

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

      const dailySnap = await tx.get(dailyRef);
      const attemptNumber = (dailySnap.exists ? (dailySnap.data().count || 0) : 0) + 1;
      const correct = choiceKey === session.correctKey;
      const reward = correct ? rewardForAttempt(attemptNumber) : { bp: 0, ac: 0 };

      tx.set(sessionRef, { used: true, answeredAt: Date.now() }, { merge: true });
      tx.set(dailyRef, { uid, dateKey, count: attemptNumber, updatedAt: Date.now() }, { merge: true });
      if (reward.bp > 0 || reward.ac > 0) {
        tx.set(userRef, {
          coins: FieldValue.increment(reward.ac),
          introQuizBp: FieldValue.increment(reward.bp),
        }, { merge: true });
      }

      return {
        correct,
        attemptNumber,
        reward,
        videoId: session.videoId,
        title: session.title,
        artist: session.artist || "",
        correctKey: session.correctKey,
      };
    });

    res.status(200).json({
      ok: true,
      correct: result.correct,
      attemptNumber: result.attemptNumber,
      bp: result.reward.bp,
      ac: result.reward.ac,
      capReached: result.attemptNumber >= 4,
      // 正誤に関わらず、答え合わせとしてここで初めて動画情報を開示する
      videoId: result.videoId,
      title: result.title,
      artist: result.artist,
      correctKey: result.correctKey,
    });
  } catch (e) {
    const statusCode = e.statusCode || 500;
    if (statusCode >= 500) console.error("intro-quiz answer error:", e);
    res.status(statusCode).json({ error: e.message || "internal-error" });
  }
};
