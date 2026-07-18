/* =========================================================================
   🎯 ラインバウンド：進捗・インク・報酬の管理と永続化
   DOM操作は一切行わない（画面描画は js/linebound/screen.js 側の責務）。

   保存方式は js/dirxStore.js や js/chappy.js と同じく、ログイン中の
   ユーザーIDごとにキーを分けたlocalStorage方式（サーバー同期は行わない。
   このアプリの育成/探索系機能は元々すべてローカル保存のみで、別ユーザーの
   データが混ざらないのはキー分離で担保している）。

   報酬（ゲーム内コイン・チャッピーハウスコイン）の重複付与防止は、
   「初回クリア／星3達成／ヒントなしボーナス」をステージごとに一度きりの
   フラグとしてここへ同期的に永続化することで行う（chappy.jsのawardedOnce
   と同じ考え方）。付与とpersist()が同一の同期処理内で完結するため、
   連打やページ再読み込みによる二重付与は起きない。
   ========================================================================= */
import { S, state } from '../state.js';
import { saveCoins } from '../core.js';
import { chappyOnLineBoundCleared } from '../chappy.js';
import { LINEBOUND_STAGES, lineboundStageById } from '../data/linebound-stages.js';

const STORE_KEY_BASE = "linebound_v1";

function storeKey(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `${STORE_KEY_BASE}::${uid}`;
}

function defaultStageRecord(){
  return {
    cleared: false,
    bestStars: 0,
    bestTimeMs: null,
    bestInk: null,
    attempts: 0,
    firstClearClaimed: false,
    star3Claimed: false,
    noHintClaimed: false,
    hintUsedEver: false,
    lines: [],
  };
}

function defaultData(){
  return { v: 1, stages: {} };
}

function normalizeLines(raw){
  if(!Array.isArray(raw)) return [];
  return raw
    .filter(l => l && Array.isArray(l.points))
    .map(l => ({ points: l.points.filter(p => p && typeof p.x === "number" && typeof p.y === "number").map(p => ({ x: p.x, y: p.y })) }))
    .filter(l => l.points.length >= 2);
}

function normalizeStageRecord(raw){
  const base = defaultStageRecord();
  if(!raw || typeof raw !== "object") return base;
  return {
    cleared: !!raw.cleared,
    bestStars: Math.max(0, Math.min(3, Number(raw.bestStars) || 0)),
    bestTimeMs: (typeof raw.bestTimeMs === "number" && isFinite(raw.bestTimeMs)) ? raw.bestTimeMs : null,
    bestInk: (typeof raw.bestInk === "number" && isFinite(raw.bestInk)) ? raw.bestInk : null,
    attempts: Math.max(0, Number(raw.attempts) || 0),
    firstClearClaimed: !!raw.firstClearClaimed,
    star3Claimed: !!raw.star3Claimed,
    noHintClaimed: !!raw.noHintClaimed,
    hintUsedEver: !!raw.hintUsedEver,
    lines: normalizeLines(raw.lines),
  };
}

function normalize(raw){
  const base = defaultData();
  if(!raw || typeof raw !== "object") return base;
  const stages = {};
  if(raw.stages && typeof raw.stages === "object"){
    Object.keys(raw.stages).forEach(k => { stages[k] = normalizeStageRecord(raw.stages[k]); });
  }
  return { v: 1, stages };
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
  try{ localStorage.setItem(storeKey(), JSON.stringify(cache)); }catch(e){}
}

// ログインユーザーの切替を検知して読み直す（chappy.js/dirxStore.jsと同じ方式）
export function lineboundHandleIdentityChange(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  if(identityToken === uid) return;
  identityToken = uid;
  cache = null;
  sessionHints = {};
}

function getRecord(stageId){
  const st = load();
  const key = String(stageId);
  if(!st.stages[key]) st.stages[key] = defaultStageRecord();
  return st.stages[key];
}

/* =========================================================================
   ステージ一覧・解放状態
   ========================================================================= */
export function isStageUnlocked(stageId){
  if(Number(stageId) === LINEBOUND_STAGES[0].id) return true;
  const idx = LINEBOUND_STAGES.findIndex(s => s.id === Number(stageId));
  if(idx <= 0) return true;
  const prev = LINEBOUND_STAGES[idx - 1];
  return !!getRecord(prev.id).cleared;
}

export function lineboundStageList(){
  return LINEBOUND_STAGES.map(stage => ({
    stage,
    progress: { ...getRecord(stage.id) },
    unlocked: isStageUnlocked(stage.id),
  }));
}

export function getStageProgress(stageId){
  return { ...getRecord(stageId) };
}

/* =========================================================================
   線（インク）の管理：発射前だけ呼ばれる想定
   ========================================================================= */
