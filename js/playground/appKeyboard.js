/* =========================================================================
   🐧 Linux プレイグラウンド専用「アプリ内キーボード」— 共通コンポーネント

   ミッションモード（screen.js）とシナリオモード（scenarios/scenarioTerminal.js）
   の両方から使う、システムキーボードを一切使わない専用キーボードの見た目・
   操作を1箇所に集約したモジュール。「本物のターミナルをスマホで操作している
   ような使いやすさ」を目標に、以下を提供する：

     ・LPIC Level1で使う記号を含む、Linuxコマンド入力に特化したキー配列
     ・画面下に固定表示（position:fixed）される、常に全体が見えるキーボード
     ・タップとスクロール（指のドラッグ）を区別する押下判定（pointer capture
       ＋移動量しきい値）。軽く触れただけ／スクロールしようとして指が動いた
       場合は入力しない。しっかりタップした時だけ入力する
     ・押した時の視覚フィードバック（沈み込み・色の変化）
     ・記号キーの長押しで、同じグループの別の記号を入力できる（' 長押しで
       " など）。長押しで入力できる記号はキー右上の小さな文字で常時ヒント
       表示する
     ・よく使うコマンドをキーボード最上部に配置（タップで入力欄へ挿入する
       だけ。実行はしない）

   状態（Ctrl修飾・Shift（大文字）・開閉）はこのモジュール内に閉じ込め、
   呼び出し側（screen.js / scenarioTerminal.js）は文字バッファの操作
   （insertChar・backspace・moveCursor等）のコールバックを渡すだけでよい。
   1画面につき1個のキーボードしか同時に存在しないため、screen.js /
   scenarioTerminal.js それぞれが持つ既存のモジュール変数シングルトンと
   同じ考え方で、createAppKeyboard() の戻り値をモジュール変数として保持
   して使う想定。
   ========================================================================= */
import { esc } from '../core.js';

// ------------------------------------------------------------------------
// キー配列の定義
// ------------------------------------------------------------------------
export const QUICK_COMMANDS = [
  { cmd:"ls",    needsArg:false },
  { cmd:"ls -l", needsArg:false },
  { cmd:"pwd",   needsArg:false },
  { cmd:"cd",    needsArg:true  },
  { cmd:"mkdir", needsArg:true  },
  { cmd:"touch", needsArg:true  },
  { cmd:"cat",   needsArg:true  },
  { cmd:"grep",  needsArg:true  },
  { cmd:"find",  needsArg:true  },
  { cmd:"cp",    needsArg:true  },
  { cmd:"mv",    needsArg:true  },
  { cmd:"rm",    needsArg:true  },
  { cmd:"chmod", needsArg:true  },
  { cmd:"awk",   needsArg:true  },
  { cmd:"sed",   needsArg:true  },
  { cmd:"head",  needsArg:true  },
  { cmd:"tail",  needsArg:true  },
  { cmd:"echo",  needsArg:true  },
  { cmd:"man",   needsArg:true  },
  { cmd:"clear", needsArg:false },
  { cmd:"help",  needsArg:false },
];

const NUMBER_ROW = ["1","2","3","4","5","6","7","8","9","0"].map(ch => ({ ch, alt:null }));
const LETTER_ROWS = [
  ["q","w","e","r","t","y","u","i","o","p"],
  ["a","s","d","f","g","h","j","k","l"],
  ["z","x","c","v","b","n","m"],
].map(row => row.map(ch => ({ ch, alt:null })));

// LPIC Level1で使う記号を、よく使う順に「単押し」の1行と、関連する記号を
// 長押しでペアにした2行に分けて配置する（'"・()・[]・{}のような対を
// 直感的にまとめ、キーの総数を抑えつつ間隔を広く取れるようにする）。
const SYMBOL_ROW_BARE = ["/","-",".","*","|",">","<","_","$","~"].map(ch => ({ ch, alt:null }));
const SYMBOL_ROW_PAIRED_1 = [
  { ch:"'", alt:'"' },
  { ch:"`", alt:null },
  { ch:"!", alt:"@" },
  { ch:"#", alt:"%" },
  { ch:"^", alt:"&" },
  { ch:"(", alt:")" },
  { ch:"+", alt:"=" },
  { ch:"\\", alt:null },
  { ch:",", alt:";" },
  { ch:"[", alt:"]" },
];
const SYMBOL_ROW_PAIRED_2 = [
  { ch:"{", alt:"}" },
  { ch:":", alt:"?" },
];
// LPIC Level1でよく使う複合ショートカット（&&・||・>>・<<）はそのまま
// 1タップで挿入できるようにする
const SHORTCUT_TOKENS = ["&&","||",">>","<<"];

