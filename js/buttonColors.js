/* =========================================================================
   🎨 主要ボタンの長押しカラーカスタム機能
   対象：パレット（左下FAB）／J-NEWS／F-NEWS／株価／カレンダー／MS／LPIC／
   Gemini（右下FAB）。各ボタンのHTML側には data-color-key="<キー>" を
   振ってあり、ここではその要素を対象に
     ・長押し（touchstart/mousedown + タイマー）／右クリック（contextmenu）
       でカラー選択ポップアップを開く
     ・選んだ色をlocalStorageへ保存し、リロード後も復元する
     ・保存済みの色をボタンの背景・影・アイコン色へ滑らかに反映する
   を担当する。renderSelect()（ホーム画面）の再描画のたびに
   wireButtonColorLongPress()／applyCustomButtonColors() を呼び直せば、
   DOMが丸ごと差し替わっても状態が壊れないようにしてある。
   ========================================================================= */
import { playTapSound } from './audio.js';

const STORE_KEY = "btn_custom_colors_v1";
const LONG_PRESS_MS = 550;
const MOVE_CANCEL_PX = 12;

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#64748b",
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/* ---- localStorage永続化：端末表示設定なのでUIテーマ/タップ音と同じく
   ユーザーIDに依存しない単一キーで保存する ---- */
function loadColors(){
  try{
    const v = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    return (v && typeof v === "object") ? v : {};
  }catch(e){ return {}; }
}
function saveColors(map){
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(map)); }catch(e){}
}
function setColor(key, hex){
  if(!HEX_RE.test(hex)) return;
  const map = loadColors();
  map[key] = hex;
  saveColors(map);
}
function resetColor(key){
  const map = loadColors();
  delete map[key];
  saveColors(map);
}

