/* =========================================================================
   🏠 チャッピーハウス：家具ショップ（②）とガチャ（⑧）

   ・ショップ … 家具・衣装・内装パーツ・背景をコインで買う。可愛さ／快適度／
     レア度を1枚のカードで見比べられるようにする。
   ・ガチャ  … 家具／衣装／背景／イベント限定の4種類。1回まわし・10連まわし、
     ガチャ券の消費、ダブりのコイン変換に対応。レア度が高いほど演出が派手に
     なり、ウルトラレアは虹色の特別演出＋効果音が入る。
   ========================================================================= */
import { playTapSound } from './audio.js';
import { chappySfx } from './chappyAudio.js';
import {
  getChappy, chappyBuy, chappyGachaInfo, chappyGachaPull, chappyItemState, chappyCurrentEvent,
} from './chappy.js';
import {
  CHAPPY_FURNITURE, CHAPPY_WEAR, CHAPPY_DECOR, CHAPPY_BACKGROUNDS,
  CHAPPY_RARITY, CHAPPY_GACHA, CHAPPY_DUPE_COINS,
} from './data/chappy-items.js';

function esc(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
const rarityRank = { ssr: 3, sr: 2, r: 1, n: 0 };

/* =========================================================================
   ショップ
   ========================================================================= */
const SHOP_TABS = [
  { key: "furniture",  label: "家具",   icon: "🪑" },
  { key: "wear",       label: "衣装",   icon: "👕" },
  { key: "decor",      label: "内装",   icon: "🧱" },
  { key: "background", label: "背景",   icon: "🌄" },
];

function shopList(kind){
  if(kind === "furniture") return CHAPPY_FURNITURE.filter(f => typeof f.price === "number");
  if(kind === "wear") return CHAPPY_WEAR.filter(w => typeof w.price === "number" && w.price > 0);
  if(kind === "decor") return CHAPPY_DECOR.filter(d => d.price > 0);
  if(kind === "background") return CHAPPY_BACKGROUNDS.filter(b => typeof b.price === "number" && b.price > 0);
  return [];
}

export function openChappyShop(onChange){
  const ov = document.createElement("div");
  ov.className = "modal-ov chp-sheet-ov";
  ov.innerHTML = `<div class="chp-sheet" role="dialog" aria-label="家具ショップ">
    <div class="chp-sheet-grip" aria-hidden="true"></div>
    <div class="chp-sheet-head">
      <span class="chp-sheet-title">🛍️ ショップ</span>
      <span class="chp-sheet-coin" id="chp-shop-coin"></span>
      <button type="button" class="chp-sheet-x" aria-label="閉じる">✕</button>
    </div>
    <div class="chp-sheet-body" id="chp-shop-body"></div>
  </div>`;
  document.body.appendChild(ov);

  const close = () => { try{ ov.remove(); }catch(e){} if(onChange) onChange(); };
  ov.querySelector(".chp-sheet-x").onclick = () => { playTapSound(); close(); };

  let tab = "furniture";
  const body = ov.querySelector("#chp-shop-body");

  const render = () => {
    const st = getChappy();
    ov.querySelector("#chp-shop-coin").textContent = `🪙 ${st.coins.toLocaleString()}`;
    const items = shopList(tab).slice().sort((a, b) => (rarityRank[b.rarity] || 0) - (rarityRank[a.rarity] || 0) || a.price - b.price);
    body.innerHTML = `
      <div class="chp-tabs" role="tablist">
        ${SHOP_TABS.map(t => `<button type="button" class="chp-tab${t.key === tab ? " chp-tab--on" : ""}" data-chp-shoptab="${t.key}" role="tab" aria-selected="${t.key === tab}">
          <span>${t.icon}</span>${esc(t.label)}</button>`).join("")}
      </div>
      <div class="chp-shop-grid">${items.map(it => shopCardHTML(tab, it, st)).join("")}</div>`;

    body.querySelectorAll("[data-chp-shoptab]").forEach(b => b.onclick = () => {
      playTapSound(); tab = b.dataset.chpShoptab; render();
    });
    body.querySelectorAll("[data-chp-buy]").forEach(b => b.onclick = () => {
      playTapSound();
      const r = chappyBuy(tab, b.dataset.chpBuy);
      if(!r.ok){ flashNote(body, r.msg); return; }
      chappySfx("reward");
      flashNote(body, `${r.item.name} を買いました！`);
      render();
    });
  };

  render();
  requestAnimationFrame(() => ov.querySelector(".chp-sheet").classList.add("chp-sheet-show"));
  return ov;
}

function shopCardHTML(kind, it, st){
  const s = chappyItemState(kind, it);
  const rar = CHAPPY_RARITY[it.rarity || "n"];
  const specs = kind === "furniture"
    ? `<span title="可愛さ">💗 ${it.cute}</span><span title="快適度">🛋️ ${it.comfort}</span>`
    : (it.cute ? `<span title="可愛さ">💗 ${it.cute}</span>` : "");
  const disabled = s.owned || !s.roomOk || !s.afford;
  return `
    <div class="chp-shop-card${s.owned ? " chp-shop-card--owned" : ""}">
      <div class="chp-shop-ico">${it.icon}</div>
      <div class="chp-shop-name">${esc(it.name)}</div>
      ${rar ? `<div class="chp-rarity chp-rarity--${it.rarity}">${"★".repeat(rar.star)} ${rar.label}</div>` : ""}
      ${it.desc ? `<div class="chp-shop-desc">${esc(it.desc)}</div>` : ""}
      <div class="chp-shop-specs">${specs}</div>
      <button type="button" class="chp-shop-buy" data-chp-buy="${esc(it.id)}"${disabled ? " disabled" : ""}>
        ${s.owned ? "もっている" : !s.roomOk ? `部屋Lv.${it.reqRoomLv}` : `🪙 ${it.price.toLocaleString()}`}
      </button>
    </div>`;
}

function flashNote(root, msg){
  let n = root.querySelector(".chp-toast");
  if(!n){ n = document.createElement("div"); n.className = "chp-toast"; root.appendChild(n); }
  n.textContent = msg;
  n.classList.remove("chp-toast-show");
  void n.offsetWidth;
  n.classList.add("chp-toast-show");
}

/* =========================================================================
   ガチャ
   ========================================================================= */
export function openChappyGacha(onChange){
  const ov = document.createElement("div");
  ov.className = "modal-ov chp-sheet-ov";
  ov.innerHTML = `<div class="chp-sheet" role="dialog" aria-label="ガチャ">
    <div class="chp-sheet-grip" aria-hidden="true"></div>
    <div class="chp-sheet-head">
      <span class="chp-sheet-title">🎁 ガチャ</span>
      <span class="chp-sheet-coin" id="chp-gacha-coin"></span>
      <button type="button" class="chp-sheet-x" aria-label="閉じる">✕</button>
    </div>
    <div class="chp-sheet-body" id="chp-gacha-body"></div>
  </div>`;
  document.body.appendChild(ov);

  const close = () => { try{ ov.remove(); }catch(e){} if(onChange) onChange(); };
  ov.querySelector(".chp-sheet-x").onclick = () => { playTapSound(); close(); };

  const body = ov.querySelector("#chp-gacha-body");
  const render = () => {
    const st = getChappy();
    ov.querySelector("#chp-gacha-coin").textContent = `🪙 ${st.coins.toLocaleString()}`;
    const ev = chappyCurrentEvent();
    body.innerHTML = `
      ${ev ? `<div class="chp-gacha-event">${ev.icon} <b>${esc(ev.name)}</b> 開催中！イベントガチャに限定アイテムが登場中です</div>` : ""}
      <div class="chp-gacha-list">
        ${CHAPPY_GACHA.map(g => {
          const info = chappyGachaInfo(g.key);
          const off = !info.available;
          return `
            <div class="chp-gacha-card${off ? " chp-gacha-card--off" : ""}">
              <div class="chp-gacha-top">
                <span class="chp-gacha-ico">${g.icon}</span>
                <span class="chp-gacha-meta">
                  <span class="chp-gacha-name">${esc(g.name)}</span>
                  <span class="chp-gacha-desc">${esc(g.desc)}</span>
                  <span class="chp-gacha-progress">コンプ ${info.owned} / ${info.poolSize}</span>
                </span>
              </div>
              <div class="chp-gacha-rates">
                ${Object.keys(g.weights).map(k => `<span class="chp-rate chp-rate--${k}">${CHAPPY_RARITY[k].label} ${g.weights[k]}%</span>`).join("")}
              </div>
              <div class="chp-gacha-actions">
                <button type="button" class="chp-gacha-btn" data-chp-pull="${g.key}" data-chp-times="1"${off ? " disabled" : ""}>
                  ${info.tickets > 0 ? `🎫 チケットで1回（${info.tickets}枚）` : `🪙 ${g.cost} で1回`}
                </button>
                <button type="button" class="chp-gacha-btn chp-gacha-btn--ten" data-chp-pull="${g.key}" data-chp-times="10"${off ? " disabled" : ""}>
                  🪙 ${info.tenCost.toLocaleString()} で10連
                </button>
              </div>
              ${off ? `<div class="chp-gacha-off">いまは開催中のイベントがありません</div>` : ""}
            </div>`;
        }).join("")}
      </div>
      <div class="chp-gacha-note">ダブったアイテムはコインに変わります（ノーマル${CHAPPY_DUPE_COINS.n}／レア${CHAPPY_DUPE_COINS.r}／SR${CHAPPY_DUPE_COINS.sr}／UR${CHAPPY_DUPE_COINS.ssr}）。10連は最後の1回でレア以上が確定します。</div>`;

    body.querySelectorAll("[data-chp-pull]").forEach(b => b.onclick = () => {
      playTapSound();
      const r = chappyGachaPull(b.dataset.chpPull, Number(b.dataset.chpTimes));
      if(!r.ok){ flashNote(body, r.msg); return; }
      playGachaStage(r, () => { render(); if(onChange) onChange(); });
    });
  };

  render();
  requestAnimationFrame(() => ov.querySelector(".chp-sheet").classList.add("chp-sheet-show"));
  return ov;
}

/* ---- レア演出：カプセルがふるえて開く → 結果発表 ---- */
function playGachaStage(result, onClose){
  const best = result.best ? (result.best.item.rarity || "n") : "n";
  const stage = document.createElement("div");
  stage.className = `chp-gacha-stage chp-gacha-stage--${best}`;
  stage.innerHTML = `
    <div class="chp-gacha-rays" aria-hidden="true"></div>
    <div class="chp-gacha-capsule" aria-hidden="true">🎁</div>
    <div class="chp-gacha-hint">${best === "ssr" ? "…なにかすごい予感…！" : best === "sr" ? "…きらきらしてる…！" : "…あけてみよう…"}</div>`;
  document.body.appendChild(stage);
  chappySfx(rarityRank[best] >= 2 ? "rare" : "pop");

  const revealDelay = best === "ssr" ? 2100 : best === "sr" ? 1600 : 1100;
  setTimeout(() => {
    stage.classList.add("chp-gacha-stage--open");
    setTimeout(() => {
      try{ stage.remove(); }catch(e){}
      showGachaResult(result, onClose);
    }, 520);
  }, revealDelay);
}

function showGachaResult(result, onClose){
  const best = result.best ? (result.best.item.rarity || "n") : "n";
  if(rarityRank[best] >= 2) chappySfx("rare");
  const ov = document.createElement("div");
  ov.className = "modal-ov";
  ov.innerHTML = `
    <div class="modal chp-modal chp-gacha-result chp-gacha-result--${best}">
      <div class="chp-modal-title">${best === "ssr" ? "💫 ウルトラレア！" : best === "sr" ? "✨ スーパーレア！" : "🎁 ガチャけっか"}</div>
      <div class="chp-gacha-items">
        ${result.results.map((r, i) => `
          <div class="chp-gacha-item chp-gacha-item--${r.item.rarity || "n"}" style="animation-delay:${(i * 0.07).toFixed(2)}s">
            <span class="chp-gacha-item-ico">${r.item.icon}</span>
            <span class="chp-gacha-item-name">${esc(r.item.name)}</span>
            <span class="chp-rarity chp-rarity--${r.item.rarity || "n"}">${"★".repeat(CHAPPY_RARITY[r.item.rarity || "n"].star)}</span>
            ${r.dupe ? `<span class="chp-gacha-dupe">ダブり → 🪙${r.coins}</span>` : `<span class="chp-gacha-new">NEW!</span>`}
          </div>`).join("")}
      </div>
      <div class="chp-modal-note">${result.usedTicket ? "ガチャ券を1枚つかいました。" : `🪙 ${result.cost.toLocaleString()} つかいました。`}</div>
      <button type="button" class="chp-modal-close" id="chp-gacha-ok">とじる</button>
    </div>`;
  document.body.appendChild(ov);
  const close = () => { try{ ov.remove(); }catch(e){} if(onClose) onClose(); };
  ov.querySelector("#chp-gacha-ok").onclick = () => { playTapSound(); close(); };
}
