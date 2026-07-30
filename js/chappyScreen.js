/* =========================================================================
   🏠 チャッピーハウス：メイン画面＋ホーム画面ミニウィジェット（見た目担当）

   ・状態の計算・永続化・XP/コイン付与はすべて js/chappy.js が担当し、
     ここではHTML組み立て・アニメーション・操作イベントのみを扱う。
   ・お部屋の描画は js/chappyRoom.js、キャラクターSVGは js/chappyChar.js、
     チャッピーが自分で生活する仕組みは js/chappyLife.js に分かれている。
   ・go("chappy")で遷移してくる独立した1画面（introquiz等と同じ作法）。
   ・画面を離れたらBGMと生活エンジンを必ず止める（電池と通知音の配慮）。
   ========================================================================= */
import { app, go } from './render.js';
import { playTapSound } from './audio.js';
import { chappySVG } from './chappyChar.js';
import {
  getChappy, chappyLevelInfo, chappyStageForXp, chappyNextStage, chappyStats,
  chappyPet, chappyFeed, chappyCare, chappyEquipped, chappyStyleScore,
  isChappyHomeWidgetVisible, setChappyHomeWidgetVisible, isChappyBgmOn, setChappyBgm,
  chappyTimeSlot, chappyCurrentEvent, chappyMissionSummary, chappyClaimSecret,
  chappyRecordTalk, chappyFloorUnlocked, chappyRoomInfo,
} from './chappy.js';
import {
  chappyRoomLayersHTML, chappyRoomClass, chappyRoomStyleAttr, chappySlotPos,
  chappyPlacedOn, openChappyRoomEditor,
} from './chappyRoom.js';
import { openChappyShop, openChappyGacha } from './chappyShop.js';
import { openChappyCloset } from './chappyCloset.js';
import { openChappyMissions, openChappyBook } from './chappyBook.js';
import { startChappyLife, stopChappyLife, chappyLifeInterrupt, chappyPickLine } from './chappyLife.js';
import {
  chappyAudioStart, chappyAudioStop, chappyAudioSwitch, chappyAudioProfileFor,
  chappyAudioIsPlaying, chappySfx,
} from './chappyAudio.js';
import { CHAPPY_FOODS, CHAPPY_CARES, CHAPPY_CARE_STATS, CHAPPY_STAT_MAX, CHAPPY_FLOORS } from './data/chappy-config.js';
import { CHAPPY_LINES } from './data/chappy-lines.js';

export const CHAPPY_NAME = "まるチャピ";
export { chappySVG };

