/**
 * アプリ全体で共有するデータ型。
 * 将来のクラウド同期を見据えて、すべてのレコードに `updatedAt` (ISO 文字列) を持たせ、
 * 差分同期の判定に使えるようにしている。
 */

/** 仮想ルート (「PDFフォルダー」) の ID。 */
export const ROOT_ID = 'root';

/** 初期作成される「未分類」フォルダーの固定 ID。 */
export const UNSORTED_ID = 'folder-unsorted';

export type FolderColor =
  | 'yellow'
  | 'blue'
  | 'green'
  | 'red'
  | 'purple'
  | 'gray';

export type Folder = {
  id: string;
  /** 親フォルダー ID。ルート直下は ROOT_ID。 */
  parentId: string | null;
  name: string;
  color?: FolderColor;
  isFavorite: boolean;
  /** 手動並べ替え用の順序値。 */
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  /** ごみ箱から復元するときの戻し先。 */
  restoreParentId?: string;
};

/** 重要度。0 = 未設定、1〜3 で高くなる。 */
export type Importance = 0 | 1 | 2 | 3;

/**
 * PDF 本体 (Blob) がどこにあるか。
 *
 * - `local`       … 端末内だけにある (既定。クラウド保管を使わない場合は常にこれ)
 * - `uploading`   … クラウドへ送信中。端末内の Blob はまだ残っている
 * - `cloud`       … クラウドに検証済みのコピーがある
 *                   (`localCachedAt` が入っていれば端末内にもキャッシュがある)
 * - `downloading` … クラウドから取得中
 * - `error`       … 直前の処理に失敗した。端末内の Blob は必ず残っている
 *
 * 端末内 Blob を削除するのは「`cloud` へ確定したあと」だけに限定する。
 */
export type StorageState = 'local' | 'uploading' | 'cloud' | 'downloading' | 'error';

/** 旧データ (storageState を持たない PDF) は `local` として扱う。 */
export function storageStateOf(file: Pick<PdfFileMeta, 'storageState'>): StorageState {
  return file.storageState ?? 'local';
}

/** クラウドにコピーがあるか (端末内キャッシュの有無は問わない)。 */
export function isInCloud(file: Pick<PdfFileMeta, 'storageState' | 'cloudPath'>): boolean {
  return storageStateOf(file) === 'cloud' && Boolean(file.cloudPath);
}

/**
 * PDF のメタデータ。
 * 一覧表示のたびに数十 MB の Blob を読み込まないよう、実体 (Blob) は
 * 別のオブジェクトストアに分離して保存する。
 */
export type PdfFileMeta = {
  id: string;
  parentId: string;
  name: string;
  size: number;
  pageCount?: number;
  mimeType: 'application/pdf';
  tags: string[];
  memo?: string;
  importance?: Importance;
  isFavorite: boolean;
  isRead: boolean;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
  deletedAt?: string;
  restoreParentId?: string;
  /** サムネイル生成を試みたか (失敗した PDF を毎回再試行しないため)。 */
  thumbState?: 'none' | 'ready' | 'failed';

  /* --- クラウド保管 (省略時は local 扱い。既存データとの互換性のため任意) --- */
  /** PDF 本体の所在。 */
  storageState?: StorageState;
  /** クラウド上の保存先 (`users/<uid>/pdf-cloud/<fileId>.pdf`)。 */
  cloudPath?: string;
  /** クラウドへの保存が完了し、存在確認まで通った日時。 */
  cloudUploadedAt?: string;
  /** クラウド上の実バイト数 (整合性確認に使う)。 */
  cloudSize?: number;
  /** 直近の失敗理由 (日本語)。成功したら消す。 */
  cloudError?: string;
  /** クラウドから取得した本体を端末へキャッシュした日時。 */
  localCachedAt?: string;
};

/** 仕様どおりの「Blob を含む PDF レコード」。読み書きの境界で組み立てる。 */
export type PdfFile = PdfFileMeta & { blob: Blob };

/* ------------------------------------------------------------------ */
/* PDF ごとのメモ                                                      */
/* ------------------------------------------------------------------ */

/** クラウドへログインしていないときの持ち主 (この端末)。 */
export const LOCAL_OWNER_ID = 'local';

