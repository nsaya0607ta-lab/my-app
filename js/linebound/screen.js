/* =========================================================================
   🎯 ラインバウンド：専用フルスクリーン画面（LineBoundScreen）
   線を引いてボールをゴールへ導く物理パズルゲーム。

   このファイルの責務：ステージ選択・お絵描き入力・物理シミュレーションの
   実行ループ・Canvas描画・結果画面のDOM構築と配線。状態そのもの（進捗・
   インク・線のデータ）は持たず、すべて js/linebound/store.js を参照する。
   物理演算そのものは js/linebound/physics.js（DOM非依存）に委譲する。

   render()はアプリ全体の状態が変わるたびに呼ばれるため、renderLineBound
   Screen()が毎回フルにDOMを作り直すと、ボール飛行中のCanvas/requestAnimation
   Frameが壊れてしまう。そのため「現在マウント済みのビュー」をモジュール内で
   記憶し、同じビューへの再描画要求はスキップする（実際のDOM更新は、このモジュール
   自身の操作関数―発射・リトライ・ヒント等―からのみ行う）。
   ========================================================================= */
import { app, go, renderStatusBar } from '../render.js';
import { S } from '../state.js';
import { esc } from '../core.js';
import { lineboundStageById, lineboundNextStageId } from '../data/linebound-stages.js';
import {
  lineboundStageList, isStageUnlocked,
  getDraftLines, addDraftLine, undoDraftLine, removeDraftLineAt, clearDraftLines,
  totalInkUsed, recordLaunchAttempt, enterStage, sessionHintCount,
  revealNextHint, evaluateClear,
} from './store.js';
import { createSimulation, launchBall, stepSimulation, obstacleRenderState, BALL_RADIUS, LINE_HALF_THICKNESS, WALL_HALF_THICKNESS, SPIKE_RADIUS } from './physics.js';
import { sfxDraw, sfxLaunch, sfxHit, sfxGoal, sfxFail, sfxCoin } from './sound.js';

const FIXED_DT = 1 / 120;
const MIN_SAMPLE_DIST = 5;     // 世界座標での最小サンプリング間隔
const TAP_MOVE_THRESHOLD = 9;  // 画面px：これ未満の移動は「タップ（選択）」扱い
const LINE_SELECT_TOLERANCE = 20; // 画面px：既存の線をタップ選択する許容距離

let view = "select";           // "select" | ステージID(数値)
let mountedKey = null;

// ゲーム画面（ステージ内）だけで使うランタイム状態。ビュー切替のたびに初期化
let stageId = null;
let stageDef = null;
let phase = "draw";            // "draw" | "flight" | "result"
let sim = null;
let previewTime = 0;
let lastTickTs = null;
let accumulator = 0;
let rafId = null;
let ro = null;
let stageEnterTs = 0;

let viewport = { scale: 1, offsetX: 0, offsetY: 0, cw: 0, ch: 0 };
let canvasEl = null, ctx2d = null, canvasWrapEl = null;

let drawingActive = false;
let strokeWorldPoints = [];
let strokeStartScreen = null;
let strokeInvalid = false;
let selectedLineIndex = null;
let hintOverlay = null;
let hintOverlayTimer = null;
let flightOutcome = null;

/* =========================================================================
   ジオメトリ・ユーティリティ
   ========================================================================= */
function dist(a, b){ return Math.hypot(a.x - b.x, a.y - b.y); }

