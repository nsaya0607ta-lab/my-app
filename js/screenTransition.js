/* =========================================================================
   画面遷移アニメーション（Shared Element / Morphing Transition）

   単純なフェードではなく、「押したボタン（またはボタンを含むカード）が
   そのまま次の画面へ変形して広がる」コンテナ変形で画面を切り替える。

   ─ 演出の流れ（合計 約300〜440ms）─
   1. 押した瞬間  … タップした要素をほんの一瞬だけ縮小（PRESS_MS）
   2. 拡大        … 起点の矩形から画面いっぱいへ、すりガラスの面が広がる
   3. 背景        … 直前の画面は軽くぼかし＋半透明にしながら奥へ引く
   4. 表示        … 次の画面は「タイトル → カード → ボタン」の順に
                     数十msずつずらして立ち上がる
   5. 停止        … 最後はわずかなスプリング（行き過ぎて戻る）で自然に止まる
   6. 戻る        … 開いたときと逆に、画面が元のボタン／カードへ縮んで畳まれる

   実装上のポイント：
   ・render() は同期のまま。描画の直前に旧画面のDOMを「そのまま」固定レイヤーへ
     移し替える（クローンしないのでcanvas等の描画内容も欠けない）ので、
     切り替えの瞬間に白い画面が出ることがない。
   ・アニメーションは transform / opacity / filter / clip-path のみを使うため
     レイアウトが跳ねない。
   ・スクロール位置は画面ごとに記憶し、進むときは先頭、戻るときは元の位置へ
     ペイント前に確定させる（遷移中に不自然に動いて見えない）。
   ========================================================================= */

/* --- 時間設計（ms）。進むときが合計約410ms、戻るときが約370ms。
   旧画面が消えきる前に次の画面が立ち上がり始めるよう時間を重ねてあるので、
   途中で何も無い（白い）画面になる瞬間ができない --- */
const FWD  = { old:240, morph:260, revealStart:70, step:30, item:220, veil:380 };
const BACK = { old:240, morph:250, revealStart:60, step:26, item:200, veil:300 };
const PRESS_MS = 115;
const TAP_FRESH_MS = 1600;   // この時間内のタップだけを遷移の起点として扱う

const EASE_OUT   = "cubic-bezier(.22,1,.36,1)";
const EASE_INOUT = "cubic-bezier(.4,0,.2,1)";
const SPRING     = "cubic-bezier(.2,1.16,.32,1)";   // 最後にわずかに行き過ぎて戻る
const EXPAND     = "cubic-bezier(.34,.86,.28,1.03)"; // 一定の速さで広がり、最後だけほんの少し伸びて止まる

/* 押した感触（縮小）と遷移の起点にする要素。main.js のタップ音と同じ範囲 */
const PRESS_SEL = 'button,[role="button"],.cert-card,.link,.link2,.bp-link,[data-go],[data-nav],[data-mission],[data-pc],[data-mode],[data-practice],[data-review]';
/* 押した感触を付けない要素（問題の選択肢・設定モーダル・入力欄） */
const PRESS_SKIP_SEL = '.opt,.settings-modal,input,textarea,select';
/* 「ボタンを含むカード」を起点にするための候補 */
const CARD_SEL = '[class*="card"],[class*="tile"],[class*="panel"],[class*="wrap"]';
/* 遷移先で元の起点を探し直すための手がかりになる属性 */
const KEY_ATTRS = ["data-go", "data-nav", "data-mode", "data-practice", "data-cert", "data-mission", "data-pc"];

const canAnimate = typeof Element !== "undefined" && !!Element.prototype.animate;
const canClip = typeof CSS !== "undefined" && CSS.supports && CSS.supports("clip-path", "inset(0px round 8px)");
const reduceMotion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

let lastKey = null;          // 直前に描画した画面キー
let navStack = [];           // 進んだ経路 [{from,to,sel}]（戻る判定と起点の復元に使う）
const scrollMemo = new Map();// 画面キー → スクロール位置
let lastTap = null;          // 直近にタップした要素の情報
let running = null;          // 実行中の演出 {layers,anims,timer}

