/* =========================================================================
   Googleカレンダーとの双方向同期。

   ・認証（OAuth・アクセストークンの更新）は既存のカレンダー機能
     （js/render.js）がすでに実装しているため、そこが公開する
     window.GcalGoogleBridge 経由でCalendar REST APIを呼ぶだけにする。
   ・取得は syncToken を使った差分同期。2回目以降は「前回以降に変わった
     予定」しか受け取らないので、起動時同期が軽い。トークンが失効（410）
     したときだけ全件取り直す。
   ・繰り返し予定は singleEvents=false で親イベント（RRULE付き）のまま取得し、
     アプリ側の展開エンジン（occurrences.js）で描画する。Google側で
     「この回だけ変更／削除」された分は recurringEventId 付きの例外
     アイテムとして届くので、親の overrides / exdates へ反映する。
   ・送信は syncStatus:"pending" の予定だけをまとめて反映する（差分送信）。
   ・競合（両方が変更された）は設定に従い、最新更新日時優先か、
     ユーザーへの選択（syncStatus:"conflict"）にする。
   ・オフライン時は何もしない。オンラインへ復帰したら index.js が
     再度この同期を呼ぶ。
   ========================================================================= */
import {
  clearSyncTokens, getSchedule, loadSchedules, loadSettings, loadSyncState,
  normalizeSchedule, saveSchedules, saveSyncState,
} from './store.js';
import { untilToGoogle } from './recurrence.js';
import { addDaysKey, datePartOf, dateKeyOf, nowISO, pad2, timePartOf, todayKey } from './util.js';

// 初回（syncTokenが無いとき）に取得する期間。過去3ヶ月〜先12ヶ月。
// これ以降は差分同期になるので、範囲を広げても通信量は増えない
const INITIAL_PAST_DAYS = 92;
const INITIAL_FUTURE_DAYS = 366;
const PAGE_SIZE = 250;

// Googleカレンダーの標準イベント色（colorId → 実際の色）。アプリ側は色を
// HEXで保持しているので、一番近いものを選んで相互変換する
export const GOOGLE_EVENT_COLORS = {
  "1": "#7986cb", "2": "#33b679", "3": "#8e24aa", "4": "#e67c73",
  "5": "#f6bf26", "6": "#f4511e", "7": "#039be5", "8": "#616161",
  "9": "#3f51b5", "10": "#0b8043", "11": "#d50000",
};

function bridge(){ return (typeof window !== "undefined" && window.GcalGoogleBridge) || null; }

export function isGoogleConnected(){
  const b = bridge();
  return !!(b && b.isConnected());
}

// 保存済みのGoogleトークンからの自動復元を促す。画面を描くたびに呼んでよい
// （実際の復元処理は既存カレンダー機能側で1回だけ走るようガードされている）
export function ensureGoogleConnection(){
  const b = bridge();
  if(b && b.maybeAutoReconnect) b.maybeAutoReconnect();
}

// 連携まわりのエラーメッセージ（未連携・失効など）
export function googleError(){
  const b = bridge();
  return (b && b.error && b.error()) || "";
}

export function googleConnecting(){
  const b = bridge();
  return !!(b && b.connecting && b.connecting());
}

export function googleCalendars(){
  const b = bridge();
  return b ? (b.calendars() || []) : [];
}

// 同期対象のカレンダー。設定で明示的に選ばれていればそれ、
// 未設定ならプライマリカレンダー（＝ログイン中のGoogleアカウント本体）のみ
export function targetCalendars(){
  const settings = loadSettings();
  const cals = googleCalendars();
  const picked = Object.keys(settings.syncCalendars || {}).filter(id => settings.syncCalendars[id]);
  if(picked.length) return cals.filter(c => picked.includes(c.id));
  const primary = cals.find(c => c.primary);
  return primary ? [primary] : cals.slice(0, 1);
}

// 新しい予定の書き込み先。設定が無ければ同期対象の先頭（＝プライマリ）
export function writeCalendarId(){
  const settings = loadSettings();
  if(settings.writeCalendarId) return settings.writeCalendarId;
  const targets = targetCalendars().filter(c => c.accessRole === "owner" || c.accessRole === "writer");
  return (targets[0] || targetCalendars()[0] || {}).id || "";
}

async function api(path, options){
  const b = bridge();
  if(!b) throw new Error("gcal-bridge-missing");
  return b.apiFetch(path, options);
}

/* ================= Google → アプリ（取り込み） ================= */

