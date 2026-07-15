/* =========================================================================
   🏠 チャッピーハウス：育成画面＋ホーム画面ミニウィジェット（見た目担当）

   ・キャラクター「まるチャピ」は完全オリジナルの手続き生成SVG
     （白くて丸い小動物・水色の垂れ耳・ピンクのほっぺ・つぶらな目・
     首元に星の飾り）。外部画像は使わない。
   ・状態の計算・永続化・XP/コイン付与はすべてjs/chappy.jsが担当し、
     ここではHTML組み立て・アニメーション・操作イベントのみを扱う
     （旧デジタル盆栽のpet.js⇄render.jsと同じ役割分担）。
   ・go("chappy")で遷移してくる独立した1画面（introquiz等と同じ作法）。
   ========================================================================= */
import { app, go } from './render.js';
import { playTapSound } from './audio.js';
import {
  getChappy, chappyLevelInfo, chappyStageForXp, chappyNextStage,
  chappyPet, chappyFeed, isChappyHomeWidgetVisible, setChappyHomeWidgetVisible,
} from './chappy.js';
import { CHAPPY_FOODS, CHAPPY_LINES, CHAPPY_STAT_MAX } from './data/chappy-config.js';

export const CHAPPY_NAME = "まるチャピ";

/* =========================================================================
   キャラクターSVG（成長段階ごとに少しずつ変化。すべてパステルカラー）
   表情・ポーズはSVG内に全パターンを持ち、外側のラッパーclassで切り替える：
     .chp-face-happy  … にっこり目（なでた時・ごはん時）
     .chp-face-sleepy … ねむそうな目＋Zzz（夜・放置時）
     .chp-pose-hungry … お腹を押さえる手（空腹時）
   ========================================================================= */
function starPath(cx, cy, r){
  let d = "";
  for(let i = 0; i < 10; i++){
    const ang = -Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    d += `${i === 0 ? "M" : "L"}${(cx + Math.cos(ang) * rr).toFixed(1)},${(cy + Math.sin(ang) * rr).toFixed(1)}`;
  }
  return d + "Z";
}

function chappyEggSVG(){
  return `
    <svg viewBox="0 0 200 200" class="chp-svg" aria-hidden="true">
      <ellipse class="chp-shadow" cx="100" cy="172" rx="46" ry="9"/>
      <g class="chp-body-g">
        <path d="M100 38 C136 38 152 82 152 118 C152 152 129 170 100 170 C71 170 48 152 48 118 C48 82 64 38 100 38Z"
              fill="#fffaf0" stroke="#f3e4c8" stroke-width="3"/>
        <circle cx="76" cy="88" r="5.5" fill="#cbe9fb"/>
        <circle cx="128" cy="128" r="4.5" fill="#fbd9e3"/>
        <circle cx="66" cy="128" r="4" fill="#fdeec9"/>
        <path d="${starPath(112, 78, 9)}" fill="#f7d774"/>
        <path class="chp-egg-eye" d="M84 122 q5 5 10 0" stroke="#5a5a5a" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path class="chp-egg-eye" d="M106 122 q5 5 10 0" stroke="#5a5a5a" stroke-width="3" fill="none" stroke-linecap="round"/>
      </g>
    </svg>`;
}

