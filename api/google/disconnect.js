const { verifyFirebaseIdToken, getAdmin } = require("../_lib/firebaseAdmin");

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

  const db = getAdmin().firestore();
  const ref = db.collection("google_tokens").doc(uid);
  const snap = await ref.get();
  const refreshToken = snap.exists ? snap.data().refresh_token : null;
  await ref.delete().catch(() => {});

  if (refreshToken) {
    try {
      // ベストエフォート：Google側の失効APIがエラーでも、Firestore側の
      // 連携解除は既に完了しているのでレスポンス自体は成功として返す
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
        method: "POST",
      });
    } catch (e) {
      console.error("google revoke error:", e);
    }
  }

  res.status(200).json({ ok: true });
};
