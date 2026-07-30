/* =========================================================================
   🎖️ 「今日ぶんのBP判定」をまとめて走らせる入口

   ログインボーナスと週次の達成率ボーナスは、
   ・ログイン中のユーザーIDが確定してから（＝どのユーザーの台帳へ入れるかが
     決まってから）
   ・1日に1回だけ
   走らせる必要がある。render()はアプリ全体で何度も呼ばれるため、ここで
   スロットリングして「重い集計を毎回やらない」「同じ日に何度も判定しない」
   の両方を担保する。

   実際の重複防止（同じ日に二度ログインBPを配らない等）は store.js 側の
   once/dedupeキーで担保しているので、ここでの間引きが漏れても
   二重付与にはならない。
   ========================================================================= */
import { state } from '../state.js';
import { bpOnDailyLogin, bpTodayKey } from './store.js';
import { checkWeeklyBonuses } from './weekly.js';

let lastCheckedFor = null;   // "uid::YYYY-MM-DD"
let lastWeeklyAt = 0;

export function bpDailyCheck(){
  // 認証の解決前（どのユーザーか不明）は何もしない。ゲストモードは
  // 「guest」の台帳として扱ってよいので対象に含める
  if(!state.guestMode && (!state.authReady || !state.currentUser)) return;

  const uid = state.currentUserId || "guest";
  const token = `${uid}::${bpTodayKey()}`;
  if(lastCheckedFor !== token){
    lastCheckedFor = token;
    try{ bpOnDailyLogin(); }catch(e){ console.error("bp daily login failed:", e); }
  }

  // 週次の達成率は予定・タスクを7日ぶん走査するので、最短でも60秒間隔に抑える
  const now = Date.now();
  if(now - lastWeeklyAt > 60000){
    lastWeeklyAt = now;
    try{ checkWeeklyBonuses(); }catch(e){ console.error("bp weekly check failed:", e); }
  }
}

// ユーザーが切り替わったら判定し直せるようにする（別アカウントでログインした
// 直後に、そのアカウントのログインボーナスが入るように）
export function bpDailyResetToken(){ lastCheckedFor = null; lastWeeklyAt = 0; }
