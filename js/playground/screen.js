/* =========================================================================
   🐧 Linux プレイグラウンド — 専用フルスクリーン画面（PlaygroundScreen）
   実OS・Dockerには一切アクセスせず、ブラウザのメモリ上だけで完結する
   仮想Linux環境（VirtualFileSystem + ShellState）に対して、LPIC Level1で
   学習する範囲を中心としたコマンド（commands/配下、レジストリはcommands/
   index.js）を解釈・実行する学習用サンドボックス。

   このファイルが担う「コンポーネント」：
     ・Terminal        … renderTerminalBody() / appendTerminalRecords()
     ・CommandInput     … アプリ内キーボード方式の疑似入力（liveBuffer/
                          liveCursor・履歴・Tab補完・Ctrl修飾・アプリ内
                          キーボード）。システムキーボードは一切使わない。
     ・CategoryTabs     … renderCategoryTabs()（ミッションのカテゴリ切替）
     ・MissionCard      … renderMissionCard()
     ・HintCard         … renderHintCard()
     ・nano/lessの疑似エディタ／ページャ（openNanoModal/openLessModal）

   状態そのもの（vfs/shellState/history/ミッション進捗）は持たず、すべて
   playgroundState.js（合成ルート）のシングルトンを参照する。Firestoreへの
   保存・復元は cloudSync.js が担当し、このファイルは「復元されたら画面を
   描き直す」「操作のたびに保存をスケジュールする」という接続点だけを持つ。
   ========================================================================= */
import { esc } from '../core.js';
import { app } from '../render.js';
import { S, state } from '../state.js';
import { parseCommand } from './commandParser.js';
import { executeCommand } from './commandExecutor.js';
import { getCompletions } from './completion.js';
import { MISSION_CATEGORIES, MISSIONS_BY_CATEGORY, categoryProgress, currentMissionFor } from './missions/index.js';
import { history, missionProgress, resetAll, vfs, shellState } from './playgroundState.js';
import { pgSaveNow, pgScheduleSave } from './cloudSync.js';
import { COMMAND_NAMES } from './commands/index.js';
import { buildTopLines } from './commands/top.js';
import { createAppKeyboard } from './appKeyboard.js';

let answerRevealed = false;
let terminalRecords = []; // {kind:"cmd", promptPath, text} | {kind:"line", tokens}

// アプリ内キーボード方式の入力状態。スマホのシステムキーボードは一切使わず、
// この文字列バッファとカーソル位置だけをターミナル上に描画して「本物の
// ターミナルへ直接入力しているように」見せる（実DOM<input>は存在しない）。
let liveBuffer = "";
let liveCursor = 0;

function welcomeRecord(text){
  return { kind:"line", tokens:[{ text, cls:"pg-muted" }] };
}

function resetTerminal(){
  terminalRecords = [
    welcomeRecord("student ホームディレクトリへようこそ。help と入力すると使えるコマンド一覧を確認できます（Tabキーで補完、| でパイプ、> でリダイレクトも使えます）。"),
  ];
  liveBuffer = "";
  liveCursor = 0;
  appKeyboard.reset();
}

// コマンド実行・ミッション切替・ヒント表示などの「その場での差し替え」
// 操作が、フォーカスされていたボタンの消滅（iOS Safariが要素の消失時に
// スクロール位置を見失う挙動）や、DOM更新（要素の追加・置き換えによる
// 高さの変化）につられてページを勝手にスクロールさせないようにするための
// ガード。ページ全体の縦横スクロール位置に加えて、renderCategoryTabs()が
// innerHTMLで丸ごと作り直す「ファイル内容操作」などのカテゴリタブ列
// （#pg-cat-tabs）自身の横スクロール位置も、作り直しのたびにリセットされて
// しまうため、ここで合わせて保存・復元する。
// ブラウザによっては、この関数の同期処理が終わった後の描画フレームで
// 非同期にスクロール位置を調整し直すことがあるため、同期的な復元1回だけ
// では不十分。次フレーム以降でも重ねて復元することで確実に元の位置へ戻す。
function withScrollPreserved(fn){
  const scroller = document.scrollingElement || document.documentElement;
  const catTabs = app.querySelector("#pg-cat-tabs");
  const x = scroller.scrollLeft, y = scroller.scrollTop;
  const tabsX = catTabs ? catTabs.scrollLeft : null;
  const restore = () => {
    scroller.scrollLeft = x;
    scroller.scrollTop = y;
    if(catTabs && tabsX !== null) catTabs.scrollLeft = tabsX;
  };
  fn();
  restore();
  requestAnimationFrame(restore);
  requestAnimationFrame(() => requestAnimationFrame(restore));
}

