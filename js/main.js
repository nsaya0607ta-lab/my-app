import './db.js';
import { loadCoins, migrateOldData } from './core.js';
import { render, renderSettings, renderSkinShop } from './render.js';
import { S, state } from './state.js';

/* ===== やさしいタップ音（音声ファイル不要・Web Audio） ===== */
let _tapCtx = null;
function playTap(){
  try{
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return;
    _tapCtx = _tapCtx || new AC();
    if(_tapCtx.state === "suspended") _tapCtx.resume();   // iOSはタップ内で解錠
    const t = _tapCtx.currentTime;
    const o = _tapCtx.createOscillator();
    const g = _tapCtx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(660, t);
    o.frequency.exponentialRampToValueAtTime(880, t + 0.05);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.10, t + 0.012);  // 控えめな音量
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); // すっと消える
    o.connect(g); g.connect(_tapCtx.destination);
    o.start(t); o.stop(t + 0.18);
  }catch(e){}
}
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