function colorIdToHex(colorId){ return GOOGLE_EVENT_COLORS[String(colorId)] || ""; }

function hexToColorId(hex){
  if(!hex) return "";
  const target = hex.toLowerCase();
  const exact = Object.keys(GOOGLE_EVENT_COLORS).find(id => GOOGLE_EVENT_COLORS[id] === target);
  return exact || "";
}

// GoogleのRFC3339日時（"2026-07-29T19:00:00+09:00"）を、アプリ内で使う
// ローカル日時文字列（"2026-07-29T19:00"）へ変換する
function googleDateTimeToLocal(info){
  if(!info) return "";
  if(info.date) return `${info.date}T00:00`;
  if(!info.dateTime) return "";
  const d = new Date(info.dateTime);
  return `${dateKeyOf(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function googleRemindersToLocal(reminders){
  if(!reminders || reminders.useDefault || !Array.isArray(reminders.overrides)) return [];
  return reminders.overrides.slice(0, 5).map(o => {
    const minutes = Number(o.minutes || 0);
    if(minutes >= 1440 && minutes % 1440 === 0) return { unit: "days", value: minutes / 1440 };
    if(minutes >= 60 && minutes % 60 === 0) return { unit: "hours", value: minutes / 60 };
    return { unit: "minutes", value: minutes };
  });
}

function googleEventToSchedule(item, calId, existing){
  const allDay = !!(item.start && item.start.date);
  const startLocal = googleDateTimeToLocal(item.start);
  let endLocal = googleDateTimeToLocal(item.end);
  if(allDay && endLocal){
    // Googleの終日予定の end.date は「翌日」なので1日戻して内包表現にする
    endLocal = `${addDaysKey(datePartOf(endLocal), -1)}T23:59`;
  }
  const rrule = (item.recurrence || []).find(r => /^RRULE:/i.test(r)) || "";
  return normalizeSchedule({
    ...(existing || {}),
    id: existing ? existing.id : `g-${item.id}`,
    title: item.summary || "(タイトルなし)",
    description: item.description || "",
    location: item.location || "",
    startDateTime: startLocal || (existing ? existing.startDateTime : `${todayKey()}T09:00`),
    endDateTime: endLocal || startLocal,
    allDay,
    recurrenceRule: rrule,
    color: colorIdToHex(item.colorId) || (existing ? existing.color : ""),
    reminders: googleRemindersToLocal(item.reminders),
    googleEventId: item.id,
    googleCalendarId: calId,
    googleEtag: item.etag || "",
    googleUpdatedAt: item.updated || "",
    syncStatus: "synced",
    conflict: null,
    deleted: false,
    // Google側の変更を取り込んだ時刻を updatedAt とする
    updatedAt: item.updated || nowISO(),
    createdAt: existing ? existing.createdAt : (item.created || nowISO()),
    // 週間ルーティンの印はアプリ独自の概念なので、既存の値を必ず引き継ぐ
    routine: existing ? !!existing.routine : false,
    exdates: existing ? existing.exdates : [],
    overrides: existing ? existing.overrides : {},
  });
}

// 1カレンダーぶんの差分取得。戻り値は取り込んだ件数
async function pullCalendar(calId, list){
  const syncState = loadSyncState();
  const token = (syncState.tokens || {})[calId] || "";
  let pageToken = "";
  let nextSyncToken = "";
  let applied = 0;
  const settings = loadSettings();
  // 繰り返しの例外（この回だけ変更／削除）は、親イベントより先に届くことが
  // ある。その場で親が見つからなかったものはここへ退避し、全ページを
  // 読み終えてからまとめて適用する
  const deferredExceptions = [];

  for(let page = 0; page < 20; page++){
    const params = new URLSearchParams();
    params.set("maxResults", String(PAGE_SIZE));
    params.set("showDeleted", "true");
    params.set("singleEvents", "false");
    if(token && !pageToken){
      params.set("syncToken", token);
    } else if(!pageToken){
      const from = addDaysKey(todayKey(), -INITIAL_PAST_DAYS);
      const to = addDaysKey(todayKey(), INITIAL_FUTURE_DAYS);
      params.set("timeMin", new Date(`${from}T00:00`).toISOString());
      params.set("timeMax", new Date(`${to}T00:00`).toISOString());
    }
    if(pageToken) params.set("pageToken", pageToken);

    let data;
    try{
      data = await api(`calendars/${encodeURIComponent(calId)}/events?${params.toString()}`);
    }catch(e){
      // 410 Gone ＝ syncTokenが古すぎる。トークンを捨てて全件から取り直す
      if(String(e.message || "").includes("410") && token){
        const s = loadSyncState();
        delete (s.tokens || {})[calId];
        saveSyncState({ tokens: s.tokens });
        return pullCalendar(calId, list);
      }
      throw e;
    }

    (data.items || []).forEach(item => {
      applied += applyGoogleItem(item, calId, list, settings, deferredExceptions) ? 1 : 0;
    });
    pageToken = data.nextPageToken || "";
    nextSyncToken = data.nextSyncToken || nextSyncToken;
    if(!pageToken) break;
  }

  // 退避しておいた例外を、親が揃った状態でもう一度適用する
  deferredExceptions.forEach(item => { applied += applyRecurrenceException(item, list) ? 1 : 0; });

  if(nextSyncToken){
    const s = loadSyncState();
    saveSyncState({ tokens: { ...(s.tokens || {}), [calId]: nextSyncToken } });
  }
  return applied;
}

// 1件のGoogleイベントをローカルの予定一覧（list、この場で書き換える）へ反映する
function applyGoogleItem(item, calId, list, settings, deferredExceptions){
  if(!item || !item.id) return false;

  // --- 繰り返しの「この回だけ」の変更・削除 ---
  if(item.recurringEventId){
    if(applyRecurrenceException(item, list)) return true;
    // 親イベントがまだ届いていない場合は、このページの読み込み後に再試行する
    if(deferredExceptions) deferredExceptions.push(item);
    return false;
  }

  const idx = list.findIndex(s => s.googleEventId === item.id && s.googleCalendarId === calId);
  const existing = idx >= 0 ? list[idx] : null;

  // --- Google側で削除された ---
  if(item.status === "cancelled"){
    if(idx >= 0) list.splice(idx, 1);
    return idx >= 0;
  }

  // --- 競合判定 ---
  // ローカルで編集済み（pending）かつGoogle側も更新されている場合
  if(existing && existing.syncStatus === "pending"){
    const googleNewer = (item.updated || "") > (existing.updatedAt || "");
    if(settings.conflictPolicy === "ask"){
      list[idx] = normalizeSchedule({
        ...existing,
        syncStatus: "conflict",
        conflict: {
          title: item.summary || "",
          startDateTime: googleDateTimeToLocal(item.start),
          endDateTime: googleDateTimeToLocal(item.end),
          location: item.location || "",
          description: item.description || "",
          updatedAt: item.updated || "",
        },
      });
      return true;
    }
    // "newest"：最新更新日時が新しい方を採用する。ローカルの方が新しければ
    // 取り込まずに pending のまま残し、このあとの送信フェーズでGoogleへ上書きする
    if(!googleNewer) return false;
  }

  const next = googleEventToSchedule(item, calId, existing);
  if(idx >= 0) list[idx] = next; else list.push(next);
  return true;
}

// Google側で「この回だけ」変更・削除された繰り返しの例外を、親の予定の
// overrides / exdates へ落とし込む。親が見つからなければ false を返す
function applyRecurrenceException(item, list){
  const parent = list.find(s => s.googleEventId === item.recurringEventId);
  if(!parent) return false;
  const origin = item.originalStartTime || {};
  const occKey = origin.date || datePartOf(googleDateTimeToLocal(origin));
  if(!occKey) return false;
  if(item.status === "cancelled"){
    parent.exdates = [...new Set([...(parent.exdates || []), occKey])];
    parent.overrides = { ...(parent.overrides || {}) };
    delete parent.overrides[occKey];
  } else {
    const startLocal = googleDateTimeToLocal(item.start);
    const endLocal = googleDateTimeToLocal(item.end);
    parent.overrides = {
      ...(parent.overrides || {}),
      [occKey]: {
        title: item.summary || parent.title,
        start: item.start && item.start.date ? "" : timePartOf(startLocal),
        end: item.end && item.end.date ? "" : timePartOf(endLocal),
        location: item.location || "",
        description: item.description || "",
      },
    };
    parent.exdates = (parent.exdates || []).filter(k => k !== occKey);
  }
  parent.updatedAt = item.updated || nowISO();
  return true;
}

/* ================= アプリ → Google（送信） ================= */

function toGoogleBody(schedule){
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const body = {
    summary: schedule.title,
    description: schedule.description || "",
    location: schedule.location || "",
  };
  if(schedule.allDay){
    const startKey = datePartOf(schedule.startDateTime);
    const endKey = datePartOf(schedule.endDateTime) || startKey;
    body.start = { date: startKey };
    // Googleの終日予定の end.date は「終了日の翌日」を指す排他的な指定
    body.end = { date: addDaysKey(endKey, 1) };
  } else {
    body.start = { dateTime: `${schedule.startDateTime}:00`, timeZone: tz };
    body.end = { dateTime: `${schedule.endDateTime}:00`, timeZone: tz };
  }
  body.recurrence = schedule.recurrenceRule ? [schedule.recurrenceRule] : [];
  const colorId = hexToColorId(schedule.color);
  if(colorId) body.colorId = colorId;
  const overrides = remindersToGoogle(schedule);
  body.reminders = overrides.length ? { useDefault: false, overrides } : { useDefault: true };
  return body;
}

// アプリの通知設定（○分前／○時間前／前日○時）をGoogleの
// 「開始の何分前か」へ変換する
export function reminderToMinutes(reminder, startHHMM){
  const r = reminder || {};
  const value = Number(r.value || 0);
  if(r.unit === "minutes") return value;
  if(r.unit === "hours") return value * 60;
  if(r.unit === "days"){
    const startMin = toMinutes(startHHMM || "09:00");
    const atMin = toMinutes(r.atTime || "21:00");
    return value * 1440 + startMin - atMin;
  }
  return value;
}

function toMinutes(hhmm){
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

function remindersToGoogle(schedule){
  const startHHMM = timePartOf(schedule.startDateTime) || "09:00";
  return (schedule.reminders || [])
    .map(r => Math.round(reminderToMinutes(r, startHHMM)))
    // Googleが受け付けるのは0〜40320分（4週間）の範囲
    .filter(m => m >= 0 && m <= 40320)
    .slice(0, 5)
    .map(minutes => ({ method: "popup", minutes }));
}

// ローカルで変更された予定をGoogleへ反映する。1件ずつ結果を見て
// syncStatus を更新するので、途中で失敗しても他の予定の同期は続く
async function pushPending(list){
  const calId = writeCalendarId();
  let pushed = 0;
  for(const schedule of list.slice()){
    if(schedule.syncStatus !== "pending") continue;
    try{
      if(schedule.deleted){
        if(schedule.googleEventId){
          await api(`calendars/${encodeURIComponent(schedule.googleCalendarId || calId)}/events/${encodeURIComponent(schedule.googleEventId)}`, { method: "DELETE" });
        }
        const idx = list.findIndex(s => s.id === schedule.id);
        if(idx >= 0) list.splice(idx, 1);
        pushed++;
        continue;
      }
      const body = toGoogleBody(schedule);
      if(!schedule.googleEventId){
        if(!calId) continue;
        const created = await api(`calendars/${encodeURIComponent(calId)}/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        applyPushResult(list, schedule.id, created, calId);
      } else {
        const target = schedule.googleCalendarId || calId;
        const updated = await api(`calendars/${encodeURIComponent(target)}/events/${encodeURIComponent(schedule.googleEventId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        applyPushResult(list, schedule.id, updated, target);
        await pushInstanceChanges(schedule, target);
      }
      pushed++;
    }catch(e){
      if(String(e.message || "").includes("unauthorized")) throw e;
      const idx = list.findIndex(s => s.id === schedule.id);
      if(idx >= 0) list[idx] = normalizeSchedule({ ...list[idx], syncStatus: "error" });
    }
  }
  return pushed;
}

function applyPushResult(list, localId, googleEvent, calId){
  const idx = list.findIndex(s => s.id === localId);
  if(idx < 0 || !googleEvent) return;
  list[idx] = normalizeSchedule({
    ...list[idx],
    googleEventId: googleEvent.id,
    googleCalendarId: calId,
    googleEtag: googleEvent.etag || "",
    googleUpdatedAt: googleEvent.updated || "",
    syncStatus: "synced",
    conflict: null,
  });
}

// 繰り返し予定の「この回だけの変更・削除」をGoogle側の該当インスタンスへ
// 反映する。インスタンスIDを推測せず、instances エンドポイントで
// 対象日のインスタンスを引いてからPATCH／DELETEする
async function pushInstanceChanges(schedule, calId){
  const keys = [...new Set([...(schedule.exdates || []), ...Object.keys(schedule.overrides || {})])];
  for(const occKey of keys.slice(0, 30)){
    try{
      const params = new URLSearchParams({
        timeMin: new Date(`${occKey}T00:00`).toISOString(),
        timeMax: new Date(`${addDaysKey(occKey, 1)}T00:00`).toISOString(),
        maxResults: "5",
      });
      const data = await api(`calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(schedule.googleEventId)}/instances?${params.toString()}`);
      const instance = (data.items || [])[0];
      if(!instance) continue;
      if((schedule.exdates || []).includes(occKey)){
        if(instance.status !== "cancelled"){
          await api(`calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(instance.id)}`, { method: "DELETE" });
        }
        continue;
      }
      const override = (schedule.overrides || {})[occKey];
      if(!override) continue;
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const body = { summary: override.title || schedule.title };
      if(override.location != null) body.location = override.location;
      if(override.description != null) body.description = override.description;
      if(override.start){
        body.start = { dateTime: `${occKey}T${override.start}:00`, timeZone: tz };
        body.end = { dateTime: `${occKey}T${override.end || override.start}:00`, timeZone: tz };
      }
      await api(`calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(instance.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }catch(e){ /* 1件失敗しても他のインスタンスの反映は続ける */ }
  }
}

