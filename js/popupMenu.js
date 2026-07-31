/* =========================================================================
   共通のポップアップ選択メニュー（例：タスクの繰り返し「なし／毎日／平日
   ／毎週／毎月」）。

   ネイティブの <select> は、開いている最中に元の要素がDOMごと作り直される
   （データ更新による部分再描画など）と、その瞬間にメニューが閉じてしまう。
   このモジュールは以下の方針でその問題を根本から避ける。

   ・メニューは #app の外（document.body直下）に作る。#app 側がいくら
     描き直されてもメニューは消えない（設定モーダル等と同じ方式）。
   ・「外側をタップしたら閉じる」判定は、画面全体を覆うオーバーレイ1枚で
     行う。document へ後付けのリスナーを足さないので、他のクリック処理と
     競合しない。
   ・開いた直後のごく短い間（OPEN_GUARD_MS）は外側タップ判定を行わない。
     ボタンを押した pointerdown → click の流れで、開いた直後の click が
     そのままオーバーレイに届いて即座に閉じてしまうのを防ぐ。
   ・メニュー本体の上で起きた pointerdown / click / touchstart / touchmove
     はそこで止める（stopPropagation）。中身をタップしてもスクロールしても
     閉じない。項目を選んだときだけ、値を確定して閉じる。
   ========================================================================= */

const OPEN_GUARD_MS = 350;   // 開く操作と外側タップ判定が同時に走らないための猶予
const MARGIN = 10;

let active = null;   // { ov, pop, anchor, openedAt, name, onClose }

/* いま何かメニューが開いているか。name を渡すとその種類だけを判定する。
   開いている間は元のカードを描き直さない、といった判断に使う */
export function isPopupMenuOpen(name){
  if(!active) return false;
  return name ? active.name === name : true;
}

export function closePopupMenu(){
  if(!active) return;
  const cur = active;
  active = null;
  document.removeEventListener("keydown", cur.onKey, true);
  cur.ov.classList.remove("show");
  setTimeout(() => { try{ cur.ov.remove(); }catch(e){} }, 170);
  if(cur.onClose) { try{ cur.onClose(); }catch(e){} }
}

// アンカー（開く元になったボタン）の下、入りきらなければ上に出す
function position(pop, anchor){
  const r = anchor.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  const w = pop.offsetWidth || 160;
  const h = pop.offsetHeight || 200;

  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));

  const spaceBelow = vh - r.bottom;
  let top, originY;
  if(spaceBelow >= h + MARGIN || spaceBelow >= r.top){ top = r.bottom + 8; originY = "0%"; }
  else { top = r.top - h - 8; originY = "100%"; }
  top = Math.max(MARGIN, Math.min(top, vh - h - MARGIN));

  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  pop.style.setProperty("--pmenu-origin-x", `${(((r.left + r.width / 2 - left) / (w || 1)) * 100).toFixed(0)}%`);
  pop.style.setProperty("--pmenu-origin-y", originY);
}

/* opts:
     anchor   … 開く元のボタン（位置の基準）
     items    … [{ value, label, sub }]
     value    … 現在選択中の値
     label    … スクリーンリーダー向けの見出し
     name     … メニューの種類名（isPopupMenuOpen の判定用）
     onSelect … 項目を選んだときに呼ばれる (value)
     onClose  … 閉じたときに呼ばれる                                     */
export function openPopupMenu(opts){
  const options = opts || {};
  const anchor = options.anchor;
  const items = options.items || [];
  if(!anchor || !items.length) return null;

  closePopupMenu();

  const ov = document.createElement("div");
  ov.className = "pmenu-ov";
  ov.innerHTML = `
    <div class="pmenu-pop" role="listbox"${options.label ? ` aria-label="${options.label}"` : ""}>
      ${options.label ? `<div class="pmenu-title">${options.label}</div>` : ""}
      <div class="pmenu-list">
        ${items.map(it => `
          <button type="button" class="pmenu-item${it.value === options.value ? " active" : ""}"
                  role="option" aria-selected="${it.value === options.value ? "true" : "false"}"
                  data-pmenu-value="${String(it.value)}">
            <span class="pmenu-item-label">${it.label}</span>
            ${it.sub ? `<span class="pmenu-item-sub">${it.sub}</span>` : ""}
            <span class="pmenu-item-check">${it.value === options.value ? "✓" : ""}</span>
          </button>`).join("")}
      </div>
    </div>`;
  document.body.appendChild(ov);

  const pop = ov.querySelector(".pmenu-pop");
  position(pop, anchor);
  requestAnimationFrame(() => ov.classList.add("show"));

  const onKey = (e) => { if(e.key === "Escape"){ e.stopPropagation(); closePopupMenu(); } };
  document.addEventListener("keydown", onKey, true);

  active = { ov, pop, anchor, openedAt: Date.now(), name: options.name || "", onKey, onClose: options.onClose };

  // メニュー本体の操作は外へ伝えない（背景の委譲リスナーやオーバーレイの
  // 外側タップ判定に届かせない）。スクロールもここで完結する
  ["pointerdown", "pointerup", "click", "touchstart", "touchend", "touchmove", "mousedown", "mouseup"]
    .forEach(type => pop.addEventListener(type, (e) => e.stopPropagation(), type === "touchmove" ? { passive:true } : undefined));

  // 外側タップで閉じる。開いた直後の猶予中は無視する
  const outside = (e) => {
    if(!active || active.ov !== ov) return;
    if(Date.now() - active.openedAt < OPEN_GUARD_MS) return;
    if(e.target !== ov) return;   // 念のため（メニュー本体側では止めている）
    closePopupMenu();
  };
  ov.addEventListener("click", outside);
  // 背景を指でなぞってもページが動かないようにする（メニューの中だけで完結）
  ov.addEventListener("touchmove", (e) => { if(e.target === ov) e.preventDefault(); }, { passive:false });

  pop.querySelectorAll("[data-pmenu-value]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const v = btn.dataset.pmenuValue;
      closePopupMenu();
      if(options.onSelect) options.onSelect(v);
    });
  });

  return ov;
}

// 画面遷移など、メニューを残しておく意味が無くなったときの後始末
window.addEventListener("pagehide", () => closePopupMenu());
