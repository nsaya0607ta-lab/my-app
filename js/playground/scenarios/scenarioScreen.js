/* =========================================================================
   🧑‍💼 シナリオモード — 「実際の業務で依頼された内容を、自分で考えてLinux
   コマンドを組み合わせて解決する」学習モード。既存のLinuxプレイグラウンド
   （js/playground/screen.js、ミッションモード）は変更せず、同じVFS/
   ShellState/Parser/Executor/コマンド群のうえに独立した画面として追加する。

   ・一覧画面（S.scenarioId === null）… 難易度別にシナリオをカード表示
   ・プレイ画面（S.scenarioId !== null）… 依頼内容の吹き出し＋ターミナル＋
     進捗チェックリスト＋ヒント／解説／次のシナリオ

   進捗判定は毎コマンド実行後に「今のLinux環境の状態」を全ステップぶん
   再評価する（goalCheckers.js）。そのため mkdir test だけではクリアに
   ならず、testディレクトリが実際に存在する状態になって初めて達成扱いに
   なる、という仕様を満たす。
   ========================================================================= */
import { esc } from '../../core.js';
import { app, go } from '../../render.js';
import { S } from '../../state.js';
import { VirtualFileSystem } from '../vfs.js';
import { ShellState } from '../shellState.js';
import { HistoryManager } from '../historyManager.js';
import { SCENARIOS, getScenarioById, nextScenarioId, scenariosByDifficulty } from './index.js';
import { evaluateGoal } from './goalCheckers.js';
import { applyInitialEnv } from './initEnv.js';
import { serializeSession, restoreSession } from './vfsSnapshot.js';
import { isScenarioCleared, getScenarioInProgress, saveScenarioProgress, markScenarioCleared } from './progressStore.js';
import { renderTerminalBody, clearTerminal, wireTerminalTap, wireKeyboard, keyboardHTML, installScrollGuard, withScrollPreserved, pushSystemMessage } from './scenarioTerminal.js';

const DIFF_CLASS = { "初級": "beginner", "初級〜中級": "lower-mid", "中級": "mid", "LPIC Level1": "lpic" };

let session = null; // 現在プレイ中のシナリオ（{scenarioId, scenario, vfs, shellState, history, records, doneSteps, hintLevel, hintStepId}）

function computeDoneSteps(scenario, vfs, shellState){
  return scenario.steps.filter(step => evaluateGoal(step.goal, vfs, shellState)).map(step => step.id);
}

function welcomeRecords(scenario, resumed){
  const text = resumed
    ? "前回の続きから再開しました。history や ls で今の状況を確認できます。"
    : `${scenario.requester.name}からの依頼です。help でコマンド一覧を確認できます。`;
  return [{ kind: "line", tokens: [{ text, cls: "pg-muted" }] }];
}

function buildSession(scenarioId){
  const scenario = getScenarioById(scenarioId);
  const vfs = new VirtualFileSystem();
  const shellState = new ShellState();
  const history = new HistoryManager();
  const saved = getScenarioInProgress(scenarioId);
  let resumed = false;
  if(saved && saved.snapshot && restoreSession(vfs, shellState, saved.snapshot)){
    resumed = true;
    (saved.history || []).forEach(cmd => history.push(cmd));
  } else {
    applyInitialEnv(vfs, shellState, scenario.initialEnv);
  }
  const doneSteps = computeDoneSteps(scenario, vfs, shellState);
  const nextStep = scenario.steps.find(step => !doneSteps.includes(step.id)) || null;
  return {
    scenarioId, scenario, vfs, shellState, history,
    records: welcomeRecords(scenario, resumed),
    doneSteps,
    hintLevel: 0,
    hintStepId: nextStep ? nextStep.id : null,
  };
}

function ensureSession(scenarioId){
  if(session && session.scenarioId === scenarioId) return session;
  session = buildSession(scenarioId);
  return session;
}

function persistCurrentAttempt(s){
  saveScenarioProgress(s.scenarioId, {
    doneSteps: s.doneSteps,
    snapshot: serializeSession(s.vfs, s.shellState),
    history: s.history.items,
  });
}

