/* =========================================================================
   🐧 Linux プレイグラウンド — 専用フルスクリーン画面（PlaygroundScreen）
   実OS・Dockerには一切アクセスせず、ブラウザのメモリ上だけで完結する
   仮想Linux環境（VirtualFileSystem）に対して、対応コマンドだけを解釈・
   実行する学習用サンドボックス。

   このファイルが担う「コンポーネント」：
     ・Terminal      … renderTerminalBody() / appendTerminalRecords()
     ・CommandInput   … wireCommandInput()（Enter送信・↑↓履歴・チップ挿入）
     ・MissionCard    … renderMissionCard()
     ・HintCard       … renderHintCard()
   VirtualFileSystem・CommandParser・CommandExecutor・HistoryManagerは
   それぞれ専用ファイルに分離し、ここではその実行結果を画面に反映するだけ。

   状態（vfs/history/ミッション進捗/ターミナルの表示履歴）はモジュール変数
   として画面をまたいで保持する（js/introQuiz.jsと同じ作法）。「リセット」
   ボタンを押すか、初回読み込み時のみ初期状態に戻る。
   ========================================================================= */
import { esc } from '../core.js';
import { app } from '../render.js';
import { VirtualFileSystem } from './vfs.js';
import { parseCommand } from './commandParser.js';
import { executeCommand } from './commandExecutor.js';
import { HistoryManager } from './historyManager.js';
import { MISSIONS } from './missions.js';

const vfs = new VirtualFileSystem();
const history = new HistoryManager();
let missionIndex = 0;
let answerRevealed = false;
let terminalRecords = []; // {kind:"cmd", promptPath, text} | {kind:"line", tokens}
let bootstrapped = false;

const QUICK_COMMANDS = [
  { cmd:"ls", needsArg:false },
  { cmd:"cd", needsArg:true },
  { cmd:"pwd", needsArg:false },
  { cmd:"mkdir", needsArg:true },
  { cmd:"touch", needsArg:true },
  { cmd:"cat", needsArg:true },
  { cmd:"echo", needsArg:true },
  { cmd:"clear", needsArg:false },
  { cmd:"help", needsArg:false },
];

function resetPlaygroundState(){
  vfs.reset();
  history.reset();
  missionIndex = 0;
  answerRevealed = false;
  terminalRecords = [
    { kind:"line", tokens:[{ text:"student ホームディレクトリへようこそ。help と入力すると使えるコマンド一覧を確認できます。", cls:"pg-muted" }] },
  ];
}

// ------------------------------------------------------------------------
// Terminal
// ------------------------------------------------------------------------
function tokensToHTML(tokens){
  return tokens.map(t => `<span${t.cls ? ` class="${t.cls}"` : ""}>${esc(t.text)}</span>`).join(" ");
}

function recordToHTML(record){
  if(record.kind === "cmd"){
    return `<div class="pg-term-line"><span class="pg-term-prompt">student@linux:${esc(record.promptPath)}$</span> <span class="pg-term-cmd">${esc(record.text)}</span></div>`;
  }
  return `<div class="pg-term-line">${tokensToHTML(record.tokens)}</div>`;
}

function terminalBodyEl(){ return app.querySelector("#pg-terminal-body"); }

function isNearBottom(el){ return el.scrollHeight - el.scrollTop - el.clientHeight < 40; }

function renderTerminalBody(){
  const el = terminalBodyEl();
  if(!el) return;
  el.innerHTML = terminalRecords.map(recordToHTML).join("") +
    `<div class="pg-term-line pg-term-live"><span class="pg-term-prompt">student@linux:${esc(vfs.promptPath())}$</span> <span class="pg-term-cursor"></span></div>`;
  el.scrollTop = el.scrollHeight;
}

function appendTerminalRecords(records){
  const el = terminalBodyEl();
  if(!el) return;
  const live = el.querySelector(".pg-term-live");
  const wasNearBottom = !live || isNearBottom(el);
  records.forEach(r => terminalRecords.push(r));
  const html = records.map(recordToHTML).join("");
  if(live) live.insertAdjacentHTML("beforebegin", html);
  else el.insertAdjacentHTML("beforeend", html);
  const liveEl = el.querySelector(".pg-term-live .pg-term-prompt");
  if(liveEl) liveEl.textContent = `student@linux:${vfs.promptPath()}$`;
  if(wasNearBottom) el.scrollTop = el.scrollHeight;
}

function clearTerminal(){
  terminalRecords = [];
  renderTerminalBody();
}

// ------------------------------------------------------------------------
// ミッション判定
// ------------------------------------------------------------------------
function evaluateMission(parsed){
  if(missionIndex >= MISSIONS.length) return;
  const mission = MISSIONS[missionIndex];
  if(!mission.check(parsed, vfs)) return;
  missionIndex++;
  answerRevealed = false;
  const complete = missionIndex >= MISSIONS.length;
  appendTerminalRecords([
    { kind:"line", tokens:[{ text: complete ? "🎉 Mission Complete! 全ミッションを達成しました！" : "✅ Mission Complete!", cls:"pg-mission-toast" }] },
  ]);
  renderMissionCard();
  renderHintCard();
}

