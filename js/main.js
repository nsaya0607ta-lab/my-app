import './db.js';
import { loadCoins, loadTapSound, loadUiTheme, migrateOldData } from './core.js';
import { go, render, renderSettings } from './render.js';
import { playTapSound } from './audio.js';
import { S, state } from './state.js';

/* ===== タップ音（音声ファイル不要・Web Audio APIでその場合成／設定＞タップ音設定で切替） =====
   問題の選択肢（.opt）と設定モーダル内（.settings-modal。選択と同時に自前で
   試聴音を鳴らすため）は、設定に関わらずここでは常に無音にする */
const TAP_SEL = "button, .cert-card, .link, .link2, .bp-link, [data-go], [data-mission], [data-pc], [data-mode], [data-practice], [data-review]";
document.addEventListener("click", (e)=>{
  const el = e.target && e.target.closest ? e.target.closest(TAP_SEL) : null;
  if(!el || el.disabled || el.classList.contains("locked")) return;
  if(el.closest(".opt") || el.closest(".settings-modal")) return;
  playTapSound();
}, true);

// ヘッダー右上のランキング／プロフィールへの丸型ショートカット（#app外の静的要素なので一度だけ紐付ける）
document.querySelectorAll(".top-nav [data-go]").forEach(b => b.addEventListener("click", () => go(b.dataset.go)));

migrateOldData();
S.coins = loadCoins();
S.uiTheme = loadUiTheme();
S.tapSound = loadTapSound();
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
