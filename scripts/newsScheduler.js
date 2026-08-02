const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAdmin } = require("../api/_lib/firebaseAdmin");
const { runNewsSync } = require("../api/_lib/newsIngestion");

function getSchedulerFirestore() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) return getAdmin().firestore();

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }

  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is missing required credentials");
  }

  const app = getApps()[0] || initializeApp({
    credential: cert({
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: String(serviceAccount.private_key).replace(/\\n/g, "\n"),
    }),
  });

  return getFirestore(app);
}

async function main() {
  const result = await runNewsSync(getSchedulerFirestore(), { force: false, trigger: "scheduled" });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error("news scheduler failed:", error && error.message || error);
  process.exitCode = 1;
});
