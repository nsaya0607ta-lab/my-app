/* =========================================================================
   🏠 チャッピーハウス：育成状態の管理・永続化・経験値/コイン付与ロジック

   ・保存はデジタル盆栽（旧pet.js）と同じく、ログイン中ユーザーごとに
     localStorageのキーを分ける方式（`chappy_v1::{uid}`）。画面遷移や
     再起動をまたいでも消えない。
   ・付与処理はすべてここを経由する。1日上限（CHAPPY_DAILY_CAPS）と
     重複防止キー（同じタスクIDの再チェック等）で連打・重複加算を防ぐ。
   ・日付が変わったら1日上限カウンタをリセットし、ログインボーナスと
     連続利用日数を更新する。日付はアプリ内の他機能（カレンダー等）と
     同じく端末ローカルのタイムゾーンで判定する。
   ・放置してもレベル・XP・進化が下がることはない（お腹と元気だけが
     ゆっくり減るが、下限で止まり死亡やペナルティはない）。
   ========================================================================= */
import { state } from './state.js';
import {
  CHAPPY_XP, CHAPPY_COIN, CHAPPY_DAILY_CAPS, CHAPPY_STAGES, CHAPPY_FOODS,
  CHAPPY_STAT_MAX, CHAPPY_PET_BOND_GAIN, chappyXpToNext,
} from './data/chappy-config.js';

const STORE_KEY_BASE = "chappy_v1";

function storeKey(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `${STORE_KEY_BASE}::${uid}`;
}

