// 「イントロドンに挑戦」ボタン（モード選択後）を押した直後に呼ばれるAPI。
// ・出題モード（mode: "random" | "artist"）に応じて、サーバー側で出題曲を1曲選び、
// ・再生用のvideoId・sessionId だけをフロントへ返す。
// 解答が3択からテキスト入力に変わったため、ダミーの選択肢を組み立てる処理は
// 廃止した（正解曲の情報も一切レスポンスに含めない）。
//
// 出題内容と、判定に使う曲名・カナ・ローマ字・英語表記のスナップショットは
// Firestoreの introQuizSessions コレクションに保存し、answer.js/confirm.js/
// reveal.js 側でそのセッションIDを頼りに正誤判定する。
const { verifyFirebaseIdToken, getAdmin } = require("../_lib/firebaseAdmin");
const { pickSong } = require("../_lib/introQuizSongsRepo");

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
  const mode = body.mode === "artist" ? "artist" : "random";
  const artist = mode === "artist" && typeof body.artist === "string" ? body.artist.trim().slice(0, 80) : "";
  if (mode === "artist" && !artist) {
    res.status(400).json({ error: "bad-request" });
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
  const db = admin.firestore();

  let song;
  try {
    song = await pickSong(db, { mode, artist });
  } catch (e) {
    console.error("intro-quiz start: failed to pick song:", e);
    res.status(500).json({ error: "internal-error" });
    return;
  }

  if (!song) {
    // 出題できる曲が無い（アーティスト指定で0曲だった場合を含む）→ イベント自体を発生させない
    res.status(200).json({ ok: true, available: false });
    return;
  }

  const sessionId = "iq" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const match = {};
  for (const f of MATCH_FIELDS) match[f] = song[f] || "";

  try {
    await db.collection("introQuizSessions").doc(sessionId).set({
      uid,
      videoId: song.videoId,
      title: song.title,
      artist: song.artist || "",
      match,
      mode,
      artistFilter: artist,
      used: false,
      attempts: 0,
      pendingSuggestion: null,
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
    videoId: song.videoId,
  });
};
