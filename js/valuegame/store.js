/* =========================================================================
   🃏 チャッピーの価値観ゲーム：戦績・履歴・称号の永続化

   DOM操作は行わない（画面は screen.js、AIの回答生成は solo.js の責務）。
   保存はアプリ内の他機能と同じく、ログイン中のユーザーIDごとにキーを
   分けたlocalStorage方式。users/{uid}.valueGame へもマージ同期して
   機種をまたいで引き継ぐ。

   ゲーム結果の記録は必ず一意のゲームID（gameId）を伴う。同じ結果を
   二重に送っても2回目以降は無視されるため、通信の再送・二重タップ・
   画面の再読み込みで戦績や称号が二重に増えることはない。
   ========================================================================= */
import { state } from '../state.js';
import { VG_TITLES } from './config.js';

const STORE_KEY_BASE = "valuegame_v1";
const HISTORY_MAX = 60;
const RECORDED_MAX = 200;

function storeKey(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `${STORE_KEY_BASE}::${uid}`;
}

function defaultData(){
  return {
    v: 1,
    plays: 0,            // プレイ回数（完了したゲーム数）
    wins: 0,             // 成功回数（協力モードのクリア）
    soloPlays: 0,
    soloWins: 0,
    winStreak: 0,        // 現在の連続成功数
    bestWinStreak: 0,
    perfects: 0,         // パーフェクト成功数（ライフを1つも失わずクリア）
    peopleMet: 0,        // 一緒に遊んだのべ人数
    metUids: [],         // 一緒に遊んだ実プレイヤーのUID（重複を除いた交流人数）
    topicCounts: {},     // お題ごとのプレイ回数
    answers: [],         // 自分の回答履歴 [{topicId,topicTitle,number,answer,at}]
    bpEarned: 0,         // このゲームで獲得した累計BP
    titles: [],          // 獲得済みの称号ID
    history: [],         // ゲーム履歴（新しい順）
    recordedGameIds: [], // 記録済みゲームID（二重集計の防止）
    lastWinDate: null,   // 本日の初勝利判定用（YYYY-MM-DD）
    updatedAt: "",
  };
}

function normalize(raw){
  const base = defaultData();
  if(!raw || typeof raw !== "object") return base;
  const d = { ...base, ...raw };
  ["plays", "wins", "soloPlays", "soloWins", "winStreak", "bestWinStreak", "perfects", "peopleMet", "bpEarned"]
    .forEach(k => { d[k] = Math.max(0, Number(d[k]) || 0); });
  d.metUids = Array.isArray(d.metUids) ? [...new Set(d.metUids)].slice(-500) : [];
  d.topicCounts = (d.topicCounts && typeof d.topicCounts === "object") ? { ...d.topicCounts } : {};
  d.answers = Array.isArray(d.answers) ? d.answers.slice(0, HISTORY_MAX) : [];
  d.titles = Array.isArray(d.titles) ? [...new Set(d.titles)] : [];
  d.history = Array.isArray(d.history) ? d.history.slice(0, HISTORY_MAX) : [];
  d.recordedGameIds = Array.isArray(d.recordedGameIds) ? d.recordedGameIds.slice(-RECORDED_MAX) : [];
  d.bestWinStreak = Math.max(d.bestWinStreak, d.winStreak);
  return d;
}

let cache = null;
let identityToken;

function load(){
  if(cache) return cache;
  let raw = null;
  try{ raw = JSON.parse(localStorage.getItem(storeKey()) || "null"); }catch(e){}
  cache = normalize(raw);
  return cache;
}

function persist(){
  if(!cache) return;
  cache.updatedAt = new Date().toISOString();
  try{ localStorage.setItem(storeKey(), JSON.stringify(cache)); }catch(e){}
  pushToCloud();
}

let pushTimer = null;
function pushToCloud(){
  if(!state.db || !state.currentUserId || !window.FirebaseSync) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    try{
      window.FirebaseSync.setDoc(
        window.FirebaseSync.doc(state.db, "users", state.currentUserId),
        { valueGame: cache, updatedAt: new Date().toISOString() },
        { merge: true },
      );
    }catch(e){ console.error("valuegame cloud sync failed:", e); }
  }, 1500);
}

export function valueGameHandleIdentityChange(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  if(identityToken === uid) return false;
  identityToken = uid;
  cache = null;
  return true;
}

// db.js の onSnapshot から呼ばれる。累計は多い方、集合は和集合でマージする
export function applyCloudValueGame(payload){
  if(!payload || typeof payload !== "object") return false;
  const inc = normalize(payload);
  const mine = load();
  const before = JSON.stringify([mine.plays, mine.wins, mine.titles.length]);
  ["plays", "wins", "soloPlays", "soloWins", "bestWinStreak", "perfects", "peopleMet", "bpEarned"]
    .forEach(k => { mine[k] = Math.max(mine[k], inc[k]); });
  mine.winStreak = Math.max(mine.winStreak, inc.winStreak);
  mine.metUids = [...new Set([...mine.metUids, ...inc.metUids])].slice(-500);
  mine.titles = [...new Set([...mine.titles, ...inc.titles])];
  mine.recordedGameIds = [...new Set([...mine.recordedGameIds, ...inc.recordedGameIds])].slice(-RECORDED_MAX);
  Object.keys(inc.topicCounts).forEach(k => {
    mine.topicCounts[k] = Math.max(Number(mine.topicCounts[k]) || 0, Number(inc.topicCounts[k]) || 0);
  });
  if((inc.lastWinDate || "") > (mine.lastWinDate || "")) mine.lastWinDate = inc.lastWinDate;

  const mergeById = (a, b) => {
    const m = new Map();
    [...a, ...b].forEach(x => { if(x && x.id && !m.has(x.id)) m.set(x.id, x); });
    return [...m.values()]
      .sort((x, y) => String(y.at || "").localeCompare(String(x.at || "")))
      .slice(0, HISTORY_MAX);
  };
  mine.history = mergeById(mine.history, inc.history);
  mine.answers = mergeById(mine.answers, inc.answers);

  const after = JSON.stringify([mine.plays, mine.wins, mine.titles.length]);
  try{ localStorage.setItem(storeKey(), JSON.stringify(mine)); }catch(e){}
  return before !== after;
}

