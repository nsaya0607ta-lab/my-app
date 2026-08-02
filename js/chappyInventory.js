/* =========================================================================
   チャッピーハウス：所持品一覧

   既存の owned / equip / room / tickets を読み取り専用でまとめて表示する。
   保存形式は変更せず、購入・ガチャ・着せ替え・模様がえの結果を一か所で確認できる。
   ========================================================================= */
import { playTapSound } from './audio.js';
import { getChappy } from './chappy.js';
import { iconHTML } from './icons.js';
import {
  CHAPPY_FURNITURE, CHAPPY_WEAR, CHAPPY_DECOR, CHAPPY_DECOR_CATS,
  CHAPPY_THEMES, CHAPPY_BACKGROUNDS, CHAPPY_RARITY,
} from './data/chappy-items.js';

function esc(value){
  return String(value == null ? "" : value).replace(/[&<>"']/g, char => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));
}

const TICKET_DEFS = [
  { id: "furniture", name: "家具ガチャ券", desc: "家具ガチャを1回まわせます" },
  { id: "costume", name: "衣装ガチャ券", desc: "衣装ガチャを1回まわせます" },
  { id: "background", name: "背景ガチャ券", desc: "背景ガチャを1回まわせます" },
  { id: "event", name: "イベントガチャ券", desc: "開催中の限定ガチャに使えます" },
];

const TABS = [
  { key: "all", label: "すべて", icon: "folder" },
  { key: "furniture", label: "家具", icon: "sofa" },
  { key: "wear", label: "衣装", icon: "shirt" },
  { key: "room", label: "内装", icon: "palette" },
  { key: "background", label: "背景", icon: "image" },
  { key: "tickets", label: "ガチャ券", icon: "ticket" },
];

function isOwned(kind, item, state){
  const map = state.owned?.[kind] || {};
  if(kind === "furniture") return !!map[item.id];
  return !!map[item.id] || item.price === 0;
}

function itemStatus(kind, item, state){
  if(kind === "furniture"){
    const placed = Object.values(state.room?.placed || {}).some(floor =>
      Object.values(floor || {}).includes(item.id)
    );
    return placed ? "配置中" : "所持中";
  }
  if(kind === "wear") return Object.values(state.equip || {}).includes(item.id) ? "装備中" : "所持中";
  if(kind === "theme") return state.room?.theme === item.id ? "使用中" : "所持中";
  if(kind === "decor") return Object.values(state.room?.decor || {}).includes(item.id) ? "使用中" : "所持中";
  if(kind === "background") return state.room?.background === item.id ? "使用中" : "所持中";
  return "所持中";
}

function decorLabel(item){
  return CHAPPY_DECOR_CATS.find(category => category.key === item.cat)?.label || "内装パーツ";
}

function catalog(state){
  return {
    furniture: CHAPPY_FURNITURE.filter(item => isOwned("furniture", item, state)).map(item => ({
      kind: "furniture", group: "家具", motif: "sofa", item,
      desc: item.desc || "お部屋に置ける家具",
    })),
    wear: CHAPPY_WEAR.filter(item => isOwned("wear", item, state)).map(item => ({
      kind: "wear", group: "衣装", motif: "shirt", item,
      desc: item.desc || "着せ替えで使えるアイテム",
    })),
    room: [
      ...CHAPPY_THEMES.filter(item => isOwned("theme", item, state)).map(item => ({
        kind: "theme", group: "お部屋テーマ", motif: "home", item, desc: "壁と床の雰囲気をまとめて変更",
      })),
      ...CHAPPY_DECOR.filter(item => isOwned("decor", item, state)).map(item => ({
        kind: "decor", group: decorLabel(item), motif: "palette", item, desc: `${decorLabel(item)}の模様がえパーツ`,
      })),
    ],
    background: CHAPPY_BACKGROUNDS.filter(item => isOwned("background", item, state)).map(item => ({
      kind: "background", group: "背景", motif: "image", item, desc: "お部屋の外に見える景色",
    })),
    tickets: TICKET_DEFS.map(item => ({
      kind: "ticket", group: "ガチャ券", motif: "ticket", item,
      count: Math.max(0, Number(state.tickets?.[item.id]) || 0), desc: item.desc,
    })),
  };
}

export function chappyInventorySummary(sourceState){
  const state = sourceState || getChappy();
  const groups = catalog(state);
  const itemCount = groups.furniture.length + groups.wear.length + groups.room.length + groups.background.length;
  const ticketCount = groups.tickets.reduce((sum, entry) => sum + entry.count, 0);
  return {
    itemCount,
    ticketCount,
    furniture: groups.furniture.length,
    wear: groups.wear.length,
    room: groups.room.length,
    background: groups.background.length,
  };
}

function entryCardHTML(entry, state){
  const item = entry.item;
  const rarity = CHAPPY_RARITY[item.rarity || "n"] || CHAPPY_RARITY.n;
  const status = entry.kind === "ticket"
    ? (entry.count > 0 ? `${entry.count}枚` : "0枚")
    : itemStatus(entry.kind, item, state);
  const inactiveClass = entry.kind === "ticket" && entry.count === 0 ? " chp-inv-card--empty" : "";
  return `<article class="chp-inv-card${inactiveClass}">
    <span class="chp-inv-motif chp-inv-motif--${entry.kind}" aria-hidden="true">${iconHTML(entry.motif)}</span>
    <span class="chp-inv-main">
      <span class="chp-inv-name">${esc(item.name)}</span>
      <span class="chp-inv-desc">${esc(entry.desc)}</span>
      <span class="chp-inv-meta">
        ${entry.kind === "ticket" ? "" : `<span class="chp-rarity chp-rarity--${item.rarity || "n"}">${esc(rarity.label)}</span>`}
        <span class="chp-inv-group">${esc(entry.group)}</span>
      </span>
    </span>
    <span class="chp-inv-state">${esc(status)}</span>
  </article>`;
}

function sectionHTML(label, entries, state){
  if(!entries.length) return "";
  return `<section class="chp-inv-section">
    <div class="chp-inv-section-head"><span>${esc(label)}</span><b>${entries.length}</b></div>
    <div class="chp-inv-list">${entries.map(entry => entryCardHTML(entry, state)).join("")}</div>
  </section>`;
}

export function openChappyInventory(onClose){
  const overlay = document.createElement("div");
  overlay.className = "modal-ov chp-sheet-ov";
  overlay.innerHTML = `<div class="chp-sheet" role="dialog" aria-modal="true" aria-label="チャッピーの所持品">
    <div class="chp-sheet-grip" aria-hidden="true"></div>
    <div class="chp-sheet-head">
      <span class="chp-sheet-title chp-sheet-title--icon">${iconHTML("folder")} 所持品</span>
      <button type="button" class="chp-sheet-x" aria-label="閉じる">×</button>
    </div>
    <div class="chp-sheet-body" id="chp-inventory-body"></div>
  </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.querySelector(".chp-sheet")?.classList.add("chp-sheet-show"));

  let activeTab = "all";
  const close = () => { try{ overlay.remove(); }catch(e){} if(onClose) onClose(); };
  overlay.querySelector(".chp-sheet-x").onclick = () => { playTapSound(); close(); };

  const render = () => {
    const state = getChappy();
    const groups = catalog(state);
    const summary = chappyInventorySummary(state);
    const body = overlay.querySelector("#chp-inventory-body");
    body.innerHTML = `
      <div class="chp-inv-summary">
        <span><b>${summary.itemCount}</b><small>アイテム</small></span>
        <span><b>${summary.furniture}</b><small>家具</small></span>
        <span><b>${summary.wear}</b><small>衣装</small></span>
        <span><b>${summary.ticketCount}</b><small>ガチャ券</small></span>
      </div>
      <div class="chp-tabs chp-tabs--scroll" role="tablist" aria-label="所持品カテゴリー">
        ${TABS.map(tab => `<button type="button" class="chp-tab${tab.key === activeTab ? " chp-tab--on" : ""}"
          data-chp-inv-tab="${tab.key}" role="tab" aria-selected="${tab.key === activeTab}">
          ${iconHTML(tab.icon)} ${esc(tab.label)}
        </button>`).join("")}
      </div>
      <div class="chp-inv-panels">
        ${activeTab === "all" ? [
          sectionHTML("家具", groups.furniture, state),
          sectionHTML("衣装", groups.wear, state),
          sectionHTML("内装・テーマ", groups.room, state),
          sectionHTML("背景", groups.background, state),
          sectionHTML("ガチャ券", groups.tickets.filter(entry => entry.count > 0), state),
        ].join("") : sectionHTML(TABS.find(tab => tab.key === activeTab)?.label || "所持品", groups[activeTab] || [], state)}
      </div>
      ${activeTab !== "tickets" && !(groups[activeTab] || []).length && activeTab !== "all"
        ? `<div class="chp-empty">このカテゴリーの所持品はまだありません。<br>ショップやガチャで手に入れると、ここに追加されます。</div>` : ""}
      <p class="chp-inv-note">購入・ガチャ・着せ替え・模様がえの結果は自動で反映されます。所持品や経験値が時間経過で消えることはありません。</p>`;

    body.querySelectorAll("[data-chp-inv-tab]").forEach(button => button.onclick = () => {
      playTapSound();
      activeTab = button.dataset.chpInvTab;
      render();
    });
  };

  render();
}
