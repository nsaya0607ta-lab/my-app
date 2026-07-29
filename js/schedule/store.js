/* =========================================================================
   予定（Schedule）とタスク（Task）のデータ層。

   設計方針
   ・「予定」と「タスク」は仕様どおり完全に別テーブル（別のlocalStorageキー）
     で管理する。予定＝時間管理（開始／終了時刻・Google同期・カレンダー表示）、
     タスク＝やること管理（時間なし・チェックリスト）。
   ・週間ルーティン（毎週繰り返すタスク）は、独立したテーブルではなく
     「recurrenceRule が毎週指定の Schedule」＋ routine:true フラグとして表す。
     こうすることで繰り返し展開・Google同期・通知・一時的な変更（override）の
     仕組みを通常の予定とそのまま共有できる。
   ・すべてlocalStorageを一次ストレージとし（＝オフラインでも常に閲覧・編集
     できる）、Firestoreとgoogleカレンダーへは非同期に反映する。
   ・削除は即時消去せず deleted:true の墓標（tombstone）として一定期間残す。
     Google／他端末との差分同期で「消したはずの予定が復活する」のを防ぐため。
   ========================================================================= */
import { state } from '../state.js';
import { addDaysKey, dateKeyOf, datePartOf, debounce, genId, nowISO, parseLocalISO, timePartOf, todayKey } from './util.js';

const SCHEDULES_KEY = "sched_schedules_v1";
const TASKS_KEY     = "sched_tasks_v1";
const SETTINGS_KEY  = "sched_settings_v1";
const SYNCSTATE_KEY = "sched_syncstate_v1";
const MIGRATED_KEY  = "sched_migrated_v1";

// 墓標を保持する日数。これを過ぎたものは読み込み時に自動で消える
const TOMBSTONE_TTL_DAYS = 45;

// syncStatus の意味
//  "local"   … アプリ内だけの予定（Google同期OFF、または同期対象外）
//  "pending" … ローカルで作成・変更済みで、Googleへの反映待ち
//  "synced"  … Googleと一致している
//  "conflict"… Google側とアプリ側の両方が変更され、ユーザーの選択待ち
//  "error"   … 反映を試みたが失敗した（次回の同期で再試行する）
export const SYNC_STATUS_LABEL = {
  local: "アプリのみ",
  pending: "同期待ち",
  synced: "Google同期済み",
  conflict: "競合あり",
  error: "同期エラー",
};

function storageKey(base){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `${base}::${uid}`;
}

function readJSON(base, fallback){
  try{
    const raw = localStorage.getItem(storageKey(base));
    if(!raw) return fallback;
    const data = JSON.parse(raw);
    return data == null ? fallback : data;
  }catch(e){ return fallback; }
}

function writeJSON(base, value){
  try{ localStorage.setItem(storageKey(base), JSON.stringify(value)); }catch(e){}
}

/* ================= 変更通知 =================
   ストアが書き換わったら、表示中の画面（ホーム／カレンダー）へ再描画を促す。
   購読側（js/schedule/index.js）が1つだけ登録する想定の軽量な仕組み */
const listeners = new Set();
export function onStoreChange(fn){ listeners.add(fn); return () => listeners.delete(fn); }
function emitChange(reason){ listeners.forEach(fn => { try{ fn(reason); }catch(e){ console.error(e); } }); }

/* ================= クラウド同期（Firestore） =================
   端末をまたいで予定・タスク・設定を引き継ぐ。Googleカレンダー本体との
   同期（gsync.js）とは独立していて、Google未連携でも動作する */
const pushToCloud = debounce(function(){
  if(!state.db || !state.currentUserId || !window.FirebaseSync) return;
  try{
    window.FirebaseSync.setDoc(window.FirebaseSync.doc(state.db, "users", state.currentUserId), {
      schedule: {
        schedules: loadSchedules({ includeDeleted: true }),
        tasks: loadTasks({ includeDeleted: true }),
        settings: loadSettings(),
        updatedAt: nowISO(),
      },
      updatedAt: nowISO(),
    }, { merge: true });
  }catch(e){ console.error("schedule cloud sync failed:", e); }
}, 1200);