// scale：ベビー0.82／キッズ1／成長体1.1。grownは首元リボン＋星が少し豪華になる
function chappyBodySVG(stageKey){
  const scale = stageKey === "baby" ? 0.82 : stageKey === "grown" ? 1.1 : 1;
  const grown = stageKey === "grown";
  const baby = stageKey === "baby";
  const tx = 100 - 100 * scale;
  const ty = 172 - 172 * scale;
  return `
    <svg viewBox="0 0 200 200" class="chp-svg" aria-hidden="true">
      <ellipse class="chp-shadow" cx="100" cy="176" rx="${48 * scale}" ry="8"/>
      <g class="chp-body-g" transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${scale})">
        <!-- しっぽ（小さく丸い） -->
        <circle cx="154" cy="138" r="11" fill="#ffffff" stroke="#e5edf5" stroke-width="3"/>
        <!-- 垂れ耳（水色） -->
        <g class="chp-ears">
          <path d="M64 62 C46 58 36 78 44 96 C50 108 62 108 68 96 C72 86 70 72 64 62Z"
                fill="#aadcf5" stroke="#8ecbec" stroke-width="2.5"/>
          <path d="M136 62 C154 58 164 78 156 96 C150 108 138 108 132 96 C128 86 130 72 136 62Z"
                fill="#aadcf5" stroke="#8ecbec" stroke-width="2.5"/>
          <path d="M60 70 C52 72 48 84 52 92 C55 98 61 97 64 90 C66 83 64 75 60 70Z" fill="#cceefb"/>
          <path d="M140 70 C148 72 152 84 148 92 C145 98 139 97 136 90 C134 83 136 75 140 70Z" fill="#cceefb"/>
        </g>
        <!-- 本体（白くて丸い・もちもち） -->
        <path d="M100 52 C142 52 160 86 160 118 C160 152 134 172 100 172 C66 172 40 152 40 118 C40 86 58 52 100 52Z"
              fill="#ffffff" stroke="#e5edf5" stroke-width="3.5"/>
        <!-- 足（短い） -->
        <ellipse cx="76" cy="169" rx="14" ry="8" fill="#ffffff" stroke="#e5edf5" stroke-width="3"/>
        <ellipse cx="124" cy="169" rx="14" ry="8" fill="#ffffff" stroke="#e5edf5" stroke-width="3"/>
        <!-- 手（通常：体の横） -->
        <g class="chp-arms-normal">
          <ellipse cx="47" cy="132" rx="9" ry="12" fill="#ffffff" stroke="#e5edf5" stroke-width="3"/>
          <ellipse cx="153" cy="132" rx="9" ry="12" fill="#ffffff" stroke="#e5edf5" stroke-width="3"/>
        </g>
        <!-- 手（空腹：お腹を押さえる） -->
        <g class="chp-arms-hungry">
          <ellipse cx="82" cy="146" rx="10" ry="9" fill="#ffffff" stroke="#e5edf5" stroke-width="3"/>
          <ellipse cx="118" cy="146" rx="10" ry="9" fill="#ffffff" stroke="#e5edf5" stroke-width="3"/>
        </g>
        <!-- ほっぺ（薄ピンク） -->
        <ellipse cx="${baby ? 68 : 66}" cy="118" rx="${baby ? 12 : 10}" ry="${baby ? 8 : 7}" fill="#fbd0da"/>
        <ellipse cx="${baby ? 132 : 134}" cy="118" rx="${baby ? 12 : 10}" ry="${baby ? 8 : 7}" fill="#fbd0da"/>
        <!-- 目（つぶらな黒目）：通常／にっこり／ねむい を切り替え -->
        <g class="chp-eyes-normal">
          <circle cx="82" cy="104" r="6" fill="#3d3d3d"/><circle cx="84" cy="102" r="2" fill="#ffffff"/>
          <circle cx="118" cy="104" r="6" fill="#3d3d3d"/><circle cx="120" cy="102" r="2" fill="#ffffff"/>
        </g>
        <g class="chp-eyes-happy">
          <path d="M75 105 q7 -8 14 0" stroke="#3d3d3d" stroke-width="3.5" fill="none" stroke-linecap="round"/>
          <path d="M111 105 q7 -8 14 0" stroke="#3d3d3d" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        </g>
        <g class="chp-eyes-sleepy">
          <path d="M75 104 q7 4 14 0" stroke="#3d3d3d" stroke-width="3.5" fill="none" stroke-linecap="round"/>
          <path d="M111 104 q7 4 14 0" stroke="#3d3d3d" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        </g>
        <!-- 口（小さな「ω」） -->
        <path class="chp-mouth" d="M94 116 q3 4 6 0 q3 4 6 0" stroke="#c98a96" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <!-- 首元の飾り：星（成長体はリボン付きで少し豪華に） -->
        ${grown ? `<path d="M86 156 q14 8 28 0 l-4 10 q-10 5 -20 0Z" fill="#fbd0da" stroke="#f3b7c6" stroke-width="2"/>` : ""}
        <path d="${starPath(100, grown ? 158 : 156, grown ? 9 : 7)}" fill="#f7d774" stroke="#eec659" stroke-width="1.5"/>
        <!-- Zzz（ねむい時のみ表示） -->
        <g class="chp-zzz" fill="#9db8d6" font-size="16" font-weight="700" font-family="sans-serif">
          <text x="146" y="66">z</text><text x="156" y="52" font-size="20">Z</text>
        </g>
        <!-- ☔（ホームの雨の日のみ表示：小さな傘） -->
        <g class="chp-umbrella">
          <path d="M158 40 q-26 -18 -52 0 q6 -22 26 -22 q20 0 26 22Z" fill="#aadcf5" stroke="#8ecbec" stroke-width="2"/>
          <path d="M132 40 v56 q0 8 8 8" stroke="#9db8d6" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        </g>
      </g>
    </svg>`;
}

