# PDFフォルダー（スマートフォン向け PDF フォルダー管理アプリ）

iPhone・Android のブラウザー／ホーム画面アプリ（PWA）で、**パソコンのエクスプローラーと同じ感覚で PDF をフォルダー管理**できるアプリです。

- フォルダー階層（サブフォルダー・パンくずリスト・上へ／最上位へ／前へ戻る）
- PDF の追加（複数一括／共有メニュー／カメラでスキャン／画像から作成）
- 移動・コピー・名前変更・削除（ごみ箱経由）・お気に入り・タグ・メモ・重要度
- 全画面 PDF ビューアー（拡大縮小・ページ移動・ページ番号）
- 全体検索（ファイル名／フォルダー名／タグ／メモ／保存日／更新日）
- 一覧・グリッド・サムネイルの 3 表示、7 種類の並べ替え
- ごみ箱（30日で自動削除）・バックアップ／復元
- オフライン起動・ダークモード・iPhone のセーフエリア対応

データは端末内の **IndexedDB** に保存されます。サーバーへは一切送信されません。

---

## 1. 作成したファイル一覧

```
pdf-manager/
├── package.json                     依存関係とスクリプト
├── next.config.mjs                  Next.js 設定（pdf.js 用の alias、SW のキャッシュ制御ヘッダー）
├── tsconfig.json                    TypeScript 設定
├── tailwind.config.ts               配色（白・グレー・青／フォルダー黄／PDF赤）、44px タップ領域など
├── postcss.config.mjs               Tailwind / autoprefixer
├── vercel.json                      Vercel 用のビルド設定とヘッダー
├── .gitignore
├── README.md                        このファイル
│
├── scripts/
│   ├── prepare-assets.mjs           ビルド前にアイコン・スプラッシュ・pdf.js worker を生成
│   └── lib/png.mjs                  依存なしの PNG エンコーダ／簡易ラスタライザ
│
├── public/
│   ├── manifest.webmanifest         PWA マニフェスト（standalone / share_target / file_handlers）
│   ├── sw.js                        Service Worker（オフライン起動＋共有メニュー受け取り）
│   ├── icons/                       ★ビルド時に自動生成（64〜512px, maskable, favicon）
│   ├── splash/                      ★ビルド時に自動生成（iOS 用スプラッシュ 14 サイズ）
│   └── pdf.worker.min.mjs           ★ビルド時に node_modules からコピー
│
├── src/app/
│   ├── layout.tsx                   メタデータ、Apple スプラッシュ、テーマのちらつき防止
│   ├── page.tsx                     エントリーポイント
│   └── globals.css                  Tailwind ベース、セーフエリア変数、共通クラス
│
├── src/lib/                         ドメインロジック（UI 非依存）
│   ├── types.ts                     Folder / PdfFile / Settings などの型定義
│   ├── db.ts                        IndexedDB の薄いラッパー（ストア定義・トランザクション）
│   ├── repository.ts                すべてのデータ操作（作成・移動・コピー・ごみ箱・復元…）
│   ├── tree.ts                      階層計算（パンくず・子要素・並べ替え・PDF数集計）
│   ├── search.ts                    全体検索（将来の全文検索を足せる構造）
│   ├── naming.ts                    ファイル名の正規化と自動採番「手順書 (2).pdf」
│   ├── format.ts                    サイズ・日時・中央省略などの表示整形
│   ├── errors.ts                    日本語エラーメッセージの一元管理
│   ├── pdf.ts                       pdf.js ラッパー（ページ数取得・サムネイル・描画）
│   ├── imageToPdf.ts                画像 → PDF（pdf-lib）
│   ├── device.ts                    共有・保存・印刷・クリップボード・振動
│   ├── backup.ts                    バックアップ ZIP の書き出し／読み込み
│   └── shareTarget.ts               共有メニューから届いた PDF の回収
│
├── src/store/
│   └── AppStore.tsx                 アプリ全体の状態（React Context）
│
└── src/components/
    ├── AppShell.tsx                 画面切替・ダイアログ制御・取り込み処理・下部ナビ
    ├── Onboarding.tsx               初回起動チュートリアル（5ステップ）
    ├── useLongPress.ts              長押し検出（スクロールと両立）
    ├── ui/
    │   ├── Primitives.tsx           Button / IconButton / Switch / EmptyState など
    │   ├── Sheet.tsx                ボトムシート・ダイアログ・メニュー行
    │   └── FileIcons.tsx            黄色いフォルダーアイコン／赤い PDF アイコン
    ├── items/
    │   ├── ItemViews.tsx            一覧行・グリッドセル・サムネイルセル・フォルダーカード
    │   └── ItemList.tsx             表示形式の切り替え
    ├── views/
    │   ├── Header.tsx               ノッチ対応の固定ヘッダー
    │   ├── HomeView.tsx             ホーム（最上位フォルダー＋クイックアクセス）
    │   ├── FolderView.tsx           フォルダー画面（パンくず・フォルダー内検索・FAB）
    │   ├── CollectionViews.tsx      最近使った項目 / お気に入り / ごみ箱
    │   ├── SearchView.tsx           全体検索（詳細条件つき）
    │   └── SettingsView.tsx         設定（表示・ごみ箱・バックアップ・全削除）
    ├── dialogs/
    │   ├── FolderPicker.tsx         移動先・保存先のツリー選択「ここに移動」
    │   ├── ItemMenu.tsx             長押し／「…」の操作メニュー
    │   ├── CommonDialogs.tsx        名前入力・確認・同名確認・並べ替え・色・タグ／メモ・詳細
    │   └── ScanSheet.tsx            カメラ撮影／画像選択 → PDF 作成
    └── viewer/
        └── PdfViewer.tsx            全画面 PDF ビューアー
```

