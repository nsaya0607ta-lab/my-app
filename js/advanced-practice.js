/* =========================================================================
   AdvancedPractice — 既存の演習画面へ新しい問題形式・詳説・
   Linuxプレイグラウンド・コマンド比較を追加する非破壊拡張
   ========================================================================= */

import { S } from "./state.js";
import { app, render, go } from "./render.js";
import {
  commit,
  grade,
} from "./core.js";
import {
  commandForPlayground,
  displayCorrectAnswer,
  isCommandInputQuestion,
  isOutputPredictionQuestion,
  questionTypeOf,
  validateCommandAnswer,
} from "./questionEngine.js";
import { LPIC_COMMAND_COMPARISONS } from "./data/lpic1-advanced.js";
import { parseCommand } from "./playground/commandParser.js";
import { executeCommand } from "./playground/commandExecutor.js";
import { history, session, shellState, vfs } from "./playground/playgroundState.js";
import { pgScheduleSave } from "./playground/cloudSync.js";
import { geminiChat } from "./gemini.js";

const L = ["A","B","C","D","E","F"];
let deckRef = null;
let runState = null;
let patchQueued = false;
let modalLockDepth = 0;
let modalScrollY = 0;

function lockModalBody(){
  modalLockDepth++;
  if(modalLockDepth > 1) return;
  modalScrollY = window.scrollY || window.pageYOffset || 0;
  document.body.classList.add("ap-modal-open");
  document.body.style.position = "fixed";
  document.body.style.top = `-${modalScrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
}

function unlockModalBody(){
  modalLockDepth = Math.max(0, modalLockDepth - 1);
  if(modalLockDepth) return;
  document.body.classList.remove("ap-modal-open");
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  window.scrollTo(0, modalScrollY);
}

function esc(value){
  return String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;",
  }[ch]));
}

function ensureRunState(){
  if(S.deck !== deckRef){
    deckRef = S.deck;
    runState = {
      id:`run-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      commandAnswers:new Map(),
      validation:new Map(),
    };
  }
  if(!runState){
    runState = {
      id:`run-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      commandAnswers:new Map(),
      validation:new Map(),
    };
  }
  return runState;
}

function currentQuestion(){
  return Array.isArray(S.deck) ? S.deck[S.idx] : null;
}

function questionKey(question, index=S.idx){
  return `${index}:${question && question.id ? question.id : "unknown"}`;
}

function typeBadge(question){
  const type = questionTypeOf(question);
  if(type === "commandInput") return `<span class="ap-type-badge command">⌨ コマンド入力</span>`;
  if(type === "outputPrediction") return `<span class="ap-type-badge output">▤ 実行結果予想</span>`;
  return `<span class="ap-type-badge choice">✓ 選択問題</span>`;
}

function relatedComparison(question){
  if(!question) return null;
  if(question.comparisonKey) return LPIC_COMMAND_COMPARISONS.find(item => item.key === question.comparisonKey) || null;
  const related = [question.cmd, ...(question.relatedCommands || [])].filter(Boolean);
  return LPIC_COMMAND_COMPARISONS.find(item => related.includes(item.left) || related.includes(item.right)) || null;
}

function quizTerminalHTML(question){
  const context = Array.isArray(question.terminalContext) ? question.terminalContext : [];
  return `
    <div class="ap-terminal-question">
      ${context.length ? `<div class="ap-terminal-context">${context.map(line=>`<div>${esc(line)}</div>`).join("")}</div>` : ""}
      ${question.terminalInput ? `<div class="ap-terminal-command"><span>$</span> ${esc(question.terminalInput)}</div>` : ""}
    </div>`;
}

function injectQuizTools(question){
  if(app.querySelector(".ap-quiz-tools")) return;
  const badgeRow = app.querySelector(".q-badge-row");
  const text = app.querySelector(".q-text");
  if(!badgeRow || !text) return;

  badgeRow.insertAdjacentHTML("afterend", `
    <div class="ap-question-type-row">${typeBadge(question)}</div>
    <div class="ap-quiz-tools">
      <button type="button" class="ap-tool-btn playground" data-ap-playground>🐧 Linuxプレイグラウンド</button>
    </div>`);

  ensureRunState();
  app.querySelector("[data-ap-playground]").onclick = () => openPlaygroundModal(question);

  if(isOutputPredictionQuestion(question)){
    text.insertAdjacentHTML("beforebegin", quizTerminalHTML(question));
    app.querySelector(".opts")?.classList.add("ap-output-options");
  }
}

function enhanceCommandInputQuestion(question){
  const options = app.querySelector(".opts");
  const commitBtn = app.querySelector("[data-commit]");
  if(!options || !commitBtn || options.dataset.apCommand === "1") return;
  options.dataset.apCommand = "1";

  const state = ensureRunState();
  const key = questionKey(question);
  const saved = state.commandAnswers.get(key) || "";
  const validation = state.validation.get(key);

  options.innerHTML = `
    <div class="ap-command-answer-card">
      <label for="ap-command-input">実行するコマンドを入力</label>
      <div class="ap-command-input-wrap">
        <span class="ap-command-prompt">$</span>
        <input id="ap-command-input" type="text" inputmode="text" autocomplete="off" autocapitalize="none"
          spellcheck="false" placeholder="例: chmod 600 test.txt" value="${esc(saved)}">
      </div>
      <div class="ap-command-sub">空白や引用符の違いだけでなく、同じ最終結果になるシンボリック指定も判定します。</div>
      <div class="ap-command-validation${validation && !validation.correct ? " error" : ""}" data-ap-command-validation>
        ${validation ? esc(validation.reason) : ""}
      </div>
    </div>`;

  const input = options.querySelector("#ap-command-input");
  const validationEl = options.querySelector("[data-ap-command-validation]");
  const update = () => {
    state.commandAnswers.set(key, input.value);
    commitBtn.disabled = !input.value.trim();
    validationEl.textContent = "";
    validationEl.classList.remove("error");
  };
  input.addEventListener("input", update);

  const submit = () => {
    const result = validateCommandAnswer(question, input.value);
    state.commandAnswers.set(key, input.value.trim());
    state.validation.set(key, result);
    if(!input.value.trim()){
      validationEl.textContent = result.reason;
      validationEl.classList.add("error");
      return;
    }
    // core.jsの既存採点を壊さず使うため、意味判定の結果を非表示の正誤インデックスへ変換する。
    S.sel = [result.correct ? 0 : 1];
    commit();
  };

  commitBtn.onclick = submit;
  input.addEventListener("keydown", event => {
    if(event.key === "Enter"){
      event.preventDefault();
      if(input.value.trim()) submit();
    }
  });
  commitBtn.disabled = !input.value.trim();
  requestAnimationFrame(() => input.focus({ preventScroll:true }));
}

function enhanceQuiz(){
  const question = currentQuestion();
  if(!question || !app.querySelector(".q-text")) return;
  ensureRunState();
  injectQuizTools(question);
  if(isCommandInputQuestion(question)) enhanceCommandInputQuestion(question);
}

function chosenAnswerText(question, index){
  if(isCommandInputQuestion(question)){
    return ensureRunState().commandAnswers.get(questionKey(question,index)) || "未入力";
  }
  const picks = (S.picks && S.picks[index]) || [];
  if(!picks.length) return "未回答";
  return picks.map(i => `${L[i] || i+1}. ${(question.o || [])[i] || ""}`).join(" / ");
}

function geminiAskDraft(question, index){
  const parts = ["次のLPIC-1の問題について教えてください。", `問題: ${question.q || ""}`];
  if(Array.isArray(question.o) && !isCommandInputQuestion(question)){
    parts.push(`選択肢:\n${question.o.map((choice,i)=>`${L[i] || i+1}. ${choice}`).join("\n")}`);
  }
  parts.push(`自分の回答: ${chosenAnswerText(question,index)}`);
  parts.push(`正解: ${displayCorrectAnswer(question)}`);
  parts.push("なぜ正解になるのか、ほかの選択肢がなぜ違うのかも含めて教えてください。");
  return parts.join("\n");
}

function askGeminiAbout(question, index){
  if(!question) return;
  geminiChat.draft = geminiAskDraft(question, index);
  S.geminiReturnScreen = "review";
  go("gemini");
}

function detailedExplanationHTML(question, index){
  const picked = (S.picks && S.picks[index]) || [];
  const result = grade(question, picked);
  const comparison = relatedComparison(question);
  return `
    <div class="ap-detailed-explanation ${result.full ? "correct" : "incorrect"}">
      <div class="ap-explain-section answer">
        <h4>正解</h4>
        <code>${esc(displayCorrectAnswer(question))}</code>
      </div>
      <div class="ap-explain-section">
        <h4>なぜ正しいのか</h4>
        <p>${esc(question.explanationDetailed || question.e || "問題の条件を満たす操作・結果だからです。")}</p>
      </div>
      ${(question.relatedCommands || []).length ? `
        <div class="ap-explain-section">
          <h4>関連するコマンド</h4>
          <div class="ap-related-chips">${question.relatedCommands.map(cmd=>`<span>${esc(cmd)}</span>`).join("")}</div>
        </div>` : ""}
      <div class="ap-review-actions">
        <button type="button" data-ap-gemini-ask="${index}">✨ Geminiに質問する</button>
        <button type="button" data-ap-review-play="${index}">🐧 Linuxプレイグラウンドで試す</button>
        ${comparison ? `<button type="button" data-ap-review-compare="${esc(comparison.key)}">↔ 関連コマンドを比較</button>` : ""}
        <button type="button" class="primary" data-ap-review-retry="${index}">↻ もう一度この問題を解く</button>
      </div>
    </div>`;
}

function enhanceReview(){
  if(!Array.isArray(S.deck)) return;
  ensureRunState();
  const cards = app.querySelectorAll(".review-q");
  cards.forEach((card,index) => {
    const question = S.deck[index];
    if(!question || card.dataset.apDetailed === "1") return;
    card.dataset.apDetailed = "1";

    if(isCommandInputQuestion(question)){
      const opts = card.querySelector(".opts");
      if(opts){
        const result = grade(question, (S.picks && S.picks[index]) || []);
        opts.innerHTML = `
          <div class="ap-command-review ${result.full ? "correct" : "incorrect"}">
            <span>入力したコマンド</span>
            <code>${esc(chosenAnswerText(question,index))}</code>
            <span>正解例</span>
            <code>${esc(displayCorrectAnswer(question))}</code>
          </div>`;
      }
    }else if(isOutputPredictionQuestion(question)){
      const qText = card.querySelector(".q-text");
      if(qText && !card.querySelector(".ap-terminal-question")) qText.insertAdjacentHTML("beforebegin", quizTerminalHTML(question));
      card.querySelector(".opts")?.classList.add("ap-output-options");
    }

    const old = card.querySelector(".expl");
    if(old) old.outerHTML = detailedExplanationHTML(question,index);
  });

  app.querySelectorAll("[data-ap-gemini-ask]").forEach(button => {
    button.onclick = () => askGeminiAbout(S.deck[+button.dataset.apGeminiAsk], +button.dataset.apGeminiAsk);
  });
  app.querySelectorAll("[data-ap-review-play]").forEach(button => {
    button.onclick = () => openPlaygroundModal(S.deck[+button.dataset.apReviewPlay]);
  });
  app.querySelectorAll("[data-ap-review-compare]").forEach(button => {
    button.onclick = () => openComparisonHub(button.dataset.apReviewCompare);
  });
  app.querySelectorAll("[data-ap-review-retry]").forEach(button => {
    button.onclick = () => retrySingleQuestion(S.deck[+button.dataset.apReviewRetry]);
  });
}

function enhanceResult(){
  const entry = S.last;
  if(!entry || app.querySelector(".ap-result-card")) return;
  const commandCount = (S.deck || []).filter(isCommandInputQuestion).length;
  const outputCount = (S.deck || []).filter(isOutputPredictionQuestion).length;
  const comparisons = [...new Set((S.deck || []).map(q => {
    const item = relatedComparison(q);
    return item && item.key;
  }).filter(Boolean))];

  const actions = app.querySelector(".actions");
  if(!actions) return;
  actions.insertAdjacentHTML("beforebegin", `
    <div class="ap-result-card">
      <h3>実務演習レポート</h3>
      <div class="ap-result-metrics">
        <span>⌨ コマンド入力 <b>${commandCount}</b>問</span>
        <span>▤ 出力予想 <b>${outputCount}</b>問</span>
      </div>
      <div class="ap-result-actions">
        <button type="button" data-ap-result-play>🐧 Linuxプレイグラウンド</button>
        <button type="button" data-ap-result-compare ${comparisons.length ? "" : "disabled"}>↔ 関連コマンド比較</button>
      </div>
    </div>`);

  app.querySelector("[data-ap-result-play]").onclick = () => openPlaygroundModal(currentQuestion() || (S.deck && S.deck[0]));
  const compareButton = app.querySelector("[data-ap-result-compare]");
  if(compareButton && !compareButton.disabled) compareButton.onclick = () => openComparisonHub(comparisons[0]);
}

function retrySingleQuestion(question){
  if(!question) return;
  S.deck = [question];
  S.idx = 0;
  S.picks = [];
  S.sel = [];
  S.qTimes = [];
  S.qShownAt = Date.now();
  S.screen = "quiz";
  S.mode = "practice";
  S.review = false;
  S.markedRun = false;
  S.commandCmd = question.cmd || null;
  deckRef = null;
  runState = null;
  render();
}

function comparisonDetailHTML(item){
  return `
    <article class="ap-comparison-detail">
      <div class="ap-compare-head">
        <span>${esc(item.left)}</span><b>VS</b><span>${esc(item.right)}</span>
      </div>
      <section><h3>用途</h3><p>${esc(item.purpose)}</p></section>
      <section><h3>違い</h3><ul>${item.differences.map(text=>`<li>${esc(text)}</li>`).join("")}</ul></section>
      <section><h3>使用例</h3>${item.examples.map(text=>`<code>$ ${esc(text)}</code>`).join("")}</section>
      <section class="warning"><h3>よく間違えるポイント</h3><ul>${item.pitfalls.map(text=>`<li>${esc(text)}</li>`).join("")}</ul></section>
      <section class="exam"><h3>LPIC試験でのポイント</h3><p>${esc(item.lpicPoint)}</p></section>
      <section><h3>関連コマンド</h3><div class="ap-related-chips">${item.related.map(cmd=>`<span>${esc(cmd)}</span>`).join("")}</div></section>
    </article>`;
}

function openComparisonHub(initialKey){
  const initial = LPIC_COMMAND_COMPARISONS.find(item => item.key === initialKey) || LPIC_COMMAND_COMPARISONS[0];
  const overlay = document.createElement("div");
  overlay.className = "ap-full-overlay";
  overlay.innerHTML = `
    <div class="ap-comparison-page" role="dialog" aria-modal="true">
      <header>
        <div><small>LPIC-1 実務学習</small><h2>似ているコマンドを比較</h2></div>
        <button type="button" data-ap-close aria-label="閉じる">×</button>
      </header>
      <nav class="ap-comparison-tabs">
        ${LPIC_COMMAND_COMPARISONS.map(item=>`<button type="button" data-ap-comparison="${esc(item.key)}" class="${item.key===initial.key?"active":""}">${esc(item.title)}</button>`).join("")}
      </nav>
      <div class="ap-comparison-body">${comparisonDetailHTML(initial)}</div>
    </div>`;
  document.body.appendChild(overlay);
  lockModalBody();
  requestAnimationFrame(()=>overlay.classList.add("show"));

  const close = () => {
    overlay.classList.remove("show");
    unlockModalBody();
    setTimeout(()=>overlay.remove(),180);
  };
  overlay.querySelector("[data-ap-close]").onclick = close;
  overlay.addEventListener("click", event => { if(event.target === overlay) close(); });
  overlay.querySelectorAll("[data-ap-comparison]").forEach(button => {
    button.onclick = () => {
      const item = LPIC_COMMAND_COMPARISONS.find(x=>x.key===button.dataset.apComparison);
      if(!item) return;
      overlay.querySelectorAll("[data-ap-comparison]").forEach(b=>b.classList.toggle("active", b===button));
      overlay.querySelector(".ap-comparison-body").innerHTML = comparisonDetailHTML(item);
    };
  });
}

function terminalLinesHTML(result){
  const rows = [];
  (result.lines || []).forEach(line => rows.push(`<div>${line.map(token=>esc(token.text)).join("")}</div>`));
  (result.err || []).forEach(line => rows.push(`<div class="error">${line.map(token=>esc(token.text)).join("")}</div>`));
  if(result.overlay) rows.push(`<div class="muted">このコマンドの専用画面は、フル版Linuxプレイグラウンドで利用できます。</div>`);
  if(!rows.length && !result.clear) rows.push(`<div class="muted">（標準出力はありません）</div>`);
  return rows.join("");
}

function openPlaygroundModal(question){
  const overlay = document.createElement("div");
  overlay.className = "ap-playground-overlay";
  const suggested = commandForPlayground(question);
  overlay.innerHTML = `
    <div class="ap-playground-sheet" role="dialog" aria-modal="true">
      <div class="ap-sheet-handle"></div>
      <header>
        <div><small>既存の仮想Linux実行エンジンを使用</small><h2>Linuxプレイグラウンド</h2></div>
        <button type="button" data-ap-close aria-label="閉じる">×</button>
      </header>
      <div class="ap-playground-problem">
        <b>現在の問題</b>
        <span>${esc(question && question.q ? question.q : "自由にコマンドを試せます。")}</span>
      </div>
      <div class="ap-mini-terminal">
        <div class="ap-mini-terminal-output" data-ap-terminal-output>
          <div class="muted">同じ仮想ファイルシステムとコマンド実行エンジンを利用しています。</div>
        </div>
        <form class="ap-mini-terminal-form" data-ap-terminal-form>
          <span>${esc(session.current().username)}@linux:${esc(vfs.promptPath())}${session.isRoot() ? "#" : "$"}</span>
          <input type="text" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="コマンドを入力">
          <button type="submit">実行</button>
        </form>
      </div>
      <div class="ap-playground-buttons">
        ${suggested ? `<button type="button" data-ap-fill>問題のコマンド例を入力</button>` : ""}
        <button type="button" data-ap-clear>表示を消去</button>
        <button type="button" class="primary" data-ap-close-bottom>演習へ戻る</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  lockModalBody();
  requestAnimationFrame(()=>overlay.classList.add("show"));

  const output = overlay.querySelector("[data-ap-terminal-output]");
  const input = overlay.querySelector("input");
  const form = overlay.querySelector("[data-ap-terminal-form]");
  const close = () => {
    overlay.classList.remove("show");
    unlockModalBody();
    setTimeout(()=>overlay.remove(),180);
  };
  const execute = raw => {
    const command = String(raw || "").trim();
    if(!command) return;
    output.insertAdjacentHTML("beforeend", `<div class="command"><span>$</span> ${esc(command)}</div>`);
    try{
      const pipeline = parseCommand(command);
      if(!pipeline) return;
      history.push(command);
      const result = executeCommand({ vfs, state:shellState, session, history }, pipeline);
      if(result.clear) output.innerHTML = "";
      else output.insertAdjacentHTML("beforeend", terminalLinesHTML(result));
      pgScheduleSave();
    }catch(error){
      output.insertAdjacentHTML("beforeend", `<div class="error">${esc(error && error.message ? error.message : "コマンドを実行できませんでした。")}</div>`);
    }
    output.scrollTop = output.scrollHeight;
  };

  form.onsubmit = event => {
    event.preventDefault();
    execute(input.value);
    input.value = "";
    input.focus();
  };
  const fill = overlay.querySelector("[data-ap-fill]");
  if(fill) fill.onclick = () => { input.value = suggested; input.focus(); input.setSelectionRange(input.value.length,input.value.length); };
  overlay.querySelector("[data-ap-clear]").onclick = () => { output.innerHTML = ""; };
  overlay.querySelector("[data-ap-close]").onclick = close;
  overlay.querySelector("[data-ap-close-bottom]").onclick = close;
  overlay.addEventListener("click", event => { if(event.target === overlay) close(); });
  requestAnimationFrame(()=>input.focus({ preventScroll:true }));
}

function enhanceLpicCommandScreen(){
  if(S.cert !== "lpic1" || app.querySelector("[data-ap-open-comparisons]")) return;
  const hint = app.querySelector(".x-hint");
  if(!hint) return;
  hint.insertAdjacentHTML("afterend", `
    <button type="button" class="ap-comparison-launch" data-ap-open-comparisons>
      <span>↔</span><span><b>似ているコマンドを比較</b><small>用途・違い・実務例・LPICポイントを確認</small></span><em>›</em>
    </button>`);
  app.querySelector("[data-ap-open-comparisons]").onclick = () => openComparisonHub();
}

function patchCurrentScreen(){
  if(!app || S.cert !== "lpic1") return;
  if(S.screen === "quiz") enhanceQuiz();
  else if(S.screen === "result") enhanceResult();
  else if(S.screen === "review") enhanceReview();
  else if(S.screen === "lpic-commands") enhanceLpicCommandScreen();
}

function schedulePatch(){
  if(patchQueued) return;
  patchQueued = true;
  requestAnimationFrame(() => {
    patchQueued = false;
    patchCurrentScreen();
  });
}

if(app){
  new MutationObserver(schedulePatch).observe(app,{ childList:true, subtree:false });
  schedulePatch();
}
