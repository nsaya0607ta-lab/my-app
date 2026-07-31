/* =========================================================================
   🎖️ BP獲得通知：画面上部に小さく出るトースト

   ・#app（render()で丸ごと差し替わる領域）の外、document.body直下に
     置くので、通知の表示中に画面が再描画されても消えない。
   ・pointer-events:none（CSS側）で、背後の画面の操作を一切邪魔しない
     ＝タップ貫通の心配がない。
   ・短時間に複数のBPが入った場合は、同じトーストを積み上げず最新の1件を
     差し替える（連続獲得で画面が埋まらないように）。
   ========================================================================= */
import { BP_TOAST_MS } from './config.js';

let hostEl = null;
let hideTimer = null;

function esc(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function host(){
  if(hostEl && document.body.contains(hostEl)) return hostEl;
  hostEl = document.createElement("div");
  hostEl.className = "bp-toast-host";
  hostEl.setAttribute("aria-live", "polite");
  document.body.appendChild(hostEl);
  return hostEl;
}

export function showBpToast(label, amount, capped){
  if(!amount || amount <= 0) return;
  const el = host();
  el.innerHTML = `
    <div class="bp-toast">
      <span class="bp-toast-label">${esc(label)}</span>
      <span class="bp-toast-amount">＋${Number(amount).toLocaleString()} BP</span>
      ${capped ? `<span class="bp-toast-note">本日の上限まで</span>` : ""}
    </div>`;
  const toast = el.querySelector(".bp-toast");
  requestAnimationFrame(() => toast.classList.add("bp-toast-show"));
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    toast.classList.remove("bp-toast-show");
    setTimeout(() => { if(el.firstChild === toast) el.innerHTML = ""; }, 260);
  }, BP_TOAST_MS);
}

// store.js が付与のたびに発火するイベントを購読する（読み込み時に一度だけ）
window.addEventListener("bp-toast", (e) => {
  const d = (e && e.detail) || {};
  showBpToast(d.label, d.amount, d.capped);
});
