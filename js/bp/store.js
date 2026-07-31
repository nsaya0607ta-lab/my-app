/* =========================================================================
   🎖️ 活動BPの台帳（ledger）と付与判定

   設計方針
   ・総合ランクは元々「各資格BPの合計」だけで決まっていた。ここで扱う
     「活動BP」はそれとは別枠で貯め、core.js の totalBP() が両者を足す。
     資格ごとの cert_*_bp には一切書き込まないため、資格レベル・学習履歴・
     資格別ランキングといった既存表示の意味は変わらない。
   ・保存はアプリ内の他機能（チャッピー／予定／スキン）と同じく、ログイン
     中のユーザーIDごとにキーを分けたlocalStorage方式。さらに users/{uid}
     ドキュメントの bpActivity フィールドへもマージ同期し、機種をまたいで
     引き継げるようにする。
   ・不正・事故による多重付与を防ぐため、付与は必ず grantBP() を通す。
       - dedupeKey … 「同じ対象に二度」を防ぐ一意キー（例：task:2026-07-30:t123）
                     once:true なら日をまたいでも二度と付与しない
       - 1日上限   … 行動グループごとの上限＋全体上限（BP_DAILY_TOTAL_CAP）
     どちらもチェックと書き込みが同一の同期処理内で完結するので、
     ボタン連打・二重タップ・再描画による重複呼び出しでも二重付与しない。
   ・連続記録が途切れてもBPを没収したり警告を出したりはしない（記録が
     1からになるだけ）。
   ========================================================================= */
import { state } from '../state.js';
import {
  BP_ACHIEVEMENTS, BP_AMOUNT, BP_CAP_GROUP, BP_DAILY_CAPS, BP_DAILY_MISSIONS,
  BP_DAILY_TOTAL_CAP, BP_LEDGER_MAX, BP_REASON_LABEL, BP_WEEKLY_MISSIONS,
} from './config.js';

const STORE_KEY_BASE = "bp_activity_v1";

function storeKey(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `${STORE_KEY_BASE}::${uid}`;
}

/* ---- 日付ユーティリティ（アプリ内の他機能と同じくローカルタイム基準） ---- */
function pad2(n){ return String(n).padStart(2, "0"); }
export function bpTodayKey(d){
  const t = d || new Date();
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
}
function addDaysKey(key, n){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || "");
  if(!m) return bpTodayKey();
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n);
  return bpTodayKey(d);
}
// 週キーは「その週の日曜日の日付」。カレンダー画面の週並びと揃える
export function bpWeekKey(d){
  const t = d || new Date();
  const sun = new Date(t.getFullYear(), t.getMonth(), t.getDate() - t.getDay());
  return bpTodayKey(sun);
}

/* =========================================================================
   状態の読み書き
   ========================================================================= */
function defaultData(){
  return {
    v: 1,
    total: 0,              // 活動BPの現在値（総合ランクへ加算される）
    lifetime: 0,           // 累計獲得BP（実績判定用。減ることはない）
    counts: {},            // 理由ごとの累計回数 { taskDone: 12, ... }
    ledger: [],            // 獲得履歴（新しい順） {id,reason,amount,at,note,gameId}
    daily: { date: null, earned: 0, groups: {}, reasons: {}, keys: [] },
    weekly: { week: null, reasons: {}, missions: [] },
    doneDailyMissions: [], // 当日クリア済みのデイリーミッションID
    achievements: [],      // 解除済み実績ID
    onceKeys: [],          // 生涯一度きりの付与キー
    loginStreak: 0,        // 連続ログイン日数
    lastLoginDate: null,
    studyStreak: 0,        // 連続学習日数
    lastStudyDate: null,
    bestLoginStreak: 0,
    updatedAt: "",
  };
}

