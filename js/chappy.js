/* =========================================================================
   🏠 チャッピーハウス：育成状態の管理・永続化・付与ロジック（v2）

   コンセプトは「現実で頑張るほどチャッピーが幸せになる育成ゲーム」。
   学習・タスク・カレンダー・ニュースなどアプリ内の実際の行動が、そのまま
   経験値・コイン・ミッション達成へつながる。

   ・保存はログイン中ユーザーごとにlocalStorageのキーを分ける（`chappy_v1::{uid}`）。
     キー名は据え置きのまま、中身のスキーマだけ v1 → v2 へ自動移行する。
   ・付与処理はすべてここを経由する。1日上限（CHAPPY_DAILY_CAPS）と重複防止キー
     （同じタスクIDの再チェック等）で連打・重複加算を防ぐ。
   ・日付が変わったら1日上限カウンタとミッションをリセットし、ログインボーナスと
     連続利用日数を更新する。日付は端末ローカルのタイムゾーンで判定する。
   ・放置してもレベル・XP・進化・所持品が減ることはない。お世話ステータスは
     ゆっくり下がるが下限で止まり、「少し元気がない」程度に留まる。
   ========================================================================= */
import { state } from './state.js';
import {
  CHAPPY_XP, CHAPPY_COIN, CHAPPY_DAILY_CAPS, CHAPPY_STAGES, CHAPPY_FOODS, CHAPPY_CARES,
  CHAPPY_STAT_MAX, CHAPPY_PET_BOND_GAIN, chappyXpToNext, CHAPPY_DECAY_STATS,
  CHAPPY_ROOM_LEVELS, CHAPPY_ROOM_MAX_LEVEL, CHAPPY_ROOM_FEATURE_LV, CHAPPY_SLOTS,
} from './data/chappy-config.js';
import {
  CHAPPY_FURNITURE, CHAPPY_FURNITURE_BY_ID, CHAPPY_THEMES, CHAPPY_THEME_BY_ID,
  CHAPPY_DECOR, CHAPPY_DECOR_BY_ID, CHAPPY_DECOR_DEFAULTS,
  CHAPPY_WEAR, CHAPPY_WEAR_BY_ID, CHAPPY_WEAR_DEFAULTS, CHAPPY_WEAR_SLOTS,
  CHAPPY_BACKGROUNDS, CHAPPY_BACKGROUND_BY_ID,
  CHAPPY_GACHA_BY_KEY, CHAPPY_DUPE_COINS, CHAPPY_GACHA_TEN_DISCOUNT,
} from './data/chappy-items.js';
import {
  CHAPPY_MISSION_DEFS, CHAPPY_MISSION_COUNT, CHAPPY_MISSION_ALL_BONUS,
  CHAPPY_BADGES, CHAPPY_SEASON_EVENTS, CHAPPY_SECRET_EVENTS, CHAPPY_SECRET_BY_ID,
  CHAPPY_ALBUM_TEMPLATES,
} from './data/chappy-quests.js';
import {
  bpOnChappyBond, bpOnChappyCare, bpOnChappyFirst, bpOnChappyLevelUp, bpOnChappySeasonEvent,
} from './bp/store.js';

// 🎖️ なかよし度がこの値に達したら、一度だけBPボーナスを出す
const CHAPPY_BOND_BP_THRESHOLDS = [25, 50, 75, 100];

const STORE_KEY_BASE = "chappy_v1";
const SCHEMA_VERSION = 2;

function storeKey(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `${STORE_KEY_BASE}::${uid}`;
}

