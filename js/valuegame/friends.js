/* =========================================================================
   🤝 フレンド機能（価値観ゲームの招待・「フレンドとプレイ」ボーナス用）

   仕組み
   ・フレンド関係は「相互承認制」。片方が申請し、相手が承認してはじめて成立する。
   ・関係は vgFriends コレクションに「2人で1つ」のドキュメントとして持つ。
     ドキュメントIDは2つのUIDを辞書順に並べて連結したもの（例 "abc__xyz"）。
     こうすると、どちらから見ても必ず同じ1件になるので、
     「AとBで別々のレコードができて食い違う」という状態が起きない。
   ・users/{uid} は本人しか書けないため、相手のドキュメントへ書き込む方式は
     取れない。2人が共有する1件を両者が読み書きできるようにすることで、
     サーバー関数を1つも増やさずに相互承認を実現している
     （Vercelの関数数の上限に余裕がないため、ここは重要）。

   相手の探し方
   ・表示名で検索する。表示名はもともと公開ランキングに出る公開情報
     （js/core.js の設計方針）なので、新たに何かを公開することにはならない。

   招待
   ・ルームのコードを vgInvites に置き、宛先の人だけが購読して受け取る。
     受け取った招待は表示後に削除する（カレンダー通知と同じ方式）。

   DOM操作は行わない（画面は screen.js の責務）。
   ========================================================================= */
import { state } from '../state.js';

const FRIENDS = "vgFriends";
const INVITES = "vgInvites";

// 一覧で扱う上限（際限なく増えないように）
const MAX_FRIENDS = 200;

function fb(){ return window.FirebaseSync || null; }
function db(){ return state.db || null; }
function me(){ return state.currentUserId || ""; }
function nowISO(){ return new Date().toISOString(); }

/* 2人ぶんのUIDから、どちらから見ても同じになるドキュメントIDを作る */
export function friendPairId(a, b){
  return [String(a), String(b)].sort().join("__");
}

function ready(){
  if(!db() || !fb()) return { ok: false, message: "通信の準備ができていません。少し待ってからお試しください。" };
  if(!me()) return { ok: false, message: "フレンド機能を使うにはログインが必要です。" };
  return { ok: true };
}

/* =========================================================================
   検索・申請・承認・削除
   ========================================================================= */

/* 表示名でユーザーを探す。公開ランキング（leaderboard）を引くので、
   まだ一度も学習していない人は見つからないことがある。 */
export async function friendSearchByName(name){
  const gate = ready();
  if(!gate.ok) return { ok: false, message: gate.message, rows: [] };
  const q = String(name || "").trim();
  if(!q) return { ok: false, message: "表示名を入力してください。", rows: [] };
  try{
    const snap = await fb().getDocs(
      fb().query(fb().collection(db(), "leaderboard"), fb().where("displayName", "==", q), fb().limit(10)),
    );
    const rows = [];
    snap.forEach(d => {
      if(d.id === me()) return;   // 自分自身は候補に出さない
      const r = d.data() || {};
      rows.push({ uid: d.id, name: r.displayName || "", level: r.overallLevel || 0, wins: r.vgWins || 0 });
    });
    if(!rows.length) return { ok: true, rows: [], message: "その表示名の人は見つかりませんでした。" };
    return { ok: true, rows };
  }catch(e){
    console.error("friend search failed:", e);
    return { ok: false, message: "検索できませんでした。通信状況をご確認ください。", rows: [] };
  }
}

/* フレンド申請を送る。既に関係があれば何もしない（二重申請の防止）。
   申請と承認の判定・書き込みをトランザクション内で不可分に行うので、
   両者が同時に申請しても関係が壊れない。 */
export async function friendRequest(otherUid, myName, otherName){
  const gate = ready();
  if(!gate.ok) return gate;
  if(!otherUid || otherUid === me()) return { ok: false, message: "自分自身にはフレンド申請できません。" };
  const id = friendPairId(me(), otherUid);
  try{
    return await fb().runTransaction(db(), async (tx) => {
      const ref = fb().doc(db(), FRIENDS, id);
      const snap = await tx.get(ref);
      if(snap.exists()){
        const d = snap.data() || {};
        if(d.status === "accepted") return { ok: false, message: "すでにフレンドです。" };
        if(d.requestedBy === me()) return { ok: false, message: "すでに申請を送っています。相手の承認をお待ちください。" };
        // 相手からの申請が既にあった＝お互いに申請したので、その場で成立させる
        tx.set(ref, { status: "accepted", acceptedAt: nowISO(), updatedAt: nowISO() }, { merge: true });
        return { ok: true, accepted: true, message: "フレンドになりました。" };
      }
      const [a, b] = [me(), otherUid].sort();
      tx.set(ref, {
        a, b,
        members: [a, b],
        requestedBy: me(),
        status: "pending",
        names: { [me()]: String(myName || "").slice(0, 20), [otherUid]: String(otherName || "").slice(0, 20) },
        createdAt: nowISO(),
        updatedAt: nowISO(),
      });
      return { ok: true, accepted: false, message: "フレンド申請を送りました。" };
    });
  }catch(e){
    console.error("friend request failed:", e);
    return { ok: false, message: "申請できませんでした。通信状況をご確認ください。" };
  }
}

