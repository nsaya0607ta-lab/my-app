/* =========================================================================
   Linux プレイグラウンド全体で共有する固定値（ユーザー名・ホスト名など）。
   vfs.js / shellState.js / 各コマンドファイルから参照される。
   ========================================================================= */

export const USER = "student";
export const GROUP = "student";
export const UID = 1000;
export const GID = 1000;
export const HOSTNAME = "linux-playground";
export const KERNEL = "6.8.0-45-generic";
