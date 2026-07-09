import './db.js';
import { loadCoins, migrateOldData } from './core.js';
import { go, render, renderSettings } from './render.js';
import { S, state } from './state.js';

/* ===== 落ち着いたタップ音（木をやさしく叩くような「ポクッ」音） =====
   音声ファイルに差し替えたい場合は SOUND_SRC.tap にファイルパスを設定するだけでよい
   （例: SOUND_SRC.tap = "assets/sounds/tap.mp3"）。未設定の間はWeb Audioで合成する。
   ※ 問題の選択肢（[data-pick]）はタップ音を鳴らさない仕様のため対象外。
*/
const SOUND_SRC = {
  tap: null, // 例: "assets/sounds/tap.mp3"
};
let _tapCtx = null;
function playTap(){
  if(SOUND_SRC.tap){
    try{
      const audio = new Audio(SOUND_SRC.tap);
      audio.volume = 0.5;
      audio.play().catch(()=>{});
    }catch(e){}
    return;
  }
  try{
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return;
    _tapCtx = _tapCtx || new AC();
    if(_tapCtx.state === "suspended") _tapCtx.resume();   // iOSはタップ内で解錠
    const t = _tapCtx.currentTime;
    const o = _tapCtx.createOscillator();
    const g = _tapCtx.createGain();
    // 低めのサイン波がすっと下がりながら短く減衰する、木をやさしく叩いたような音
    o.type = "sine";
    o.frequency.setValueAtTime(210, t);
    o.frequency.exponentialRampToValueAtTime(130, t + 0.10);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.010);  // やわらかい立ち上がり
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14); // すっと消える
    o.connect(g); g.connect(_tapCtx.destination);
    o.start(t); o.stop(t + 0.16);
  }catch(e){}
}
// 問題の選択肢（[data-pick]）は無音仕様のため、button:not([data-pick]) として除外する
const TAP_SEL = "button:not([data-pick]), .cert-card, .link, .link2, .bp-link, [data-go], [data-mission], [data-pc], [data-mode], [data-practice], [data-review]";
document.addEventListener("click", (e)=>{
  const el = e.target && e.target.closest ? e.target.closest(TAP_SEL) : null;
  if(el && !el.disabled && !el.classList.contains("locked")) playTap();
}, true);

// ヘッダー右上のランキング／プロフィールへの丸型ショートカット（#app外の静的要素なので一度だけ紐付ける）
document.querySelectorAll(".top-nav [data-go]").forEach(b => b.addEventListener("click", () => go(b.dataset.go)));

migrateOldData();
S.coins = loadCoins();
render();

// 安全装置：8秒待ってもFirebaseの準備が終わらない（通信が遅い/失敗）場合は
// 固まらないようログイン画面へ進める。ゲスト利用への導線もそこにあります。
setTimeout(function(){
  if(!state.authReady && !state.guestMode){ state.authReady = true; render(); }
}, 8000);

/* ===== 起動スプラッシュ（ゴールドの犬アイコン）：固定3秒表示してからフェードアウト ===== */
setTimeout(function(){
  const splash = document.getElementById("splash-screen");
  if(!splash) return;
  splash.classList.add("splash-hide");
  setTimeout(function(){ splash.remove(); }, 500);
}, 3000);