export function chappySVG(stageKey){
  return stageKey === "egg" ? chappyEggSVG() : chappyBodySVG(stageKey);
}

/* =========================================================================
   共通ヘルパー
   ========================================================================= */
function pickLine(kind){
  const list = CHAPPY_LINES[kind] || [];
  return list[Math.floor(Math.random() * list.length)] || "";
}

function hourNow(){ return new Date().getHours(); }
function isNight(){ const h = hourNow(); return h >= 21 || h < 5; }
function isMorning(){ const h = hourNow(); return h >= 5 && h < 9; }

// 表情・ポーズの基本クラス（優先度：空腹 > 夜のねむけ > 通常）
function moodClasses(st){
  const cls = [];
  if(st.hunger <= 25) cls.push("chp-pose-hungry");
  if(isNight()) cls.push("chp-face-sleepy");
  return cls;
}

/* =========================================================================
   ホーム画面ミニウィジェット（お天気カード右側・旧デジタル盆栽の位置）
   タップで育成画面へ遷移する（data-goはrenderSelect()側で配線される）。
   ========================================================================= */
export function chappyMiniWidgetHTML(){
  const st = getChappy();
  const stage = chappyStageForXp(st.xp);
  const lv = chappyLevelInfo(st.xp).level;
  const cls = ["weather-chappy-btn", "chp-mini"];
  if(isNight()) cls.push("chp-face-sleepy");
  else if(isMorning()) cls.push("chp-mini--morning");
  if(st.hunger <= 25) cls.push("chp-pose-hungry");
  return `
    <button type="button" class="${cls.join(" ")}" data-go="chappy"
      aria-label="チャッピーハウス：${CHAPPY_NAME} Lv.${lv}" title="チャッピーハウス：${CHAPPY_NAME} Lv.${lv}">
      <span class="chp-mini-svgwrap">${chappySVG(stage.key)}</span>
    </button>`;
}

// お天気カードの天気取得結果から、ミニまるチャピの「雨の日は傘」「晴れの日は
// うれしそう」の見た目を切り替える（render.jsのrefreshWeatherCardから呼ばれる）
export function chappyMiniWeatherHint(w){
  const btn = document.querySelector(".weather-chappy-btn");
  if(!btn || !w) return;
  const rainy = (typeof w.precip === "number" && w.precip >= 0.5) || /🌧|☔|⛈/.test(w.icon || "");
  const sunny = /☀|🌞/.test(w.icon || "");
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
let idleTimer = null;
let lastPetTs = 0;

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
  setTimeout(() => { if(document.getElementById("chp-char")) char.classList.remove("chp-face-happy"); }, ms);
}