★印のファイルは `npm run build` / `npm run dev` のたびに `scripts/prepare-assets.mjs` が生成するため、Git には含めていません。

---

## 2. アプリの起動方法

Node.js 20 以上が必要です。

```bash
cd pdf-manager
npm install
npm run dev
```

ブラウザーで <http://localhost:3000> を開きます。

### 実機（スマートフォン）で確認する

Service Worker と共有機能は `https://` または `localhost` でのみ動作します。実機で試すときは Vercel にデプロイしたURL（https）を使うのが確実です。

同じ Wi-Fi 内で試す場合は次のようにします（一部機能は https でないと動作しません）。

```bash
npm run dev -- -H 0.0.0.0
# スマートフォンから http://<PCのIPアドレス>:3000 を開く
```

### 本番ビルドの確認

```bash
npm run build
npm start
```

### 型チェック

```bash
npm run typecheck
```

---

## 3. Vercel への公開方法

このアプリは **リポジトリ内のサブディレクトリ `pdf-manager/`** にある独立した Next.js プロジェクトです。
リポジトリのルートは既存の静的サイトなので、**新しい Vercel プロジェクトを作り、Root Directory に `pdf-manager` を指定**してください。

### 方法A：Vercel のダッシュボードから（推奨）

1. <https://vercel.com/new> を開き、このリポジトリ（`nsaya0607ta-lab/my-app`）を選択
2. **Root Directory** に `pdf-manager` を指定（これが最重要）
3. Framework Preset は `Next.js`（自動検出されます）
4. Build Command / Install Command は `vercel.json` の設定がそのまま使われるので変更不要
5. 環境変数は不要
6. **Deploy** を押す

以降、このブランチへ push するたびに自動でデプロイされます。

### 方法B：Vercel CLI から

```bash
npm i -g vercel
cd pdf-manager
vercel          # プレビュー環境へデプロイ
vercel --prod   # 本番環境へデプロイ
```

（CLI の場合、`pdf-manager` ディレクトリの中で実行すればそこがルートとして扱われます。）