function normalize(raw){
  const base = defaultData();
  if(!raw || typeof raw !== "object") return base;
  const d = { ...base, ...raw };
  d.total = Math.max(0, Number(d.total) || 0);
  d.lifetime = Math.max(d.total, Number(d.lifetime) || 0);
  d.counts = (d.counts && typeof d.counts === "object") ? { ...d.counts } : {};
  d.ledger = Array.isArray(d.ledger) ? d.ledger.slice(0, BP_LEDGER_MAX) : [];
  const dl = (d.daily && typeof d.daily === "object") ? d.daily : base.daily;
  d.daily = {
    date: dl.date || null,
    earned: Math.max(0, Number(dl.earned) || 0),
    groups: (dl.groups && typeof dl.groups === "object") ? { ...dl.groups } : {},
    reasons: (dl.reasons && typeof dl.reasons === "object") ? { ...dl.reasons } : {},
    keys: Array.isArray(dl.keys) ? dl.keys.slice(-400) : [],
  };
  const wk = (d.weekly && typeof d.weekly === "object") ? d.weekly : base.weekly;
  d.weekly = {
    week: wk.week || null,
    reasons: (wk.reasons && typeof wk.reasons === "object") ? { ...wk.reasons } : {},
    missions: Array.isArray(wk.missions) ? wk.missions : [],
  };
  d.doneDailyMissions = Array.isArray(d.doneDailyMissions) ? d.doneDailyMissions : [];
  d.achievements = Array.isArray(d.achievements) ? d.achievements : [];
  d.onceKeys = Array.isArray(d.onceKeys) ? d.onceKeys.slice(-1000) : [];
  d.loginStreak = Math.max(0, Number(d.loginStreak) || 0);
  d.studyStreak = Math.max(0, Number(d.studyStreak) || 0);
  d.bestLoginStreak = Math.max(d.loginStreak, Number(d.bestLoginStreak) || 0);
  return d;
}

let cache = null;
let identityToken;

function persist(){
  if(!cache) return;
  cache.updatedAt = new Date().toISOString();
  try{ localStorage.setItem(storeKey(), JSON.stringify(cache)); }catch(e){}
  pushToCloud();
}

function load(){
  if(cache) return cache;
  let raw = null;
  try{ raw = JSON.parse(localStorage.getItem(storeKey()) || "null"); }catch(e){}
  cache = normalize(raw);
  return cache;
}

// ログインユーザーの切替を検知して読み直す（他機能と同じ方式）。
// 実際に切り替わったときだけ true を返す（呼び出し側が、切替時にだけ
// 必要な処理＝日次ボーナスの再判定などを行えるように）
export function bpHandleIdentityChange(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  if(identityToken === uid) return false;
  identityToken = uid;
  cache = null;
  return true;
}

/* ---- 日付／週のロールオーバー ----
   getBpData()経由のアクセスごとに軽量チェックする。日付が変わったら
   1日の上限カウンタとデイリーミッションの達成状況をリセットする */
function touch(){
  const d = load();
  const today = bpTodayKey();
  const week = bpWeekKey();
  let changed = false;
  if(d.daily.date !== today){
    d.daily = { date: today, earned: 0, groups: {}, reasons: {}, keys: [] };
    d.doneDailyMissions = [];
    changed = true;
  }
  if(d.weekly.week !== week){
    d.weekly = { week, reasons: {}, missions: [] };
    changed = true;
  }
  if(changed) persist();
  return d;
}

export function getBpData(){ return touch(); }

/* =========================================================================
   クラウド同期（users/{uid}.bpActivity）
   端末をまたいで活動BPを引き継ぐ。書き込みが集中しないようデバウンスする
   ========================================================================= */
let pushTimer = null;
function pushToCloud(){
  if(!state.db || !state.currentUserId || !window.FirebaseSync) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    try{
      window.FirebaseSync.setDoc(
        window.FirebaseSync.doc(state.db, "users", state.currentUserId),
        { bpActivity: cache, updatedAt: new Date().toISOString() },
        { merge: true },
      );
    }catch(e){ console.error("bp cloud sync failed:", e); }
  }, 1500);
}