// db.jsのonSnapshotから呼ばれる。クラウド側とローカル側を updatedAt の
// 新しい方優先でマージする（どちらか一方でしか編集していない項目は必ず残る）
export function applyCloudSchedule(payload){
  if(!payload || typeof payload !== "object") return;
  let changed = false;
  if(Array.isArray(payload.schedules)){
    changed = mergeById(SCHEDULES_KEY, payload.schedules) || changed;
  }
  if(Array.isArray(payload.tasks)){
    changed = mergeById(TASKS_KEY, payload.tasks) || changed;
  }
  if(payload.settings && typeof payload.settings === "object"){
    const local = loadSettings();
    // 設定は端末ごとの都合（同期対象カレンダーなど）が絡むため、
    // クラウド側が新しいときだけ丸ごと採用する
    if((payload.settings.updatedAt || "") > (local.updatedAt || "")){
      writeJSON(SETTINGS_KEY, { ...defaultSettings(), ...payload.settings });
      changed = true;
    }
  }
  if(changed) emitChange("cloud");
}

function mergeById(key, incoming){
  const current = readJSON(key, []);
  const byId = new Map((Array.isArray(current) ? current : []).map(item => [item.id, item]));
  let changed = false;
  incoming.forEach(item => {
    if(!item || !item.id) return;
    const mine = byId.get(item.id);
    if(!mine || (item.updatedAt || "") > (mine.updatedAt || "")){
      byId.set(item.id, item);
      changed = true;
    }
  });
  if(changed) writeJSON(key, [...byId.values()]);
  return changed;
}

/* ================= 予定（Schedule） ================= */

export function normalizeSchedule(raw){
  const s = raw || {};
  const startDateTime = s.startDateTime || `${todayKey()}T09:00`;
  return {
    id: s.id || genId("s"),
    title: s.title || "(タイトルなし)",
    description: s.description || "",
    startDateTime,
    endDateTime: s.endDateTime || startDateTime,
    allDay: !!s.allDay,
    location: s.location || "",
    recurrenceRule: s.recurrenceRule || "",
    googleEventId: s.googleEventId || "",
    googleCalendarId: s.googleCalendarId || "",
    googleEtag: s.googleEtag || "",
    googleUpdatedAt: s.googleUpdatedAt || "",
    syncStatus: s.syncStatus || "local",
    color: s.color || "",
    // 通知設定 [{ unit:"minutes"|"hours"|"days", value:Number, atTime:"HH:MM"（unit==="days"のとき）}]
    reminders: Array.isArray(s.reminders) ? s.reminders : [],
    // 週間ルーティン画面から作られた予定かどうか（曜日別の一覧に出す対象）
    routine: !!s.routine,
    // 繰り返しのうち「この日は無し」にした日付キーの配列
    exdates: Array.isArray(s.exdates) ? s.exdates : [],
    // 繰り返しのうち特定日だけの一時的な変更 { "YYYY-MM-DD": {title,start,end,location,description} }
    overrides: (s.overrides && typeof s.overrides === "object") ? s.overrides : {},
    // 競合時にユーザーへ選ばせるための、Google側の内容の控え
    conflict: s.conflict || null,
    deleted: !!s.deleted,
    createdAt: s.createdAt || nowISO(),
    updatedAt: s.updatedAt || nowISO(),
  };
}

export function loadSchedules(opts){
  const includeDeleted = !!(opts && opts.includeDeleted);
  const raw = readJSON(SCHEDULES_KEY, []);
  const list = (Array.isArray(raw) ? raw : []).map(normalizeSchedule);
  const cutoff = addDaysKey(todayKey(), -TOMBSTONE_TTL_DAYS);
  const alive = list.filter(s => !s.deleted || datePartOf(s.updatedAt) >= cutoff);
  if(alive.length !== list.length) writeJSON(SCHEDULES_KEY, alive);
  return includeDeleted ? alive : alive.filter(s => !s.deleted);
}

export function getSchedule(id){
  return loadSchedules({ includeDeleted: true }).find(s => s.id === id) || null;
}

/* 予定を丸ごと保存する。
   opts.silent … クラウド同期・再描画通知の両方を抑制する
   opts.reason … 変更通知に載せる理由。既定は "schedules"（＝ユーザー操作
     による変更なので、購読側はGoogleへの反映を予約する）。Googleからの
     取り込み結果を書き戻すときは "sync" を渡す。こうしないと
     「同期 → 保存 → 変更通知 → 同期 …」が延々と繰り返されてしまう */
