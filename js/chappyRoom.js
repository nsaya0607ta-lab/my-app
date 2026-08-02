/* =========================================================================
   🏠 チャッピーハウス：お部屋の描画と模様がえ（①）

   ・chappyRoomLayersHTML() … 壁・床・壁紙・窓・カーテン・照明・背景・
     季節イベントの飾り・置いてある家具までを1枚の部屋として組み立てる。
     育成画面のメインビューと、模様がえ画面のプレビューで同じ関数を使う。
   ・openChappyRoomEditor() … 家具の配置／テーマ／壁紙・床・窓・カーテン・
     照明／背景／増築をまとめて行うボトムシート。
   ・部屋レベルで使えるマスと機能が少しずつ増えるので、長く遊べる。
   ========================================================================= */
import { playTapSound } from './audio.js';
import {
  getChappy, chappySlots, chappyFloorUnlocked, chappyRoomFeatureUnlocked,
  chappyPlaceFurniture, chappyRemoveFurniture, chappySetTheme, chappySetDecor,
  chappySetBackground, chappyRoomInfo, chappyUpgradeRoom, chappyBuy, chappyTimeSlot,
  chappyCurrentEvent,
} from './chappy.js';
import {
  CHAPPY_FURNITURE, CHAPPY_FURNITURE_BY_ID, CHAPPY_THEMES, CHAPPY_THEME_BY_ID,
  CHAPPY_DECOR, CHAPPY_DECOR_BY_ID, CHAPPY_DECOR_CATS,
  CHAPPY_BACKGROUNDS, CHAPPY_BACKGROUND_BY_ID, CHAPPY_RARITY,
} from './data/chappy-items.js';
import { CHAPPY_FLOORS, CHAPPY_SLOTS, CHAPPY_ROOM_FEATURE_LV } from './data/chappy-config.js';

