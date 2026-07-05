const { getAdmin } = require("../_lib/firebaseAdmin");
const { getRedirectUri, exchangeCodeForTokens } = require("./_google");

// stateの使い捨てトークンがこの時間より古ければ、なりすまし・再利用を
// 疑って拒否する（通常は同意画面での操作直後に消費されるため十分な余裕）
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

module.exports = async (req, res) => {
  const { code, state, error } = req.query || {};
  const appBaseUrl = process.env.APP_BASE_URL || "/";

  function redirectWithStatus(status) {
    const sep = appBaseUrl.includes("?") ? "&" : "?";
    res.writeHead(302, { Location: `${appBaseUrl}${sep}gcal=${status}` });
    res.end();
  }

  if (error || !code || !state) {
    redirectWithStatus("error");
    return;
  }

  try {
    const db = getAdmin().firestore();
    const stateRef = db.collection("oauth_states").doc(String(state));
    const stateSnap = await stateRef.get();
    await stateRef.delete().catch(() => {});

    if (!stateSnap.exists) {
      redirectWithStatus("error");
      return;
    }
    const { uid, createdAt } = stateSnap.data();
    if (!uid || Date.now() - createdAt > STATE_MAX_AGE_MS) {
      redirectWithStatus("error");
      return;
    }

    const tokens = await exchangeCodeForTokens(String(code), getRedirectUri(req));
    if (!tokens.refresh_token) {
      // prompt=consentを付けているため通常は毎回発行されるはずだが、
      // 万一発行されなかった場合は保存すべきものが無いのでやり直しを促す
      redirectWithStatus("error");
      return;
    }

    await db.collection("google_tokens").doc(uid).set({
      refresh_token: tokens.refresh_token,
      scope: tokens.scope || "",
      updatedAt: Date.now(),
    }, { merge: true });

    redirectWithStatus("connected");
  } catch (e) {
    console.error("google callback error:", e);
    redirectWithStatus("error");
  }
};
