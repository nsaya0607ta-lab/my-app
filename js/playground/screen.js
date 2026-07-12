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

let answerRevealed = false;
let terminalRecords = []; // {kind:"cmd", promptPath, text} | {kind:"line", tokens}

// アプリ内キーボード方式の入力状態。スマホのシステムキーボードは一切使わず、
// この文字列バッファとカーソル位置だけをターミナル上に描画して「本物の
// ターミナルへ直接入力しているように」見せる（実DOM<input>は存在しない）。
let liveBuffer = "";
let liveCursor = 0;
let ctrlArmed = false;
let keyboardOpen = false;

function welcomeRecord(text){
  return { kind:"line", tokens:[{ text, cls:"pg-muted" }] };
}

function resetTerminal(){
  terminalRecords = [
    welcomeRecord("student ホームディレクトリへようこそ。help と入力すると使えるコマンド一覧を確認できます（Tabキーで補完、| でパイプ、> でリダイレクトも使えます）。"),
  ];
  liveBuffer = "";
  liveCursor = 0;
  ctrlArmed = false;
  keyboardOpen = false;
}
resetTerminal();

// ============================================================================
// 🔍 TEMPORARY DEBUG INSTRUMENTATION — 原因調査用。原因が特定できたら必ず削除する。
// 実行ボタン押下（pointerdown）を起点に、
//   A. fn()実行前 → B. fn()実行直後(復元前) → C. 同期restore直後 →
//   D. 1xrAF到達時(restore前) → E. 1xrAF内restore直後 →
//   F. 2xrAF到達時(restore前) → G. 2xrAF内restore直後 →
//   H. +300ms → I. +1000ms
// の各チェックポイントで scrollY / activeElement / #pg-cat-tabsのscrollLeft を
// console.logへ出力する。あわせて、この区間中に発生した window の生の
// 'scroll' イベントをすべて（何がいつ起こしたイベントか特定できるよう）
// タイムスタンプ付きで記録する。実機のSafari/Chromeの開発者ツールで
// コンソールを開いた状態で再現手順を実行し、[PG-DEBUG]ログを確認すること。
// ============================================================================
// Macが手元になくてもiPhone実機だけでログを読めるよう、画面下部に直接
// ログを表示するオーバーレイパネル（#app外・document.body直下に1つだけ生成）。
// テキストは選択・コピー可能にしてあるので、ロングタップ→全選択→コピーで
// そのまま報告してもらえる。ページ自身のスクロールには一切影響しない
// （パネル自身が独立したoverflow:autoを持つ別要素のため）。
function pgDebugPanelBody(){
  let panel = document.getElementById("pg-debug-panel");
  if(!panel){
    panel = document.createElement("div");
    panel.id = "pg-debug-panel";
    panel.style.cssText = "position:fixed;left:0;right:0;bottom:0;max-height:28vh;overflow-y:auto;background:rgba(10,14,26,.95);color:#8effc1;font:10px/1.5 ui-monospace,Menlo,Consolas,monospace;padding:6px 10px;padding-bottom:calc(6px + env(safe-area-inset-bottom));z-index:99999;white-space:pre-wrap;-webkit-user-select:text;user-select:text;border-top:2px solid #ffb020;";
    const head = document.createElement("div");
    head.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:4px;color:#ffb020;font-weight:bold;position:sticky;top:0;background:rgba(10,14,26,.95);";
    const label = document.createElement("span");
    label.textContent = "🔍 PG-DEBUG（テキストをロングタップ→全選択でコピー可）";
    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:6px;flex:none;";
    const body = document.createElement("div");
    body.id = "pg-debug-panel-body";
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.textContent = "コピー";
    copyBtn.style.cssText = "background:#2563eb;color:#fff;border:none;border-radius:4px;padding:3px 10px;font-size:10px;";
    copyBtn.onclick = () => {
      const text = Array.from(body.childNodes).map(n => n.textContent).join("\n");
      if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(() => {});
      copyBtn.textContent = "コピー済み";
      setTimeout(() => { copyBtn.textContent = "コピー"; }, 1200);
    };
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.textContent = "クリア";
    clearBtn.style.cssText = "background:#333;color:#fff;border:none;border-radius:4px;padding:3px 10px;font-size:10px;";
    clearBtn.onclick = () => { body.textContent = ""; };
    btnRow.appendChild(copyBtn);
    btnRow.appendChild(clearBtn);
    head.appendChild(label);
    head.appendChild(btnRow);
    panel.appendChild(head);
    panel.appendChild(body);
    document.body.appendChild(panel);
  }
  return document.getElementById("pg-debug-panel-body");
}

