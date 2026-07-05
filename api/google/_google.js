const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

// Google Cloud Consoleの「承認済みのリダイレクトURI」に登録した値と完全に
// 一致している必要があるため、原則としてGOOGLE_REDIRECT_URI環境変数を明示
// 設定する運用を推奨する（未設定時はリクエストのホストから推測する）。
function getRedirectUri(req) {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}/api/google/callback`;
}

async function exchangeCodeForTokens(code, redirectUri) {
  const body = new URLSearchParams({
    code,
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error_description || data.error || "token-exchange-failed");
    err.statusCode = 400;
    throw err;
  }
  return data; // { access_token, expires_in, refresh_token?, scope, token_type }
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });
  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    // invalid_grant ＝ refresh_tokenが失効・取り消し済み（再連携が必要）
    const err = new Error(data.error || "refresh-failed");
    err.statusCode = data.error === "invalid_grant" ? 401 : 502;
    throw err;
  }
  return data; // { access_token, expires_in, scope, token_type, refresh_token? }
}

module.exports = { requireEnv, getRedirectUri, exchangeCodeForTokens, refreshAccessToken };