// ハート・キラキラのエフェクト（#chp-fxへ短命のspanを追加して消す）
function spawnFx(emoji, count){
  const fx = document.getElementById("chp-fx");
  if(!fx) return;
  for(let i = 0; i < count; i++){
    const s = document.createElement("span");
    s.className = "chp-fx-item";
    s.textContent = emoji;
    s.style.left = `${30 + Math.random() * 40}%`;
    s.style.animationDelay = `${(i * 0.09).toFixed(2)}s`;
    fx.appendChild(s);
    setTimeout(() => { try{ s.remove(); }catch(e){} }, 1600 + i * 90);
  }
}

function statRowHTML(key, label, icon, value){
  const pct = Math.round(value / CHAPPY_STAT_MAX * 100);
  return `
    <div class="chp-stat-row">
      <span class="chp-stat-lab">${icon} ${label}</span>
      <div class="chp-stat-track"><div class="chp-stat-fill chp-stat-${key}" style="width:${pct}%"></div></div>
      <span class="chp-stat-val" id="chp-val-${key}">${value}</span>
    </div>`;
}

// なでる・ごはん後にステータス表示だけを部分更新する（画面全体は作り直さない）
function refreshStatsUI(){
  const st = getChappy();
  const info = chappyLevelInfo(st.xp);
  const set = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
  set("chp-val-genki", st.genki);
  set("chp-val-hunger", st.hunger);
  set("chp-val-bond", st.bond);
  set("chp-head-lv", `Lv.${info.level}`);
  set("chp-head-coin", st.coins.toLocaleString());
  set("chp-xp-label", `${info.cur} / ${info.need} XP`);
  set("chp-xp-remain", `つぎのレベルまで あと ${info.need - info.cur} XP`);
  const bars = { genki: st.genki, hunger: st.hunger, bond: st.bond };
  Object.keys(bars).forEach(k => {
    const el = document.querySelector(`.chp-stat-${k}`);
    if(el) el.style.width = `${Math.round(bars[k] / CHAPPY_STAT_MAX * 100)}%`;
  });
  const xpBar = document.querySelector(".chp-xp-fill");
  if(xpBar) xpBar.style.width = `${info.pct}%`;
  // 空腹ポーズの反映
  const char = document.getElementById("chp-char");
  if(char) char.classList.toggle("chp-pose-hungry", st.hunger <= 25);
}

// なでる（キャラ本体タップ・スワイプ・なでるボタン共通）。連打しても
// なかよし度の加算はjs/chappy.js側の1日上限で制限される
function doPet(){
  const now = Date.now();
  if(now - lastPetTs < 400) return;   // 連打による演出の暴走も抑える
  lastPetTs = now;
  markInteraction();
  playTapSound();
  const r = chappyPet();
  playCharAnim("chp-anim-bounce", 650);
  setFaceHappy(1800);
  spawnFx("💗", r.gained > 0 ? 3 : 1);
  showBubble(r.capped ? pickLine("rest") : pickLine("petted"));
  refreshStatsUI();
}

/* ---- 放置検知：一定時間操作がないと座って居眠りする ---- */
let lastInteractionTs = Date.now();
function markInteraction(){
  lastInteractionTs = Date.now();
  const char = document.getElementById("chp-char");
  if(char) char.classList.remove("chp-idle-sit", "chp-face-sleepy-idle");
}
function startIdleWatch(){
  clearInterval(idleTimer);
  idleTimer = setInterval(() => {
    const char = document.getElementById("chp-char");
    if(!char){ clearInterval(idleTimer); idleTimer = null; return; }
    const idleSec = (Date.now() - lastInteractionTs) / 1000;
    if(idleSec > 45 && !char.classList.contains("chp-idle-sit")){
      char.classList.add("chp-idle-sit");
      showBubble(pickLine("idle"));
    }
    if(idleSec > 90) char.classList.add("chp-face-sleepy-idle");
  }, 5000);
}

/* ---- XP付与イベントの購読（モジュール読み込み時に一度だけ登録）----
   育成画面が開いていれば表示更新＋レベルアップ演出、ホーム画面に
   ミニまるチャピがいればタスク完了ジャンプなどのリアクションをする */