/* ---- 色計算ユーティリティ ---- */
function hexToRgb(hex){
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function clampByte(n){ return Math.max(0, Math.min(255, Math.round(n))); }
function rgbToHex(r, g, b){ return "#" + [r, g, b].map(v => clampByte(v).toString(16).padStart(2, "0")).join(""); }
function lighten(hex, pct){
  const { r, g, b } = hexToRgb(hex);
  const p = pct / 100;
  return rgbToHex(r + (255 - r) * p, g + (255 - g) * p, b + (255 - b) * p);
}
function hexToRgba(hex, a){
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
// 明るい色の上には濃色文字、暗い色の上には白文字を乗せて、どちらのテーマでも視認性を保つ
function contrastColor(hex){
  const { r, g, b } = hexToRgb(hex);
  const perceived = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return perceived > 0.62 ? "#0f172a" : "#ffffff";
}

/* ---- 対象ボタンのうち、実際に見た目（背景色）を書き換える要素を特定する。
   J-NEWS等は.launcher-item（アイコン＋テキスト）にdata-color-keyを振っているため、
   中の.ms-logo-btnだけを塗り替える。FAB（パレット/Gemini）は自分自身が対象 ---- */
function recolorTarget(container){
  if(container.matches(".ms-logo-btn, .gemini-fab, .palette-fab")) return container;
  return container.querySelector(".ms-logo-btn, .gemini-fab, .palette-fab") || container;
}

function isFabEl(el){ return el.classList.contains("gemini-fab") || el.classList.contains("palette-fab"); }

function paintElement(el, hex){
  const fab = isFabEl(el);
  const light = lighten(hex, fab ? 14 : 20);
  const angle = fab ? "135deg" : "150deg";
  el.style.background = `linear-gradient(${angle}, ${light}, ${hex})`;
  el.style.borderColor = "transparent";
  el.style.boxShadow = fab
    ? `0 6px 18px ${hexToRgba(hex, .42)}, inset 0 1px 0 rgba(255,255,255,.25)`
    : `0 5px 14px ${hexToRgba(hex, .28)}, inset 0 1px 0 rgba(255,255,255,.45)`;
  el.style.color = contrastColor(hex);
}
function unpaintElement(el){
  el.style.background = "";
  el.style.borderColor = "";
  el.style.boxShadow = "";
  el.style.color = "";
}

// 保存済みのカスタム色を、対象要素すべてへ反映する。root配下の
// [data-color-key] を総なめするだけなので、renderSelect()の再描画後に
// 毎回呼び出せば良い（未カスタムのボタンはCSS側のデフォルト配色に戻る）
export function applyCustomButtonColors(root){
  const scope = root || document;
  const colors = loadColors();
  scope.querySelectorAll("[data-color-key]").forEach(container => {
    const key = container.dataset.colorKey;
    const target = recolorTarget(container);
    const hex = colors[key];
    if(hex && HEX_RE.test(hex)) paintElement(target, hex);
    else unpaintElement(target);
  });
}

/* ---- 長押し直後に発火してしまう合成クリック（＝本来の画面遷移）を
   抑止するための仕組み。ポップアップを開いた瞬間、対象の部分木すべてに
   「しばらくクリックを無視する」印を付ける。renderSelect()側のonclick
   配線がisLongPressSuppressed()を確認してからgo()を呼ぶことで機能する ---- */
export function isLongPressSuppressed(el){
  return !!(el && el._lpSuppressUntil && Date.now() < el._lpSuppressUntil);
}
function suppressClicks(container){
  const until = Date.now() + 500;
  container._lpSuppressUntil = until;
  container.querySelectorAll("*").forEach(n => { n._lpSuppressUntil = until; });
}

// 対象ボタン（[data-color-key]）へ長押し／右クリックのハンドラを配線する。
// PC：mousedown保持 or 右クリック(contextmenu)。スマホ：touchstart保持。
// どちらも一定距離以上動いたら「スクロール／スワイプ」とみなしキャンセルする
export function wireButtonColorLongPress(root){
  const scope = root || document;
  scope.querySelectorAll("[data-color-key]").forEach(container => {
    if(container._cpickWired) return;
    container._cpickWired = true;

    let timer = null, startX = 0, startY = 0;
    const clearTimer = () => { if(timer){ clearTimeout(timer); timer = null; } };
    const begin = (x, y) => {
      startX = x; startY = y;
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        suppressClicks(container);
        try{ navigator.vibrate && navigator.vibrate(12); }catch(e){}
        openColorPicker(container.dataset.colorKey, recolorTarget(container));
      }, LONG_PRESS_MS);
    };
    const trackMove = (x, y) => {
      if(!timer) return;
      if(Math.hypot(x - startX, y - startY) > MOVE_CANCEL_PX) clearTimer();
    };

    container.addEventListener("touchstart", (e) => {
      const t = e.touches[0]; if(!t) return;
      begin(t.clientX, t.clientY);
    }, { passive: true });
    container.addEventListener("touchmove", (e) => {
      const t = e.touches[0]; if(!t) return;
      trackMove(t.clientX, t.clientY);
    }, { passive: true });
    container.addEventListener("touchend", clearTimer);
    container.addEventListener("touchcancel", clearTimer);

    container.addEventListener("mousedown", (e) => {
      if(e.button !== 0) return;
      begin(e.clientX, e.clientY);
    });
    container.addEventListener("mousemove", (e) => trackMove(e.clientX, e.clientY));
    container.addEventListener("mouseup", clearTimer);
    container.addEventListener("mouseleave", clearTimer);

    // PC向け右クリック：ブラウザ標準の右クリックメニューの代わりにポップアップを開く
    container.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      clearTimer();
      suppressClicks(container);
      openColorPicker(container.dataset.colorKey, recolorTarget(container));
    });
  });
}

/* ---- カラー選択ポップアップ ---- */
let activeOv = null;
function closeColorPicker(){
  if(!activeOv) return;
  const ov = activeOv; activeOv = null;
  ov.classList.remove("show");
  document.removeEventListener("keydown", ov._onKey);
  // 「決定」を押さずに閉じた場合（Escape／枠外タップ／ネイティブピッカーの
  // スワイプ閉じなど）は、ドラッグ中だけ見せていた未確定のプレビューを
  // 保存済みの状態に戻す。決定済みの場合はすでに同じ状態なので実害なし
  applyCustomButtonColors();
  setTimeout(() => { try{ ov.remove(); }catch(e){} }, 190);
}

