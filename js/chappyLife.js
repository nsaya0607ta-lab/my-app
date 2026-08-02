/* =========================================================================
   🏠 チャッピーハウス：まるチャピの「自分で生活する」エンジン（③・⑮）

   ・部屋を開いているあいだ、数秒ごとに次の行動を選んで自分で動く。
     置いてある家具に近づいて使い、ときどきひとりごとを言う。
   ・行動の選ばれやすさは「時間帯」と「いまのお世話ステータス」で変わる。
     お腹がすいていればごはん、眠ければ寝る、退屈ならゲーム…という具合。
   ・低確率で隠しイベント（流れ星・虹・UFOなど）が現れる。タップするとごほうび。
   ・DOM操作はこのファイルに閉じ、画面側（js/chappyScreen.js）からは
     startChappyLife() / stopChappyLife() を呼ぶだけでよい。
   ・画面が非表示のあいだ（別タブ・別画面）はタイマーを止めて電池を節約する。
   ========================================================================= */
import { CHAPPY_ACTIVITIES, CHAPPY_ACTIVITY_BY_ID } from './data/chappy-quests.js';
import { CHAPPY_ACT_LINES, CHAPPY_TIME_LINES, CHAPPY_SEASON_LINES, CHAPPY_LINES, CHAPPY_STAGE_LINES } from './data/chappy-lines.js';
import {
  chappyTimeSlot, chappySeason, chappyApplyActivity, chappyRollSecret,
  getChappy, chappyStats, chappyStageForXp,
} from './chappy.js';

const ACT_MIN_MS = 5200;      // 1つの行動を続ける最短時間
const ACT_MAX_MS = 9000;      // 同上・最長
const WALK_MS = 1100;         // 家具まで歩く時間（CSSのtransitionと合わせる）
const INTERACTION_REST_MS = 4800; // ユーザー操作の直後に自律移動を始めないための休止時間
const SECRET_INTERVAL_MS = 20000;
const SECRET_LIFE_MS = 13000;

let cfg = null;
let actTimer = null;
let walkTimer = null;
let secretTimer = null;
let running = false;
let paused = false;
let uiPaused = false;
let currentActivity = null;
let lastActivityId = null;

function el(id){ return id ? document.getElementById(id) : null; }
function pick(list){ return list && list.length ? list[Math.floor(Math.random() * list.length)] : null; }
function rand(min, max){ return min + Math.random() * (max - min); }

/* =========================================================================
   起動・停止
   config = {
     roomId, charId,                    … 部屋とキャラクターの要素ID
     floorKey: () => "f1",              … いま表示しているフロア
     placed:   () => ({slotId: itemId}) … そのフロアに置いてある家具
     slotPos:  (slotId) => ({x, y})     … マスの座標（％）
     onBubble: (text) => {}             … ひとりごとの表示
     onActivity: (activity) => {}       … 行動が変わったときの通知（表示バッジ用）
     onSecret: (secretEvent, element) => {} … 隠しイベントをタップしたとき
   }
   ========================================================================= */
export function startChappyLife(config){
  stopChappyLife();
  cfg = config || {};
  running = true;
  paused = false;
  uiPaused = false;
  document.addEventListener("visibilitychange", onVisibility);
  scheduleNext(1800);
  secretTimer = setInterval(rollSecret, SECRET_INTERVAL_MS);
}

export function stopChappyLife(){
  running = false;
  clearTimeout(actTimer); actTimer = null;
  clearTimeout(walkTimer); walkTimer = null;
  clearInterval(secretTimer); secretTimer = null;
  currentActivity = null;
  uiPaused = false;
  document.removeEventListener("visibilitychange", onVisibility);
  cfg = null;
}

function onVisibility(){
  paused = document.visibilityState !== "visible";
  if(!paused && !uiPaused && running){ clearTimeout(actTimer); scheduleNext(1200); }
}

// なでる等の操作をした直後は、少しのあいだ自分の行動を中断してこちらを見る
export function chappyLifeInterrupt(ms){
  if(!running) return;
  freezeCharMotion();
  clearActivityClass();
  clearTimeout(actTimer);
  clearTimeout(walkTimer); walkTimer = null;
  if(uiPaused) return;
  scheduleNext(Math.max(INTERACTION_REST_MS, Number(ms) || 0));
}

