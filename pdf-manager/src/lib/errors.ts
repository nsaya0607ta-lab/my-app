/** ユーザーに日本語で提示するためのアプリ内エラー。 */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly detail?: string;

  constructor(code: AppErrorCode, detail?: string) {
    super(ERROR_MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
    this.detail = detail;
  }
}

export type AppErrorCode =
  | 'NOT_PDF'
  | 'QUOTA_EXCEEDED'
  | 'PDF_READ_FAILED'
  | 'SHARE_FAILED'
  | 'DUPLICATE_NAME'
  | 'EMPTY_FOLDER_NAME'
  | 'EMPTY_FILE_NAME'
  | 'DELETE_FAILED'
  | 'INDEXEDDB_UNAVAILABLE'
  | 'NOT_FOUND'
  | 'INVALID_MOVE'
  | 'BACKUP_FAILED'
  | 'RESTORE_FAILED'
  | 'IMAGE_CONVERT_FAILED'
  | 'PRINT_FAILED'
  | 'UNKNOWN';

export const ERROR_MESSAGES: Record<AppErrorCode, string> = {
  NOT_PDF: 'PDF以外のファイルは追加できません。拡張子が .pdf のファイルを選択してください。',
  QUOTA_EXCEEDED:
    '端末の保存容量が不足しているため保存できませんでした。不要なPDFを削除するか、ごみ箱を空にしてください。',
  PDF_READ_FAILED: 'PDFの読み込みに失敗しました。ファイルが壊れている可能性があります。',
  SHARE_FAILED: 'PDFの共有に失敗しました。時間をおいて、もう一度お試しください。',
  DUPLICATE_NAME: '同じ名前のファイルがすでに存在します。',
  EMPTY_FOLDER_NAME: 'フォルダー名を入力してください。',
  EMPTY_FILE_NAME: 'ファイル名を入力してください。',
  DELETE_FAILED: '削除に失敗しました。もう一度お試しください。',
  INDEXEDDB_UNAVAILABLE:
    'この環境ではデータを保存できません（IndexedDBが利用できません）。プライベートブラウズを解除するか、別のブラウザーでお試しください。',
  NOT_FOUND: '対象が見つかりませんでした。すでに削除された可能性があります。',
  INVALID_MOVE: 'そのフォルダーへは移動できません。自分自身や配下のフォルダーは指定できません。',
  BACKUP_FAILED: 'バックアップの作成に失敗しました。',
  RESTORE_FAILED: 'バックアップファイルを読み込めませんでした。ファイルを確認してください。',
  IMAGE_CONVERT_FAILED: '画像からPDFを作成できませんでした。対応していない画像形式の可能性があります。',
  PRINT_FAILED: '印刷画面を開けませんでした。ポップアップがブロックされていないか確認してください。',
  UNKNOWN: '処理に失敗しました。もう一度お試しください。',
};

/** 任意の例外をユーザー向けメッセージに変換する。 */
export function toMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof DOMException) {
    if (error.name === 'QuotaExceededError') return ERROR_MESSAGES.QUOTA_EXCEEDED;
    if (error.name === 'AbortError') return '';
    if (error.name === 'NotAllowedError') return ERROR_MESSAGES.SHARE_FAILED;
  }
  if (error instanceof Error && error.message) return error.message;
  return ERROR_MESSAGES.UNKNOWN;
}
