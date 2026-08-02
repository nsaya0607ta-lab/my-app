const { getAdmin, verifyFirebaseIdToken } = require("./_lib/firebaseAdmin");
const {
  getNewsSettings,
  updateNewsSettings,
  publicSettings,
  runNewsSync,
} = require("./_lib/newsIngestion");

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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "method-not-allowed" });
    return;
  }

  try {
    await requireAdmin(req);
    const body = req.body && typeof req.body === "object" ? req.body : {};
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
