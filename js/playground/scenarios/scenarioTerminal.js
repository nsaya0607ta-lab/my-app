/* =========================================================================
   scenarioTerminal — シナリオモード用のターミナルUI。
   見た目・挙動は既存のLinuxプレイグラウンド（js/playground/screen.js）の
   ターミナルと完全に同じ（同じCSSクラス・同じVFS/ShellState/Parser/
   Executorエンジンを利用）だが、既存のミッションモード画面（screen.js）
   は一切変更せずに済むよう、シナリオ用に独立したコンポーネントとして
   用意している。1つの `session`（{vfs, shellState, history, records}）を
   引数に取り、コマンド実行後に onExecuted コールバックを呼ぶことで、
   シナリオ側のゴール判定・進捗保存をフックできるようにしている。
   ========================================================================= */
import { esc } from '../../core.js';
import { app } from '../../render.js';
import { parseCommand } from '../commandParser.js';
import { executeCommand } from '../commandExecutor.js';
import { getCompletions } from '../completion.js';
import { COMMAND_NAMES } from '../commands/index.js';
import { parseCrontabText } from '../cronUtil.js';

function tokensToHTML(tokens){
  return tokens.map(t => `<span${t.cls ? ` class="${t.cls}"` : ""}>${esc(t.text)}</span>`).join("");
}

function recordToHTML(record){
  if(record.kind === "cmd"){
    return `<div class="pg-term-line"><span class="pg-term-prompt">student@linux:${esc(record.promptPath)}$</span> <span class="pg-term-cmd">${esc(record.text)}</span></div>`;
  }
  return `<div class="pg-term-line">${tokensToHTML(record.tokens)}</div>`;
}

function termBodyEl(){ return app.querySelector("#scn-terminal-body"); }
function isNearBottom(el){ return el.scrollHeight - el.scrollTop - el.clientHeight < 40; }

function liveLineHTML(session){
  return `<form class="pg-term-line pg-term-live" id="scn-term-input-form" autocomplete="off">
    <span class="pg-term-prompt">student@linux:${esc(session.vfs.promptPath())}$</span>
    <input type="text" id="scn-term-input" class="pg-term-input" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text">
    <span class="pg-term-cursor" id="scn-term-cursor"></span>
    <button type="submit" class="pg-term-send-btn" aria-label="送信">➤</button>
  </form>`;
}

export function renderTerminalBody(session, hooks){
  const el = termBodyEl();
  if(!el) return;
  el.innerHTML = session.records.map(recordToHTML).join("") + liveLineHTML(session);
  el.scrollTop = el.scrollHeight;
  wireCommandInput(session, hooks);
}

function appendRecords(session, records){
  const el = termBodyEl();
  if(!el) return;
  const live = el.querySelector(".pg-term-live");
  const wasNearBottom = !live || isNearBottom(el);
  records.forEach(r => session.records.push(r));
  const html = records.map(recordToHTML).join("");
  if(live) live.insertAdjacentHTML("beforebegin", html);
  else el.insertAdjacentHTML("beforeend", html);
  const liveEl = el.querySelector(".pg-term-live .pg-term-prompt");
  if(liveEl) liveEl.textContent = `student@linux:${session.vfs.promptPath()}$`;
  if(wasNearBottom) el.scrollTop = el.scrollHeight;
}

// システムメッセージ（クリア通知など）を1行追加するだけの軽量ヘルパー
export function pushSystemMessage(session, text, cls){
  appendRecords(session, [{ kind: "line", tokens: [{ text, cls }] }]);
}

export function clearTerminal(session, hooks){
  const hadFocus = app.querySelector("#scn-term-input") === document.activeElement;
  session.records = [];
  renderTerminalBody(session, hooks);
  if(hadFocus){
    const input = app.querySelector("#scn-term-input");
    if(input) input.focus();
  }
}

