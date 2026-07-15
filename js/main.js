import './learning-sync.js';
import './db.js';
import { loadCoins, loadTapSound, loadUiTheme, migrateOldData } from './core.js';
import { go, openQuickMenuSheet, openStudyMenuSheet, render, renderSettings } from './render.js';
import './home-news-date-sync.js';
import { initStockDetailUI } from './stock-detail.js';
import { playTapSound } from './audio.js';
import { S, state } from './state.js';
import { checkNewsQuizPopup } from './newsQuiz.js';

// 全資格の経験値初期同期が完了した時点で、読み込み画面から正しい総合ランクへ切り替える。
window.addEventListener("learning-data-ready", () => render());

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

// 画面下部の固定ナビゲーション（#app外の静的要素なので一度だけ紐付ける）。
// 「各種機能」「学習」の2タブは画面遷移ではなくボトムシートを開く
document.querySelectorAll(".bnav-btn").forEach(b => b.addEventListener("click", () => {
  const nav = b.dataset.nav;
  if(nav === "quick-menu") return openQuickMenuSheet();
  if(nav === "study-menu") return openStudyMenuSheet();
  go(nav);
}));

// 株価／保有株画面の銘柄行をタップしたときだけ、詳細オーバーレイを開く。
// イベント委譲のため、バックグラウンド更新で行が再生成されても再登録は不要。
initStockDetailUI();

migrateOldData();
S.coins = loadCoins();
S.uiTheme = loadUiTheme();
S.tapSound = loadTapSound();
render();

// 安全装置：8秒待ってもFirebaseの準備が終わらない（通信が遅い/失敗）場合は
// 固まらないようログイン画面へ進める。ログイン済みの場合は learning-sync.js が
// 全資格データの同期完了まで読み込み画面を維持する。
setTimeout(function(){
  if(!state.authReady && !state.guestMode){ state.authReady = true; render(); }
}, 8000);

// 別タブ/別アプリから戻ってきてこのタブが再び前面表示された瞬間にも、
// 「今日のニュース検定」の出題条件を確認する（ホーム画面を開きっぱなしで
// 20時をまたいだ場合の再訪トリガーに対応するため、render()経由の呼び出し
// だけでなくここでも明示的にチェックする）
document.addEventListener("visibilitychange", () => {
  if(document.visibilityState === "visible") checkNewsQuizPopup();
});