// このプレイグラウンド画面内のボタンは、タップ操作すべてを共通してこの
// onPress()経由で扱う（送信▶ボタン・アプリ内キーボードの全キー・カテゴリ
// タブ・ヒント/ミッションカードのボタン）。
// ・clickではなくpointerdownでハンドリングし、preventDefaultすることで、
//   ボタン自身がフォーカスを持つ前に処理を終えられる（wireTermKeysと同じ
//   既存の手法）。
// ・ハンドラ本体を必ずwithScrollPreserved()で包むことで、「個別のボタンで
//   スクロール保護を書き忘れる」という抜け漏れ（Enterキー／▶ボタンでの
//   コマンド実行がこれに該当し、ページが勝手に一番上へ戻る不具合の原因
//   だった）を、共通入口側で構造的に防ぐ。
function onPress(btn, handler){
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    withScrollPreserved(handler);
  });
}

// このLinuxプレイグラウンド画面の中でだけ効く、最後の保険。原因を問わず
// （個別のフォーカス対策で拾いきれなかったケースも含めて）画面内のどこを
// タップしてもページのスクロール位置が勝手に動かないようにする。タップ
// 直前の位置を覚えておき、そのタップに起因する処理が一通り終わった後
// （同期処理の直後・次のフレーム・その次のフレーム）に繰り返し復元する。
function installScrollGuard(root){
  if(!root) return;
  const scroller = () => document.scrollingElement || document.documentElement;
  let guardY = null;
  const capture = () => { guardY = scroller().scrollTop; };
  const restore = () => { if(guardY !== null) scroller().scrollTop = guardY; };
  root.addEventListener("pointerdown", capture, true);
  root.addEventListener("click", () => {
    restore();
    requestAnimationFrame(restore);
    requestAnimationFrame(() => requestAnimationFrame(restore));
  }, true);
}

// ------------------------------------------------------------------------
// Terminal
// ------------------------------------------------------------------------
function tokensToHTML(tokens){
  return tokens.map(t => `<span${t.cls ? ` class="${t.cls}"` : ""}>${esc(t.text)}</span>`).join("");
}

function recordToHTML(record){
  if(record.kind === "cmd"){
    return `<div class="pg-term-line"><span class="pg-term-prompt">student@linux:${esc(record.promptPath)}$</span> <span class="pg-term-cmd">${esc(record.text)}</span></div>`;
  }
  return `<div class="pg-term-line">${tokensToHTML(record.tokens)}</div>`;
}

function terminalBodyEl(){ return app.querySelector("#pg-terminal-body"); }

function isNearBottom(el){ return el.scrollHeight - el.scrollTop - el.clientHeight < 40; }

// バッファ＋カーソル位置だけをもとに、あたかも本物の<input>があるかのような
// 見た目（緑の点滅カーソルがテキストの途中にも置ける）を描画する。実際の
// フォーカス可能な入力要素は存在しないため、システムキーボードは絶対に
// 開かない。実行は右側の送信ボタン、またはアプリ内キーボードのEnterで行う。
function liveLineHTML(){
  const before = esc(liveBuffer.slice(0, liveCursor));
  const after = esc(liveBuffer.slice(liveCursor));
  return `<div class="pg-term-line pg-term-live" id="pg-term-live">
    <span class="pg-term-prompt">student@linux:${esc(vfs.promptPath())}$</span>
    <span class="pg-term-input-display" id="pg-term-input-display">${before}<span class="pg-term-cursor" id="pg-term-cursor"></span>${after}</span>
    <button type="button" class="pg-term-send-btn" id="pg-term-send-btn" aria-label="実行">▶</button>
  </div>`;
}

