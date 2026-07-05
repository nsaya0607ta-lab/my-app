const crypto = require("crypto");
const { verifyFirebaseIdToken, getAdmin } = require("../_lib/firebaseAdmin");
const { getRedirectUri } = require("./_google");

// 付与するスコープはカレンダー一覧の閲覧とイベントの読み書きのみ
// （フロントエンドのgcalGoogleApiFetchが実際に呼び出す範囲と一致させる）
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
].join(" ");

// oauth_states コレクションは「Googleの同意画面へ送り出したstate値」を
// 一時的に覚えておくためだけの用途で、Firestoreセキュリティルール側では
// クライアントからの読み書きを一切禁止する（Admin SDK経由のみアクセス
// 可能）。コールバック側で読み取り次第すぐ削除するため長期間残らない。
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

  try {
    const state = crypto.randomBytes(24).toString("hex");
    const db = getAdmin().firestore();
    await db.collection("oauth_states").doc(state).set({
      uid,
      createdAt: Date.now(),
    });

    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: getRedirectUri(req),
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      // 毎回必ず同意画面を出し、そのたびに新しいrefresh_tokenを発行させる
      // （こうしないと2回目以降はrefresh_tokenが返らないことがある）
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    res.status(200).json({ authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  } catch (e) {
    console.error("google authorize error:", e);
    res.status(500).json({ error: "authorize-failed" });
  }
};
