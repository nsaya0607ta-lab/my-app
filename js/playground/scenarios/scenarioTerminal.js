/* =========================================================================
   scenarioTerminal — シナリオモード用のターミナルUI。
   見た目・挙動は既存のLinuxプレイグラウンド（js/playground/screen.js）の
   ターミナルと完全に同じ（同じCSSクラス・同じVFS/ShellState/Parser/
   Executorエンジンを利用）だが、既存のミッションモード画面（screen.js）
   は一切変更せずに済むよう、シナリオ用に独立したコンポーネントとして
   用意している。1つの `session`（{vfs, shellState, history, records}）を
   引数に取り、コマンド実行後に onExecuted コールバックを呼ぶことで、
   シナリオ側のゴール判定・進捗保存をフックできるようにしている。

   入力方式・スクロール位置の保護は、ミッションモード（screen.js）で
   実機検証のうえ確立した方式にそろえている：
     ・実DOMの<input>/<form>は一切使わない。liveBuffer/liveCursorという
       ただの文字列＋カーソル位置をターミナル上に描画するだけの疑似入力
       にすることで、システムキーボードの開閉に伴うページの自動スクロール
       （focus()由来）をそもそも起こさせない。
     ・コマンド実行やキー入力などタップで発生する操作はすべてonPress()
       経由（pointerdownでpreventDefault + withScrollPreservedで実行）に
       統一し、ページのスクロール位置を1px単位で保持する。
   ========================================================================= */
import { esc } from '../../core.js';
import { app } from '../../render.js';
import { parseCommand } from '../commandParser.js';
import { executeCommand } from '../commandExecutor.js';
import { getCompletions } from '../completion.js';
import { COMMAND_NAMES } from '../commands/index.js';
import { buildTopLines } from '../commands/top.js';
import { parseCrontabText } from '../cronUtil.js';
import { createAppKeyboard } from '../appKeyboard.js';
import { verifyPassword, applyUserEnv } from '../users.js';
import { humanSize } from '../commands/_util.js';

// アプリ内キーボード方式の入力状態。シナリオは同時に1つしかプレイしない
// ため、screen.js（ミッションモード）と同じくモジュール変数で持てば足りる。
// スマホのシステムキーボードは一切使わず、この文字列バッファとカーソル
// 位置だけをターミナル上に描画して「本物のターミナルへ直接入力している
// ように」見せる（実DOM<input>は存在しない）。
let liveBuffer = "";
let liveCursor = 0;

// su実行中、パスワード入力待ちの状態。null以外の間は、次に送信された1行は
// コマンドではなく「suで切り替えようとしているユーザー名」に対するパスワード
// として扱う（実際のLinuxのsuと同様、入力中は一切エコー表示しない）。
let pendingPassword = null;

function resetLiveInput(){
  liveBuffer = "";
  liveCursor = 0;
  pendingPassword = null;
  appKeyboard.reset();
}

// コマンド実行・ターミナルクリアなどの「その場での差し替え」操作が、DOM
// 更新（要素の追加・置き換えによる高さの変化）につられてページを勝手に
// スクロールさせないようにするためのガード（screen.jsと同じ方式）。
// 同期的な復元1回に加え、ブラウザが描画フレーム側で非同期にスクロール
// 位置を調整し直すケースに備えて次フレーム以降でも重ねて復元する。
export function withScrollPreserved(fn){
  const scroller = document.scrollingElement || document.documentElement;
  const x = scroller.scrollLeft, y = scroller.scrollTop;
  const restore = () => {
    scroller.scrollLeft = x;
    scroller.scrollTop = y;
  };
  fn();
  restore();
  requestAnimationFrame(restore);
  requestAnimationFrame(() => requestAnimationFrame(restore));
}

// このシナリオ画面内のボタン（送信▶ボタン・アプリ内キーボードの全キー）は
// すべてこのonPress()経由で扱う。clickではなくpointerdownでハンドリング
// し、preventDefaultすることでボタン自身がフォーカスを持つ前に処理を
// 終えられる。ハンドラ本体を必ずwithScrollPreserved()で包むことで、
// 個別のボタンで保護を書き忘れる抜け漏れを共通入口側で構造的に防ぐ。
function onPress(btn, handler){
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    withScrollPreserved(handler);
  });
}

