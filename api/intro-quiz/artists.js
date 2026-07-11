// イントロドンのモード選択画面（「歌手を選ぶ」モード）で使う、出題可能な
// アーティスト一覧を返すAPI。曲数（count）も一緒に返し、フロント側で
// 「◯曲」のように表示できるようにする。
const { verifyFirebaseIdToken, getAdmin } = require("../_lib/firebaseAdmin");
const { getArtists } = require("../_lib/introQuizSongsRepo");

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "method-not-allowed" });
    return;
  }

  try {
    await verifyFirebaseIdToken(req);
  } catch (e) {
    res.status(e.statusCode || 401).json({ error: e.message });
    return;
  }

  let admin;
  try {
    admin = getAdmin();
  } catch (e) {
    console.error("intro-quiz artists: admin init failed:", e);
    res.status(500).json({ error: "server-misconfigured" });
    return;
  }

  let artists = [];
  try {
    artists = await getArtists(admin.firestore());
  } catch (e) {
    console.error("intro-quiz artists: fetch failed:", e);
  }

  res.status(200).json({ ok: true, artists });
};
