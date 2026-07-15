import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
import { CERTS } from './data/certs.js';
import { state } from './state.js';

/* =========================================================================
   学習経験値の初期同期

   Firestore では users/{uid}.certs に全資格の保存済みデータが入っている。
   従来は db.js が state.cloudData に全件を保持しても、localStorage へ反映するのは
   現在開いている資格だけだったため、ログイン直後の総合BPが0になっていた。

   このモジュールは次の2点を共通化する。
   1. cloudData が更新されるたび、CERTS に登録された全資格を絶対値で反映する
   2. ログイン直後の初回同期が終わるまで authReady を開放せず、読み込み画面を保つ

   加算処理は行わず保存済みの絶対値を上書きするため、資格画面を開いても
   経験値が二重加算されない。
   ========================================================================= */

const ACTIVE_LEARNING_UID_KEY = "learning_data_uid";
const READY_EVENT = "learning-data-ready";
const FALLBACK_WAIT_MS = 10000;

let authReadyValue = !!state.authReady;
let firebaseAuthResolved = !!state.authReady;
let cloudDataValue = state.cloudData;
let currentUserIdValue = state.currentUserId;
let preparedUid = null;
let readyUid = null;
let syncingUid = null;
let syncGeneration = 0;
let fallbackTimer = null;

function certStorageKey(certId, name){
  return `cert_${certId}_${name}`;
}

function clearCertLocalData(cert){
  localStorage.removeItem(certStorageKey(cert.id, "bp"));
  localStorage.removeItem(certStorageKey(cert.id, "wrong"));
  localStorage.removeItem(certStorageKey(cert.id, "history"));
}

function clearAllCertLocalData(){
  try{ CERTS.forEach(clearCertLocalData); }catch(e){}
}

function normalizeBp(value){
  const bp = parseInt(value, 10);
  return Number.isFinite(bp) && bp >= 0 ? bp : 0;
}

function hydrateAllCerts(certs){
  const source = certs && typeof certs === "object" ? certs : {};
  try{
    CERTS.forEach(cert => {
      const data = source[cert.id];
      if(!data || typeof data !== "object"){
        clearCertLocalData(cert);
        return;
      }

      if(data.bp !== undefined) localStorage.setItem(certStorageKey(cert.id, "bp"), String(normalizeBp(data.bp)));
      else localStorage.removeItem(certStorageKey(cert.id, "bp"));

      if(data.wrong !== undefined){
        const wrong = Array.isArray(data.wrong) ? [...new Set(data.wrong)] : [];
        localStorage.setItem(certStorageKey(cert.id, "wrong"), JSON.stringify(wrong));
      }else localStorage.removeItem(certStorageKey(cert.id, "wrong"));

      if(data.history !== undefined){
        const history = Array.isArray(data.history) ? data.history : [];
        localStorage.setItem(certStorageKey(cert.id, "history"), JSON.stringify(history));
      }else localStorage.removeItem(certStorageKey(cert.id, "history"));
    });
  }catch(e){
    console.error("Learning data hydration failed:", e);
  }
}

function dispatchReady(){
  queueMicrotask(() => window.dispatchEvent(new CustomEvent(READY_EVENT)));
}

function releaseAuthGate(uid){
  if(uid && state.currentUserId !== uid) return;
  readyUid = uid || null;
  syncingUid = null;
  authReadyValue = true;
  clearTimeout(fallbackTimer);
  fallbackTimer = null;
  dispatchReady();
}

function prepareIdentity(uid){
  if(!uid || preparedUid === uid) return;

  preparedUid = uid;
  readyUid = null;
  syncingUid = null;
  authReadyValue = false;
  cloudDataValue = null;
  syncGeneration++;
  clearTimeout(fallbackTimer);
  fallbackTimer = null;

  try{
    const previousUid = localStorage.getItem(ACTIVE_LEARNING_UID_KEY);
    if(previousUid && previousUid !== uid) clearAllCertLocalData();
    localStorage.setItem(ACTIVE_LEARNING_UID_KEY, uid);
  }catch(e){}
}