// ------------------------------------------------------------------------
// コマンド実行（CommandInputからの送信を受ける入り口）
// ------------------------------------------------------------------------
function runCommand(raw){
  const promptPath = vfs.promptPath();
  history.push(raw);
  const parsed = parseCommand(raw); // raw is guaranteed non-blank by the caller
  const result = executeCommand(vfs, parsed);
  if(result.clear){
    clearTerminal();
    return;
  }
  const records = [{ kind:"cmd", promptPath, text: raw }];
  (result.lines||[]).forEach(tokens => records.push({ kind:"line", tokens }));
  appendTerminalRecords(records);
  if(!result.isError) evaluateMission(parsed);
}

// ------------------------------------------------------------------------
// CommandInput
// ------------------------------------------------------------------------
function wireCommandInput(){
  const form = app.querySelector("#pg-input-form");
  const input = app.querySelector("#pg-input");
  if(!form || !input) return;
  form.onsubmit = (e) => {
    e.preventDefault();
    const raw = input.value;
    if(!raw.trim()) return;
    input.value = "";
    runCommand(raw);
  };
  input.onkeydown = (e) => {
    if(e.key === "ArrowUp"){
      e.preventDefault();
      const v = history.prev(input.value);
      if(v !== null){ input.value = v; requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length)); }
    } else if(e.key === "ArrowDown"){
      e.preventDefault();
      const v = history.next();
      if(v !== null){ input.value = v; requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length)); }
    }
  };
}

function wireChips(){
  app.querySelectorAll("[data-pg-chip]").forEach(btn => {
    btn.onclick = () => {
      const input = app.querySelector("#pg-input");
      if(!input) return;
      const cmd = btn.dataset.pgChip;
      const needsArg = btn.dataset.pgArg === "1";
      input.value = needsArg ? cmd + " " : cmd;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    };
  });
}

// ------------------------------------------------------------------------
// MissionCard / HintCard
// ------------------------------------------------------------------------
function renderMissionCard(){
  const el = app.querySelector("#pg-mission-card");
  if(!el) return;
  const total = MISSIONS.length;
  if(missionIndex >= total){
    el.innerHTML = `
      <div class="pg-card-head"><span class="pg-card-ico">🎯</span><span class="pg-card-title">ミッションモード</span><span class="pg-card-badge pg-card-badge--done">Complete</span></div>
      <div class="pg-card-body">🎉 Mission Complete！全 ${total} 問のミッションを達成しました。</div>`;
    return;
  }
  const mission = MISSIONS[missionIndex];
  el.innerHTML = `
    <div class="pg-card-head"><span class="pg-card-ico">🎯</span><span class="pg-card-title">ミッションモード</span><span class="pg-card-badge">${missionIndex+1}/${total}</span></div>
    <div class="pg-card-body">${esc(mission.title)}</div>
    <button type="button" class="cta pg-card-btn" id="pg-mission-hint-btn">${answerRevealed ? "答えを隠す" : "ヒントを見る"}</button>`;
  const btn = el.querySelector("#pg-mission-hint-btn");
  if(btn) btn.onclick = () => { answerRevealed = !answerRevealed; renderMissionCard(); renderHintCard(); };
}

function renderHintCard(){
  const el = app.querySelector("#pg-hint-card");
  if(!el) return;
  if(missionIndex >= MISSIONS.length){
    el.innerHTML = `
      <div class="pg-card-head"><span class="pg-card-ico">💡</span><span class="pg-card-title">ヒント</span></div>
      <div class="pg-card-body pg-muted-text">お疲れさまでした。「リセット」から何度でも練習できます。</div>`;
    return;
  }
  const mission = MISSIONS[missionIndex];
  el.innerHTML = `
    <div class="pg-card-head"><span class="pg-card-ico">💡</span><span class="pg-card-title">ヒント</span></div>
    <div class="pg-card-body">${esc(mission.hint)}</div>
    ${answerRevealed ? `<div class="pg-answer">正解: <code>${esc(mission.answer)}</code></div>` : ""}
    <button type="button" class="ghost pg-card-btn" id="pg-hint-answer-btn">${answerRevealed ? "答えを隠す" : "答えを見る"}</button>`;
  const btn = el.querySelector("#pg-hint-answer-btn");
  if(btn) btn.onclick = () => { answerRevealed = !answerRevealed; renderMissionCard(); renderHintCard(); };
}

// ------------------------------------------------------------------------
// ヘルプモーダル（既存の設定／ルールモーダルと同じ #app外オーバーレイ方式）
// ------------------------------------------------------------------------
function closeHelpModal(ov){ try{ ov.remove(); }catch(e){} }