function esc(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

/* =========================================================================
   共通ヘルパー
   ========================================================================= */
function pickLine(kind){
  const list = CHAPPY_LINES[kind] || [];
  return list[Math.floor(Math.random() * list.length)] || "";
}

function isNight(){ return chappyTimeSlot() === "night"; }
function isMorning(){ return chappyTimeSlot() === "morning"; }

// 表情・ポーズの基本クラス（優先度：空腹 > 夜のねむけ > 通常）
function moodClasses(stats){
  const cls = [];
  if(stats.hunger <= 25) cls.push("chp-pose-hungry");
  if(isNight() || stats.sleep <= 30) cls.push("chp-face-sleepy");
  return cls;
}

/* =========================================================================
   ホーム画面ミニウィジェット（お天気カード右側）
   タップで育成画面へ遷移する（data-goはrenderSelect()側で配線される）。
   ========================================================================= */
export function chappyMiniWidgetHTML(){
  const st = getChappy();
  const stage = chappyStageForXp(st.xp);
  const lv = chappyLevelInfo(st.xp).level;
  const stats = chappyStats(st);
  const cls = ["weather-chappy-btn", "chp-mini"];
  if(isNight()) cls.push("chp-face-sleepy");
  else if(isMorning()) cls.push("chp-mini--morning");
  if(stats.hunger <= 25) cls.push("chp-pose-hungry");
  const ms = chappyMissionSummary();
  return `
    <button type="button" class="${cls.join(" ")}" data-go="chappy"
      aria-label="チャッピーハウス：${CHAPPY_NAME} Lv.${lv}" title="チャッピーハウス：${CHAPPY_NAME} Lv.${lv}">
      <span class="chp-mini-svgwrap">${chappySVG(stage.key, chappyEquipped())}</span>
      ${ms.claimable > 0 ? `<span class="chp-mini-badge" aria-hidden="true">${ms.claimable}</span>` : ""}
    </button>`;
}

// お天気カードの天気取得結果から、ミニまるチャピの見た目を切り替える
let lastWeatherKind = null;
export function chappyMiniWeatherHint(w){
  const btn = document.querySelector(".weather-chappy-btn");
  if(!w) return;
  const rainy = (typeof w.precip === "number" && w.precip >= 0.5) || /🌧|☔|⛈/.test(w.icon || "");
  const snowy = /❄|🌨|⛄/.test(w.icon || "");
  const sunny = /☀|🌞/.test(w.icon || "");
  lastWeatherKind = rainy ? "rain" : snowy ? "snow" : null;
  if(!btn) return;
  btn.classList.toggle("chp-mini--rain", rainy);
  btn.classList.toggle("chp-face-happy", !rainy && sunny && !btn.classList.contains("chp-face-sleepy"));
}

// ホーム画面での一時リアクション（タスク完了時のジャンプなど）
export function chappyHomeReact(kind){
  const btn = document.querySelector(".weather-chappy-btn");
  if(!btn) return;
  if(kind === "jump"){
    btn.classList.remove("chp-anim-jump");
    void btn.offsetWidth; // アニメーション再生をリセット
    btn.classList.add("chp-anim-jump");
    setTimeout(() => btn.classList.remove("chp-anim-jump"), 900);
  }
}

/* =========================================================================
   育成画面
   ========================================================================= */
let bubbleTimer = null;
let lastPetTs = 0;
let viewFloor = "f1";
let teardownObserver = null;
let audioTimer = null;

function showBubble(text){
  const b = document.getElementById("chp-bubble");
  if(!b || !text) return;
  b.textContent = text;
  b.hidden = false;
  b.classList.remove("chp-bubble-show");
  void b.offsetWidth;
  b.classList.add("chp-bubble-show");
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { b.classList.remove("chp-bubble-show"); b.hidden = true; }, 3800);
  chappyRecordTalk(text);
}

function playCharAnim(name, ms){
  const char = document.getElementById("chp-char");
  if(!char) return;
  char.classList.remove(name);
  void char.offsetWidth;
  char.classList.add(name);
  setTimeout(() => char.classList.remove(name), ms);
}

function setFaceHappy(ms){
  const char = document.getElementById("chp-char");
  if(!char) return;
  char.classList.add("chp-face-happy");
  setTimeout(() => { const c = document.getElementById("chp-char"); if(c) c.classList.remove("chp-face-happy"); }, ms);
}

// ハート・キラキラのエフェクト（#chp-fxへ短命のspanを追加して消す）
function spawnFx(emoji, count){
  const fx = document.getElementById("chp-fx");
  if(!fx) return;
  for(let i = 0; i < count; i++){
    const s = document.createElement("span");
    s.className = "chp-fx-item";
    s.textContent = emoji;
    s.style.left = `${20 + Math.random() * 60}%`;
    s.style.animationDelay = `${(i * 0.09).toFixed(2)}s`;
    fx.appendChild(s);
    setTimeout(() => { try{ s.remove(); }catch(e){} }, 1700 + i * 90);
  }
}

