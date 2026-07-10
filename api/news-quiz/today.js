// GET /api/news-quiz/today
// ホーム画面を開いた瞬間にクライアントが呼ぶ。20:00〜23:59のJST時間帯か、
// 今日すでに挑戦/スキップ済みでないか、当日のニュースが存在するかをここで
// 判定し、条件を満たす場合のみクイズ本文（正解を除く）を返す。
const { verifyFirebaseIdToken, getAdmin } = require("../_lib/firebaseAdmin");
const { jstNow, jstDateKey, isWithinQuizWindow, getOrCreateDailyQuiz } = require("../_lib/newsQuiz");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
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

  const now = jstNow();
  const dateKey = jstDateKey(now);

  if (!isWithinQuizWindow(now)) {
    res.status(200).json({ eligible: false, reason: "out-of-window" });
    return;
  }

  let db;
  try {
    db = getAdmin().firestore();
  } catch (e) {
    console.error("news-quiz today: admin init failed:", e);
    res.status(200).json({ eligible: false, reason: "unavailable" });
    return;
  }

  try {
    // 1日1回の判定：今日すでに挑戦（正解/不正解）またはスキップ済みなら、
    // 理由に関わらずポップアップを二度と出さない
    const attemptSnap = await db.collection("users").doc(uid).collection("newsQuizAttempts").doc(dateKey).get();
    if (attemptSnap.exists) {
      res.status(200).json({ eligible: false, reason: "already-done", attempt: attemptSnap.data() });
      return;
    }

    // ★重要な例外処理：当日ニュースが1件も無ければ、時間帯条件を満たしていても
    // クイズイベント自体を発生させない（getOrCreateDailyQuizがnullを返す）
    const quiz = await getOrCreateDailyQuiz(db, dateKey);
    if (!quiz) {
      res.status(200).json({ eligible: false, reason: "no-news" });
      return;
    }

    // correctIndex・explanationは正解発表（answer後）まで絶対にクライアントへ渡さない
    res.status(200).json({
      eligible: true,
      quiz: { dateKey, question: quiz.question, choices: quiz.choices },
    });
  } catch (e) {
    console.error("news-quiz today error:", e);
    // クイズ生成/取得の失敗はユーザー影響を最小限にし、ポップアップを
    // 出さないだけに留めて通常のホーム画面を表示させる
    res.status(200).json({ eligible: false, reason: "unavailable" });
  }
};
