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
};

/** 仕様どおりの「Blob を含む PDF レコード」。読み書きの境界で組み立てる。 */
export type PdfFile = PdfFileMeta & { blob: Blob };

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
};

export const DEFAULT_SETTINGS: Settings = {
  viewMode: 'list',
  sortKey: 'name',
  foldersFirst: true,
  theme: 'system',
  trashRetentionDays: 30,
  onboardingDone: false,
  schemaVersion: 1,
};

/** 一覧に並べるための共通表現。 */
export type ExplorerItem =
  | { kind: 'folder'; folder: Folder }
  | { kind: 'file'; file: PdfFileMeta };

/** 同名ファイルが存在したときのユーザー選択。 */
export type DuplicateResolution = 'overwrite' | 'rename' | 'cancel';