function esc(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

export function chappySlotPos(floorKey, slotId){
  const s = (CHAPPY_SLOTS[floorKey] || []).find(x => x.id === slotId);
  return s ? { x: s.x, y: s.y } : null;
}

export function chappyPlacedOn(floorKey){
  return { ...(getChappy().room.placed[floorKey] || {}) };
}

/* =========================================================================
   部屋の外枠につけるclassとCSS変数
   ========================================================================= */
export function chappyRoomClass(floorKey){
  const st = getChappy();
  const theme = CHAPPY_THEME_BY_ID[st.room.theme] || CHAPPY_THEME_BY_ID.plain;
  const light = CHAPPY_DECOR_BY_ID[st.room.decor.light];
  const cls = ["chp-room", `chp-room--${chappyTimeSlot()}`, `chp-floorview--${floorKey}`];
  if(theme.starry) cls.push("chp-room--starry");
  if(light && light.sparkle) cls.push("chp-room--sparkle");
  if(chappyCurrentEvent()) cls.push("chp-room--event");
  return cls.join(" ");
}

export function chappyRoomStyleAttr(floorKey){
  const st = getChappy();
  const theme = CHAPPY_THEME_BY_ID[st.room.theme] || CHAPPY_THEME_BY_ID.plain;
  const bg = CHAPPY_BACKGROUND_BY_ID[st.room.background] || CHAPPY_BACKGROUNDS[0];
  const light = CHAPPY_DECOR_BY_ID[st.room.decor.light];
  const ev = chappyCurrentEvent();
  const parts = [
    `--chp-wall:${floorKey === "garden" ? bg.sky : theme.wall}`,
    `--chp-floor:${floorKey === "garden" ? "linear-gradient(180deg,#bfe0a8,#a7cf90)" : theme.floor}`,
    `--chp-accent:${theme.accent}`,
    `--chp-sky:${bg.sky}`,
  ];
  if(light && light.glow) parts.push(`--chp-glow:${light.glow}`);
  if(ev && ev.tint) parts.push(`--chp-tint:${ev.tint}`);
  return parts.join(";");
}

/* =========================================================================
   部屋のなかみ（キャラクター・吹き出しは呼び出し側が足す）
   opts.edit … true にすると空きマスに「＋」が出て、タップで配置できる
   ========================================================================= */
export function chappyRoomLayersHTML(floorKey, opts){
  const o = opts || {};
  const st = getChappy();
  const bg = CHAPPY_BACKGROUND_BY_ID[st.room.background] || CHAPPY_BACKGROUNDS[0];
  const wp = CHAPPY_DECOR_BY_ID[st.room.decor.wallpaper];
  const fl = CHAPPY_DECOR_BY_ID[st.room.decor.floor];
  const win = CHAPPY_DECOR_BY_ID[st.room.decor.window];
  const ct = CHAPPY_DECOR_BY_ID[st.room.decor.curtain];
  const ev = chappyCurrentEvent();
  const slots = chappySlots(floorKey);
  const placed = st.room.placed[floorKey] || {};
  const isGarden = floorKey === "garden";

  const windowHTML = isGarden ? "" : `
    <div class="chp-window chp-window--${esc((win && win.shape) || "round")}">
      <div class="chp-window-sky" style="background:${esc(bg.sky)}">
        ${bg.starry ? `<span class="chp-window-stars" aria-hidden="true"></span>` : ""}
        <span class="chp-window-scene" aria-hidden="true">${esc(bg.icon)}</span>
      </div>
      <span class="chp-window-frame" aria-hidden="true"></span>
    </div>
    ${ct && ct.color ? `<div class="chp-curtain" style="--chp-curtain:${esc(ct.color)}" aria-hidden="true"></div>` : ""}`;

  const decoHTML = ev ? `
    <div class="chp-event-deco" aria-hidden="true">
      ${ev.deco.map((d, i) => `<span class="chp-event-deco-item chp-event-deco-item--${i}">${d}</span>`).join("")}
    </div>` : "";

  const slotHTML = slots.map(slot => {
    const fid = placed[slot.id];
    const f = fid ? CHAPPY_FURNITURE_BY_ID[fid] : null;
    const style = `left:${slot.x}%;top:${slot.y}%`;
    if(f){
      return `<${o.edit ? "button type=\"button\"" : "div"} class="chp-furni chp-furni--${esc(f.place)}${o.edit ? " chp-furni--edit" : ""}"
        style="${style}" ${o.edit ? `data-chp-slot="${esc(slot.id)}"` : ""} ${o.edit ? `aria-label="${esc(f.name)}を置きかえる"` : "aria-hidden=\"true\""}>
        <span class="chp-furni-ico">${f.icon}</span>
      </${o.edit ? "button" : "div"}>`;
    }
    if(!o.edit) return "";
    return `<button type="button" class="chp-slot-empty chp-slot-empty--${esc(slot.kind)}" style="${style}"
      data-chp-slot="${esc(slot.id)}" aria-label="ここに家具を置く">＋</button>`;
  }).join("");

  return `
    <div class="chp-room-wall" aria-hidden="true"></div>
    ${wp && wp.css ? `<div class="chp-room-wallpattern" style="background:${esc(wp.css)}" aria-hidden="true"></div>` : ""}
    <div class="chp-room-floorbase" aria-hidden="true"></div>
    ${fl && fl.css ? `<div class="chp-room-floorpattern" style="background:${esc(fl.css)}" aria-hidden="true"></div>` : ""}
    ${windowHTML}
    ${isGarden ? `<div class="chp-garden-sun" aria-hidden="true">☀️</div>` : ""}
    <div class="chp-room-glow" aria-hidden="true"></div>
    <div class="chp-room-tint" aria-hidden="true"></div>
    ${decoHTML}
    <div class="chp-furni-layer">${slotHTML}</div>`;
}

/* =========================================================================
   模様がえボトムシート
   ========================================================================= */
let editFloor = "f1";

export function openChappyRoomEditor(onChange){
  const ov = document.createElement("div");
  ov.className = "modal-ov chp-sheet-ov";
  ov.innerHTML = `<div class="chp-sheet" role="dialog" aria-label="お部屋の模様がえ">
    <div class="chp-sheet-grip" aria-hidden="true"></div>
    <div class="chp-sheet-head">
      <span class="chp-sheet-title">🛋️ お部屋の模様がえ</span>
      <button type="button" class="chp-sheet-x" aria-label="閉じる">✕</button>
    </div>
    <div class="chp-sheet-body" id="chp-edit-body"></div>
  </div>`;
  document.body.appendChild(ov);

  const close = () => { try{ ov.remove(); }catch(e){} if(onChange) onChange(); };
  ov.querySelector(".chp-sheet-x").onclick = () => { playTapSound(); close(); };

  let tab = "furniture";
  const body = ov.querySelector("#chp-edit-body");

  const render = () => {
    const st = getChappy();
    const tabs = [
      { key: "furniture", label: "家具", icon: "🪑", ok: true },
      { key: "theme",     label: "テーマ", icon: "🎨", ok: chappyRoomFeatureUnlocked("theme"), lv: CHAPPY_ROOM_FEATURE_LV.theme },
      { key: "decor",     label: "内装", icon: "🧱", ok: chappyRoomFeatureUnlocked("wallpaper"), lv: CHAPPY_ROOM_FEATURE_LV.wallpaper },
      { key: "background",label: "背景", icon: "🌄", ok: true },
      { key: "upgrade",   label: "増築", icon: "🏗️", ok: true },
    ];
    body.innerHTML = `
      <div class="chp-tabs" role="tablist">
        ${tabs.map(t => `<button type="button" class="chp-tab${t.key === tab ? " chp-tab--on" : ""}${t.ok ? "" : " chp-tab--lock"}"
          data-chp-tab="${t.key}" role="tab" aria-selected="${t.key === tab}">
          <span>${t.icon}</span>${esc(t.label)}${t.ok ? "" : `<span class="chp-lock-badge">Lv.${t.lv}</span>`}</button>`).join("")}
      </div>
      <div class="chp-tabpanel" id="chp-edit-panel">${panelHTML(tab, st)}</div>`;

    body.querySelectorAll("[data-chp-tab]").forEach(b => b.onclick = () => {
      const t = tabs.find(x => x.key === b.dataset.chpTab);
      playTapSound();
      if(t && !t.ok){ toast(body, `お部屋レベル${t.lv}で解放されます`); return; }
      tab = b.dataset.chpTab;
      render();
    });
    bindPanel(body, tab, render);
  };

  render();
  requestAnimationFrame(() => ov.querySelector(".chp-sheet").classList.add("chp-sheet-show"));
  return ov;
}

function toast(root, msg){
  const t = root.querySelector(".chp-toast") || (() => {
    const n = document.createElement("div");
    n.className = "chp-toast";
    root.appendChild(n);
    return n;
  })();
  t.textContent = msg;
  t.classList.remove("chp-toast-show");
  void t.offsetWidth;
  t.classList.add("chp-toast-show");
}

/* ---- 各タブの中身 ---- */
function panelHTML(tab, st){
  if(tab === "furniture") return furniturePanelHTML(st);
  if(tab === "theme") return themePanelHTML(st);
  if(tab === "decor") return decorPanelHTML(st);
  if(tab === "background") return backgroundPanelHTML(st);
  return upgradePanelHTML();
}

function furniturePanelHTML(st){
  const floors = CHAPPY_FLOORS.filter(f => chappyFloorUnlocked(f.key) || f.key === "f1");
  if(!chappyFloorUnlocked(editFloor)) editFloor = "f1";
  const slots = chappySlots(editFloor);
  const placed = st.room.placed[editFloor] || {};
  const used = Object.keys(placed).length;
  const lockedFloors = CHAPPY_FLOORS.filter(f => !chappyFloorUnlocked(f.key));
  return `
    <div class="chp-floor-tabs">
      ${floors.map(f => `<button type="button" class="chp-floor-tab${f.key === editFloor ? " chp-floor-tab--on" : ""}"
        data-chp-floor="${f.key}"><span>${f.icon}</span>${esc(f.label)}</button>`).join("")}
      ${lockedFloors.map(f => `<span class="chp-floor-tab chp-floor-tab--lock">${f.icon} ${esc(f.label)}<span class="chp-lock-badge">部屋Lv.${f.reqRoomLv}</span></span>`).join("")}
    </div>
    <div class="chp-edit-preview ${chappyRoomClass(editFloor)}" style="${chappyRoomStyleAttr(editFloor)}" id="chp-edit-room">
      ${chappyRoomLayersHTML(editFloor, { edit: true })}
    </div>
    <div class="chp-edit-note">マスをタップすると家具を置けます（${used} / ${slots.length} マス使用中）</div>`;
}

function themePanelHTML(st){
  return `<div class="chp-item-grid">
    ${CHAPPY_THEMES.map(t => {
      const owned = t.price === 0 || !!st.owned.theme[t.id];
      const locked = st.room.level < (t.reqRoomLv || 1);
      const on = st.room.theme === t.id;
      return `<button type="button" class="chp-item${on ? " chp-item--on" : ""}${locked ? " chp-item--lock" : ""}"
        data-chp-theme="${t.id}">
        <span class="chp-item-ico">${t.icon}</span>
        <span class="chp-item-name">${esc(t.name)}</span>
        <span class="chp-item-sub">${locked ? `部屋Lv.${t.reqRoomLv}` : owned ? (on ? "使用中" : "もっている") : `🪙 ${t.price}`}</span>
        <span class="chp-item-swatch" style="background:${esc(t.wall)}"></span>
      </button>`;
    }).join("")}
  </div>`;
}

function decorPanelHTML(st){
  return CHAPPY_DECOR_CATS.map(cat => {
    const unlocked = chappyRoomFeatureUnlocked(cat.key);
    const list = CHAPPY_DECOR.filter(d => d.cat === cat.key);
    return `
      <div class="chp-decor-sec">
        <div class="chp-decor-head">${cat.icon} ${esc(cat.label)}
          ${unlocked ? "" : `<span class="chp-lock-badge">部屋Lv.${CHAPPY_ROOM_FEATURE_LV[cat.key]}</span>`}</div>
        <div class="chp-item-grid chp-item-grid--sm${unlocked ? "" : " chp-item-grid--lock"}">
          ${list.map(d => {
            const owned = d.price === 0 || !!st.owned.decor[d.id];
            const on = st.room.decor[cat.key] === d.id;
            return `<button type="button" class="chp-item${on ? " chp-item--on" : ""}" data-chp-decor="${d.id}" data-chp-cat="${cat.key}"${unlocked ? "" : " disabled"}>
              <span class="chp-item-ico">${d.icon}</span>
              <span class="chp-item-name">${esc(d.name)}</span>
              <span class="chp-item-sub">${owned ? (on ? "使用中" : "もっている") : `🪙 ${d.price}`}</span>
            </button>`;
          }).join("")}
        </div>
      </div>`;
  }).join("");
}

function backgroundPanelHTML(st){
  return `<div class="chp-item-grid">
    ${CHAPPY_BACKGROUNDS.map(b => {
      const owned = b.price === 0 || !!st.owned.background[b.id];
      const on = st.room.background === b.id;
      const gacha = b.price === null;
      return `<button type="button" class="chp-item${on ? " chp-item--on" : ""}${(!owned && gacha) ? " chp-item--lock" : ""}" data-chp-bg="${b.id}">
        <span class="chp-item-ico">${b.icon}</span>
        <span class="chp-item-name">${esc(b.name)}</span>
        <span class="chp-item-sub">${owned ? (on ? "使用中" : "もっている") : (gacha ? "ガチャ限定" : `🪙 ${b.price}`)}</span>
        <span class="chp-item-swatch" style="background:${esc(b.sky)}"></span>
        <span class="chp-rarity chp-rarity--${b.rarity}">${CHAPPY_RARITY[b.rarity].label}</span>
      </button>`;
    }).join("")}
  </div>`;
}

function upgradePanelHTML(){
  const info = chappyRoomInfo();
  const st = getChappy();
  return `
    <div class="chp-upgrade">
      <div class="chp-upgrade-now">
        <div class="chp-upgrade-lv">おうち Lv.<b>${info.level}</b></div>
        <div class="chp-upgrade-desc">${esc(info.cur.unlock)}</div>
        <div class="chp-upgrade-stats">
          <span>🪑 家具 ${info.score.count}個</span>
          <span>💗 かわいさ ${info.score.cute}</span>
          <span>🛋️ 居心地 ${info.score.comfort}</span>
        </div>
      </div>
      ${info.next ? `
        <div class="chp-upgrade-next">
          <div class="chp-upgrade-nexthead">つぎの増築：Lv.${info.next.level}</div>
          <div class="chp-upgrade-unlock">✨ ${esc(info.next.unlock)}</div>
          <ul class="chp-upgrade-req">
            <li class="${info.chappyLevel >= info.next.reqLv ? "ok" : ""}">チャッピー Lv.${info.next.reqLv} 以上（いま Lv.${info.chappyLevel}）</li>
            <li class="${st.coins >= info.next.cost ? "ok" : ""}">🪙 ${info.next.cost.toLocaleString()} コイン（いま ${st.coins.toLocaleString()}）</li>
          </ul>
          <button type="button" class="chp-cta" id="chp-do-upgrade"${info.canUpgrade ? "" : " disabled"}>
            ${info.canUpgrade ? "増築する" : esc(info.reason || "まだ増築できません")}
          </button>
          <div class="chp-upgrade-hint">学習・タスク・ログインでチャッピーが育つと、おうちも大きくなります。</div>
        </div>`
      : `<div class="chp-upgrade-max">🏰 最大レベルです。夢のおうちが完成しました！</div>`}
    </div>`;
}

/* ---- 各タブの操作 ---- */
function bindPanel(root, tab, rerender){
  if(tab === "furniture"){
    root.querySelectorAll("[data-chp-floor]").forEach(b => b.onclick = () => {
      playTapSound(); editFloor = b.dataset.chpFloor; rerender();
    });
    root.querySelectorAll("[data-chp-slot]").forEach(b => b.onclick = () => {
      playTapSound();
      openFurniturePicker(editFloor, b.dataset.chpSlot, rerender);
    });
  }
  if(tab === "theme"){
    root.querySelectorAll("[data-chp-theme]").forEach(b => b.onclick = () => {
      playTapSound();
      const id = b.dataset.chpTheme;
      const st = getChappy();
      const t = CHAPPY_THEME_BY_ID[id];
      if(!t) return;
      if(t.price > 0 && !st.owned.theme[id]){
        const r = chappyBuy("theme", id);
        if(!r.ok){ toast(root, r.msg); return; }
        toast(root, `${t.name}を買いました！`);
      }
      const r2 = chappySetTheme(id);
      if(!r2.ok){ toast(root, r2.msg); return; }
      rerender();
    });
  }
  if(tab === "decor"){
    root.querySelectorAll("[data-chp-decor]").forEach(b => b.onclick = () => {
      playTapSound();
      const id = b.dataset.chpDecor, cat = b.dataset.chpCat;
      const st = getChappy();
      const d = CHAPPY_DECOR_BY_ID[id];
      if(!d) return;
      if(d.price > 0 && !st.owned.decor[id]){
        const r = chappyBuy("decor", id);
        if(!r.ok){ toast(root, r.msg); return; }
        toast(root, `${d.name}を買いました！`);
      }
      const r2 = chappySetDecor(cat, id);
      if(!r2.ok){ toast(root, r2.msg); return; }
      rerender();
    });
  }
  if(tab === "background"){
    root.querySelectorAll("[data-chp-bg]").forEach(b => b.onclick = () => {
      playTapSound();
      const id = b.dataset.chpBg;
      const st = getChappy();
      const bg = CHAPPY_BACKGROUND_BY_ID[id];
      if(!bg) return;
      if(bg.price === null && !st.owned.background[id]){ toast(root, "はいけいガチャで手に入ります"); return; }
      if(bg.price > 0 && !st.owned.background[id]){
        const r = chappyBuy("background", id);
        if(!r.ok){ toast(root, r.msg); return; }
        toast(root, `${bg.name}を買いました！`);
      }
      const r2 = chappySetBackground(id);
      if(!r2.ok){ toast(root, r2.msg); return; }
      rerender();
    });
  }
  if(tab === "upgrade"){
    const btn = root.querySelector("#chp-do-upgrade");
    if(btn) btn.onclick = () => {
      playTapSound();
      const r = chappyUpgradeRoom();
      if(!r.ok){ toast(root, r.msg); return; }
      toast(root, `おうちが Lv.${r.next.level} になりました！`);
      rerender();
    };
  }
}

/* ---- 家具を選ぶピッカー（そのマスに置ける種類だけ出す） ---- */
function openFurniturePicker(floorKey, slotId, onDone){
  const slot = (CHAPPY_SLOTS[floorKey] || []).find(s => s.id === slotId);
  if(!slot) return;
  const st = getChappy();
  const placedAll = [];
  Object.values(st.room.placed).forEach(f => Object.values(f).forEach(id => placedAll.push(id)));
  const here = (st.room.placed[floorKey] || {})[slotId] || null;

  const list = CHAPPY_FURNITURE.filter(f => st.owned.furniture[f.id] && f.place === slot.kind);
  const kindLabel = slot.kind === "wall" ? "壁にかける" : slot.kind === "hang" ? "吊るす" : "床に置く";

  const ov = document.createElement("div");
  ov.className = "modal-ov";
  ov.innerHTML = `
    <div class="modal chp-modal">
      <div class="chp-modal-title">🪑 ${kindLabel}家具をえらぶ</div>
      ${list.length ? `<div class="chp-pick-list">
        ${list.map(f => {
          const usedElsewhere = placedAll.includes(f.id) && f.id !== here;
          return `<button type="button" class="chp-pick-row${f.id === here ? " chp-pick-row--on" : ""}" data-chp-pick="${f.id}">
            <span class="chp-pick-ico">${f.icon}</span>
            <span class="chp-pick-info">
              <span class="chp-pick-name">${esc(f.name)}</span>
              <span class="chp-pick-desc">💗${f.cute} 🛋️${f.comfort}${usedElsewhere ? " ・別の場所から移動します" : ""}</span>
            </span>
            <span class="chp-rarity chp-rarity--${f.rarity}">${CHAPPY_RARITY[f.rarity].label}</span>
          </button>`;
        }).join("")}
      </div>` : `<div class="chp-empty">${kindLabel}家具をまだ持っていません。<br>ショップかガチャで手に入れよう！</div>`}
      ${here ? `<button type="button" class="chp-ghost" id="chp-pick-remove">この家具をかたづける</button>` : ""}
      <button type="button" class="chp-modal-close" id="chp-pick-close">閉じる</button>
    </div>`;
  document.body.appendChild(ov);

  const close = () => { try{ ov.remove(); }catch(e){} };
  ov.querySelector("#chp-pick-close").onclick = () => { playTapSound(); close(); };
  const rm = ov.querySelector("#chp-pick-remove");
  if(rm) rm.onclick = () => { playTapSound(); chappyRemoveFurniture(floorKey, slotId); close(); if(onDone) onDone(); };
  ov.querySelectorAll("[data-chp-pick]").forEach(b => b.onclick = () => {
    playTapSound();
    chappyPlaceFurniture(floorKey, slotId, b.dataset.chpPick);
    close();
    if(onDone) onDone();
  });
}

export function chappyEditFloor(){ return editFloor; }
