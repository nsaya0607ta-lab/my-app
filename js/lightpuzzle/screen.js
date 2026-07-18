/* =========================================================================
   💡 ライト消しパズル：専用フルスクリーン画面（LightPuzzleScreen）
   マスをタップすると、そのマスと上下左右のライトが反転するパズルゲーム。

   このファイルの責務：ステージ選択・盤面のDOM構築とタップ処理・結果画面の
   組み立てと配線。反転ルールや最少手数の計算そのものは
   js/lightpuzzle/logic.js（DOM非依存）に委譲し、進捗・報酬の永続化は
   js/lightpuzzle/store.js に委譲する（このファイルは状態を持ちまわすだけ）。

   render()はアプリ全体の状態が変わるたびに呼ばれるため、renderLightPuzzle
   Screen()が毎回フルにDOMを作り直すと、盤面操作中の状態が壊れてしまう。
   そのため「現在マウント済みのビュー」をモジュール内で記憶し、同じビューへの
   再描画要求はスキップする（実際のDOM更新は、このモジュール自身の操作関数―
   タップ・戻す・やり直し・ヒント等―からのみ行う）。
   ========================================================================= */
import { app, go, renderStatusBar } from '../render.js';
import { lightPuzzleStageById, lightPuzzleNextStageId } from '../data/lightpuzzle-stages.js';
import { pressCell, isSolved, nextHintMove, cloneBoard, affectedIndices } from './logic.js';
import {
  lightPuzzleStageList, isStageUnlocked,
  recordAttemptStart, recordHintUsed, evaluateClear,
} from './store.js';
import { sfxToggle, sfxUndo, sfxClear, sfxCoin } from './sound.js';

let view = "select";           // "select" | ステージID(数値)
let mountedKey = null;

// ゲーム画面（ステージ内）だけで使うランタイム状態。ビュー切替のたびに初期化
let stageId = null;
let stageDef = null;
let board = [];
let pressHistory = [];         // 押したマスのインデックス履歴（1手戻すに使用）
let hintUsedThisRun = false;   // このプレイ（入室 or やり直し以降）でヒントを使ったか＝星3評価に使う
let hintIndex = null;          // 現在ハイライト中のヒント対象マス
let hintTimer = null;
let phase = "play";            // "play" | "cleared"
let flightResult = null;       // クリア時の evaluateClear() 結果

/* =========================================================================
   ステージ選択画面
   ========================================================================= */
function starsHTML(n){
  let out = "";
  for(let i = 0; i < 3; i++) out += `<span class="lp-star${i < n ? " lp-star--on" : ""}">★</span>`;
  return out;
}

function sizeLabel(size){ return `${size}×${size}`; }

function stageCardHTML({ stage, progress, unlocked }){
  if(!unlocked){
    return `
      <div class="lp-stage-card lp-stage-card--locked">
        <div class="lp-stage-num">${stage.id}</div>
        <div class="lp-stage-lock" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="9.5" rx="2"></rect><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"></path></svg>
        </div>
        <div class="lp-stage-size">${sizeLabel(stage.size)}</div>
      </div>`;
  }
  return `
    <button type="button" class="lp-stage-card${progress.cleared ? " lp-stage-card--cleared" : ""}" data-lp-stage="${stage.id}">
      <div class="lp-stage-num">${stage.id}</div>
      <div class="lp-stage-size">${sizeLabel(stage.size)}</div>
      <div class="lp-stage-stars">${starsHTML(progress.bestStars)}</div>
      ${progress.cleared ? `<div class="lp-stage-badge">クリア済み</div>` : ``}
    </button>`;
}

function buildStageSelectHTML(){
  const list = lightPuzzleStageList();
  return `
    <div class="lp-root" id="lp-root">
      <div class="lp-select">
        <div class="lp-select-head">
          <button type="button" class="lp-back" data-lp-back>← ホーム</button>
          <h2 class="lp-title">ライト消しパズル</h2>
        </div>
        <div class="lp-select-sub">マスをタップして、盤面のライトをすべて消そう</div>
        <div class="lp-stage-grid">${list.map(stageCardHTML).join("")}</div>
      </div>
    </div>`;
}

function wireStageSelect(){
  app.querySelectorAll("[data-lp-stage]").forEach(btn => {
    btn.addEventListener("click", () => showStagePlay(Number(btn.dataset.lpStage)));
  });
  const back = app.querySelector("[data-lp-back]");
  if(back) back.addEventListener("click", () => go("select"));
}

/* =========================================================================
   ゲーム画面：DOM構築
   ========================================================================= */
function buildBoardHTML(){
  const cells = board.map((lit, i) => `
    <button type="button" class="lp-cell${lit ? " lp-cell--on" : ""}" data-lp-cell="${i}" aria-pressed="${lit ? "true" : "false"}" aria-label="マス${i + 1}">
      <span class="lp-cell-bulb"></span>
    </button>`).join("");
  return `<div class="lp-board" id="lp-board" style="--lp-size:${stageDef.size}">${cells}</div>`;
}

