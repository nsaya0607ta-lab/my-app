// 「イントロドンに挑戦」ボタンを押した直後に呼ばれるAPI。
// ・出題する曲をサーバー側でランダムに1曲選び、
// ・正解1つ＋ダミー2つをシャッフルした「選択肢（曲名のみ）」と、
// ・再生用のvideoId
// だけをフロントへ返す。どれが正解かはレスポンスに一切含めない
// （正誤判定は必ず /api/intro-quiz/answer 側、サーバー内で行う）。
//
// 出題内容はFirestoreの introQuizSessions コレクションに保存し、
// answer.js 側でそのセッションIDを頼りに正誤判定する。
const { verifyFirebaseIdToken, getAdmin } = require("../_lib/firebaseAdmin");
const { INTRO_QUIZ_SONGS } = require("../_lib/introQuizSongs");

// 3択にするには正解1曲＋ダミー2曲の最低3曲が必要。それ未満なら
// 「出題できる曲のリストが空」に準じて扱い、イベントを発生させない。
const MIN_SONGS_REQUIRED = 3;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 正解の曲＋ランダムに選んだ2曲のダミーをシャッフルし、
// { key(0/1/2をシャッフルした位置), title, _songId } の配列を返す
function buildChoices(songs, correctSong) {
  const distractors = shuffle(songs.filter((s) => s.id !== correctSong.id)).slice(0, 2);
  const shuffled = shuffle([correctSong, ...distractors]);
  return shuffled.map((s, i) => ({ key: String(i), title: s.title, _songId: s.id }));
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

  if (!Array.isArray(INTRO_QUIZ_SONGS) || INTRO_QUIZ_SONGS.length < MIN_SONGS_REQUIRED) {
    // 出題できる曲が無い（または3択を作れない）→ イベント自体を発生させない
    res.status(200).json({ ok: true, available: false });
    return;
  }

  let admin;
  try {
    admin = getAdmin();
  } catch (e) {
    console.error("intro-quiz start: admin init failed:", e);
    res.status(500).json({ error: "server-misconfigured" });
    return;
  }

  const correctSong = INTRO_QUIZ_SONGS[Math.floor(Math.random() * INTRO_QUIZ_SONGS.length)];
  const choices = buildChoices(INTRO_QUIZ_SONGS, correctSong);
  const correctChoice = choices.find((c) => c._songId === correctSong.id);
  const sessionId = "iq" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  try {
    const db = admin.firestore();
    await db.collection("introQuizSessions").doc(sessionId).set({
      uid,
      videoId: correctSong.videoId,
      title: correctSong.title,
      correctKey: correctChoice.key,
      used: false,
      createdAt: Date.now(),
    });
  } catch (e) {
    console.error("intro-quiz start: failed to create session:", e);
    res.status(500).json({ error: "internal-error" });
    return;
  }

  res.status(200).json({
    ok: true,
    available: true,
    sessionId,
    videoId: correctSong.videoId,
    // 曲名だけのシャッフル済み選択肢。正解フラグは含めない
    choices: choices.map((c) => ({ key: c.key, title: c.title })),
  });
};