export function saveSchedules(list, opts){
  writeJSON(SCHEDULES_KEY, list.map(normalizeSchedule));
  if(opts && opts.silent) return;
  pushToCloud();
  emitChange((opts && opts.reason) || "schedules");
}

export function upsertSchedule(schedule, opts){
  const list = loadSchedules({ includeDeleted: true });
  const next = normalizeSchedule({ ...schedule, updatedAt: (opts && opts.keepUpdatedAt) ? schedule.updatedAt : nowISO() });
  const idx = list.findIndex(s => s.id === next.id);
  if(idx >= 0) list[idx] = next; else list.push(next);
  saveSchedules(list, opts);
  return next;
}

// 予定を削除する。Googleと紐づいている場合は墓標として残し、
// 次の同期でGoogle側からも消せるように syncStatus を "pending" にする
export function deleteSchedule(id, opts){
  const list = loadSchedules({ includeDeleted: true });
  const idx = list.findIndex(s => s.id === id);
  if(idx < 0) return null;
  const target = list[idx];
  if(target.googleEventId){
    list[idx] = normalizeSchedule({ ...target, deleted: true, syncStatus: "pending", updatedAt: nowISO() });
  } else {
    list.splice(idx, 1);
  }
  saveSchedules(list, opts);
  return target;
}

// 繰り返し予定の「この日だけ」を削除する（RRULE本体は残す）
export function deleteOccurrence(id, occDateKey){
  const s = getSchedule(id);
  if(!s) return;
  const exdates = [...new Set([...(s.exdates || []), occDateKey])];
  const overrides = { ...(s.overrides || {}) };
  delete overrides[occDateKey];
  upsertSchedule({ ...s, exdates, overrides, syncStatus: s.googleEventId ? "pending" : s.syncStatus });
}

// 繰り返し予定の「この日だけ」を一時的に変更する
export function setOccurrenceOverride(id, occDateKey, patch){
  const s = getSchedule(id);
  if(!s) return;
  const overrides = { ...(s.overrides || {}) };
  overrides[occDateKey] = { ...(overrides[occDateKey] || {}), ...patch };
  upsertSchedule({ ...s, overrides, syncStatus: s.googleEventId ? "pending" : s.syncStatus });
}

export function clearOccurrenceOverride(id, occDateKey){
  const s = getSchedule(id);
  if(!s) return;
  const overrides = { ...(s.overrides || {}) };
  delete overrides[occDateKey];
  const exdates = (s.exdates || []).filter(k => k !== occDateKey);
  upsertSchedule({ ...s, overrides, exdates, syncStatus: s.googleEventId ? "pending" : s.syncStatus });
}

/* ================= タスク（Task）=================
   仕様どおり時間を持たないチェックリスト。repeatType で毎日／平日／毎週の
   繰り返しに対応し、繰り返しタスクの完了は日付ごと（doneDates）に記録する */

export const TASK_REPEAT_LABEL = {
  none: "繰り返さない",
  daily: "毎日",
  weekday: "平日（月〜金）",
  weekly: "毎週",
  monthly: "毎月",
};

export function normalizeTask(raw){
  const t = raw || {};
  return {
    id: t.id || genId("t"),
    title: t.title || "",
    completed: !!t.completed,
    dueDate: t.dueDate || todayKey(),
    repeatType: t.repeatType || "none",
    // 繰り返しタスクの「その日は完了した」記録
    doneDates: Array.isArray(t.doneDates) ? t.doneDates : [],
    deleted: !!t.deleted,
    createdAt: t.createdAt || nowISO(),
    updatedAt: t.updatedAt || nowISO(),
  };
}

export function loadTasks(opts){
  const includeDeleted = !!(opts && opts.includeDeleted);
  const raw = readJSON(TASKS_KEY, []);
  const list = (Array.isArray(raw) ? raw : []).map(normalizeTask);
  const cutoff = addDaysKey(todayKey(), -TOMBSTONE_TTL_DAYS);
  const alive = list.filter(t => !t.deleted || datePartOf(t.updatedAt) >= cutoff);
  if(alive.length !== list.length) writeJSON(TASKS_KEY, alive);
  return includeDeleted ? alive : alive.filter(t => !t.deleted);
}

