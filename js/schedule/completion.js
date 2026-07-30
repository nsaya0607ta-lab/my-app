/* =========================================================================
   ✅ 予定の「完了」記録

   予定（Schedule）本体には完了の概念がなく、Googleカレンダーにも
   対応するフィールドが無いため、完了状態は Schedule テーブルとは
   別のテーブルとして持つ。こうすることで
   ・Googleカレンダーとの双方向同期（js/schedule/gsync.js）の対象外に
     なるので、既存の同期処理・競合判定に一切影響しない
   ・繰り返し予定は「その日の回」ごとに完了を記録できる
   の両方を満たせる。

   キーは "スケジュールID@YYYY-MM-DD"（＝occurrenceのkeyと同じ形式）。
   保存はログイン中のユーザーIDごとに分け、users/{uid}.scheduleDone へも
   マージ同期して機種をまたいで引き継ぐ。
   ========================================================================= */
import { state } from '../state.js';
import { nowISO } from './util.js';

const STORE_KEY = "sched_done_v1";
// 記録が無限に伸びないよう、保持する件数の上限
const MAX_ENTRIES = 600;

function storageKey(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `${STORE_KEY}::${uid}`;
}

function read(){
  try{
    const raw = JSON.parse(localStorage.getItem(storageKey()) || "null");
    return (raw && typeof raw === "object") ? raw : {};
  }catch(e){ return {}; }
}

function write(map){
  const keys = Object.keys(map);
  if(keys.length > MAX_ENTRIES){
    // 古い（日付キーが小さい）ものから捨てる
    keys.sort((a, b) => String(a.split("@")[1] || "").localeCompare(String(b.split("@")[1] || "")));
    keys.slice(0, keys.length - MAX_ENTRIES).forEach(k => { delete map[k]; });
  }
  try{ localStorage.setItem(storageKey(), JSON.stringify(map)); }catch(e){}
  pushToCloud(map);
}

let pushTimer = null;
function pushToCloud(map){
  if(!state.db || !state.currentUserId || !window.FirebaseSync) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    try{
      window.FirebaseSync.setDoc(
        window.FirebaseSync.doc(state.db, "users", state.currentUserId),
        { scheduleDone: map, updatedAt: nowISO() },
        { merge: true },
      );
    }catch(e){ console.error("schedule completion sync failed:", e); }
  }, 1500);
}

// db.js の onSnapshot から呼ばれる。完了は「一度完了したら完了」なので、
// 和集合をとるだけで衝突しない
export function applyCloudScheduleDone(payload){
  if(!payload || typeof payload !== "object") return false;
  const mine = read();
  let changed = false;
  Object.keys(payload).forEach(k => {
    if(payload[k] && !mine[k]){ mine[k] = payload[k]; changed = true; }
  });
  if(changed){
    try{ localStorage.setItem(storageKey(), JSON.stringify(mine)); }catch(e){}
  }
  return changed;
}

export function occKey(scheduleId, dateKey){ return `${scheduleId}@${dateKey}`; }

export function isScheduleDone(scheduleId, dateKey){
  return !!read()[occKey(scheduleId, dateKey)];
}

// 完了状態を設定する。戻り値は「今回の操作で新たに完了になったか」
// （＝BPを付与してよいか。既に完了済みだった場合はfalse）
export function setScheduleDone(scheduleId, dateKey, done){
  const map = read();
  const k = occKey(scheduleId, dateKey);
  const was = !!map[k];
  if(done){
    if(was) return false;
    map[k] = nowISO();
  } else {
    if(!was) return false;
    delete map[k];
  }
  write(map);
  return done;
}

// 指定期間（両端を含む）に完了した予定の件数
export function doneCountBetween(fromKey, toKey){
  const map = read();
  return Object.keys(map).filter(k => {
    const dk = k.split("@")[1] || "";
    return dk >= fromKey && dk <= toKey;
  }).length;
}