/**
 * PDF に紐付くメモ。
 *
 * 紐付けはファイル名やパスではなく、変更されない `fileId` で行う。
 * そのため PDF を別フォルダーへ移動しても、名前を変更しても、メモは切れない。
 * `pageStart` / `pageEnd` を省略すると「PDF 全体へのメモ」になる。
 */
export type PdfMemo = {
  id: string;
  /** 持ち主。クラウド未ログイン時は LOCAL_OWNER_ID。 */
  userId: string;
  /** 対象 PDF の不変 ID。 */
  fileId: string;
  title?: string;
  content: string;
  /** 対象ページ (1 始まり)。未設定なら PDF 全体へのメモ。 */
  pageStart?: number;
  /** 範囲メモの終了ページ。省略時は pageStart と同じ 1 ページ分。 */
  pageEnd?: number;
  tags: string[];
  isFavorite: boolean;
  /** 復習項目として登録するか。 */
  isReview: boolean;
  /** 入力途中の自動保存 (下書き)。明示的に保存すると false になる。 */
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
};

/** メモ一覧の並べ替え。 */
export type MemoSortKey = 'createdDesc' | 'page' | 'updatedDesc';

export const MEMO_SORT_LABELS: Record<MemoSortKey, string> = {
  createdDesc: '作成日時が新しい順',
  page: 'ページ順',
  updatedDesc: '更新日時が新しい順',
};

export type ViewMode = 'list' | 'grid' | 'thumbnail';

export type SortKey =
  | 'name'
  | 'updatedDesc'
  | 'updatedAsc'
  | 'size'
  | 'type'
  | 'favorite'
  | 'manual';

export type ThemeMode = 'system' | 'light' | 'dark';

export type Settings = {
  viewMode: ViewMode;
  sortKey: SortKey;
  foldersFirst: boolean;
  theme: ThemeMode;
  trashRetentionDays: number;
  onboardingDone: boolean;
  /** データ構造のバージョン (将来のマイグレーション用)。 */
  schemaVersion: number;
  /** 毎朝の学習レポートを自動で取り込むか。 */
  dailyReportEnabled: boolean;
  /** 自動取り込み先フォルダー ID。未設定なら取り込まない。 */
  dailyReportFolderId?: string;
  /** 取り込み済みレポートの ID (日付) 一覧。二重取り込みの防止に使う。 */
  importedReports: string[];

  /* --- メモ --- */
  /** メモ一覧の並べ替え。 */
  memoSortKey: MemoSortKey;

  /* --- PDF 編集のバージョン履歴 --- */
  /** 1 つの PDF につき残す編集前バージョンの数。0 = 保持しない。 */
  versionKeepCount: number;
  /** バージョンを保持する日数。0 = 期限で消さない。 */
  versionKeepDays: number;

  /* --- クラウド保管 --- */
  /**
   * クラウド保管機能を使うか。
   * 既定は OFF。ユーザーが明示的に ON にするまでアップロードは一切行わない。
   */
  cloudEnabled: boolean;
  /** この日数だけ開かれていない PDF を自動でクラウドへ移す。0 = 自動移動しない。 */
  cloudIdleDays: number;
  /** Wi-Fi (非従量制) 接続のときだけアップロードする。 */
  cloudWifiOnly: boolean;
  /** 最後に自動同期を実行した日時。 */
  cloudLastSyncAt?: string;
};

/** 未使用期間の選択肢 (0 = 自動移動しない)。 */
export const CLOUD_IDLE_OPTIONS = [1, 3, 7, 30, 0] as const;

export const DEFAULT_SETTINGS: Settings = {
  viewMode: 'list',
  sortKey: 'name',
  foldersFirst: true,
  theme: 'system',
  trashRetentionDays: 30,
  onboardingDone: false,
  schemaVersion: 1,
  dailyReportEnabled: false,
  importedReports: [],
  memoSortKey: 'page',
  versionKeepCount: 3,
  versionKeepDays: 30,
  cloudEnabled: false,
  cloudIdleDays: 1,
  cloudWifiOnly: true,
};

/** 一覧に並べるための共通表現。 */
export type ExplorerItem =
  | { kind: 'folder'; folder: Folder }
  | { kind: 'file'; file: PdfFileMeta };

/** 同名ファイルが存在したときのユーザー選択。 */
export type DuplicateResolution = 'overwrite' | 'rename' | 'cancel';