### デプロイ後の確認ポイント

- `https://<your-app>.vercel.app/manifest.webmanifest` が JSON で表示される
- `https://<your-app>.vercel.app/sw.js` が JavaScript で表示される
- Chrome のアドレスバーに「インストール」アイコンが出る

---

## 4. iPhone でホーム画面に追加する方法

1. **Safari** で公開URL（`https://...`）を開きます（Chrome アプリからは追加できません）
2. 画面下部の **共有ボタン**（□に↑のアイコン）をタップ
3. メニューを下にスクロールして **「ホーム画面に追加」** をタップ
4. 名前（PDFフォルダー）を確認して **「追加」** をタップ
5. ホーム画面のアイコンから起動すると、Safari のバーが出ない全画面（standalone）で開きます

追加後は機内モードでも起動できます（オフライン対応）。

---

## 5. Android でインストールする方法

1. **Chrome** で公開URLを開きます
2. 画面下部に表示される **「アプリをインストール」** のバナーをタップ
   - バナーが出ない場合は、右上の **︙**（メニュー）→ **「アプリをインストール」** または **「ホーム画面に追加」**
3. **「インストール」** をタップ
4. アプリ一覧／ホーム画面にアイコンが追加されます

インストール後は、**他のアプリの共有メニューに「PDFフォルダー」が表示される**ようになり、PDF を直接このアプリへ送って保存先フォルダーを選べます。

---

## 6. 現時点での制限事項

### スマートフォン OS による制限（Web アプリ共通）

- **端末内の実フォルダーを直接読み書きすることはできません。** そのため、アプリ内に独自のフォルダー構造を作る方式にしています。「仕事」フォルダーは端末のストレージ上のフォルダーではなく、アプリ内の論理フォルダーです。
- **PDF の読み込み**は、必ず OS のファイル選択画面（または共有メニュー）を経由します。
- **PDF の書き出し**は、共有シートまたはダウンロードのみです。任意のフォルダーへ直接書き出すことはできません。
  - iPhone：共有シートの「ファイルに保存」を使います
  - Android：ダウンロードフォルダーへの保存、または共有先アプリの選択になります

### iOS / iPadOS 固有

- **共有メニューからの直接追加（Web Share Target）に Safari は未対応**です。SafariやChromeで開いたPDFを追加したい場合は、いったん「ファイル」アプリに保存してから、アプリ内の「PDFを追加」で選択してください。アプリ内でもこの案内を表示しています。
- **印刷**は、iOS Safari が iframe 内 PDF の印刷を許可しないため、新しいタブで開いて OS の共有メニューから印刷する動作になります。
- ホーム画面アプリの保存領域は、**長期間まったく起動しないと OS に削除される可能性があります**。大切な PDF は設定画面からバックアップを取ってください。

### 保存容量

- 保存できる容量はブラウザーの割り当て（多くの端末で数百MB〜数GB）に依存します。設定画面の「データ使用量」で現在値と目安を確認できます。
- 容量が足りない場合は日本語のメッセージを表示し、書き込みは中断されます。

### 機能面

- **PDF 本文の全文検索・OCR は未実装**です（検索対象はファイル名・フォルダー名・タグ・メモ・日付）。`src/lib/search.ts` に判定を足せば拡張できる構造にしています。
- **長押しドラッグによる移動は未実装**です。長押し／「…」→「別のフォルダーへ移動」→ ツリーから選んで「ここに移動」の手順に統一しています（スマートフォンでの誤操作を避けるため）。
- **手動並べ替え**は並べ替えキーとして選択でき、`sortOrder` の保存にも対応していますが、ドラッグで順序を入れ替える UI は未実装です。
- **クラウド同期・ログイン・複数端末同期は未実装**です（下記の方針で追加できます）。
- PDF への書き込み（マーカー・メモ書き）、ページ並べ替え、結合・分割は未実装です。
- サムネイルは 1 ページ目のみ生成します。非常に大きな PDF では生成に時間がかかることがあります。