window.addEventListener("chappy-award", (e) => {
  const d = e.detail || {};
  if(document.getElementById("chp-room")){
    refreshStatsUI();
    if(d.levelUp || d.stageUp){
      spawnFx("✨", 8);
      playCharAnim("chp-anim-jump", 900);
      showBubble(pickLine("levelUp"));
      if(d.stageUp){
        // 成長段階が変わったら見た目を差し替える（少し間を置いてキラキラの後に）
        setTimeout(() => { if(document.getElementById("chp-room")) renderChappyScreen(); }, 1200);
      }
    } else if(d.reason === "taskDone"){
      playCharAnim("chp-anim-jump", 900);
      showBubble(pickLine("taskDone"));
    } else {
      // レベルアップ目前ならそれを教えてあげる
      const info = chappyLevelInfo(getChappy().xp);
      if(info.need - info.cur <= 5) showBubble(pickLine("nearLevel"));
    }
  } else if(d.reason === "taskDone"){
    chappyHomeReact("jump");
  }
});

/* ---- ごはんモーダル ---- */
function closeChappyModal(ov){ try{ ov.remove(); }catch(e){} }

function openFoodModal(){
  const st = getChappy();
  const ov = document.createElement("div");
  ov.className = "modal-ov";
  const rows = CHAPPY_FOODS.map(f => `
    <button type="button" class="chp-food-row" data-food="${f.key}" ${st.coins < f.cost ? "disabled" : ""}>
      <span class="chp-food-icon">${f.icon}</span>
      <span class="chp-food-info">
        <span class="chp-food-name">${f.name}</span>
        <span class="chp-food-desc">${f.desc}</span>
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
  // モーダル内をスワイプしても背面のページがスクロールしないようにする
  ov.addEventListener("touchmove", (e) => {
    const list = ov.querySelector(".chp-food-list");
    if(!list || !list.contains(e.target) || list.scrollHeight <= list.clientHeight) e.preventDefault();
  }, { passive: false });
  ov.querySelector("#chp-food-close").onclick = () => { playTapSound(); closeChappyModal(ov); };
  ov.addEventListener("click", (e) => { if(e.target === ov) closeChappyModal(ov); });
  ov.querySelectorAll("[data-food]").forEach(b => b.onclick = () => {
    markInteraction();
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
    refreshStatsUI();
  });
}

/* ---- 設定モーダル（ホーム画面へのミニ表示ON/OFF） ---- */
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
      <div class="chp-modal-note">OFFにすると、ホーム画面のお天気カードにまるチャピが表示されなくなります。育成データはそのまま残ります。</div>
      <button type="button" class="chp-modal-close" id="chp-settings-close">閉じる</button>
    </div>`;
  document.body.appendChild(ov);
  ov.querySelector("#chp-home-toggle").onchange = (e) => {
    setChappyHomeWidgetVisible(e.target.checked);
  };
  ov.querySelector("#chp-settings-close").onclick = () => { playTapSound(); closeChappyModal(ov); };
  ov.addEventListener("click", (e) => { if(e.target === ov) closeChappyModal(ov); });
}

/* ---- 操作ボタン（未実装のものは「準備中」バッジ付きで明示する） ---- */
const CHAPPY_ACTIONS = [
  { key: "food",    label: "ごはん",   icon: "🍚", ready: true },
  { key: "pet",     label: "なでる",   icon: "🤗", ready: true },
  { key: "dressup", label: "着替え",   icon: "👕", ready: false },
  { key: "quest",   label: "冒険",     icon: "🎒", ready: false },
  { key: "room",    label: "部屋編集", icon: "🛋️", ready: false },
  { key: "zukan",   label: "図鑑",     icon: "📖", ready: false },
];

export function renderChappyScreen(){
  const st = getChappy();
  const stage = chappyStageForXp(st.xp);
  const nextStage = chappyNextStage(st.xp);
  const info = chappyLevelInfo(st.xp);
  const charCls = ["chp-char", ...moodClasses(st)];
  const roomTime = isNight() ? "night" : (hourNow() >= 17 ? "evening" : "day");

  app.innerHTML = `
    <div class="chp-screen">
      <div class="q-head"><button class="quit" data-go="select">← ホーム</button><span class="q-count">🏠 チャッピーハウス</span></div>

      <div class="chp-head">
        <div class="chp-head-name">
          ${CHAPPY_NAME}
          <span class="chp-stage-badge">${stage.name}</span>
        </div>
        <div class="chp-head-right">
          <span class="chp-head-pill" id="chp-head-lv">Lv.${info.level}</span>
          <span class="chp-head-pill chp-head-pill-coin">🪙 <b id="chp-head-coin">${st.coins.toLocaleString()}</b></span>
          <button type="button" class="chp-gear" id="chp-settings" aria-label="チャッピーハウス設定">⚙️</button>
        </div>
      </div>

      <div class="chp-room chp-room--${roomTime}" id="chp-room">
        <div class="chp-room-window"></div>
        <div class="chp-room-shelf"></div>
        <div class="chp-room-rug"></div>
        <div class="chp-bubble" id="chp-bubble" hidden></div>
        <button type="button" class="${charCls.join(" ")}" id="chp-char" aria-label="${CHAPPY_NAME}をなでる">
          ${chappySVG(stage.key)}
        </button>
        <div class="chp-fx" id="chp-fx" aria-hidden="true"></div>
      </div>

      <div class="chp-card chp-stats">
        ${statRowHTML("genki", "元気", "⚡", st.genki)}
        ${statRowHTML("hunger", "お腹", "🍙", st.hunger)}
        ${statRowHTML("bond", "なかよし度", "💗", st.bond)}
        <div class="chp-xp-row">
          <div class="chp-xp-head">
            <span class="chp-stat-lab">🌟 経験値</span>
            <span class="chp-xp-num" id="chp-xp-label">${info.cur} / ${info.need} XP</span>
          </div>
          <div class="chp-stat-track chp-xp-track"><div class="chp-stat-fill chp-xp-fill" style="width:${info.pct}%"></div></div>
          <div class="chp-xp-remain" id="chp-xp-remain">つぎのレベルまで あと ${info.need - info.cur} XP</div>
          ${nextStage ? `<div class="chp-xp-stage">つぎの成長「${nextStage.name}」まで あと ${Math.max(0, nextStage.minXp - st.xp)} XP</div>` : `<div class="chp-xp-stage">りっぱに成長しました！</div>`}
        </div>
      </div>

      <div class="chp-card chp-actions">
        ${CHAPPY_ACTIONS.map(a => `
          <button type="button" class="chp-action${a.ready ? "" : " chp-action--soon"}" data-chp-action="${a.key}">
            <span class="chp-action-icon">${a.icon}</span>
            <span class="chp-action-label">${a.label}</span>
            ${a.ready ? "" : `<span class="chp-action-soon">準備中</span>`}
          </button>`).join("")}
      </div>

      <div class="chp-meta">
        いっしょに ${st.totalDays}日目 ・ ${st.streak}日連続であそんでいます
      </div>
    </div>`;

  app.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
  document.getElementById("chp-settings").onclick = () => { playTapSound(); openChappySettingsModal(); };

  // キャラ本体：タップ＝なでる。スワイプでなでる操作にも対応（pointermove）
  const char = document.getElementById("chp-char");
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

  app.querySelectorAll("[data-chp-action]").forEach(b => b.onclick = () => {
    markInteraction();
    const key = b.dataset.chpAction;
    if(key === "food"){ playTapSound(); openFoodModal(); return; }
    if(key === "pet"){ doPet(); return; }
    // 未実装機能：準備中である旨を吹き出しで伝える（何も起きない無反応ボタンにしない）
    playTapSound();
    showBubble(pickLine("preparing"));
  });

  // あいさつの吹き出し（時間帯・空腹で出し分け）
  const greetKind = st.hunger <= 25 ? "hungry" : (isNight() ? "night" : (isMorning() ? "morning" : "greet"));
  setTimeout(() => showBubble(pickLine(greetKind)), 500);

  lastInteractionTs = Date.now();
  startIdleWatch();
  window.scrollTo(0, 0);
}
