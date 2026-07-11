import './db.js';
import { loadCoins, loadTapSound, loadUiTheme, migrateOldData } from './core.js';
import { go, openQuickMenuSheet, openStudyMenuSheet, render, renderSettings } from './render.js';
import { playTapSound } from './audio.js';
import { S, state } from './state.js';
import { checkNewsQuizPopup } from './newsQuiz.js';
import { bootPushServiceWorker, onPushNotificationClick } from './push.js';

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

// 別タブ/別アプリから戻ってきてこのタブが再び前面表示された瞬間にも、
// 「今日のニュース検定」の出題条件を確認する（ホーム画面を開きっぱなしで
// 20時をまたいだ場合の再訪トリガーに対応するため、render()経由の呼び出し
// だけでなくここでも明示的にチェックする）
document.addEventListener("visibilitychange", () => {
  if(document.visibilityState === "visible") checkNewsQuizPopup();
});

/* ===== プッシュ通知（FCM）：許可を求めずService Workerだけ先に登録しておく =====
   実際の許可要求は設定画面の「プッシュ通知を有効にする」ボタン（ユーザー
   操作）から行う（js/render.jsの設定モーダル参照） */
bootPushServiceWorker();

// 通知タップ（アプリが既に開いていたケース）は firebase-messaging-sw.js の
// notificationclick から postMessage で届く
onPushNotificationClick((screen) => go(screen || "calendar"));

// 通知タップで新しいタブ／ウィンドウとして開かれたケース
// （?openScreen=calendar）。認証判定（ゲスト/ログイン確定）が終わるまで
// 待ってから遷移する。使い終わったURLパラメータはすぐ取り除く
(function handleOpenScreenParam(){
  const params = new URLSearchParams(window.location.search);
  const target = params.get("openScreen");
  if(!target) return;
  history.replaceState(null, "", window.location.pathname);
  let tries = 0;
  const tryGo = () => {
    tries++;
    if(state.authReady){ go(target); return; }
    if(tries < 40) setTimeout(tryGo, 250);
  };
  tryGo();
})();
