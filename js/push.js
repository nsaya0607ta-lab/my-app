/* =========================================================================
   Webプッシュ通知（Firebase Cloud Messaging）基盤。

   js/notifications.js のアプリ内トースト／ブラウザローカル通知（アプリを
   開いている間だけ動く）はそのまま残し、これはそれと並行して動く別経路。
   サーバー側（api/push/dispatch.js）がFirestoreの通知時刻を監視し、FCM
   経由でこの端末のService Worker（firebase-messaging-sw.js）へプッシュを
   送ることで、アプリを閉じていても通知が届くようにする。

   ユーザー操作（設定＞プッシュ通知を有効にする）で初めて許可を要求し、
   取得したFCMトークンをユーザー単位でFirestoreへ複数端末ぶん保存する。
   ========================================================================= */
import { getMessaging, getToken, onMessage, isSupported } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
import { state } from './state.js';

// Firebaseコンソール＞プロジェクトの設定＞Cloud Messaging＞
// 「ウェブ構成」＞「ウェブ push証明書」で生成した鍵ペアの公開鍵に
// 差し替えること（秘密鍵はFirebaseが管理しており、ここに置くのは
// 常に公開鍵のみ。詳細はREADMEを参照）
const VAPID_PUBLIC_KEY = "REPLACE_WITH_YOUR_FIREBASE_VAPID_PUBLIC_KEY";

let swRegistrationPromise = null;
let messagingInstance = null;
let supportPromise = null;
let foregroundListenerBound = false;

function isIOSDevice(){
  return /iP(hone|ad|od)/.test(navigator.userAgent || "");
}

// iOSのSafariは「ホーム画面に追加」してスタンドアロン起動している場合のみ
// Web Pushの各種APIが有効になる（通常タブでは isSupported() がfalseになる）
function isStandaloneDisplay(){
  try{
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }catch(e){ return false; }
}

export function pushEnvironmentInfo(){
  return { isIOS: isIOSDevice(), isStandalone: isStandaloneDisplay() };
}

function ensureServiceWorker(){
  if(!("serviceWorker" in navigator)) return Promise.resolve(null);
  if(!swRegistrationPromise){
    swRegistrationPromise = navigator.serviceWorker.register("/firebase-messaging-sw.js")
      .catch((e) => { console.error("push sw register failed:", e); return null; });
  }
  return swRegistrationPromise;
}

// アプリ起動直後に（許可を求めずに）Service Workerだけ静かに登録しておく。
// 通知の許可はユーザーが「プッシュ通知を有効にする」を押した時だけ求める
export function bootPushServiceWorker(){
  if(typeof window === "undefined") return;
  ensureServiceWorker();
}

export async function pushIsSupported(){
  if(typeof window === "undefined") return false;
  if(!supportPromise){
    supportPromise = (async () => {
      if(!("Notification" in window) || !("serviceWorker" in navigator)) return false;
      try{ return await isSupported(); }catch(e){ return false; }
    })();
  }
  return supportPromise;
}

function ensureForegroundListener(){
  if(foregroundListenerBound || !messagingInstance) return;
  foregroundListenerBound = true;
  // アプリを開いている（フォアグラウンド）ときは、既存のアプリ内トースト
  // （setIntervalポーリング＋js/notifications.js）に表示を任せるため、
  // ここでは何もしない（OS通知の二重表示を防ぐ）
  onMessage(messagingInstance, () => {});
}

function tokenDocId(token){
  return "t_" + String(token).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 300);
}

async function savePushToken(token){
  if(!state.db || !state.currentUserId || !token) return;
  const ref = doc(state.db, "users", state.currentUserId, "pushTokens", tokenDocId(token));
  const nowIso = new Date().toISOString();
  let createdAt = nowIso;
  try{
    const existing = await getDoc(ref);
    if(existing.exists() && existing.data().createdAt) createdAt = existing.data().createdAt;
  }catch(e){ /* 読み取りに失敗しても新規作成として保存を続行 */ }
  await setDoc(ref, {
    token,
    enabled: true,
    userAgent: navigator.userAgent || "",
    createdAt,
    updatedAt: nowIso,
  }, { merge: true });
}

// 戻り値: { ok:true } | { ok:false, reason: "unsupported"|"ios-needs-home-screen"|"login-required"|"denied"|"sw-failed"|"token-error" }
export async function requestPushPermission(){
  if(typeof window === "undefined" || !("Notification" in window)) return { ok: false, reason: "unsupported" };
  if(!state.currentUserId) return { ok: false, reason: "login-required" };

  const supported = await pushIsSupported();
  if(!supported){
    if(isIOSDevice() && !isStandaloneDisplay()) return { ok: false, reason: "ios-needs-home-screen" };
    return { ok: false, reason: "unsupported" };
  }

  const reg = await ensureServiceWorker();
  if(!reg) return { ok: false, reason: "sw-failed" };

  let permission;
  try{ permission = await Notification.requestPermission(); }
  catch(e){ return { ok: false, reason: "unsupported" }; }
  if(permission !== "granted") return { ok: false, reason: "denied" };

  try{
    if(!messagingInstance) messagingInstance = getMessaging();
    const token = await getToken(messagingInstance, { vapidKey: VAPID_PUBLIC_KEY, serviceWorkerRegistration: reg });
    if(!token) return { ok: false, reason: "token-error" };
    await savePushToken(token);
    ensureForegroundListener();
    return { ok: true };
  }catch(e){
    console.error("push token error:", e);
    return { ok: false, reason: "token-error" };
  }
}

// 既に許可済み（Notification.permission === "granted"）の端末で、ログイン
// のたびに（無言で・プロンプトを出さずに）トークンを取り直してFirestoreへ
// 保存し直す。FCMトークンは失効・ローテーションすることがあるため、開いた
// ときに最新化しておかないと、許可済みのはずの端末に届かなくなってしまう
export async function syncPushTokenIfGranted(){
  if(typeof window === "undefined" || !("Notification" in window)) return;
  if(Notification.permission !== "granted") return;
  if(!state.currentUserId) return;
  const supported = await pushIsSupported();
  if(!supported) return;
  const reg = await ensureServiceWorker();
  if(!reg) return;
  try{
    if(!messagingInstance) messagingInstance = getMessaging();
    const token = await getToken(messagingInstance, { vapidKey: VAPID_PUBLIC_KEY, serviceWorkerRegistration: reg });
    if(token){ await savePushToken(token); ensureForegroundListener(); }
  }catch(e){ console.error("push token resync failed:", e); }
}

// 設定画面の表示用：現在の通知許可状態をひとことで返す
export function currentNotificationPermission(){
  if(typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission; // "granted" | "denied" | "default"
}

// Service Worker側（notificationclick）からのpostMessageを受け取り、
// 通知タップ時の画面遷移（カレンダー画面を開く）へつなげる
export function onPushNotificationClick(handler){
  if(typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = event.data;
    if(data && data.type === "push-notification-click") handler(data.screen || "calendar");
  });
}
