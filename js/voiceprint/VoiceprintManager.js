/* =========================================================================
   VoiceprintManager
   =========================================================================
   声紋登録データ（登録者一覧）の唯一の管理者（データ層）。
   「誰が話したか」を判定するロジック（SpeakerRecognitionService）や、
   画面表示（registrantsUI.js）はこのモジュールに直接依存するだけで、
   保存先がlocalStorageかFirestoreかを意識しなくてよいようにする。

   保存方針は js/render.js の gcal 系実装と同じ「ローカル即時反映＋
   クラウドへ非同期バックアップ」。端末をまたいだ同期は
   users/{uid}.voiceprint.registrants をonSnapshotで購読して行う
   （db.js → render.js の applyCloudVoiceprint 経由）。
   ========================================================================= */
import { state } from '../state.js';

export const MAX_REGISTRANTS = 20;

const STORE_BASE_KEY = "iq_voiceprint_registrants";

let cache = null;      // 現在ログイン中ユーザーの登録者配列（メモリキャッシュ）
let cacheUid;          // cacheがどのユーザー分かを追跡し、ログイン切替時に読み直す

function storageKey() {
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `${STORE_BASE_KEY}::${uid}`;
}

function readFromStorage() {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey()) || "null");
    return Array.isArray(raw) ? raw : [];
  } catch (e) { return []; }
}

function writeToStorage(list) {
  try { localStorage.setItem(storageKey(), JSON.stringify(list)); } catch (e) {}
}

// ユーザー切替（ログイン／ログアウト／別アカウント）を検知してキャッシュを読み直す
function ensureCache() {
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  if (cache === null || cacheUid !== uid) {
    cacheUid = uid;
    cache = readFromStorage();
  }
  return cache;
}

function genId() {
  return "vp" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// アカウント共通データ（users/{uid}）への非同期バックアップ。
// 失敗しても画面操作は継続できるよう例外は握りつぶす（他のsave系と同じ方針）
function syncToCloud() {
  if (!state.db || !state.currentUserId || !window.FirebaseSync) return;
  try {
    window.FirebaseSync.setDoc(
      window.FirebaseSync.doc(state.db, "users", state.currentUserId),
      { voiceprint: { registrants: cache }, updatedAt: new Date().toISOString() },
      { merge: true }
    );
  } catch (e) { console.error("voiceprint cloud sync failed:", e); }
}

export function list() {
  return ensureCache().slice();
}

export function get(id) {
  return ensureCache().find((r) => r.id === id) || null;
}

export function count() {
  return ensureCache().length;
}

export function isFull() {
  return count() >= MAX_REGISTRANTS;
}

// name: 表示名, voiceprint: { vector:number[], sampleRate, duration } （SpeakerRecognitionService.extractVoiceprintの戻り値）
export function add({ name, voiceprint }) {
  const list = ensureCache();
  if (list.length >= MAX_REGISTRANTS) {
    return { ok: false, error: "max-reached" };
  }
  const trimmed = (name || "").trim();
  if (!trimmed) return { ok: false, error: "empty-name" };
  const registrant = {
    id: genId(),
    name: trimmed,
    createdAt: new Date().toISOString(),
    voiceprint: voiceprint || null,
  };
  list.push(registrant);
  writeToStorage(list);
  syncToCloud();
  return { ok: true, registrant };
}

export function updateName(id, name) {
  const list = ensureCache();
  const target = list.find((r) => r.id === id);
  if (!target) return { ok: false, error: "not-found" };
  const trimmed = (name || "").trim();
  if (!trimmed) return { ok: false, error: "empty-name" };
  target.name = trimmed;
  writeToStorage(list);
  syncToCloud();
  return { ok: true, registrant: target };
}

export function updateVoiceprint(id, voiceprint) {
  const list = ensureCache();
  const target = list.find((r) => r.id === id);
  if (!target) return { ok: false, error: "not-found" };
  target.voiceprint = voiceprint || null;
  writeToStorage(list);
  syncToCloud();
  return { ok: true, registrant: target };
}

export function remove(id) {
  const list = ensureCache();
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) return { ok: false, error: "not-found" };
  list.splice(idx, 1);
  writeToStorage(list);
  syncToCloud();
  return { ok: true };
}

// db.jsのonSnapshotから届いたクラウド側の登録者一覧をこの端末へ反映する。
// 自分自身の書き込みのechoでも届くが、内容は同じなので上書きしても問題ない
export function applyCloud(data) {
  if (!data || !Array.isArray(data.registrants)) return false;
  cacheUid = (state && state.currentUserId) ? state.currentUserId : "guest";
  cache = data.registrants;
  writeToStorage(cache);
  return true;
}