---

## 7. 今後クラウド同期を追加する場合の実装方針

現在の構造は、**UI → `repository.ts` → `db.ts`（IndexedDB）** の一方向で、UI から IndexedDB を直接触っている箇所はありません。この境界をそのまま同期の差し込み口として使えます。

### ステップ1：同期用のメタ情報を足す

`src/lib/types.ts` の `Folder` / `PdfFileMeta` に次を追加します。既存レコードは省略可（optional）にしておけばマイグレーション不要です。

```ts
type SyncMeta = {
  remoteId?: string;      // クラウド側のID
  revision?: number;      // 競合検出用のリビジョン
  syncState?: 'synced' | 'pending' | 'conflict';
  deleted?: boolean;      // 論理削除（既存の deletedAt と併用）
};
```

すべてのレコードがすでに `updatedAt`（ISO文字列）を持っているので、**「updatedAt が新しい方を採用する」Last-Write-Wins** から始めるのが簡単です。

### ステップ2：同期キューを追加する

`db.ts` の `STORE` に `sync_queue` を足し、`repository.ts` の各書き込み関数の最後で「変更内容をキューに積む」処理を呼びます。書き込み口が `putFolder` / `putFile` などに集約されているため、変更は数箇所で済みます。

```ts
// repository.ts の書き込みヘルパーに1行足すイメージ
async function putFile(file: PdfFileMeta) {
  await tx(STORE.files, 'readwrite', async (t) => {
    await idb.put(t.objectStore(STORE.files), file);
  });
  await enqueueSync({ type: 'file', id: file.id, op: 'upsert', updatedAt: file.updatedAt });
}
```

### ステップ3：同期アダプターのインターフェースを定義する

保存先ごとに実装を差し替えられるよう、共通のインターフェースを用意します。

```ts
// src/lib/sync/adapter.ts
export interface SyncAdapter {
  name: string;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  pull(since?: string): Promise<{ folders: Folder[]; files: PdfFileMeta[] }>;
  push(changes: SyncChange[]): Promise<void>;
  uploadBlob(id: string, blob: Blob): Promise<string>;
  downloadBlob(remoteId: string): Promise<Blob>;
}
```

- **Supabase**：`folders` / `files` テーブル ＋ Storage バケット。Row Level Security で `user_id` を条件にすれば、そのまま共有フォルダー機能にも発展できます。Realtime を使えば複数端末の即時同期も可能です。
- **Google Drive / OneDrive**：アプリ専用フォルダー（appDataFolder 等）に `backup.json` 相当のメタと PDF 本体を置く方式。OAuth のリダイレクトが必要です。
- **iCloud**：Web からは直接扱えないため、iOS の「ファイル」アプリ経由の手動バックアップで代替します（現状の実装がこれにあたります）。

### ステップ4：同期の流れ

```
起動時 / フォアグラウンド復帰時 / 手動更新時
  1. pull(since = 最後に同期した時刻)
  2. ローカルとマージ（updatedAt が新しい方を採用、削除は deletedAt で判定）
  3. sync_queue に溜まった変更を push
  4. PDF 本体は「メタが同期できたものだけ」遅延アップロード
```

PDF 本体（Blob）はメタデータと分けて `blobs` ストアに保存済みなので、**「メタは即時同期、本体は Wi-Fi 接続時のみ同期」** といった制御も追加しやすい構造になっています。

### ステップ5：UI 側

`src/store/AppStore.tsx` に `syncState`（同期中／エラー／最終同期時刻）を足し、設定画面にアカウント欄と「今すぐ同期」ボタンを追加します。`repository.ts` の関数シグネチャを変えなければ、各画面のコードは変更不要です。

### 補足：バックアップ形式の互換性

`src/lib/backup.ts` が書き出す ZIP（`backup.json` ＋ `files/<id>.pdf`）は、そのままクラウドへの初回アップロード形式としても使えます。クラウド同期を入れる前でも、この ZIP で端末の引っ越しができます。