function onExecuted(s){
  const wasComplete = s.doneSteps.length === s.scenario.steps.length;
  s.doneSteps = computeDoneSteps(s.scenario, s.vfs, s.shellState);
  const nowComplete = s.doneSteps.length === s.scenario.steps.length;
  const nextStep = firstUnmetStep(s);
  const nextStepId = nextStep ? nextStep.id : null;
  if(nextStepId !== s.hintStepId){
    s.hintStepId = nextStepId;
    s.hintLevel = 0;
  }
  if(nowComplete && !wasComplete){
    markScenarioCleared(s.scenarioId);
    pushSystemMessage(s, "🎉 シナリオクリア！お疲れさまでした。「解説を見る」で振り返りができます。", "pg-mission-toast");
    if(s.scenario.clearComment){
      const req = s.scenario.requester;
      pushSystemMessage(s, `${req.avatar} ${req.name}「${s.scenario.clearComment}」`, "pg-muted");
    }
  } else if(!nowComplete){
    persistCurrentAttempt(s);
  }
  renderProgressBar();
  renderProgressCard();
  renderHintCard();
}

function terminalHooks(s){ return { onExecuted: () => onExecuted(s) }; }

// ------------------------------------------------------------------------
// 進捗バー（ターミナル操作のたびに部分更新するため、フル再描画はしない）
// ------------------------------------------------------------------------
function renderProgressBar(){
  if(!session) return;
  const total = session.scenario.steps.length;
  const done = session.doneSteps.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const fill = app.querySelector(".scn-progress-bar-fill");
  const count = app.querySelector(".scn-progress-count");
  if(fill) fill.style.width = pct + "%";
  if(count) count.textContent = `${done}/${total}`;
}

function renderProgressCard(){
  const el = app.querySelector("#scn-progress-card");
  if(!el || !session) return;
  const s = session;
  const rows = s.scenario.steps.map(step => {
    const done = s.doneSteps.includes(step.id);
    return `<div class="scn-step-row${done ? " scn-step-row--done" : ""}"><span class="scn-step-mark">${done ? "✅" : "⬜"}</span><span class="scn-step-label">${esc(step.label)}</span></div>`;
  }).join("");
  const allDone = s.doneSteps.length === s.scenario.steps.length;
  el.innerHTML = `
    <div class="pg-card-head"><span class="pg-card-ico">📋</span><span class="pg-card-title">進捗</span><span class="pg-card-badge${allDone ? " pg-card-badge--done" : ""}">${s.doneSteps.length}/${s.scenario.steps.length}</span></div>
    <div class="scn-step-list">${rows}</div>`;
}

// ------------------------------------------------------------------------
// ヒント／解説／次のシナリオ
// ------------------------------------------------------------------------
function firstUnmetStep(s){
  return s.scenario.steps.find(step => !s.doneSteps.includes(step.id)) || null;
}