/* ---------------------------------------------------------------- 小道具 */

function appEl(){ return document.getElementById("app"); }

function rectOf(el){
  const r = el.getBoundingClientRect();
  return { left:r.left, top:r.top, width:r.width, height:r.height };
}

function radiusOf(el){
  const v = parseFloat(getComputedStyle(el).borderTopLeftRadius);
  return isNaN(v) ? 16 : Math.min(v || 16, 40);
}

// 画面いっぱい＝本文の横幅（.shell）×ビューポートの高さ
function fullRect(){
  const shell = document.querySelector(".shell");
  const w = window.innerWidth, h = window.innerHeight;
  if(!shell) return { left:0, top:0, width:w, height:h };
  const r = shell.getBoundingClientRect();
  const left = Math.max(0, r.left);
  const right = Math.min(w, r.left + r.width);
  return { left, top:0, width:Math.max(1, right-left), height:h };
}

// 起点が画面外に出ている場合でも、方向感を保ったまま画面内へ寄せる
function clampRect(r){
  const h = window.innerHeight;
  const out = { left:r.left, top:r.top, width:Math.max(24, r.width), height:Math.max(24, r.height) };
  if(out.top + out.height > h) out.top = Math.min(out.top, h - out.height);
  if(out.top < 0) out.top = Math.max(-out.height * 0.5, out.top);
  if(out.top > h) out.top = h - out.height * 0.5;
  return out;
}

// タップ位置が分からないときの起点（画面中央のやや上）
function centerRect(full){
  const w = full.width * 0.62, h = full.height * 0.24;
  return { left: full.left + (full.width - w)/2, top: full.height * 0.36, width:w, height:h };
}

// clip-path の inset 値（.stx-morph はビューポート全面の要素）
function insetOf(r, radius){
  const w = window.innerWidth, h = window.innerHeight;
  const t = Math.round(r.top), l = Math.round(r.left);
  const rt = Math.round(w - (r.left + r.width)), b = Math.round(h - (r.top + r.height));
  return `inset(${t}px ${rt}px ${b}px ${l}px round ${Math.round(radius)}px)`;
}

// ボタン、またはそのボタンを含むカードを起点にする。
// 画面の大半を占める大きな入れ物はカードとみなさず、ボタン自身を起点にする
function originElementFor(el){
  const card = el.closest(CARD_SEL);
  if(card && card !== appEl() && !card.classList.contains("shell")){
    const r = card.getBoundingClientRect();
    const area = r.width * r.height;
    if(area > 0 && area < window.innerWidth * window.innerHeight * 0.7) return card;
  }
  return el;
}

// 戻ったときに同じ要素を探し直すための手がかり
function selectorFor(el){
  if(el.id) return "#" + cssEscape(el.id);
  for(const a of KEY_ATTRS){
    const v = el.getAttribute && el.getAttribute(a);
    if(v) return `[${a}="${v.replace(/["\\]/g, "\\$&")}"]`;
  }
  return null;
}

