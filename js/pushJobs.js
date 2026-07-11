/* =========================================================================
   通知ジョブ（notificationJobs コレクション）の同期。

   ローカル（デモ）カレンダーの予定は js/render.js の saveGcalStore() が
   唯一の書き込み口（登録・変更・削除のすべてがここを通る）なので、そこから
   呼び出す1本の同期関数として実装する。呼ばれるたびに「今のstoreに存在する
   開始時刻ありの予定」から本来あるべきジョブ集合を組み立て、Firestoreの
   既存ジョブ（このユーザー・ローカルカレンダー分）と突き合わせて
   追加・更新・削除する。

   サーバー側（api/push/dispatch.js）はCloud Scheduler相当（Vercel Cron／
   外部スケジューラ）から一定間隔で呼ばれ、scheduledAtを過ぎたpendingジョブ
   をFirebase Admin SDK経由でFCM送信し、statusをsentへ更新する。
   ========================================================================= */
import { collection, doc, getDocs, query, where, writeBatch } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
import { state } from './state.js';

const JOBS_COLLECTION = "notificationJobs";

// y/m/d + "HH:MM"（日本時間の壁時計表記）をUTCのISO文字列へ変換する。
// このアプリはJSTのみを想定しているため、固定オフセット(+9h)で計算する
function jstWallTimeToUtcIso(y, m, d, hh, mm){
  return new Date(Date.UTC(y, m, d, hh - 9, mm, 0, 0)).toISOString();
}

function localJobId(calId, eventId){
  return `local_${calId}_${eventId}`;
}

// 現在のローカルカレンダーstoreから「開始5分前リマインダーを送るべき
// 未来の予定」一覧を抜き出す（過去・時刻未指定の予定は対象外）
function collectWantedJobs(store, uid){
  const wanted = new Map();
  const nowMs = Date.now();
  Object.keys(store.events || {}).forEach(calId => {
    const byDate = store.events[calId] || {};
    Object.keys(byDate).forEach(dateKey => {
      const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
      if(!dm) return;
      (byDate[dateKey] || []).forEach(ev => {
        if(!ev || !ev.id || !ev.start) return;
        const tm = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(ev.start);
        if(!tm) return;
        const y = Number(dm[1]), m = Number(dm[2]) - 1, d = Number(dm[3]);
        const scheduledAt = jstWallTimeToUtcIso(y, m, d, Number(tm[1]), Number(tm[2]) - 5);
        if(new Date(scheduledAt).getTime() <= nowMs) return; // 5分前の時刻を既に過ぎた予定は新規作成しない
        wanted.set(localJobId(calId, ev.id), {
          userId: uid,
          source: "local",
          calId,
          eventId: ev.id,
          dateKey,
          title: (ev.title || "予定").slice(0, 200),
          scheduledAt,
          status: "pending",
          type: "event_reminder",
        });
      });
    });
  });
  return wanted;
}

let syncBusy = false;
let syncQueued = null;

// ローカルカレンダーのstoreが保存されるたびに呼ぶ。連続呼び出しに備えて
// 簡易的な直列化（実行中なら最新のstoreだけ覚えておいて後で1回だけ流す）を行う
export function syncLocalNotificationJobs(store){
  if(!state.db || !state.currentUserId || state.guestMode) return;
  if(syncBusy){ syncQueued = store; return; }
  syncBusy = true;
  runSync(store).finally(() => {
    syncBusy = false;
    if(syncQueued){
      const next = syncQueued;
      syncQueued = null;
      syncLocalNotificationJobs(next);
    }
  });
}

async function runSync(store){
  const uid = state.currentUserId;
  try{
    const wanted = collectWantedJobs(store, uid);
    const existingSnap = await getDocs(query(
      collection(state.db, JOBS_COLLECTION),
      where("userId", "==", uid),
      where("source", "==", "local")
    ));

    const batch = writeBatch(state.db);
    let dirty = false;
    const nowIso = new Date().toISOString();

    existingSnap.forEach(d => {
      // 予定が削除された、または時刻変更で「5分前」を過ぎた等の理由で
      // もう対象でなくなったジョブのうち、未送信ぶんだけを取り消す
      // （送信済みジョブは履歴としてそのまま残す＝二重送信防止に必要ない）
      if(!wanted.has(d.id) && d.data().status === "pending"){
        batch.delete(d.ref);
        dirty = true;
      }
    });

    const existingById = new Map(existingSnap.docs.map(d => [d.id, d.data()]));
    wanted.forEach((data, id) => {
      const prev = existingById.get(id);
      if(!prev){
        batch.set(doc(state.db, JOBS_COLLECTION, id), Object.assign({ createdAt: nowIso, updatedAt: nowIso }, data));
        dirty = true;
      } else if(prev.scheduledAt !== data.scheduledAt || prev.title !== data.title){
        // 予定が変更された（時刻・タイトル）→ ジョブを更新し、まだ送信して
        // いなければ改めてpendingへ戻す
        batch.set(doc(state.db, JOBS_COLLECTION, id), Object.assign({ updatedAt: nowIso }, data), { merge: true });
        dirty = true;
      }
    });

    if(dirty) await batch.commit();
  }catch(e){ console.error("notification jobs sync failed:", e); }
}
