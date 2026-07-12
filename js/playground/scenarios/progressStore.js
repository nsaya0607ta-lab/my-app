/* =========================================================================
   💾 シナリオモードの進捗保存（mindpalette.js・gcalと同じ方式）
   保存構造: { cleared:[scenarioId...], inProgress:{ [scenarioId]:{
     doneSteps:[stepId...], snapshot:{vfs,shell}, history:[cmd...], updatedAt } } }
   ログイン中はFirestoreの users/{uid}.scenarioMode へも同期し、ブラウザを
   閉じても・別端末でも続きから再開できるようにする。未ログイン（ゲスト）
   時はこの端末のlocalStorageのみで完結する。
   ========================================================================= */
import { state } from '../../state.js';

function storeKey(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `scenarioMode_v1::${uid}`;
}

function normalize(raw){
  const base = { cleared: [], inProgress: {} };
  if(!raw || typeof raw !== "object") return base;
  if(Array.isArray(raw.cleared)) base.cleared = raw.cleared.filter(id => typeof id === "string");
  if(raw.inProgress && typeof raw.inProgress === "object" && !Array.isArray(raw.inProgress)) base.inProgress = raw.inProgress;
  return base;
}

let cache = null;
let identityToken;

function load(){
  if(cache) return cache;
  try{ cache = normalize(JSON.parse(localStorage.getItem(storeKey()) || "null")); }
  catch(e){ cache = normalize(null); }
  return cache;
}

function persistLocal(){
  try{ localStorage.setItem(storeKey(), JSON.stringify(cache)); }catch(e){}
}

// Firestoreの users/{uid}.scenarioMode へ同期する（gcal・mindPaletteと同じ方式）
function syncToCloud(){
  if(!state.db || !state.currentUserId || !window.FirebaseSync) return;
  try{
    window.FirebaseSync.setDoc(window.FirebaseSync.doc(state.db, "users", state.currentUserId), {
      scenarioMode: cache,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }catch(e){ console.error("scenario mode cloud sync failed:", e); }
}

function save(){
  persistLocal();
  syncToCloud();
}

export function isScenarioCleared(id){ return load().cleared.includes(id); }
export function clearedScenarioIds(){ return load().cleared.slice(); }
export function getScenarioInProgress(id){ return load().inProgress[id] || null; }
export function hasAnyProgress(id){ return isScenarioCleared(id) || !!getScenarioInProgress(id); }

// 途中経過（達成済みステップ・現在のLinux環境・コマンド履歴）を保存する
export function saveScenarioProgress(id, { doneSteps, snapshot, history }){
  const st = load();
  st.inProgress[id] = { doneSteps: doneSteps || [], snapshot: snapshot || null, history: (history || []).slice(-100), updatedAt: Date.now() };
  save();
}

// 全ステップ達成 → クリア済みへ移す（以後は「途中経過」を持たず、再挑戦時は最初から始まる）
export function markScenarioCleared(id){
  const st = load();
  if(!st.cleared.includes(id)) st.cleared.push(id);
  delete st.inProgress[id];
  save();
}

// 新規アカウント作成時、この端末のローカル進捗をクラウドへ初期投入するために使う
export function scenarioModeExportRaw(){ return load(); }

// クラウド（Firestoreの users/{uid}.scenarioMode）から届いたデータをこの端末へ反映する。
// db.jsのonSnapshotから呼ばれる。save()経由だとsyncToCloud()が再度走り無限ループになる
// ため、mindpalette.js・gcalと同様ここでは直接cache/localStorageへ書き込む
export function scenarioModeApplyCloud(data){
  if(!data || typeof data !== "object") return false;
  cache = normalize(JSON.parse(JSON.stringify(data)));
  persistLocal();
  return true;
}

// ログインユーザーが切り替わったら、前のユーザーの進捗が一瞬でも見えないよう
// キャッシュを破棄して読み直す（mindpalette.js・skin等と同じ方式）
export function scenarioModeHandleIdentityChange(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  if(identityToken === uid) return;
  const isFirstRun = identityToken === undefined;
  identityToken = uid;
  if(isFirstRun) return;
  cache = null;
}