/* 届いた申請を承認する。申請を送った本人が自分で承認することはできない */
export async function friendAccept(otherUid){
  const gate = ready();
  if(!gate.ok) return gate;
  const id = friendPairId(me(), otherUid);
  try{
    return await fb().runTransaction(db(), async (tx) => {
      const ref = fb().doc(db(), FRIENDS, id);
      const snap = await tx.get(ref);
      if(!snap.exists()) return { ok: false, message: "その申請は取り消されました。" };
      const d = snap.data() || {};
      if(d.status === "accepted") return { ok: true, message: "すでにフレンドです。" };
      if(d.requestedBy === me()) return { ok: false, message: "自分が送った申請は自分では承認できません。" };
      tx.set(ref, { status: "accepted", acceptedAt: nowISO(), updatedAt: nowISO() }, { merge: true });
      return { ok: true, message: "フレンドになりました。" };
    });
  }catch(e){
    console.error("friend accept failed:", e);
    return { ok: false, message: "承認できませんでした。通信状況をご確認ください。" };
  }
}

/* 申請の辞退・フレンドの解除。どちらも関係の削除で表す */
export async function friendRemove(otherUid){
  const gate = ready();
  if(!gate.ok) return gate;
  try{
    await fb().deleteDoc(fb().doc(db(), FRIENDS, friendPairId(me(), otherUid)));
    return { ok: true };
  }catch(e){
    console.error("friend remove failed:", e);
    return { ok: false, message: "削除できませんでした。通信状況をご確認ください。" };
  }
}

/* 自分に関係するフレンド情報をまとめて取得する。
   戻り値 { friends:[], incoming:[], outgoing:[] }
     friends  … 成立済み
     incoming … 相手から届いていて、自分の承認待ち
     outgoing … 自分が送っていて、相手の承認待ち  */
export async function friendList(){
  const gate = ready();
  if(!gate.ok) return { ok: false, message: gate.message, friends: [], incoming: [], outgoing: [] };
  try{
    const snap = await fb().getDocs(
      fb().query(fb().collection(db(), FRIENDS), fb().where("members", "array-contains", me()), fb().limit(MAX_FRIENDS)),
    );
    const friends = [], incoming = [], outgoing = [];
    snap.forEach(doc => {
      const d = doc.data() || {};
      const other = d.a === me() ? d.b : d.a;
      if(!other) return;
      const row = { uid: other, name: (d.names || {})[other] || "エンジニア", at: d.updatedAt || d.createdAt || "" };
      if(d.status === "accepted") friends.push(row);
      else if(d.requestedBy === me()) outgoing.push(row);
      else incoming.push(row);
    });
    const byName = (x, y) => String(x.name).localeCompare(String(y.name), "ja");
    friends.sort(byName); incoming.sort(byName); outgoing.sort(byName);
    return { ok: true, friends, incoming, outgoing };
  }catch(e){
    console.error("friend list failed:", e);
    return { ok: false, message: "フレンドを読み込めませんでした。", friends: [], incoming: [], outgoing: [] };
  }
}

/* 成立済みフレンドのUIDだけを返す（報酬の判定やUIの絞り込み用） */
export async function friendUids(){
  const r = await friendList();
  return r.ok ? r.friends.map(f => f.uid) : [];
}

/* =========================================================================
   ルームへの招待
   ========================================================================= */

/* フレンドにルームコードを送る。宛先本人だけが受け取れる */
export async function friendInvite(toUid, roomCode, fromName, roomName){
  const gate = ready();
  if(!gate.ok) return gate;
  if(!toUid || !roomCode) return { ok: false, message: "招待を送れませんでした。" };
  try{
    const id = "i" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    await fb().setDoc(fb().doc(db(), INVITES, id), {
      toUid,
      fromUid: me(),
      fromName: String(fromName || "").slice(0, 20),
      roomCode: String(roomCode).slice(0, 12),
      roomName: String(roomName || "").slice(0, 24),
      at: nowISO(),
    });
    return { ok: true };
  }catch(e){
    console.error("friend invite failed:", e);
    return { ok: false, message: "招待を送れませんでした。通信状況をご確認ください。" };
  }
}

/* 自分宛ての招待をリアルタイムで受け取る。戻り値は購読解除の関数。
   受け取った招待は表示側へ渡した直後に削除する（同じ招待を何度も出さない）。
   30分以上前の招待は、もうルームが無い可能性が高いので黙って捨てる。 */
export function friendListenInvites(onInvite){
  const gate = ready();
  if(!gate.ok) return () => {};
  try{
    const q = fb().query(fb().collection(db(), INVITES), fb().where("toUid", "==", me()));
    return fb().onSnapshot(q, (snap) => {
      snap.docChanges().forEach(chg => {
        if(chg.type !== "added") return;
        const d = chg.doc.data() || {};
        fb().deleteDoc(fb().doc(db(), INVITES, chg.doc.id)).catch(() => {});
        if(Date.now() - new Date(d.at || 0).getTime() > 30 * 60 * 1000) return;
        try{ onInvite(d); }catch(e){}
      });
    }, () => {});
  }catch(e){
    console.error("friend invite listen failed:", e);
    return () => {};
  }
}
