# マイプル（AZ-900学習アプリ）

Firebase（Auth / Firestore）＋ Vercel（静的ホスティング＋サーバーレスAPI）構成のPWA。

## セットアップ

```bash
npm install
```

ローカルではAPI関数（`api/`配下）はVercel CLI（`vercel dev`）等で動かす想定です。

## 環境変数（Vercel）

| 変数名 | 用途 |
| --- | --- |
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | Firebase Admin SDK（サービスアカウント）の認証情報 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Googleカレンダー連携のOAuth |
| `APP_BASE_URL` | Google OAuthコールバック後のリダイレクト先 |
| `CRON_SECRET` | プッシュ通知バッチ（`/api/push/dispatch`）を叩く際の認証シークレット（後述） |

`FIREBASE_PRIVATE_KEY` はVercelのUI上で改行がリテラルの `\n` になりがちですが、`api/_lib/firebaseAdmin.js` 側で実際の改行に戻しているため、コピペしたときの見た目のままで登録して問題ありません。

---

## プッシュ通知（Firebase Cloud Messaging）

アプリを開いている間だけ動くアプリ内トースト（`js/notifications.js`）に加えて、**アプリを閉じていてもFCM経由でプッシュ通知が届く**ようにする機能です。既存のトースト通知はそのまま残っています（開いている間はトースト、閉じている間はプッシュ通知）。

### 全体の仕組み

1. ユーザーが設定＞「🔔 プッシュ通知を有効にする」を押す（`js/render.js` 設定モーダル）
2. `js/push.js` がSafari/Chrome等に通知許可を要求し、FCMトークンを取得
3. トークンを `users/{uid}/pushTokens/{tokenId}` へ保存（1ユーザー複数端末ぶん保存可）
4. 予定の登録・変更・削除（ローカルカレンダー）のたびに `js/pushJobs.js` が `notificationJobs/{jobId}` へ「開始5分前」通知ジョブを同期
5. `api/push/dispatch.js`（サーバーレス関数）が定期的に叩かれ、
   - `scheduledAt` を過ぎた `pending` ジョブをFirebase Admin SDKでFCM送信し `status:"sent"` に更新（二重送信防止）
   - JSTで7:00を過ぎたら、その日まだ送っていないユーザーへ「本日の予定」サマリーを送信（`pushDailySummaryLog/{uid}` で送信済み判定）
6. Service Worker（`firebase-messaging-sw.js`）がバックグラウンドでプッシュを受信してOS通知を表示
7. 通知をタップするとカレンダー画面（`?openScreen=calendar`）を開く

Google連携カレンダーの予定は、このアプリの「予定登録」フローを経由しないため、今回のサーバー側ジョブの対象には含めていません（Google Calendar純正のリマインダー・通知に委ねる形になります）。ローカル（デモ）カレンダーの予定のみが対象です。

### Firebase Console側の設定手順

1. **Cloud Messagingの有効化**
   Firebase Console＞プロジェクトの設定＞「Cloud Messaging」タブを開く。
2. **ウェブpush証明書（VAPIDキー）の生成**
   同タブの「ウェブ構成」＞「ウェブ push証明書」で鍵ペアを生成し、公開鍵（`BN...` から始まる文字列）をコピー。
   `js/push.js` の `VAPID_PUBLIC_KEY` をこの値に差し替える。
   （秘密鍵はFirebase側で管理されており、フロントエンド・リポジトリのどこにも置きません）
3. **サービスアカウント（Admin SDK）**
   プロジェクトの設定＞「サービスアカウント」＞「新しい秘密鍵の生成」でJSONを取得し、`project_id` / `client_email` / `private_key` を上表の環境変数へ設定する（Googleカレンダー連携で既に設定済みならそのまま流用可）。
4. **Firestoreのセキュリティルール**
   今回追加したコレクションに対して、最低限次のような制御を設定してください（既存の `users/{uid}` 等のルールに合わせる）。
   - `users/{uid}/pushTokens/{tokenId}`：`request.auth.uid == uid` のときのみ読み書き可
   - `notificationJobs/{jobId}`：作成・更新・削除は `request.auth.uid == request.resource.data.userId`（または既存データの`userId`）のときのみ許可。**Admin SDK（サーバー側）はセキュリティルールの影響を受けないため、`api/push/dispatch.js` からの読み書きは常に可能**
   - `pushDailySummaryLog/{uid}`：クライアントからの読み書きは不要（Admin SDK専用）。全面禁止でよい
5. **Firestoreインデックス**
   `api/push/dispatch.js` は以下のクエリを実行するため、初回デプロイ後にFirestoreのエラーログ（コンソールに出るインデックス作成リンク）に従って複合インデックスを作成してください。
   - コレクション `notificationJobs`：`status`（昇順）＋`scheduledAt`（昇順）の複合インデックス
   - `collectionGroup("pushTokens")` の全件走査（フィルタなし）はインデックス不要ですが、将来 `enabled` 等でフィルタを追加する場合はコレクショングループ用インデックスが別途必要です

### デプロイ手順

1. 上記の環境変数（`FIREBASE_*`、`CRON_SECRET` を含む）をVercelのプロジェクト設定に登録する。`CRON_SECRET` は任意のランダム文字列でよい（例：`openssl rand -hex 32`）。
2. `vercel.json` に `api/push/dispatch` を5分間隔で叩く `crons` 設定を追加済み。Vercelは `CRON_SECRET` を設定していると、Cron実行時に自動で `Authorization: Bearer <CRON_SECRET>` ヘッダを付与してくれるため、追加の署名処理は不要です。
   - **Vercelの Hobby（無料）プランはCron Jobsの実行が1日1回に制限されます。** 5分間隔での実行にはProプラン以上が必要です。
   - Hobbyプランのまま高頻度で通知を送りたい場合は、GitHub Actionsのscheduled workflowやcron-job.org等の外部スケジューラから、`POST https://<デプロイ先ドメイン>/api/push/dispatch` を `Authorization: Bearer <CRON_SECRET>` ヘッダ付きで数分おきに叩いてください（Vercel純正のCronは使わず、`vercel.json`の`crons`設定は無視されます）。
3. `firebase-messaging-sw.js` はリポジトリのルート（`index.html`と同じ階層）に配置済みで、静的ファイルとして自動的に `/firebase-messaging-sw.js` で配信されます。追加のビルド設定は不要です。
4. デプロイ後、設定画面から「🔔 プッシュ通知を有効にする」を押して許可し、実際に予定を5分後で1件登録して届くか確認してください。

### iPhone（Safari／PWA）での注意点

iOS SafariはWeb Pushに対応していますが、**「ホーム画面に追加」してスタンドアロン起動した場合のみ**利用できます（通常のSafariタブでは通知許可自体が出せません）。このアプリでは対応状況を自動判定し、iPhoneの通常タブで開いている場合は設定画面に「ホーム画面に追加してください」という案内を表示します（`js/push.js` の `pushEnvironmentInfo()` / `js/render.js` の設定モーダル）。
