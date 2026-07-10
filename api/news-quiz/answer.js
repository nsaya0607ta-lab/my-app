// POST /api/news-quiz/answer  body: { action: "answer", choiceIndex } | { action: "skip" }
// 正解判定・AC加算・「1日1回」の消費は、すべてここ（サーバー側）だけで行う。
// クライアントの改ざん（choiceIndexの偽装や連打）を防ぐため、判定は必ず
// Firestoreトランザクション内で行い、users/{uid}/newsQuizAttempts/{dateKey}
// の存在チェックと書き込みを不可分に実行する（二重回答・二重付与を防止）。
const { FieldValue } = require("firebase-admin/firestore");
const { verifyFirebaseIdToken, getAdmin } = require("../_lib/firebaseAdmin");
const { jstNow, jstDateKey, isWithinQuizWindow } = require("../_lib/newsQuiz");

const CORRECT_REWARD_AC = 10;

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

  // クライアントの時計は信用せず、サーバー側のJST現在時刻で改めて時間帯を検証する
  const now = jstNow();
  const dateKey = jstDateKey(now);
  if (!isWithinQuizWindow(now)) {
    res.status(403).json({ error: "out-of-window" });
    return;
  }

  const body = req.body || {};
  const action = body.action === "skip" ? "skip" : "answer";
  const choiceIndex = Number.isInteger(body.choiceIndex) ? body.choiceIndex : null;
  if (action === "answer" && (choiceIndex === null || choiceIndex < 0 || choiceIndex > 2)) {
    res.status(400).json({ error: "invalid-choice" });
    return;
  }

  let db;
  try {
    db = getAdmin().firestore();
  } catch (e) {
    console.error("news-quiz answer: admin init failed:", e);
    res.status(500).json({ error: "server-misconfigured" });
    return;
  }

  const userRef = db.collection("users").doc(uid);
  const attemptRef = userRef.collection("newsQuizAttempts").doc(dateKey);
  const quizRef = db.collection("dailyQuiz").doc(dateKey);

  try {
    const result = await db.runTransaction(async (tx) => {
      // 同じdateKeyのattemptドキュメントが既に存在する＝挑戦権はもう消費済み。
      // ここで弾かないと、connectionを複数張って同時送信するような不正で
      // ACを何度も稼がれてしまう。
      const attemptSnap = await tx.get(attemptRef);
      if (attemptSnap.exists) {
        const err = new Error("already-answered");
        err.statusCode = 409;
        throw err;
      }

      if (action === "skip") {
        tx.set(attemptRef, {
          status: "skipped",
          choiceIndex: null,
          coinGain: 0,
          answeredAt: new Date().toISOString(),
        });
        return { status: "skipped", coinGain: 0 };
      }

      const quizSnap = await tx.get(quizRef);
      if (!quizSnap.exists) {
        const err = new Error("quiz-not-found");
        err.statusCode = 404;
        throw err;
      }
      const quiz = quizSnap.data();
      const correct = choiceIndex === quiz.correctIndex;
      const coinGain = correct ? CORRECT_REWARD_AC : 0;

      tx.set(attemptRef, {
        status: correct ? "correct" : "wrong",
        choiceIndex,
        coinGain,
        answeredAt: new Date().toISOString(),
      });
      // 正誤判定・AC加算は同一トランザクション内で不可分に行う
      if (coinGain > 0) {
        tx.set(userRef, { coins: FieldValue.increment(coinGain) }, { merge: true });
      }
      return {
        status: correct ? "correct" : "wrong",
        correct,
        coinGain,
        correctIndex: quiz.correctIndex,
        explanation: quiz.explanation,
      };
    });

    // 加算後の最新残高をクライアントへ返す（クライアント側で再計算させない）
    let newBalance = null;
    if (result.coinGain) {
      const userSnap = await userRef.get();
      newBalance = userSnap.exists && typeof userSnap.data().coins === "number" ? userSnap.data().coins : null;
    }

    res.status(200).json(Object.assign({}, result, { newBalance }));
  } catch (e) {
    console.error("news-quiz answer error:", e);
    res.status(e.statusCode || 500).json({ error: e.message || "internal-error" });
  }
};