/* db.js の onSnapshot から呼ばれる。自分の書き込みのechoでも毎回届くため、
   「クラウド側の方が明らかに進んでいる」ときだけ取り込む。合計は多い方を
   採用し、重複防止キー・実績・ミッション達成は和集合にする（別端末で
   獲得済みの行動が、こちらの端末で再度付与されるのを防ぐため）。 */
export function applyCloudBp(payload){
  if(!payload || typeof payload !== "object") return false;
  const incoming = normalize(payload);
  const mine = load();
  const sameDay = incoming.daily.date === mine.daily.date;
  const before = JSON.stringify([mine.total, mine.lifetime, mine.daily.earned, mine.achievements.length]);

  mine.total = Math.max(mine.total, incoming.total);
  mine.lifetime = Math.max(mine.lifetime, incoming.lifetime);
  Object.keys(incoming.counts || {}).forEach(k => {
    mine.counts[k] = Math.max(Number(mine.counts[k]) || 0, Number(incoming.counts[k]) || 0);
  });
  mine.achievements = [...new Set([...mine.achievements, ...incoming.achievements])];
  mine.onceKeys = [...new Set([...mine.onceKeys, ...incoming.onceKeys])].slice(-1000);
  mine.loginStreak = Math.max(mine.loginStreak, incoming.loginStreak);
  mine.bestLoginStreak = Math.max(mine.bestLoginStreak, incoming.bestLoginStreak);
  mine.studyStreak = Math.max(mine.studyStreak, incoming.studyStreak);
  if((incoming.lastLoginDate || "") > (mine.lastLoginDate || "")) mine.lastLoginDate = incoming.lastLoginDate;
  if((incoming.lastStudyDate || "") > (mine.lastStudyDate || "")) mine.lastStudyDate = incoming.lastStudyDate;

  if(sameDay){
    mine.daily.earned = Math.max(mine.daily.earned, incoming.daily.earned);
    mine.daily.keys = [...new Set([...mine.daily.keys, ...incoming.daily.keys])].slice(-400);
    Object.keys(incoming.daily.groups || {}).forEach(k => {
      mine.daily.groups[k] = Math.max(Number(mine.daily.groups[k]) || 0, Number(incoming.daily.groups[k]) || 0);
    });
    Object.keys(incoming.daily.reasons || {}).forEach(k => {
      mine.daily.reasons[k] = Math.max(Number(mine.daily.reasons[k]) || 0, Number(incoming.daily.reasons[k]) || 0);
    });
    mine.doneDailyMissions = [...new Set([...mine.doneDailyMissions, ...incoming.doneDailyMissions])];
  }
  if(incoming.weekly.week === mine.weekly.week){
    Object.keys(incoming.weekly.reasons || {}).forEach(k => {
      mine.weekly.reasons[k] = Math.max(Number(mine.weekly.reasons[k]) || 0, Number(incoming.weekly.reasons[k]) || 0);
    });
    mine.weekly.missions = [...new Set([...mine.weekly.missions, ...incoming.weekly.missions])];
  }

  // 履歴は「同じidは1件」で新しい順にマージする
  const byId = new Map();
  [...mine.ledger, ...incoming.ledger].forEach(e => { if(e && e.id && !byId.has(e.id)) byId.set(e.id, e); });
  mine.ledger = [...byId.values()].sort((a, b) => String(b.at || "").localeCompare(String(a.at || ""))).slice(0, BP_LEDGER_MAX);

  const after = JSON.stringify([mine.total, mine.lifetime, mine.daily.earned, mine.achievements.length]);
  try{ localStorage.setItem(storeKey(), JSON.stringify(mine)); }catch(e){}
  return before !== after;
}

/* =========================================================================
   付与の中核
   ========================================================================= */
