/* =========================================================================
   🃏 価値観ゲームのBP付与（クライアント側の入口）

   BPの付与額はサーバー（/api/valuegame?action=reward）が判定する。クライアントは
   「このゲームIDのゲームが終わった」という事実だけを送り、サーバーが
   ・ゲームIDでの二重付与チェック（同じ結果を何度送っても1回だけ）
   ・1日のゲーム参加BPの上限
   ・開始直後の退出・放置プレイヤーの除外
   ・短時間に同じ相手と繰り返し遊んだ場合の減額
   を判定して、確定した内訳を返す。クライアント側の計算結果は送らない
   （送っても採用されない）ので、通信を改ざんしてもBPは増やせない。

   ログインしていない（ゲストモード）／通信に失敗した場合は、サーバー判定を
   受けられないため、ローカルの台帳だけで控えめに付与するフォールバックへ
   切り替える。この場合もゲームIDによる二重付与防止は効く。
   ========================================================================= */
import { state } from '../state.js';
import { bpApplyGameRewards } from '../bp/store.js';
import { BP_AMOUNT } from '../bp/config.js';
import { vgRewardBreakdown } from './engine.js';

const REWARD_ENDPOINT = "/api/valuegame?action=reward";

// 同じゲームIDの送信が同時に走らないようにする（二重タップ・再描画対策）
const inFlight = new Set();

async function idToken(){
  if(!state.currentUser || typeof state.currentUser.getIdToken !== "function") return null;
  try{ return await state.currentUser.getIdToken(); }catch(e){ return null; }
}

/* ゲーム終了時に呼ぶ。戻り値 { items:[{reason,label,amount}], total, source }
   source は "server"（サーバー判定）| "local"（フォールバック）| "duplicate" */
export async function vgClaimRewards(ctx){
  const c = ctx || {};
  if(!c.gameId) return { items: [], total: 0, source: "duplicate" };
  if(inFlight.has(c.gameId)) return { items: [], total: 0, source: "duplicate" };
  inFlight.add(c.gameId);
  try{
    const token = await idToken();
    if(token){
      try{
        const res = await fetch(REWARD_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            gameId: c.gameId,
            mode: c.mode || "online",
            difficulty: c.difficulty || "normal",
            rounds: c.rounds || 0,
            clearedRounds: c.clearedRounds || 0,
            success: !!c.success,
            perfect: !!c.perfect,
            livesLeft: c.livesLeft || 0,
            answeredRounds: c.answeredRounds || 0,
            roomId: c.roomId || "",
            opponentIds: Array.isArray(c.opponentIds) ? c.opponentIds.slice(0, 16) : [],
          }),
        });
        if(res.ok){
          const data = await res.json();
          const items = Array.isArray(data.items) ? data.items : [];
          if(items.length){
            bpApplyGameRewards(c.gameId, items, { note: "チャッピーの価値観ゲーム" });
          }
          return { items, total: items.reduce((s, i) => s + (Number(i.amount) || 0), 0), source: "server", capped: !!data.capped };
        }
        // 409（同じゲームIDで付与済み）はエラーではなく「もう受け取っている」
        if(res.status === 409) return { items: [], total: 0, source: "duplicate" };
      }catch(e){
        console.error("valuegame reward request failed:", e);
      }
    }
    // フォールバック（未ログイン／通信失敗）：ローカル台帳のみで付与する
    return applyLocalFallback(c);
  } finally {
    inFlight.delete(c.gameId);
  }
}

/* サーバー判定を受けられない場合のローカル付与。
   1日上限は js/bp/store.js 側の game グループ上限がそのまま効く。 */
function applyLocalFallback(c){
  const breakdown = vgRewardBreakdown({
    participated: !!c.participated,
    finished: !!c.finished,
    success: !!c.success,
    perfect: !!c.perfect,
    firstWinToday: !!c.firstWinToday,
    // フレンドとのプレイ判定はサーバー側でしか検証できないため、
    // フォールバックでは加算しない（過大に配らない側へ倒す）
    withFriend: false,
  });
  const items = breakdown.map(b => ({ reason: b.reason, label: b.label, amount: BP_AMOUNT[b.reason] || 0 }));
  if(!items.length) return { items: [], total: 0, source: "local" };
  const r = bpApplyGameRewards(c.gameId, items, { note: "チャッピーの価値観ゲーム（オフライン判定）" });
  return { items, total: r.granted, source: "local" };
}