export function saveTasks(list){
  writeJSON(TASKS_KEY, list.map(normalizeTask));
  pushToCloud();
  emitChange("tasks");
}

export function upsertTask(task){
  const list = loadTasks({ includeDeleted: true });
  const next = normalizeTask({ ...task, updatedAt: nowISO() });
  const idx = list.findIndex(t => t.id === next.id);
  if(idx >= 0) list[idx] = next; else list.push(next);
  saveTasks(list);
  return next;
}

export function deleteTask(id){
  const list = loadTasks({ includeDeleted: true });
  const idx = list.findIndex(t => t.id === id);
  if(idx < 0) return;
  list[idx] = normalizeTask({ ...list[idx], deleted: true, updatedAt: nowISO() });
  saveTasks(list);
}

// 指定日に表示すべきタスク。繰り返しなしは dueDate 当日のみ、
// 繰り返しありは開始日（dueDate）以降のパターン一致日に毎回表示する
export function tasksForDate(dateKey){
  const target = new Date(`${dateKey}T00:00`);
  return loadTasks().filter(t => {
    if(!t.title) return false;
    if(t.repeatType === "none") return t.dueDate === dateKey;
    if(dateKey < t.dueDate) return false;
    const dow = target.getDay();
    if(t.repeatType === "daily") return true;
    if(t.repeatType === "weekday") return dow >= 1 && dow <= 5;
    if(t.repeatType === "weekly") return dow === new Date(`${t.dueDate}T00:00`).getDay();
    if(t.repeatType === "monthly") return target.getDate() === new Date(`${t.dueDate}T00:00`).getDate();
    return false;
  }).map(t => ({ ...t, doneOnDate: isTaskDoneOn(t, dateKey) }));
}

export function isTaskDoneOn(task, dateKey){
  if(task.repeatType === "none") return !!task.completed;
  return (task.doneDates || []).includes(dateKey);
}

export function setTaskDone(id, dateKey, done){
  const list = loadTasks({ includeDeleted: true });
  const idx = list.findIndex(t => t.id === id);
  if(idx < 0) return;
  const t = list[idx];
  if(t.repeatType === "none"){
    list[idx] = normalizeTask({ ...t, completed: done, updatedAt: nowISO() });
  } else {
    const set = new Set(t.doneDates || []);
    if(done) set.add(dateKey); else set.delete(dateKey);
    // 記録が無限に伸びないよう直近180件だけ残す
    list[idx] = normalizeTask({ ...t, doneDates: [...set].sort().slice(-180), updatedAt: nowISO() });
  }
  saveTasks(list);
}

/* ================= 設定 ================= */

export function defaultSettings(){
  return {
    // Google連携そのもの（OAuth）は既存機能。ここは「カレンダー同期を使うか」
    syncEnabled: false,
    // 初回の「Googleカレンダーと同期しますか？」を表示済みか
    syncPromptShown: false,
    // "both" | "pull"（Google→アプリ） | "push"（アプリ→Google）
    syncDirection: "both",
    // 同期対象カレンダー { [calendarId]: true }。空なら primary のみ
    syncCalendars: {},
    // 新規作成した予定の書き込み先カレンダーID（空ならprimary）
    writeCalendarId: "",
    // 競合時の方針 "newest"（最新更新日時を優先） | "ask"（ユーザーに選ばせる）
    conflictPolicy: "newest",
    // 新規予定に自動で付ける通知
    defaultReminders: [{ unit: "minutes", value: 30 }],
    // 日表示の初期スクロール位置（時）
    dayStartHour: 7,
    updatedAt: nowISO(),
  };
}

export function loadSettings(){
  const raw = readJSON(SETTINGS_KEY, null);
  return { ...defaultSettings(), ...(raw && typeof raw === "object" ? raw : {}) };
}

export function saveSettings(patch){
  const next = { ...loadSettings(), ...patch, updatedAt: nowISO() };
  writeJSON(SETTINGS_KEY, next);
  pushToCloud();
  emitChange("settings");
  return next;
}

/* ================= 同期状態（差分同期トークン） =================
   Google Calendar API の syncToken をカレンダーごとに保持し、2回目以降は
   「前回以降に変わった予定だけ」を取得する（＝差分同期）。端末ローカル
   限定の情報なのでクラウドへは同期しない */

