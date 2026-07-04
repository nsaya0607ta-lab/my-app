const { verifyFirebaseIdToken, getAdmin } = require("../_lib/firebaseAdmin");
const { refreshAccessToken } = require("./_google");

// フロントエンドはAPI呼び出し直前・定期タイマー・起動時の自動復元の
// いずれからも、このエンドポイントにFirebaseのIDトークンを渡すだけで
// 新しいGoogleアクセストークンを受け取れる。refresh_tokenそのものは
// レスポンスに一切含めない。
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

  const db = getAdmin().firestore();
  const ref = db.collection("google_tokens").doc(uid);
  const snap = await ref.get();
  if (!snap.exists || !snap.data().refresh_token) {
    res.status(404).json({ error: "not-connected" });
    return;
  }

  try {
    const tokens = await refreshAccessToken(snap.data().refresh_token);
    const update = { updatedAt: Date.now() };
    if (tokens.refresh_token) update.refresh_token = tokens.refresh_token;
    await ref.set(update, { merge: true });
    res.status(200).json({ access_token: tokens.access_token, expires_in: tokens.expires_in });
  } catch (e) {
    if (e.statusCode === 401) {
      // refresh_token自体が失効・取り消し済み → 保存データを破棄して
      // フロントエンドに再連携（「連携」ボタン）を促す
      await ref.delete().catch(() => {});
      res.status(401).json({ error: "reauth-required" });
      return;
    }
    console.error("google token refresh error:", e);
    res.status(502).json({ error: "refresh-failed" });
  }
};