function segDistPoint(px, py, x1, y1, x2, y2){
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy || 1e-6;
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

// 発射地点・ゴール・障害物の内部／画面外には線を引けない
function pointForbidden(wp, stage){
  const w = stage.world;
  if(wp.x < 4 || wp.x > w.w - 4 || wp.y < 4 || wp.y > w.h - 4) return true;
  if(dist(wp, stage.launch) < 34) return true;
  if(dist(wp, stage.goal) < stage.goal.r + 16) return true;
  for(const ob of stage.obstacles){
    if(ob.type === "spike"){ if(dist(wp, ob) < (ob.radius || SPIKE_RADIUS) + 14) return true; continue; }
    if(ob.x1 !== undefined){ if(segDistPoint(wp.x, wp.y, ob.x1, ob.y1, ob.x2, ob.y2) < (ob.halfThickness || WALL_HALF_THICKNESS) + 12) return true; }
  }
  return false;
}

/* =========================================================================
   画面⇔論理座標の変換
   ========================================================================= */
function recomputeViewport(){
  if(!canvasWrapEl || !stageDef) return;
  const rect = canvasWrapEl.getBoundingClientRect();
  const cw = Math.max(1, Math.round(rect.width));
  const ch = Math.max(1, Math.round(rect.height));
  const dpr = window.devicePixelRatio || 1;
  canvasEl.style.width = cw + "px";
  canvasEl.style.height = ch + "px";
  canvasEl.width = Math.round(cw * dpr);
  canvasEl.height = Math.round(ch * dpr);
  ctx2d = canvasEl.getContext("2d");
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  const scale = Math.min(cw / stageDef.world.w, ch / stageDef.world.h);
  viewport = {
    scale,
    offsetX: (cw - stageDef.world.w * scale) / 2,
    offsetY: (ch - stageDef.world.h * scale) / 2,
    cw, ch,
  };
}
function w2s(wx, wy){ return { x: viewport.offsetX + wx * viewport.scale, y: viewport.offsetY + wy * viewport.scale }; }
function s2w(sx, sy){ return { x: (sx - viewport.offsetX) / viewport.scale, y: (sy - viewport.offsetY) / viewport.scale }; }
function screenPointFromEvent(e){
  const rect = canvasEl.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

/* =========================================================================
   ステージ選択画面
   ========================================================================= */
function starsHTML(n){
  let out = "";
  for(let i = 0; i < 3; i++) out += `<span class="lb-star${i < n ? " lb-star--on" : ""}">★</span>`;
  return out;
}

function stageCardHTML({ stage, progress, unlocked }){
  if(!unlocked){
    return `
      <div class="lb-stage-card lb-stage-card--locked">
        <div class="lb-stage-num">${stage.id}</div>
        <div class="lb-stage-lock" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="9.5" rx="2"></rect><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"></path></svg>
        </div>
        <div class="lb-stage-title">${esc(stage.title)}</div>
      </div>`;
  }
  return `
    <button type="button" class="lb-stage-card${progress.cleared ? " lb-stage-card--cleared" : ""}" data-lb-stage="${stage.id}">
      <div class="lb-stage-num">${stage.id}</div>
      <div class="lb-stage-title">${esc(stage.title)}</div>
      <div class="lb-stage-stars">${starsHTML(progress.bestStars)}</div>
      ${progress.firstClearClaimed ? `<div class="lb-stage-badge">クリア済み</div>` : ``}
    </button>`;
}

function buildStageSelectHTML(){
  const list = lineboundStageList();
  return `
    <div class="lb-root" id="lb-root">
      <div class="lb-select">
        <div class="lb-select-head">
          <button type="button" class="lb-back" data-lb-back>← ホーム</button>
          <h2 class="lb-title">ラインバウンド</h2>
        </div>
        <div class="lb-select-sub">線を引いてボールをゴールへ導こう</div>
        <div class="lb-stage-grid">${list.map(stageCardHTML).join("")}</div>
      </div>
    </div>`;
}

function wireStageSelect(){
  app.querySelectorAll("[data-lb-stage]").forEach(btn => {
    btn.addEventListener("click", () => showStagePlay(Number(btn.dataset.lbStage)));
  });
  const back = app.querySelector("[data-lb-back]");
  if(back) back.addEventListener("click", () => go("select"));
}

/* =========================================================================
   ゲーム画面：DOM構築
   ========================================================================= */
function buildGameHTML(){
  return `
    <div class="lb-root" id="lb-root">
      <div class="lb-game">
        <div class="lb-game-head">
          <button type="button" class="lb-back" id="lb-back-game">← ステージ選択</button>
          <div class="lb-stage-name">ステージ${stageDef.id}　${esc(stageDef.title)}</div>
        </div>
        <div class="lb-ink-wrap">
          <span class="lb-ink-label">インク</span>
          <div class="lb-ink-bar"><div class="lb-ink-fill" id="lb-ink-fill"></div></div>
          <span class="lb-ink-num" id="lb-ink-num"></span>
        </div>
        <div class="lb-canvas-wrap" id="lb-canvas-wrap">
          <canvas id="lb-canvas"></canvas>
          <div class="lb-hint-banner" id="lb-hint-banner" hidden></div>
          <div class="lb-result-overlay" id="lb-result-overlay" hidden></div>
        </div>
        <div class="lb-controls" id="lb-controls">
          <button type="button" class="lb-ctl-btn" id="lb-btn-undo">取り消し</button>
          <button type="button" class="lb-ctl-btn" id="lb-btn-clear">すべて消す</button>
          <button type="button" class="lb-ctl-btn" id="lb-btn-hint">ヒント</button>
          <button type="button" class="lb-ctl-btn lb-ctl-btn--del" id="lb-btn-delete" hidden>選択した線を削除</button>
          <button type="button" class="lb-ctl-btn lb-ctl-btn--primary" id="lb-btn-launch">発射</button>
        </div>
      </div>
    </div>`;
}

function teardownRuntime(){
  if(rafId != null){ cancelAnimationFrame(rafId); rafId = null; }
  if(ro){ try{ ro.disconnect(); }catch(e){} ro = null; }
  if(hintOverlayTimer){ clearTimeout(hintOverlayTimer); hintOverlayTimer = null; }
  sim = null;
  lastTickTs = null;
  accumulator = 0;
}

function wireGame(){
  canvasWrapEl = app.querySelector("#lb-canvas-wrap");
  canvasEl = app.querySelector("#lb-canvas");
  canvasEl.style.touchAction = "none";

  app.querySelector("#lb-back-game").addEventListener("click", () => { teardownRuntime(); showStageSelect(); });
  app.querySelector("#lb-btn-undo").addEventListener("click", onUndo);
  app.querySelector("#lb-btn-clear").addEventListener("click", onClearAll);
  app.querySelector("#lb-btn-hint").addEventListener("click", onHint);
  app.querySelector("#lb-btn-delete").addEventListener("click", onDeleteSelected);
  app.querySelector("#lb-btn-launch").addEventListener("click", onLaunch);

  canvasEl.addEventListener("pointerdown", onPointerDown);
  canvasEl.addEventListener("pointermove", onPointerMove);
  canvasEl.addEventListener("pointerup", onPointerUp);
  canvasEl.addEventListener("pointercancel", onPointerCancel);

  if(window.ResizeObserver){
    ro = new ResizeObserver(() => { recomputeViewport(); drawFrame(); });
    ro.observe(canvasWrapEl);
  }
  window.addEventListener("orientationchange", onOrientationChange);

  recomputeViewport();
  updateInkUI();
  updateControlButtons();
  drawFrame();
  startLoop();
}
function onOrientationChange(){ setTimeout(() => { recomputeViewport(); drawFrame(); }, 60); }

/* =========================================================================
   ビュー遷移
   ========================================================================= */
function currentKey(){ return view === "select" ? "select" : `play:${view}`; }

export function renderLineBoundScreen(){
  const key = currentKey();
  if(key === mountedKey && document.getElementById("lb-root")) return;
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

function showStageSelect(){
  teardownRuntime();
  view = "select";
  stageId = null; stageDef = null;
  renderLineBoundScreen();
}

function showStagePlay(id){
  if(!isStageUnlocked(id)) return;
  teardownRuntime();
  view = id;
  stageId = id;
  stageDef = lineboundStageById(id);
  phase = "draw";
  sim = null;
  previewTime = 0;
  selectedLineIndex = null;
  hintOverlay = null;
  flightOutcome = null;
  enterStage(id);
  stageEnterTs = Date.now();
  renderLineBoundScreen();
}

/* =========================================================================
   インク・線の操作（発射前のみ）
   ========================================================================= */
function updateInkUI(){
  const fill = app.querySelector("#lb-ink-fill");
  const num = app.querySelector("#lb-ink-num");
  if(!fill || !num) return;
  const used = totalInkUsed(stageId) + strokeCurrentLength();
  const pct = Math.max(0, Math.min(100, 100 - (used / stageDef.inkLimit) * 100));
  fill.style.width = pct + "%";
  fill.classList.toggle("lb-ink-fill--low", pct < 20);
  num.textContent = `${Math.max(0, Math.round(stageDef.inkLimit - used))} / ${stageDef.inkLimit}`;
}
function strokeCurrentLength(){
  let len = 0;
  for(let i = 0; i < strokeWorldPoints.length - 1; i++) len += dist(strokeWorldPoints[i], strokeWorldPoints[i + 1]);
  return len;
}
function updateControlButtons(){
  const lines = getDraftLines(stageId);
  const undoBtn = app.querySelector("#lb-btn-undo");
  const clearBtn = app.querySelector("#lb-btn-clear");
  const delBtn = app.querySelector("#lb-btn-delete");
  const drawingPhase = phase === "draw";
  [undoBtn, clearBtn].forEach(b => { if(b) b.disabled = !drawingPhase || lines.length === 0; });
  if(delBtn) delBtn.hidden = !drawingPhase || selectedLineIndex == null;
  const launchBtn = app.querySelector("#lb-btn-launch");
  if(launchBtn) launchBtn.disabled = !drawingPhase;
  const hintBtn = app.querySelector("#lb-btn-hint");
  if(hintBtn){
    hintBtn.disabled = !drawingPhase || sessionHintCount(stageId) >= stageDef.hints.length;
    hintBtn.textContent = sessionHintCount(stageId) > 0 ? `ヒント (${sessionHintCount(stageId)}/${stageDef.hints.length})` : "ヒント";
  }
}

function onUndo(){
  if(phase !== "draw") return;
  if(undoDraftLine(stageId)){ selectedLineIndex = null; updateInkUI(); updateControlButtons(); drawFrame(); }
}
function onClearAll(){
  if(phase !== "draw") return;
  if(clearDraftLines(stageId)){ selectedLineIndex = null; updateInkUI(); updateControlButtons(); drawFrame(); }
}
function onDeleteSelected(){
  if(phase !== "draw" || selectedLineIndex == null) return;
  removeDraftLineAt(stageId, selectedLineIndex);
  selectedLineIndex = null;
  updateInkUI(); updateControlButtons(); drawFrame();
}
function onHint(){
  if(phase !== "draw") return;
  const res = revealNextHint(stageId);
  if(!res || !res.hint) return;
  hintOverlay = res.hint;
  showHintBanner(res.hint.text);
  updateControlButtons();
  drawFrame();
}
function showHintBanner(text){
  const banner = app.querySelector("#lb-hint-banner");
  if(!banner) return;
  banner.textContent = text;
  banner.hidden = false;
  if(hintOverlayTimer) clearTimeout(hintOverlayTimer);
  hintOverlayTimer = setTimeout(() => { banner.hidden = true; }, 4200);
}

/* =========================================================================
   ポインター入力（線を引く／選択する）
   ========================================================================= */
function hitTestLine(screenPt){
  const lines = getDraftLines(stageId);
  for(let li = lines.length - 1; li >= 0; li--){
    const pts = lines[li].points;
    for(let i = 0; i < pts.length - 1; i++){
      const a = w2s(pts[i].x, pts[i].y), b = w2s(pts[i + 1].x, pts[i + 1].y);
      if(segDistPoint(screenPt.x, screenPt.y, a.x, a.y, b.x, b.y) <= LINE_SELECT_TOLERANCE) return li;
    }
  }
  return null;
}

function onPointerDown(e){
  if(phase !== "draw") return;
  try{ canvasEl.setPointerCapture(e.pointerId); }catch(err){}
  e.preventDefault();
  const sp = screenPointFromEvent(e);
  strokeStartScreen = sp;
  const wp = s2w(sp.x, sp.y);
  drawingActive = true;
  strokeInvalid = pointForbidden(wp, stageDef);
  strokeWorldPoints = strokeInvalid ? [] : [wp];
}

function onPointerMove(e){
  if(!drawingActive) return;
  e.preventDefault();
  const sp = screenPointFromEvent(e);
  const wp = s2w(sp.x, sp.y);
  if(!pointForbidden(wp, stageDef)){
    const last = strokeWorldPoints[strokeWorldPoints.length - 1];
    if(!last){
      strokeWorldPoints.push(wp);
      strokeInvalid = false;
    } else if(dist(last, wp) >= MIN_SAMPLE_DIST){
      const committedUsed = totalInkUsed(stageId);
      const wouldBeLen = strokeCurrentLength() + dist(last, wp);
      if(committedUsed + wouldBeLen <= stageDef.inkLimit){
        strokeWorldPoints.push(wp);
        if(strokeWorldPoints.length % 3 === 0) sfxDraw();
      }
    }
  }
  updateInkUI();
  drawFrame();
}

function onPointerUp(e){
  if(!drawingActive) return;
  drawingActive = false;
  e.preventDefault();
  const sp = screenPointFromEvent(e);
  const moved = strokeStartScreen ? Math.hypot(sp.x - strokeStartScreen.x, sp.y - strokeStartScreen.y) : 999;
  if(moved < TAP_MOVE_THRESHOLD){
    const hit = hitTestLine(sp);
    selectedLineIndex = (hit != null && hit === selectedLineIndex) ? null : hit;
  } else if(strokeWorldPoints.length >= 2){
    const res = addDraftLine(stageId, strokeWorldPoints);
    if(res.ok) selectedLineIndex = null;
  }
  strokeWorldPoints = [];
  updateInkUI();
  updateControlButtons();
  drawFrame();
}
function onPointerCancel(){
  drawingActive = false;
  strokeWorldPoints = [];
  drawFrame();
}

/* =========================================================================
   発射・物理シミュレーションループ
   ========================================================================= */
function onLaunch(){
  if(phase !== "draw") return;
  phase = "flight";
  selectedLineIndex = null;
  updateControlButtons();
  recordLaunchAttempt(stageId);
  sim = createSimulation({
    world: stageDef.world,
    obstacles: stageDef.obstacles,
    lines: getDraftLines(stageId),
    goal: stageDef.goal,
  });
  launchBall(sim, stageDef.launch.x, stageDef.launch.y, stageDef.launch.angle, stageDef.launch.speed);
  sfxLaunch();
  lastTickTs = null;
  accumulator = 0;
}

function startLoop(){
  if(rafId != null) return;
  const tick = (now) => {
    if(S.screen !== "linebound" || mountedKey !== currentKey()){ rafId = null; return; }
    if(lastTickTs == null) lastTickTs = now;
    let dt = (now - lastTickTs) / 1000;
    lastTickTs = now;
    if(dt > 0.05) dt = 0.05;

    if(phase === "flight" && sim){
      accumulator += dt;
      let hitSoundKind = null;
      while(accumulator >= FIXED_DT){
        const events = stepSimulation(sim, FIXED_DT);
        accumulator -= FIXED_DT;
        for(const ev of events){
          if(ev.type === "hit") hitSoundKind = ev.kind;
          if(ev.type === "goal"){ onFlightFinished("goal"); }
          if(ev.type === "fail"){ onFlightFinished("fail", ev.reason); }
        }
        if(sim.finished) break;
      }
      if(hitSoundKind) sfxHit(hitSoundKind);
    } else if(phase === "draw"){
      previewTime += dt;
    }

    drawFrame();
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function onFlightFinished(kind, reason){
  if(phase === "result") return; // 二重発火防止
  phase = "result";
  updateControlButtons();
  if(kind === "goal"){
    const inkUsed = totalInkUsed(stageId);
    const timeMs = Date.now() - stageEnterTs;
    const result = evaluateClear(stageId, { inkUsed, timeMs });
    if(result.gameCoins > 0) renderStatusBar();
    sfxGoal();
    if(result.gameCoins > 0 || result.chappyCoinsGained > 0) setTimeout(() => sfxCoin(), 260);
    flightOutcome = { kind: "goal", result, inkUsed, timeMs };
  } else {
    sfxFail();
    flightOutcome = { kind: "fail", reason };
  }
  showResultOverlay();
}

/* =========================================================================
   結果オーバーレイ
   ========================================================================= */
const FAIL_REASON_TEXT = {
  spike: "トゲに当たってしまった…",
  outofbounds: "画面の外へ落ちてしまった…",
  stuck: "ボールが止まってしまった…",
  timeout: "時間切れになってしまった…",
};

function showResultOverlay(){
  const ov = app.querySelector("#lb-result-overlay");
  if(!ov || !flightOutcome) return;
  if(flightOutcome.kind === "fail"){
    ov.innerHTML = `
      <div class="lb-result-card lb-result-card--fail">
        <div class="lb-result-title">失敗</div>
        <div class="lb-result-msg">${esc(FAIL_REASON_TEXT[flightOutcome.reason] || "クリアできなかった…")}</div>
        <button type="button" class="lb-result-btn lb-result-btn--primary" id="lb-btn-retry">リトライ</button>
        <button type="button" class="lb-result-btn" id="lb-btn-restart">ステージを最初からやり直す</button>
      </div>`;
    ov.hidden = false;
    app.querySelector("#lb-btn-retry").addEventListener("click", onRetry);
    app.querySelector("#lb-btn-restart").addEventListener("click", onRestart);
    return;
  }
  const { result, inkUsed, timeMs } = flightOutcome;
  const coinLine = (result.gameCoins > 0) ? `<div class="lb-result-row">獲得コイン：+${result.gameCoins} AC${result.chappyCoinsGained > 0 ? `／チャッピーハウス +${result.chappyCoinsGained}` : ""}</div>` : `<div class="lb-result-row">獲得コイン：なし（このステージは受取済み）</div>`;
  const nextId = lineboundNextStageId(stageId);
  ov.innerHTML = `
    <div class="lb-result-card lb-result-card--goal">
      <div class="lb-result-title">クリア！</div>
      <div class="lb-result-stars">${starsHTML(result.stars)}</div>
      <div class="lb-result-stats">
        <div class="lb-result-row">使用インク：${Math.round(inkUsed)} / ${stageDef.inkLimit}</div>
        <div class="lb-result-row">挑戦回数：${result.attempts}回</div>
        <div class="lb-result-row">クリア時間：${(timeMs / 1000).toFixed(1)}秒</div>
        ${coinLine}
      </div>
      ${nextId ? `<button type="button" class="lb-result-btn lb-result-btn--primary" id="lb-btn-next">次のステージへ</button>` : `<div class="lb-result-row lb-result-row--done">全ステージクリア！</div>`}
      <button type="button" class="lb-result-btn" id="lb-btn-replay">もう一度遊ぶ</button>
    </div>`;
  ov.hidden = false;
  const nextBtn = app.querySelector("#lb-btn-next");
  if(nextBtn) nextBtn.addEventListener("click", () => showStagePlay(nextId));
  app.querySelector("#lb-btn-replay").addEventListener("click", onRetry);
}

function hideResultOverlay(){
  const ov = app.querySelector("#lb-result-overlay");
  if(ov){ ov.hidden = true; ov.innerHTML = ""; }
}

function onRetry(){
  phase = "draw";
  sim = null;
  flightOutcome = null;
  hideResultOverlay();
  updateControlButtons();
  updateInkUI();
  drawFrame();
}
function onRestart(){
  clearDraftLines(stageId);
  onRetry();
}

/* =========================================================================
   描画
   ========================================================================= */
function clearCanvas(){
  ctx2d.save();
  ctx2d.setTransform(1, 0, 0, 1, 0, 0);
  ctx2d.clearRect(0, 0, canvasEl.width, canvasEl.height);
  ctx2d.restore();
  const dpr = window.devicePixelRatio || 1;
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function strokeWorldLine(points, opts){
  if(points.length < 2) return;
  ctx2d.beginPath();
  const p0 = w2s(points[0].x, points[0].y);
  ctx2d.moveTo(p0.x, p0.y);
  for(let i = 1; i < points.length; i++){
    const p = w2s(points[i].x, points[i].y);
    ctx2d.lineTo(p.x, p.y);
  }
  ctx2d.lineCap = "round";
  ctx2d.lineJoin = "round";
  ctx2d.lineWidth = opts.width * viewport.scale;
  ctx2d.strokeStyle = opts.color;
  ctx2d.globalAlpha = opts.alpha != null ? opts.alpha : 1;
  ctx2d.stroke();
  ctx2d.globalAlpha = 1;
}

function drawObstacles(animTime){
  const states = obstacleRenderState(stageDef.obstacles, animTime);
  for(const { ob, segs } of states){
    if(ob.type === "spike"){
      const p = w2s(ob.x, ob.y);
      const r = (ob.radius || SPIKE_RADIUS) * viewport.scale;
      ctx2d.beginPath();
      for(let i = 0; i < 3; i++){
        const a = -Math.PI / 2 + i * (Math.PI * 2 / 3);
        const px = p.x + Math.cos(a) * r, py = p.y + Math.sin(a) * r;
        if(i === 0) ctx2d.moveTo(px, py); else ctx2d.lineTo(px, py);
      }
      ctx2d.closePath();
      ctx2d.fillStyle = "#dc2626";
      ctx2d.fill();
      continue;
    }
    for(const seg of segs){
      const color = ob.type === "rubber" ? "#db2777" : (ob.type === "movingWall" ? "#2563eb" : "#475569");
      const width = (ob.type === "rubber" ? WALL_HALF_THICKNESS * 2.1 : WALL_HALF_THICKNESS * 2);
      strokeWorldLine([{ x: seg.x1, y: seg.y1 }, { x: seg.x2, y: seg.y2 }], { width, color });
    }
  }
}

function drawGoal(){
  const p = w2s(stageDef.goal.x, stageDef.goal.y);
  const r = stageDef.goal.r * viewport.scale;
  ctx2d.beginPath();
  ctx2d.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx2d.fillStyle = "rgba(22,163,74,.16)";
  ctx2d.fill();
  ctx2d.setLineDash([6, 5]);
  ctx2d.lineWidth = 2.5;
  ctx2d.strokeStyle = "#16a34a";
  ctx2d.stroke();
  ctx2d.setLineDash([]);
  ctx2d.beginPath();
  ctx2d.arc(p.x, p.y, Math.max(3, r * 0.22), 0, Math.PI * 2);
  ctx2d.fillStyle = "#16a34a";
  ctx2d.fill();
}

function drawLaunch(){
  const p = w2s(stageDef.launch.x, stageDef.launch.y);
  ctx2d.beginPath();
  ctx2d.arc(p.x, p.y, 12 * viewport.scale, 0, Math.PI * 2);
  ctx2d.fillStyle = "rgba(2,132,199,.14)";
  ctx2d.fill();
  ctx2d.lineWidth = 2.2;
  ctx2d.strokeStyle = "#0284c7";
  ctx2d.stroke();
  if(phase === "draw"){
    const rad = stageDef.launch.angle * Math.PI / 180;
    const len = 26 * viewport.scale;
    const tip = { x: p.x + Math.cos(rad) * len, y: p.y + Math.sin(rad) * len };
    ctx2d.beginPath();
    ctx2d.moveTo(p.x, p.y);
    ctx2d.lineTo(tip.x, tip.y);
    ctx2d.lineWidth = 3;
    ctx2d.strokeStyle = "#0284c7";
    ctx2d.stroke();
  }
}

function drawBall(){
  if(!sim || !sim.ball) return;
  const p = w2s(sim.ball.x, sim.ball.y);
  const r = BALL_RADIUS * viewport.scale;
  ctx2d.beginPath();
  ctx2d.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx2d.fillStyle = "#0f172a";
  ctx2d.fill();
  ctx2d.beginPath();
  ctx2d.arc(p.x - r * 0.3, p.y - r * 0.3, r * 0.35, 0, Math.PI * 2);
  ctx2d.fillStyle = "rgba(255,255,255,.55)";
  ctx2d.fill();
}

function drawHintOverlay(){
  if(!hintOverlay || phase !== "draw") return;
  if(hintOverlay.type === "area" && hintOverlay.rect){
    const a = w2s(hintOverlay.rect.x, hintOverlay.rect.y);
    ctx2d.fillStyle = "rgba(217,119,6,.16)";
    ctx2d.strokeStyle = "rgba(217,119,6,.6)";
    ctx2d.lineWidth = 2;
    ctx2d.setLineDash([5, 4]);
    ctx2d.fillRect(a.x, a.y, hintOverlay.rect.w * viewport.scale, hintOverlay.rect.h * viewport.scale);
    ctx2d.strokeRect(a.x, a.y, hintOverlay.rect.w * viewport.scale, hintOverlay.rect.h * viewport.scale);
    ctx2d.setLineDash([]);
  } else if(hintOverlay.type === "arrow" && hintOverlay.from){
    const p = w2s(hintOverlay.from.x, hintOverlay.from.y);
    const rad = hintOverlay.angleDeg * Math.PI / 180;
    const len = 60 * viewport.scale;
    const tip = { x: p.x + Math.cos(rad) * len, y: p.y + Math.sin(rad) * len };
    ctx2d.strokeStyle = "#d97706";
    ctx2d.fillStyle = "#d97706";
    ctx2d.lineWidth = 4;
    ctx2d.beginPath(); ctx2d.moveTo(p.x, p.y); ctx2d.lineTo(tip.x, tip.y); ctx2d.stroke();
    const headA = rad + Math.PI * 0.82, headB = rad - Math.PI * 0.82;
    ctx2d.beginPath();
    ctx2d.moveTo(tip.x, tip.y);
    ctx2d.lineTo(tip.x + Math.cos(headA) * 14, tip.y + Math.sin(headA) * 14);
    ctx2d.lineTo(tip.x + Math.cos(headB) * 14, tip.y + Math.sin(headB) * 14);
    ctx2d.closePath();
    ctx2d.fill();
  } else if(hintOverlay.type === "line" && hintOverlay.points){
    strokeWorldLine(hintOverlay.points, { width: LINE_HALF_THICKNESS * 2.4, color: "rgba(217,119,6,.75)" });
  }
}

function drawFrame(){
  if(!ctx2d || !stageDef) return;
  clearCanvas();
  // 描画可能エリアの淡い背景
  const a = w2s(0, 0);
  ctx2d.fillStyle = "rgba(2,132,199,.03)";
  ctx2d.fillRect(a.x, a.y, stageDef.world.w * viewport.scale, stageDef.world.h * viewport.scale);

  const animTime = sim ? sim.time : previewTime;
  drawObstacles(animTime);
  drawGoal();
  drawLaunch();

  const lines = getDraftLines(stageId);
  lines.forEach((l, i) => {
    strokeWorldLine(l.points, {
      width: LINE_HALF_THICKNESS * 2,
      color: i === selectedLineIndex ? "#f59e0b" : "#0284c7",
    });
  });
  if(drawingActive && strokeWorldPoints.length >= 2){
    strokeWorldLine(strokeWorldPoints, { width: LINE_HALF_THICKNESS * 2, color: "#0284c7", alpha: 0.55 });
  }

  drawHintOverlay();
  drawBall();
}
