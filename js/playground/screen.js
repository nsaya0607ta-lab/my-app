/* =========================================================================
   🐧 Linux プレイグラウンド — 専用フルスクリーン画面（PlaygroundScreen）
   実OS・Dockerには一切アクセスせず、ブラウザのメモリ上だけで完結する
   仮想Linux環境（VirtualFileSystem + ShellState）に対して、LPIC Level1で
   学習する範囲を中心としたコマンド（commands/配下、レジストリはcommands/
   index.js）を解釈・実行する学習用サンドボックス。

   このファイルが担う「コンポーネント」：
     ・Terminal        … renderTerminalBody() / appendTerminalRecords()
     ・CommandInput     … wireCommandInput()（Enter送信・↑↓履歴・Tab補完・
                          Ctrl+C・モバイル向け補助キー行）
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

function welcomeRecord(text){
  return { kind:"line", tokens:[{ text, cls:"pg-muted" }] };
}

function resetTerminal(){
  terminalRecords = [
    welcomeRecord("student ホームディレクトリへようこそ。help と入力すると使えるコマンド一覧を確認できます（Tabキーで補完、| でパイプ、> でリダイレクトも使えます）。"),
  ];
}
resetTerminal();

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

function liveLineHTML(){
  return `<form class="pg-term-line pg-term-live" id="pg-term-input-form" autocomplete="off">
    <span class="pg-term-prompt">student@linux:${esc(vfs.promptPath())}$</span>
    <input type="text" id="pg-term-input" class="pg-term-input" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text">
    <span class="pg-term-cursor" id="pg-term-cursor"></span>
    <button type="submit" class="pg-term-send-btn" aria-label="送信">➤</button>
  </form>`;
}

function renderTerminalBody(){
  const el = terminalBodyEl();
  if(!el) return;
  el.innerHTML = terminalRecords.map(recordToHTML).join("") + liveLineHTML();
  el.scrollTop = el.scrollHeight;
  wireCommandInput();
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
  const hadFocus = app.querySelector("#pg-term-input") === document.activeElement;
  terminalRecords = [];
  renderTerminalBody();
  if(hadFocus){
    const input = app.querySelector("#pg-term-input");
    if(input) input.focus();
  }
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
  renderCategoryTabs();
  renderMissionCard();
  renderHintCard();
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
// CommandInput（Enter送信・↑↓履歴・Tab補完・Ctrl+C）
// ------------------------------------------------------------------------
function historyStep(input, dir){
  const v = dir < 0 ? history.prev(input.value) : history.next();
  if(v !== null){
    input.value = v;
    requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
  }
}

function tabComplete(input){
  const pos = input.selectionStart ?? input.value.length;
  const commandNames = [...COMMAND_NAMES, ...shellState.aliases.keys()];
  const result = getCompletions(input.value, pos, { vfs, commandNames });
  if(result.completion){
    const before = input.value.slice(0, result.wordStart);
    const after = input.value.slice(pos);
    input.value = before + result.completion + after;
    const newPos = before.length + result.completion.length;
    requestAnimationFrame(() => input.setSelectionRange(newPos, newPos));
  } else if(result.matches.length > 1){
    appendTerminalRecords([{ kind:"line", tokens:[{ text: result.matches.map(m => m.label).join("  ") }] }]);
  }
}

function ctrlC(input){
  appendTerminalRecords([{ kind:"cmd", promptPath: vfs.promptPath(), text: `${input.value}^C` }]);
  input.value = "";
}

function wireCommandInput(){
  const form = app.querySelector("#pg-term-input-form");
  const input = app.querySelector("#pg-term-input");
  if(!form || !input) return;
  form.onsubmit = (e) => {
    e.preventDefault();
    const raw = input.value;
    if(!raw.trim()) return;
    input.value = "";
    runCommand(raw);
  };
  input.onkeydown = (e) => {
    if(e.key === "Tab"){ e.preventDefault(); tabComplete(input); }
    else if(e.key === "ArrowUp"){ e.preventDefault(); historyStep(input, -1); }
    else if(e.key === "ArrowDown"){ e.preventDefault(); historyStep(input, 1); }
    else if(e.key === "c" && e.ctrlKey){ e.preventDefault(); ctrlC(input); }
  };
}

// ターミナル部分をタップしたときだけ入力欄へフォーカスし、キーボードを表示する。
// 拡大・移動・強調表示は一切行わない（フォーカスするだけ）。
function wireTerminalTap(){
  const el = terminalBodyEl();
  if(!el) return;
  el.addEventListener("click", (e) => {
    if(e.target.closest(".pg-term-send-btn")) return;
    const input = app.querySelector("#pg-term-input");
    if(input && document.activeElement !== input) input.focus();
  });
}

// モバイル向け補助キー行（Tab補完・履歴・Ctrl+C）。物理キーボードが無い
// 端末でもTab補完や↑↓履歴を使えるようにする。pointerdownでボタン自身への
// フォーカス移動を止め、入力欄のフォーカス（＝ソフトキーボード表示）を保つ。
function wireTermKeys(){
  const bind = (id, handler) => {
    const btn = app.querySelector(id);
    if(!btn) return;
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const input = app.querySelector("#pg-term-input");
      if(!input) return;
      input.focus();
      handler(input);
    });
  };
  bind("#pg-key-tab", (input) => tabComplete(input));
  bind("#pg-key-up", (input) => historyStep(input, -1));
  bind("#pg-key-down", (input) => historyStep(input, 1));
  bind("#pg-key-ctrlc", (input) => ctrlC(input));
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

function wireChips(){
  app.querySelectorAll("[data-pg-chip]").forEach(btn => {
    btn.onclick = () => {
      const input = app.querySelector("#pg-term-input");
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
    btn.onclick = () => {
      missionProgress.activeCategory = btn.dataset.pgCat;
      answerRevealed = false;
      pgScheduleSave();
      renderCategoryTabs();
      renderMissionCard();
      renderHintCard();
    };
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
  if(btn) btn.onclick = () => { answerRevealed = !answerRevealed; renderMissionCard(); renderHintCard(); };
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
  if(btn) btn.onclick = () => { answerRevealed = !answerRevealed; renderMissionCard(); renderHintCard(); };
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
      <div class="pg-term-keys">
        <button type="button" class="pg-term-key pg-term-key--wide" id="pg-key-tab">Tab補完</button>
        <button type="button" class="pg-term-key" id="pg-key-up">↑</button>
        <button type="button" class="pg-term-key" id="pg-key-down">↓</button>
        <button type="button" class="pg-term-key" id="pg-key-ctrlc">Ctrl+C</button>
      </div>
    </div>
    <div class="pg-chip-row">${chipsHTML}</div>
    <div class="pg-cat-tabs" id="pg-cat-tabs"></div>
    <div class="pg-cards">
      <div class="pg-card pg-mission-card" id="pg-mission-card"></div>
      <div class="pg-card pg-hint-card" id="pg-hint-card"></div>
    </div>
  `;

  renderTerminalBody();
  renderSyncNote();
  renderCategoryTabs();
  renderMissionCard();
  renderHintCard();
  wireTerminalTap();
  wireTermKeys();
  wireChips();

  const resetBtn = app.querySelector("#pg-reset");
  if(resetBtn) resetBtn.onclick = () => openResetConfirmModal();
  const helpBtn = app.querySelector("#pg-help");
  if(helpBtn) helpBtn.onclick = () => openHelpModal();
  const clearBtn = app.querySelector("#pg-terminal-clear");
  if(clearBtn) clearBtn.onclick = () => clearTerminal();

  window.scrollTo(0,0);
}
