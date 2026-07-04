// 保存済みのrefresh_tokenからアクセストークンを再発行するVercel Serverless
// Function。client_secretをサーバー側にのみ保持することで、フロントエンド
// JSにはclient_secretを一切露出させずにトークンの自動更新を行う。
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_CLIENT_ID = "989248012630-eouubhdevjm057iub24r8lojnjn1lres.apps.googleusercontent.com";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const refreshToken = req.body && req.body.refresh_token;
  if (!refreshToken) {
    res.status(400).json({ error: "missing_refresh_token" });
    return;
  }

  try {
    const params = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      grant_type: "refresh_token",
    });
    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      res.status(401).json({ error: tokenData.error || "refresh_failed" });
      return;
    }
    res.status(200).json({ access_token: tokenData.access_token, expires_in: tokenData.expires_in });
  } catch (e) {
    res.status(500).json({ error: "server_error" });
  }
};
