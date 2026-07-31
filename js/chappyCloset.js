/* =========================================================================
   🏠 チャッピーハウス：着せ替え（⑤）

   衣装・帽子・アクセサリー・メガネ・くつをスロットごとに選ぶ。
   その場でプレビューに反映されるので、着せながら選べる。
   持っていないものはここからそのまま買える（ガチャ限定品は表示のみ）。
   ========================================================================= */
import { playTapSound } from './audio.js';
import { chappySfx } from './chappyAudio.js';
import { chappySVG } from './chappyChar.js';
import {
  getChappy, chappyEquip, chappyEquipped, chappyBuy, chappyStageForXp, chappyStyleScore,
} from './chappy.js';
import { CHAPPY_WEAR, CHAPPY_WEAR_SLOTS, CHAPPY_RARITY } from './data/chappy-items.js';

function esc(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

export function openChappyCloset(onChange){
  const ov = document.createElement("div");
  ov.className = "modal-ov chp-sheet-ov";
  ov.innerHTML = `<div class="chp-sheet" role="dialog" aria-label="着せ替え">
    <div class="chp-sheet-grip" aria-hidden="true"></div>
    <div class="chp-sheet-head">
      <span class="chp-sheet-title">👕 着せ替え</span>
      <span class="chp-sheet-coin" id="chp-closet-coin"></span>
      <button type="button" class="chp-sheet-x" aria-label="閉じる">✕</button>
    </div>
    <div class="chp-sheet-body" id="chp-closet-body"></div>
  </div>`;
  document.body.appendChild(ov);

  const close = () => { try{ ov.remove(); }catch(e){} if(onChange) onChange(); };
  ov.querySelector(".chp-sheet-x").onclick = () => { playTapSound(); close(); };
  ov.addEventListener("click", (e) => { if(e.target === ov) close(); });

  let slot = "outfit";
  const body = ov.querySelector("#chp-closet-body");

  const render = () => {
    const st = getChappy();
    const stage = chappyStageForXp(st.xp);
    const eq = chappyEquipped();
    ov.querySelector("#chp-closet-coin").textContent = `🪙 ${st.coins.toLocaleString()}`;
    const items = CHAPPY_WEAR.filter(w => w.slot === slot);

    body.innerHTML = `
      <div class="chp-closet-preview">
        <div class="chp-closet-char">${chappySVG(stage.key, eq)}</div>
        <div class="chp-closet-info">
          <div class="chp-closet-style">✨ おしゃれ度 <b>${chappyStyleScore(st)}</b></div>
          <ul class="chp-closet-eq">
            ${CHAPPY_WEAR_SLOTS.map(s => {
              const w = eq[s.key];
              return `<li><span>${s.icon}</span>${esc(w && w.cute > 0 ? w.name : "なし")}</li>`;
            }).join("")}
          </ul>
        </div>
      </div>
      <div class="chp-tabs" role="tablist">
        ${CHAPPY_WEAR_SLOTS.map(s => `<button type="button" class="chp-tab${s.key === slot ? " chp-tab--on" : ""}" data-chp-slot-tab="${s.key}" role="tab" aria-selected="${s.key === slot}">
          <span>${s.icon}</span>${esc(s.label)}</button>`).join("")}
      </div>
      <div class="chp-shop-grid">
        ${items.map(w => {
          const owned = w.price === 0 || !!st.owned.wear[w.id];
          const on = st.equip[slot] === w.id;
          const gachaOnly = w.price === null;
          const rar = CHAPPY_RARITY[w.rarity || "n"];
          return `
            <div class="chp-shop-card${on ? " chp-shop-card--on" : ""}${owned ? " chp-shop-card--owned" : ""}">
              <div class="chp-shop-ico">${w.icon}</div>
              <div class="chp-shop-name">${esc(w.name)}</div>
              <div class="chp-rarity chp-rarity--${w.rarity || "n"}">${"★".repeat(rar.star)} ${rar.label}</div>
              ${w.desc ? `<div class="chp-shop-desc">${esc(w.desc)}</div>` : ""}
              ${w.cute ? `<div class="chp-shop-specs"><span>💗 ${w.cute}</span></div>` : ""}
              <button type="button" class="chp-shop-buy" data-chp-wear="${esc(w.id)}"${(!owned && gachaOnly) ? " disabled" : ""}>
                ${on ? "きている" : owned ? "きせる" : gachaOnly ? "ガチャ限定" : `🪙 ${w.price}`}
              </button>
            </div>`;
        }).join("")}
      </div>`;

    body.querySelectorAll("[data-chp-slot-tab]").forEach(b => b.onclick = () => {
      playTapSound(); slot = b.dataset.chpSlotTab; render();
    });
    body.querySelectorAll("[data-chp-wear]").forEach(b => b.onclick = () => {
      playTapSound();
      const id = b.dataset.chpWear;
      const w = CHAPPY_WEAR.find(x => x.id === id);
      const cur = getChappy();
      if(!w) return;
      if(w.price > 0 && !cur.owned.wear[id]){
        const r = chappyBuy("wear", id);
        if(!r.ok){ note(body, r.msg); return; }
        chappySfx("reward");
        note(body, `${w.name} を買いました！`);
      }
      const r2 = chappyEquip(slot, id);
      if(!r2.ok){ note(body, r2.msg); return; }
      render();
    });
  };

  render();
  requestAnimationFrame(() => ov.querySelector(".chp-sheet").classList.add("chp-sheet-show"));
  return ov;
}

function note(root, msg){
  let n = root.querySelector(".chp-toast");
  if(!n){ n = document.createElement("div"); n.className = "chp-toast"; root.appendChild(n); }
  n.textContent = msg;
  n.classList.remove("chp-toast-show");
  void n.offsetWidth;
  n.classList.add("chp-toast-show");
}