/* ⑬ ごほうび演出：飛び跳ねる・拍手・ハート・キラキラ・ダンス */
function celebrate(kind){
  const map = {
    levelUp: { anim: "chp-anim-jump", ms: 900, fx: "✨", n: 10, sfx: "levelup" },
    stageUp: { anim: "chp-anim-dance", ms: 1600, fx: "🌟", n: 12, sfx: "levelup" },
    task:    { anim: "chp-anim-clap", ms: 1000, fx: "👏", n: 4, sfx: "reward" },
    study:   { anim: "chp-anim-dance", ms: 1500, fx: "📚", n: 4, sfx: "reward" },
    heart:   { anim: "chp-anim-bounce", ms: 650, fx: "💗", n: 3 },
    sparkle: { anim: "chp-anim-bounce", ms: 650, fx: "✨", n: 6, sfx: "reward" },
    dance:   { anim: "chp-anim-dance", ms: 1500, fx: "🎵", n: 5 },
  };
  const c = map[kind] || map.heart;
  playCharAnim(c.anim, c.ms);
  spawnFx(c.fx, c.n);
  setFaceHappy(c.ms + 700);
  if(c.sfx) chappySfx(c.sfx);
  chappyLifeInterrupt(c.ms + 900);
}

/* ---- ステータス表示だけの部分更新（画面全体は作り直さない） ---- */
function refreshStatsUI(){
  const st = getChappy();
  const stats = chappyStats(st);
  const info = chappyLevelInfo(st.xp);
  const set = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
  CHAPPY_CARE_STATS.forEach(def => {
    set(`chp-val-${def.key}`, stats[def.key]);
    const bar = document.querySelector(`.chp-stat-${def.key} .chp-stat-fill`);
    if(bar) bar.style.width = `${Math.round(stats[def.key] / CHAPPY_STAT_MAX * 100)}%`;
  });
  set("chp-head-lv", `Lv.${info.level}`);
  set("chp-head-coin", st.coins.toLocaleString());
  set("chp-xp-label", `${info.cur} / ${info.need} XP`);
  set("chp-xp-remain", `つぎのレベルまで あと ${info.need - info.cur} XP`);
  const xpBar = document.querySelector(".chp-xp-fill");
  if(xpBar) xpBar.style.width = `${info.pct}%`;
  const char = document.getElementById("chp-char");
  if(char){
    char.classList.toggle("chp-pose-hungry", stats.hunger <= 25);
    char.classList.toggle("chp-face-sleepy", isNight() || stats.sleep <= 30);
  }
  const ms = chappyMissionSummary();
  const badge = document.getElementById("chp-mission-badge");
  if(badge){
    badge.textContent = ms.claimable > 0 ? String(ms.claimable) : "";
    badge.hidden = ms.claimable === 0;
  }
}

/* ---- なでる ---- */
function doPet(){
  const now = Date.now();
  if(now - lastPetTs < 400) return;   // 連打による演出の暴走を抑える
  lastPetTs = now;
  playTapSound();
  const r = chappyPet();
  celebrate("heart");
  showBubble(r.capped ? pickLine("rest") : pickLine("petted"));
  refreshStatsUI();
}

/* ---- XP付与イベントの購読（モジュール読み込み時に一度だけ登録）---- */
window.addEventListener("chappy-award", (e) => {
  const d = e.detail || {};
  if(document.getElementById("chp-room")){
    refreshStatsUI();
    if(d.stageUp){
      celebrate("stageUp");
      showBubble(pickLine("stageUp"));
      setTimeout(() => { if(document.getElementById("chp-room")) renderChappyScreen(); }, 1600);
    } else if(d.levelUp){
      celebrate("levelUp");
      showBubble(pickLine("levelUp"));
    } else if(d.reason === "taskDone"){
      celebrate("task");
      showBubble(pickLine("taskDone"));
    } else if(d.reason === "studySession" || d.type === "study"){
      celebrate("study");
      showBubble(pickLine("studyDone"));
    } else {
      const info = chappyLevelInfo(getChappy().xp);
      if(info.need - info.cur <= 5) showBubble(pickLine("nearLevel"));
    }
  } else if(d.reason === "taskDone"){
    chappyHomeReact("jump");
  }
});

