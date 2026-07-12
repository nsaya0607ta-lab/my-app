/* =========================================================================
   PlaygroundState — Linux プレイグラウンドの状態を持つ「合成ルート」。
   vfs（仮想FS）・shellState（環境変数/alias/プロセス表）・history（コマンド
   履歴）・missionProgress（ミッション進捗）の4つのシングルトンをまとめて
   持ち、丸ごとのリセット・Firestore保存用のシリアライズ／復元を担当する。

   screen.js（UI）と cloudSync.js（Firestore同期）は、どちらもこのモジュール
   が公開するインスタンス・関数だけを使い、お互いのことを知らない。
   ========================================================================= */
import { VirtualFileSystem } from './vfs.js';
import { ShellState } from './shellState.js';
import { HistoryManager } from './historyManager.js';
import { MissionProgress } from './missionProgress.js';

export const vfs = new VirtualFileSystem();
export const shellState = new ShellState();
export const history = new HistoryManager();
export const missionProgress = new MissionProgress();

export function resetAll(){
  vfs.reset();
  shellState.reset();
  history.reset();
  missionProgress.reset();
}

// Firestoreの users/{uid}.playground へ保存できる、プレーンなJSONに変換する
export function serialize(){
  return {
    vfs: vfs.toJSON(),
    shell: shellState.toJSON(),
    history: history.toJSON(),
    missions: missionProgress.toJSON(),
  };
}

// serialize()で保存したデータから状態を復元する。壊れた/空のデータは
// 無視され、既に持っている状態はそのまま維持される
export function restore(data){
  if(!data || typeof data !== "object") return false;
  let restoredVfs = false;
  if(data.vfs) restoredVfs = vfs.loadFromJSON(data.vfs);
  if(data.shell) shellState.loadFromJSON(data.shell);
  if(data.history) history.loadFromJSON(data.history);
  if(data.missions) missionProgress.loadFromJSON(data.missions);
  return restoredVfs;
}
