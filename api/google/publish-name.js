const { verifyFirebaseIdToken, getAdmin } = require("../_lib/firebaseAdmin");
const { refreshAccessToken } = require("./_google");

const NAME_MAX_LEN = 50;

// gcalNames（Google連携メールアドレス→登録名の公開ディレクトリ）は、
// Firestoreルール側に「request.auth.token.email」のような検証手段が
// 無いため、クライアントから直接書き込めてしまうと認証済みユーザーなら
// 誰でも任意のメールアドレスの表示名を上書きできてしまう。
// そのため書き込みはこのAPI経由に限定し、呼び出し元本人が実際にGoogle
// 連携しているメールアドレス（プライマリカレンダーID）をサーバー側で
// 取得してから、そのメールアドレスの文書だけを更新する
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method-not-allowed" });
    return;
  }

  let uid;
  try {
    uid = await verifyFirebaseIdToken(req);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
    return;
  }

  const name = String((req.body && req.body.name) || "").trim().slice(0, NAME_MAX_LEN);
  if (!name) {
    res.status(400).json({ error: "name-required" });
    return;
  }

  const db = getAdmin().firestore();
  const tokenSnap = await db.collection("google_tokens").doc(uid).get();
  if (!tokenSnap.exists || !tokenSnap.data().refresh_token) {
    res.status(404).json({ error: "not-connected" });
    return;
  }

  try {
    const tokens = await refreshAccessToken(tokenSnap.data().refresh_token);
    const calRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=owner", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const calData = await calRes.json();
    if (!calRes.ok) throw new Error("calendar-list-failed");
    const primary = (calData.items || []).find((c) => c.primary);
    if (!primary || !primary.id) {
      res.status(502).json({ error: "no-primary-calendar" });
      return;
    }
    const email = primary.id.trim().toLowerCase();
    await db.collection("gcalNames").doc(email).set(
      { name, updatedAt: new Date().toISOString() },
      { merge: true }
    );
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("google publish-name error:", e);
    res.status(502).json({ error: "publish-failed" });
  }
};
