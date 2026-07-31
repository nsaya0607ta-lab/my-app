/* =========================================================================
   🃏 価値観ゲーム：オンラインルーム（Firestoreによるリアルタイム同期）

   ルームは vgRooms/{roomId} の1ドキュメントで表し、onSnapshot で全員が
   同じ状態を購読する。

   ★カードについて
   配る枚数は人数で変わる（2〜3人なら1人2枚、4人以上なら1人1枚）。カードは
   `${uid}#${通し番号}` というIDで表し、回答（answers）も投票（votes）も
   プレイヤー単位ではなくカード単位で持つ。誰が何枚持っているかは公開情報
   なので room.cards に入るが、数字はここにも入らない。

   ★数字の秘匿について（重要）
   ルームドキュメントには「各カードの数字」を一切書かない。数字は
   サーバー（/api/valuegame?action=deal）が生成し、サーバー側の鍵で暗号化して
   保管したうえで、呼び出した本人にだけ自分の数字を返す。したがって
   ・Firestoreのルームドキュメントを読んでも他人の数字は入っていない
   ・ブラウザの開発者ツールで通信を見ても、返ってくるのは自分の数字だけ
   ・仮に暗号化前のドキュメントを覗けたとしても中身は暗号文
   となり、公開（/api/valuegame?action=reveal）まで他人の数字は取得できない。

   再接続：参加中のルームIDを端末に保存しておき、ページを更新しても
   同じルームへ購読し直せるようにしている。
   ========================================================================= */
import { state } from '../state.js';
import { VG_MAX_PLAYERS, VG_MIN_PLAYERS, VG_ROOM_CODE_LENGTH, vgDifficulty } from './config.js';

const ROOMS = "vgRooms";
const RESUME_KEY_BASE = "valuegame_room_v1";
// ルーム一覧に出す上限
const PUBLIC_LIST_LIMIT = 20;
// この時間以上更新のないルームは「終了扱い」として一覧から隠す
const ROOM_STALE_MS = 45 * 60 * 1000;

/* ---- モジュール内の状態 ---- */
const S = {
  roomId: "",
  room: null,        // Firestoreのルームドキュメントの中身
  myId: "",
  myNumbers: {},     // { カードID: 数字 } 自分のカードだけ。DOMへは長押し時のみ
  myNumbersRound: 0, // myNumbers がどのラウンドのものか（持ち越し表示の防止）
  chat: [],
  unsub: null,
  onUpdate: null,
  lastError: "",
};

export function vgOnlineState(){ return S; }

/* =========================================================================
   カード（並べ替えの単位）
   ========================================================================= */
/* このラウンドのカード一覧。配布時にサーバーが room.cards へ書く。
   まだ配布前・古い形式のルームでは「1人1枚（カードID＝UID）」とみなす */
export function vgOnlineCards(room){
  const r = room || S.room;
  if(!r) return [];
  if(Array.isArray(r.cards) && r.cards.length) return r.cards;
  return (r.players || [])
    .filter(p => p && !p.spectator)
    .map(p => ({ id: p.id, ownerId: p.id, index: 0 }));
}

// 自分が持っているカード（回答欄・数字の確認はこの枚数ぶん出す）
export function vgOnlineMyCards(room){
  return vgOnlineCards(room).filter(c => c.ownerId === S.myId);
}

function fb(){ return window.FirebaseSync || null; }
function db(){ return state.db || null; }

function resumeKey(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `${RESUME_KEY_BASE}::${uid}`;
}

function saveResume(roomId, code){
  try{
    if(!roomId) localStorage.removeItem(resumeKey());
    else localStorage.setItem(resumeKey(), JSON.stringify({ roomId, code, at: Date.now() }));
  }catch(e){}
}

// 参加中のルーム（ページ更新後の復帰用）。2時間以上前のものは捨てる
export function vgOnlineRestore(){
  try{
    const raw = JSON.parse(localStorage.getItem(resumeKey()) || "null");
    if(!raw || !raw.roomId) return null;
    if(Date.now() - (raw.at || 0) > 2 * 3600 * 1000){ saveResume(""); return null; }
    return raw;
  }catch(e){ return null; }
}