export function lineLength(points){
  let len = 0;
  for(let i = 0; i < points.length - 1; i++){
    len += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  return len;
}

export function totalInkUsed(stageId){
  const rec = getRecord(stageId);
  return rec.lines.reduce((sum, l) => sum + lineLength(l.points), 0);
}

export function inkRemaining(stageId){
  const stage = lineboundStageById(stageId);
  if(!stage) return 0;
  return Math.max(0, stage.inkLimit - totalInkUsed(stageId));
}

export function getDraftLines(stageId){
  return getRecord(stageId).lines.map(l => ({ points: l.points.map(p => ({ ...p })) }));
}

const MIN_LINE_LENGTH = 14; // 極端に短いタップは線として登録しない

export function addDraftLine(stageId, points){
  if(!Array.isArray(points) || points.length < 2) return { ok: false, reason: "too-short" };
  const len = lineLength(points);
  if(len < MIN_LINE_LENGTH) return { ok: false, reason: "too-short" };
  const stage = lineboundStageById(stageId);
  if(!stage) return { ok: false, reason: "no-stage" };
  const used = totalInkUsed(stageId);
  if(used + len > stage.inkLimit + 0.01) return { ok: false, reason: "no-ink" };
  const rec = getRecord(stageId);
  rec.lines.push({ points: points.map(p => ({ x: p.x, y: p.y })) });
  persist();
  return { ok: true, length: len };
}

export function undoDraftLine(stageId){
  const rec = getRecord(stageId);
  if(!rec.lines.length) return false;
  rec.lines.pop();
  persist();
  return true;
}

export function removeDraftLineAt(stageId, index){
  const rec = getRecord(stageId);
  if(index < 0 || index >= rec.lines.length) return false;
  rec.lines.splice(index, 1);
  persist();
  return true;
}

export function clearDraftLines(stageId){
  const rec = getRecord(stageId);
  if(!rec.lines.length) return false;
  rec.lines = [];
  persist();
  return true;
}

/* =========================================================================
   発射・挑戦回数
   ========================================================================= */
export function recordLaunchAttempt(stageId){
  const rec = getRecord(stageId);
  rec.attempts += 1;
  persist();
  return rec.attempts;
}

/* =========================================================================
   ヒント：段階的に開示する。使用したステージは星3／ヒントなしボーナスの
   対象から生涯外れる（hintUsedEverはリトライ／再読み込みをまたいで残る）
   ========================================================================= */
let sessionHints = {}; // stageId -> このセッションで開示した件数（画面上の表示用。再入場でリセット）

export function enterStage(stageId){
  sessionHints[stageId] = sessionHints[stageId] || 0;
}

export function sessionHintCount(stageId){
  return sessionHints[stageId] || 0;
}

export function revealNextHint(stageId){
  const stage = lineboundStageById(stageId);
  if(!stage) return null;
  const cur = sessionHints[stageId] || 0;
  if(cur >= stage.hints.length) return { hint: null, exhausted: true, index: cur };
  sessionHints[stageId] = cur + 1;
  const rec = getRecord(stageId);
  rec.hintUsedEver = true;
  persist();
  return { hint: stage.hints[cur], exhausted: (cur + 1) >= stage.hints.length, index: cur };
}

export function hasUsedHintEver(stageId){
  return getRecord(stageId).hintUsedEver;
}

/* =========================================================================
   クリア評価・報酬付与
   ========================================================================= */
function computeStars(stage, rec, inkUsed){
  let stars = 1; // ゴール到達で星1
  if(inkUsed <= stage.star2InkMax) stars = 2;
  const cond = stage.star3Condition || { maxShots: 1, noHint: true };
  const noHintOk = !cond.noHint || !rec.hintUsedEver;
  const shotsOk = !cond.maxShots || rec.attempts <= cond.maxShots;
  if(stars >= 2 && noHintOk && shotsOk) stars = 3;
  return stars;
}

// ゴール到達時に1回だけ呼び出す。既に呼び出し済みの結果を再度呼んでも
// 一度きりの報酬（初回クリア／星3／ヒントなし）は二重付与されない
export function evaluateClear(stageId, { inkUsed, timeMs }){
  const stage = lineboundStageById(stageId);
  const rec = getRecord(stageId);
  const stars = computeStars(stage, rec, inkUsed);

  const wasClearedBefore = rec.cleared;
  rec.cleared = true;
  rec.bestStars = Math.max(rec.bestStars, stars);
  rec.bestTimeMs = (rec.bestTimeMs == null) ? timeMs : Math.min(rec.bestTimeMs, timeMs);
  rec.bestInk = (rec.bestInk == null) ? inkUsed : Math.min(rec.bestInk, inkUsed);

  let gameCoins = 0;
  let firstClearNow = false, star3Now = false, noHintBonusNow = false;

  if(!rec.firstClearClaimed){
    rec.firstClearClaimed = true;
    gameCoins += stage.firstClearReward.coins;
    firstClearNow = true;
  }
  if(stars >= 3 && !rec.star3Claimed){
    rec.star3Claimed = true;
    gameCoins += stage.star3Reward.coins;
    star3Now = true;
  }
  if(!rec.hintUsedEver && !rec.noHintClaimed){
    rec.noHintClaimed = true;
    gameCoins += stage.noHintReward.coins;
    noHintBonusNow = true;
  }

  persist();

  if(gameCoins > 0){
    S.coins = (S.coins || 0) + gameCoins;
    saveCoins(S.coins);
  }
  let chappyCoinsGained = 0;
  if(firstClearNow || star3Now){
    const chappyResult = chappyOnLineBoundCleared(stageId, { firstClear: firstClearNow, star3: star3Now });
    chappyCoinsGained = chappyResult.coinsGained || 0;
  }

  return {
    stars, gameCoins, chappyCoinsGained,
    firstClearNow, star3Now, noHintBonusNow,
    alreadyClearedBefore: wasClearedBefore,
    attempts: rec.attempts,
    hintUsed: rec.hintUsedEver,
    bestStars: rec.bestStars, bestTimeMs: rec.bestTimeMs, bestInk: rec.bestInk,
  };
}