function runCommand(session, hooks, raw){
  const promptPath = session.vfs.promptPath();
  session.history.push(raw);
  const pipeline = parseCommand(raw);
  if(!pipeline) return;
  const result = executeCommand({ vfs: session.vfs, state: session.shellState, history: session.history.items }, pipeline);
  if(result.clear){
    clearTerminal(session, hooks);
    hooks.onExecuted();
    return;
  }
  const records = [{ kind: "cmd", promptPath, text: raw }];
  (result.lines || []).forEach(tokens => records.push({ kind: "line", tokens }));
  (result.err || []).forEach(tokens => records.push({ kind: "line", tokens }));
  appendRecords(session, records);
  if(result.overlay) openCommandOverlay(session, hooks, result.overlay);
  hooks.onExecuted();
}

// ------------------------------------------------------------------------
// nano / less / crontab -e の疑似オーバーレイ
// ------------------------------------------------------------------------
function openCommandOverlay(session, hooks, overlay){
  if(overlay.type === "nano") openNanoModal(session, hooks, overlay);
  else if(overlay.type === "less") openLessModal(overlay);
  else if(overlay.type === "crontab") openCrontabModal(session, hooks, overlay);
}

function openNanoModal(session, hooks, payload){
  const ov = document.createElement("div");
  ov.className = "modal-ov pg-nano-ov";
  ov.innerHTML = `
    <div class="pg-nano-modal">
      <div class="pg-nano-head">GNU nano &nbsp; ${esc(payload.path)}</div>
      <textarea class="pg-nano-textarea" id="scn-nano-textarea" autocapitalize="off" autocorrect="off" spellcheck="false">${esc(payload.content)}</textarea>
      <div class="pg-nano-status" id="scn-nano-status">&nbsp;</div>
      <div class="pg-nano-foot">
        <button type="button" class="pg-nano-btn" id="scn-nano-save">^O 保存</button>
        <button type="button" class="pg-nano-btn pg-nano-btn--exit" id="scn-nano-exit">^X 終了</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const ta = ov.querySelector("#scn-nano-textarea");
  const status = ov.querySelector("#scn-nano-status");
  const save = () => {
    const res = session.vfs.writeFile(payload.path, ta.value, { append: false });
    status.textContent = res.error ? `[ 保存に失敗しました: ${payload.path} ]` : `[ ${payload.path} に書き込みました ]`;
    hooks.onExecuted();
  };
  const exit = () => { ov.remove(); renderTerminalBody(session, hooks); };
  ov.querySelector("#scn-nano-save").onclick = save;
  ov.querySelector("#scn-nano-exit").onclick = exit;
  ta.addEventListener("keydown", (e) => {
    if(e.ctrlKey && (e.key === "o" || e.key === "O")){ e.preventDefault(); save(); }
    else if(e.ctrlKey && (e.key === "x" || e.key === "X")){ e.preventDefault(); exit(); }
  });
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}

function openLessModal(payload){
  const ov = document.createElement("div");
  ov.className = "modal-ov pg-less-ov";
  const body = payload.content.endsWith("\n") ? payload.content.slice(0, -1) : payload.content;
  ov.innerHTML = `
    <div class="pg-less-modal">
      <pre class="pg-less-content">${esc(body)}</pre>
      <div class="pg-less-foot">
        <span class="pg-less-filename">${esc(payload.path)}</span>
        <span class="pg-less-end">(END)</span>
        <button type="button" class="pg-less-btn" id="scn-less-close">閉じる (q)</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const close = () => { ov.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if(e.key === "q") close(); };
  document.addEventListener("keydown", onKey);
  ov.querySelector("#scn-less-close").onclick = close;
  ov.addEventListener("click", (e) => { if(e.target === ov) close(); });
}

