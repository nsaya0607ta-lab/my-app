/* =========================================================================
   💡 マインド・パレット（AIアイデア整理ノート）

   ニュース・株価・資格学習で得た「ひらめき」を自由なキャンバスに付箋として
   ストックする機能のデータ・ロジック部分。見た目（キャンバスDOM・ドラッグ・
   コネクタの描画）はjs/render.js側で組み立て、ここでは
   「キャンバス（ボード）単位のフォルダ管理」「付箋／コネクタ／グループの
   永続化」と「AIのフワフワ提案（モック）」の計算だけを受け持つ（他の
   ローカル保存機能と同じくlocalStorageベース）。

   保存構造：{ boards:[{id,name,notes,links,groups,createdAt,updatedAt}],
              activeBoardId }
   旧バージョン（単一キャンバス {notes,links,groups}）のデータは、初回読込
   時に自動で「マイキャンバス」という1枚目のボードへ移行する。
   ========================================================================= */
import { state } from './state.js';

function mpKey(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `mindpalette_v1::${uid}`;
}

function genId(prefix){
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function newBoard(name, parentId){
  const now = Date.now();
  return { id: genId("b"), name: (name || "").trim() || "無題のキャンバス", notes: [], links: [], groups: [], parentId: parentId || null, createdAt: now, updatedAt: now };
}

function normalizeBoard(b){
  if(!b || typeof b !== "object") b = {};
  if(!b.id) b.id = genId("b");
  if(!b.name) b.name = "無題のキャンバス";
  if(!Array.isArray(b.notes)) b.notes = [];
  if(!Array.isArray(b.links)) b.links = [];
  if(!Array.isArray(b.groups)) b.groups = [];
  if(!b.parentId) b.parentId = null;
  if(!b.createdAt) b.createdAt = Date.now();
  if(!b.updatedAt) b.updatedAt = b.createdAt;
  return b;
}

function normalize(raw){
  if(raw && Array.isArray(raw.boards) && raw.boards.length){
    raw.boards = raw.boards.map(normalizeBoard);
    // 親フォルダが既に存在しない（削除済み等）場合は最上位に戻す
    const ids = new Set(raw.boards.map(b => b.id));
    raw.boards.forEach(b => { if(b.parentId && !ids.has(b.parentId)) b.parentId = null; });
    if(!raw.activeBoardId || !raw.boards.some(b => b.id === raw.activeBoardId)){
      raw.activeBoardId = raw.boards[0].id;
    }
    return raw;
  }
  // 旧バージョン（単一キャンバス）からの移行、または初回利用
  if(raw && (Array.isArray(raw.notes) || Array.isArray(raw.links))){
    const b = newBoard("マイキャンバス");
    b.notes = Array.isArray(raw.notes) ? raw.notes : [];
    b.links = Array.isArray(raw.links) ? raw.links : [];
    b.groups = Array.isArray(raw.groups) ? raw.groups : [];
    return { boards: [b], activeBoardId: b.id };
  }
  const b = newBoard("マイキャンバス");
  return { boards: [b], activeBoardId: b.id };
}

let cache = null;
let mpIdentityToken;

function load(){
  if(cache) return cache;
  try{ cache = normalize(JSON.parse(localStorage.getItem(mpKey()) || "null")); }
  catch(e){ cache = normalize(null); }
  return cache;
}

function save(){
  try{ localStorage.setItem(mpKey(), JSON.stringify(cache)); }catch(e){}
}

function activeBoard(){
  const st = load();
  return st.boards.find(b => b.id === st.activeBoardId) || st.boards[0];
}

function touch(board){
  board.updatedAt = Date.now();
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

// 現在アクティブなボード（{id,name,notes,links,groups,...}）を返す。
// 呼び出し側（render.js）は従来どおり .notes/.links/.groups を参照できる
export function mpGetState(){ return activeBoard(); }

export const MP_COLORS = ["blue", "gold", "teal", "violet", "rose"];
export function mpRandomColor(){ return MP_COLORS[(Math.random() * MP_COLORS.length) | 0]; }

/* ---- ボード（フォルダ）管理 ----
   ボードは親子関係（parentId）を持ち、フォルダの中にサブフォルダを
   ネストして作成できる。各ボードはそれ自体が付箋キャンバスであり、
   同時に子ボード（サブフォルダ）を持つコンテナにもなれる */
function childCountOf(st, id){
  return st.boards.filter(b => (b.parentId || null) === id).length;
}

// parentId を指定した階層（省略時は最上位）の直下にあるボード一覧を返す
export function mpListBoards(parentId){
  const st = load();
  const pid = parentId || null;
  return st.boards
    .filter(b => (b.parentId || null) === pid)
    .map(b => ({ id: b.id, name: b.name, count: b.notes.length, childCount: childCountOf(st, b.id), parentId: b.parentId || null, updatedAt: b.updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function mpActiveBoardId(){ return load().activeBoardId; }

// 指定ボードの情報（付箋数・サブフォルダ数など）を単体で取得
export function mpBoardMeta(id){
  const st = load();
  const b = st.boards.find(x => x.id === id);
  if(!b) return null;
  return { id: b.id, name: b.name, count: b.notes.length, childCount: childCountOf(st, b.id), parentId: b.parentId || null, updatedAt: b.updatedAt };
}

// ルートから指定ボードまでの祖先チェーン（パンくずリスト用）
export function mpBoardChain(id){
  const st = load();
  const chain = [];
  const seen = new Set();
  let cur = id;
  while(cur && !seen.has(cur)){
    seen.add(cur);
    const b = st.boards.find(x => x.id === cur);
    if(!b) break;
    chain.unshift({ id: b.id, name: b.name });
    cur = b.parentId || null;
  }
  return chain;
}

export function mpTotalBoardCount(){ return load().boards.length; }

export function mpCreateBoard(name, parentId){
  const st = load();
  const pid = (parentId && st.boards.some(b => b.id === parentId)) ? parentId : null;
  const b = newBoard(name || `無題のキャンバス${st.boards.length + 1}`, pid);
  st.boards.push(b);
  st.activeBoardId = b.id;
  save();
  return b;
}

export function mpSwitchBoard(id){
  const st = load();
  if(!st.boards.some(b => b.id === id)) return false;
  st.activeBoardId = id;
  save();
  return true;
}

export function mpRenameBoard(id, name){
  const st = load();
  const b = st.boards.find(x => x.id === id);
  if(!b) return false;
  const trimmed = (name || "").trim();
  if(!trimmed) return false;
  b.name = trimmed.slice(0, 30);
  touch(b);
  save();
  return true;
}

// 最低1枚はボードを残す（全消去してもキャンバス自体は失わせない）。
// サブフォルダを持つボードを削除する場合は、配下のサブフォルダ・
// キャンバスもまとめて削除する
export function mpDeleteBoard(id){
  const st = load();
  if(st.boards.length <= 1) return false;
  const toDelete = new Set([id]);
  let changed = true;
  while(changed){
    changed = false;
    st.boards.forEach(b => {
      if(b.parentId && toDelete.has(b.parentId) && !toDelete.has(b.id)){
        toDelete.add(b.id);
        changed = true;
      }
    });
  }
  if(toDelete.size >= st.boards.length) return false;
  st.boards = st.boards.filter(b => !toDelete.has(b.id));
  if(toDelete.has(st.activeBoardId)) st.activeBoardId = st.boards[0].id;
  save();
  return true;
}

/* ---- 付箋／コネクタ／グループ（すべてアクティブなボードに対して操作） ---- */
export function mpAddNote({ x, y, text, color, source } = {}){
  const b = activeBoard();
  const note = {
    id: genId("n"),
    x: Math.round(x || 0), y: Math.round(y || 0),
    text: text || "",
    color: color || mpRandomColor(),
    groupId: null,
    source: source || null,
    createdAt: Date.now(),
  };
  b.notes.push(note);
  touch(b);
  save();
  return note;
}

export function mpUpdateNote(id, patch){
  const b = activeBoard();
  const n = b.notes.find(n => n.id === id);
  if(!n) return null;
  Object.assign(n, patch);
  touch(b);
  save();
  return n;
}

export function mpDeleteNote(id){
  const b = activeBoard();
  b.notes = b.notes.filter(n => n.id !== id);
  b.links = b.links.filter(l => l.a !== id && l.b !== id);
  touch(b);
  save();
}

export function mpAddLink(a, b){
  if(!a || !b || a === b) return null;
  const board = activeBoard();
  if(board.links.some(l => (l.a === a && l.b === b) || (l.a === b && l.b === a))) return null;
  const link = { id: genId("l"), a, b };
  board.links.push(link);
  touch(board);
  save();
  return link;
}

export function mpRemoveLink(id){
  const b = activeBoard();
  b.links = b.links.filter(l => l.id !== id);
  touch(b);
  save();
}

export function mpRemoveLinksBetween(a, b){
  const board = activeBoard();
  const before = board.links.length;
  board.links = board.links.filter(l => !((l.a === a && l.b === b) || (l.a === b && l.b === a)));
  if(board.links.length !== before){ touch(board); save(); }
}

const GROUP_COLORS = ["#38bdf8", "#fbbf24", "#a855f7", "#34d399", "#f472b6"];
export function mpGroupNotes(ids){
  if(!ids || ids.length < 2) return null;
  const b = activeBoard();
  const gid = genId("g");
  const color = GROUP_COLORS[b.groups.length % GROUP_COLORS.length];
  b.groups.push({ id: gid, color });
  b.notes.forEach(n => { if(ids.includes(n.id)) n.groupId = gid; });
  touch(b);
  save();
  return gid;
}

export function mpUngroupNote(id){
  mpUpdateNote(id, { groupId: null });
}

// アクティブなボードの中身だけを空にする（ボード自体・他のボードは残す）
export function mpClearAll(){
  const b = activeBoard();
  b.notes = []; b.links = []; b.groups = [];
  touch(b);
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