// このシナリオ画面の中でだけ効く、最後の保険。原因を問わず画面内のどこを
// タップしてもページのスクロール位置が勝手に動かないようにする。
export function installScrollGuard(root){
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

function tokensToHTML(tokens){
  return tokens.map(t => `<span${t.cls ? ` class="${t.cls}"` : ""}>${esc(t.text)}</span>`).join("");
}

function recordToHTML(record){
  if(record.kind === "cmd"){
    return `<div class="pg-term-line"><span class="pg-term-prompt">${esc(record.promptUser)}@linux:${esc(record.promptPath)}${esc(record.promptChar)}</span> <span class="pg-term-cmd">${esc(record.text)}</span></div>`;
  }
  return `<div class="pg-term-line">${tokensToHTML(record.tokens)}</div>`;
}

function termBodyEl(){ return app.querySelector("#scn-terminal-body"); }
function isNearBottom(el){ return el.scrollHeight - el.scrollTop - el.clientHeight < 40; }

// 現在の実効ユーザー・作業ディレクトリから、実際のプロンプト文字列
// （root は # 、一般ユーザーは $ ）を組み立てる
function promptString(session){
  const user = session.userSession ? session.userSession.current().username : "student";
  const isRoot = session.userSession ? session.userSession.isRoot() : false;
  return `${user}@linux:${session.vfs.promptPath()}${isRoot ? "#" : "$"}`;
}

// バッファ＋カーソル位置だけをもとに、あたかも本物の<input>があるかの
// ような見た目（緑の点滅カーソルがテキストの途中にも置ける）を描画する。
// 実際のフォーカス可能な入力要素は存在しないため、システムキーボードは
// 絶対に開かない。実行は右側の送信ボタン、またはアプリ内キーボードの
// Enterで行う。
function liveLineHTML(session){
  // パスワード入力待ちの間は、実際のLinuxのsuと同様に一切エコーしない
  // （打った文字が見えない。カーソルも動かさず固定表示にする）
  const promptText = pendingPassword ? "Password:" : promptString(session);
  const display = pendingPassword
    ? `<span class="pg-term-cursor" id="scn-term-cursor"></span>`
    : `${esc(liveBuffer.slice(0, liveCursor))}<span class="pg-term-cursor" id="scn-term-cursor"></span>${esc(liveBuffer.slice(liveCursor))}`;
  return `<div class="pg-term-line pg-term-live" id="scn-term-live">
    <span class="pg-term-prompt">${esc(promptText)}</span>
    <span class="pg-term-input-display" id="scn-term-input-display">${display}</span>
    <button type="button" class="pg-term-send-btn" id="scn-term-send-btn" aria-label="実行">▶</button>
  </div>`;
}

// 送信ボタンはonPressで常にフォーカスを持たせない。それに加えて、送信
// ボタン自身（＝ライブ行のDOMノード）を初回作成後は二度と作り直さない
// （updateLiveLine()は中身のテキストだけを書き換える）。
function wireLiveLineButton(session, hooks){
  const btn = app.querySelector("#scn-term-send-btn");
  if(btn) onPress(btn, () => submitLiveCommand(session, hooks));
}

export function renderTerminalBody(session, hooks){
  const el = termBodyEl();
  if(!el) return;
  resetLiveInput();
  el.innerHTML = session.records.map(recordToHTML).join("") + liveLineHTML(session);
  el.scrollTop = el.scrollHeight;
  wireLiveLineButton(session, hooks);
}

// 入力バッファが変わるたび（文字入力・矢印移動・履歴呼び出し等）に、
// ライブ行の表示テキスト（#scn-term-input-display の中身）だけを書き換
// える。プロンプトや送信ボタンを含む行そのものは作り直さないため、ページ
// のスクロール位置にもフォーカスにも一切影響しない。
function updateLiveLine(session, hooks){
  const el = termBodyEl();
  if(!el) return;
  const wasNearBottom = isNearBottom(el);
  const display = el.querySelector("#scn-term-input-display");
  if(display){
    display.innerHTML = pendingPassword
      ? `<span class="pg-term-cursor" id="scn-term-cursor"></span>`
      : `${esc(liveBuffer.slice(0, liveCursor))}<span class="pg-term-cursor" id="scn-term-cursor"></span>${esc(liveBuffer.slice(liveCursor))}`;
  } else {
    el.insertAdjacentHTML("beforeend", liveLineHTML(session));
    wireLiveLineButton(session, hooks);
  }
  if(wasNearBottom) el.scrollTop = el.scrollHeight;
}

// ライブ行のプロンプト文字列とターミナルヘッダのタイトルを、現在の
// session（ユーザー・作業ディレクトリ）に合わせて再描画する。新しい行を
// 追加しない「その場でのプロンプト更新だけ」が必要な場面（su成功時・
// exit時など）で使う。
export function refreshLivePrompt(session){
  const el = termBodyEl();
  if(el){
    const liveEl = el.querySelector(".pg-term-live .pg-term-prompt");
    if(liveEl) liveEl.textContent = pendingPassword ? "Password:" : promptString(session);
  }
  const titleEl = app.querySelector("#scn-terminal-title");
  if(titleEl && session.userSession) titleEl.textContent = `${session.userSession.current().username}@linux`;
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
  refreshLivePrompt(session);
  if(wasNearBottom) el.scrollTop = el.scrollHeight;
}

// システムメッセージ（クリア通知など）を1行追加するだけの軽量ヘルパー
export function pushSystemMessage(session, text, cls){
  appendRecords(session, [{ kind: "line", tokens: [{ text, cls }] }]);
}

export function clearTerminal(session, hooks){
  session.records = [];
  renderTerminalBody(session, hooks);
}

function runCommand(session, hooks, raw){
  const promptUser = session.userSession ? session.userSession.current().username : "student";
  const promptPath = session.vfs.promptPath();
  const promptChar = (session.userSession && session.userSession.isRoot()) ? "#" : "$";
  session.history.push(raw);
  const pipeline = parseCommand(raw);
  if(!pipeline) return;
  const result = executeCommand({ vfs: session.vfs, state: session.shellState, session: session.userSession, history: session.history.items }, pipeline);
  if(result.clear){
    clearTerminal(session, hooks);
    hooks.onExecuted();
    return;
  }
  // su がパスワードを要求した場合、次の1行はコマンドではなくパスワード
  // 入力として扱う（appendRecords()より前にセットし、直後のプロンプト
  // 更新が最初から "Password:" を表示するようにする）
  if(result.awaitPassword) pendingPassword = result.awaitPassword;
  const records = [{ kind: "cmd", promptUser, promptPath, promptChar, text: raw }];
  (result.lines || []).forEach(tokens => records.push({ kind: "line", tokens }));
  (result.err || []).forEach(tokens => records.push({ kind: "line", tokens }));
  appendRecords(session, records);
  if(result.overlay) openCommandOverlay(session, hooks, result.overlay);
  if(result.awaitPassword) updateLiveLine(session, hooks);
  hooks.onExecuted();
}

// su のパスワード入力待ちに対する送信処理。実際のLinuxと同様、パスワードが
// 正しい場合のみユーザーを切り替え、成功時は何も出力しない。誤っている
// 場合は "Authentication failure" とだけ表示し、元のユーザーのままにする。
function submitPassword(session, hooks, rawPassword){
  const targetName = pendingPassword;
  pendingPassword = null;
  const user = session.userSession.find(targetName);
  const ok = verifyPassword(user, rawPassword);
  if(ok){
    session.userSession.switchTo(user.username);
    applyUserEnv(session.vfs, session.shellState, user);
    refreshLivePrompt(session);
  } else {
    appendRecords(session, [{ kind: "line", tokens: [{ text: "su: Authentication failure", cls: "pg-err" }] }]);
  }
  updateLiveLine(session, hooks);
  hooks.onExecuted();
}

// ------------------------------------------------------------------------
// nano / less / crontab -e の疑似オーバーレイ
// ------------------------------------------------------------------------
function openCommandOverlay(session, hooks, overlay){
  if(overlay.type === "nano") openNanoModal(session, hooks, overlay);
  else if(overlay.type === "less") openLessModal(overlay);
  else if(overlay.type === "crontab") openCrontabModal(session, hooks, overlay);
  else if(overlay.type === "top") openTopModal(session);
  else if(overlay.type === "fdisk") openFdiskModal(session, hooks, overlay);
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

// top（フルスクリーン疑似ターミナル）：実際のtopのように、開いている間は
// 約1秒ごとに画面内容だけを書き換え続ける（オーバーレイ自体は作り直さない）。
// qで終了、kでPID指定のプロセス終了（学習用の疑似killなので実害はない）。
// q/kのキー入力はdocumentへのkeydownリスナーで捕まえており、通常のコマンド
// 入力（#scn-term-input）とは完全に分離して扱う。
function topFootHintHTML(){
  return `<span class="pg-top-hint">自動更新中（約1秒ごと）</span>
    <button type="button" class="pg-top-btn" id="scn-top-kill-btn">k キル</button>
    <button type="button" class="pg-top-btn" id="scn-top-quit-btn">q 終了</button>`;
}

function topFootKillHTML(){
  return `<span class="pg-top-kill-label">PID to kill:</span>
    <input type="text" inputmode="numeric" pattern="[0-9]*" class="pg-top-kill-input" id="scn-top-kill-input" autocomplete="off">
    <button type="button" class="pg-top-kill-ok" id="scn-top-kill-ok">送信</button>`;
}

function openTopModal(session){
  const ov = document.createElement("div");
  ov.className = "modal-ov pg-top-ov";
  ov.innerHTML = `
    <div class="pg-top-modal">
      <pre class="pg-top-content" id="scn-top-content"></pre>
      <div class="pg-top-foot" id="scn-top-foot"></div>
    </div>`;
  document.body.appendChild(ov);
  const contentEl = ov.querySelector("#scn-top-content");
  const footEl = ov.querySelector("#scn-top-foot");
  let killMode = false;
  let msgTimer = null;
  let timer = null;

  const draw = () => {
    contentEl.textContent = buildTopLines(session.shellState).map(tokens => tokens.map(t => t.text).join("")).join("\n");
  };

  const showHint = () => {
    killMode = false;
    clearTimeout(msgTimer);
    footEl.innerHTML = topFootHintHTML();
    footEl.querySelector("#scn-top-kill-btn").onclick = () => showKillPrompt();
    footEl.querySelector("#scn-top-quit-btn").onclick = () => close();
  };

  const showMessage = (text) => {
    footEl.innerHTML = `<span class="pg-top-msg">${esc(text)}</span>`;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(showHint, 1500);
  };

  const showKillPrompt = () => {
    killMode = true;
    footEl.innerHTML = topFootKillHTML();
    const input = footEl.querySelector("#scn-top-kill-input");
    const submit = () => {
      const raw = input.value;
      const pid = parseInt(raw, 10);
      if(!raw || Number.isNaN(pid)){ showHint(); return; }
      const killed = session.shellState.killPid(pid);
      draw();
      showMessage(killed ? `Signal 15 (TERM) を PID ${pid} に送信しました` : `kill: (${pid}) - No such process`);
    };
    footEl.querySelector("#scn-top-kill-ok").onclick = submit;
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

// fdisk（対話式パーティション編集）：実際のfdiskと同様、1行ずつコマンド／
// 値を入力していく対話セッションをそのまま再現する。n（新規パーティション）
// →p（基本パーティション）→パーティション番号→開始セクタ→終了セクタ、と
// 段階（stage）を進め、最後にw（書き込み）で初めてshellState.disksへ確定
// する（qで抜けた場合や、書き込み前にモーダルを閉じた場合は一切反映しない
// ＝実際のfdiskの「メモリ上でだけ変更する」という挙動を再現している）。
function openFdiskModal(session, hooks, payload){
  const disk = session.shellState.disks.get(payload.diskName);
  const totalSectors = Math.floor(disk.sizeBytes / 512);
  const defaultFirstSector = 2048;
  const defaultLastSector = totalSectors - 1;
  // 実際のfdiskと同じく「w で書き込むまではメモリ上だけの変更」を再現する
  // ため、確定済みのパーティション一覧とは別に作業用コピーを持つ
  let working = disk.partitions.map(p => ({ ...p }));

  const ov = document.createElement("div");
  ov.className = "modal-ov pg-fdisk-ov";
  ov.innerHTML = `
    <div class="pg-fdisk-modal">
      <pre class="pg-fdisk-content" id="scn-fdisk-content"></pre>
      <div class="pg-fdisk-foot">
        <input type="text" class="pg-fdisk-input" id="scn-fdisk-input" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
        <button type="button" class="pg-fdisk-send" id="scn-fdisk-send">実行</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const contentEl = ov.querySelector("#scn-fdisk-content");
  const input = ov.querySelector("#scn-fdisk-input");

  let stage = "menu";
  let draft = null; // { num, firstSector }
  const outLines = [];

  const print = (text = "") => {
    outLines.push(text);
    contentEl.textContent = outLines.join("\n");
    contentEl.scrollTop = contentEl.scrollHeight;
  };
  // 入力した内容を、直前に出したプロンプト行の末尾へエコーする
  // （実際のターミナルで「プロンプト」に続けて入力が表示されるのと同じ見た目）
  const echo = (raw) => {
    outLines[outLines.length - 1] += raw;
    contentEl.textContent = outLines.join("\n");
  };

  const nextAvailableNum = () => {
    for(let n = 1; n <= 4; n++){ if(!working.some(p => p.num === n)) return n; }
    return null;
  };

  const promptMenu = () => { stage = "menu"; print(""); print("Command (m for help): "); };

  const printTable = () => {
    print("");
    print(`Disk ${disk.device}: ${humanSize(disk.sizeBytes)}, ${disk.sizeBytes} bytes, ${totalSectors} sectors`);
    print("Units: sectors of 1 * 512 = 512 bytes");
    print("Disklabel type: gpt");
    print(`Disk identifier: ${disk.identifier}`);
    if(working.length){
      print("");
      print("Device       Start       End   Sectors  Size Type");
      working.forEach(p => {
        const sectorCount = Math.floor(p.sizeBytes / 512);
        const end = p.firstSector + sectorCount - 1;
        print(`${(disk.device + p.num).padEnd(12)} ${String(p.firstSector).padStart(9)} ${String(end).padStart(9)} ${String(sectorCount).padStart(9)} ${humanSize(p.sizeBytes).padStart(4)} Linux filesystem`);
      });
    }
  };

  const printHelp = () => {
    print("");
    print("Command action");
    print("   n   add a new partition");
    print("   d   delete a partition");
    print("   p   print the partition table");
    print("   w   write table to disk and exit");
    print("   q   quit without saving changes");
    print("   m   print this menu");
  };

  const close = () => { ov.remove(); renderTerminalBody(session, hooks); };

  const write = () => {
    const added = working.filter(w => !disk.partitions.some(p => p.num === w.num));
    if(!added.length){
      print("");
      print("No changes to write. Exiting.");
      close();
      return;
    }
    added.forEach(p => session.shellState.createPartition(payload.diskName, p.num, p.sizeBytes));
    print("");
    print("The partition table has been altered.");
    print("Calling ioctl() to re-read partition table.");
    print("Syncing disks.");
    close();
    hooks.onExecuted();
  };

  const handleMenu = (val) => {
    if(val === "n"){
      const num = nextAvailableNum();
      if(num === null){ print("The partition table already contains 4 partitions. No free slot."); promptMenu(); return; }
      draft = { num };
      print("Partition type");
      print("   p   primary (0 primary, 0 extended, 4 free)");
      print("   e   extended (container for logical partitions)");
      stage = "type";
      print("Select (default p): ");
    } else if(val === "d"){
      if(!working.length){ print("No partition is defined yet!"); promptMenu(); return; }
      working = [];
      print("Partition 1 has been deleted.");
      promptMenu();
    } else if(val === "p"){
      printTable();
      promptMenu();
    } else if(val === "m"){
      printHelp();
      promptMenu();
    } else if(val === "w"){
      write();
    } else if(val === "q"){
      close();
    } else if(val === ""){
      promptMenu();
    } else {
      print(`${val}: unknown command`);
      promptMenu();
    }
  };

  const handleType = (val) => {
    if(val === "" || val === "p"){
      stage = "number";
      print(`Partition number (${draft.num}-4, default ${draft.num}): `);
    } else if(val === "e"){
      print("この演習では基本パーティション（primary）のみ対応しています。p と入力するか、そのままEnterを押してください。");
      print("Select (default p): ");
    } else {
      print("Invalid input, please enter 'p' or 'e'.");
      print("Select (default p): ");
    }
  };

  const handleNumber = (val) => {
    const num = val === "" ? draft.num : parseInt(val, 10);
    if(!Number.isInteger(num) || num < 1 || num > 4 || working.some(p => p.num === num)){
      print("Value out of range or already in use.");
      print(`Partition number (${draft.num}-4, default ${draft.num}): `);
      return;
    }
    draft.num = num;
    stage = "first";
    print(`First sector (${defaultFirstSector}-${defaultLastSector}, default ${defaultFirstSector}): `);
  };

  const handleFirst = (val) => {
    const first = val === "" ? defaultFirstSector : parseInt(val, 10);
    if(!Number.isInteger(first) || first < defaultFirstSector || first > defaultLastSector){
      print("Value out of range.");
      print(`First sector (${defaultFirstSector}-${defaultLastSector}, default ${defaultFirstSector}): `);
      return;
    }
    draft.firstSector = first;
    stage = "last";
    print(`Last sector, +/-sectors or +/-size{K,M,G,T,P} (${first}-${defaultLastSector}, default ${defaultLastSector}): `);
  };

  const handleLast = (val) => {
    let last = defaultLastSector;
    if(val !== ""){
      const n = parseInt(val, 10);
      if(Number.isInteger(n) && n >= draft.firstSector && n <= defaultLastSector) last = n;
    }
    const sizeBytes = (last - draft.firstSector + 1) * 512;
    working.push({ num: draft.num, sizeBytes, firstSector: draft.firstSector, fsType: null });
    working.sort((a, b) => a.num - b.num);
    print("");
    print(`Created a new partition ${draft.num} of type 'Linux filesystem' and of size ${humanSize(sizeBytes)}.`);
    draft = null;
    promptMenu();
  };

  const handleInput = (val) => {
    if(stage === "menu") handleMenu(val);
    else if(stage === "type") handleType(val);
    else if(stage === "number") handleNumber(val);
    else if(stage === "first") handleFirst(val);
    else if(stage === "last") handleLast(val);
  };

  const submit = () => {
    const raw = input.value;
    input.value = "";
    echo(raw);
    handleInput(raw.trim());
  };

  input.addEventListener("keydown", (e) => {
    if(e.key === "Enter"){ e.preventDefault(); submit(); }
    else if(e.key === "Escape"){ e.preventDefault(); close(); }
  });
  ov.querySelector("#scn-fdisk-send").onclick = submit;

  print("Welcome to fdisk (util-linux 2.39.3).");
  print("Changes will remain in memory only, until you decide to write them.");
  print("Be careful before using the write command.");
  promptMenu();
  input.focus();
}

// ------------------------------------------------------------------------
// CommandInput（バッファ操作。実行は▶ボタンまたはアプリ内キーボードの
// Enterで行う。↑↓は履歴、Tabは補完、Ctrlは次の文字と組み合わせる修飾キー）
// ------------------------------------------------------------------------
function insertText(session, hooks, str){
  liveBuffer = liveBuffer.slice(0, liveCursor) + str + liveBuffer.slice(liveCursor);
  liveCursor += str.length;
  updateLiveLine(session, hooks);
}

function backspaceChar(session, hooks){
  if(liveCursor <= 0) return;
  liveBuffer = liveBuffer.slice(0, liveCursor - 1) + liveBuffer.slice(liveCursor);
  liveCursor -= 1;
  updateLiveLine(session, hooks);
}

function moveCursor(session, hooks, delta){
  liveCursor = Math.max(0, Math.min(liveBuffer.length, liveCursor + delta));
  updateLiveLine(session, hooks);
}

function historyStep(session, hooks, dir){
  if(pendingPassword) return; // パスワード入力中は履歴呼び出しを無効化する
  const v = dir < 0 ? session.history.prev(liveBuffer) : session.history.next();
  if(v !== null){
    liveBuffer = v;
    liveCursor = liveBuffer.length;
    updateLiveLine(session, hooks);
  }
}

function tabComplete(session, hooks){
  if(pendingPassword) return; // パスワード入力中はTab補完を無効化する
  const commandNames = [...COMMAND_NAMES, ...session.shellState.aliases.keys()];
  const result = getCompletions(liveBuffer, liveCursor, { vfs: session.vfs, commandNames });
  if(result.completion){
    const before = liveBuffer.slice(0, result.wordStart);
    const after = liveBuffer.slice(liveCursor);
    liveBuffer = before + result.completion + after;
    liveCursor = before.length + result.completion.length;
    updateLiveLine(session, hooks);
  } else if(result.matches.length > 1){
    appendRecords(session, [{ kind: "line", tokens: [{ text: result.matches.map(m => m.label).join("  ") }] }]);
  }
}

function ctrlC(session, hooks){
  if(pendingPassword){
    // パスワード入力中のCtrl+Cは、実際のsuと同様に入力内容を一切見せず
    // 中断だけする（Authentication failureは出さない＝そもそも未確定）
    pendingPassword = null;
    appendRecords(session, [{ kind: "line", tokens: [{ text: "Password: ^C" }] }]);
  } else {
    const promptUser = session.userSession ? session.userSession.current().username : "student";
    const promptChar = (session.userSession && session.userSession.isRoot()) ? "#" : "$";
    appendRecords(session, [{ kind: "cmd", promptUser, promptPath: session.vfs.promptPath(), promptChar, text: `${liveBuffer}^C` }]);
  }
  liveBuffer = "";
  liveCursor = 0;
  updateLiveLine(session, hooks);
}

function submitLiveCommand(session, hooks){
  const raw = liveBuffer;
  if(pendingPassword){
    liveBuffer = "";
    liveCursor = 0;
    submitPassword(session, hooks, raw);
    return;
  }
  if(!raw.trim()) return;
  liveBuffer = "";
  liveCursor = 0;
  updateLiveLine(session, hooks);
  runCommand(session, hooks, raw);
}

// 黒いターミナル部分をタップした時だけ、アプリ内キーボードを開く。
// システムキーボードにつながるフォーカス移動は一切行わない。
export function wireTerminalTap(){
  const el = termBodyEl();
  if(!el) return;
  el.addEventListener("click", (e) => {
    if(e.target.closest(".pg-term-send-btn")) return;
    if(!appKeyboard.isOpen()) appKeyboard.setOpen(true);
  });
}

// アプリ内キーボード本体（見た目・押下判定・記号の長押しなど）は
// screen.js（ミッションモード）と共通のappKeyboard.jsに集約されている。
// シナリオは同時に1つしかプレイしないため、直近に wireKeyboard() へ渡された
// session/hooks をモジュール変数で覚えておき、コールバックから参照する。
let currentSession = null;
let currentHooks = null;

const appKeyboard = createAppKeyboard({
  idPrefix: "scn",
  getRoot: () => app,
  withScrollPreserved,
  actions: {
    insertChar: (ch) => insertText(currentSession, currentHooks, ch),
    backspace: () => backspaceChar(currentSession, currentHooks),
    moveCursor: (delta) => moveCursor(currentSession, currentHooks, delta),
    historyStep: (dir) => historyStep(currentSession, currentHooks, dir),
    tabComplete: () => tabComplete(currentSession, currentHooks),
    ctrlC: () => ctrlC(currentSession, currentHooks),
    clearTerminal: () => clearTerminal(currentSession, currentHooks),
    submit: () => submitLiveCommand(currentSession, currentHooks),
    escKey: () => {
      liveBuffer = "";
      liveCursor = 0;
      updateLiveLine(currentSession, currentHooks);
    },
    insertChip: (cmd, needsArg) => {
      if(pendingPassword) return; // パスワード入力中はコマンドチップの差し込みを無効化する
      liveBuffer = needsArg ? cmd + " " : cmd;
      liveCursor = liveBuffer.length;
      updateLiveLine(currentSession, currentHooks);
    },
  },
});

export function keyboardHTML(){
  return appKeyboard.html();
}

export function wireKeyboard(session, hooks){
  currentSession = session;
  currentHooks = hooks;
  appKeyboard.wire();
}
