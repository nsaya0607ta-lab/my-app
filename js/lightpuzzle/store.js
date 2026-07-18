/* =========================================================================
   💡 ライト消しパズル：進捗・報酬の管理と永続化
   DOM操作は一切行わない（画面描画は js/lightpuzzle/screen.js 側の責務、
   反転・最少手数の計算は js/lightpuzzle/logic.js 側の責務）。

   保存方式は js/linebound/store.js（旧ボールゲーム）や js/chappy.js と同じく、
   ログイン中のユーザーIDごとにキーを分けたlocalStorage方式（サーバー同期は
   行わない。別ユーザーのデータが混ざらないのはキー分離で担保している）。

   報酬（通常コイン・チャッピーハウスコイン）の重複付与防止は、
   「初回クリア／星3達成」をステージごとに一度きりのフラグとしてここへ
   同期的に永続化することで行う。付与判定（フラグの確認→更新）と
   persist()（localStorageへの書き込み）が同一の同期処理内で完結するため、
   ボタン連打や画面の再読み込みによる二重付与は起きない（このアプリには
   サーバー側のコイン処理が無く全てローカルで完結するため、「通信の再送」に
   相当する状況＝同じクリア結果でevaluateClear()が複数回呼ばれるケースも、
   この一度きりフラグの仕組みでそのまま二重付与なく吸収できる）。
   ========================================================================= */
import { S, state } from '../state.js';
import { saveCoins } from '../core.js';
import { chappyOnLightPuzzleCleared } from '../chappy.js';
import { LIGHTPUZZLE_STAGES, lightPuzzleStageById } from '../data/lightpuzzle-stages.js';

const STORE_KEY_BASE = "lightpuzzle_v1";
const LEGACY_LINEBOUND_PREFIX = "linebound_v1"; // 旧ボールゲームの保存データ（掃除用）

function storeKey(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `${STORE_KEY_BASE}::${uid}`;
}

function defaultStageRecord(){
  return {
    cleared: false,
    bestStars: 0,
    bestMoves: null,
    attempts: 0,
    firstClearClaimed: false,
    star3Claimed: false,
    hintUsedEver: false,
    hintUseCount: 0,
  };
}

function defaultData(){
  return { v: 1, stages: {}, rewardLog: [] };
}

function normalizeStageRecord(raw){
  const base = defaultStageRecord();
  if(!raw || typeof raw !== "object") return base;
  return {
    cleared: !!raw.cleared,
    bestStars: Math.max(0, Math.min(3, Number(raw.bestStars) || 0)),
    bestMoves: (typeof raw.bestMoves === "number" && isFinite(raw.bestMoves)) ? raw.bestMoves : null,
    attempts: Math.max(0, Number(raw.attempts) || 0),
    firstClearClaimed: !!raw.firstClearClaimed,
    star3Claimed: !!raw.star3Claimed,
    hintUsedEver: !!raw.hintUsedEver,
    hintUseCount: Math.max(0, Number(raw.hintUseCount) || 0),
  };
}