function openExplanationModal(scenario){
  const ov = document.createElement("div");
  ov.className = "modal-ov";
  ov.innerHTML = `
    <div class="modal scn-explain-modal">
      <div class="modal-title">📘 解説：${esc(scenario.title)}</div>
      <div class="pg-help-body">
        <div class="rules-section"><div class="rules-section-title">なぜこのコマンドを使うのか</div><div class="rules-text">${esc(scenario.explanation.why)}</div></div>
        <div class="rules-section"><div class="rules-section-title">他の解き方</div><div class="rules-text">${esc(scenario.explanation.alternatives)}</div></div>
        <div class="rules-section"><div class="rules-section-title">LPICではどう出題されるか</div><div class="rules-text">${esc(scenario.explanation.lpic)}</div></div>
      </div>
      <button type="button" class="settings-modal-close" id="scn-explain-close">閉じる</button>
    </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.querySelector("#scn-explain-close").onclick = close;
  ov.addEventListener("click", (e) => { if(e.target === ov) close(); });
}

function goToNextScenario(currentId){
  S.scenarioId = nextScenarioId(currentId); // 次が無ければnull＝一覧へ
  session = null;
  renderScenarioScreen();
}

const HINT_NUMS = ["①", "②", "③", "④", "⑤"];

function renderHintCard(){
  const el = app.querySelector("#scn-hint-card");
  if(!el || !session) return;
  const s = session;
  const allDone = s.doneSteps.length === s.scenario.steps.length;
  const unlocked = allDone || isScenarioCleared(s.scenarioId);
  const nextStep = firstUnmetStep(s);
  const hints = nextStep ? (Array.isArray(nextStep.hint) ? nextStep.hint : [nextStep.hint]) : [];
  const level = Math.min(s.hintLevel || 0, hints.length);
  let body;
  if(allDone){
    body = `<div class="pg-card-body">🎉 このシナリオはクリア済みです。お疲れさまでした。</div>`;
  } else if(level > 0 && nextStep){
    const shown = hints.slice(0, level)
      .map((h, i) => `<div class="scn-hint-line"><span class="scn-hint-num">ヒント${HINT_NUMS[i] || (i + 1)}</span>${esc(h)}</div>`)
      .join("");
    body = `<div class="pg-card-body">${shown}</div>`;
  } else {
    body = `<div class="pg-card-body pg-muted-text">次に何をすればいいか分からなくなったら「ヒントを見る」を押してください。</div>`;
  }
  const hasMoreHints = nextStep && level < hints.length;
  const hintBtnLabel = level === 0 ? "ヒントを見る" : (hasMoreHints ? "次のヒントを見る" : "ヒントを隠す");
  const hasNext = !!nextScenarioId(s.scenarioId);
  el.innerHTML = `
    <div class="pg-card-head"><span class="pg-card-ico">💡</span><span class="pg-card-title">ヒント</span></div>
    ${body}
    <div class="scn-action-row">
      ${!allDone ? `<button type="button" class="ghost pg-card-btn" id="scn-hint-btn">${hintBtnLabel}</button>` : ""}
      <button type="button" class="ghost pg-card-btn" id="scn-explain-btn"${unlocked ? "" : " disabled"}>解説を見る</button>
      <button type="button" class="cta pg-card-btn" id="scn-next-btn"${allDone ? "" : " disabled"}>${hasNext ? "次のシナリオ →" : "シナリオ一覧へ →"}</button>
    </div>`;
  const hintBtn = el.querySelector("#scn-hint-btn");
  if(hintBtn) hintBtn.onclick = () => {
    if(level === 0) s.hintLevel = 1;
    else if(hasMoreHints) s.hintLevel = level + 1;
    else s.hintLevel = 0;
    renderHintCard();
  };
  const explainBtn = el.querySelector("#scn-explain-btn");
  if(unlocked) explainBtn.onclick = () => openExplanationModal(s.scenario);
  const nextBtn = el.querySelector("#scn-next-btn");
  if(allDone) nextBtn.onclick = () => goToNextScenario(s.scenarioId);
}

// ------------------------------------------------------------------------
// リセット
// ------------------------------------------------------------------------
function resetSession(s){
  s.vfs.reset();
  s.shellState.reset();
  applyInitialEnv(s.vfs, s.shellState, s.scenario.initialEnv);
  s.history.reset();
  s.records = welcomeRecords(s.scenario, false);
  s.doneSteps = computeDoneSteps(s.scenario, s.vfs, s.shellState);
  const nextStep = firstUnmetStep(s);
  s.hintStepId = nextStep ? nextStep.id : null;
  s.hintLevel = 0;
  persistCurrentAttempt(s);
  renderTerminalBody(s, terminalHooks(s));
  renderProgressBar();
  renderProgressCard();
  renderHintCard();
}

// ------------------------------------------------------------------------
// 一覧画面
// ------------------------------------------------------------------------
function scenarioStatusBadge(id){
  if(isScenarioCleared(id)) return `<span class="scn-card-badge scn-card-badge--done">クリア済み</span>`;
  if(getScenarioInProgress(id)) return `<span class="scn-card-badge scn-card-badge--progress">進行中</span>`;
  return "";
}

function renderScenarioListScreen(){
  const groups = scenariosByDifficulty();
  const groupsHTML = groups.map(g => {
    const cards = g.scenarios.map(sc => `
      <button type="button" class="scn-card" data-scenario="${esc(sc.id)}">
        <div class="scn-card-top">
          <span class="scn-card-avatar">${esc(sc.requester.avatar)}</span>
          <span class="scn-card-cat">${esc(sc.category)}</span>
          ${scenarioStatusBadge(sc.id)}
        </div>
        <div class="scn-card-title">${esc(sc.title)}</div>
        <div class="scn-card-req">${esc(sc.requester.name)}からの依頼</div>
      </button>`).join("");
    return `<div class="scn-group">
      <div class="scn-group-title">${esc(g.difficulty)}</div>
      <div class="scn-card-grid">${cards}</div>
    </div>`;
  }).join("");

  app.innerHTML = `
    <div class="q-head" style="margin-bottom:14px"><button class="quit" data-go="select">← ホーム</button></div>
    <div class="sel-head">
      <span class="eyebrow">実務シミュレーション</span>
      <h2 class="sel-title">シナリオモード</h2>
    </div>
    <div class="scn-intro-text">依頼内容を読んで、目的を達成するために必要なコマンドを自分で考えて実行してみましょう。コマンドの正解は1つではありません。</div>
    ${groupsHTML}
  `;
  app.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
  app.querySelectorAll("[data-scenario]").forEach(b => b.onclick = () => {
    S.scenarioId = b.dataset.scenario;
    renderScenarioScreen();
  });
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------------------
// プレイ画面
// ------------------------------------------------------------------------
function renderScenarioPlayScreen(scenarioId){
  const s = ensureSession(scenarioId);
  const scenario = s.scenario;
  const total = scenario.steps.length;
  const done = s.doneSteps.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const diffClass = DIFF_CLASS[scenario.difficulty] || "mid";

  app.innerHTML = `
  <div id="scn-root">
    <div class="scn-play-head">
      <button type="button" class="quit" id="scn-back-to-list">← シナリオ一覧</button>
      <button type="button" class="pg-reset-btn" id="scn-reset">🔄 リセット</button>
    </div>
    <div class="scn-title-row">
      <h2 class="scn-title">${esc(scenario.title)}</h2>
      <span class="scn-diff-badge scn-diff-badge--${diffClass}">${esc(scenario.difficulty)}</span>
    </div>
    <div class="scn-progress-bar-row">
      <div class="scn-progress-bar"><div class="scn-progress-bar-fill" style="width:${pct}%"></div></div>
      <span class="scn-progress-count">${done}/${total}</span>
    </div>
    <div class="scn-request-bubble">
      <div class="scn-request-avatar">${esc(scenario.requester.avatar)}</div>
      <div class="scn-request-body">
        <div class="scn-request-name">${esc(scenario.requester.name)}<span class="scn-request-role">${esc(scenario.requester.role || "")}</span></div>
        <div class="scn-request-text">${scenario.request.map(line => `<p>${esc(line)}</p>`).join("")}</div>
      </div>
    </div>
    <div class="pg-terminal-card">
      <div class="pg-terminal-head">
        <span class="pg-terminal-dots"><span></span><span></span><span></span></span>
        <span class="pg-terminal-title">student@linux</span>
        <button type="button" class="pg-terminal-clear" id="scn-terminal-clear">🗑 クリア</button>
      </div>
      <div class="pg-terminal-body" id="scn-terminal-body"></div>
    </div>
    ${keyboardHTML()}
    <div class="pg-cards">
      <div class="pg-card scn-progress-card" id="scn-progress-card"></div>
      <div class="pg-card scn-hint-card" id="scn-hint-card"></div>
    </div>
  </div>
  `;

  renderTerminalBody(s, terminalHooks(s));
  renderProgressCard();
  renderHintCard();
  wireTerminalTap();
  wireKeyboard(s, terminalHooks(s));
  installScrollGuard(app.querySelector("#scn-root"));

  app.querySelector("#scn-back-to-list").onclick = () => { S.scenarioId = null; renderScenarioScreen(); };
  app.querySelector("#scn-reset").onclick = () => resetSession(s);
  app.querySelector("#scn-terminal-clear").onclick = () => withScrollPreserved(() => clearTerminal(s, terminalHooks(s)));

  window.scrollTo(0, 0);
}

// ------------------------------------------------------------------------
// 画面エントリポイント（render.jsのrender()ディスパッチから呼ばれる）
// ------------------------------------------------------------------------
export function renderScenarioScreen(){
  if(S.scenarioId && getScenarioById(S.scenarioId)) renderScenarioPlayScreen(S.scenarioId);
  else renderScenarioListScreen();
}

export const SCENARIO_COUNT = SCENARIOS.length;