// ------------------------------------------------------------------------
// 押下判定：タップ／長押し／スクロール（ドラッグ）の区別
// ------------------------------------------------------------------------
const TAP_MOVE_TOLERANCE = 10; // px。これを超えて指が動いたらスクロール扱いにし入力しない
const LONG_PRESS_MS = 420;

function showAltFlash(el, altText){
  const bubble = document.createElement("div");
  bubble.className = "pg-kb-altpop";
  bubble.textContent = altText;
  el.appendChild(bubble);
  setTimeout(() => { bubble.remove(); }, 500);
}

// el: ボタン要素
// onTap: 通常タップ時のハンドラ
// altChar/onAlt: 長押し（LONG_PRESS_MSを超えて保持し、かつ移動量がしきい値
//   以内）で発火するハンドラ。しきい値を超えて指が動いた場合はタップ・長押し
//   どちらも発火しない（＝スクロールしようとして軽く触れただけでは入力しない）
function bindPressable(el, { onTap, altChar, onAlt, withScrollPreserved }){
  let pointerId = null;
  let startX = 0, startY = 0, moved = false, longFired = false, timer = null;

  const clearTimer = () => { if(timer){ clearTimeout(timer); timer = null; } };
  const clearVisual = () => { el.classList.remove("pg-kb-key--pressed", "pg-kb-key--long"); };

  el.addEventListener("pointerdown", (e) => {
    if(pointerId !== null) return;
    e.preventDefault();
    pointerId = e.pointerId;
    try{ el.setPointerCapture(pointerId); }catch(err){ /* Safari以外の一部環境向けフォールバック不要 */ }
    startX = e.clientX; startY = e.clientY;
    moved = false; longFired = false;
    el.classList.add("pg-kb-key--pressed");
    if(altChar){
      timer = setTimeout(() => {
        longFired = true;
        el.classList.add("pg-kb-key--long");
        showAltFlash(el, altChar);
        if(navigator.vibrate){ try{ navigator.vibrate(10); }catch(err){} }
        if(onAlt) withScrollPreserved(() => onAlt());
      }, LONG_PRESS_MS);
    }
  });

  el.addEventListener("pointermove", (e) => {
    if(pointerId === null || e.pointerId !== pointerId || moved) return;
    if(Math.hypot(e.clientX - startX, e.clientY - startY) > TAP_MOVE_TOLERANCE){
      moved = true;
      clearTimer();
      clearVisual();
    }
  });

  const end = (commit) => {
    if(pointerId === null) return;
    pointerId = null;
    clearTimer();
    const wasMoved = moved, wasLong = longFired;
    clearVisual();
    if(!commit || wasMoved || wasLong) return; // 長押しは発火済み。ドラッグはキャンセル
    if(onTap) withScrollPreserved(() => onTap());
  };
  el.addEventListener("pointerup", () => end(true));
  el.addEventListener("pointercancel", () => end(false));
}

// ------------------------------------------------------------------------
// HTML生成
// ------------------------------------------------------------------------
function keyBtn({ id, ch, alt, cls }){
  const altHint = alt ? `<span class="pg-kb-key-alt">${esc(alt)}</span>` : "";
  return `<button type="button" class="pg-kb-key${cls ? ` ${cls}` : ""}"${id ? ` id="${id}"` : ""} data-kb-char="${esc(ch)}"${alt ? ` data-kb-alt="${esc(alt)}"` : ""}>${esc(ch)}${altHint}</button>`;
}

function symbolRowHTML(row){
  return `<div class="pg-kb-row pg-kb-row--sym">${row.map(k => keyBtn({ ch:k.ch, alt:k.alt })).join("")}</div>`;
}

function quickRowHTML(){
  const chips = QUICK_COMMANDS.map(c =>
    `<button type="button" class="pg-kb-chip" data-kb-chip="${esc(c.cmd)}" data-kb-arg="${c.needsArg ? "1" : "0"}">${esc(c.cmd)}</button>`
  ).join("");
  return `<div class="pg-kb-quick-row">${chips}</div>`;
}

// 問題文で入力が求められる日本語の文章など、このキーボードのキーでは
// 打てない文字列をワンタップでカーソル位置へ差し込むためのチップ行。
// シナリオ定義（quickTexts）から渡された時だけ、コマンドチップ行の上に表示する
function textRowHTML(quickTexts){
  if(!quickTexts || !quickTexts.length) return "";
  const chips = quickTexts.map(t =>
    `<button type="button" class="pg-kb-chip pg-kb-chip--text" data-kb-text="${esc(t)}">${esc(t)}</button>`
  ).join("");
  return `<div class="pg-kb-quick-row pg-kb-text-row"><span class="pg-kb-text-label">あ</span>${chips}</div>`;
}