function todayStr(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function defaultState(){
  return {
    v: 1,
    xp: 0,
    coins: 0,
    genki: 100,
    hunger: 100,
    bond: 0,
    items: {},                 // 所持アイテム（将来のショップ用。現状ごはんは即時使用）
    totalDays: 0,              // 累計利用日数
    streak: 0,                 // 連続利用日数
    lastActiveDate: null,      // 最終利用日（YYYY-MM-DD）
    lastCareTs: 0,             // お腹・元気の自然減少の基準時刻
    daily: { date: null, xpEarned: 0, counts: {}, keys: [] }, // 1日上限・重複防止
    awardedOnce: [],           // 一度きりの付与キー（シナリオクリア等）
    points: { learn: 0, task: 0, news: 0, stocks: 0, balance: 0 }, // 分野別活動ポイント
    homeWidget: true,          // ホーム画面にまるチャピを表示するか
  };
}

function normalize(raw){
  const base = defaultState();
  if(!raw || typeof raw !== "object") return base;
  const st = { ...base, ...raw };
  st.xp = Math.max(0, Number(st.xp) || 0);
  st.coins = Math.max(0, Number(st.coins) || 0);
  st.genki = clampStat(Number(st.genki));
  st.hunger = clampStat(Number(st.hunger));
  st.bond = clampStat(Number(st.bond));
  st.totalDays = Math.max(0, Number(st.totalDays) || 0);
  st.streak = Math.max(0, Number(st.streak) || 0);
  if(!st.items || typeof st.items !== "object") st.items = {};
  if(!st.daily || typeof st.daily !== "object") st.daily = base.daily;
  st.daily = { date: st.daily.date || null, xpEarned: Number(st.daily.xpEarned) || 0,
               counts: (st.daily.counts && typeof st.daily.counts === "object") ? st.daily.counts : {},
               keys: Array.isArray(st.daily.keys) ? st.daily.keys : [] };
  if(!Array.isArray(st.awardedOnce)) st.awardedOnce = [];
  st.points = { ...base.points, ...(st.points && typeof st.points === "object" ? st.points : {}) };
  st.homeWidget = st.homeWidget !== false;
  return st;
}

function clampStat(v){
  if(isNaN(v)) return 0;
  return Math.max(0, Math.min(CHAPPY_STAT_MAX, Math.round(v)));
}

/* ---- 読み込み・保存 ---- */
let cache = null;
let identityToken;

function persist(){
  try{ localStorage.setItem(storeKey(), JSON.stringify(cache)); }catch(e){}
}

function load(){
  if(cache) return cache;
  let raw = null;
  try{ raw = JSON.parse(localStorage.getItem(storeKey()) || "null"); }catch(e){}
  cache = normalize(raw);
  return cache;
}

// ログインユーザーの切替を検知して読み直す（他機能と同じ方式）。
// 初回呼び出し時に、廃止したデジタル盆栽の旧保存キーを安全に削除する
export function chappyHandleIdentityChange(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  if(identityToken === uid) return;
  const isFirstRun = identityToken === undefined;
  identityToken = uid;
  if(isFirstRun) purgeLegacyBonsaiKeys();
  cache = null;
}

// 旧デジタル盆栽のlocalStorageキー（pet_last_active_date_v1::uid 等）を削除する。
// 残っていてもエラーにはならないが、不要データなので一度だけ掃除する
function purgeLegacyBonsaiKeys(){
  try{
    const legacy = [];
    for(let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if(k && (k.startsWith("pet_last_active_date_v1") || k.startsWith("pet_last_open_ts_v1"))) legacy.push(k);
    }
    legacy.forEach(k => localStorage.removeItem(k));
  }catch(e){}
}

/* ---- 日付ロールオーバー＋お腹/元気の自然減少 ----
   getChappy()経由のアクセスごとに軽量チェックする */
function touch(){
  const st = load();
  const today = todayStr();
  const now = Date.now();

  if(st.daily.date !== today){
    // 日付が変わった：1日上限カウンタをリセット
    st.daily = { date: today, xpEarned: 0, counts: {}, keys: [] };

    // 連続利用日数：前回利用が昨日なら+1、途切れていたら1から（減点はしない）
    if(st.lastActiveDate !== today){
      const yest = new Date(); yest.setDate(yest.getDate() - 1);
      const yestStr = `${yest.getFullYear()}-${String(yest.getMonth()+1).padStart(2,"0")}-${String(yest.getDate()).padStart(2,"0")}`;
      st.streak = (st.lastActiveDate === yestStr) ? st.streak + 1 : 1;
      st.totalDays += 1;
      st.lastActiveDate = today;

      // 1日1回の利用ボーナス
      grantXp(st, CHAPPY_XP.dailyLogin, "dailyLogin");
      // 7日連続ごとのボーナス
      if(st.streak > 0 && st.streak % 7 === 0){
        grantXp(st, CHAPPY_XP.streak7, "streak7");
        st.coins += CHAPPY_COIN.streak7;
      }
    }
    persist();
  }

  // お腹・元気の自然減少（お腹：約45分に1、元気：約90分に1。元気は40で下げ止まり、
  // なかよし度・XP・レベルは減らない＝厳しいペナルティなし）
  if(!st.lastCareTs) st.lastCareTs = now;
  const elapsedMin = (now - st.lastCareTs) / 60000;
  if(elapsedMin >= 45){
    const hungerDrop = Math.floor(elapsedMin / 45);
    const genkiDrop = Math.floor(elapsedMin / 90);
    st.hunger = Math.max(0, st.hunger - hungerDrop);
    if(st.genki > 40) st.genki = Math.max(40, st.genki - genkiDrop);
    st.lastCareTs = now;
    persist();
  }
  return st;
}

/* ---- 内部：XP付与（レベルアップ通知イベント付き） ---- */
function levelForXp(xp){
  let lv = 1, used = 0;
  while(xp - used >= chappyXpToNext(lv)){ used += chappyXpToNext(lv); lv++; }
  return { level: lv, cur: xp - used, need: chappyXpToNext(lv) };
}

function grantXp(st, amount, reason){
  if(!amount || amount <= 0) return;
  const before = levelForXp(st.xp).level;
  const stageBefore = chappyStageForXp(st.xp).key;
  st.xp += amount;
  st.daily.xpEarned += amount;
  const after = levelForXp(st.xp).level;
  const stageAfter = chappyStageForXp(st.xp).key;
  dispatch({ type: "xp", amount, reason,
             levelUp: after > before, level: after,
             stageUp: stageAfter !== stageBefore, stage: stageAfter });
}

// 画面側（育成画面・ホームウィジェット）が演出のために購読するイベント
function dispatch(detail){
  try{ window.dispatchEvent(new CustomEvent("chappy-award", { detail })); }catch(e){}
}

/* ---- 1日上限・重複防止 ---- */
function underCap(st, key){
  const cap = CHAPPY_DAILY_CAPS[key];
  if(cap === undefined) return true;
  return (st.daily.counts[key] || 0) < cap;
}
function countUp(st, key){
  st.daily.counts[key] = (st.daily.counts[key] || 0) + 1;
}
// 「同じ操作を同じ対象へ二度」防止（例：同じタスクIDの再チェック）。当日限りのキー
function dailyKeyUsed(st, key){ return st.daily.keys.includes(key); }
function markDailyKey(st, key){
  st.daily.keys.push(key);
  if(st.daily.keys.length > 300) st.daily.keys = st.daily.keys.slice(-300);
}
// 一度きり（日をまたいでも再付与しない）のキー。シナリオクリア等
function onceKeyUsed(st, key){ return st.awardedOnce.includes(key); }
function markOnceKey(st, key){
  st.awardedOnce.push(key);
  if(st.awardedOnce.length > 500) st.awardedOnce = st.awardedOnce.slice(-500);
}

/* =========================================================================
   公開API：状態の取得
   ========================================================================= */
export function getChappy(){ return touch(); }

export function chappyLevelInfo(xp){
  const info = levelForXp(xp);
  return { ...info, pct: Math.max(0, Math.min(100, Math.round(info.cur / info.need * 100))) };
}

export function chappyStageForXp(xp){
  let s = CHAPPY_STAGES[0];
  for(const st of CHAPPY_STAGES){ if(xp >= st.minXp) s = st; }
  return s;
}

export function chappyNextStage(xp){
  const cur = chappyStageForXp(xp);
  const i = CHAPPY_STAGES.indexOf(cur);
  return CHAPPY_STAGES[i + 1] || null;
}

export function isChappyHomeWidgetVisible(){ return getChappy().homeWidget; }
export function setChappyHomeWidgetVisible(on){
  const st = getChappy();
  st.homeWidget = !!on;
  persist();
}

/* =========================================================================
   公開API：活動イベントからの付与（既存機能から呼ばれる）
   ========================================================================= */

// ✅ タスクを1件完了（カレンダーの今日のタスク）。taskIdで同日重複を防ぐ
export function chappyOnTaskCompleted(dateKey, taskId){
  const st = touch();
  const key = `task:${dateKey}:${taskId}`;
  if(dailyKeyUsed(st, key)) return;
  markDailyKey(st, key);
  if(underCap(st, "taskDone")){
    countUp(st, "taskDone");
    grantXp(st, CHAPPY_XP.taskDone, "taskDone");
    st.coins += CHAPPY_COIN.taskDone;
    st.points.task += 1;
  }
  persist();
}

// ✅ Linux問題（LPIC系資格の演習・試験・復習）の正解。まとめてn問分
export function chappyOnLinuxCorrect(n){
  const st = touch();
  let granted = 0;
  for(let i = 0; i < (n || 0); i++){
    if(!underCap(st, "linuxCorrect")) break;
    countUp(st, "linuxCorrect");
    granted++;
  }
  if(granted > 0){
    grantXp(st, CHAPPY_XP.linuxCorrect * granted, "linuxCorrect");
    st.points.learn += granted;
    // Linux問題を5問正解するごとに10コイン（1日上限内の正解数で判定）
    const total = st.daily.counts.linuxCorrect || 0;
    const coinsUnits = Math.floor(total / 5) - Math.floor((total - granted) / 5);
    if(coinsUnits > 0) st.coins += CHAPPY_COIN.linuxPer5Correct * coinsUnits;
  }
  persist();
}

// ✅ Linuxシナリオを1件クリア（同じシナリオは生涯一度だけ付与）
export function chappyOnScenarioCleared(scenarioId){
  const st = touch();
  const key = `scenario:${scenarioId}`;
  if(onceKeyUsed(st, key)) return;
  markOnceKey(st, key);
  grantXp(st, CHAPPY_XP.scenarioClear, "scenarioClear");
  st.points.learn += 5;
  persist();
}

// ✅ ニュースを1件開く（同じ記事は同日1回・1日上限あり）
export function chappyOnNewsOpened(articleKey){
  const st = touch();
  const key = `news:${articleKey}`;
  if(dailyKeyUsed(st, key)) return;
  markDailyKey(st, key);
  if(underCap(st, "newsOpen")){
    countUp(st, "newsOpen");
    grantXp(st, CHAPPY_XP.newsOpen, "newsOpen");
    st.points.news += 1;
  }
  persist();
}

// ✅ 株価画面を開いた（分野別活動ポイントのみ。1日上限あり）
export function chappyOnStocksViewed(){
  const st = touch();
  if(underCap(st, "stocksView")){
    countUp(st, "stocksView");
    st.points.stocks += 1;
    persist();
  }
}

/* ---- 以下は連携元のデータ・イベントがまだ存在しない付与インターフェース。
   将来、該当機能が実装されたらそこから呼び出すだけで動く（重複防止込み）。
   架空の呼び出しやダミーデータでの付与は行わない ---- */

// 🔌 予定を1件完了（予定完了の概念が未実装のため未接続）
export function chappyOnScheduleCompleted(dateKey, scheduleId){
  const st = touch();
  const key = `sched:${dateKey}:${scheduleId}`;
  if(dailyKeyUsed(st, key)) return;
  markDailyKey(st, key);
  if(underCap(st, "scheduleDone")){
    countUp(st, "scheduleDone");
    grantXp(st, CHAPPY_XP.scheduleDone, "scheduleDone");
    st.points.task += 1;
  }
  persist();
}

// 🔌 その日の予定をすべて完了（未接続）
export function chappyOnAllSchedulesDone(dateKey){
  const st = touch();
  const key = `schedall:${dateKey}`;
  if(onceKeyUsed(st, key)) return;
  markOnceKey(st, key);
  st.coins += CHAPPY_COIN.allSchedulesDone;
  persist();
}

// 🔌 学習記録を1件登録（学習記録機能が未実装のため未接続）
export function chappyOnStudyLogAdded(logId){
  const st = touch();
  const key = `studylog:${logId}`;
  if(dailyKeyUsed(st, key)) return;
  markDailyKey(st, key);
  if(underCap(st, "studyLog")){
    countUp(st, "studyLog");
    grantXp(st, CHAPPY_XP.studyLog, "studyLog");
    st.points.learn += 1;
  }
  persist();
}

// 🔌 ニュースを1件保存（保存機能が未実装のため未接続）
export function chappyOnNewsSaved(articleKey){
  const st = touch();
  const key = `newssave:${articleKey}`;
  if(dailyKeyUsed(st, key)) return;
  markDailyKey(st, key);
  if(underCap(st, "newsSave")){
    countUp(st, "newsSave");
    grantXp(st, CHAPPY_XP.newsSave, "newsSave");
    st.points.news += 1;
  }
  persist();
}

// 🔌 資格合格記録（合格記録機能が未実装のため未接続）
export function chappyOnCertPassed(certId){
  const st = touch();
  const key = `certpass:${certId}`;
  if(onceKeyUsed(st, key)) return;
  markOnceKey(st, key);
  grantXp(st, CHAPPY_XP.certPass, "certPass");
  persist();
}

// 🔌 月間目標達成（月間目標機能が未実装のため未接続）
export function chappyOnMonthlyGoalAchieved(monthKey){
  const st = touch();
  const key = `monthgoal:${monthKey}`;
  if(onceKeyUsed(st, key)) return;
  markOnceKey(st, key);
  st.coins += CHAPPY_COIN.monthlyGoal;
  persist();
}

/* =========================================================================
   公開API：育成画面からの操作
   ========================================================================= */

// なでる：なかよし度+1（1日上限あり）。上限後もアニメーションは楽しめる
export function chappyPet(){
  const st = touch();
  let gained = 0;
  if(underCap(st, "pet")){
    countUp(st, "pet");
    st.bond = clampStat(st.bond + CHAPPY_PET_BOND_GAIN);
    gained = CHAPPY_PET_BOND_GAIN;
    persist();
  }
  return { gained, capped: gained === 0 };
}

// ごはん：コインを消費してステータスを回復する（最大値100で頭打ち）
export function chappyFeed(foodKey){
  const st = touch();
  const food = CHAPPY_FOODS.find(f => f.key === foodKey);
  if(!food) return { ok: false, msg: "不明なアイテムです。" };
  if(st.coins < food.cost) return { ok: false, msg: "コインが足りません。" };
  st.coins -= food.cost;
  st.hunger = clampStat(st.hunger + food.hunger);
  st.bond = clampStat(st.bond + food.bond);
  st.genki = clampStat(st.genki + food.genki);
  st.lastCareTs = Date.now();
  persist();
  return { ok: true, food };
}
