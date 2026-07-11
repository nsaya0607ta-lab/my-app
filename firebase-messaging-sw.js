/* =========================================================================
   Firebase Cloud Messaging 用 Service Worker。
   アプリを閉じている／タブがバックグラウンドのときに届いたプッシュ通知を
   OS通知として表示するための専用ファイル。ルート直下（スコープ "/"）に
   置くことで、アプリ全体に対するプッシュの受信・表示を担当する。

   フォアグラウンド（アプリを開いて操作中）のときは、この
   onBackgroundMessage は発火せず js/push.js 側の onMessage が受け取る。
   そちらでは既存のアプリ内トースト（js/notifications.js）に表示を任せ、
   OS通知は出さない（開いている間はトースト、閉じている間はプッシュ通知、
   という役割分担にするため）。
   ========================================================================= */
importScripts("https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js");

// js/db.js のFirebase設定と同一（apiKey等はFirebaseのセキュリティルールで
// 保護される前提の公開識別子であり、既にクライアント側に配置済みのため
// Service Worker側にも同じ値を置くこと自体は問題ない）
firebase.initializeApp({
  apiKey: "AIzaSyCg3zD2xkq_3e5MclG9YK_uVqVzWulO9Ws",
  authDomain: "my-az900-app.firebaseapp.com",
  projectId: "my-az900-app",
  storageBucket: "my-az900-app.firebasestorage.app",
  messagingSenderId: "989248012630",
  appId: "1:989248012630:web:1801a2033c56887320d6f7",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notif = payload.notification || {};
  const title = notif.title || "マイプル";
  const options = {
    body: notif.body || "",
    icon: "/assets/icon/app-icon-192.png",
    badge: "/assets/icon/app-icon-192.png",
    data: payload.data || {},
  };
  self.registration.showNotification(title, options);
});

// 通知タップ時：既に開いているタブがあればそこへフォーカスして
// カレンダー画面へ遷移させ（postMessageでjs/main.js側に伝える）、
// 開いているタブが無ければ新しいタブでカレンダー画面を直接開く
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const screen = (event.notification.data && event.notification.data.screen) || "calendar";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.postMessage({ type: "push-notification-click", screen });
          return client.focus();
        }
      }
      return self.clients.openWindow(`/?openScreen=${encodeURIComponent(screen)}`);
    })
  );
});