function buildGameHTML(){
  return `
    <div class="lp-root" id="lp-root">
      <div class="lp-game">
        <div class="lp-game-head">
          <button type="button" class="lp-back" id="lp-back-game">← ステージ一覧へ戻る</button>
          <div class="lp-stage-name">ステージ${stageDef.id}　${sizeLabel(stageDef.size)}</div>
        </div>
        <div class="lp-board-wrap" id="lp-board-wrap">${buildBoardHTML()}</div>
        <div class="lp-stats" id="lp-stats">
          <div class="lp-stat"><span class="lp-stat-lab">現在の手数</span><span class="lp-stat-val" id="lp-moves-val">0</span></div>
          <div class="lp-stat"><span class="lp-stat-lab">最少手数の目安</span><span class="lp-stat-val lp-stat-val--muted">${stageDef.optimalMoves}</span></div>
        </div>
        <div class="lp-controls" id="lp-controls">
          <button type="button" class="lp-ctl-btn" id="lp-btn-undo">1手戻す</button>
          <button type="button" class="lp-ctl-btn" id="lp-btn-restart">最初からやり直す</button>
          <button type="button" class="lp-ctl-btn" id="lp-btn-hint">ヒント</button>
        </div>
        <div class="lp-result-overlay" id="lp-result-overlay" hidden></div>
      </div>
    </div>`;
}

function wireGame(){
  app.querySelector("#lp-board").addEventListener("click", onBoardClick);
  app.querySelector("#lp-back-game").addEventListener("click", () => showStageSelect());
  app.querySelector("#lp-btn-undo").addEventListener("click", onUndo);
  app.querySelector("#lp-btn-restart").addEventListener("click", onRestart);
  app.querySelector("#lp-btn-hint").addEventListener("click", onHint);
  updateStatsUI();
  updateControlButtons();
}

/* =========================================================================
   ビュー遷移
   ========================================================================= */
function currentKey(){ return view === "select" ? "select" : `play:${view}`; }

export function renderLightPuzzleScreen(){
  const key = currentKey();
  if(key === mountedKey && document.getElementById("lp-root")) return;
  mountedKey = key;
  if(view === "select"){
    app.innerHTML = buildStageSelectHTML();
    wireStageSelect();
  } else {
    app.innerHTML = buildGameHTML();
    wireGame();
  }
  window.scrollTo(0, 0);
}

function teardownHintTimer(){
  if(hintTimer){ clearTimeout(hintTimer); hintTimer = null; }
}

function showStageSelect(){
  teardownHintTimer();
  view = "select";
  stageId = null; stageDef = null;
  renderLightPuzzleScreen();
}

function startAttempt(){
  board = cloneBoard(stageDef.initialBoard);
  pressHistory = [];
  hintUsedThisRun = false;
  hintIndex = null;
  teardownHintTimer();
  phase = "play";
  flightResult = null;
  recordAttemptStart(stageId);
}

function showStagePlay(id){
  if(!isStageUnlocked(id)) return;
  view = id;
  stageId = id;
  stageDef = lightPuzzleStageById(id);
  startAttempt();
  renderLightPuzzleScreen();
}

/* =========================================================================
   盤面の再描画（フル再構築せず、既存セルのクラスだけ更新する）
   ========================================================================= */
function refreshBoardCells(animateIndices){
  const boardEl = app.querySelector("#lp-board");
  if(!boardEl) return;
  const animateSet = new Set(animateIndices || []);
  boardEl.querySelectorAll("[data-lp-cell]").forEach(btn => {
    const i = Number(btn.dataset.lpCell);
    const lit = !!board[i];
    btn.classList.toggle("lp-cell--on", lit);
    btn.setAttribute("aria-pressed", lit ? "true" : "false");
    btn.classList.toggle("lp-cell--hint", i === hintIndex);
    if(animateSet.has(i)){
      btn.classList.remove("lp-cell--flip");
      // 再度付け直すために1フレーム待つ（同じクラスの連続付与でもアニメーションを再生させるため）
      void btn.offsetWidth;
      btn.classList.add("lp-cell--flip");
    }
  });
}

function updateStatsUI(){
  const el = app.querySelector("#lp-moves-val");
  if(el) el.textContent = String(pressHistory.length);
}

function updateControlButtons(){
  const playing = phase === "play";
  const undoBtn = app.querySelector("#lp-btn-undo");
  const restartBtn = app.querySelector("#lp-btn-restart");
  const hintBtn = app.querySelector("#lp-btn-hint");
  if(undoBtn) undoBtn.disabled = !playing || pressHistory.length === 0;
  if(restartBtn) restartBtn.disabled = !playing || pressHistory.length === 0;
  if(hintBtn) hintBtn.disabled = !playing;
  const boardEl = app.querySelector("#lp-board");
  if(boardEl) boardEl.classList.toggle("lp-board--locked", !playing);
}