/* ================= 同期の入口 ================= */

let syncing = false;
let queued = false;

// 同期を1回実行する。多重起動は防ぎ、実行中に来た依頼は1回だけ後追いする
export async function syncNow(opts){
  const options = opts || {};
  const settings = loadSettings();
  if(!settings.syncEnabled || !isGoogleConnected()){
    return { skipped: true, reason: "disabled" };
  }
  if(typeof navigator !== "undefined" && navigator.onLine === false){
    return { skipped: true, reason: "offline" };
  }
  if(syncing){ queued = true; return { skipped: true, reason: "busy" }; }
  syncing = true;

  const result = { pulled: 0, pushed: 0, error: "" };
  try{
    const b = bridge();
    if(b && b.ensureCalendars) await b.ensureCalendars();
    const cals = targetCalendars();
    const list = loadSchedules({ includeDeleted: true });

    if(settings.syncDirection !== "pull"){
      result.pushed = await pushPending(list);
    }
    if(settings.syncDirection !== "push"){
      for(const cal of cals){
        result.pulled += await pullCalendar(cal.id, list);
      }
      // 取り込みで competing 状態が解けた予定を、あらためて送信しておく
      if(settings.syncDirection === "both"){
        result.pushed += await pushPending(list);
      }
    }

    // reason:"sync" ＝ 同期の結果の書き戻し。購読側（index.js）はこれを見て
    // 「さらにGoogleへ反映する」予約をしない（同期の無限ループを防ぐ）
    saveSchedules(list, { reason: "sync" });
    saveSyncState({ lastSyncAt: nowISO(), lastError: "" });
  }catch(e){
    result.error = String(e.message || e);
    saveSyncState({ lastError: result.error });
    if(!options.quiet) console.error("google calendar sync failed:", e);
  }finally{
    syncing = false;
  }

  if(queued){ queued = false; setTimeout(() => syncNow({ quiet: true }), 500); }
  return result;
}