// バッジ獲得のお知らせ
window.addEventListener("chappy-badge", (e) => {
  if(!document.getElementById("chp-room")) return;
  const b = (e.detail && e.detail.badges && e.detail.badges[0]) || null;
  if(!b) return;
  setTimeout(() => { celebrate("sparkle"); showBubble(`バッジ「${b.name}」をもらったよ！`); }, 900);
});

/* =========================================================================
   モーダル：ごはん・お世話・設定
   ========================================================================= */
function closeChappyModal(ov){ try{ ov.remove(); }catch(e){} }

function openFoodModal(){
  const st = getChappy();
  const ov = document.createElement("div");
  ov.className = "modal-ov";
  const rows = CHAPPY_FOODS.map(f => `
    <button type="button" class="chp-food-row" data-food="${f.key}" ${st.coins < f.cost ? "disabled" : ""}>
      <span class="chp-food-icon">${f.icon}</span>
      <span class="chp-food-info">
        <span class="chp-food-name">${esc(f.name)}</span>
        <span class="chp-food-desc">${esc(f.desc)}</span>
      </span>
      <span class="chp-food-cost">🪙 ${f.cost}</span>
    </button>`).join("");
  ov.innerHTML = `
    <div class="modal chp-modal">
      <div class="chp-modal-title">🍚 ごはんをあげる</div>
      <div class="chp-modal-coins">もっているコイン：🪙 <b id="chp-food-coins">${st.coins.toLocaleString()}</b></div>
      <div class="chp-food-list">${rows}</div>
      <div class="chp-modal-note" id="chp-food-note"></div>
      <button type="button" class="chp-modal-close" id="chp-food-close">閉じる</button>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener("touchmove", (e) => {
    const list = ov.querySelector(".chp-food-list");
    if(!list || !list.contains(e.target) || list.scrollHeight <= list.clientHeight) e.preventDefault();
  }, { passive: false });
  ov.querySelector("#chp-food-close").onclick = () => { playTapSound(); closeChappyModal(ov); };
  ov.addEventListener("click", (e) => { if(e.target === ov) closeChappyModal(ov); });
  ov.querySelectorAll("[data-food]").forEach(b => b.onclick = () => {
    const r = chappyFeed(b.dataset.food);
    const note = ov.querySelector("#chp-food-note");
    if(!r.ok){ if(note) note.textContent = r.msg; return; }
    playTapSound();
    const stNow = getChappy();
    const coinsEl = ov.querySelector("#chp-food-coins");
    if(coinsEl) coinsEl.textContent = stNow.coins.toLocaleString();
    ov.querySelectorAll("[data-food]").forEach(btn => {
      const food = CHAPPY_FOODS.find(f => f.key === btn.dataset.food);
      btn.disabled = !food || stNow.coins < food.cost;
    });
    if(note) note.textContent = `${r.food.name}をあげました！`;
    playCharAnim("chp-anim-eat", 900);
    setFaceHappy(2200);
    spawnFx("💗", 2);
    showBubble(pickLine("eat"));
    chappyLifeInterrupt(2500);
    refreshStatsUI();
  });
}

function openCareModal(){
  const ov = document.createElement("div");
  ov.className = "modal-ov";
  ov.innerHTML = `
    <div class="modal chp-modal">
      <div class="chp-modal-title">🫧 お世話をする</div>
      <div class="chp-modal-coins">お世話は無料。1日12回まで、ちいさなごほうびコインがもらえます。</div>
      <div class="chp-food-list">
        ${CHAPPY_CARES.map(c => `
          <button type="button" class="chp-food-row" data-care="${c.key}">
            <span class="chp-food-icon">${c.icon}</span>
            <span class="chp-food-info">
              <span class="chp-food-name">${esc(c.name)}</span>
              <span class="chp-food-desc">${esc(c.desc)}</span>
            </span>
          </button>`).join("")}
      </div>
      <div class="chp-modal-note" id="chp-care-note"></div>
      <button type="button" class="chp-modal-close" id="chp-care-close">閉じる</button>
    </div>`;
  document.body.appendChild(ov);
  ov.querySelector("#chp-care-close").onclick = () => { playTapSound(); closeChappyModal(ov); };
  ov.addEventListener("click", (e) => { if(e.target === ov) closeChappyModal(ov); });
  ov.querySelectorAll("[data-care]").forEach(b => b.onclick = () => {
    playTapSound();
    const r = chappyCare(b.dataset.care);
    if(!r.ok) return;
    const note = ov.querySelector("#chp-care-note");
    if(note) note.textContent = `${r.care.name}をしました！${r.coins ? `（🪙+${r.coins}）` : ""}`;
    playCharAnim(r.care.anim, 1000);
    setFaceHappy(1900);
    spawnFx("✨", 3);
    showBubble(pickLine(r.care.line));
    chappyLifeInterrupt(2200);
    refreshStatsUI();
  });
}

function openChappySettingsModal(){
  const st = getChappy();
  const ov = document.createElement("div");
  ov.className = "modal-ov";
  ov.innerHTML = `
    <div class="modal chp-modal">
      <div class="chp-modal-title">⚙️ チャッピーハウス設定</div>
      <label class="chp-toggle-row">
        <span>ホーム画面にまるチャピを表示</span>
        <input type="checkbox" id="chp-home-toggle" ${st.homeWidget ? "checked" : ""}>
        <span class="chp-toggle-ui" aria-hidden="true"></span>
      </label>
      <label class="chp-toggle-row">
        <span>BGM・環境音を鳴らす</span>
        <input type="checkbox" id="chp-bgm-toggle" ${st.bgm ? "checked" : ""}>
        <span class="chp-toggle-ui" aria-hidden="true"></span>
      </label>
      <div class="chp-modal-note">
        BGMは時間帯・天気・季節イベントで変わります。この画面を離れると自動で止まります。<br>
        ホーム表示をOFFにしても、育成データはそのまま残ります。
      </div>
      <button type="button" class="chp-modal-close" id="chp-settings-close">閉じる</button>
    </div>`;
  document.body.appendChild(ov);
  ov.querySelector("#chp-home-toggle").onchange = (e) => setChappyHomeWidgetVisible(e.target.checked);
  ov.querySelector("#chp-bgm-toggle").onchange = (e) => {
    setChappyBgm(e.target.checked);
    if(e.target.checked) startAudio(); else chappyAudioStop();
  };
  ov.querySelector("#chp-settings-close").onclick = () => { playTapSound(); closeChappyModal(ov); };
  ov.addEventListener("click", (e) => { if(e.target === ov) closeChappyModal(ov); });
}

/* =========================================================================
   BGM（⑭）：時間帯・天気・イベントに合わせて切り替える
   ========================================================================= */
function audioProfile(){
  return chappyAudioProfileFor({
    slot: chappyTimeSlot(),
    weather: lastWeatherKind,
    event: chappyCurrentEvent(),
  });
}

function startAudio(){
  if(!isChappyBgmOn()) return;
  chappyAudioStart(audioProfile());
  clearInterval(audioTimer);
  // 時間帯がまたいだときだけ静かに切り替える
  audioTimer = setInterval(() => {
    if(!chappyAudioIsPlaying()) return;
    chappyAudioSwitch(audioProfile());
  }, 60000);
}

function stopAudio(){
  clearInterval(audioTimer); audioTimer = null;
  chappyAudioStop();
}

/* =========================================================================
   画面を離れたときの後片付け（生活エンジン・BGM・タイマー）
   ========================================================================= */
function watchTeardown(){
  if(teardownObserver) teardownObserver.disconnect();
  teardownObserver = new MutationObserver(() => {
    if(document.getElementById("chp-room")) return;
    stopChappyLife();
    stopAudio();
    clearTimeout(bubbleTimer);
    teardownObserver.disconnect();
    teardownObserver = null;
  });
  teardownObserver.observe(app, { childList: true, subtree: false });
}

/* =========================================================================
   操作ボタン
   ========================================================================= */
const CHAPPY_ACTIONS = [
  { key: "food",    label: "ごはん",   icon: "🍚" },
  { key: "pet",     label: "なでる",   icon: "🤗" },
  { key: "care",    label: "お世話",   icon: "🫧" },
  { key: "dressup", label: "着せ替え", icon: "👕" },
  { key: "room",    label: "模様がえ", icon: "🛋️" },
  { key: "shop",    label: "ショップ", icon: "🛍️" },
  { key: "gacha",   label: "ガチャ",   icon: "🎁" },
  { key: "mission", label: "ミッション", icon: "🎯", badge: true },
  { key: "book",    label: "図鑑",     icon: "📖" },
];

/* =========================================================================
   画面本体
   ========================================================================= */
export function renderChappyScreen(){
  const st = getChappy();
  const stage = chappyStageForXp(st.xp);
  const nextStage = chappyNextStage(st.xp);
  const info = chappyLevelInfo(st.xp);
  const stats = chappyStats(st);
  const eq = chappyEquipped();
  const ev = chappyCurrentEvent();
  const ms = chappyMissionSummary();
  const roomInfo = chappyRoomInfo();
  if(!chappyFloorUnlocked(viewFloor)) viewFloor = "f1";
  const floors = CHAPPY_FLOORS.filter(f => chappyFloorUnlocked(f.key));
  const charCls = ["chp-char", ...moodClasses(stats)];

  app.innerHTML = `
    <div class="chp-screen">
      <div class="q-head"><button class="quit" data-go="select">← ホーム</button><span class="q-count">🏠 チャッピーハウス</span></div>

      <div class="chp-head">
        <div class="chp-head-name">
          ${CHAPPY_NAME}
          <span class="chp-stage-badge">${esc(stage.name)}</span>
        </div>
        <div class="chp-head-right">
          <span class="chp-head-pill" id="chp-head-lv">Lv.${info.level}</span>
          <span class="chp-head-pill chp-head-pill-coin">🪙 <b id="chp-head-coin">${st.coins.toLocaleString()}</b></span>
          <button type="button" class="chp-gear" id="chp-settings" aria-label="チャッピーハウス設定">⚙️</button>
        </div>
      </div>

      ${ev ? `<div class="chp-event-banner">${ev.icon} <b>${esc(ev.name)}</b> かいさい中！ ${esc(ev.line)}</div>` : ""}

      ${floors.length > 1 ? `
        <div class="chp-floor-tabs chp-floor-tabs--view">
          ${floors.map(f => `<button type="button" class="chp-floor-tab${f.key === viewFloor ? " chp-floor-tab--on" : ""}"
            data-chp-viewfloor="${f.key}"><span>${f.icon}</span>${esc(f.label)}</button>`).join("")}
        </div>` : ""}

      <div class="${chappyRoomClass(viewFloor)}" style="${chappyRoomStyleAttr(viewFloor)}" id="chp-room">
        ${chappyRoomLayersHTML(viewFloor)}
        <div class="chp-bubble" id="chp-bubble" hidden></div>
        <button type="button" class="${charCls.join(" ")}" id="chp-char" aria-label="${CHAPPY_NAME}をなでる">
          ${chappySVG(stage.key, eq)}
          <span class="chp-act-badge" aria-hidden="true"></span>
        </button>
        <div class="chp-fx" id="chp-fx" aria-hidden="true"></div>
        <div class="chp-room-meta">
          <span>🏡 おうち Lv.${roomInfo.level}</span>
          <span>🪑 ${roomInfo.score.count}こ</span>
          <span>✨ おしゃれ ${chappyStyleScore(st)}</span>
        </div>
      </div>

      <div class="chp-card chp-stats">
        ${CHAPPY_CARE_STATS.map(def => statRowHTML(def, stats[def.key])).join("")}
        <div class="chp-xp-row">
          <div class="chp-xp-head">
            <span class="chp-stat-lab">🌟 経験値</span>
            <span class="chp-xp-num" id="chp-xp-label">${info.cur} / ${info.need} XP</span>
          </div>
          <div class="chp-stat-track chp-xp-track"><div class="chp-stat-fill chp-xp-fill" style="width:${info.pct}%"></div></div>
          <div class="chp-xp-remain" id="chp-xp-remain">つぎのレベルまで あと ${info.need - info.cur} XP</div>
          ${nextStage
            ? `<div class="chp-xp-stage">つぎの成長「${esc(nextStage.name)}」まで あと ${Math.max(0, nextStage.minXp - st.xp).toLocaleString()} XP</div>`
            : `<div class="chp-xp-stage">きわめし者になりました！</div>`}
        </div>
      </div>

      <button type="button" class="chp-card chp-mission-strip" id="chp-mission-strip">
        <span class="chp-mission-strip-ico">🎯</span>
        <span class="chp-mission-strip-main">
          <span class="chp-mission-strip-title">今日のミッション ${ms.done} / ${ms.total} 達成</span>
          <span class="chp-mission-strip-sub">${ms.claimable > 0 ? `${ms.claimable}件のごほうびが受け取れます！` : "学習・タスク・ニュースで進みます"}</span>
        </span>
        <span class="chp-mission-strip-go">›</span>
      </button>

      <div class="chp-card chp-actions">
        ${CHAPPY_ACTIONS.map(a => `
          <button type="button" class="chp-action" data-chp-action="${a.key}">
            <span class="chp-action-icon">${a.icon}</span>
            <span class="chp-action-label">${esc(a.label)}</span>
            ${a.badge ? `<span class="chp-action-badge" id="chp-mission-badge"${ms.claimable > 0 ? "" : " hidden"}>${ms.claimable || ""}</span>` : ""}
          </button>`).join("")}
      </div>

      <div class="chp-meta">
        いっしょに ${st.totalDays}日目 ・ ${st.streak}日連続であそんでいます
      </div>
    </div>`;

  bindScreen();

  // あいさつの吹き出し（時間帯・季節・お世話状況で出し分け）
  setTimeout(() => showBubble(greetLine(stats)), 500);

  // チャッピーが自分で生活しはじめる
  startChappyLife({
    roomId: "chp-room",
    charId: "chp-char",
    floorKey: () => viewFloor,
    placed: () => chappyPlacedOn(viewFloor),
    slotPos: (slotId) => chappySlotPos(viewFloor, slotId),
    onBubble: (text) => showBubble(text),
    onActivity: (act) => {
      const badge = document.querySelector(".chp-act-badge");
      if(badge) badge.textContent = act.icon || "";
    },
    onSecret: (secret) => handleSecret(secret),
  });

  watchTeardown();
  if(isChappyBgmOn()) startAudio();
  window.scrollTo(0, 0);
}

function greetLine(stats){
  if(stats.hunger <= 25) return pickLine("hungry");
  const ev = chappyCurrentEvent();
  if(ev && Math.random() < 0.5) return ev.line;
  const st = getChappy();
  if(st.streak >= 3 && Math.random() < 0.3) return pickLine("streak");
  const slot = chappyTimeSlot();
  if(slot === "night") return pickLine("night");
  if(slot === "morning") return pickLine("morning");
  return Math.random() < 0.5 ? pickLine("greet") : chappyPickLine(null);
}

function statRowHTML(def, value){
  const pct = Math.round(value / CHAPPY_STAT_MAX * 100);
  return `
    <div class="chp-stat-row chp-stat-${def.key}">
      <span class="chp-stat-lab">${def.icon} ${esc(def.label)}</span>
      <div class="chp-stat-track"><div class="chp-stat-fill chp-fill-${def.color}" style="width:${pct}%"></div></div>
      <span class="chp-stat-val" id="chp-val-${def.key}">${value}</span>
    </div>`;
}

/* ---- 隠しイベントをタップしたとき ---- */
function handleSecret(secret){
  const r = chappyClaimSecret(secret.id);
  if(!r.ok) return;
  chappySfx("rare");
  celebrate("sparkle");
  spawnFx(secret.icon, 6);
  const parts = [];
  if(r.gained.coins) parts.push(`🪙+${r.gained.coins}`);
  if(r.gained.xp) parts.push(`🌟+${r.gained.xp}`);
  Object.keys(r.gained.tickets).forEach(k => parts.push(`🎫+${r.gained.tickets[k]}`));
  showBubble(`${secret.icon} ${secret.msg}${parts.length ? `（${parts.join(" ")}）` : ""}`);
  refreshStatsUI();
}

/* ---- 画面内のイベント配線 ---- */
function bindScreen(){
  app.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
  const gear = document.getElementById("chp-settings");
  if(gear) gear.onclick = () => { playTapSound(); openChappySettingsModal(); };

  app.querySelectorAll("[data-chp-viewfloor]").forEach(b => b.onclick = () => {
    playTapSound();
    viewFloor = b.dataset.chpViewfloor;
    renderChappyScreen();
  });

  const strip = document.getElementById("chp-mission-strip");
  if(strip) strip.onclick = () => { playTapSound(); openChappyMissions(() => refreshAfterModal()); };

  // キャラ本体：タップ＝なでる。スワイプでもなでられる
  const char = document.getElementById("chp-char");
  if(char){
    char.onclick = doPet;
    let strokeArmed = false;
    char.addEventListener("pointerdown", () => { strokeArmed = true; });
    char.addEventListener("pointermove", (e) => {
      if(!strokeArmed || e.pressure === 0) return;
      doPet(); // 内部で400msのスロットルがかかる
    });
    const disarm = () => { strokeArmed = false; };
    char.addEventListener("pointerup", disarm);
    char.addEventListener("pointercancel", disarm);
    char.addEventListener("pointerleave", disarm);
  }

  app.querySelectorAll("[data-chp-action]").forEach(b => b.onclick = () => {
    const key = b.dataset.chpAction;
    if(key === "pet"){ doPet(); return; }
    playTapSound();
    if(key === "food") return openFoodModal();
    if(key === "care") return openCareModal();
    if(key === "dressup") return openChappyCloset(() => renderChappyScreen());
    if(key === "room") return openChappyRoomEditor(() => renderChappyScreen());
    if(key === "shop") return openChappyShop(() => refreshAfterModal());
    if(key === "gacha") return openChappyGacha(() => refreshAfterModal());
    if(key === "mission") return openChappyMissions(() => refreshAfterModal());
    if(key === "book") return openChappyBook(() => refreshAfterModal());
  });
}

// モーダルを閉じたあと：コイン等の表示だけ更新する（部屋の作り直しは不要）
function refreshAfterModal(){
  if(!document.getElementById("chp-room")) return;
  refreshStatsUI();
  const strip = document.getElementById("chp-mission-strip");
  if(strip){
    const ms = chappyMissionSummary();
    const title = strip.querySelector(".chp-mission-strip-title");
    const sub = strip.querySelector(".chp-mission-strip-sub");
    if(title) title.textContent = `今日のミッション ${ms.done} / ${ms.total} 達成`;
    if(sub) sub.textContent = ms.claimable > 0 ? `${ms.claimable}件のごほうびが受け取れます！` : "学習・タスク・ニュースで進みます";
  }
}