// 送信ボタンはonPressで常にフォーカスを持たせない。それに加えて、送信
// ボタン自身（＝ライブ行のDOMノード）を初回作成後は二度と作り直さない
// （updateLiveLine()は中身のテキストだけを書き換える）ことで、そもそも
// 「フォーカス中の要素がDOMから消える」状況自体を起こさせない。
function wireLiveLineButton(){
  const btn = app.querySelector("#pg-term-send-btn");
  if(btn) onPress(btn, () => submitLiveCommand());
}

function renderTerminalBody(){
  const el = terminalBodyEl();
  if(!el) return;
  el.innerHTML = terminalRecords.map(recordToHTML).join("") + liveLineHTML();
  el.scrollTop = el.scrollHeight;
  wireLiveLineButton();
}

// 入力バッファが変わるたび（文字入力・矢印移動・履歴呼び出し等）に、
// ライブ行の表示テキスト（#pg-term-input-display の中身）だけを書き換える。
// プロンプトや送信ボタンを含む行そのものは作り直さないため、ページの
// スクロール位置にもフォーカスにも一切影響しない。
function updateLiveLine(){
  const el = terminalBodyEl();
  if(!el) return;
  const wasNearBottom = isNearBottom(el);
  const display = el.querySelector("#pg-term-input-display");
  if(display){
    const before = esc(liveBuffer.slice(0, liveCursor));
    const after = esc(liveBuffer.slice(liveCursor));
    display.innerHTML = `${before}<span class="pg-term-cursor" id="pg-term-cursor"></span>${after}`;
  } else {
    el.insertAdjacentHTML("beforeend", liveLineHTML());
    wireLiveLineButton();
  }
  if(wasNearBottom) el.scrollTop = el.scrollHeight;
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
// pipeline: CommandExecutorが返す展開済みパイプライン（alias展開後）
// raw: 実際に入力された文字列そのもの（alias展開前）
// isError: 標準エラー出力が1行でもあったか
function evaluateMission(pipeline, raw, isError){
  const mission = currentMissionFor(missionProgress.activeCategory, missionProgress.clearedIds);
  if(!mission) return;
  const ctx = { vfs, state: shellState, pipeline, raw, isError };
  let passed = false;
  try{ passed = !!mission.check(ctx); }catch(e){ passed = false; }
  if(!passed) return;
  missionProgress.markCleared(mission.id);
  answerRevealed = false;
  const { done, total } = categoryProgress(missionProgress.activeCategory, missionProgress.clearedIds);
  const categoryDone = done >= total;
  appendTerminalRecords([
    { kind:"line", tokens:[{ text: categoryDone ? "🎉 このカテゴリのミッションをすべて達成しました！" : "✅ Mission Complete!", cls:"pg-mission-toast" }] },
  ]);
  // コマンド実行の結果としてカテゴリタブ／カードが差し替わる場合も、
  // ページのスクロール位置が勝手に動かないようにする
  withScrollPreserved(() => {
    renderCategoryTabs();
    renderMissionCard();
    renderHintCard();
  });
}

// ------------------------------------------------------------------------
// コマンド実行（CommandInputからの送信を受ける入り口）
// ------------------------------------------------------------------------
function runCommand(raw){
  const promptPath = vfs.promptPath();
  history.push(raw);
  const pipeline = parseCommand(raw); // raw is guaranteed non-blank by the caller
  if(!pipeline) return;
  const result = executeCommand({ vfs, state: shellState, history: history.items }, pipeline);
  evaluateMission(result.pipeline || pipeline, raw, !!result.isError);
  pgScheduleSave();
  if(result.clear){
    clearTerminal();
    return;
  }
  const records = [{ kind:"cmd", promptPath, text: raw }];
  (result.lines || []).forEach(tokens => records.push({ kind:"line", tokens }));
  (result.err || []).forEach(tokens => records.push({ kind:"line", tokens }));
  appendTerminalRecords(records);
  if(result.overlay) openCommandOverlay(result.overlay);
}

// ------------------------------------------------------------------------
// nano（簡易版）／ less のオーバーレイ画面
// ------------------------------------------------------------------------
function openCommandOverlay(overlay){
  if(overlay.type === "nano") openNanoModal(overlay);
  else if(overlay.type === "less") openLessModal(overlay);
  else if(overlay.type === "top") openTopModal();
}

function openNanoModal(payload){
  const ov = document.createElement("div");
  ov.className = "modal-ov pg-nano-ov";
  ov.innerHTML = `
    <div class="pg-nano-modal">
      <div class="pg-nano-head">GNU nano &nbsp; ${esc(payload.path)}</div>
      <textarea class="pg-nano-textarea" id="pg-nano-textarea" autocapitalize="off" autocorrect="off" spellcheck="false">${esc(payload.content)}</textarea>
      <div class="pg-nano-status" id="pg-nano-status">&nbsp;</div>
      <div class="pg-nano-foot">
        <button type="button" class="pg-nano-btn" id="pg-nano-save">^O 保存</button>
        <button type="button" class="pg-nano-btn pg-nano-btn--exit" id="pg-nano-exit">^X 終了</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const ta = ov.querySelector("#pg-nano-textarea");
  const status = ov.querySelector("#pg-nano-status");
  const save = () => {
    const res = vfs.writeFile(payload.path, ta.value, { append:false });
    status.textContent = res.error ? `[ 保存に失敗しました: ${payload.path} ]` : `[ ${payload.path} に書き込みました ]`;
    if(!res.error){
      // nanoでの保存は通常のコマンド実行と違う経路なので、ここでも
      // ミッション判定とクラウド保存のスケジュールを明示的に行う
      evaluateMission([{ cmd:"nano", args:[payload.path], redirect:null, append:false, inputRedirect:null }], `nano ${payload.path}`, false);
      pgScheduleSave();
    }
  };
  const exit = () => {
    ov.remove();
    renderTerminalBody();
  };
  ov.querySelector("#pg-nano-save").onclick = save;
  ov.querySelector("#pg-nano-exit").onclick = exit;
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
        <button type="button" class="pg-less-btn" id="pg-less-close">閉じる (q)</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const close = () => { ov.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if(e.key === "q") close(); };
  document.addEventListener("keydown", onKey);
  ov.querySelector("#pg-less-close").onclick = close;
  ov.addEventListener("click", (e) => { if(e.target === ov) close(); });
}

// top（フルスクリーン疑似ターミナル）：実際のtopのように、開いている間は
// 約1秒ごとに画面内容だけを書き換え続ける（オーバーレイ自体は作り直さない）。
// qで終了、kでPID指定のプロセス終了（学習用の疑似killなので実害はない）。
// q/kのキー入力はdocumentへのkeydownリスナーで捕まえており、通常のコマンド
// 入力（liveBuffer/アプリ内キーボード）とは完全に分離して扱う。
function topFootHintHTML(){
  return `<span class="pg-top-hint">自動更新中（約1秒ごと）</span>
    <button type="button" class="pg-top-btn" id="pg-top-kill-btn">k キル</button>
    <button type="button" class="pg-top-btn" id="pg-top-quit-btn">q 終了</button>`;
}

function topFootKillHTML(){
  return `<span class="pg-top-kill-label">PID to kill:</span>
    <input type="text" inputmode="numeric" pattern="[0-9]*" class="pg-top-kill-input" id="pg-top-kill-input" autocomplete="off">
    <button type="button" class="pg-top-kill-ok" id="pg-top-kill-ok">送信</button>`;
}

function openTopModal(){
  const ov = document.createElement("div");
  ov.className = "modal-ov pg-top-ov";
  ov.innerHTML = `
    <div class="pg-top-modal">
      <pre class="pg-top-content" id="pg-top-content"></pre>
      <div class="pg-top-foot" id="pg-top-foot"></div>
    </div>`;
  document.body.appendChild(ov);
  const contentEl = ov.querySelector("#pg-top-content");
  const footEl = ov.querySelector("#pg-top-foot");
  let killMode = false;
  let msgTimer = null;
  let timer = null;

  const draw = () => {
    contentEl.textContent = buildTopLines(shellState).map(tokens => tokens.map(t => t.text).join("")).join("\n");
  };

  const showHint = () => {
    killMode = false;
    clearTimeout(msgTimer);
    footEl.innerHTML = topFootHintHTML();
    footEl.querySelector("#pg-top-kill-btn").onclick = () => showKillPrompt();
    footEl.querySelector("#pg-top-quit-btn").onclick = () => close();
  };

  const showMessage = (text) => {
    footEl.innerHTML = `<span class="pg-top-msg">${esc(text)}</span>`;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(showHint, 1500);
  };

  const showKillPrompt = () => {
    killMode = true;
    footEl.innerHTML = topFootKillHTML();
    const input = footEl.querySelector("#pg-top-kill-input");
    const submit = () => {
      const raw = input.value;
      const pid = parseInt(raw, 10);
      if(!raw || Number.isNaN(pid)){ showHint(); return; }
      const killed = shellState.killPid(pid);
      draw();
      showMessage(killed ? `Signal 15 (TERM) を PID ${pid} に送信しました` : `kill: (${pid}) - No such process`);
    };
    footEl.querySelector("#pg-top-kill-ok").onclick = submit;
    input.addEventListener("input", () => { input.value = input.value.replace(/\D/g, ""); });
    input.addEventListener("keydown", (e) => {
      if(e.key === "Enter"){ e.preventDefault(); submit(); }
      else if(e.key === "Escape"){ e.preventDefault(); showHint(); }
    });
    input.focus();
  };

  const close = () => {
    clearInterval(timer);
    clearTimeout(msgTimer);
    document.removeEventListener("keydown", onKey);
    ov.remove();
    renderTerminalBody();
  };

  const onKey = (e) => {
    if(killMode) return; // killモード中はPID入力欄側で処理する
    if(e.key === "q"){ e.preventDefault(); close(); }
    else if(e.key === "k"){ e.preventDefault(); showKillPrompt(); }
  };

  draw();
  showHint();
  timer = setInterval(draw, 1000);
  document.addEventListener("keydown", onKey);
}

// ------------------------------------------------------------------------
// CommandInput（バッファ操作。実行は▶ボタンまたはアプリ内キーボードの
// Enterで行う。↑↓は履歴、Tabは補完、Ctrlは次の文字と組み合わせる修飾キー）
// ------------------------------------------------------------------------
function insertText(str){
  liveBuffer = liveBuffer.slice(0, liveCursor) + str + liveBuffer.slice(liveCursor);
  liveCursor += str.length;
  updateLiveLine();
}

function backspaceChar(){
  if(liveCursor <= 0) return;
  liveBuffer = liveBuffer.slice(0, liveCursor - 1) + liveBuffer.slice(liveCursor);
  liveCursor -= 1;
  updateLiveLine();
}

function moveCursor(delta){
  liveCursor = Math.max(0, Math.min(liveBuffer.length, liveCursor + delta));
  updateLiveLine();
}

function historyStep(dir){
  const v = dir < 0 ? history.prev(liveBuffer) : history.next();
  if(v !== null){
    liveBuffer = v;
    liveCursor = liveBuffer.length;
    updateLiveLine();
  }
}

function tabComplete(){
  const commandNames = [...COMMAND_NAMES, ...shellState.aliases.keys()];
  const result = getCompletions(liveBuffer, liveCursor, { vfs, commandNames });
  if(result.completion){
    const before = liveBuffer.slice(0, result.wordStart);
    const after = liveBuffer.slice(liveCursor);
    liveBuffer = before + result.completion + after;
    liveCursor = before.length + result.completion.length;
    updateLiveLine();
  } else if(result.matches.length > 1){
    appendTerminalRecords([{ kind:"line", tokens:[{ text: result.matches.map(m => m.label).join("  ") }] }]);
  }
}

function ctrlC(){
  appendTerminalRecords([{ kind:"cmd", promptPath: vfs.promptPath(), text: `${liveBuffer}^C` }]);
  liveBuffer = "";
  liveCursor = 0;
  updateLiveLine();
}

function submitLiveCommand(){
  const raw = liveBuffer;
  if(!raw.trim()) return;
  liveBuffer = "";
  liveCursor = 0;
  updateLiveLine();
  runCommand(raw);
}

// 黒いターミナル部分をタップした時だけ、アプリ内キーボードを開く。
// システムキーボードにつながるフォーカス移動は一切行わない。
function wireTerminalTap(){
  const el = terminalBodyEl();
  if(!el) return;
  el.addEventListener("click", (e) => {
    if(e.target.closest(".pg-term-send-btn")) return;
    if(!appKeyboard.isOpen()) appKeyboard.setOpen(true);
  });
}

// コマンドチップ（よく使うコマンド）はターミナルの入力バッファへ文字列を
// 差し込むだけ。実行はしない。フォーカス移動を一切行わないため、システム
// キーボードは開かず、画面がスクロールすることもない。
function setChipBuffer(cmd, needsArg){
  liveBuffer = needsArg ? cmd + " " : cmd;
  liveCursor = liveBuffer.length;
  updateLiveLine();
}

function escKey(){
  liveBuffer = "";
  liveCursor = 0;
  updateLiveLine();
}

// アプリ内キーボード本体（見た目・押下判定・記号の長押しなど）は
// appKeyboard.js に集約されている。ここではバッファ操作の実体だけを
// コールバックとして渡す。
const appKeyboard = createAppKeyboard({
  idPrefix: "pg",
  getRoot: () => app,
  withScrollPreserved,
  actions: {
    insertChar: (ch) => insertText(ch),
    backspace: () => backspaceChar(),
    moveCursor: (delta) => moveCursor(delta),
    historyStep: (dir) => historyStep(dir),
    tabComplete: () => tabComplete(),
    ctrlC: () => ctrlC(),
    clearTerminal: () => clearTerminal(),
    submit: () => submitLiveCommand(),
    escKey: () => escKey(),
    insertChip: (cmd, needsArg) => setChipBuffer(cmd, needsArg),
  },
});
resetTerminal();

// ------------------------------------------------------------------------
// CategoryTabs / MissionCard / HintCard
// ------------------------------------------------------------------------
function renderCategoryTabs(){
  const el = app.querySelector("#pg-cat-tabs");
  if(!el) return;
  el.innerHTML = MISSION_CATEGORIES.map(c => {
    const { done, total } = categoryProgress(c.key, missionProgress.clearedIds);
    const active = c.key === missionProgress.activeCategory ? " pg-cat-tab--active" : "";
    const complete = done >= total ? " pg-cat-tab--done" : "";
    return `<button type="button" class="pg-cat-tab${active}${complete}" data-pg-cat="${c.key}">
      <span class="pg-cat-tab-ico">${c.icon}</span>
      <span class="pg-cat-tab-label">${esc(c.label)}</span>
      <span class="pg-cat-tab-count">${done}/${total}</span>
    </button>`;
  }).join("");
  el.querySelectorAll("[data-pg-cat]").forEach(btn => {
    onPress(btn, () => {
      missionProgress.activeCategory = btn.dataset.pgCat;
      answerRevealed = false;
      renderCategoryTabs();
      renderMissionCard();
      renderHintCard();
      pgScheduleSave();
    });
  });
}

function totalMissionProgress(){
  return MISSION_CATEGORIES.reduce((acc, c) => {
    const p = categoryProgress(c.key, missionProgress.clearedIds);
    return { done: acc.done + p.done, total: acc.total + p.total };
  }, { done:0, total:0 });
}

function renderMissionCard(){
  const el = app.querySelector("#pg-mission-card");
  if(!el) return;
  const catMeta = MISSION_CATEGORIES.find(c => c.key === missionProgress.activeCategory) || MISSION_CATEGORIES[0];
  const total = (MISSIONS_BY_CATEGORY[catMeta.key] || []).length;
  const mission = currentMissionFor(catMeta.key, missionProgress.clearedIds);
  const { done: totalDone, total: totalAll } = totalMissionProgress();
  if(!mission){
    el.innerHTML = `
      <div class="pg-card-head"><span class="pg-card-ico">🎯</span><span class="pg-card-title">${esc(catMeta.label)}</span><span class="pg-card-badge pg-card-badge--done">Complete</span></div>
      <div class="pg-card-body">🎉 ${esc(catMeta.label)}の全 ${total} 問を達成しました！（全体: ${totalDone}/${totalAll}）他のカテゴリにも挑戦してみましょう。</div>`;
    return;
  }
  const idx = (MISSIONS_BY_CATEGORY[catMeta.key] || []).findIndex(m => m.id === mission.id);
  el.innerHTML = `
    <div class="pg-card-head"><span class="pg-card-ico">🎯</span><span class="pg-card-title">${esc(catMeta.label)}</span><span class="pg-card-badge">${idx+1}/${total}</span></div>
    <div class="pg-card-body">${esc(mission.title)}</div>
    <button type="button" class="cta pg-card-btn" id="pg-mission-hint-btn">${answerRevealed ? "答えを隠す" : "ヒントを見る"}</button>`;
  const btn = el.querySelector("#pg-mission-hint-btn");
  if(btn) onPress(btn, () => { answerRevealed = !answerRevealed; renderMissionCard(); renderHintCard(); });
}

function renderHintCard(){
  const el = app.querySelector("#pg-hint-card");
  if(!el) return;
  const mission = currentMissionFor(missionProgress.activeCategory, missionProgress.clearedIds);
  if(!mission){
    el.innerHTML = `
      <div class="pg-card-head"><span class="pg-card-ico">💡</span><span class="pg-card-title">ヒント</span></div>
      <div class="pg-card-body pg-muted-text">お疲れさまでした。上のタブから他のカテゴリにも挑戦できます。「リセット」から何度でも練習できます。</div>`;
    return;
  }
  el.innerHTML = `
    <div class="pg-card-head"><span class="pg-card-ico">💡</span><span class="pg-card-title">ヒント</span></div>
    <div class="pg-card-body">${esc(mission.hint)}</div>
    ${answerRevealed ? `<div class="pg-answer">正解: <code>${esc(mission.answer)}</code><div class="pg-answer-explain">${esc(mission.explanation || "")}</div></div>` : ""}
    <button type="button" class="ghost pg-card-btn" id="pg-hint-answer-btn">${answerRevealed ? "答えを隠す" : "答えを見る"}</button>`;
  const btn = el.querySelector("#pg-hint-answer-btn");
  if(btn) onPress(btn, () => { answerRevealed = !answerRevealed; renderMissionCard(); renderHintCard(); });
}

// ------------------------------------------------------------------------
// 同期ステータス（ログイン中は自動保存、ゲストモードでは保存されない旨を表示）
// ------------------------------------------------------------------------
function renderSyncNote(){
  const el = app.querySelector("#pg-sync-note");
  if(!el) return;
  if(state.guestMode || !state.currentUser){
    el.textContent = "👤 ゲストモード：進捗はこの端末に留まり、閉じると失われます（ログインすると自動保存されます）";
    el.classList.add("pg-sync-note--guest");
  } else {
    el.textContent = "☁️ ログイン中：操作内容は自動的にクラウドへ保存され、次回ログイン時に復元されます";
    el.classList.remove("pg-sync-note--guest");
  }
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
          <div class="rules-text">本物のLinux／Dockerには一切アクセスしない、ブラウザ上だけで動く仮想の学習環境です。LPIC Level1で学習する範囲を中心に、実際のLinuxに近い書式・エラーメッセージを再現しています。安心してコマンドを試せます。</div>
        </div>
        <div class="rules-section">
          <div class="rules-section-title">⌨️ 対応コマンド</div>
          <div class="rules-text">ファイル操作・テキスト処理・パーミッション・プロセス／リソース確認・シェル操作など50種類近くに対応しています。ターミナルに <code>help</code> と入力すると一覧を、<code>man コマンド名</code> と入力すると詳しい使い方を確認できます。</div>
        </div>
        <div class="rules-section">
          <div class="rules-section-title">🔧 便利な機能</div>
          <ul class="rules-list">
            <li><b>Tab補完</b> … コマンド名やファイル名を入力途中でTabキー（画面下の「Tab」ボタンでも可）を押すと補完できます</li>
            <li><b>↑ / ↓</b> … 入力履歴を呼び出せます（画面下のボタンでも可）</li>
            <li><code>|</code> パイプ … <code>cat file | grep 語句</code> のように前のコマンドの出力を次のコマンドへ渡せます</li>
            <li><code>&gt;</code> / <code>&gt;&gt;</code> リダイレクト … コマンドの出力をファイルへ書き込み／追記できます</li>
            <li><code>&lt;</code> 入力リダイレクト・<code>tee</code> … ファイルを標準入力として渡したり、出力を画面とファイルの両方へ書き出せます</li>
          </ul>
        </div>
        <div class="rules-section">
          <div class="rules-section-title">🎯 ミッション</div>
          <div class="rules-text">画面上部のタブでカテゴリ（ファイル操作・検索・権限など）を切り替えながら、初級〜中級の100問以上のミッションに挑戦できます。行き詰まったらヒントカードの「答えを見る」で正解コマンドと解説を確認できます。</div>
        </div>
        <div class="rules-section">
          <div class="rules-section-title">☁️ 進捗の保存</div>
          <div class="rules-text">ログインしている場合、ファイルシステムの状態・環境変数・コマンド履歴・ミッションの進捗はすべて自動的にクラウドへ保存されます。ブラウザを閉じても、次回ログインしたときに前回の続きから再開できます。ゲストモードでは保存されません。</div>
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
// リセット確認モーダル（進捗を消す破壊的操作のため、ワンタップでは実行しない）
// ------------------------------------------------------------------------
function openResetConfirmModal(){
  const ov = document.createElement("div");
  ov.className = "modal-ov";
  ov.innerHTML = `
    <div class="modal pg-reset-confirm-modal">
      <div class="modal-title">🔄 リセットしますか？</div>
      <div class="rules-text">ファイルシステム・環境変数・コマンド履歴・ミッションの進捗（クラウドに保存済みの内容も含む）がすべて初期状態に戻ります。この操作は取り消せません。</div>
      <div class="pg-reset-confirm-actions">
        <button type="button" class="ghost pg-card-btn" id="pg-reset-cancel">キャンセル</button>
        <button type="button" class="cta pg-card-btn pg-reset-confirm-btn" id="pg-reset-ok">リセットする</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.querySelector("#pg-reset-cancel").onclick = close;
  ov.querySelector("#pg-reset-ok").onclick = () => {
    close();
    resetAll();
    resetTerminal();
    answerRevealed = false;
    pgSaveNow();
    renderPlaygroundScreen();
  };
  ov.addEventListener("click", (e) => { if(e.target === ov) close(); });
}

// ------------------------------------------------------------------------
// クラウド復元フック（render.js の applyCloudPlayground から呼ばれる）
// ------------------------------------------------------------------------
export function pgOnCloudRestored(){
  answerRevealed = false;
  resetTerminal();
  terminalRecords.push(welcomeRecord("☁️ 前回の続きを復元しました。"));
  if(S.screen === "playground") renderPlaygroundScreen();
}

// ------------------------------------------------------------------------
// 画面エントリポイント（render.jsのrender()ディスパッチから呼ばれる）
// ------------------------------------------------------------------------
export function renderPlaygroundScreen(){
  app.innerHTML = `
  <div class="pg-root" id="pg-root">
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
    <div class="pg-sync-note" id="pg-sync-note"></div>
    <div class="pg-terminal-card">
      <div class="pg-terminal-head">
        <span class="pg-terminal-dots"><span></span><span></span><span></span></span>
        <span class="pg-terminal-title">student@linux</span>
        <button type="button" class="pg-terminal-clear" id="pg-terminal-clear">🗑 クリア</button>
      </div>
      <div class="pg-terminal-body" id="pg-terminal-body"></div>
    </div>
    ${appKeyboard.html()}
    <div class="pg-cat-tabs" id="pg-cat-tabs"></div>
    <div class="pg-cards">
      <div class="pg-card pg-mission-card" id="pg-mission-card"></div>
      <div class="pg-card pg-hint-card" id="pg-hint-card"></div>
    </div>
  </div>
  `;

  renderTerminalBody();
  renderSyncNote();
  renderCategoryTabs();
  renderMissionCard();
  renderHintCard();
  wireTerminalTap();
  appKeyboard.wire();
  installScrollGuard(app.querySelector("#pg-root"));

  const resetBtn = app.querySelector("#pg-reset");
  if(resetBtn) resetBtn.onclick = () => openResetConfirmModal();
  const helpBtn = app.querySelector("#pg-help");
  if(helpBtn) helpBtn.onclick = () => openHelpModal();
  const clearBtn = app.querySelector("#pg-terminal-clear");
  if(clearBtn) clearBtn.onclick = () => withScrollPreserved(() => clearTerminal());

  window.scrollTo(0,0);
}