function openHelpModal(){
  const ov = document.createElement("div");
  ov.className = "modal-ov";
  ov.innerHTML = `
    <div class="modal pg-help-modal">
      <div class="modal-title pg-help-modal-title">💻 Linux プレイグラウンドの使い方</div>
      <div class="pg-help-body">
        <div class="rules-section">
          <div class="rules-section-title">📝 これは何？</div>
          <div class="rules-text">本物のLinux／Dockerには一切アクセスしない、ブラウザ上だけで動く仮想の学習環境です。安心してコマンドを試せます。</div>
        </div>
        <div class="rules-section">
          <div class="rules-section-title">⌨️ 対応コマンド</div>
          <ul class="rules-list">
            <li><code>pwd</code> … 現在のディレクトリを表示</li>
            <li><code>ls</code> … 中身を一覧表示</li>
            <li><code>cd &lt;dir&gt;</code> … ディレクトリを移動</li>
            <li><code>mkdir &lt;name&gt;</code> … ディレクトリを作成</li>
            <li><code>touch &lt;name&gt;</code> … 空のファイルを作成</li>
            <li><code>cat &lt;file&gt;</code> … ファイルの中身を表示</li>
            <li><code>echo テキスト</code> … 文字列を表示（<code>&gt; file</code>で書き込み）</li>
            <li><code>clear</code> … 画面をクリア</li>
            <li><code>help</code> … コマンド一覧を表示</li>
          </ul>
        </div>
        <div class="rules-section">
          <div class="rules-section-title">🎯 ミッション</div>
          <div class="rules-text">画面下部のミッションカードにしたがって全5問に挑戦してみましょう。行き詰まったらヒントカードの「答えを見る」で正解コマンドを確認できます。</div>
        </div>
      </div>
      <button type="button" class="settings-modal-close" id="pg-help-close">閉じる</button>
    </div>`;
  document.body.appendChild(ov);
  const closeBtn = ov.querySelector("#pg-help-close");
  if(closeBtn) closeBtn.onclick = () => closeHelpModal(ov);
  ov.addEventListener("click", (e) => { if(e.target === ov) closeHelpModal(ov); });
}

// ------------------------------------------------------------------------
// 画面エントリポイント（render.jsのrender()ディスパッチから呼ばれる）
// ------------------------------------------------------------------------
export function renderPlaygroundScreen(){
  if(!bootstrapped){ resetPlaygroundState(); bootstrapped = true; }

  const chipsHTML = QUICK_COMMANDS.map(c =>
    `<button type="button" class="pg-chip" data-pg-chip="${esc(c.cmd)}" data-pg-arg="${c.needsArg ? "1" : "0"}">${esc(c.cmd)}</button>`
  ).join("");

  app.innerHTML = `
    <div class="pg-head">
      <h2 class="pg-head-title">Linux プレイグラウンド</h2>
      <div class="pg-head-actions">
        <button type="button" class="pg-reset-btn" id="pg-reset">🔄 リセット</button>
        <button type="button" class="pg-help-btn" id="pg-help" aria-label="ヘルプ" title="ヘルプ">?</button>
      </div>
    </div>
    <div class="pg-intro-card">
      <span class="pg-intro-ico">&gt;_</span>
      <div>
        <div class="pg-intro-title">Linux プレイグラウンド</div>
        <div class="pg-intro-sub">ブラウザ上で安全にLinuxコマンドを試してみよう！</div>
      </div>
    </div>
    <div class="pg-terminal-card">
      <div class="pg-terminal-head">
        <span class="pg-terminal-dots"><span></span><span></span><span></span></span>
        <span class="pg-terminal-title">student@linux</span>
        <button type="button" class="pg-terminal-clear" id="pg-terminal-clear">🗑 クリア</button>
      </div>
      <div class="pg-terminal-body" id="pg-terminal-body"></div>
    </div>
    <form class="pg-input-row" id="pg-input-form" autocomplete="off">
      <span class="pg-input-prompt">&gt;_</span>
      <input type="text" id="pg-input" class="pg-input" placeholder="コマンドを入力..." autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
      <button type="submit" class="pg-send-btn" aria-label="送信">➤</button>
    </form>
    <div class="pg-chip-row">${chipsHTML}</div>
    <div class="pg-cards">
      <div class="pg-card pg-mission-card" id="pg-mission-card"></div>
      <div class="pg-card pg-hint-card" id="pg-hint-card"></div>
    </div>
  `;

  renderTerminalBody();
  renderMissionCard();
  renderHintCard();
  wireCommandInput();
  wireChips();

  const resetBtn = app.querySelector("#pg-reset");
  if(resetBtn) resetBtn.onclick = () => { resetPlaygroundState(); renderPlaygroundScreen(); };
  const helpBtn = app.querySelector("#pg-help");
  if(helpBtn) helpBtn.onclick = () => openHelpModal();
  const clearBtn = app.querySelector("#pg-terminal-clear");
  if(clearBtn) clearBtn.onclick = () => clearTerminal();

  app.querySelector("#pg-input").focus();
  window.scrollTo(0,0);
}