// モーダル表示中は、背面で歩いたり状態を更新したりしない。
export function setChappyLifeUiPaused(value){
  const next = !!value;
  if(uiPaused === next) return;
  uiPaused = next;
  clearTimeout(actTimer); actTimer = null;
  clearTimeout(walkTimer); walkTimer = null;
  if(uiPaused){
    freezeCharMotion();
    clearActivityClass();
    return;
  }
  if(running && !paused) scheduleNext(INTERACTION_REST_MS);
}

export function chappyLifeCurrent(){ return currentActivity; }

function scheduleNext(ms){
  clearTimeout(actTimer);
  actTimer = setTimeout(step, ms);
}

/* =========================================================================
   行動の選択
   ========================================================================= */
function availableActivities(){
  const slot = chappyTimeSlot();
  const placed = (cfg && cfg.placed) ? cfg.placed() : {};
  const placedIds = new Set(Object.values(placed || {}));
  return CHAPPY_ACTIVITIES.filter(a => {
    if(a.needs && !placedIds.has(a.needs)) return false;
    return (a.weight[slot] || 0) > 0;
  });
}

// いまのステータスから「いちばんやりたいこと」に重みを足す
function statBias(act, stats){
  let w = 0;
  if(stats.hunger < 45 && (act.id === "eat" || act.id === "cook" || act.id === "snack")) w += 8;
  if(stats.sleep  < 45 && (act.id === "sleep" || act.id === "nap" || act.id === "kotatsu")) w += 8;
  if(stats.clean  < 45 && (act.id === "bath" || act.id === "clean")) w += 8;
  if(stats.fun    < 45 && (act.id === "game" || act.id === "dance" || act.id === "music" || act.id === "roll")) w += 7;
  if(stats.stress > 55 && (act.id === "relax" || act.id === "fish" || act.id === "hug" || act.id === "nap")) w += 7;
  if(stats.genki  < 45 && (act.id === "relax" || act.id === "nap")) w += 5;
  return w;
}

function pickActivity(){
  const list = availableActivities();
  if(!list.length) return CHAPPY_ACTIVITY_BY_ID.wander;
  const slot = chappyTimeSlot();
  const stats = chappyStats();
  const weighted = list.map(a => {
    let w = (a.weight[slot] || 0) + statBias(a, stats);
    if(a.id === lastActivityId) w *= 0.25;     // 同じことを続けにくくする
    return { a, w: Math.max(0.2, w) };
  });
  const total = weighted.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for(const x of weighted){ r -= x.w; if(r <= 0) return x.a; }
  return weighted[weighted.length - 1].a;
}

/* =========================================================================
   行動の実行（歩く → 使う → ひとこと）
   ========================================================================= */
function clearActivityClass(){
  const char = el(cfg && cfg.charId);
  if(!char) return;
  char.className = char.className.replace(/\s*chp-act-[a-z]+/g, "");
  char.classList.remove("chp-walking");
  char.removeAttribute("data-act");
}

function freezeCharMotion(){
  const char = el(cfg && cfg.charId);
  const room = el(cfg && cfg.roomId);
  if(!char || !room || !char.classList.contains("chp-walking") || room.clientWidth <= 0) return;
  const currentLeft = parseFloat(getComputedStyle(char).left);
  if(!Number.isFinite(currentLeft)) return;
  const x = Math.max(16, Math.min(84, currentLeft / room.clientWidth * 100));
  char.style.transition = "none";
  char.style.left = `${currentLeft}px`;
  void char.offsetWidth;
  char.style.setProperty("--chp-x", `${x.toFixed(1)}%`);
  char.style.removeProperty("left");
  void char.offsetWidth;
  char.style.removeProperty("transition");
}