function dateStr(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function todayStr(){ return dateStr(new Date()); }

/* =========================================================================
   既定値・正規化・v1からの移行
   ========================================================================= */
function defaultState(){
  return {
    v: SCHEMA_VERSION,
    xp: 0,
    coins: 0,
    stats: { genki: 100, hunger: 100, bond: 0, clean: 100, sleep: 100, fun: 80, stress: 0 },
    decayTs: {},               // お世話ステータスごとの自然変化の基準時刻
    tickets: { furniture: 0, costume: 0, background: 0, event: 0 },
    owned: { furniture: {}, wear: {}, decor: {}, theme: {}, background: {} },
    equip: { ...CHAPPY_WEAR_DEFAULTS },
    room: {
      level: 1,
      theme: "plain",
      background: "bg-town",
      decor: { ...CHAPPY_DECOR_DEFAULTS },
      placed: { f1: {}, f2: {}, garden: {} },
    },
    missions: { date: null, list: [], allClaimed: false },
    badges: [],
    album: [],                 // 思い出アルバム { key, ts, icon, title, desc }
    talk: [],                  // 会話履歴 { ts, text }
    seenActs: [],              // 図鑑：見たことのある生活行動
    seenSecrets: [],           // 図鑑：出会った隠しイベント
    seenEvents: [],            // 図鑑：参加した季節イベント
    counters: { taskTotal: 0, newsTotal: 0, gachaTotal: 0, feedTotal: 0, petTotal: 0,
                careTotal: 0, studyTotal: 0, secretTotal: 0, furnitureBought: 0, studyMinutes: 0 },
    totalDays: 0,              // 累計利用日数
    streak: 0,                 // 連続利用日数
    bestStreak: 0,
    lastActiveDate: null,      // 最終利用日（YYYY-MM-DD）
    lastCareTs: 0,             // v1互換：お腹・元気の自然減少の基準時刻
    daily: { date: null, xpEarned: 0, counts: {}, keys: [], metrics: {} },
    awardedOnce: [],           // 一度きりの付与キー（シナリオクリア等）
    points: { learn: 0, task: 0, news: 0, stocks: 0, balance: 0, knowledge: 0 },
    homeWidget: true,          // ホーム画面にまるチャピを表示するか
    bgm: false,                // 環境音・BGM（既定はOFF。端末の自動再生制限にも配慮）
    lastEventId: null,         // 直近に参加した季節イベント
  };
}

function clampStat(v){
  const n = Number(v);
  if(isNaN(n)) return 0;
  return Math.max(0, Math.min(CHAPPY_STAT_MAX, Math.round(n)));
}

function plainObj(o){ return (o && typeof o === "object" && !Array.isArray(o)) ? o : {}; }
function strArr(a, max){ return Array.isArray(a) ? a.filter(x => typeof x === "string").slice(-(max || 500)) : []; }

function normalize(raw){
  const base = defaultState();
  if(!raw || typeof raw !== "object") return base;
  const st = { ...base, ...raw, v: SCHEMA_VERSION };

  st.xp = Math.max(0, Number(st.xp) || 0);
  st.coins = Math.max(0, Number(st.coins) || 0);

  // v1 は genki / hunger / bond をトップレベルに持っていた
  const s = { ...base.stats, ...plainObj(raw.stats) };
  if(raw.genki !== undefined && raw.stats === undefined) s.genki = Number(raw.genki);
  if(raw.hunger !== undefined && raw.stats === undefined) s.hunger = Number(raw.hunger);
  if(raw.bond !== undefined && raw.stats === undefined) s.bond = Number(raw.bond);
  Object.keys(base.stats).forEach(k => { s[k] = clampStat(s[k]); });
  st.stats = s;
  delete st.genki; delete st.hunger; delete st.bond;

  st.decayTs = plainObj(st.decayTs);
  st.tickets = { ...base.tickets, ...plainObj(st.tickets) };
  Object.keys(base.tickets).forEach(k => { st.tickets[k] = Math.max(0, Number(st.tickets[k]) || 0); });

  const owned = plainObj(st.owned);
  st.owned = {
    furniture: plainObj(owned.furniture), wear: plainObj(owned.wear),
    decor: plainObj(owned.decor), theme: plainObj(owned.theme), background: plainObj(owned.background),
  };

  st.equip = { ...base.equip, ...plainObj(st.equip) };
  CHAPPY_WEAR_SLOTS.forEach(slot => {
    const id = st.equip[slot.key];
    if(!CHAPPY_WEAR_BY_ID[id] || CHAPPY_WEAR_BY_ID[id].slot !== slot.key) st.equip[slot.key] = slot.none;
  });

  const room = plainObj(st.room);
  st.room = {
    level: Math.max(1, Math.min(CHAPPY_ROOM_MAX_LEVEL, Number(room.level) || 1)),
    theme: CHAPPY_THEME_BY_ID[room.theme] ? room.theme : "plain",
    background: CHAPPY_BACKGROUND_BY_ID[room.background] ? room.background : "bg-town",
    decor: { ...CHAPPY_DECOR_DEFAULTS, ...plainObj(room.decor) },
    placed: { f1: plainObj(plainObj(room.placed).f1), f2: plainObj(plainObj(room.placed).f2),
              garden: plainObj(plainObj(room.placed).garden) },
  };
  Object.keys(CHAPPY_DECOR_DEFAULTS).forEach(cat => {
    const id = st.room.decor[cat];
    if(!CHAPPY_DECOR_BY_ID[id] || CHAPPY_DECOR_BY_ID[id].cat !== cat) st.room.decor[cat] = CHAPPY_DECOR_DEFAULTS[cat];
  });
  // 存在しない家具ID・存在しないマスの掃除（データ更新後も壊れないように）
  Object.keys(st.room.placed).forEach(fk => {
    const slots = new Set((CHAPPY_SLOTS[fk] || []).map(x => x.id));
    Object.keys(st.room.placed[fk]).forEach(slotId => {
      const fid = st.room.placed[fk][slotId];
      if(!slots.has(slotId) || !CHAPPY_FURNITURE_BY_ID[fid]) delete st.room.placed[fk][slotId];
    });
  });

  const ms = plainObj(st.missions);
  st.missions = {
    date: ms.date || null,
    list: Array.isArray(ms.list) ? ms.list.filter(m => m && CHAPPY_MISSION_DEFS.some(d => d.id === m.id)) : [],
    allClaimed: !!ms.allClaimed,
  };

  st.badges = strArr(st.badges, 200);
  st.album = Array.isArray(st.album) ? st.album.filter(a => a && a.key).slice(-200) : [];
  st.talk = Array.isArray(st.talk) ? st.talk.filter(t => t && t.text).slice(-60) : [];
  st.seenActs = strArr(st.seenActs, 100);
  st.seenSecrets = strArr(st.seenSecrets, 50);
  st.seenEvents = strArr(st.seenEvents, 50);

  st.counters = { ...base.counters, ...plainObj(st.counters) };
  Object.keys(base.counters).forEach(k => { st.counters[k] = Math.max(0, Number(st.counters[k]) || 0); });

  st.totalDays = Math.max(0, Number(st.totalDays) || 0);
  st.streak = Math.max(0, Number(st.streak) || 0);
  st.bestStreak = Math.max(Number(st.bestStreak) || 0, st.streak);

  const d = plainObj(st.daily);
  st.daily = {
    date: d.date || null,
    xpEarned: Number(d.xpEarned) || 0,
    counts: plainObj(d.counts),
    keys: Array.isArray(d.keys) ? d.keys : [],
    metrics: plainObj(d.metrics),
  };
  if(!Array.isArray(st.awardedOnce)) st.awardedOnce = [];
  st.points = { ...base.points, ...plainObj(st.points) };
  st.homeWidget = st.homeWidget !== false;
  st.bgm = st.bgm === true;
  return st;
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

// 旧デジタル盆栽のlocalStorageキー（pet_last_active_date_v1::uid 等）を削除する
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

/* =========================================================================
   時間帯・季節・開催中イベント
   ========================================================================= */
export function chappyTimeSlot(d){
  const h = (d || new Date()).getHours();
  if(h >= 5 && h < 10) return "morning";
  if(h >= 10 && h < 16) return "noon";
  if(h >= 16 && h < 19) return "evening";
  return "night";
}

export function chappySeason(d){
  const m = (d || new Date()).getMonth() + 1;
  if(m >= 3 && m <= 5) return "spring";
  if(m >= 6 && m <= 8) return "summer";
  if(m >= 9 && m <= 11) return "autumn";
  return "winter";
}

// 日付が [from, to] の期間内か（12月→2月のように年をまたぐ期間にも対応）
function inRange(d, from, to){
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  const f = from[0] * 100 + from[1];
  const t = to[0] * 100 + to[1];
  return f <= t ? (md >= f && md <= t) : (md >= f || md <= t);
}

export function chappyCurrentEvent(d){
  const now = d || new Date();
  return CHAPPY_SEASON_EVENTS.find(ev => inRange(now, ev.from, ev.to)) || null;
}

/* =========================================================================
   レベル・成長段階
   ========================================================================= */
function levelForXp(xp){
  let lv = 1, used = 0;
  while(xp - used >= chappyXpToNext(lv)){ used += chappyXpToNext(lv); lv++; }
  return { level: lv, cur: xp - used, need: chappyXpToNext(lv) };
}

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

/* =========================================================================
   お部屋のスコア（家具・内装の可愛さ／快適度）と「おしゃれ」の自動計算
   ========================================================================= */
export function chappyRoomScore(st){
  const s = st || load();
  let cute = 0, comfort = 0, count = 0;
  Object.values(s.room.placed).forEach(floor => {
    Object.values(floor).forEach(fid => {
      const f = CHAPPY_FURNITURE_BY_ID[fid];
      if(!f) return;
      cute += f.cute; comfort += f.comfort; count++;
    });
  });
  Object.keys(s.room.decor).forEach(cat => {
    const d = CHAPPY_DECOR_BY_ID[s.room.decor[cat]];
    if(d) cute += (d.cute || 0);
  });
  return { cute, comfort, count };
}

export function chappyStyleScore(st){
  const s = st || load();
  let wear = 0;
  CHAPPY_WEAR_SLOTS.forEach(slot => {
    const w = CHAPPY_WEAR_BY_ID[s.equip[slot.key]];
    if(w) wear += (w.cute || 0);
  });
  const room = chappyRoomScore(s);
  return clampStat(wear * 3.2 + room.cute * 1.1);
}

// 快適度が高いほどステータスの減りがゆっくりになる（最大1.6倍もつ）
function comfortFactor(st){
  const c = chappyRoomScore(st).comfort;
  return 1 + Math.min(0.6, c / 60);
}

// 表示用：おしゃれを含めた全ステータス
export function chappyStats(st){
  const s = st || getChappy();
  return { ...s.stats, style: chappyStyleScore(s) };
}

/* =========================================================================
   日付ロールオーバー＋お世話ステータスの自然変化
   getChappy()経由のアクセスごとに軽量チェックする
   ========================================================================= */
function touch(){
  const st = load();
  const today = todayStr();
  const now = Date.now();
  let dirty = false;

  if(st.daily.date !== today){
    // 日付が変わった：1日上限カウンタとミッションをリセット
    st.daily = { date: today, xpEarned: 0, counts: {}, keys: [], metrics: {} };
    st.missions = { date: null, list: [], allClaimed: false };

    // 連続利用日数：前回利用が昨日なら+1、途切れていたら1から（減点はしない）
    if(st.lastActiveDate !== today){
      const yest = new Date(); yest.setDate(yest.getDate() - 1);
      st.streak = (st.lastActiveDate === dateStr(yest)) ? st.streak + 1 : 1;
      st.bestStreak = Math.max(st.bestStreak, st.streak);
      st.totalDays += 1;
      st.lastActiveDate = today;

      grantXp(st, CHAPPY_XP.dailyLogin, "dailyLogin");
      if(st.streak > 0 && st.streak % 7 === 0){
        grantXp(st, CHAPPY_XP.streak7, "streak7");
        st.coins += CHAPPY_COIN.streak7;
        addAlbum(st, `streak:${st.streak}`, "streak", st.streak);
      }
      // 記念日（100日ごと）をアルバムへ
      if(st.totalDays > 0 && st.totalDays % 100 === 0) addAlbum(st, `days:${st.totalDays}`, "days", st.totalDays);
    }
    dirty = true;
  }

  // ミッションの生成（その日はじめてのアクセス時）
  if(st.missions.date !== today){
    st.missions = { date: today, list: buildMissions(today, st), allClaimed: false };
    dirty = true;
  }
  // 「アプリを開く」は、ここまで来た時点でその日の達成とする
  if(!st.daily.metrics.login){ track(st, "login"); dirty = true; }

  // 開催中の季節イベントを図鑑へ記録
  const ev = chappyCurrentEvent();
  if(ev && !st.seenEvents.includes(ev.id)){
    st.seenEvents.push(ev.id);
    st.lastEventId = ev.id;
    addAlbum(st, `event:${ev.id}:${new Date().getFullYear()}`, "event", ev.name);
    chappyOnSeasonEventJoined(ev.id);   // 🎖️ イベント参加のBP（イベントごとに一度きり）
    dirty = true;
  }

  // お世話ステータスの自然変化（下限で止まり、極端なペナルティはない）
  const factor = comfortFactor(st);
  CHAPPY_DECAY_STATS.forEach(def => {
    const base = st.decayTs[def.key] || st.lastCareTs || now;
    const per = def.decayMin * factor * 60000;
    const steps = Math.floor((now - base) / per);
    if(steps <= 0){ if(!st.decayTs[def.key]){ st.decayTs[def.key] = base; dirty = true; } return; }
    st.decayTs[def.key] = base + steps * per;
    const cur = st.stats[def.key];
    if(def.invert){
      // ストレスは「上がっていく」。ただし上限は70までで、つらすぎにはしない
      st.stats[def.key] = Math.min(70, cur + steps);
    } else {
      st.stats[def.key] = Math.max(def.floor, cur - steps);
    }
    dirty = true;
  });
  st.lastCareTs = now;

  if(dirty) persist();
  return st;
}

/* =========================================================================
   内部：XP付与（レベルアップ通知イベント付き）
   ========================================================================= */
function grantXp(st, amount, reason){
  if(!amount || amount <= 0) return;
  const before = levelForXp(st.xp).level;
  const stageBefore = chappyStageForXp(st.xp).key;
  st.xp += amount;
  st.daily.xpEarned += amount;
  const after = levelForXp(st.xp).level;
  const stageAfter = chappyStageForXp(st.xp);
  const levelUp = after > before;
  const stageUp = stageAfter.key !== stageBefore;

  if(levelUp && after % 10 === 0) addAlbum(st, `lv:${after}`, "levelUp", after);
  if(stageUp) addAlbum(st, `stage:${stageAfter.key}`, "stageUp", stageAfter.name);
  if(levelUp || stageUp) evaluateBadges(st);

  // 🎖️ チャッピーのレベルが上がったら総合ランクのBPも少し入る
  // （レベルごとに一度きり。付与判定は js/bp/store.js 側）
  if(levelUp){
    for(let lv = before + 1; lv <= after; lv++){
      try{ bpOnChappyLevelUp(lv); }catch(e){}
    }
  }

  dispatch({ type: "xp", amount, reason, levelUp, level: after, stageUp, stage: stageAfter.key });
}

// 🎖️ なかよし度がしきい値を越えたら一度だけBPを付与する
function checkBondBp(st){
  CHAPPY_BOND_BP_THRESHOLDS.forEach(th => {
    if(st.stats.bond >= th){ try{ bpOnChappyBond(th); }catch(e){} }
  });
}

// 画面側（育成画面・ホームウィジェット）が演出のために購読するイベント
function dispatch(detail){
  try{ window.dispatchEvent(new CustomEvent("chappy-award", { detail })); }catch(e){}
}
function dispatchChange(kind){
  try{ window.dispatchEvent(new CustomEvent("chappy-change", { detail: { kind } })); }catch(e){}
}

/* ---- 1日上限・重複防止 ---- */
function underCap(st, key){
  const cap = CHAPPY_DAILY_CAPS[key];
  if(cap === undefined) return true;
  return (st.daily.counts[key] || 0) < cap;
}
function countUp(st, key, n){
  st.daily.counts[key] = (st.daily.counts[key] || 0) + (n || 1);
}
function dailyKeyUsed(st, key){ return st.daily.keys.includes(key); }
function markDailyKey(st, key){
  st.daily.keys.push(key);
  if(st.daily.keys.length > 300) st.daily.keys = st.daily.keys.slice(-300);
}
function onceKeyUsed(st, key){ return st.awardedOnce.includes(key); }
function markOnceKey(st, key){
  st.awardedOnce.push(key);
  if(st.awardedOnce.length > 500) st.awardedOnce = st.awardedOnce.slice(-500);
}

/* =========================================================================
   ミッション（毎日入れ替わる）
   その日のうちは同じ内容が出るよう、日付＋ユーザーIDから決まる擬似乱数で選ぶ
   ========================================================================= */
function seededRandom(seedStr){
  let h = 2166136261;
  for(let i = 0; i < seedStr.length; i++){ h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  return function(){
    h += 0x6D2B79F5; let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildMissions(dateKey, st){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  const rnd = seededRandom(`${dateKey}::${uid}`);
  const always = CHAPPY_MISSION_DEFS.filter(m => m.always);
  const pool = CHAPPY_MISSION_DEFS.filter(m => !m.always);
  // フィッシャー–イェーツで並べ替え（同じ metric が重ならないように選ぶ）
  for(let i = pool.length - 1; i > 0; i--){
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = [...always];
  const usedMetric = new Set(always.map(m => m.metric));
  for(const m of pool){
    if(picked.length >= CHAPPY_MISSION_COUNT) break;
    if(usedMetric.has(m.metric)) continue;
    usedMetric.add(m.metric);
    picked.push(m);
  }
  return picked.map(m => ({ id: m.id, claimed: false }));
}

// ミッション用のカウンター。既存機能からの各種フックが呼ぶ
function track(st, metric, n){
  if(!metric) return;
  st.daily.metrics[metric] = (st.daily.metrics[metric] || 0) + (n || 1);
}

export function chappyMissions(){
  const st = touch();
  return st.missions.list.map(entry => {
    const def = CHAPPY_MISSION_DEFS.find(d => d.id === entry.id);
    if(!def) return null;
    const progress = Math.min(def.target, st.daily.metrics[def.metric] || 0);
    return { ...def, progress, done: progress >= def.target, claimed: !!entry.claimed };
  }).filter(Boolean);
}

export function chappyMissionSummary(){
  const list = chappyMissions();
  const claimable = list.filter(m => m.done && !m.claimed).length;
  return { total: list.length, done: list.filter(m => m.done).length, claimable, allClaimed: list.length > 0 && list.every(m => m.claimed) };
}

export function chappyClaimMission(missionId){
  const st = touch();
  const entry = st.missions.list.find(e => e.id === missionId);
  const def = CHAPPY_MISSION_DEFS.find(d => d.id === missionId);
  if(!entry || !def) return { ok: false, msg: "ミッションが見つかりません。" };
  if(entry.claimed) return { ok: false, msg: "受け取り済みです。" };
  const progress = st.daily.metrics[def.metric] || 0;
  if(progress < def.target) return { ok: false, msg: "まだ達成していません。" };

  entry.claimed = true;
  const gained = applyReward(st, def.reward);
  st.stats.fun = clampStat(st.stats.fun + 3);

  // その日のミッションを全部受け取ったらボーナス
  let bonus = null;
  if(!st.missions.allClaimed && st.missions.list.every(e => e.claimed)){
    st.missions.allClaimed = true;
    bonus = applyReward(st, CHAPPY_MISSION_ALL_BONUS);
  }
  evaluateBadges(st);
  persist();
  dispatchChange("mission");
  return { ok: true, gained, bonus, def };
}

// 報酬（コイン・XP・ガチャ券・アイテム）をまとめて適用する
function applyReward(st, reward){
  const out = { coins: 0, xp: 0, tickets: {}, items: [] };
  if(!reward) return out;
  if(reward.coins){ st.coins += reward.coins; out.coins += reward.coins; }
  if(reward.xp){ grantXp(st, reward.xp, "reward"); out.xp += reward.xp; }
  if(reward.ticket){
    const k = reward.ticket.key, n = reward.ticket.n || 1;
    if(st.tickets[k] !== undefined){ st.tickets[k] += n; out.tickets[k] = (out.tickets[k] || 0) + n; }
  }
  if(reward.item){
    const id = reward.item;
    if(CHAPPY_FURNITURE_BY_ID[id]){ st.owned.furniture[id] = true; out.items.push(CHAPPY_FURNITURE_BY_ID[id]); }
    else if(CHAPPY_WEAR_BY_ID[id]){ st.owned.wear[id] = true; out.items.push(CHAPPY_WEAR_BY_ID[id]); }
  }
  return out;
}

/* =========================================================================
   バッジ・アルバム
   ========================================================================= */
function addAlbum(st, key, templateKey, arg1, arg2){
  if(st.album.some(a => a.key === key)) return null;
  const tpl = CHAPPY_ALBUM_TEMPLATES[templateKey];
  if(!tpl) return null;
  const entry = {
    key, ts: Date.now(), icon: tpl.icon,
    title: typeof tpl.title === "function" ? tpl.title(arg1) : tpl.title,
    desc: typeof tpl.desc === "function" ? tpl.desc(arg2 !== undefined ? arg2 : arg1) : tpl.desc,
  };
  st.album.push(entry);
  if(st.album.length > 200) st.album = st.album.slice(-200);
  try{ window.dispatchEvent(new CustomEvent("chappy-album", { detail: entry })); }catch(e){}
  return entry;
}

function countOwned(map){ return Object.keys(map || {}).filter(k => map[k]).length; }

function evaluateBadges(st){
  const level = levelForXp(st.xp).level;
  const stage = chappyStageForXp(st.xp).key;
  const stageIdx = CHAPPY_STAGES.findIndex(s => s.key === stage);
  const got = [];
  CHAPPY_BADGES.forEach(b => {
    if(st.badges.includes(b.id)) return;
    const c = b.cond || {};
    let ok = true;
    if(c.streak !== undefined && st.bestStreak < c.streak) ok = false;
    if(c.totalDays !== undefined && st.totalDays < c.totalDays) ok = false;
    if(c.level !== undefined && level < c.level) ok = false;
    if(c.stage !== undefined){
      const need = CHAPPY_STAGES.findIndex(s => s.key === c.stage);
      if(stageIdx < need) ok = false;
    }
    if(c.roomLevel !== undefined && st.room.level < c.roomLevel) ok = false;
    if(c.furnitureOwned !== undefined && countOwned(st.owned.furniture) < c.furnitureOwned) ok = false;
    if(c.wearOwned !== undefined && countOwned(st.owned.wear) < c.wearOwned) ok = false;
    if(c.pointsLearn !== undefined && st.points.learn < c.pointsLearn) ok = false;
    if(c.taskTotal !== undefined && st.counters.taskTotal < c.taskTotal) ok = false;
    if(c.newsTotal !== undefined && st.counters.newsTotal < c.newsTotal) ok = false;
    if(c.gachaTotal !== undefined && st.counters.gachaTotal < c.gachaTotal) ok = false;
    if(c.secretSeen !== undefined && st.seenSecrets.length < c.secretSeen) ok = false;
    if(!ok) return;
    st.badges.push(b.id);
    addAlbum(st, `badge:${b.id}`, "badge", b.name, b.desc);
    got.push(b);
  });
  if(got.length){
    try{ window.dispatchEvent(new CustomEvent("chappy-badge", { detail: { badges: got } })); }catch(e){}
  }
  return got;
}

export function chappyBadges(){
  const st = touch();
  return CHAPPY_BADGES.map(b => ({ ...b, owned: st.badges.includes(b.id) }));
}

export function chappyAlbum(){
  return touch().album.slice().sort((a, b) => b.ts - a.ts);
}

export function chappyTalkLog(){
  return touch().talk.slice().reverse();
}

// 吹き出しに出したセリフを会話履歴として残す（図鑑から読み返せる）
export function chappyRecordTalk(text){
  if(!text) return;
  const st = load();
  const last = st.talk[st.talk.length - 1];
  if(last && last.text === text && Date.now() - last.ts < 60000) return;
  st.talk.push({ ts: Date.now(), text });
  if(st.talk.length > 60) st.talk = st.talk.slice(-60);
  persist();
}

/* =========================================================================
   公開API：状態の取得
   ========================================================================= */
export function getChappy(){ return touch(); }

export function isChappyHomeWidgetVisible(){ return getChappy().homeWidget; }
export function setChappyHomeWidgetVisible(on){
  const st = getChappy();
  st.homeWidget = !!on;
  persist();
}

export function isChappyBgmOn(){ return getChappy().bgm; }
export function setChappyBgm(on){
  const st = getChappy();
  st.bgm = !!on;
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
  track(st, "taskDone");
  st.counters.taskTotal += 1;
  if(underCap(st, "taskDone")){
    countUp(st, "taskDone");
    grantXp(st, CHAPPY_XP.taskDone, "taskDone");
    st.coins += CHAPPY_COIN.taskDone;
    st.points.task += 1;
    st.stats.fun = clampStat(st.stats.fun + 2);
    st.stats.stress = clampStat(st.stats.stress - 3);
  }
  evaluateBadges(st);
  persist();
}

/* ✅ 演習・試験を1回やりきった（js/core.js の採点処理から呼ばれる）
   ・vendor が lpic なら従来どおり正解数ぶんのXPも付く（1日上限つき）
   ・学習時間（分）に応じたXPと、ミッション用のカウンターも一緒に処理する    */
export function chappyOnStudySession({ vendor, certId, correct, minutes } = {}){
  const st = touch();
  const n = Math.max(0, Number(correct) || 0);
  const mins = Math.max(0, Math.round(Number(minutes) || 0));

  // 正解数ぶんの付与（LPIC系は従来の linuxCorrect の枠を使う）
  if(vendor === "lpic" && n > 0) awardLinuxCorrect(st, n);
  track(st, vendor === "lpic" ? "lpicCorrect" : "azureCorrect", n);

  // セッション単位のごほうび
  if(underCap(st, "studySession")){
    countUp(st, "studySession");
    grantXp(st, CHAPPY_XP.studySession, "studySession");
    st.coins += CHAPPY_COIN.studySession;
  }
  track(st, "studySession");
  st.counters.studyTotal += 1;

  // 学習時間ボーナス（1日60分まで）
  if(mins > 0){
    const already = st.daily.counts.studyMinute || 0;
    const usable = Math.max(0, Math.min(mins, CHAPPY_DAILY_CAPS.studyMinute - already));
    if(usable > 0){
      countUp(st, "studyMinute", usable);
      grantXp(st, CHAPPY_XP.studyMinute * usable, "studyMinute");
    }
    track(st, "studyMinutes", mins);
    st.counters.studyMinutes += mins;
  }

  st.points.learn += Math.max(1, Math.round(n / 2));
  st.points.knowledge += Math.max(1, Math.round(n / 3));
  st.stats.stress = clampStat(st.stats.stress - 4);
  st.stats.bond = clampStat(st.stats.bond + 1);
  evaluateBadges(st);
  persist();
  dispatch({ type: "study", reason: "studySession", certId, correct: n, minutes: mins });
}

function awardLinuxCorrect(st, n){
  let granted = 0;
  for(let i = 0; i < n; i++){
    if(!underCap(st, "linuxCorrect")) break;
    countUp(st, "linuxCorrect");
    granted++;
  }
  if(granted <= 0) return;
  grantXp(st, CHAPPY_XP.linuxCorrect * granted, "linuxCorrect");
  st.points.learn += granted;
  // Linux問題を5問正解するごとに10コイン（1日上限内の正解数で判定）
  const total = st.daily.counts.linuxCorrect || 0;
  const units = Math.floor(total / 5) - Math.floor((total - granted) / 5);
  if(units > 0) st.coins += CHAPPY_COIN.linuxPer5Correct * units;
}

// ✅ Linux問題の正解（既存の呼び出し互換）
export function chappyOnLinuxCorrect(n){
  const st = touch();
  awardLinuxCorrect(st, Math.max(0, Number(n) || 0));
  track(st, "lpicCorrect", Math.max(0, Number(n) || 0));
  persist();
}

// ✅ Linuxシナリオを1件クリア（同じシナリオは生涯一度だけ付与）
export function chappyOnScenarioCleared(scenarioId){
  const st = touch();
  track(st, "scenario");
  const key = `scenario:${scenarioId}`;
  if(onceKeyUsed(st, key)){ persist(); return; }
  markOnceKey(st, key);
  grantXp(st, CHAPPY_XP.scenarioClear, "scenarioClear");
  st.points.learn += 5;
  evaluateBadges(st);
  persist();
}

// ✅ ニュースを1件開く（同じ記事は同日1回・1日上限あり）
export function chappyOnNewsOpened(articleKey){
  const st = touch();
  const key = `news:${articleKey}`;
  if(dailyKeyUsed(st, key)) return;
  markDailyKey(st, key);
  track(st, "newsOpen");
  st.counters.newsTotal += 1;
  if(underCap(st, "newsOpen")){
    countUp(st, "newsOpen");
    grantXp(st, CHAPPY_XP.newsOpen, "newsOpen");
    st.points.news += 1;
    st.points.knowledge += 1;   // 🧠 知識ポイント
  }
  evaluateBadges(st);
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

// ✅ ライト消しパズル：ステージクリア
export function chappyOnLightPuzzleCleared(stageId, { firstClear, star3 } = {}){
  const st = touch();
  track(st, "lightpuzzle");
  let coinsGained = 0;
  if(firstClear){
    const key = `lightpuzzle:first:${stageId}`;
    if(!onceKeyUsed(st, key)){
      markOnceKey(st, key);
      grantXp(st, CHAPPY_XP.lightpuzzleFirstClear, "lightpuzzleFirstClear");
      st.coins += CHAPPY_COIN.lightpuzzleFirstClear;
      coinsGained += CHAPPY_COIN.lightpuzzleFirstClear;
    }
  }
  if(star3){
    const key = `lightpuzzle:star3:${stageId}`;
    if(!onceKeyUsed(st, key)){
      markOnceKey(st, key);
      grantXp(st, CHAPPY_XP.lightpuzzleStar3, "lightpuzzleStar3");
      st.coins += CHAPPY_COIN.lightpuzzleStar3;
      coinsGained += CHAPPY_COIN.lightpuzzleStar3;
    }
  }
  st.stats.fun = clampStat(st.stats.fun + 3);
  persist();
  return { coinsGained };
}

// ✅ 予定を1件完了
export function chappyOnScheduleCompleted(dateKey, scheduleId){
  const st = touch();
  const key = `sched:${dateKey}:${scheduleId}`;
  if(dailyKeyUsed(st, key)) return;
  markDailyKey(st, key);
  track(st, "scheduleDone");
  if(underCap(st, "scheduleDone")){
    countUp(st, "scheduleDone");
    grantXp(st, CHAPPY_XP.scheduleDone, "scheduleDone");
    st.points.task += 1;
    st.stats.genki = clampStat(st.stats.genki + 3);
  }
  persist();
}

// ✅ その日の予定をすべて完了
export function chappyOnAllSchedulesDone(dateKey){
  const st = touch();
  const key = `schedall:${dateKey}`;
  if(onceKeyUsed(st, key)) return;
  markOnceKey(st, key);
  st.coins += CHAPPY_COIN.allSchedulesDone;
  persist();
}

// ✅ カレンダーに予定を1件登録
export function chappyOnCalendarAdded(scheduleId){
  const st = touch();
  const key = `caladd:${scheduleId}`;
  if(dailyKeyUsed(st, key)) return;
  markDailyKey(st, key);
  track(st, "calendarAdd");
  if(underCap(st, "calendarAdd")){
    countUp(st, "calendarAdd");
    grantXp(st, CHAPPY_XP.calendarAdd, "calendarAdd");
    st.coins += CHAPPY_COIN.calendarAdd;
    st.points.task += 1;
  }
  persist();
}

// ✅ Googleカレンダーと同期できた（1日1回のボーナス）
export function chappyOnGoogleSyncDone(){
  const st = touch();
  track(st, "gcalSync");
  if(underCap(st, "gcalSync")){
    countUp(st, "gcalSync");
    grantXp(st, CHAPPY_XP.gcalSync, "gcalSync");
    st.coins += CHAPPY_COIN.gcalSync;
    st.stats.fun = clampStat(st.stats.fun + 2);
  }
  persist();
}

// ✅ 学習記録を1件登録
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

// ✅ ニュースを1件保存
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

// ✅ 資格合格記録
export function chappyOnCertPassed(certId){
  const st = touch();
  const key = `certpass:${certId}`;
  if(onceKeyUsed(st, key)) return;
  markOnceKey(st, key);
  grantXp(st, CHAPPY_XP.certPass, "certPass");
  evaluateBadges(st);
  persist();
}

// ✅ 月間目標達成
export function chappyOnMonthlyGoalAchieved(monthKey){
  const st = touch();
  const key = `monthgoal:${monthKey}`;
  if(onceKeyUsed(st, key)) return;
  markOnceKey(st, key);
  st.coins += CHAPPY_COIN.monthlyGoal;
  persist();
}

/* =========================================================================
   公開API：お世話
   ========================================================================= */
function applyEffect(st, effect){
  Object.keys(effect || {}).forEach(k => {
    if(st.stats[k] === undefined) return;
    st.stats[k] = clampStat(st.stats[k] + effect[k]);
  });
}

// なでる：なかよし度+1（1日上限あり）。上限後もアニメーションは楽しめる
export function chappyPet(){
  const st = touch();
  let gained = 0;
  track(st, "pet");
  st.counters.petTotal += 1;
  if(underCap(st, "pet")){
    countUp(st, "pet");
    st.stats.bond = clampStat(st.stats.bond + CHAPPY_PET_BOND_GAIN);
    st.stats.stress = clampStat(st.stats.stress - 2);
    gained = CHAPPY_PET_BOND_GAIN;
    // 🎖️ お世話としてのBP（種別ごとに同日1回・1日上限あり）
    try{ bpOnChappyCare("pet"); }catch(e){}
  }
  persist();
  checkBondBp(st);
  return { gained, capped: gained === 0 };
}

// ごはん：コインを消費してステータスを回復する（最大値100で頭打ち）
export function chappyFeed(foodKey){
  const st = touch();
  const food = CHAPPY_FOODS.find(f => f.key === foodKey);
  if(!food) return { ok: false, msg: "不明なアイテムです。" };
  if(st.coins < food.cost) return { ok: false, msg: "コインが足りません。" };
  st.coins -= food.cost;
  applyEffect(st, food.effect);
  track(st, "feed");
  st.counters.feedTotal += 1;
  Object.keys(st.decayTs).forEach(k => { st.decayTs[k] = Date.now(); });
  persist();
  // 🎖️ お世話としてのBP（同日1回）＋はじめてのごはんは一度きりのボーナス
  try{
    bpOnChappyFirst("feed");
    bpOnChappyCare("feed");
  }catch(e){}
  checkBondBp(st);
  return { ok: true, food };
}

// おふろ・ねかしつけ・あそぶ等のお世話（コインは不要。1日上限つき）
export function chappyCare(careKey){
  const st = touch();
  const care = CHAPPY_CARES.find(c => c.key === careKey);
  if(!care) return { ok: false, msg: "不明なお世話です。" };
  applyEffect(st, care.effect);
  track(st, "care");
  st.counters.careTotal += 1;
  let coins = 0;
  if(underCap(st, "care")){
    countUp(st, "care");
    coins = 3;
    st.coins += coins;
    st.stats.bond = clampStat(st.stats.bond + 1);
  }
  persist();
  // 🎖️ お世話としてのBP（種別ごとに同日1回・1日上限あり）。
  // おふろ・ブラッシングは「きれいにした」お世話としても数える
  try{ bpOnChappyCare(care.key); }catch(e){}
  if(care.key === "bath" || care.key === "brush") chappyOnRoomCleaned();
  checkBondBp(st);
  return { ok: true, care, coins };
}

// 生活行動（チャッピーが自分でやったこと）の効果を反映する
export function chappyApplyActivity(activity){
  if(!activity) return;
  const st = load();
  applyEffect(st, activity.effect);
  if(!st.seenActs.includes(activity.id)) st.seenActs.push(activity.id);
  persist();
}

export function chappySeenActivities(){ return touch().seenActs.slice(); }

/* =========================================================================
   公開API：所持品・ショップ
   ========================================================================= */
export function chappyOwns(kind, id){
  const st = load();
  const map = st.owned[kind];
  return !!(map && map[id]);
}

// 買える／持っている／装備できる かどうかをまとめて判定する
export function chappyItemState(kind, item){
  const st = getChappy();
  const owned = kind === "furniture" ? !!st.owned.furniture[item.id]
              : kind === "wear"      ? (!!st.owned.wear[item.id] || item.price === 0)
              : kind === "decor"     ? (!!st.owned.decor[item.id] || item.price === 0)
              : kind === "theme"     ? (!!st.owned.theme[item.id] || item.price === 0)
              : kind === "background"? (!!st.owned.background[item.id] || item.price === 0)
              : false;
  const buyable = !owned && typeof item.price === "number" && item.price > 0;
  const roomOk = item.reqRoomLv === undefined || st.room.level >= item.reqRoomLv;
  return { owned, buyable, roomOk, afford: st.coins >= (item.price || 0) };
}

function itemByKind(kind, id){
  if(kind === "furniture") return CHAPPY_FURNITURE_BY_ID[id];
  if(kind === "wear") return CHAPPY_WEAR_BY_ID[id];
  if(kind === "decor") return CHAPPY_DECOR_BY_ID[id];
  if(kind === "theme") return CHAPPY_THEME_BY_ID[id];
  if(kind === "background") return CHAPPY_BACKGROUND_BY_ID[id];
  return null;
}

export function chappyBuy(kind, id){
  const st = touch();
  const item = itemByKind(kind, id);
  if(!item) return { ok: false, msg: "そのアイテムは見つかりません。" };
  if(typeof item.price !== "number") return { ok: false, msg: "これはガチャでしか手に入りません。" };
  if(st.owned[kind] && st.owned[kind][id]) return { ok: false, msg: "すでに持っています。" };
  if(item.reqRoomLv !== undefined && st.room.level < item.reqRoomLv){
    return { ok: false, msg: `お部屋レベル${item.reqRoomLv}で解放されます。` };
  }
  if(st.coins < item.price) return { ok: false, msg: "コインが足りません。" };

  st.coins -= item.price;
  st.owned[kind][id] = true;
  if(kind === "furniture"){
    st.counters.furnitureBought += 1;
    if(st.counters.furnitureBought === 1) addAlbum(st, "firstBuy", "firstBuy", null, item.name);
  }
  st.stats.fun = clampStat(st.stats.fun + 3);
  evaluateBadges(st);
  persist();
  // 🎖️ はじめて家具をむかえた／はじめて着せ替えたときの一度きりのBP
  if(kind === "furniture") chappyOnFurniturePurchased();
  dispatchChange("shop");
  return { ok: true, item };
}

/* =========================================================================
   公開API：お部屋（レベルアップ・模様がえ・家具の配置）
   ========================================================================= */
export function chappyRoomInfo(){
  const st = getChappy();
  const cur = CHAPPY_ROOM_LEVELS.find(r => r.level === st.room.level) || CHAPPY_ROOM_LEVELS[0];
  const next = CHAPPY_ROOM_LEVELS.find(r => r.level === st.room.level + 1) || null;
  const lv = levelForXp(st.xp).level;
  return {
    level: st.room.level, cur, next,
    chappyLevel: lv,
    canUpgrade: !!next && lv >= next.reqLv && st.coins >= next.cost,
    reason: !next ? "最大レベルです" : (lv < next.reqLv ? `チャッピーがLv.${next.reqLv}になると増築できます`
           : (st.coins < next.cost ? "コインが足りません" : "")),
    score: chappyRoomScore(st),
  };
}

export function chappyUpgradeRoom(){
  const st = touch();
  const next = CHAPPY_ROOM_LEVELS.find(r => r.level === st.room.level + 1);
  if(!next) return { ok: false, msg: "これ以上は広くできません。" };
  const lv = levelForXp(st.xp).level;
  if(lv < next.reqLv) return { ok: false, msg: `チャッピーがLv.${next.reqLv}になると増築できます。` };
  if(st.coins < next.cost) return { ok: false, msg: "コインが足りません。" };
  st.coins -= next.cost;
  st.room.level = next.level;
  st.stats.fun = clampStat(st.stats.fun + 8);
  st.stats.stress = clampStat(st.stats.stress - 8);
  addAlbum(st, `room:${next.level}`, "roomLevel", next.level, next.unlock);
  evaluateBadges(st);
  persist();
  dispatchChange("room");
  return { ok: true, next };
}

// そのフロアで使えるマス（部屋レベルで先頭から解放される）
export function chappySlots(floorKey){
  const st = getChappy();
  const conf = CHAPPY_ROOM_LEVELS.find(r => r.level === st.room.level) || CHAPPY_ROOM_LEVELS[0];
  const n = (conf.slots || {})[floorKey] || 0;
  return (CHAPPY_SLOTS[floorKey] || []).slice(0, n);
}

export function chappyFloorUnlocked(floorKey){
  const st = getChappy();
  if(floorKey === "f2") return st.room.level >= CHAPPY_ROOM_FEATURE_LV.f2;
  if(floorKey === "garden") return st.room.level >= CHAPPY_ROOM_FEATURE_LV.garden;
  return true;
}

export function chappyRoomFeatureUnlocked(feature){
  return getChappy().room.level >= (CHAPPY_ROOM_FEATURE_LV[feature] || 1);
}

// 家具をマスへ置く（同じ家具は1か所にしか置けない）
export function chappyPlaceFurniture(floorKey, slotId, furnitureId){
  const st = touch();
  const f = CHAPPY_FURNITURE_BY_ID[furnitureId];
  const slot = (CHAPPY_SLOTS[floorKey] || []).find(s => s.id === slotId);
  if(!f || !slot) return { ok: false, msg: "置けませんでした。" };
  if(!st.owned.furniture[furnitureId]) return { ok: false, msg: "まだ持っていません。" };
  if(!chappySlots(floorKey).some(s => s.id === slotId)) return { ok: false, msg: "このマスはまだ解放されていません。" };
  if(f.place !== slot.kind) return { ok: false, msg: placeMismatchMsg(f.place) };
  // 別の場所に置いてある場合は移動として扱う
  Object.keys(st.room.placed).forEach(fk => {
    Object.keys(st.room.placed[fk]).forEach(sid => {
      if(st.room.placed[fk][sid] === furnitureId) delete st.room.placed[fk][sid];
    });
  });
  st.room.placed[floorKey][slotId] = furnitureId;
  track(st, "roomEdit");
  st.stats.fun = clampStat(st.stats.fun + 1);
  persist();
  dispatchChange("room");
  return { ok: true, item: f };
}

function placeMismatchMsg(place){
  if(place === "wall") return "これは壁にかける家具です。";
  if(place === "hang") return "これは吊るす家具です。";
  return "これは床に置く家具です。";
}

export function chappyRemoveFurniture(floorKey, slotId){
  const st = touch();
  if(!st.room.placed[floorKey] || !st.room.placed[floorKey][slotId]) return { ok: false };
  delete st.room.placed[floorKey][slotId];
  track(st, "roomEdit");
  persist();
  dispatchChange("room");
  return { ok: true };
}

// いま置かれている家具のID一覧（生活行動の判定に使う）
export function chappyPlacedFurnitureIds(){
  const st = getChappy();
  const ids = [];
  Object.values(st.room.placed).forEach(floor => Object.values(floor).forEach(id => ids.push(id)));
  return ids;
}

export function chappySetTheme(themeId){
  const st = touch();
  const theme = CHAPPY_THEME_BY_ID[themeId];
  if(!theme) return { ok: false, msg: "そのテーマはありません。" };
  if(theme.price > 0 && !st.owned.theme[themeId]) return { ok: false, msg: "まだ持っていません。" };
  if(st.room.level < (theme.reqRoomLv || 1)) return { ok: false, msg: `お部屋レベル${theme.reqRoomLv}で解放されます。` };
  st.room.theme = themeId;
  track(st, "roomEdit");
  persist();
  dispatchChange("room");
  return { ok: true, theme };
}

export function chappySetDecor(cat, decorId){
  const st = touch();
  const d = CHAPPY_DECOR_BY_ID[decorId];
  if(!d || d.cat !== cat) return { ok: false, msg: "そのパーツはありません。" };
  if(d.price > 0 && !st.owned.decor[decorId]) return { ok: false, msg: "まだ持っていません。" };
  if(!chappyRoomFeatureUnlocked(cat)) return { ok: false, msg: `お部屋レベル${CHAPPY_ROOM_FEATURE_LV[cat]}で解放されます。` };
  st.room.decor[cat] = decorId;
  track(st, "roomEdit");
  persist();
  dispatchChange("room");
  return { ok: true, decor: d };
}

export function chappySetBackground(bgId){
  const st = touch();
  const bg = CHAPPY_BACKGROUND_BY_ID[bgId];
  if(!bg) return { ok: false, msg: "その背景はありません。" };
  if(bg.price !== 0 && !st.owned.background[bgId]) return { ok: false, msg: "まだ持っていません。" };
  st.room.background = bgId;
  track(st, "roomEdit");
  persist();
  dispatchChange("room");
  return { ok: true, bg };
}

/* =========================================================================
   公開API：着せ替え
   ========================================================================= */
export function chappyEquip(slotKey, wearId){
  const st = touch();
  const slot = CHAPPY_WEAR_SLOTS.find(s => s.key === slotKey);
  const w = CHAPPY_WEAR_BY_ID[wearId];
  if(!slot || !w || w.slot !== slotKey) return { ok: false, msg: "着せ替えできませんでした。" };
  if(w.price !== 0 && !st.owned.wear[wearId]) return { ok: false, msg: "まだ持っていません。" };
  const changed = st.equip[slotKey] !== wearId;
  st.equip[slotKey] = wearId;
  if(changed){
    track(st, "dressChange");
    st.stats.fun = clampStat(st.stats.fun + 2);
    if(!st.album.some(a => a.key === "firstWear") && wearId !== slot.none){
      addAlbum(st, "firstWear", "firstWear", null, w.name);
    }
  }
  persist();
  // 🎖️ 着せ替えのBP（同じ服は同日1回・はじめての着せ替えは一度きりのボーナス）
  if(changed && wearId !== slot.none) chappyOnDressUp(wearId);
  dispatchChange("wear");
  return { ok: true, wear: w };
}

export function chappyEquipped(){
  const st = getChappy();
  const out = {};
  CHAPPY_WEAR_SLOTS.forEach(s => { out[s.key] = CHAPPY_WEAR_BY_ID[st.equip[s.key]] || null; });
  return out;
}

// 装備によるちいさなボーナス（勉強・睡眠・楽しさが少し上がりやすくなる）
export function chappyWearBonus(){
  const eq = chappyEquipped();
  const out = { study: 0, sleep: 0, fun: 0 };
  Object.values(eq).forEach(w => {
    if(!w || !w.bonus) return;
    Object.keys(w.bonus).forEach(k => { if(out[k] !== undefined) out[k] += w.bonus[k]; });
  });
  return out;
}

/* =========================================================================
   公開API：ガチャ
   ========================================================================= */
function gachaPool(poolKey){
  const ev = chappyCurrentEvent();
  const season = ev ? ev.season : null;
  if(poolKey === "furniture") return CHAPPY_FURNITURE.filter(f => !f.event).map(f => ({ kind: "furniture", item: f }));
  if(poolKey === "costume")   return CHAPPY_WEAR.filter(w => !w.event && w.cute > 0).map(w => ({ kind: "wear", item: w }));
  if(poolKey === "background")return CHAPPY_BACKGROUNDS.filter(b => !b.event && b.id !== "bg-town").map(b => ({ kind: "background", item: b }));
  if(poolKey === "event"){
    if(!season) return [];
    return [
      ...CHAPPY_FURNITURE.filter(f => f.event === season).map(f => ({ kind: "furniture", item: f })),
      ...CHAPPY_WEAR.filter(w => w.event === season).map(w => ({ kind: "wear", item: w })),
      ...CHAPPY_BACKGROUNDS.filter(b => b.event === season).map(b => ({ kind: "background", item: b })),
    ];
  }
  return [];
}

export function chappyGachaInfo(poolKey){
  const st = getChappy();
  const conf = CHAPPY_GACHA_BY_KEY[poolKey];
  if(!conf) return null;
  const pool = gachaPool(poolKey);
  const owned = pool.filter(p => st.owned[p.kind] && st.owned[p.kind][p.item.id]).length;
  const ev = chappyCurrentEvent();
  return {
    ...conf, poolSize: pool.length, owned,
    available: pool.length > 0,
    tickets: st.tickets[conf.ticket] || 0,
    event: conf.eventOnly ? ev : null,
    tenCost: Math.round(conf.cost * 10 * CHAPPY_GACHA_TEN_DISCOUNT),
  };
}

function pickRarity(pool, weights, rnd){
  const present = {};
  pool.forEach(p => { present[p.item.rarity || "n"] = true; });
  const keys = Object.keys(weights).filter(k => present[k]);
  const total = keys.reduce((a, k) => a + weights[k], 0);
  if(total <= 0) return keys[0] || "n";
  let r = rnd() * total;
  for(const k of keys){ r -= weights[k]; if(r <= 0) return k; }
  return keys[keys.length - 1];
}

function pullOne(st, pool, weights, rnd, forceMin){
  let rarity = pickRarity(pool, weights, rnd);
  if(forceMin && rarity === "n"){
    const better = pool.filter(p => p.item.rarity && p.item.rarity !== "n");
    if(better.length) rarity = pickRarity(better, weights, rnd);
  }
  let candidates = pool.filter(p => (p.item.rarity || "n") === rarity);
  if(!candidates.length) candidates = pool;
  const got = candidates[Math.floor(rnd() * candidates.length)];
  const already = !!(st.owned[got.kind] && st.owned[got.kind][got.item.id]);
  if(already){
    const back = CHAPPY_DUPE_COINS[got.item.rarity || "n"] || 20;
    st.coins += back;
    return { ...got, dupe: true, coins: back };
  }
  st.owned[got.kind][got.item.id] = true;
  if(got.kind === "furniture"){
    st.counters.furnitureBought += 1;
    chappyOnFurniturePurchased();   // 🎖️ はじめて家具をむかえたときの一度きりのBP
  }
  return { ...got, dupe: false, coins: 0 };
}

// times は 1 か 10。ガチャ券があれば1回ぶんはコインの代わりに券を使う
export function chappyGachaPull(poolKey, times){
  const st = touch();
  const conf = CHAPPY_GACHA_BY_KEY[poolKey];
  if(!conf) return { ok: false, msg: "そのガチャはありません。" };
  const pool = gachaPool(poolKey);
  if(!pool.length) return { ok: false, msg: conf.eventOnly ? "いまは開催中のイベントがありません。" : "いま引けるものがありません。" };

  const n = times === 10 ? 10 : 1;
  let useTicket = false;
  let cost = n === 10 ? Math.round(conf.cost * 10 * CHAPPY_GACHA_TEN_DISCOUNT) : conf.cost;
  if(n === 1 && (st.tickets[conf.ticket] || 0) > 0){ useTicket = true; cost = 0; }
  if(st.coins < cost) return { ok: false, msg: "コインが足りません。" };

  if(useTicket) st.tickets[conf.ticket] -= 1;
  st.coins -= cost;

  const rnd = Math.random;
  const results = [];
  for(let i = 0; i < n; i++){
    // 10連は最後の1回でレア以上が確定する
    results.push(pullOne(st, pool, conf.weights, rnd, n === 10 && i === n - 1));
  }
  st.counters.gachaTotal += n;
  track(st, "gacha", n);
  st.stats.fun = clampStat(st.stats.fun + 4);

  const best = results.reduce((a, b) => rarityRank(b.item.rarity) > rarityRank(a.item.rarity) ? b : a, results[0]);
  if(best && best.item.rarity === "ssr" && !best.dupe) addAlbum(st, `ssr:${best.item.id}`, "gachaSSR", null, best.item.name);
  evaluateBadges(st);
  persist();
  dispatchChange("gacha");
  return { ok: true, results, best, usedTicket: useTicket, cost };
}

function rarityRank(r){ return { n: 0, r: 1, sr: 2, ssr: 3 }[r || "n"] || 0; }

/* =========================================================================
   公開API：隠しイベント（⑮）
   部屋を開いているあいだ、js/chappyLife.js が一定間隔で判定を回す
   ========================================================================= */
export function chappyRollSecret(){
  const slot = chappyTimeSlot();
  const isNight = slot === "night";
  for(const ev of CHAPPY_SECRET_EVENTS){
    if(ev.night && !isNight) continue;
    if(ev.day && isNight) continue;
    // 望遠鏡を置いていると流れ星が見つけやすくなる
    let chance = ev.chance;
    if(ev.id === "shootingstar" && chappyPlacedFurnitureIds().includes("telescope")) chance *= 2.2;
    if(Math.random() < chance) return ev;
  }
  return null;
}

export function chappyClaimSecret(secretId){
  const st = touch();
  const ev = CHAPPY_SECRET_BY_ID[secretId];
  if(!ev) return { ok: false };
  const gained = applyReward(st, ev.reward);
  st.counters.secretTotal += 1;
  st.stats.fun = clampStat(st.stats.fun + 5);
  if(!st.seenSecrets.includes(ev.id)){
    st.seenSecrets.push(ev.id);
    addAlbum(st, `secret:${ev.id}`, "secret", ev.name);
  }
  evaluateBadges(st);
  persist();
  dispatchChange("secret");
  return { ok: true, ev, gained };
}

export function chappySeenSecrets(){ return touch().seenSecrets.slice(); }

/* =========================================================================
   公開API：図鑑のまとめ（⑪）
   ========================================================================= */
export function chappyCollection(){
  const st = getChappy();
  const countKind = (list, map) => ({ owned: list.filter(i => map[i.id]).length, total: list.length });
  return {
    furniture:  countKind(CHAPPY_FURNITURE, st.owned.furniture),
    wear:       countKind(CHAPPY_WEAR.filter(w => w.cute > 0), st.owned.wear),
    decor:      countKind(CHAPPY_DECOR.filter(d => d.price > 0), st.owned.decor),
    theme:      countKind(CHAPPY_THEMES.filter(t => t.price > 0), st.owned.theme),
    background: countKind(CHAPPY_BACKGROUNDS.filter(b => b.price !== 0), st.owned.background),
    badges:     { owned: st.badges.length, total: CHAPPY_BADGES.length },
    activities: { owned: st.seenActs.length, total: 0 },   // total は呼び出し側で補う
    secrets:    { owned: st.seenSecrets.length, total: CHAPPY_SECRET_EVENTS.length },
    events:     { owned: st.seenEvents.length, total: CHAPPY_SEASON_EVENTS.length },
  };
}

// 「現実のがんばり」の集計（図鑑のトップに出す）
export function chappyRealLifeSummary(){
  const st = getChappy();
  return {
    totalDays: st.totalDays, streak: st.streak, bestStreak: st.bestStreak,
    studyTotal: st.counters.studyTotal, studyMinutes: st.counters.studyMinutes,
    taskTotal: st.counters.taskTotal, newsTotal: st.counters.newsTotal,
    knowledge: st.points.knowledge, points: { ...st.points },
  };
}

/* =========================================================================
   🎖️ 総合ランクのBPへの受け渡し口。

   以前は「該当機能が未実装のため未接続」の入口だったが、部屋をきれいにする
   お世話・着せ替え・家具の入手・季節イベントがすべて実装されたので、この
   ファイル内の該当処理から実際に呼び出している。付与が1回だけかどうかの
   判定は js/bp/store.js 側が持っているため、二重付与にはならない。
   ========================================================================= */

// お部屋・チャッピーをきれいにした（おふろ・ブラッシングのお世話から）
export function chappyOnRoomCleaned(){
  try{ bpOnChappyFirst("clean"); bpOnChappyCare("clean"); }catch(e){}
}

// 着せ替えをした（chappyEquip から）
export function chappyOnDressUp(itemId){
  try{ bpOnChappyFirst("dressUp"); bpOnChappyCare("dressUp:" + (itemId || "")); }catch(e){}
}

// 家具を手に入れた（ショップの購入・ガチャの当たりから）
export function chappyOnFurniturePurchased(){
  try{ bpOnChappyFirst("furniture"); }catch(e){}
}

// 季節イベントへ参加した（開催中のイベントをその年はじめて見た日に）
export function chappyOnSeasonEventJoined(eventId){
  if(!eventId) return;
  try{ bpOnChappySeasonEvent(eventId); }catch(e){}
}
