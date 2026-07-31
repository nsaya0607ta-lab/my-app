/* =========================================================================
   予定まわりのモーダル（予定の詳細／同期設定／初回確認）の土台。

   ・オーバーレイの生成と後片付けをここに集約する
   ・表示中は背景（アプリ本体・下部ナビ）を完全に無効化する
       - pointer-events でタップ／クリックを遮断（CSS: body.sched-modal-open）
       - inert でキーボード（Tab）でも触れないようにする
       - body を position:fixed にして背景ページのスクロールを固定し、
         閉じたときに元のスクロール位置へ戻す
   ・モーダル内で起きたイベントは背景へ伝えない（stopPropagation）
   ・オーバーレイの余白をなぞっても画面が動かないようにする
     （縦スクロールはモーダル本体の中だけで完結させる）

   モーダルが入れ子で開くケース（設定 → 初回確認）に備えて、ロックは
   参照カウント方式にしてある。最後の1枚を閉じたときだけ解除する。
   ========================================================================= */

const LOCK_CLASS = "sched-modal-open";

// モーダル内で起きても背景へ伝えないイベント。背景側に document/#app 単位の
// 委譲リスナーがあっても、モーダルの操作では反応しないようにする
const BLOCKED_EVENTS = ["click", "dblclick", "pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend"];

let lockCount = 0;
let savedScrollY = 0;
let inertedEls = [];

/* ---- 背景のロック／解除 ---- */

function lockBackground(){
  if(++lockCount > 1) return;

  savedScrollY = window.scrollY || window.pageYOffset || 0;
  document.documentElement.classList.add(LOCK_CLASS);
  document.body.classList.add(LOCK_CLASS);
  // position:fixed にすると先頭へ飛んでしまうので、いま見ていた位置を
  // topのマイナス値で再現する（iOS Safariでも背景が裏側で動かない定番の方法）
  document.body.style.top = `-${savedScrollY}px`;

  // pointer-events だけではフォーカスがTabで背景へ移動できてしまうため、
  // 背景の要素は inert にして操作対象から完全に外す
  inertedEls = [];
  Array.from(document.body.children).forEach(el => {
    if(el.tagName === "SCRIPT" || el.tagName === "STYLE") return;
    if(el.classList && el.classList.contains("modal-ov")) return;   // モーダル自身は残す
    if(el.hasAttribute("inert")) return;                            // 元から inert のものは触らない
    el.setAttribute("inert", "");
    inertedEls.push(el);
  });
}

function unlockBackground(){
  if(lockCount === 0) return;
  if(--lockCount > 0) return;

  inertedEls.forEach(el => { try{ el.removeAttribute("inert"); }catch(e){} });
  inertedEls = [];
  document.documentElement.classList.remove(LOCK_CLASS);
  document.body.classList.remove(LOCK_CLASS);
  document.body.style.top = "";
  // 固定を解除した瞬間に先頭へ戻るので、開く前の位置へ戻す
  window.scrollTo(0, savedScrollY);
}

/* 指を動かしたときに「実際に縦スクロールできる枠」が
   モーダルの中にあるかどうか。無ければその指の動きは無効にする */
function hasScrollableAncestor(target, stopAt){
  let el = target instanceof Element ? target : null;
  while(el && el !== stopAt){
    if(el.scrollHeight > el.clientHeight){
      const overflowY = getComputedStyle(el).overflowY;
      if(overflowY === "auto" || overflowY === "scroll") return true;
    }
    el = el.parentElement;
  }
  return false;
}

/* ---- オーバーレイ ----
   opts:
     className   … 追加クラス
     label       … スクリーンリーダー向けのタイトル
     onBackdrop  … 背景（モーダルの外側）をタップしたときの処理        */
export function createModalOverlay(opts){
  const options = opts || {};
  const ov = document.createElement("div");
  ov.className = `modal-ov sched-modal-ov${options.className ? ` ${options.className}` : ""}`;
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-modal", "true");
  if(options.label) ov.setAttribute("aria-label", options.label);

  BLOCKED_EVENTS.forEach(type => {
    ov.addEventListener(type, (e) => {
      // モーダルの中の操作も、外側（背景）のタップも、ここで止める。
      // モーダル内部の各ボタンのハンドラは、ここへ届く前に実行済み
      e.stopPropagation();
      if(type === "click" && e.target === ov && options.onBackdrop) options.onBackdrop();
    });
  });

  // 縦スクロールはモーダル本体（スクロール枠）の中だけ。オーバーレイの
  // 余白をなぞったときや、横方向のスワイプでは画面を動かさない
  // （横方向は CSS の touch-action:pan-y でブラウザ側からも止めている）
  ov.addEventListener("touchmove", (e) => {
    e.stopPropagation();
    // 入力欄の中の操作（カーソル移動・文字の選択）はそのまま通す。
    // 横方向はどのみち touch-action:pan-y でブラウザ側が止めている
    if(e.target.closest && e.target.closest("input,textarea,select,[contenteditable]")) return;
    if(!hasScrollableAncestor(e.target, ov)) e.preventDefault();
  }, { passive: false });

  document.body.appendChild(ov);
  lockBackground();
  return ov;
}

// オーバーレイを閉じる。閉じたときだけ背景のロックを1つ戻す
export function closeModalOverlay(ov){
  if(!ov) return;
  const wasOpen = ov.isConnected;
  try{ ov.remove(); }catch(e){}
  if(wasOpen) unlockBackground();
}