export function loadSyncState(){
  const raw = readJSON(SYNCSTATE_KEY, null);
  return { tokens: {}, lastSyncAt: "", lastError: "", ...(raw && typeof raw === "object" ? raw : {}) };
}

export function saveSyncState(patch){
  const next = { ...loadSyncState(), ...patch };
  writeJSON(SYNCSTATE_KEY, next);
  return next;
}

export function clearSyncTokens(){ saveSyncState({ tokens: {} }); }

/* ================= 既存データからの移行 =================
   この機能の追加前から使われていた
   ・gcal_store_v1（ローカルのデモカレンダーの予定）
   ・gcal_todo_store_v1（日付ごとの「本日のタスク」）
   を、新しい Schedule / Task テーブルへ1度だけ取り込む。元のキーは
   消さずに残す（従来画面が読んでも壊れないようにするため） */
export function migrateLegacyData(){
  if(readJSON(MIGRATED_KEY, false)) return;
  try{
    const legacyStore = JSON.parse(localStorage.getItem(storageKey("gcal_store_v1")) || "null");
    const legacyTodos = JSON.parse(localStorage.getItem(storageKey("gcal_todo_store_v1")) || "null");
    const schedules = loadSchedules({ includeDeleted: true });
    const tasks = loadTasks({ includeDeleted: true });

    if(legacyStore && legacyStore.events && typeof legacyStore.events === "object"){
      Object.values(legacyStore.events).forEach(byDate => {
        Object.entries(byDate || {}).forEach(([dk, list]) => {
          (list || []).forEach(ev => {
            if(!ev || !ev.title) return;
            const allDay = !ev.start;
            schedules.push(normalizeSchedule({
              id: `mig-${ev.id || genId("e")}`,
              title: ev.title,
              startDateTime: allDay ? `${dk}T00:00` : `${dk}T${ev.start}`,
              endDateTime: allDay ? `${dk}T23:59` : `${dk}T${ev.end || ev.start}`,
              allDay,
              syncStatus: "local",
            }));
          });
        });
      });
    }

    if(legacyTodos && typeof legacyTodos === "object"){
      Object.entries(legacyTodos).forEach(([dk, list]) => {
        (list || []).forEach(t => {
          if(!t || !t.text) return;
          tasks.push(normalizeTask({
            id: `mig-${t.id || genId("t")}`,
            title: t.text,
            completed: !!t.done,
            dueDate: dk,
            repeatType: "none",
          }));
        });
      });
    }

    writeJSON(SCHEDULES_KEY, dedupeById(schedules));
    writeJSON(TASKS_KEY, dedupeById(tasks));
  }catch(e){ console.error("schedule migration failed:", e); }
  writeJSON(MIGRATED_KEY, true);
}

function dedupeById(list){
  const seen = new Map();
  list.forEach(item => { if(item && item.id && !seen.has(item.id)) seen.set(item.id, item); });
  return [...seen.values()];
}

/* ================= ユーザー切替 =================
   ログイン／ログアウト／別アカウントへの切替時にlocalStorageのキー空間が
   変わるため、移行処理をもう一度走らせて再描画する */
let identityToken;
export function handleIdentityChange(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  if(identityToken === uid) return false;
  identityToken = uid;
  migrateLegacyData();
  return true;
}

/* ================= 予定の並び替え・整形の共通処理 ================= */

// 予定オブジェクトから、その日の表示用の開始・終了時刻を取り出す
export function scheduleTimes(schedule, occDateKey){
  const override = (schedule.overrides || {})[occDateKey] || {};
  if(schedule.allDay) return { start: "", end: "", allDay: true };
  return {
    start: override.start || timePartOf(schedule.startDateTime),
    end: override.end || timePartOf(schedule.endDateTime),
    allDay: false,
  };
}

// 予定が「今日はもう終わったか」を判定する（ホーム画面の並び替え用）
export function isFinished(occ, now){
  if(occ.allDay) return false;
  const ref = occ.end || occ.start;
  if(!ref) return false;
  const [h, mi] = ref.split(":").map(Number);
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, mi);
  return at.getTime() <= now.getTime();
}

export { dateKeyOf, todayKey, parseLocalISO };