function pgDebugPrint(line){
  const body = pgDebugPanelBody();
  const row = document.createElement("div");
  row.textContent = line;
  body.appendChild(row);
  body.scrollTop = body.scrollHeight; // パネル自身のスクロール。ページのscrollYには無関係
  while(body.childNodes.length > 150) body.removeChild(body.firstChild);
}

function pgDebugSnap(label){
  const active = document.activeElement;
  const catTabs = app.querySelector("#pg-cat-tabs");
  const data = {
    scrollY: window.scrollY,
    scrollX: window.scrollX,
    docScrollTop: (document.scrollingElement || document.documentElement).scrollTop,
    active: active ? `${active.tagName}${active.id ? "#" + active.id : ""}` : null,
    catTabsScrollLeft: catTabs ? catTabs.scrollLeft : null,
    t: performance.now().toFixed(1),
  };
  // eslint-disable-next-line no-console
  console.log(`[PG-DEBUG] ${label}`, data);
  pgDebugPrint(`${label} | y=${data.scrollY} x=${data.scrollX} docTop=${data.docScrollTop} tabsX=${data.catTabsScrollLeft} active=${data.active} t=${data.t}`);
}
let pgDebugScrollWatchOn = false;
function pgDebugArmScrollWatch(ms){
  if(pgDebugScrollWatchOn) return;
  pgDebugScrollWatchOn = true;
  const start = performance.now();
  const onScroll = () => {
    const line = `⚡ scroll event fired | y=${window.scrollY} dt=${(performance.now() - start).toFixed(1)}ms`;
    // eslint-disable-next-line no-console
    console.log("[PG-DEBUG] " + line);
    pgDebugPrint(line);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  setTimeout(() => {
    window.removeEventListener("scroll", onScroll);
    pgDebugScrollWatchOn = false;
  }, ms);
}
// ============================================================================
// 🔍 TEMPORARY DEBUG INSTRUMENTATION ここまで
// ============================================================================

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
  pgDebugArmScrollWatch(2000);
  pgDebugSnap("A. fn()実行前");
  const restore = (tag) => {
    scroller.scrollLeft = x;
    scroller.scrollTop = y;
    if(catTabs && tabsX !== null) catTabs.scrollLeft = tabsX;
    pgDebugSnap(tag);
  };
  fn();
  pgDebugSnap("B. fn()実行直後（復元前）");
  restore("C. 同期restore直後");
  requestAnimationFrame(() => {
    pgDebugSnap("D. 1xrAF到達時（restore前）");
    restore("E. 1xrAF内restore直後");
    requestAnimationFrame(() => {
      pgDebugSnap("F. 2xrAF到達時（restore前）");
      restore("G. 2xrAF内restore直後");
      setTimeout(() => pgDebugSnap("H. +300ms"), 300);
      setTimeout(() => pgDebugSnap("I. +1000ms"), 1000);
    });
  });
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
function setKeyboardOpen(open){
  keyboardOpen = open;
  const kb = app.querySelector("#pg-app-keyboard");
  if(kb) kb.classList.toggle("pg-app-keyboard--open", keyboardOpen);
}

function wireTerminalTap(){
  const el = terminalBodyEl();
  if(!el) return;
  el.addEventListener("click", (e) => {
    if(e.target.closest(".pg-term-send-btn")) return;
    if(!keyboardOpen) setKeyboardOpen(true);
  });
}

// アプリ内キーボード — LPIC Level1の学習に最低限必要な記号を含む、
// システムキーボードを一切使わない専用キーボード。
const KB_ROWS = [
  ["1","2","3","4","5","6","7","8","9","0"],
  ["q","w","e","r","t","y","u","i","o","p"],
  ["a","s","d","f","g","h","j","k","l"],
  ["z","x","c","v","b","n","m"],
  ["-","_","/",".","*","|",">","<","&","$","~"],
];

function keyboardHTML(){
  const rows = KB_ROWS.map(row =>
    `<div class="pg-kb-row">${row.map(k => `<button type="button" class="pg-kb-key" data-kb-char="${esc(k)}">${esc(k)}</button>`).join("")}</div>`
  ).join("");
  return `<div class="pg-app-keyboard${keyboardOpen ? " pg-app-keyboard--open" : ""}" id="pg-app-keyboard">
    <div class="pg-kb-row">
      <button type="button" class="pg-kb-key pg-kb-key--wide" id="pg-kb-tab">Tab</button>
      <button type="button" class="pg-kb-key${ctrlArmed ? " pg-kb-key--active" : ""}" id="pg-kb-ctrl">Ctrl</button>
      <button type="button" class="pg-kb-key" id="pg-kb-left">←</button>
      <button type="button" class="pg-kb-key" id="pg-kb-up">↑</button>
      <button type="button" class="pg-kb-key" id="pg-kb-down">↓</button>
      <button type="button" class="pg-kb-key" id="pg-kb-right">→</button>
      <button type="button" class="pg-kb-key pg-kb-key--wide" id="pg-kb-back">⌫</button>
    </div>
    ${rows}
    <div class="pg-kb-row">
      <button type="button" class="pg-kb-key pg-kb-key--space" id="pg-kb-space">Space</button>
      <button type="button" class="pg-kb-key pg-kb-key--enter" id="pg-kb-enter">Enter</button>
      <button type="button" class="pg-kb-key pg-kb-key--wide" id="pg-kb-close" aria-label="キーボードを閉じる">▼</button>
    </div>
  </div>`;
}

function updateCtrlKeyVisual(){
  const btn = app.querySelector("#pg-kb-ctrl");
  if(btn) btn.classList.toggle("pg-kb-key--active", ctrlArmed);
}

function wireKeyboard(){
  const kb = app.querySelector("#pg-app-keyboard");
  if(!kb) return;
  kb.querySelectorAll("[data-kb-char]").forEach(btn => {
    onPress(btn, () => {
      const ch = btn.dataset.kbChar;
      if(ctrlArmed){
        ctrlArmed = false;
        updateCtrlKeyVisual();
        if(ch === "c"){ ctrlC(); return; }
        if(ch === "l"){ clearTerminal(); return; }
      }
      insertText(ch);
    });
  });
  const bind = (id, handler) => {
    const btn = kb.querySelector(id);
    if(btn) onPress(btn, handler);
  };
  bind("#pg-kb-tab", () => tabComplete());
  bind("#pg-kb-ctrl", () => { ctrlArmed = !ctrlArmed; updateCtrlKeyVisual(); });
  bind("#pg-kb-left", () => moveCursor(-1));
  bind("#pg-kb-right", () => moveCursor(1));
  bind("#pg-kb-up", () => historyStep(-1));
  bind("#pg-kb-down", () => historyStep(1));
  bind("#pg-kb-back", () => backspaceChar());
  bind("#pg-kb-space", () => insertText(" "));
  bind("#pg-kb-enter", () => submitLiveCommand());
  bind("#pg-kb-close", () => setKeyboardOpen(false));
}

const QUICK_COMMANDS = [
  { cmd:"ls -l", needsArg:false },
  { cmd:"cd", needsArg:true },
  { cmd:"pwd", needsArg:false },
  { cmd:"mkdir", needsArg:true },
  { cmd:"touch", needsArg:true },
  { cmd:"cat", needsArg:true },
  { cmd:"grep", needsArg:true },
  { cmd:"chmod", needsArg:true },
  { cmd:"find .", needsArg:false },
  { cmd:"echo", needsArg:true },
  { cmd:"man", needsArg:true },
  { cmd:"clear", needsArg:false },
  { cmd:"help", needsArg:false },
];

// コマンドチップはターミナルの入力バッファへ文字列を差し込むだけ。
// フォーカス移動を一切行わないため、システムキーボードもアプリ内
// キーボードも開かず、画面がスクロールすることもない。
function wireChips(){
  app.querySelectorAll("[data-pg-chip]").forEach(btn => {
    btn.onclick = () => {
      const cmd = btn.dataset.pgChip;
      const needsArg = btn.dataset.pgArg === "1";
      liveBuffer = needsArg ? cmd + " " : cmd;
      liveCursor = liveBuffer.length;
      updateLiveLine();
    };
  });
}

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
  const chipsHTML = QUICK_COMMANDS.map(c =>
    `<button type="button" class="pg-chip" data-pg-chip="${esc(c.cmd)}" data-pg-arg="${c.needsArg ? "1" : "0"}">${esc(c.cmd)}</button>`
  ).join("");

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
      ${keyboardHTML()}
    </div>
    <div class="pg-chip-row">${chipsHTML}</div>
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
  wireKeyboard();
  wireChips();
  installScrollGuard(app.querySelector("#pg-root"));
  pgDebugPrint("=== 画面表示 === 下へスクロール→タブを横スクロール→Enter/▶実行、の順で操作してください");

  const resetBtn = app.querySelector("#pg-reset");
  if(resetBtn) resetBtn.onclick = () => openResetConfirmModal();
  const helpBtn = app.querySelector("#pg-help");
  if(helpBtn) helpBtn.onclick = () => openHelpModal();
  const clearBtn = app.querySelector("#pg-terminal-clear");
  if(clearBtn) clearBtn.onclick = () => withScrollPreserved(() => clearTerminal());

  window.scrollTo(0,0);
}