function positionPopup(pop, anchorEl){
  const r = anchorEl.getBoundingClientRect();
  const margin = 12;
  const vw = window.innerWidth, vh = window.innerHeight;
  const popW = pop.offsetWidth || 236;
  const popH = pop.offsetHeight || 200;

  let left = r.left + r.width / 2 - popW / 2;
  left = Math.max(margin, Math.min(left, vw - popW - margin));

  const spaceBelow = vh - r.bottom, spaceAbove = r.top;
  let top, originY;
  if(spaceBelow >= popH + margin || spaceBelow >= spaceAbove){
    top = r.bottom + 10; originY = "0%";
  } else {
    top = r.top - popH - 10; originY = "100%";
  }
  top = Math.max(margin, Math.min(top, vh - popH - margin));

  const originX = popW ? (((r.left + r.width / 2 - left) / popW) * 100).toFixed(0) + "%" : "50%";
  pop.style.left = left + "px";
  pop.style.top = top + "px";
  pop.style.setProperty("--cpick-origin-x", originX);
  pop.style.setProperty("--cpick-origin-y", originY);
}

function openColorPicker(key, anchorEl){
  if(!key || !anchorEl) return;
  closeColorPicker();

  const current = loadColors()[key] || null;
  const ov = document.createElement("div");
  ov.className = "cpick-ov";
  ov.innerHTML = `
    <div class="cpick-pop" role="dialog" aria-label="ボタンの色を選ぶ">
      <div class="cpick-title">🎨 ボタンの色を選ぶ</div>
      <div class="cpick-grid">
        ${PRESET_COLORS.map(c => `<button type="button" class="cpick-swatch${c.toLowerCase() === (current || "").toLowerCase() ? " picked" : ""}" data-color="${c}" style="background:${c}" aria-label="${c}"></button>`).join("")}
      </div>
      <div class="cpick-row">
        <div class="cpick-custom-wrap">
          <span class="cpick-custom-dot"></span>
          <input type="color" class="cpick-custom-input" data-custom-input value="${current || "#0284c7"}" aria-label="カスタムカラーを選ぶ">
        </div>
        <span class="cpick-custom-txt">カスタム</span>
        <button type="button" class="cpick-reset" data-reset>デフォルトに戻す</button>
      </div>
      <button type="button" class="cpick-confirm" data-confirm>決定</button>
    </div>`;
  document.body.appendChild(ov);
  activeOv = ov;

  const pop = ov.querySelector(".cpick-pop");
  positionPopup(pop, anchorEl);
  requestAnimationFrame(() => ov.classList.add("show"));

  const onKey = (e) => { if(e.key === "Escape") closeColorPicker(); };
  ov._onKey = onKey;
  document.addEventListener("keydown", onKey);
  ov.addEventListener("click", (e) => { if(e.target === ov) closeColorPicker(); });

  ov.querySelectorAll("[data-color]").forEach(sw => {
    sw.onclick = () => {
      setColor(key, sw.dataset.color);
      applyCustomButtonColors();
      try{ playTapSound(); }catch(e){}
      closeColorPicker();
    };
  });
  // カスタム色（ネイティブのカラーピッカー）はスペクトラム上を指でなぞる操作＝
  // OS側のスワイプ操作でシート自体が閉じてしまうことがあるため、ドラッグ中は
  // ボタンの見た目だけをプレビューし、実際の保存（setColor）は行わない。
  // 保存は下の「決定」ボタンを押したときだけ確定させる
  const input = ov.querySelector("[data-custom-input]");
  input.oninput = () => { paintElement(anchorEl, input.value); };

  ov.querySelector("[data-confirm]").onclick = () => {
    setColor(key, input.value);
    applyCustomButtonColors();
    try{ playTapSound(); }catch(e){}
    closeColorPicker();
  };

  ov.querySelector("[data-reset]").onclick = () => {
    resetColor(key);
    applyCustomButtonColors();
    try{ playTapSound(); }catch(e){}
    closeColorPicker();
  };
}
