import './db.js';
import { loadCoins, migrateOldData } from './core.js';
import { render, renderSettings } from './render.js';
import { S, state } from './state.js';

/* ===== 🎧 カチッというクリック音（音声ファイル不要・Web Audio） ===== */
let _tapCtx = null;
function playTap(){
  try{
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return;
    _tapCtx = _tapCtx || new AC();
    if(_tapCtx.state === "suspended") _tapCtx.resume();   // iOSのオーディオ解錠
    
    const t = _tapCtx.currentTime;
    const o = _tapCtx.createOscillator();
    const g = _tapCtx.createGain();
    
    // 💡 周波数を高め（1200Hz ➔ 600Hz）にし、一瞬で減衰させることで「カチッ」を表現
    o.type = "sine";
    o.frequency.setValueAtTime(1200, t);
    o.frequency.exponentialRampToValueAtTime(600, t + 0.03);
    
    g.gain.setValueAtTime(0.08, t); // 音量
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03); // 0.03秒ですっと消す（歯切れよく）
    
    o.connect(g); g.connect(_tapCtx.destination);
    o.start(t); o.stop(t + 0.04);
  }catch(e){}
}

// タップ音を鳴らす対象のセレクタ
const TAP_SEL = "button, .cert-card, .link, .link2, .bp-link, [data-go], [data-mission], [data-pc], [data-mode], [data-practice], [data-review]";

document.addEventListener("click", (e)=>{
  const el = e.target && e.target.closest ? e.target.closest(TAP_SEL) : null;
  
  if(el && !el.disabled && !el.classList.contains("locked")) {
    // 💡 【新設】問題の選択肢（.opt クラス または data-pick 属性を持つボタン）の場合は音を鳴らさない
    if (el.classList.contains("opt") || el.hasAttribute("data-pick")) {
      return;
    }
    playTap();
  }
}, true);


const TAP_SEL = "button, .cert-card, .link, .link2, .bp-link, [data-go], [data-pick], [data-mission], [data-pc], [data-mode], [data-practice], [data-review]";
document.addEventListener("click", (e)=>{
  const el = e.target && e.target.closest ? e.target.closest(TAP_SEL) : null;
  if(el && !el.disabled && !el.classList.contains("locked")) playTap();
}, true);

migrateOldData();
S.coins = loadCoins();
render();

// 安全装置：8秒待ってもFirebaseの準備が終わらない（通信が遅い/失敗）場合は
// 固まらないようログイン画面へ進める。ゲスト利用への導線もそこにあります。
setTimeout(function(){
  if(!state.authReady && !state.guestMode){ state.authReady = true; render(); }
}, 8000);