function cssEscape(s){
  if(typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
  return String(s).replace(/[^\w-]/g, "\\$&");
}

/* -------------------------------------------------- 押した感触（縮小） */

let pressEl = null, pressPrev = null, pressAt = 0, pressGuard = 0;

function pressDown(el){
  pressUp(true);
  pressEl = el;
  pressPrev = { transform: el.style.transform, transition: el.style.transition };
  pressAt = performance.now();
  el.style.transition = `transform ${PRESS_MS}ms ${EASE_OUT}`;
  el.style.transform = (pressPrev.transform ? pressPrev.transform + " " : "") + "scale(.955)";
  // pointerup が来ないまま終わる場合（長押しメニュー等）でも必ず元へ戻す
  clearTimeout(pressGuard);
  pressGuard = setTimeout(() => pressUp(true), 1200);
}

function pressUp(immediate){
  clearTimeout(pressGuard);
  if(!pressEl) return;
  const el = pressEl, prev = pressPrev;
  const wait = immediate ? 0 : Math.max(0, PRESS_MS - (performance.now() - pressAt));
  pressEl = null; pressPrev = null;
  setTimeout(() => {
    el.style.transform = prev.transform;
    setTimeout(() => { el.style.transition = prev.transition; }, PRESS_MS + 30);
  }, wait);
}

/* ------------------------------------------------------ タップの記録 */

function onPointerDown(e){
  const t = e.target;
  if(!t || t.nodeType !== 1 || !t.closest) return;
  const el = t.closest(PRESS_SEL);
  if(!el || el.disabled || el.closest(".stx-old")) return;
  const origin = originElementFor(el);
  lastTap = { rect: rectOf(origin), radius: radiusOf(origin), sel: selectorFor(el), at: performance.now() };
  if(!t.closest(PRESS_SKIP_SEL) && !el.classList.contains("locked")) pressDown(el);
}

if(typeof document !== "undefined"){
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointerup", () => pressUp(false), true);
  document.addEventListener("pointercancel", () => pressUp(true), true);
  window.addEventListener("pagehide", () => cleanup());
}

// タップが無いまま遷移した場合（キーボード操作・自動遷移）のフォールバック
function currentOrigin(){
  if(lastTap && performance.now() - lastTap.at < TAP_FRESH_MS) return lastTap;
  const ae = document.activeElement;
  if(ae && ae.nodeType === 1 && ae !== document.body && ae.closest && ae.closest(PRESS_SEL)){
    const origin = originElementFor(ae);
    return { rect: rectOf(origin), radius: radiusOf(origin), sel: selectorFor(ae) };
  }
  return null;
}

/* ------------------------------------------------------ レイヤーの生成 */

// 旧画面のDOMを「そのまま」固定レイヤーへ移す（クローンしないので描画が欠けない）。
// #app より後ろに置くことで、一時的にIDが重複しても新画面側が優先される。
// レイヤー自身はビューポートと同じ大きさにし、中身だけを元の位置へずらして
// 置く（レイヤーにかけるfilterが position:fixed の基準になるため、画面内の
// FAB等がずれて見えないようにするため）
function buildOldLayer(app){
  const r = app.getBoundingClientRect();
  const layer = document.createElement("div");
  layer.className = "stx-old";
  layer.setAttribute("aria-hidden", "true");
  const inner = document.createElement("div");
  inner.className = "stx-old-inner";
  inner.style.left = r.left + "px";
  inner.style.top = r.top + "px";
  inner.style.width = r.width + "px";
  while(app.firstChild) inner.appendChild(app.firstChild);
  layer.appendChild(inner);
  (app.parentNode || document.body).appendChild(layer);
  return layer;
}

function buildMorph(){
  const m = document.createElement("div");
  m.className = "stx-morph";
  m.setAttribute("aria-hidden", "true");
  document.body.appendChild(m);
  return m;
}

/* ------------------------------------------------- ずらして出す対象 */

// 次の画面を一度に出さず、ひと塊ずつ順に立ち上げるための対象を選ぶ。
// #app 直下が単一のラッパーなら、その中身まで降りて中身の塊を対象にする
function staggerTargets(root){
  let list = blockChildren(root);
  let depth = 0;
  while(list.length === 1 && depth++ < 2){
    const inner = blockChildren(list[0]);
    if(inner.length < 2) break;
    list = inner;
  }
  return list.slice(0, 6);
}

function blockChildren(el){
  return Array.from(el.children).filter(c => {
    if(c.nodeType !== 1) return false;
    if(/^(SCRIPT|STYLE|TEMPLATE|LINK)$/.test(c.tagName)) return false;
    // 画面に固定されたFAB・ヘッダー類は動かさない（位置が跳ねて見えるため）
    const pos = getComputedStyle(c).position;
    if(pos === "fixed" || pos === "sticky") return false;
    return true;
  });
}

/* ------------------------------------------------------------ 後始末 */

function cleanup(){
  if(!running) return;
  const r = running;
  running = null;
  clearTimeout(r.timer);
  r.anims.forEach(a => { try{ a.cancel(); }catch(e){} });
  r.layers.forEach(el => { try{ el.remove(); }catch(e){} });
}

/* ============================================================ 公開API */

/* 描画の直前に呼ぶ。画面が切り替わるときだけ演出の下ごしらえをして
   コンテキストを返す（同じ画面の再描画や起動直後は null） */
export function captureScreenTransition(key){
  const app = appEl();
  if(!app) return null;
  const prev = lastKey;
  if(prev === key) return null;
  lastKey = key;
  if(prev !== null) scrollMemo.set(prev, window.scrollY || window.pageYOffset || 0);

  // 起動直後は演出もスクロール操作もしない（ブラウザが復元した位置のまま）
  if(prev === null) return null;
  // ログイン前後のゲート画面は演出しないが、画面自体は切り替わっているので
  // スクロール位置の確定（先頭出し）だけは共通処理に任せる
  if(prev === "gate" || key === "gate") return { key, back:false, plain:true };

  // 戻る判定：直前に進んできた経路をそのまま引き返す場合
  const top = navStack[navStack.length - 1];
  const back = !!(top && top.from === key);
  let entry;
  if(back){
    entry = navStack.pop();
  }else{
    const o = currentOrigin();
    entry = { from: prev, to: key, sel: o ? o.sel : null };
    navStack.push(entry);
    if(navStack.length > 12) navStack.shift();
  }

  if(!canAnimate || (reduceMotion && reduceMotion.matches)) return { key, back, plain:true };

  if(running) cleanup();   // 連打時は直前の演出を打ち切ってから始める

  const origin = back ? null : currentOrigin();
  return {
    key, back, entry, plain:false,
    layer: buildOldLayer(app),
    origin: origin ? { rect: clampRect(origin.rect), radius: origin.radius } : null,
  };
}

/* 描画に失敗したときは旧画面を戻して演出を中止する */
export function abortScreenTransition(ctx){
  if(!ctx || ctx.plain || !ctx.layer) return;
  const app = appEl();
  const inner = ctx.layer.querySelector(".stx-old-inner");
  if(app && inner && !app.firstChild){
    while(inner.firstChild) app.appendChild(inner.firstChild);
  }
  try{ ctx.layer.remove(); }catch(e){}
}

/* 描画の直後に呼ぶ。スクロール位置を確定させてから演出を開始する */
export function playScreenTransition(ctx){
  if(!ctx) return;
  const app = appEl();

  // スクロール位置は「進む＝先頭」「戻る＝元いた位置」。ペイント前に確定させるので
  // 画面が跳ねたり、遷移後にスクロールが動いて見えたりしない
  const y = ctx.back ? (scrollMemo.get(ctx.key) || 0) : 0;
  try{ window.scrollTo(0, y); }catch(e){}

  if(ctx.plain || !app) return;

  try{
    startAnimation(ctx, app);
  }catch(e){
    // 何かあっても画面が消えたままにはしない
    try{ ctx.layer.remove(); }catch(_){}
    running = null;
  }
}

function startAnimation(ctx, app){
  const t = ctx.back ? BACK : FWD;
  const full = fullRect();
  const target = resolveTargetRect(ctx, full);
  const layer = ctx.layer;
  const anims = [];
  const layers = [layer];

  /* --- 1. 旧画面：軽いブラーと半透明をかけながら起点へ向かって引いていく --- */
  // レイヤーはビューポートと同じ大きさなので、起点の中心座標をそのまま原点にできる
  const cx = target.left + target.width / 2;
  const cy = target.top + target.height / 2;
  layer.style.transformOrigin = `${cx}px ${cy}px`;
  if(ctx.back){
    // 戻るとき：開いたときと逆向きに、元のボタン／カードへ縮んで畳まれる
    const s = Math.max(0.32, Math.min(0.9, target.width / Math.max(1, full.width)));
    anims.push(layer.animate([
      { opacity:1, filter:"blur(0px)", transform:"scale(1)" },
      { opacity:.88, filter:"blur(2px)", transform:`scale(${(1-(1-s)*0.3).toFixed(3)})`, offset:.35 },
      { opacity:0, filter:"blur(5px)", transform:`scale(${s.toFixed(3)})` },
    ], { duration:t.old, easing:EASE_INOUT, fill:"forwards" }));
  }else{
    // 進むとき：奥へ半歩下がりながらぼける。次の画面が立ち上がるまでは
    // ほぼ見えたままにして、途中で何も無い画面にならないようにする
    anims.push(layer.animate([
      { opacity:1, filter:"blur(0px)", transform:"scale(1)" },
      { opacity:.9, filter:"blur(2px)", transform:"scale(.99)", offset:.35 },
      { opacity:0, filter:"blur(5px)", transform:"scale(.972)" },
    ], { duration:t.old, easing:EASE_INOUT, fill:"forwards" }));
  }

  /* --- 2. 起点の矩形が次の画面いっぱいへ広がる（戻るときは逆再生） --- */
  if(canClip){
    const morph = buildMorph();
    layers.push(morph);
    const small = insetOf(target, ctx.back ? (ctx.entry && ctx.entry.radius) || 18 : (ctx.origin ? ctx.origin.radius : 18));
    const big = insetOf(full, 22);
    if(ctx.back){
      anims.push(morph.animate(
        [{ clipPath:big }, { clipPath:small }],
        { duration:t.morph, easing:EASE_INOUT, fill:"forwards" }
      ));
      anims.push(morph.animate(
        [{ opacity:1 }, { opacity:1, offset:.45 }, { opacity:0 }],
        { duration:t.veil, easing:EASE_INOUT, fill:"forwards" }
      ));
    }else{
      anims.push(morph.animate(
        [{ clipPath:small }, { clipPath:big }],
        { duration:t.morph, easing:EXPAND, fill:"forwards" }
      ));
      anims.push(morph.animate(
        [{ opacity:0 }, { opacity:1, offset:.13 }, { opacity:.55, offset:.48 }, { opacity:0 }],
        { duration:t.veil, easing:EASE_INOUT, fill:"forwards" }
      ));
    }
  }

  /* --- 3. 次の画面は「タイトル → カード → ボタン」の順に数十msずつずらす --- */
  const items = staggerTargets(app);
  items.forEach((el, i) => {
    if(!el.animate) return;
    const delay = t.revealStart + Math.min(i, 4) * t.step;
    const from = ctx.back
      ? { opacity:0, transform:"scale(1.022)" }                 // 戻る＝広がっていた画面が元の大きさへ収まる
      : { opacity:0, transform:"translateY(12px) scale(.986)" }; // 進む＝わずかに持ち上がって着地
    anims.push(el.animate(
      [from, { opacity:1, transform:"none" }],
      { duration:t.item, delay, easing:SPRING, fill:"backwards" }
    ));
  });

  const total = Math.max(t.morph, t.veil, t.revealStart + Math.min(items.length, 5) * t.step + t.item);
  running = { layers, anims, timer: setTimeout(cleanup, total + 80) };
}

// 戻るときの縮小先：まず元のボタン／カードを実際に探し直し、
// 見つからなければ記録しておいた位置、それも無ければ画面中央へ畳む
function resolveTargetRect(ctx, full){
  if(!ctx.back) return ctx.origin ? ctx.origin.rect : centerRect(full);
  const sel = ctx.entry && ctx.entry.sel;
  if(sel){
    let list = [];
    try{ list = [...document.querySelectorAll(sel)]; }catch(e){ list = []; }
    // 退避中の旧画面にも同じ要素が残っているため、新しい画面側のものを使う
    const el = list.find(x => !x.closest(".stx-old"));
    if(el){
      const origin = originElementFor(el);
      ctx.entry.radius = radiusOf(origin);
      return clampRect(rectOf(origin));
    }
  }
  return centerRect(full);
}
