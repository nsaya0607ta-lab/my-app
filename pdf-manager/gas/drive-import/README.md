# Google Drive PDF自動取り込み

Google Driveの指定フォルダーへ入れたPDFを、GASからFirebase Storageの受信箱へ送り、PDFフォルダーアプリ起動時に自動登録する機能です。

## 処理の流れ

1. Google Driveの「取込待ち」フォルダーへPDFを入れる
2. GASが10分ごとにPDFを検出する
3. Vercel APIがFirebase Storageの一時アップロードURLを発行する
4. GASがPDF本体をFirebase Storageへ直接送信する
5. 成功したDriveファイルを「処理済み」フォルダーへ移動する
6. PDFフォルダーアプリが `00_受信` へ取り込む
7. Firebaseの通常保管領域への保存が完了してから一時受信箱を削除する
8. 確認不要の自動分類ルールがあれば1階層だけ適用する

## 1. Vercel環境変数

Vercelの `my-app-gllz` プロジェクトに、Production・Previewの両方で次を設定します。

| 名前 | 値 |
|---|---|
| `FIREBASE_STORAGE_BUCKET` | `my-az900-app.firebasestorage.app` |
| `PDF_APP_UID` | PDFフォルダーでログインするFirebase Authentication UID |
| `DRIVE_IMPORT_SECRET` | 64文字程度のランダム文字列 |
| `FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON` | FirebaseサービスアカウントJSON全文 |

サービスアカウントの `private_key` を含むJSONはGitHubやGASへ保存しないでください。

## 2. Firebase Storageルール

`firebase/pdf-cloud-storage.storage.rules` の内容をFirebase ConsoleのStorageルールへ反映します。

`drive-inbox` は、Vercelの管理者権限だけが作成・上書きし、ログイン中の本人だけが読み取り・削除できます。

## 3. Google Driveフォルダー

Google Driveに次の2フォルダーを作成します。

- 取込待ち
- 処理済み

各フォルダーを開いたURLの `/folders/` 以降がフォルダーIDです。

## 4. GASプロジェクト

1. Apps Scriptで新しいプロジェクトを作成
2. `Code.gs` の内容を貼り付け
3. 「プロジェクトの設定」→「スクリプト プロパティ」に次を追加

| 名前 | 値 |
|---|---|
| `IMPORT_API_URL` | `https://my-app-gllz.vercel.app/api/drive-import/session` |
| `IMPORT_SECRET` | Vercelの `DRIVE_IMPORT_SECRET` と同じ値 |
| `SOURCE_FOLDER_ID` | 取込待ちフォルダーID |
| `PROCESSED_FOLDER_ID` | 処理済みフォルダーID |

4. `importDrivePdfs` を手動実行してGoogle Drive・外部通信の権限を許可
5. 正常に動いたら `installImportTrigger` を1回実行

## 5. アプリ側

PDFフォルダーの「クラウド保管」を有効にし、`PDF_APP_UID` と同じFirebaseユーザーでログインします。

アプリは次のタイミングで受信箱を確認します。

- アプリ起動時
- アプリを再表示した時
- オンラインへ復帰した時
- アプリを開いたままの場合は5分ごと

初回取り込み時に、ルート直下へ `00_受信` フォルダーが自動作成されます。

## 制限

- 1ファイル49MBまで
- GASの1回の実行で最大10件
- 同じDriveファイルID・同じ更新日時は重複送信しない
- アプリへの登録やクラウド保管に失敗した場合、一時受信箱を削除せず次回再試行する