function normalize(raw){
  const base = defaultData();
  if(!raw || typeof raw !== "object") return base;
  const stages = {};
  if(raw.stages && typeof raw.stages === "object"){
    Object.keys(raw.stages).forEach(k => { stages[k] = normalizeStageRecord(raw.stages[k]); });
  }
  const rewardLog = Array.isArray(raw.rewardLog) ? raw.rewardLog.slice(-100) : [];
  return { v: 1, stages, rewardLog };
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

// 旧ボールゲーム（ラインバウンド）の保存データが端末に残っていれば削除する
// （初回だけでよい単純な掃除。以後の起動では何もしない）
let legacyPurged = false;
function purgeLegacyLineBoundKeys(){
  if(legacyPurged) return;
  legacyPurged = true;
  try{
    const legacy = [];
    for(let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if(k && k.startsWith(LEGACY_LINEBOUND_PREFIX)) legacy.push(k);
    }
    legacy.forEach(k => localStorage.removeItem(k));
  }catch(e){}
}

// ログインユーザーの切替を検知して読み直す（他機能と同じ方式）
export function lightPuzzleHandleIdentityChange(){
  purgeLegacyLineBoundKeys();
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  if(identityToken === uid) return;
  identityToken = uid;
  cache = null;
}

function getRecord(stageId){
  const st = load();
  const key = String(stageId);
  if(!st.stages[key]) st.stages[key] = defaultStageRecord();
  return st.stages[key];
}

function pushRewardLog(stageId, reason, coins, houseCoins){
  const st = load();
  st.rewardLog.push({ ts: Date.now(), stageId, reason, coins, houseCoins });
  if(st.rewardLog.length > 100) st.rewardLog = st.rewardLog.slice(-100);
}

/* =========================================================================
   ステージ一覧・解放状態
   ========================================================================= */
export function isStageUnlocked(stageId){
  if(Number(stageId) === LIGHTPUZZLE_STAGES[0].id) return true;
  const idx = LIGHTPUZZLE_STAGES.findIndex(s => s.id === Number(stageId));
  if(idx <= 0) return true;
  const prev = LIGHTPUZZLE_STAGES[idx - 1];
  return !!getRecord(prev.id).cleared;
}

export function lightPuzzleStageList(){
  return LIGHTPUZZLE_STAGES.map(stage => ({
    stage,
    progress: { ...getRecord(stage.id) },
    unlocked: isStageUnlocked(stage.id),
  }));
}

export function getStageProgress(stageId){
  return { ...getRecord(stageId) };
}

/* =========================================================================
   挑戦回数・ヒント使用履歴
   ========================================================================= */
export function recordAttemptStart(stageId){
  const rec = getRecord(stageId);
  rec.attempts += 1;
  persist();
  return rec.attempts;
}

// ヒントは連続で押しても「次の1手」だけを毎回返す（正解手順を一度に見せない）。
// 生涯のヒント使用履歴（保存データの要件）として記録する。星3評価の対象外に
// なるかどうかは「今回のプレイでヒントを使ったか」で判定するため、画面側
// （js/lightpuzzle/screen.js）が別途プレイ単位のフラグを持ってevaluateClear()
// に渡す（やり直せば、次のプレイでは再びヒントなし星3を狙える）
export function recordHintUsed(stageId){
  const rec = getRecord(stageId);
  rec.hintUsedEver = true;
  rec.hintUseCount += 1;
  persist();
}

/* =========================================================================
   クリア評価・報酬付与
   ========================================================================= */
function computeStars(stage, moves, hintUsed){
  let stars = 1; // 全消灯で星1
  if(moves <= stage.star2MoveMax) stars = 2;
  if(stars >= 2 && moves <= stage.optimalMoves && !hintUsed) stars = 3;
  return stars;
}

// 全消灯達成時に1回だけ呼び出す想定。ただし同じ結果で複数回呼ばれても
// （二重発火・連打・再読み込み後の再送等）一度きりの報酬は二重付与されない
export function evaluateClear(stageId, { moves, hintUsed }){
  const stage = lightPuzzleStageById(stageId);
  const rec = getRecord(stageId);
  const stars = computeStars(stage, moves, hintUsed);

  const wasClearedBefore = rec.cleared;
  rec.cleared = true;
  rec.bestStars = Math.max(rec.bestStars, stars);
  rec.bestMoves = (rec.bestMoves == null) ? moves : Math.min(rec.bestMoves, moves);

  let gameCoins = 0, houseCoins = 0;
  let firstClearNow = false, star3Now = false;

  if(!rec.firstClearClaimed){
    rec.firstClearClaimed = true;
    gameCoins += stage.coinReward;
    houseCoins += stage.houseCoinReward;
    firstClearNow = true;
    pushRewardLog(stageId, "firstClear", stage.coinReward, stage.houseCoinReward);
  }
  if(stars >= 3 && !rec.star3Claimed){
    rec.star3Claimed = true;
    gameCoins += stage.star3CoinReward;
    houseCoins += stage.star3HouseCoinReward;
    star3Now = true;
    pushRewardLog(stageId, "star3", stage.star3CoinReward, stage.star3HouseCoinReward);
  }

  persist();

  if(gameCoins > 0){
    S.coins = (S.coins || 0) + gameCoins;
    saveCoins(S.coins);
  }
  let chappyCoinsGained = 0;
  if(firstClearNow || star3Now){
    const chappyResult = chappyOnLightPuzzleCleared(stageId, { firstClear: firstClearNow, star3: star3Now });
    chappyCoinsGained = chappyResult.coinsGained || 0;
  }

  return {
    stars, gameCoins, chappyCoinsGained,
    firstClearNow, star3Now,
    alreadyClearedBefore: wasClearedBefore,
    attempts: rec.attempts,
    hintUsed: rec.hintUsedEver,
    bestStars: rec.bestStars, bestMoves: rec.bestMoves,
  };
}
