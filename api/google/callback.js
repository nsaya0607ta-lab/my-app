// Google OAuthの認可コードフローのリダイレクト先（Vercel Serverless Function）。
// ブラウザのポップアップがGoogleの同意画面からここに戻ってくる。認可コードを
// client_secret（このサーバー環境変数にのみ保持し、フロントエンドJSには一切
// 渡さない）でアクセストークン・リフレッシュトークンに交換し、window.opener
// へpostMessageで結果を渡してポップアップを閉じる。
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_CLIENT_ID = "989248012630-eouubhdevjm057iub24r8lojnjn1lres.apps.googleusercontent.com";

module.exports = async function handler(req, res) {
  const { code, state, error } = req.query;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const origin = `https://${host}`;
  const redirectUri = `${origin}/api/google/callback`;

  if (error) {
    sendResult(res, origin, { type: "gcal-oauth-result", error: String(error), state });
    return;
  }
  if (!code) {
    sendResult(res, origin, { type: "gcal-oauth-result", error: "missing_code", state });
    return;
  }

  try {
    const params = new URLSearchParams({
      code: String(code),
      client_id: GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });
    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      sendResult(res, origin, { type: "gcal-oauth-result", error: tokenData.error || "token_exchange_failed", state });
      return;
    }
    sendResult(res, origin, {
      type: "gcal-oauth-result",
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      state,
    });
  } catch (e) {
    sendResult(res, origin, { type: "gcal-oauth-result", error: "server_error", state });
  }
};

function sendResult(res, targetOrigin, data) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<script>
(function(){
  var data = ${JSON.stringify(data)};
  var targetOrigin = ${JSON.stringify(targetOrigin)};
  if (window.opener) { window.opener.postMessage(data, targetOrigin); }
  window.close();
})();
</script>
</body></html>`);
}