function step(){
  if(!running) return;
  const room = el(cfg && cfg.roomId);
  const char = el(cfg && cfg.charId);
  if(!room || !char){ stopChappyLife(); return; }
  if(uiPaused) return;
  if(paused){ scheduleNext(4000); return; }

  const act = pickActivity();
  lastActivityId = act.id;
  currentActivity = act;

  // 目的地：家具を使う行動なら、その家具のマスの近くへ歩く
  let targetX = rand(24, 76);
  if(act.needs && cfg.placed && cfg.slotPos){
    const placed = cfg.placed() || {};
    const slotId = Object.keys(placed).find(s => placed[s] === act.needs);
    const pos = slotId ? cfg.slotPos(slotId) : null;
    if(pos) targetX = Math.max(16, Math.min(84, pos.x));
  }

  clearActivityClass();
  char.classList.add("chp-walking");
  char.classList.toggle("chp-flip", targetX < currentX(char));
  char.style.setProperty("--chp-x", `${targetX.toFixed(1)}%`);

  clearTimeout(walkTimer);
  walkTimer = setTimeout(() => {
    walkTimer = null;
    if(!running || !el(cfg && cfg.charId)) return;
    const c = el(cfg.charId);
    c.classList.remove("chp-walking", "chp-flip");
    if(act.anim) c.classList.add(act.anim);
    c.setAttribute("data-act", act.icon || "");
    chappyApplyActivity(act);
    if(cfg.onActivity) cfg.onActivity(act);
    maybeSpeak(act);
  }, WALK_MS);

  scheduleNext(WALK_MS + rand(ACT_MIN_MS, ACT_MAX_MS));
}

function currentX(char){
  const v = getComputedStyle(char).getPropertyValue("--chp-x") || "50%";
  const n = parseFloat(v);
  return isNaN(n) ? 50 : n;
}

/* =========================================================================
   ひとりごと（④ 会話システム）
   行動別のセリフを中心に、ときどき時間帯・季節・成長段階・お世話状況の
   セリフを混ぜる。同じ話ばかりにならないよう確率で振り分ける。
   ========================================================================= */
function maybeSpeak(act){
  if(!cfg || !cfg.onBubble) return;
  if(Math.random() > 0.55) return;
  cfg.onBubble(chappyPickLine(act));
}

// 状況にあったセリフを1つ選ぶ（画面側の挨拶にも使う）
export function chappyPickLine(act){
  const st = getChappy();
  const stats = chappyStats(st);
  const stage = chappyStageForXp(st.xp).key;
  const r = Math.random();

  // まずは「いま困っていること」を優先して伝える（放置のサインはやさしく）
  if(stats.hunger <= 25 && r < 0.5) return pick(CHAPPY_LINES.hungry);
  if(stats.clean  <= 30 && r < 0.32) return pick(CHAPPY_LINES.dirty);
  if(stats.stress >= 60 && r < 0.32) return pick(CHAPPY_LINES.stressed);
  if(stats.genki  <= 45 && r < 0.28) return pick(CHAPPY_LINES.tired);
  if(stats.fun    <= 35 && r < 0.28) return pick(CHAPPY_LINES.bored);

  if(act && r < 0.55){
    const lines = CHAPPY_ACT_LINES[act.id];
    if(lines && lines.length) return pick(lines);
  }
  if(r < 0.68) return pick(CHAPPY_TIME_LINES[chappyTimeSlot()] || []);
  if(r < 0.80) return pick(CHAPPY_SEASON_LINES[chappySeason()] || []);
  if(r < 0.88) return pick(CHAPPY_STAGE_LINES[stage] || []);
  if(r < 0.94) return pick(CHAPPY_LINES.wantFurni);
  return pick(CHAPPY_LINES.idle);
}

/* =========================================================================
   ⑮ 隠しイベント
   部屋のなかにふわっと現れて、タップするとごほうびがもらえる。
   一定時間で自然に消えるので、見逃してもストレスにならない。
   ========================================================================= */
function rollSecret(){
  if(!running || paused || uiPaused) return;
  const room = el(cfg && cfg.roomId);
  if(!room) return;
  if(room.querySelector(".chp-secret")) return;   // 同時に2つは出さない
  const ev = chappyRollSecret();
  if(!ev) return;

  const node = document.createElement("button");
  node.type = "button";
  node.className = `chp-secret chp-secret--${ev.id}`;
  node.setAttribute("aria-label", `${ev.name}をタップ`);
  node.innerHTML = `<span class="chp-secret-ico">${ev.icon}</span><span class="chp-secret-glow" aria-hidden="true"></span>`;
  node.style.left = `${rand(14, 86).toFixed(1)}%`;
  node.style.top = `${rand(10, 46).toFixed(1)}%`;
  room.appendChild(node);

  const remove = () => { try{ node.remove(); }catch(e){} };
  const life = setTimeout(remove, SECRET_LIFE_MS);
  node.onclick = () => {
    clearTimeout(life);
    node.classList.add("chp-secret-pop");
    setTimeout(remove, 420);
    if(cfg && cfg.onSecret) cfg.onSecret(ev);
  };
}