function ledgerId(){ return "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function capGroupFor(reason){ return BP_CAP_GROUP[reason] || null; }

// この理由で「今あと何BPまで受け取れるか」（全体上限とグループ上限の小さい方）
export function bpRemainingFor(reason){
  const d = touch();
  const totalLeft = Math.max(0, BP_DAILY_TOTAL_CAP - d.daily.earned);
  const g = capGroupFor(reason);
  if(!g) return totalLeft;
  const cap = BP_DAILY_CAPS[g];
  if(cap === undefined) return totalLeft;
  return Math.min(totalLeft, Math.max(0, cap - (Number(d.daily.groups[g]) || 0)));
}

/* BPを付与する。戻り値 { granted, amount, reason, capped, duplicated }

   opts:
     dedupeKey … 同じ対象への二重付与を防ぐキー（当日のみ有効）
     once      … true なら dedupeKey を生涯一度きりのキーとして扱う
     note      … 履歴に残す補足（予定名など）
     gameId    … ゲーム由来の付与に紐づく一意なゲームID（不正調査用に履歴へ残す）
     silent    … true なら画面上部の通知を出さない
     skipCap   … true なら1日上限を無視する（ミッション/実績ボーナス専用）  */
export function grantBP(reason, amountOverride, opts){
  const o = opts || {};
  const d = touch();
  const amountBase = (amountOverride !== undefined && amountOverride !== null)
    ? Number(amountOverride) : Number(BP_AMOUNT[reason]);
  if(!amountBase || amountBase <= 0 || !isFinite(amountBase)){
    return { granted: 0, amount: 0, reason, capped: false, duplicated: false };
  }

  // 1) 重複防止（チェックと記録を同じ同期処理内で行うので連打でも増えない）
  if(o.dedupeKey){
    if(o.once){
      if(d.onceKeys.includes(o.dedupeKey)) return { granted: 0, amount: 0, reason, capped: false, duplicated: true };
    } else if(d.daily.keys.includes(o.dedupeKey)){
      return { granted: 0, amount: 0, reason, capped: false, duplicated: true };
    }
  }

  // 2) 1日上限（ミッション・実績ボーナスは上限の外側で付与する）
  let granted = Math.round(amountBase);
  let capped = false;
  if(!o.skipCap){
    const room = bpRemainingFor(reason);
    if(room <= 0){
      // 上限に達していても「もう済んだ行動」として記録し、繰り返しを無効化する
      if(o.dedupeKey){
        if(o.once) markOnce(d, o.dedupeKey); else markDaily(d, o.dedupeKey);
        persist();
      }
      return { granted: 0, amount: Math.round(amountBase), reason, capped: true, duplicated: false };
    }
    if(granted > room){ granted = room; capped = true; }
  }

  // 3) 記録
  if(o.dedupeKey){
    if(o.once) markOnce(d, o.dedupeKey); else markDaily(d, o.dedupeKey);
  }
  d.total += granted;
  d.lifetime += granted;
  d.counts[reason] = (Number(d.counts[reason]) || 0) + 1;
  if(!o.skipCap){
    d.daily.earned += granted;
    const g = capGroupFor(reason);
    if(g) d.daily.groups[g] = (Number(d.daily.groups[g]) || 0) + granted;
  }
  d.daily.reasons[reason] = (Number(d.daily.reasons[reason]) || 0) + 1;
  d.weekly.reasons[reason] = (Number(d.weekly.reasons[reason]) || 0) + 1;
  d.ledger.unshift({
    id: ledgerId(),
    reason,
    label: BP_REASON_LABEL[reason] || reason,
    amount: granted,
    at: new Date().toISOString(),
    note: o.note || "",
    gameId: o.gameId || "",
  });
  if(d.ledger.length > BP_LEDGER_MAX) d.ledger.length = BP_LEDGER_MAX;
  persist();

  // 4) 通知＋ミッション・実績の再判定（ボーナスは上限の外側で付与）
  if(!o.silent) emitToast(BP_REASON_LABEL[reason] || "BPを獲得しました", granted, capped);
  checkMissions();
  checkAchievements();
  notifyChange();
  return { granted, amount: Math.round(amountBase), reason, capped, duplicated: false };
}

function markDaily(d, key){
  d.daily.keys.push(key);
  if(d.daily.keys.length > 400) d.daily.keys = d.daily.keys.slice(-400);
}
function markOnce(d, key){
  d.onceKeys.push(key);
  if(d.onceKeys.length > 1000) d.onceKeys = d.onceKeys.slice(-1000);
}

/* ---- 変更通知：BP画面・ステータスバーが購読して再描画する ---- */
function notifyChange(){
  try{ window.dispatchEvent(new CustomEvent("bp-changed")); }catch(e){}
}
function emitToast(label, amount, capped){
  try{ window.dispatchEvent(new CustomEvent("bp-toast", { detail: { label, amount, capped } })); }catch(e){}
}

/* =========================================================================
   ミッション・実績の判定
   ========================================================================= */
export function dailyMissionState(){
  const d = touch();
  return BP_DAILY_MISSIONS.map(m => {
    const cur = Math.min(m.need, Number(d.daily.reasons[m.reason]) || 0);
    return { ...m, cur, done: d.doneDailyMissions.includes(m.id) || cur >= m.need };
  });
}

export function weeklyMissionState(){
  const d = touch();
  return BP_WEEKLY_MISSIONS.map(m => {
    const cur = Math.min(m.need, Number(d.weekly.reasons[m.reason]) || 0);
    return { ...m, cur, done: d.weekly.missions.includes(m.id) || cur >= m.need };
  });
}

export function achievementState(){
  const d = touch();
  return BP_ACHIEVEMENTS.map(a => {
    const cur = a.kind === "total"
      ? Math.min(a.need, d.lifetime)
      : Math.min(a.need, Number(d.counts[a.reason]) || 0);
    return { ...a, cur, done: d.achievements.includes(a.id) || cur >= a.need };
  });
}

// 未達成のうち「あと少しで届くもの」を進捗率の高い順に返す
export function nextMissions(limit){
  const rows = [];
  dailyMissionState().forEach(m => { if(!m.done) rows.push({ ...m, scope: "デイリー" }); });
  weeklyMissionState().forEach(m => { if(!m.done) rows.push({ ...m, scope: "ウィークリー" }); });
  achievementState().forEach(a => { if(!a.done) rows.push({ ...a, scope: "実績" }); });
  rows.sort((a, b) => (b.cur / b.need) - (a.cur / a.need));
  return rows.slice(0, limit || 3);
}

function checkMissions(){
  const d = touch();
  let awarded = false;
  BP_DAILY_MISSIONS.forEach(m => {
    if(d.doneDailyMissions.includes(m.id)) return;
    if((Number(d.daily.reasons[m.reason]) || 0) < m.need) return;
    d.doneDailyMissions.push(m.id);
    awarded = true;
    if(m.bonus > 0){
      grantBonus(d, m.bonus, `デイリーミッション達成：${m.title}`, "dailyMission");
    }
  });
  BP_WEEKLY_MISSIONS.forEach(m => {
    if(d.weekly.missions.includes(m.id)) return;
    if((Number(d.weekly.reasons[m.reason]) || 0) < m.need) return;
    d.weekly.missions.push(m.id);
    awarded = true;
    if(m.bonus > 0){
      grantBonus(d, m.bonus, `ウィークリーミッション達成：${m.title}`, "weeklyMission");
    }
  });
  if(awarded) persist();
}

function checkAchievements(){
  const d = touch();
  let awarded = false;
  BP_ACHIEVEMENTS.forEach(a => {
    if(d.achievements.includes(a.id)) return;
    const cur = a.kind === "total" ? d.lifetime : (Number(d.counts[a.reason]) || 0);
    if(cur < a.need) return;
    d.achievements.push(a.id);
    awarded = true;
    if(a.bonus > 0) grantBonus(d, a.bonus, `実績解除：${a.title}`, "achievement");
  });
  if(awarded) persist();
}

/* ミッション・実績のボーナスは1日上限の外側で付与する（上限に張り付いた
   状態でミッションを達成しても「達成したのに何ももらえない」を避けるため）。
   達成フラグ側で二重付与を防いでいるので、ここでの重複は起きない */
function grantBonus(d, amount, label, reason){
  d.total += amount;
  d.lifetime += amount;
  d.ledger.unshift({
    id: ledgerId(), reason, label, amount,
    at: new Date().toISOString(), note: "", gameId: "",
  });
  if(d.ledger.length > BP_LEDGER_MAX) d.ledger.length = BP_LEDGER_MAX;
  emitToast(label, amount, false);
}

/* =========================================================================
   公開API：活動BPの値（core.js の totalBP() から呼ばれる）
   ========================================================================= */
export function activityBP(){
  // render()中の軽量参照なので、日付ロールオーバーの副作用を伴う touch() は
  // 使わず、保存済みの値をそのまま返す
  return load().total;
}

export function bpTodayEarned(){ return touch().daily.earned; }
export function bpDailyCap(){ return BP_DAILY_TOTAL_CAP; }
export function bpLedger(){ return touch().ledger; }
export function bpLifetime(){ return touch().lifetime; }
export function bpLoginStreak(){ return touch().loginStreak; }
export function bpStudyStreak(){ return touch().studyStreak; }

/* =========================================================================
   公開API：各行動からの付与
   ここより下は「既存機能から呼ばれる入口」。重複防止キーの作り方を
   呼び出し側に任せず、この層で必ず組み立てる。
   ========================================================================= */

// 🌅 アプリへの初回ログイン（1日1回）＋連続ログインボーナス
export function bpOnDailyLogin(){
  const d = touch();
  const today = bpTodayKey();
  if(d.lastLoginDate === today) return;
  const yesterday = addDaysKey(today, -1);
  d.loginStreak = (d.lastLoginDate === yesterday) ? d.loginStreak + 1 : 1;
  d.bestLoginStreak = Math.max(d.bestLoginStreak, d.loginStreak);
  d.lastLoginDate = today;
  persist();

  grantBP("dailyLogin", null, { dedupeKey: `login:${today}` });

  // 連続ログインボーナス（節目ちょうどの日に1回だけ）。途切れても
  // 減点や強い注意表示は行わず、記録が1から再開するだけ
  const milestones = [[3, "streak3"], [7, "streak7"], [14, "streak14"], [30, "streak30"]];
  milestones.forEach(([days, reason]) => {
    if(d.loginStreak === days) grantBP(reason, null, { dedupeKey: `${reason}:${today}` });
  });
}

// 📅 カレンダーへ予定を登録
export function bpOnScheduleAdded(scheduleId){
  grantBP("scheduleAdd", null, { dedupeKey: `schedadd:${bpTodayKey()}:${scheduleId}` });
}

// ✅ 登録した予定を完了（同じ予定の同じ日は1回だけ）
export function bpOnScheduleCompleted(dateKey, scheduleId, title){
  grantBP("scheduleDone", null, {
    dedupeKey: `scheddone:${dateKey}:${scheduleId}`,
    once: true,
    note: title || "",
  });
}

// ✅ タスクを1件完了（同じタスクの同じ日は1回だけ。チェックを外して
//    付け直しても再付与されない）
export function bpOnTaskCompleted(dateKey, taskId, title){
  grantBP("taskDone", null, {
    dedupeKey: `task:${dateKey}:${taskId}`,
    once: true,
    note: title || "",
  });
}

// 🎉 その日のタスクをすべて完了（1日1回）
export function bpOnAllTasksCompleted(dateKey){
  grantBP("allTasksDone", null, { dedupeKey: `taskall:${dateKey}`, once: true });
}

// 📘 学習記録を登録（演習・試験・復習を1回終える）＋連続学習ボーナス
export function bpOnStudyLogged(logId, note){
  const d = touch();
  const today = bpTodayKey();
  if(d.lastStudyDate !== today){
    const yesterday = addDaysKey(today, -1);
    d.studyStreak = (d.lastStudyDate === yesterday) ? d.studyStreak + 1 : 1;
    d.lastStudyDate = today;
    persist();
    if(d.studyStreak === 7) grantBP("studyStreak7", null, { dedupeKey: `studystreak7:${today}` });
  }
  grantBP("studyLog", null, { dedupeKey: `studylog:${today}:${logId}`, note: note || "" });
}

// 📰 ニュースを1件確認（同じ記事は同日1回だけ）
export function bpOnNewsRead(articleKey, title){
  grantBP("newsRead", null, { dedupeKey: `news:${bpTodayKey()}:${articleKey}`, note: title || "" });
}

// 🐾 チャッピーのお世話（ごはん・なでる等。行動種別ごとに同日1回）
export function bpOnChappyCare(kind){
  grantBP("chappyCare", null, { dedupeKey: `chappycare:${bpTodayKey()}:${kind || "care"}` });
}

// 🏠 チャッピーハウスの初回達成（生涯一度きり）
export function bpOnChappyFirst(kind){
  const map = {
    feed: "chappyFirstFeed",
    clean: "chappyFirstClean",
    dressUp: "chappyFirstDressUp",
    furniture: "chappyFirstFurniture",
  };
  const reason = map[kind];
  if(!reason) return;
  grantBP(reason, null, { dedupeKey: `chappyfirst:${kind}`, once: true });
}

// 🏠 チャッピーのレベルアップ（レベルごとに一度きり）
export function bpOnChappyLevelUp(level){
  grantBP("chappyLevelUp", null, { dedupeKey: `chappylv:${level}`, once: true });
}

// 🏠 なかよし度が一定値に到達（しきい値ごとに一度きり）
export function bpOnChappyBond(threshold){
  grantBP("chappyBond", null, { dedupeKey: `chappybond:${threshold}`, once: true });
}

// 🎏 季節イベントへ参加（イベントごとに一度きり）
export function bpOnChappySeasonEvent(eventId){
  grantBP("chappySeasonEvent", null, { dedupeKey: `chappyseason:${eventId}`, once: true });
}

/* ---- 週次の達成率ボーナス ----
   1週間の予定達成率80%以上 / タスク達成率100% を、週の集計から判定する。
   呼び出し側（js/bp/weekly.js）が実データから比率を出してここへ渡す */
export function bpOnWeeklyScheduleRate(weekKey, rate){
  if(rate < 0.8) return;
  grantBP("weeklySchedule80", null, { dedupeKey: `weeksched:${weekKey}`, once: true });
}
export function bpOnWeeklyTaskRate(weekKey, rate){
  if(rate < 1) return;
  grantBP("weeklyTask100", null, { dedupeKey: `weektask:${weekKey}`, once: true });
}

/* ---- 🃏 価値観ゲームの報酬 ----
   ログイン中はサーバー（/api/valuegame/reward）が付与額を判定して返し、
   その結果をこの関数で台帳へ反映する。gameId を重複防止キーにしているため、
   同じゲーム結果を二重送信しても2回目以降は加算されない。
   items: [{ reason, amount }]  */
export function bpApplyGameRewards(gameId, items, opts){
  if(!gameId || !Array.isArray(items) || !items.length) return { granted: 0 };
  const o = opts || {};
  let granted = 0;
  items.forEach(it => {
    if(!it || !it.reason) return;
    const r = grantBP(it.reason, it.amount, {
      dedupeKey: `game:${gameId}:${it.reason}`,
      once: true,
      gameId,
      note: o.note || "",
      silent: true,
    });
    granted += r.granted;
  });
  if(granted > 0) emitToast("価値観ゲームの報酬", granted, false);
  return { granted };
}
