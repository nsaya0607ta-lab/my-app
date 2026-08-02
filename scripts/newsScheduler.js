const { getAdmin } = require("../api/_lib/firebaseAdmin");
const { runNewsSync } = require("../api/_lib/newsIngestion");

async function main() {
  const result = await runNewsSync(getAdmin().firestore(), { force: false, trigger: "scheduled" });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error("news scheduler failed:", error && error.message || error);
  process.exitCode = 1;
});