export function isSyncing(){ return syncing; }

// 同期対象カレンダーや同期方向を変えたときは、差分の基準がずれるので
// トークンを捨てて次回に全件取り直す
export function resetSync(){
  clearSyncTokens();
}

// 競合中の予定について、どちらを採用するかを確定させる
export function resolveConflict(scheduleId, choice){
  const schedule = getSchedule(scheduleId);
  if(!schedule || !schedule.conflict) return;
  const list = loadSchedules({ includeDeleted: true });
  const idx = list.findIndex(s => s.id === scheduleId);
  if(idx < 0) return;
  if(choice === "google"){
    const c = schedule.conflict;
    list[idx] = normalizeSchedule({
      ...schedule,
      title: c.title || schedule.title,
      startDateTime: c.startDateTime || schedule.startDateTime,
      endDateTime: c.endDateTime || schedule.endDateTime,
      location: c.location || "",
      description: c.description || "",
      syncStatus: "synced",
      conflict: null,
      updatedAt: nowISO(),
    });
  } else {
    list[idx] = normalizeSchedule({ ...schedule, syncStatus: "pending", conflict: null, updatedAt: nowISO() });
  }
  saveSchedules(list, { reason: "sync" });
  syncNow({ quiet: true });
}

export { untilToGoogle };