function legacyCerts(data){
  if(!data || data.bp === undefined) return null;
  return {
    az900: {
      bp: data.bp,
      wrong: data.wrong || [],
      history: data.history || []
    }
  };
}

async function syncInitialLearningData(uid){
  if(!uid || syncingUid === uid || readyUid === uid || !state.db) return;
  prepareIdentity(uid);
  syncingUid = uid;
  const generation = syncGeneration;

  fallbackTimer = setTimeout(() => {
    if(generation !== syncGeneration || state.currentUserId !== uid || readyUid === uid) return;
    console.warn("Learning data sync timed out; using the local cache.");
    releaseAuthGate(uid);
  }, FALLBACK_WAIT_MS);

  try{
    const snap = await getDoc(doc(state.db, "users", uid));
    if(generation !== syncGeneration || state.currentUserId !== uid) return;

    // onSnapshot が先に最新データを反映済みなら、後から返った getDoc で上書きしない。
    if(readyUid === uid && cloudDataValue !== null) return;

    if(snap.exists()){
      const data = snap.data() || {};
      if(data.certs && typeof data.certs === "object"){
        state.cloudData = data.certs;
        return;
      }
      const migrated = legacyCerts(data);
      if(migrated){
        state.cloudData = migrated;
        return;
      }
    }

    // 新規アカウントは既存の seedCloudFromLocal() が端末内データを初期投入する。
    // ここで空データを上書きせず、現在のローカル値をそのまま初期表示に使う。
    cloudDataValue = {};
    releaseAuthGate(uid);
  }catch(e){
    if(generation !== syncGeneration || state.currentUserId !== uid) return;
    console.error("Initial learning data sync failed:", e);
    // Firestore のリアルタイム購読が後から成功する可能性があるため、タイムアウト
    // までは読み込み画面を維持する。
    syncingUid = null;
  }
}

function resolveAuthGate(){
  if(!firebaseAuthResolved) return;
  const uid = state.currentUserId || null;
  if(!uid){
    authReadyValue = true;
    dispatchReady();
    return;
  }

  prepareIdentity(uid);
  if(readyUid === uid){
    authReadyValue = true;
    return;
  }

  authReadyValue = false;
  syncInitialLearningData(uid);
}

// db.js が authReady=true を設定しても、ログインユーザーの全資格データを
// 読み終えるまでは false を返し、既存の renderLoading() を表示させる。
Object.defineProperty(state, "authReady", {
  configurable: true,
  enumerable: true,
  get(){ return authReadyValue; },
  set(value){
    if(!value){
      authReadyValue = false;
      return;
    }
    firebaseAuthResolved = true;
    queueMicrotask(resolveAuthGate);
  }
});

// db.js の onSnapshot が state.cloudData に全資格データを入れた瞬間に、
// 選択中資格だけでなく全資格をローカルへ絶対値で同期する。
Object.defineProperty(state, "cloudData", {
  configurable: true,
  enumerable: true,
  get(){ return cloudDataValue; },
  set(value){
    cloudDataValue = value;
    const uid = state.currentUserId || null;
    if(!uid || !value || typeof value !== "object") return;

    const wasReady = readyUid === uid;
    hydrateAllCerts(value);
    readyUid = uid;
    syncingUid = null;
    authReadyValue = true;
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
    if(!wasReady) dispatchReady();
  }
});

// db.js がログインユーザーIDを切り替えた瞬間に同期を開始する。
// ポーリングを使わないため、待ち時間や常時実行の負荷を増やさない。
Object.defineProperty(state, "currentUserId", {
  configurable: true,
  enumerable: true,
  get(){ return currentUserIdValue; },
  set(value){
    const uid = value || null;
    const changed = currentUserIdValue !== uid;
    currentUserIdValue = uid;

    if(!uid){
      if(changed || preparedUid !== null){
        preparedUid = null;
        readyUid = null;
        syncingUid = null;
        cloudDataValue = null;
        syncGeneration++;
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      if(firebaseAuthResolved){
        authReadyValue = true;
        dispatchReady();
      }
      return;
    }

    prepareIdentity(uid);
    if(state.db && readyUid !== uid) syncInitialLearningData(uid);
  }
});