// crontab -e：nanoと同じ操作感の疑似エディタ。保存時にcron書式として
// パースし、有効な行だけを shellState.cronJobs へ反映する
function openCrontabModal(session, hooks, payload){
  const ov = document.createElement("div");
  ov.className = "modal-ov pg-nano-ov";
  ov.innerHTML = `
    <div class="pg-nano-modal">
      <div class="pg-nano-head">crontab -e &nbsp; <span class="pg-muted">（分 時 日 月 曜日 コマンド）</span></div>
      <textarea class="pg-nano-textarea" id="scn-cron-textarea" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="例: 0 8 * * * /home/student/test/test.txt">${esc(payload.content)}</textarea>
      <div class="pg-nano-status" id="scn-cron-status">&nbsp;</div>
      <div class="pg-nano-foot">
        <button type="button" class="pg-nano-btn" id="scn-cron-save">^O 保存</button>
        <button type="button" class="pg-nano-btn pg-nano-btn--exit" id="scn-cron-exit">^X 終了</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const ta = ov.querySelector("#scn-cron-textarea");
  const status = ov.querySelector("#scn-cron-status");
  const save = () => {
    const { jobs, errors } = parseCrontabText(ta.value);
    session.shellState.cronJobs = jobs;
    status.textContent = errors.length
      ? `[ ${jobs.length}件を保存しました（${errors.length}行は形式が不正なため無視されました） ]`
      : `[ ${jobs.length}件のジョブを保存しました ]`;
    hooks.onExecuted();
  };
  const exit = () => { ov.remove(); renderTerminalBody(session, hooks); };
  ov.querySelector("#scn-cron-save").onclick = save;
  ov.querySelector("#scn-cron-exit").onclick = exit;
  ta.addEventListener("keydown", (e) => {
    if(e.ctrlKey && (e.key === "o" || e.key === "O")){ e.preventDefault(); save(); }
    else if(e.ctrlKey && (e.key === "x" || e.key === "X")){ e.preventDefault(); exit(); }
  });
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}

// ------------------------------------------------------------------------
// CommandInput（Enter送信・↑↓履歴・Tab補完・Ctrl+C）
// ------------------------------------------------------------------------
function historyStep(session, input, dir){
  const v = dir < 0 ? session.history.prev(input.value) : session.history.next();
  if(v !== null){
    input.value = v;
    requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
  }
}

function tabComplete(session, input){
  const pos = input.selectionStart ?? input.value.length;
  const commandNames = [...COMMAND_NAMES, ...session.shellState.aliases.keys()];
  const result = getCompletions(input.value, pos, { vfs: session.vfs, commandNames });
  if(result.completion){
    const before = input.value.slice(0, result.wordStart);
    const after = input.value.slice(pos);
    input.value = before + result.completion + after;
    const newPos = before.length + result.completion.length;
    requestAnimationFrame(() => input.setSelectionRange(newPos, newPos));
  } else if(result.matches.length > 1){
    appendRecords(session, [{ kind: "line", tokens: [{ text: result.matches.map(m => m.label).join("  ") }] }]);
  }
}

function ctrlC(session, input){
  appendRecords(session, [{ kind: "cmd", promptPath: session.vfs.promptPath(), text: `${input.value}^C` }]);
  input.value = "";
}

function wireCommandInput(session, hooks){
  const form = app.querySelector("#scn-term-input-form");
  const input = app.querySelector("#scn-term-input");
  if(!form || !input) return;
  form.onsubmit = (e) => {
    e.preventDefault();
    const raw = input.value;
    if(!raw.trim()) return;
    input.value = "";
    runCommand(session, hooks, raw);
  };
  input.onkeydown = (e) => {
    if(e.key === "Tab"){ e.preventDefault(); tabComplete(session, input); }
    else if(e.key === "ArrowUp"){ e.preventDefault(); historyStep(session, input, -1); }
    else if(e.key === "ArrowDown"){ e.preventDefault(); historyStep(session, input, 1); }
    else if(e.key === "c" && e.ctrlKey){ e.preventDefault(); ctrlC(session, input); }
  };
}

export function wireTerminalTap(){
  const el = termBodyEl();
  if(!el) return;
  el.addEventListener("click", (e) => {
    if(e.target.closest(".pg-term-send-btn")) return;
    const input = app.querySelector("#scn-term-input");
    if(input && document.activeElement !== input) input.focus();
  });
}

export function wireTermKeys(session){
  const bind = (id, handler) => {
    const btn = app.querySelector(id);
    if(!btn) return;
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const input = app.querySelector("#scn-term-input");
      if(!input) return;
      input.focus();
      handler(input);
    });
  };
  bind("#scn-key-tab", (input) => tabComplete(session, input));
  bind("#scn-key-up", (input) => historyStep(session, input, -1));
  bind("#scn-key-down", (input) => historyStep(session, input, 1));
  bind("#scn-key-ctrlc", (input) => ctrlC(session, input));
}
