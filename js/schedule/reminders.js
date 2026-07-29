/* =========================================================================
   予定の通知（リマインダー）。

   予定ごとに「○分前」「○時間前」「前日の○時」を自由に組み合わせて設定でき、
   30秒間隔のポーリングで発火時刻を過ぎたものをアプリ内トーストで知らせる。
   同じ通知を二度出さないよう、発火済みキーは端末に記録する。
   ========================================================================= */
import { showToast } from '../notifications.js';
import { occurrencesForDate } from './occurrences.js';
import { loadSettings } from './store.js';
import { state } from '../state.js';
import { addDaysKey, dateKeyOf, esc, pad2, todayKey } from './util.js';

const SENT_KEY = "sched_reminder_sent_v1";
const POLL_INTERVAL_MS = 30000;
// 発火判定の許容ウィンドウ。ポーリング間隔より十分長くとることで、
// 画面を開いていなかった間に過ぎてしまった通知も取りこぼさない
const FIRE_WINDOW_MS = 5 * 60 * 1000;

export const REMINDER_PRESETS = [
  { unit: "minutes", value: 5,  label: "5分前" },
  { unit: "minutes", value: 10, label: "10分前" },
  { unit: "minutes", value: 30, label: "30分前" },
  { unit: "hours",   value: 1,  label: "1時間前" },
  { unit: "hours",   value: 2,  label: "2時間前" },
  { unit: "days",    value: 1,  atTime: "21:00", label: "前日21時" },
];

export function reminderLabel(reminder){
  const r = reminder || {};
  if(r.unit === "minutes") return `${r.value}分前`;
  if(r.unit === "hours") return `${r.value}時間前`;
  if(r.unit === "days") return r.value === 1 ? `前日${(r.atTime || "21:00").replace(":00", "")}時` : `${r.value}日前${(r.atTime || "21:00").replace(":00", "")}時`;
  return "通知";
}

function sentStorageKey(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `${SENT_KEY}::${uid}`;
}

function loadSent(){
  try{ return new Set(JSON.parse(localStorage.getItem(sentStorageKey()) || "[]")); }catch(e){ return new Set(); }
}

function saveSent(set){
  try{ localStorage.setItem(sentStorageKey(), JSON.stringify([...set].slice(-300))); }catch(e){}
}

// 通知の発火時刻（Date）を求める。終日予定は当日0時、または「前日○時」の
// 指定があればその時刻を基準にする
export function reminderFireTime(occ, reminder){
  const [y, m, d] = occ.dateKey.split("-").map(Number);
  const r = reminder || {};
  if(r.unit === "days"){
    const at = (r.atTime || "21:00").split(":").map(Number);
    return new Date(y, m - 1, d - Number(r.value || 1), at[0] || 0, at[1] || 0);
  }
  const startHHMM = occ.allDay ? "00:00" : (occ.start || "00:00");
  const [sh, sm] = startHHMM.split(":").map(Number);
  const base = new Date(y, m - 1, d, sh || 0, sm || 0);
  const offsetMin = r.unit === "hours" ? Number(r.value || 0) * 60 : Number(r.value || 0);
  return new Date(base.getTime() - offsetMin * 60000);
}

function checkReminders(){
  const now = new Date();
  // 今日と明日ぶんを見る（「前日○時」の通知は前日に発火するため）
  const days = [todayKey(), addDaysKey(todayKey(), 1)];
  const sent = loadSent();
  let changed = false;

  days.forEach(dk => {
    occurrencesForDate(dk).forEach(occ => {
      const reminders = occ.reminders || [];
      reminders.forEach((reminder, i) => {
        const fireAt = reminderFireTime(occ, reminder);
        const diff = now.getTime() - fireAt.getTime();
        if(diff < 0 || diff > FIRE_WINDOW_MS) return;
        const key = `${occ.key}|${i}`;
        if(sent.has(key)) return;
        sent.add(key);
        changed = true;
        showToast("reminder", buildMessage(occ, reminder));
      });
    });
  });

  if(changed) saveSent(sent);
}

function buildMessage(occ, reminder){
  const when = occ.allDay ? "終日" : (occ.end ? `${occ.start}〜${occ.end}` : occ.start);
  const lead = reminderLabel(reminder);
  const place = occ.location ? `（${occ.location}）` : "";
  return `⏰ ${lead}：『${occ.title}』${when === "終日" ? "は今日の終日予定です" : ` ${when}`}${place}`;
}

let started = false;
export function startReminderEngine(){
  if(started || typeof window === "undefined") return;
  started = true;
  setInterval(checkReminders, POLL_INTERVAL_MS);
  // 起動直後にも一度評価して、開いていなかった間に過ぎた通知へ追いつく
  setTimeout(checkReminders, 4000);
  document.addEventListener("visibilitychange", () => {
    if(document.visibilityState === "visible") checkReminders();
  });
}

// 予定を新規作成するときの初期通知（設定画面で変更できる）
export function defaultReminders(){
  const settings = loadSettings();
  return Array.isArray(settings.defaultReminders) ? settings.defaultReminders : [];
}

export { esc, pad2, dateKeyOf };