/* =========================================================================
   操作：タップ・1手戻す・やり直し・ヒント
   ========================================================================= */
function onBoardClick(e){
  if(phase !== "play") return;
  const btn = e.target.closest("[data-lp-cell]");
  if(!btn) return;
  const index = Number(btn.dataset.lpCell);
  applyPress(index, { recordHistory: true });
  sfxToggle();
  if(isSolved(board)){ onCleared(); return; }
  updateStatsUI();
  updateControlButtons();
}

function applyPress(index, { recordHistory }){
  const affected = affectedIndices(stageDef.size, index);
  board = pressCell(board, stageDef.size, index);
  if(recordHistory) pressHistory.push(index);
  clearHintHighlight();
  refreshBoardCells(affected);
}

function clearHintHighlight(){
  hintIndex = null;
  teardownHintTimer();
}

function onUndo(){
  if(phase !== "play" || pressHistory.length === 0) return;
  const last = pressHistory.pop();
  // 反転操作は自分自身が逆操作でもあるため、直前にタップしたマスをもう一度
  // 押すのと同じ処理で「そのマスと影響を受けた上下左右」を正しく元に戻せる
  const affected = affectedIndices(stageDef.size, last);
  board = pressCell(board, stageDef.size, last);
  clearHintHighlight();
  refreshBoardCells(affected);
  sfxUndo();
  updateStatsUI();
  updateControlButtons();
}

function onRestart(){
  if(phase === "play" && pressHistory.length === 0) return;
  startAttempt();
  refreshBoardCells([]);
  updateStatsUI();
  updateControlButtons();
  hideResultOverlay();
}

function onHint(){
  if(phase !== "play") return;
  const idx = nextHintMove(board, stageDef.size);
  if(idx == null) return;
  hintUsedThisRun = true;
  recordHintUsed(stageId);
  hintIndex = idx;
  refreshBoardCells([]);
  teardownHintTimer();
  hintTimer = setTimeout(() => { clearHintHighlight(); refreshBoardCells([]); }, 4200);
}

/* =========================================================================
   クリア判定・結果オーバーレイ
   ========================================================================= */
function onCleared(){
  if(phase === "cleared") return; // 二重発火防止
  phase = "cleared";
  clearHintHighlight();
  updateControlButtons();
  const moves = pressHistory.length;
  const result = evaluateClear(stageId, { moves, hintUsed: hintUsedThisRun });
  flightResult = { result, moves };
  updateStatsUI();
  sfxClear();
  if(result.gameCoins > 0 || result.chappyCoinsGained > 0){
    renderStatusBar();
    setTimeout(() => sfxCoin(), 260);
  }
  showResultOverlay();
}

function showResultOverlay(){
  const ov = app.querySelector("#lp-result-overlay");
  if(!ov || !flightResult) return;
  const { result, moves } = flightResult;
  const coinRow = (result.gameCoins > 0)
    ? `<div class="lp-result-row">獲得した通常コイン：+${result.gameCoins} AC</div>`
    : `<div class="lp-result-row">獲得した通常コイン：なし（受取済み）</div>`;
  const houseCoinRow = (result.chappyCoinsGained > 0)
    ? `<div class="lp-result-row">獲得したチャッピーハウスコイン：+${result.chappyCoinsGained}</div>`
    : `<div class="lp-result-row">獲得したチャッピーハウスコイン：なし（受取済み）</div>`;
  const nextId = lightPuzzleNextStageId(stageId);
  ov.innerHTML = `
    <div class="lp-result-card">
      <div class="lp-result-title">クリア！</div>
      <div class="lp-result-stars">${starsHTML(result.stars)}</div>
      <div class="lp-result-stats">
        <div class="lp-result-row">クリア手数：${moves}手</div>
        <div class="lp-result-row">最少手数の目安：${stageDef.optimalMoves}手</div>
        ${coinRow}
        ${houseCoinRow}
      </div>
      ${nextId ? `<button type="button" class="lp-result-btn lp-result-btn--primary" id="lp-btn-next">次のステージへ</button>` : `<div class="lp-result-row lp-result-row--done">全ステージクリア！</div>`}
      <button type="button" class="lp-result-btn" id="lp-btn-replay">もう一度遊ぶ</button>
      <button type="button" class="lp-result-btn" id="lp-btn-tolist">ステージ一覧へ戻る</button>
    </div>`;
  ov.hidden = false;
  const nextBtn = app.querySelector("#lp-btn-next");
  if(nextBtn) nextBtn.addEventListener("click", () => showStagePlay(nextId));
  app.querySelector("#lp-btn-replay").addEventListener("click", () => {
    startAttempt();
    refreshBoardCells([]);
    updateStatsUI();
    updateControlButtons();
    hideResultOverlay();
  });
  app.querySelector("#lp-btn-tolist").addEventListener("click", () => showStageSelect());
}

function hideResultOverlay(){
  const ov = app.querySelector("#lp-result-overlay");
  if(ov){ ov.hidden = true; ov.innerHTML = ""; }
}