// idPrefix: "pg"（ミッションモード） / "scn"（シナリオモード）のように
// 画面ごとに異なる接頭辞を渡し、DOM idの衝突を避ける
export function createAppKeyboard({ idPrefix, getRoot, actions, withScrollPreserved }){
  let ctrlArmed = false;
  let capsOn = false;
  let keyboardOpen = false;

  const kbId = `${idPrefix}-app-keyboard`;

  function updateVisuals(){
    const root = getRoot();
    if(!root) return;
    const ctrlBtn = root.querySelector(`#${idPrefix}-kb-ctrl`);
    if(ctrlBtn) ctrlBtn.classList.toggle("pg-kb-key--active", ctrlArmed);
    const shiftBtn = root.querySelector(`#${idPrefix}-kb-shift`);
    if(shiftBtn) shiftBtn.classList.toggle("pg-kb-key--active", capsOn);
  }

  function handleCharPress(raw){
    if(ctrlArmed){
      ctrlArmed = false;
      updateVisuals();
      if(raw === "c"){ actions.ctrlC(); return; }
      if(raw === "l"){ actions.clearTerminal(); return; }
      // それ以外のCtrl+文字は修飾を解除したうえで通常入力として扱う
    }
    const isLetter = /^[a-z]$/.test(raw);
    const ch = (capsOn && isLetter) ? raw.toUpperCase() : raw;
    actions.insertChar(ch);
  }

  function handleAltPress(alt){
    if(ctrlArmed){ ctrlArmed = false; updateVisuals(); }
    actions.insertChar(alt);
  }

  function handleEsc(){
    if(ctrlArmed){ ctrlArmed = false; updateVisuals(); return; }
    if(actions.escKey) actions.escKey();
  }

  // quickTexts: 日本語の文章などキーでは打てない文字列を、ワンタップで
  // カーソル位置へ差し込むためのチップ（シナリオごとに任意指定）
  function html({ quickTexts } = {}){
    const bodyRows = [
      `<div class="pg-kb-row pg-kb-row--fn">
        <button type="button" class="pg-kb-key pg-kb-key--fn" id="${idPrefix}-kb-esc">Esc</button>
        <button type="button" class="pg-kb-key pg-kb-key--fn" id="${idPrefix}-kb-tab">Tab</button>
        <button type="button" class="pg-kb-key pg-kb-key--fn${ctrlArmed ? " pg-kb-key--active" : ""}" id="${idPrefix}-kb-ctrl">Ctrl</button>
        <button type="button" class="pg-kb-key pg-kb-key--fn${capsOn ? " pg-kb-key--active" : ""}" id="${idPrefix}-kb-shift">Shift</button>
        <button type="button" class="pg-kb-key pg-kb-key--nav" id="${idPrefix}-kb-left" aria-label="カーソルを左へ">←</button>
        <button type="button" class="pg-kb-key pg-kb-key--nav" id="${idPrefix}-kb-up" aria-label="履歴を戻す">↑</button>
        <button type="button" class="pg-kb-key pg-kb-key--nav" id="${idPrefix}-kb-down" aria-label="履歴を進める">↓</button>
        <button type="button" class="pg-kb-key pg-kb-key--nav" id="${idPrefix}-kb-right" aria-label="カーソルを右へ">→</button>
        <button type="button" class="pg-kb-key pg-kb-key--fn pg-kb-key--back" id="${idPrefix}-kb-back">⌫</button>
      </div>`,
      `<div class="pg-kb-row">${NUMBER_ROW.map(k => keyBtn(k)).join("")}</div>`,
      `<div class="pg-kb-row">${LETTER_ROWS[0].map(k => keyBtn(k)).join("")}</div>`,
      `<div class="pg-kb-row pg-kb-row--inset8">${LETTER_ROWS[1].map(k => keyBtn(k)).join("")}</div>`,
      `<div class="pg-kb-row pg-kb-row--inset16">${LETTER_ROWS[2].map(k => keyBtn(k)).join("")}</div>`,
      symbolRowHTML(SYMBOL_ROW_BARE),
      symbolRowHTML(SYMBOL_ROW_PAIRED_1),
      `<div class="pg-kb-row pg-kb-row--sym">${SYMBOL_ROW_PAIRED_2.map(k => keyBtn(k)).join("")}${SHORTCUT_TOKENS.map(t => `<button type="button" class="pg-kb-key pg-kb-key--shortcut" data-kb-char="${esc(t)}">${esc(t)}</button>`).join("")}</div>`,
      `<div class="pg-kb-row pg-kb-row--bottom">
        <button type="button" class="pg-kb-key pg-kb-key--space" id="${idPrefix}-kb-space">Space</button>
        <button type="button" class="pg-kb-key pg-kb-key--enter" id="${idPrefix}-kb-enter">Enter ↵</button>
        <button type="button" class="pg-kb-key pg-kb-key--close" id="${idPrefix}-kb-close" aria-label="キーボードを閉じる">▼</button>
      </div>`,
    ].join("");
    const rows = textRowHTML(quickTexts) + quickRowHTML() + `<div class="pg-kb-body">${bodyRows}</div>`;
    return `<div class="pg-app-keyboard${keyboardOpen ? " pg-app-keyboard--open" : ""}" id="${kbId}">${rows}</div>`;
  }

  function wire(){
    const root = getRoot();
    const kb = root ? root.querySelector(`#${kbId}`) : null;
    if(!kb) return;

    kb.querySelectorAll("[data-kb-chip]").forEach(btn => {
      bindPressable(btn, {
        withScrollPreserved,
        onTap: () => actions.insertChip(btn.dataset.kbChip, btn.dataset.kbArg === "1"),
      });
    });

    // 日本語文チップ：コマンドチップと違い入力欄を置き換えず、カーソル位置へ
    // そのまま差し込む（echo "…" の "" の中に入れる、といった使い方のため）
    kb.querySelectorAll("[data-kb-text]").forEach(btn => {
      bindPressable(btn, {
        withScrollPreserved,
        onTap: () => { if(actions.insertSnippet) actions.insertSnippet(btn.dataset.kbText); },
      });
    });

    kb.querySelectorAll("[data-kb-char]").forEach(btn => {
      const ch = btn.dataset.kbChar;
      const alt = btn.dataset.kbAlt || null;
      bindPressable(btn, {
        withScrollPreserved,
        onTap: () => handleCharPress(ch),
        altChar: alt,
        onAlt: alt ? () => handleAltPress(alt) : null,
      });
    });

    const bindAction = (id, onTap) => {
      const btn = kb.querySelector(`#${id}`);
      if(btn) bindPressable(btn, { withScrollPreserved, onTap });
    };
    bindAction(`${idPrefix}-kb-esc`, handleEsc);
    bindAction(`${idPrefix}-kb-tab`, () => actions.tabComplete());
    bindAction(`${idPrefix}-kb-ctrl`, () => { ctrlArmed = !ctrlArmed; updateVisuals(); });
    bindAction(`${idPrefix}-kb-shift`, () => { capsOn = !capsOn; updateVisuals(); });
    bindAction(`${idPrefix}-kb-left`, () => actions.moveCursor(-1));
    bindAction(`${idPrefix}-kb-right`, () => actions.moveCursor(1));
    bindAction(`${idPrefix}-kb-up`, () => actions.historyStep(-1));
    bindAction(`${idPrefix}-kb-down`, () => actions.historyStep(1));
    bindAction(`${idPrefix}-kb-back`, () => actions.backspace());
    bindAction(`${idPrefix}-kb-space`, () => actions.insertChar(" "));
    bindAction(`${idPrefix}-kb-enter`, () => actions.submit());
    bindAction(`${idPrefix}-kb-close`, () => setOpen(false));
  }

  function setOpen(open){
    keyboardOpen = open;
    const root = getRoot();
    const kb = root ? root.querySelector(`#${kbId}`) : null;
    if(kb) kb.classList.toggle("pg-app-keyboard--open", keyboardOpen);
    const card = root ? root.querySelector(`#${idPrefix}-terminal-card`) : null;
    if(card) card.classList.toggle("pg-terminal-card--kbopen", keyboardOpen);
    // キーボードは黒いターミナルの枠内に組み込まれているため、開いている間は
    // ヘッダーの紹介カードなど上部の付帯要素を畳み、ターミナル＋キーボードに
    // 縦の余白を回す（画面上部にこのクラスを立てるだけで、CSS側で制御する）
    const pageRoot = root ? root.querySelector(`#${idPrefix}-root`) : null;
    if(pageRoot) pageRoot.classList.toggle("pg-kb-active", keyboardOpen);
  }

  function reset(){
    ctrlArmed = false;
    capsOn = false;
    keyboardOpen = false;
  }

  return {
    html,
    wire,
    setOpen,
    isOpen: () => keyboardOpen,
    reset,
  };
}
