/* =========================================================================
   💡 マインド・パレット（AIアイデア整理ノート）

   保存構造 v2：
   {
     version: 2,
     folders: [{ id, name, parentId, ownerId, createdAt, updatedAt }],
     boards:  [{ id, name, notes, links, groups, parentId, ownerId, createdAt, updatedAt }],
     activeBoardId
   }

   folders はエクスプローラー上の「フォルダ」、boards は付箋キャンバスを持つ
   「ファイル」として明確に分離する。旧形式（boards同士がparentIdでネストする
   構造）は、内容を失わずにフォルダ＋ファイルへ自動移行する。
   ========================================================================= */
import { state } from './state.js';

const MP_VERSION = 2;

function mpKey(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `mindpalette_v1::${uid}`;
}

function currentOwnerId(){
  return (state && state.currentUserId) ? state.currentUserId : "guest";
}

function genId(prefix){
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function cleanName(name, fallback){
  const value = String(name || "").trim();
  return (value || fallback).slice(0, 30);
}

function newBoard(name, parentId){
  const now = Date.now();
  return {
    id: genId("b"),
    name: cleanName(name, "無題のマインドパレット"),
    notes: [], links: [], groups: [],
    parentId: parentId || null,
    ownerId: currentOwnerId(),
    createdAt: now, updatedAt: now,
  };
}

function newFolder(name, parentId){
  const now = Date.now();
  return {
    id: genId("f"),
    name: cleanName(name, "新しいフォルダ"),
    parentId: parentId || null,
    ownerId: currentOwnerId(),
    createdAt: now, updatedAt: now,
  };
}

function normalizeBoard(board){
  const b = (board && typeof board === "object") ? board : {};
  if(!b.id) b.id = genId("b");
  b.name = cleanName(b.name, "無題のマインドパレット");
  if(!Array.isArray(b.notes)) b.notes = [];
  if(!Array.isArray(b.links)) b.links = [];
  if(!Array.isArray(b.groups)) b.groups = [];
  b.parentId = b.parentId || null;
  b.ownerId = b.ownerId || currentOwnerId();
  if(!b.createdAt) b.createdAt = Date.now();
  if(!b.updatedAt) b.updatedAt = b.createdAt;
  return b;
}

function normalizeFolder(folder){
  const f = (folder && typeof folder === "object") ? folder : {};
  if(!f.id) f.id = genId("f");
  f.name = cleanName(f.name, "新しいフォルダ");
  f.parentId = f.parentId || null;
  f.ownerId = f.ownerId || currentOwnerId();
  if(!f.createdAt) f.createdAt = Date.now();
  if(!f.updatedAt) f.updatedAt = f.createdAt;
  return f;
}

function migrateLegacyBoards(rawBoards, activeBoardId){
  const legacy = (rawBoards || []).map(b => normalizeBoard(Object.assign({}, b)));
  if(!legacy.length){
    const first = newBoard("マイキャンバス", null);
    return { version: MP_VERSION, folders: [], boards: [first], activeBoardId: first.id };
  }

  const boardById = new Map(legacy.map(b => [b.id, b]));
  const usedAsParent = new Set(legacy.map(b => b.parentId).filter(id => boardById.has(id)));
  const folderIdByBoardId = new Map();
  usedAsParent.forEach(id => folderIdByBoardId.set(id, `legacy-folder-${id}`));

  const folders = [...usedAsParent].map(id => {
    const source = boardById.get(id);
    const parentFolderId = source.parentId && folderIdByBoardId.get(source.parentId);
    return normalizeFolder({
      id: folderIdByBoardId.get(id),
      name: source.name,
      parentId: parentFolderId || null,
      ownerId: source.ownerId || currentOwnerId(),
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    });
  });

  const boards = legacy.map(source => normalizeBoard(Object.assign({}, source, {
    parentId: source.parentId ? (folderIdByBoardId.get(source.parentId) || null) : null,
  })));

  const active = boards.some(b => b.id === activeBoardId) ? activeBoardId : boards[0].id;
  return { version: MP_VERSION, folders, boards, activeBoardId: active };
}

function breakFolderCycles(folders){
  const byId = new Map(folders.map(f => [f.id, f]));
  folders.forEach(folder => {
    const seen = new Set([folder.id]);
    let parentId = folder.parentId;
    while(parentId){
      if(seen.has(parentId)){
        folder.parentId = null;
        return;
      }
      seen.add(parentId);
      const parent = byId.get(parentId);
      if(!parent){
        folder.parentId = null;
        return;
      }
      parentId = parent.parentId;
    }
  });
}

function normalize(raw){
  if(raw && Array.isArray(raw.notes)){
    const board = newBoard("マイキャンバス", null);
    board.notes = raw.notes;
    board.links = Array.isArray(raw.links) ? raw.links : [];
    board.groups = Array.isArray(raw.groups) ? raw.groups : [];
    return { version: MP_VERSION, folders: [], boards: [board], activeBoardId: board.id };
  }

  if(!raw || !Array.isArray(raw.boards)){
    const board = newBoard("マイキャンバス", null);
    return { version: MP_VERSION, folders: [], boards: [board], activeBoardId: board.id };
  }

  if(raw.version !== MP_VERSION || !Array.isArray(raw.folders)){
    return migrateLegacyBoards(raw.boards, raw.activeBoardId);
  }

  const folders = raw.folders.map(f => normalizeFolder(Object.assign({}, f)));
  breakFolderCycles(folders);
  const folderIds = new Set(folders.map(f => f.id));
  const boards = raw.boards.map(b => normalizeBoard(Object.assign({}, b)));
  boards.forEach(b => { if(b.parentId && !folderIds.has(b.parentId)) b.parentId = null; });

  if(!boards.length) boards.push(newBoard("マイキャンバス", null));
  const activeBoardId = boards.some(b => b.id === raw.activeBoardId) ? raw.activeBoardId : boards[0].id;
  return { version: MP_VERSION, folders, boards, activeBoardId };
}

let cache = null;
let mpIdentityToken;

function load(){
  if(cache) return cache;
  let parsed = null;
  try{ parsed = JSON.parse(localStorage.getItem(mpKey()) || "null"); }catch(e){}
  cache = normalize(parsed);
  try{ localStorage.setItem(mpKey(), JSON.stringify(cache)); }catch(e){}
  return cache;
}

function syncToCloud(){
  if(!state.db || !state.currentUserId || !window.FirebaseSync) return;
  try{
    window.FirebaseSync.setDoc(window.FirebaseSync.doc(state.db, "users", state.currentUserId), {
      mindPalette: cache,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  }catch(e){ console.error("mind palette cloud sync failed:", e); }
}

function save(){
  try{ localStorage.setItem(mpKey(), JSON.stringify(cache)); }catch(e){}
  syncToCloud();
}

export function mpExportRaw(){ return load(); }

export function mpApplyCloud(data){
  if(!data || typeof data !== "object" || !Array.isArray(data.boards)) return false;
  cache = normalize(JSON.parse(JSON.stringify(data)));
  try{ localStorage.setItem(mpKey(), JSON.stringify(cache)); }catch(e){}
  return true;
}

function activeBoard(){
  const st = load();
  let board = st.boards.find(b => b.id === st.activeBoardId);
  if(!board){
    board = st.boards[0] || newBoard("マイキャンバス", null);
    if(!st.boards.length) st.boards.push(board);
    st.activeBoardId = board.id;
  }
  return board;
}

function touch(item){ item.updatedAt = Date.now(); }

export function mpHandleIdentityChange(){
  const uid = currentOwnerId();
  if(mpIdentityToken === uid) return;
  const isFirstRun = mpIdentityToken === undefined;
  mpIdentityToken = uid;
  if(isFirstRun) return;
  cache = null;
}

export function mpGetState(){ return activeBoard(); }

export const MP_COLORS = ["blue", "gold", "teal", "violet", "rose"];
export function mpRandomColor(){ return MP_COLORS[(Math.random() * MP_COLORS.length) | 0]; }

function fileCountInFolder(st, folderId){
  return st.boards.filter(b => (b.parentId || null) === folderId).length;
}

function folderCountInFolder(st, folderId){
  return st.folders.filter(f => (f.parentId || null) === folderId).length;
}

export function mpListBoards(parentId){
  const st = load();
  const pid = parentId || null;
  return st.boards
    .filter(b => (b.parentId || null) === pid)
    .map(b => ({ id:b.id, type:"file", name:b.name, count:b.notes.length, parentId:b.parentId || null, ownerId:b.ownerId, updatedAt:b.updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function mpListFolders(parentId){
  const st = load();
  const pid = parentId || null;
  return st.folders
    .filter(f => (f.parentId || null) === pid)
    .map(f => ({
      id:f.id, type:"folder", name:f.name, parentId:f.parentId || null, ownerId:f.ownerId,
      childCount:folderCountInFolder(st, f.id), fileCount:fileCountInFolder(st, f.id), updatedAt:f.updatedAt,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export function mpActiveBoardId(){ return load().activeBoardId; }

export function mpBoardMeta(id){
  const st = load();
  const b = st.boards.find(x => x.id === id);
  if(!b) return null;
  return { id:b.id, type:"file", name:b.name, count:b.notes.length, parentId:b.parentId || null, ownerId:b.ownerId, updatedAt:b.updatedAt };
}

export function mpFolderMeta(id){
  const st = load();
  const f = st.folders.find(x => x.id === id);
  if(!f) return null;
  return {
    id:f.id, type:"folder", name:f.name, parentId:f.parentId || null, ownerId:f.ownerId,
    childCount:folderCountInFolder(st, f.id), fileCount:fileCountInFolder(st, f.id), updatedAt:f.updatedAt,
  };
}

export function mpFolderChain(id){
  const st = load();
  const byId = new Map(st.folders.map(f => [f.id, f]));
  const chain = [];
  const seen = new Set();
  let current = id;
  while(current && !seen.has(current)){
    seen.add(current);
    const folder = byId.get(current);
    if(!folder) break;
    chain.unshift({ id:folder.id, name:folder.name });
    current = folder.parentId || null;
  }
  return chain;
}

export function mpBoardChain(id){
  const board = mpBoardMeta(id);
  if(!board) return mpFolderChain(id);
  return [...mpFolderChain(board.parentId), { id:board.id, name:board.name }];
}

export function mpTotalBoardCount(){ return load().boards.length; }

export function mpCreateFolder(name, parentId){
  const st = load();
  const pid = parentId && st.folders.some(f => f.id === parentId) ? parentId : null;
  const folder = newFolder(name || `新しいフォルダ${st.folders.length + 1}`, pid);
  st.folders.push(folder);
  save();
  return folder;
}

export function mpCreateBoard(name, parentId){
  const st = load();
  const pid = parentId && st.folders.some(f => f.id === parentId) ? parentId : null;
  const board = newBoard(name || `無題のマインドパレット${st.boards.length + 1}`, pid);
  st.boards.push(board);
  st.activeBoardId = board.id;
  save();
  return board;
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
  const board = st.boards.find(x => x.id === id);
  const trimmed = String(name || "").trim();
  if(!board || !trimmed) return false;
  board.name = cleanName(trimmed, board.name);
  touch(board);
  save();
  return true;
}

export function mpRenameFolder(id, name){
  const st = load();
  const folder = st.folders.find(x => x.id === id);
  const trimmed = String(name || "").trim();
  if(!folder || !trimmed) return false;
  folder.name = cleanName(trimmed, folder.name);
  touch(folder);
  save();
  return true;
}

function folderDescendantOf(st, candidateId, ancestorId){
  const byId = new Map(st.folders.map(f => [f.id, f]));
  const seen = new Set();
  let current = candidateId;
  while(current && !seen.has(current)){
    if(current === ancestorId) return true;
    seen.add(current);
    const folder = byId.get(current);
    current = folder ? (folder.parentId || null) : null;
  }
  return false;
}

export function mpCanMoveEntry(type, id, destinationFolderId){
  const st = load();
  const destination = destinationFolderId ? st.folders.find(f => f.id === destinationFolderId) : null;
  if(destinationFolderId && !destination) return { ok:false, reason:"移動先フォルダが存在しません。" };
  if(destination && destination.ownerId !== currentOwnerId()) return { ok:false, reason:"他のユーザーが所有するフォルダには移動できません。" };

  if(type === "file"){
    const file = st.boards.find(b => b.id === id);
    if(!file) return { ok:false, reason:"移動するファイルが存在しません。" };
    if(file.ownerId !== currentOwnerId()) return { ok:false, reason:"他のユーザーのファイルは移動できません。" };
    if((file.parentId || null) === (destinationFolderId || null)) return { ok:false, reason:"すでに選択した場所にあります。" };
    return { ok:true };
  }

  if(type === "folder"){
    const folder = st.folders.find(f => f.id === id);
    if(!folder) return { ok:false, reason:"移動するフォルダが存在しません。" };
    if(folder.ownerId !== currentOwnerId()) return { ok:false, reason:"他のユーザーのフォルダは移動できません。" };
    if(destinationFolderId === id) return { ok:false, reason:"フォルダを自分自身の中へ移動できません。" };
    if(destinationFolderId && folderDescendantOf(st, destinationFolderId, id)){
      return { ok:false, reason:"親フォルダを子フォルダまたは孫フォルダの中へ移動できません。" };
    }
    if((folder.parentId || null) === (destinationFolderId || null)) return { ok:false, reason:"すでに選択した場所にあります。" };
    return { ok:true };
  }

  return { ok:false, reason:"移動対象の種類が正しくありません。" };
}

export function mpMoveEntry(type, id, destinationFolderId){
  const check = mpCanMoveEntry(type, id, destinationFolderId || null);
  if(!check.ok) return check;
  const st = load();
  const item = type === "folder" ? st.folders.find(f => f.id === id) : st.boards.find(b => b.id === id);
  const destination = destinationFolderId ? st.folders.find(f => f.id === destinationFolderId) : null;
  item.parentId = destinationFolderId || null;
  save();
  return { ok:true, itemName:item.name, destinationName:destination ? destination.name : "ルート" };
}

export function mpDeleteBoard(id){
  const st = load();
  if(st.boards.length <= 1) return false;
  const index = st.boards.findIndex(b => b.id === id);
  if(index < 0) return false;
  st.boards.splice(index, 1);
  if(st.activeBoardId === id) st.activeBoardId = st.boards[0].id;
  save();
  return true;
}

export function mpDeleteFolder(id){
  const st = load();
  if(!st.folders.some(f => f.id === id)) return false;
  const folderIds = new Set([id]);
  let changed = true;
  while(changed){
    changed = false;
    st.folders.forEach(f => {
      if(f.parentId && folderIds.has(f.parentId) && !folderIds.has(f.id)){
        folderIds.add(f.id);
        changed = true;
      }
    });
  }
  const deletedBoardIds = new Set(st.boards.filter(b => b.parentId && folderIds.has(b.parentId)).map(b => b.id));
  st.folders = st.folders.filter(f => !folderIds.has(f.id));
  st.boards = st.boards.filter(b => !deletedBoardIds.has(b.id));
  if(!st.boards.length) st.boards.push(newBoard("マイキャンバス", null));
  if(!st.boards.some(b => b.id === st.activeBoardId)) st.activeBoardId = st.boards[0].id;
  save();
  return true;
}

export function mpAddNote({ x, y, text, color, source } = {}){
  const b = activeBoard();
  const note = {
    id: genId("n"),
    x: Math.round(x || 0), y: Math.round(y || 0),
    text: text || "", color: color || mpRandomColor(), groupId: null,
    source: source || null, createdAt: Date.now(),
  };
  b.notes.push(note);
  touch(b);
  save();
  return note;
}

export function mpUpdateNote(id, patch){
  const b = activeBoard();
  const note = b.notes.find(n => n.id === id);
  if(!note) return null;
  Object.assign(note, patch);
  touch(b);
  save();
  return note;
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
  const link = { id:genId("l"), a, b };
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
  b.groups.push({ id:gid, color });
  b.notes.forEach(n => { if(ids.includes(n.id)) n.groupId = gid; });
  touch(b);
  save();
  return gid;
}

export function mpUngroupNote(id){ mpUpdateNote(id, { groupId:null }); }

export function mpClearAll(){
  const b = activeBoard();
  b.notes = []; b.links = []; b.groups = [];
  touch(b);
  save();
}

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
