/* =========================================================================
   💡 マインド・パレット（AIアイデア整理ノート）

   ニュース・株価・資格学習で得た「ひらめき」を自由なキャンバスに付箋として
   ストックする機能のデータ・ロジック部分。見た目（キャンバスDOM・ドラッグ・
   コネクタの描画）はjs/render.js側で組み立て、ここでは
   「付箋／コネクタ／グループの永続化」と「AIのフワフワ提案（モック）」の
   計算だけを受け持つ（他のローカル保存機能と同じくlocalStorageベース）。
   ========================================================================= */
import { state } from './state.js';

function mpKey(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `mindpalette_v1::${uid}`;
}

function genId(prefix){
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

let cache = null;
let mpIdentityToken;

function normalize(raw){
  const st = (raw && typeof raw === "object") ? raw : {};
  if(!Array.isArray(st.notes)) st.notes = [];
  if(!Array.isArray(st.links)) st.links = [];
  if(!Array.isArray(st.groups)) st.groups = [];
  return st;
}

function load(){
  if(cache) return cache;
  try{ cache = normalize(JSON.parse(localStorage.getItem(mpKey()) || "null")); }
  catch(e){ cache = normalize(null); }
  return cache;
}

function save(){
  try{ localStorage.setItem(mpKey(), JSON.stringify(cache)); }catch(e){}
}

// ログインユーザーが切り替わったら、前のユーザーのキャンバスデータが
// 一瞬でも見えないようキャッシュを破棄して読み直す（skin/gcalと同じ方式）
export function mpHandleIdentityChange(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  if(mpIdentityToken === uid) return;
  const isFirstRun = mpIdentityToken === undefined;
  mpIdentityToken = uid;
  if(isFirstRun) return;
  cache = null;
}

export function mpGetState(){ return load(); }

export const MP_COLORS = ["blue", "gold", "teal", "violet", "rose"];
export function mpRandomColor(){ return MP_COLORS[(Math.random() * MP_COLORS.length) | 0]; }

export function mpAddNote({ x, y, text, color, source } = {}){
  const st = load();
  const note = {
    id: genId("n"),
    x: Math.round(x || 0), y: Math.round(y || 0),
    text: text || "",
    color: color || mpRandomColor(),
    groupId: null,
    source: source || null,
    createdAt: Date.now(),
  };
  st.notes.push(note);
  save();
  return note;
}

export function mpUpdateNote(id, patch){
  const st = load();
  const n = st.notes.find(n => n.id === id);
  if(!n) return null;
  Object.assign(n, patch);
  save();
  return n;
}

export function mpDeleteNote(id){
  const st = load();
  st.notes = st.notes.filter(n => n.id !== id);
  st.links = st.links.filter(l => l.a !== id && l.b !== id);
  save();
}

export function mpAddLink(a, b){
  if(!a || !b || a === b) return null;
  const st = load();
  if(st.links.some(l => (l.a === a && l.b === b) || (l.a === b && l.b === a))) return null;
  const link = { id: genId("l"), a, b };
  st.links.push(link);
  save();
  return link;
}

export function mpRemoveLink(id){
  const st = load();
  st.links = st.links.filter(l => l.id !== id);
  save();
}

export function mpRemoveLinksBetween(a, b){
  const st = load();
  const before = st.links.length;
  st.links = st.links.filter(l => !((l.a === a && l.b === b) || (l.a === b && l.b === a)));
  if(st.links.length !== before) save();
}

const GROUP_COLORS = ["#38bdf8", "#fbbf24", "#a855f7", "#34d399", "#f472b6"];
export function mpGroupNotes(ids){
  if(!ids || ids.length < 2) return null;
  const st = load();
  const gid = genId("g");
  const color = GROUP_COLORS[st.groups.length % GROUP_COLORS.length];
  st.groups.push({ id: gid, color });
  st.notes.forEach(n => { if(ids.includes(n.id)) n.groupId = gid; });
  save();
  return gid;
}

export function mpUngroupNote(id){
  mpUpdateNote(id, { groupId: null });
}

export function mpClearAll(){
  cache = normalize(null);
  save();
}

/* ---- AIのフワフワ提案（モック） ----
   本文からそれっぽい単語を抽出し、汎用の「発想を広げる」フレーズと
   組み合わせて最大3つのタグ候補を返す。実際のAI呼び出しは行わない */
const MP_GENERIC_HINTS = [
  "深掘りする", "関連ニュース", "次の一手", "反対意見", "背景を調べる",
  "影響範囲", "要点整理", "比較する", "タイムライン化", "リスクは？",
  "チャンスは？", "仮説を立てる", "誰に話す？", "数字で裏付け",
];

function shuffle(a){
  a = a.slice();
  for(let i = a.length - 1; i > 0; i--){
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function mpSuggestKeywords(text){
  const cleaned = (text || "").replace(/[\n\r]/g, " ");
  const tokens = cleaned
    .split(/[\s、。,.!?!?「」『』・:：/／\-–—()（）%％]+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && t.length <= 10);
  const uniq = [...new Set(tokens)].sort((a, b) => b.length - a.length).slice(0, 2);
  const hints = shuffle(MP_GENERIC_HINTS).slice(0, Math.max(1, 3 - uniq.length));
  return [...uniq, ...hints].slice(0, 3);
}
