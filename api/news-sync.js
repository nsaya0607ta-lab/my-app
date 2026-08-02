const { getAdmin, verifyFirebaseIdToken } = require("./_lib/firebaseAdmin");
const { createPublicKey, verify } = require("node:crypto");
const {
  getNewsSettings,
  updateNewsSettings,
  publicSettings,
  runNewsSync,
} = require("./_lib/newsIngestion");

const GITHUB_ACTIONS_ISSUER = "https://token.actions.githubusercontent.com";
const NEWS_SCHEDULER_AUDIENCE = "my-app-news-scheduler";
const NEWS_SCHEDULER_REPOSITORY = "nsaya0607ta-lab/my-app";
const NEWS_SCHEDULER_WORKFLOW_REF = `${NEWS_SCHEDULER_REPOSITORY}/.github/workflows/news-scheduler.yml@refs/heads/main`;
let githubActionsJwks = { expiresAt: 0, keys: [] };

function decodeJwtPart(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

async function getGithubActionsKey(kid) {
  if (githubActionsJwks.expiresAt <= Date.now()) {
    const response = await fetch(`${GITHUB_ACTIONS_ISSUER}/.well-known/jwks`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`github-jwks-${response.status}`);
    const body = await response.json();
    githubActionsJwks = {
      expiresAt: Date.now() + 60 * 60 * 1000,
      keys: Array.isArray(body.keys) ? body.keys : [],
    };
  }
  const jwk = githubActionsJwks.keys.find((key) => key.kid === kid && key.kty === "RSA");
  if (!jwk) throw new Error("github-jwk-not-found");
  return createPublicKey({ key: jwk, format: "jwk" });
}

async function verifyGithubActionsToken(token) {
  if (token.length > 20000) throw new Error("scheduler-token-too-large");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed-scheduler-token");
  const header = decodeJwtPart(parts[0]);
  const payload = decodeJwtPart(parts[1]);
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new Error("unsupported-scheduler-token");
  }
  const key = await getGithubActionsKey(header.kid);
  const signatureValid = verify(
    "RSA-SHA256",
    Buffer.from(`${parts[0]}.${parts[1]}`),
    key,
    Buffer.from(parts[2], "base64url"),
  );
  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!signatureValid || payload.iss !== GITHUB_ACTIONS_ISSUER ||
      !audiences.includes(NEWS_SCHEDULER_AUDIENCE) ||
      !Number.isFinite(payload.exp) || payload.exp <= now ||
      (Number.isFinite(payload.nbf) && payload.nbf > now + 30)) {
    throw new Error("untrusted-scheduler-token");
  }
  return payload;
}

function allowedAdminEmails() {
  return new Set(String(process.env.NEWS_ADMIN_EMAILS || "for.administ@gmail.com")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
}

async function requireAdmin(req) {
  const uid = await verifyFirebaseIdToken(req);
  const user = await getAdmin().auth().getUser(uid);
  if (!user.email || !allowedAdminEmails().has(user.email.toLowerCase())) {
    const error = new Error("forbidden");
    error.statusCode = 403;
    throw error;
  }
  return uid;
}

async function requireScheduler(req) {
  const match = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  if (!match) {
    const error = new Error("missing-scheduler-token");
    error.statusCode = 401;
    throw error;
  }

  try {
    const payload = await verifyGithubActionsToken(match[1]);
    if (payload.repository !== NEWS_SCHEDULER_REPOSITORY ||
        payload.ref !== "refs/heads/main" ||
        payload.workflow_ref !== NEWS_SCHEDULER_WORKFLOW_REF) {
      throw new Error("unexpected-scheduler-identity");
    }
  } catch (cause) {
    const error = new Error("invalid-scheduler-token");
    error.statusCode = 401;
    error.cause = cause;
    throw error;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "method-not-allowed" });
    return;
  }

  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};

    if (body.action === "scheduled") {
      await requireScheduler(req);
      const db = getAdmin().firestore();
      const result = await runNewsSync(db, { force: false, trigger: "scheduled" });
      res.status(result.ok ? 200 : 502).json(result);
      return;
    }

    await requireAdmin(req);
    const db = getAdmin().firestore();

    if (body.action === "status") {
      const settings = await getNewsSettings(db);
      res.status(200).json({ ok: true, settings: publicSettings(settings) });
      return;
    }

    if (body.action === "settings") {
      const settings = await updateNewsSettings(db, body.settings || {});
      res.status(200).json({ ok: true, settings: publicSettings(settings) });
      return;
    }

    if (body.action === "fetch") {
      const result = await runNewsSync(db, { force: true, trigger: "manual" });
      res.status(result.ok ? 200 : 502).json(result);
      return;
    }

    res.status(400).json({ error: "bad-request" });
  } catch (error) {
    const status = error.statusCode || (String(error.message || "").startsWith("feed-url-") ? 400 : 500);
    if (status >= 500) console.error("news-sync error:", error);
    res.status(status).json({ error: error.message || "internal-error" });
  }
};