---

## 8. 毎朝の学習レポートの自動取り込み

毎朝5時に GitHub Actions が「前日の学習の振り返り」PDF を生成し、`public/daily/` へコミットします。
アプリは起動時に `/daily/index.json` を読み、まだ取り込んでいないレポートを指定フォルダーへ自動で追加します。

```
[GitHub Actions] cron '0 20 * * *' (UTC) = JST 5:00
   ↓ Firestore から前日の学習履歴を取得
   ↓ Gemini でレポートを生成（構造化JSON）
   ↓ HTML + CSS → Puppeteer で PDF 化
   ↓ pdf-manager/public/daily/ へコミット
[Vercel] 自動再デプロイ
[アプリ] 起動時に index.json を確認 → 未取り込み分を指定フォルダーへ追加
```

バックエンドを持たない構成のため、**登録されるのは「アプリを次に開いたとき」**です。5時ちょうどに端末内へ書き込むことはできません。

### 使いはじめる手順

1. アプリの「設定」→「毎朝の学習レポート」で **自動で取り込む** をオンにする
2. 同じ画面で **取り込み先フォルダー** を選ぶ（未設定のあいだは取り込みません）

取り込み済みのレポートは設定内の `importedReports` に記録され、再起動しても二重に追加されません。

### リポジトリ側の準備

GitHub リポジトリの Secrets に次を登録してください（`GEMINI_API_KEY` 以下3つは Vercel と同じ値）。

| Secret | 用途 |
| --- | --- |
| `GEMINI_API_KEY` | レポート本文の生成 |
| `FIREBASE_PROJECT_ID` | 学習履歴の読み取り |
| `FIREBASE_CLIENT_EMAIL` | 同上 |
| `FIREBASE_PRIVATE_KEY` | 同上 |
| `LEARNING_UID` | 対象ユーザーの Firebase UID |

### ローカルでの確認

```bash
# API を使わずサンプルデータで PDF と HTML を生成（デザイン調整用）
npm run daily-report:dry-run --prefix ..

# 生成物がアプリへ取り込まれるかを実ブラウザーで検証
npm run dev                              # 別ターミナルで起動しておく
npm run daily-report:verify-import --prefix ..
```

### 注意点

- **フォントは Noto Sans JP になります。** 「游ゴシック」は Microsoft / Apple のライセンスフォントで Linux ランナーには置けないためです。Windows / macOS 上でローカル生成した場合のみ游ゴシックが使われます。
- PDF は `public/` 配下に置かれるため、**URL を知っていれば第三者もアクセスできます。**
- 保持期間は60日です。それより古い PDF はワークフローが自動で削除します。
- GitHub Actions のスケジュールは混雑時に5〜60分ほど遅れます。時刻を厳密にしたい場合は Cloud Scheduler から `workflow_dispatch` を叩く形に変更してください。

---

## 補足：エラーメッセージ

次の状況では日本語のメッセージを表示します（`src/lib/errors.ts` に集約）。

| 状況 | メッセージ |
| --- | --- |
| PDF 以外を選択 | PDF以外のファイルは追加できません。拡張子が .pdf のファイルを選択してください。 |
| 保存容量不足 | 端末の保存容量が不足しているため保存できませんでした。… |
| PDF 読み込み失敗 | PDFの読み込みに失敗しました。ファイルが壊れている可能性があります。 |
| 共有失敗 | PDFの共有に失敗しました。時間をおいて、もう一度お試しください。 |
| 同名ファイル | 上書き／別名で保存／キャンセル をダイアログで選択（複数件は「残りにも適用」可） |
| フォルダー名未入力 | フォルダー名を入力してください。 |
| 削除失敗 | 削除に失敗しました。もう一度お試しください。 |
| IndexedDB 不可 | この環境ではデータを保存できません（IndexedDBが利用できません）。… |
