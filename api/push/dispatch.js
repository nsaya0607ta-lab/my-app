const { getAdmin } = require("../_lib/firebaseAdmin");

// Cloud Scheduler相当のエンドポイント。Vercel Cron（vercel.jsonのcrons）
// または外部スケジューラ（GitHub Actions・cron-job.org等）から一定間隔で
// 叩かれ、次の2種類のプッシュ通知をFirebase Admin SDK経由でFCM送信する。
//   1) 開始5分前リマインダー：notificationJobsのうちscheduledAtを迎えた
//      pendingジョブ（js/pushJobs.jsが予定の登録・変更・削除のたびに
//      同期している）
//   2) 朝7時のデイリーサマリー：pushTokensを持つ全ユーザーのうち、JSTで
//      7:00を過ぎていてまだ今日ぶんを送っていない人（当日の予定は
//      users/{uid}.gcal.store から集計する）
//
// 呼び出しはCRON_SECRET環境変数と一致する
// `Authorization: Bearer <CRON_SECRET>` ヘッダを必須にすることで、
// 秘密鍵等の認証情報を一切フロントエンドへ置かずに保護する。

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const REMINDER_BATCH_LIMIT = 200;

function jstNow(){
  return new Date(Date.now() + JST_OFFSET_MS);
}

function jstDateKey(d){
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// 送信に失敗したトークンのうち「もう使われていない」ことが確定しているもの
// だけをFirestoreから消し、一時的なエラー（ネットワーク不調等）では消さない
const STALE_TOKEN_ERROR_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

async function sendToUser(db, messaging, uid, notification, data){
  if(!uid) return 0;
  const tokensSnap = await db.collection("users").doc(uid).collection("pushTokens").where("enabled", "==", true).get();
  let sent = 0;
  await Promise.all(tokensSnap.docs.map(async (tDoc) => {
    const token = tDoc.data().token;
    if(!token) return;
    try{
      await messaging.send({ token, notification, data });
      sent++;
    }catch(e){
      if(e && STALE_TOKEN_ERROR_CODES.has(e.code)){
        await tDoc.ref.delete().catch(() => {});
      }else{
        console.error("fcm send failed:", uid, (e && e.code) || (e && e.message) || e);
      }
    }
  }));
  return sent;
}

function collectTodayLocalEvents(userData, todayKey){
  const store = userData && userData.gcal && userData.gcal.store;
  if(!store || typeof store.events !== "object") return [];
  const events = [];
  Object.values(store.events).forEach(byDate => {
    const list = (byDate && byDate[todayKey]) || [];
    list.forEach(ev => { if(ev && ev.title) events.push(ev); });
  });
  events.sort((a, b) => (a.start || "99:99").localeCompare(b.start || "99:99"));
  return events;
}

function buildSummaryPayload(events, jstDate){
  const title = `${jstDate.getUTCMonth() + 1}月${jstDate.getUTCDate()}日の予定`;
  if(!events.length) return { title, body: "今日の予定はありません。今日も良い一日を！" };
  const body = `本日は${events.length}件の予定があります。最初は${events[0].start ? `${events[0].start}〜` : ""}「${events[0].title}」です。`;
  return { title, body };
}

async function dispatchReminders(db, messaging, nowIso){
  const dueSnap = await db.collection("notificationJobs")
    .where("status", "==", "pending")
    .where("scheduledAt", "<=", nowIso)
    .limit(REMINDER_BATCH_LIMIT)
    .get();

  let sent = 0;
  for(const jobDoc of dueSnap.docs){
    const job = jobDoc.data();
    const sentCount = await sendToUser(db, messaging, job.userId, {
      title: "⏰ まもなく予定が始まります",
      body: `「${job.title || "予定"}」が5分後に始まります`,
    }, { screen: "calendar", eventId: job.eventId || "" });
    await jobDoc.ref.set({ status: "sent", sentAt: nowIso, sentCount }, { merge: true });
    sent++;
  }
  return sent;
}

async function dispatchDailySummaries(db, messaging, nowIso){
  const jstDate = jstNow();
  if(jstDate.getUTCHours() < 7) return 0;

  const todayKey = jstDateKey(jstDate);
  // pushTokensを持つ全ユーザー（uid）を集める。collectionGroupクエリに
  // フィルタを付けると別途インデックスが必要になるため、フィルタなしで
  // 取得してからJS側でenabled判定する
  const tokenGroups = await db.collectionGroup("pushTokens").get();
  const uids = new Set();
  tokenGroups.forEach(d => {
    if(d.data().enabled === false) return;
    const parent = d.ref.parent.parent;
    if(parent) uids.add(parent.id);
  });

  let sent = 0;
  for(const uid of uids){
    const logRef = db.collection("pushDailySummaryLog").doc(uid);
    const logSnap = await logRef.get();
    if(logSnap.exists && logSnap.data().lastSentDateKey === todayKey) continue;

    const userSnap = await db.collection("users").doc(uid).get();
    const events = collectTodayLocalEvents(userSnap.exists ? userSnap.data() : null, todayKey);
    const { title, body } = buildSummaryPayload(events, jstDate);
    await sendToUser(db, messaging, uid, { title, body }, { screen: "calendar" });
    await logRef.set({ lastSentDateKey: todayKey, sentAt: nowIso }, { merge: true });
    sent++;
  }
  return sent;
}

module.exports = async (req, res) => {
  if(req.method !== "GET" && req.method !== "POST"){
    res.status(405).json({ error: "method-not-allowed" });
    return;
  }

  const expectedSecret = process.env.CRON_SECRET;
  if(!expectedSecret){
    res.status(500).json({ error: "server-misconfigured: CRON_SECRET is not set" });
    return;
  }
  const authHeader = req.headers.authorization || "";
  if(authHeader !== `Bearer ${expectedSecret}`){
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  let admin;
  try{ admin = getAdmin(); }
  catch(e){
    console.error("firebase admin init failed:", e);
    res.status(500).json({ error: "server-misconfigured: " + e.message });
    return;
  }

  const db = admin.firestore();
  const messaging = admin.messaging();
  const nowIso = new Date().toISOString();

  try{
    const reminders = await dispatchReminders(db, messaging, nowIso);
    const summaries = await dispatchDailySummaries(db, messaging, nowIso);
    res.status(200).json({ ok: true, reminders, summaries });
  }catch(e){
    console.error("push dispatch error:", e);
    res.status(500).json({ error: "dispatch-failed" });
  }
};