/* =========================================================================
   公開API
   ========================================================================= */
export function vgStats(){ return load(); }

export function vgHistory(){ return load().history; }

export function vgAnswerHistory(){ return load().answers; }

// 最もよく遊んだお題
export function vgFavoriteTopic(){
  const counts = load().topicCounts;
  let best = null, bestN = 0;
  Object.keys(counts).forEach(k => { if(counts[k] > bestN){ best = k; bestN = counts[k]; } });
  return best ? { topicId: best, count: bestN } : null;
}

export function vgTitleState(){
  const d = load();
  return VG_TITLES.map(t => {
    const cur = Math.min(t.need, currentValueFor(d, t.kind));
    return { ...t, cur, done: d.titles.includes(t.id) || cur >= t.need };
  });
}

function currentValueFor(d, kind){
  if(kind === "plays") return d.plays;
  if(kind === "wins") return d.wins;
  if(kind === "soloWins") return d.soloWins;
  if(kind === "perfect") return d.perfects;
  if(kind === "streak") return d.bestWinStreak;
  if(kind === "friends") return d.metUids.length || d.peopleMet;
  return 0;
}

// 今日まだ勝っていないか（本日の初勝利ボーナスの判定に使う）
export function vgIsFirstWinToday(todayKey){
  return load().lastWinDate !== todayKey;
}

export function vgAlreadyRecorded(gameId){
  return !!gameId && load().recordedGameIds.includes(gameId);
}

/* ゲーム1回ぶんの結果を記録する。

   result: {
     gameId, mode:"solo"|"online", difficulty, rounds, clearedRounds,
     success, perfect, livesLeft, players:[{uid,name,isAI}],
     topics:[topicId], myAnswers:[{topicId,topicTitle,number,answer}],
     bpGained, todayKey
   }

   戻り値 { recorded, newTitles }。同じ gameId で再度呼ばれた場合は
   recorded:false を返し、集計・称号は一切動かさない（二重集計の防止）。 */
export function vgRecordGame(result){
  const r = result || {};
  if(!r.gameId) return { recorded: false, newTitles: [] };
  const d = load();
  if(d.recordedGameIds.includes(r.gameId)) return { recorded: false, newTitles: [] };
  d.recordedGameIds.push(r.gameId);
  if(d.recordedGameIds.length > RECORDED_MAX) d.recordedGameIds = d.recordedGameIds.slice(-RECORDED_MAX);

  d.plays += 1;
  if(r.mode === "solo") d.soloPlays += 1;
  if(r.success){
    d.wins += 1;
    if(r.mode === "solo") d.soloWins += 1;
    d.winStreak += 1;
    d.bestWinStreak = Math.max(d.bestWinStreak, d.winStreak);
    if(r.todayKey) d.lastWinDate = r.todayKey;
  } else {
    d.winStreak = 0;
  }
  if(r.perfect) d.perfects += 1;
  d.bpEarned += Math.max(0, Number(r.bpGained) || 0);

  (r.players || []).forEach(p => {
    if(!p || p.isAI) return;
    if(p.uid && p.uid !== (state.currentUserId || "")){
      if(!d.metUids.includes(p.uid)){ d.metUids.push(p.uid); d.peopleMet += 1; }
    }
  });
  if(d.metUids.length > 500) d.metUids = d.metUids.slice(-500);

  (r.topics || []).forEach(tid => {
    if(!tid) return;
    d.topicCounts[tid] = (Number(d.topicCounts[tid]) || 0) + 1;
  });

  (r.myAnswers || []).forEach((a, i) => {
    if(!a || !a.answer) return;
    d.answers.unshift({
      id: `${r.gameId}-${i}`,
      topicId: a.topicId, topicTitle: a.topicTitle,
      number: a.number, answer: a.answer,
      at: new Date().toISOString(),
    });
  });
  if(d.answers.length > HISTORY_MAX) d.answers.length = HISTORY_MAX;

  d.history.unshift({
    id: r.gameId,
    mode: r.mode || "solo",
    difficulty: r.difficulty || "normal",
    rounds: Number(r.rounds) || 0,
    clearedRounds: Number(r.clearedRounds) || 0,
    success: !!r.success,
    perfect: !!r.perfect,
    livesLeft: Number(r.livesLeft) || 0,
    players: (r.players || []).length,
    bpGained: Math.max(0, Number(r.bpGained) || 0),
    at: new Date().toISOString(),
  });
  if(d.history.length > HISTORY_MAX) d.history.length = HISTORY_MAX;

  // 称号の判定（新しく達成したものだけ返す）
  const newTitles = [];
  VG_TITLES.forEach(t => {
    if(d.titles.includes(t.id)) return;
    if(currentValueFor(d, t.kind) < t.need) return;
    d.titles.push(t.id);
    newTitles.push(t);
  });

  persist();
  return { recorded: true, newTitles };
}
