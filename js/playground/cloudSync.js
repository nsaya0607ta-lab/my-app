/* =========================================================================
   cloudSync — Linux プレイグラウンドの状態を Firestore（users/{uid}.playground）
   へ保存し、ログイン時に自動で復元するための同期ロジック。
   mindPalette（js/mindpalette.js）と同じ「まず端末で確定させ、裏でクラウドへ
   書き込む」方式に倣うが、以下の点だけ異なる：

   ・ローカルストレージへは一切保存しない（Firestoreだけを正として扱う）。
   ・クラウドからの復元は、ログインごとに最初の1回だけ行う（hydrated）。
     ターミナル入力中に他タブ／自分自身の書き込みechoで画面が丸ごと
     再描画されるとユーザー体験を損なうため、以降のsnapshotは無視する。
     （このプレイグラウンドは単一セッションでの利用を前提とした学習用
     サンドボックスであり、複数タブでのリアルタイム共有は対象外）
   ========================================================================= */
import { state } from '../state.js';
import { missionProgress, restore, resetAll, serialize } from './playgroundState.js';

let identityToken; // 直近に確認した currentUserId（未ログインなら"guest"）
let hydrated = false; // 今のログインセッションで一度でも復元を試みたか
let saveTimer = null;

function canSync(){
  return !!(state.db && state.currentUserId && !state.guestMode && window.FirebaseSync);
}

function pushToCloud(){
  saveTimer = null;
  if(!canSync()) return;
  try{
    window.FirebaseSync.setDoc(window.FirebaseSync.doc(state.db, "users", state.currentUserId), {
      playground: serialize(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }catch(e){ console.error("playground cloud sync failed:", e); }
}

// コマンドを実行するたびに呼ぶ。短時間に連続した操作は1回の書き込みへまとめる
export function pgScheduleSave(){
  if(!canSync()) return;
  missionProgress.touch();
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(pushToCloud, 800);
}

// リセットボタンなど、デバウンスを待たずに即座に保存を確定させたい場面用
export function pgSaveNow(){
  if(saveTimer){ clearTimeout(saveTimer); saveTimer = null; }
  pushToCloud();
}

// db.jsのonSnapshot（users/{uid}ドキュメント全体の購読）から呼ばれる。
// 戻り値: 実際に状態を復元してVFSが変わったら true（screen.js側の再描画判定に使う）
export function pgApplyCloud(data){
  // TEMPORARY DEBUG（原因特定後に削除）
  if(window.__pgDebugLog) window.__pgDebugLog(`[cloudSync] pgApplyCloud呼び出し hydrated=${hydrated}`);
  if(hydrated) return false;
  hydrated = true;
  return restore(data);
}

// ログインユーザーの切り替え（ログイン・ログアウト・別アカウントへの切替）を
// 検知し、前の人の状態が一瞬でも見えないよう既定状態へ戻す。render()のたびに
// 呼ばれる想定（gcal/skin/mindPaletteの各HandleIdentityChangeと同じ方式）
export function pgHandleIdentityChange(){
  const uid = state.currentUserId || "guest";
  if(identityToken === uid) return;
  // TEMPORARY DEBUG（原因特定後に削除）
  if(window.__pgDebugLog) window.__pgDebugLog(`[cloudSync] identity変化検知 ${identityToken} -> ${uid}（hydratedをfalseへリセット）`);
  const isFirstRun = identityToken === undefined;
  identityToken = uid;
  hydrated = false;
  if(saveTimer){ clearTimeout(saveTimer); saveTimer = null; }
  if(!isFirstRun) resetAll();
}