/* ---- URLの ?vgroom=CODE で招待リンクから直接参加できるようにする ---- */
let pendingInviteCode = "";
export function vgOnlineInit(){
  try{
    const params = new URLSearchParams(window.location.search);
    const code = (params.get("vgroom") || "").trim().toUpperCase();
    if(code) pendingInviteCode = code;
  }catch(e){}
}
export function vgOnlinePendingInvite(){ return pendingInviteCode; }
export function vgOnlineClearInvite(){ pendingInviteCode = ""; }

export function vgOnlineShareUrl(room){
  try{
    const u = new URL(window.location.href);
    u.search = `?vgroom=${encodeURIComponent(room.code || "")}`;
    u.hash = "";
    return u.toString();
  }catch(e){ return `ルームコード ${room.code}`; }
}

/* =========================================================================
   ルーム作成・参加・退出
   ========================================================================= */
function genRoomCode(){
  // 見間違えやすい文字（0/O、1/I）を除いた英数字
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for(let i = 0; i < VG_ROOM_CODE_LENGTH; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function genRoomId(){
  return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function requireLogin(){
  if(!db() || !fb()) return { ok: false, message: "通信の準備ができていません。少し待ってからお試しください。" };
  if(!state.currentUserId) return { ok: false, message: "オンラインで遊ぶにはログインが必要です。" };
  if(isOffline()) return { ok: false, message: "端末がオフラインのようです。通信できる場所でお試しください。" };
  return { ok: true };
}

function isOffline(){
  try{ return typeof navigator !== "undefined" && navigator.onLine === false; }catch(e){ return false; }
}

/* Firestoreの失敗を、原因が分かる文にして返す。
   すべて「通信状況をご確認ください」にしてしまうと、実際には
   セキュリティルールが未反映（permission-denied）でも同じ表示になり、
   電波を疑い続けることになるため、理由ごとに文言を分ける。
   最後の手段として、判別できないものはエラーコードをそのまま添える */
export function vgErrorMessage(e, what){
  const raw = String((e && (e.code || e.name)) || "");
  const code = raw.replace(/^firestore\//, "");
  switch(code){
    case "permission-denied":
      return `${what}（権限エラー）。Firestoreのセキュリティルールが最新か確認してください。`;
    case "unauthenticated":
      return `${what}（ログインの期限切れ）。ログインし直してからお試しください。`;
    case "failed-precondition":
      return `${what}（データベースの設定不足）。Firestoreのインデックスを確認してください。`;
    case "resource-exhausted":
      return `${what}（利用量の上限に達しています）。時間をおいてお試しください。`;
    case "unavailable":
    case "deadline-exceeded":
    case "cancelled":
      return `${what}。通信状況をご確認ください。`;
    default:
      return code ? `${what}（${code}）。時間をおいてお試しください。` : `${what}。通信状況をご確認ください。`;
  }
}

export function vgOnlineLastError(){ return S.lastError; }

function nowISO(){ return new Date().toISOString(); }

/* 合言葉はそのまま保存せず、簡易ハッシュにして保存する。
   （ルームの合言葉は「気軽な入室制限」であり機密情報ではないが、
   ドキュメントを読める人にそのまま見えてしまうのは避ける） */
function hashPassword(pw){
  const s = String(pw || "");
  if(!s) return "";
  let h = 5381;
  for(let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export async function vgOnlineCreateRoom(form){
  const gate = requireLogin();
  if(!gate.ok) return gate;
  const f = form || {};
  const diff = vgDifficulty(f.difficulty);
  const roomId = genRoomId();
  const room = {
    id: roomId,
    code: genRoomCode(),
    name: String(f.name || "").trim().slice(0, 24) || "価値観ルーム",
    isPublic: f.isPublic !== false,
    passwordHash: hashPassword(f.password),
    hasPassword: !!String(f.password || "").trim(),
    maxPlayers: Math.max(VG_MIN_PLAYERS, Math.min(VG_MAX_PLAYERS, Number(f.maxPlayers) || 4)),
    difficulty: diff.key,
    rounds: Math.max(1, Math.min(5, Number(f.rounds) || 3)),
    useTimeLimit: !!f.useTimeLimit,
    useVoice: !!f.useVoice,
    allowSpectator: f.allowSpectator !== false,
    allowLateJoin: f.allowLateJoin !== false,
    hostId: state.currentUserId,
    players: [{
      id: state.currentUserId,
      name: String(f.hostName || "ホスト").slice(0, 20),
      ready: true,
      spectator: false,
      joinedAt: nowISO(),
      lastSeen: nowISO(),
    }],
    status: "waiting",     // waiting | playing | finished
    gameId: "",
    round: 0,
    lives: diff.lives,
    maxLives: diff.lives,
    topicId: "",
    phase: "",             // answer | order | reveal
    cards: [],             // [{ id, ownerId, index }] 配布時にサーバーが書く
    cardsPerPlayer: 0,
    answers: {},           // { カードID: 回答文 }（数字は入らない）
    votes: {},             // { uid: [カードID,...] } 各自の予想順
    finalOrder: [],
    revealed: null,        // 公開後の { numbers, rows, ok, gap }
    clearedRounds: 0,
    usedTopicIds: [],
    perfect: true,
    chat: [],
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  try{
    await fb().setDoc(fb().doc(db(), ROOMS, roomId), room);
    S.myId = state.currentUserId;
    saveResume(roomId, room.code);
    return { ok: true, roomId, code: room.code };
  }catch(e){
    console.error("vg create room failed:", e);
    S.lastError = vgErrorMessage(e, "ルームを作成できませんでした");
    return { ok: false, message: S.lastError, code: e && e.code };
  }
}

/* 公開ルームの一覧。読み取りに失敗したときは空一覧ではなく理由を返す。
   （空一覧のままだと「ルームが無い」のか「読めていない」のか区別できない） */
export async function vgOnlineListPublicRooms(){
  if(!db() || !fb()) return { ok: false, rooms: [], message: "通信の準備ができていません。少し待ってからお試しください。" };
  if(isOffline()) return { ok: false, rooms: [], message: "端末がオフラインのようです。通信できる場所でお試しください。" };
  try{
    const q = fb().query(
      fb().collection(db(), ROOMS),
      fb().where("isPublic", "==", true),
      fb().where("status", "==", "waiting"),
      fb().limit(PUBLIC_LIST_LIMIT),
    );
    const snap = await fb().getDocs(q);
    const rows = [];
    snap.forEach(d => {
      const r = d.data() || {};
      const updated = new Date(r.updatedAt || 0).getTime();
      if(Date.now() - updated > ROOM_STALE_MS) return;   // 放置されたルームは出さない
      const players = r.players || [];
      if(players.length >= (r.maxPlayers || 0)) return;   // 満室は出さない
      rows.push({
        id: d.id,
        name: r.name || "",
        difficulty: r.difficulty || "normal",
        rounds: r.rounds || 3,
        hasPassword: !!r.hasPassword,
        playerCount: players.length,
        maxPlayers: r.maxPlayers || 0,
      });
    });
    return { ok: true, rooms: rows };
  }catch(e){
    console.error("vg list rooms failed:", e);
    return { ok: false, rooms: [], message: vgErrorMessage(e, "公開ルームを読み込めませんでした") };
  }
}

export async function vgOnlineJoinByCode(code, myName, password){
  const gate = requireLogin();
  if(!gate.ok) return gate;
  const c = String(code || "").trim().toUpperCase();
  if(c.length !== VG_ROOM_CODE_LENGTH) return { ok: false, message: `ルームコードは${VG_ROOM_CODE_LENGTH}文字です。` };
  try{
    const q = fb().query(fb().collection(db(), ROOMS), fb().where("code", "==", c), fb().limit(5));
    const snap = await fb().getDocs(q);
    let target = null;
    snap.forEach(d => { if(!target && (d.data() || {}).status !== "finished") target = { id: d.id, data: d.data() }; });
    if(!target) return { ok: false, message: "そのコードのルームは見つかりませんでした。" };
    return await vgOnlineJoinRoom(target.id, myName, password);
  }catch(e){
    console.error("vg join by code failed:", e);
    S.lastError = vgErrorMessage(e, "参加できませんでした");
    return { ok: false, message: S.lastError, code: e && e.code };
  }
}

export async function vgOnlineJoinRoom(roomId, myName, password){
  const gate = requireLogin();
  if(!gate.ok) return gate;
  try{
    // 満室・重複参加・途中参加の可否をトランザクション内で判定してから追加する。
    // これを分けて書くと、同時参加で定員を超える／同じ人が二重に並ぶ
    const result = await fb().runTransaction(db(), async (tx) => {
      const ref = fb().doc(db(), ROOMS, roomId);
      const snap = await tx.get(ref);
      if(!snap.exists()) return { ok: false, message: "そのルームは既に閉じられています。" };
      const r = snap.data() || {};
      if(r.status === "finished") return { ok: false, message: "そのルームは終了しています。" };
      const players = (r.players || []).slice();
      const mine = players.findIndex(p => p.id === state.currentUserId);
      if(mine >= 0){
        // 再入室（再接続）：席はそのままに、最終確認時刻だけ更新する
        players[mine] = { ...players[mine], lastSeen: nowISO() };
        tx.set(ref, { players, updatedAt: nowISO() }, { merge: true });
        return { ok: true, code: r.code, rejoined: true };
      }
      if(r.hasPassword && hashPassword(password) !== r.passwordHash){
        return { ok: false, needPassword: true, message: "合言葉が違います。" };
      }
      const spectator = r.status === "playing" && !r.allowLateJoin;
      if(spectator && !r.allowSpectator) return { ok: false, message: "このルームは途中参加も観戦もできません。" };
      if(!spectator && players.length >= (r.maxPlayers || VG_MAX_PLAYERS)){
        if(!r.allowSpectator) return { ok: false, message: "このルームは満室です。" };
        return { ok: false, message: "このルームは満室です。観戦での参加をお試しください。" };
      }
      players.push({
        id: state.currentUserId,
        name: String(myName || "プレイヤー").slice(0, 20),
        ready: false,
        spectator,
        joinedAt: nowISO(),
        lastSeen: nowISO(),
      });
      tx.set(ref, { players, updatedAt: nowISO() }, { merge: true });
      return { ok: true, code: r.code };
    });
    if(!result.ok) return result;
    S.myId = state.currentUserId;
    saveResume(roomId, result.code);
    return { ok: true, roomId, code: result.code };
  }catch(e){
    console.error("vg join room failed:", e);
    S.lastError = vgErrorMessage(e, "参加できませんでした");
    return { ok: false, message: S.lastError, code: e && e.code };
  }
}

/* ルームの購読を開始する。onUpdate は状態が届くたびに呼ばれる */
export async function vgOnlineSubscribe(roomId, onUpdate){
  if(!db() || !fb()) return false;
  vgOnlineUnsubscribe();
  S.roomId = roomId;
  S.myId = state.currentUserId || "";
  S.onUpdate = onUpdate || null;
  try{
    S.unsub = fb().onSnapshot(fb().doc(db(), ROOMS, roomId), (snap) => {
      if(!snap.exists()){
        S.room = null;
        S.roomId = "";
        saveResume("");
        if(S.onUpdate) S.onUpdate();
        return;
      }
      const r = snap.data() || {};
      S.room = r;
      // ラウンドが進んだら前のラウンドの数字は捨てる。カードIDはラウンドを
      // またいで同じ（uid#0）なので、消さないと古い数字が見えてしまう
      if((Number(r.round) || 0) !== S.myNumbersRound) S.myNumbers = {};
      S.chat = (r.chat || []).map(m => ({ ...m, mine: m.uid === S.myId }));
      if(S.onUpdate) S.onUpdate();
    }, (err) => {
      console.error("vg room snapshot failed:", err);
      S.lastError = vgErrorMessage(err, "ルームの状態を受け取れませんでした");
      if(S.onUpdate) S.onUpdate();
    });
    return true;
  }catch(e){
    console.error("vg subscribe failed:", e);
    return false;
  }
}

export function vgOnlineUnsubscribe(){
  if(S.unsub){ try{ S.unsub(); }catch(e){} S.unsub = null; }
}

export async function vgOnlineLeave(){
  const roomId = S.roomId;
  vgOnlineUnsubscribe();
  S.roomId = ""; S.room = null; S.chat = []; S.myNumbers = {}; S.myNumbersRound = 0;
  saveResume("");
  if(!roomId || !db() || !fb() || !state.currentUserId) return;
  try{
    await fb().runTransaction(db(), async (tx) => {
      const ref = fb().doc(db(), ROOMS, roomId);
      const snap = await tx.get(ref);
      if(!snap.exists()) return;
      const r = snap.data() || {};
      const players = (r.players || []).filter(p => p.id !== state.currentUserId);
      if(!players.length){
        // 最後の1人が抜けたらルームごと片付ける
        tx.delete(ref);
        return;
      }
      const patch = { players, updatedAt: nowISO() };
      // ホストが抜けたら、残っている人の中で最も早く入った人へ引き継ぐ
      if(r.hostId === state.currentUserId) patch.hostId = players[0].id;
      tx.set(ref, patch, { merge: true });
    });
  }catch(e){ console.error("vg leave failed:", e); }
}

/* =========================================================================
   待機画面の操作
   ========================================================================= */
async function patchRoom(patch){
  if(!S.roomId || !db() || !fb()) return false;
  try{
    await fb().setDoc(fb().doc(db(), ROOMS, S.roomId), { ...patch, updatedAt: nowISO() }, { merge: true });
    return true;
  }catch(e){
    console.error("vg patch room failed:", e);
    S.lastError = vgErrorMessage(e, "ルームを更新できませんでした");
    return false;
  }
}

export async function vgOnlineSetReady(ready){
  if(!S.room) return;
  const players = (S.room.players || []).map(p => p.id === S.myId ? { ...p, ready: !!ready, lastSeen: nowISO() } : p);
  await patchRoom({ players });
}

/* ホストがゲームを開始する。数字の配布はサーバー（/api/valuegame?action=deal）が行い、
   ルームドキュメントには「配り終えた」という事実とお題だけが入る */
export async function vgOnlineStart(){
  if(!S.room) return { ok: false, message: "ルームに接続していません。" };
  if(S.room.hostId !== S.myId) return { ok: false, message: "ホストだけが開始できます。" };
  const players = (S.room.players || []).filter(p => !p.spectator);
  if(players.length < VG_MIN_PLAYERS) return { ok: false, message: `${VG_MIN_PLAYERS}人以上で開始できます。` };
  return await vgOnlineDealRound(1);
}

/* サーバーへラウンドの配布を依頼する。戻り値に自分のカードの数字が入る */
export async function vgOnlineDealRound(round){
  const token = await idToken();
  if(!token) return { ok: false, message: "ログイン情報を確認できませんでした。" };
  try{
    const res = await fetch("/api/valuegame?action=deal", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ roomId: S.roomId, round }),
    });
    if(!res.ok){
      const err = await safeJson(res);
      return { ok: false, message: (err && err.message) || "配布に失敗しました。もう一度お試しください。" };
    }
    const data = await res.json();
    // 自分のカードの数字だけがここに入る
    S.myNumbers = (data.myNumbers && typeof data.myNumbers === "object") ? data.myNumbers : {};
    S.myNumbersRound = round;
    return { ok: true, myNumbers: S.myNumbers };
  }catch(e){
    console.error("vg deal failed:", e);
    return { ok: false, message: "通信に失敗しました。再試行してください。" };
  }
}

// 自分のカードの数字を取り出す（画面は長押し中だけこれを表示する）
export function vgOnlineMyNumber(cardId){
  const n = S.myNumbers ? S.myNumbers[cardId] : undefined;
  return (n === undefined) ? null : n;
}

export function vgOnlineHasMyNumbers(){
  return !!(S.myNumbers && Object.keys(S.myNumbers).length);
}

/* まだ配布結果を受け取っていない参加者（後から購読を始めた人・再接続した人）が
   自分のカードを取りに行くための入口。サーバーは本人のカードしか返さない */
export async function vgOnlineFetchMyNumbers(){
  if(!S.room || !S.room.gameId) return null;
  const r = await vgOnlineDealRound(S.room.round || 1);
  return r.ok ? r.myNumbers : null;
}

/* カード1枚ぶんの回答を確定する。自分のカード以外は書き換えない */
export async function vgOnlineSubmitAnswer(cardId, text){
  if(!S.room) return { ok: false };
  const id = String(cardId || "");
  if(!vgOnlineMyCards().some(c => c.id === id)) return { ok: false };
  const answer = String(text || "").trim().slice(0, 40);
  if(!answer) return { ok: false };
  // 自分のカードのぶんだけを書き込む（手元の古い一覧で他の人の回答を
  // 上書きしないよう、まとめて送らずキー単位で更新する）
  const ok = await patchRoom({ answers: { [id]: answer } });
  return { ok };
}

/* 推奨方式：各プレイヤーが自分の予想順を作り、最後に投票する。
   最も多く選ばれた並び順が最終候補になる */
export async function vgOnlineVoteOrder(order){
  if(!S.room) return;
  // 回答と同じく、自分のぶんだけをキー単位で更新する
  await patchRoom({ votes: { [S.myId]: order.slice() } });
}

export async function vgOnlineSetOrder(order){
  await patchRoom({ finalOrder: order.slice() });
}

/* 投票を集計して、最も多く選ばれた並び順を返す */
export function vgOnlineTallyVotes(room){
  const votes = (room && room.votes) || {};
  const counts = new Map();
  Object.keys(votes).forEach(uid => {
    const key = (votes[uid] || []).join(">");
    if(!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  let bestKey = "", bestN = 0;
  counts.forEach((n, key) => { if(n > bestN){ bestKey = key; bestN = n; } });
  if(!bestKey){
    // 全員バラバラなら、最初に投票された並びを候補にする
    const first = Object.keys(votes)[0];
    return { order: first ? votes[first] : [], count: first ? 1 : 0, total: Object.keys(votes).length };
  }
  return { order: bestKey.split(">"), count: bestN, total: Object.keys(votes).length };
}

/* 数字の公開をサーバーへ依頼する。サーバーは
   ・全員が投票を終えていること
   ・そのラウンドがまだ公開されていないこと
   を確認してから、はじめて全員の数字を返す */
export async function vgOnlineReveal(order){
  const token = await idToken();
  if(!token) return { ok: false, message: "ログイン情報を確認できませんでした。" };
  try{
    const res = await fetch("/api/valuegame?action=reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ roomId: S.roomId, round: S.room ? S.room.round : 1, order: order || [] }),
    });
    if(!res.ok){
      const err = await safeJson(res);
      return { ok: false, message: (err && err.message) || "公開に失敗しました。もう一度お試しください。" };
    }
    return { ok: true, ...(await res.json()) };
  }catch(e){
    console.error("vg reveal failed:", e);
    return { ok: false, message: "通信に失敗しました。再試行してください。" };
  }
}

export async function vgOnlineNextRound(){
  if(!S.room) return { ok: false };
  if(S.room.hostId !== S.myId) return { ok: false, message: "ホストが次のラウンドへ進めます。" };
  const next = (S.room.round || 1) + 1;
  if(S.room.lives <= 0 || next > S.room.rounds){
    await patchRoom({ status: "finished", phase: "", updatedAt: nowISO() });
    return { ok: true, finished: true };
  }
  return await vgOnlineDealRound(next);
}

/* ---- チャット・リアクション ---- */
export async function vgOnlineSendChat(text){
  if(!S.room) return;
  const msg = {
    uid: S.myId,
    name: myNameInRoom(),
    text: String(text || "").slice(0, 60),
    at: nowISO(),
  };
  // 直近50件だけ残す（ドキュメントが際限なく大きくならないように）
  const chat = [...(S.room.chat || []), msg].slice(-50);
  await patchRoom({ chat });
}

export async function vgOnlineSendReaction(text){
  await vgOnlineSendChat(text);
}

function myNameInRoom(){
  const p = ((S.room && S.room.players) || []).find(x => x.id === S.myId);
  return (p && p.name) || "プレイヤー";
}

/* ---- 共通 ---- */
async function idToken(){
  if(!state.currentUser || typeof state.currentUser.getIdToken !== "function") return null;
  try{ return await state.currentUser.getIdToken(); }catch(e){ return null; }
}

async function safeJson(res){
  try{ return await res.json(); }catch(e){ return null; }
}
