/* =========================================================================
   🃏 チャッピーの価値観ゲーム：DOM非依存の小さな計算

   数字の配布・並び順の判定はサーバー（api/valuegame/_deal.js・_reveal.js）が
   行うため、ここに残しているのは画面表示のための言い換えと、
   報酬（BP）の内訳の計算だけ。
   ========================================================================= */
import { VG_AMOUNT_KEYS } from './rewardKeys.js';

/* 「今回の価値観のズレ」（0〜100）への一言。0なら全員の感覚が一致、
   数字が大きいほど感じ方が違ったということ（悪いことではない）。 */
export function vgGapComment(gap){
  if(gap === 0) return "全員の感じ方がぴったり重なりました。";
  if(gap <= 20) return "ほとんど同じ感覚でした。息ぴったりです。";
  if(gap <= 45) return "少しだけ感じ方が違いました。そこが面白いところ。";
  if(gap <= 70) return "けっこう感じ方が分かれました。話し合いがいがありますね。";
  return "感じ方が大きく違いました。価値観の違いも面白いね。";
}

/* 報酬（BP）の内訳を計算する。

   ここで返すのは「本来もらえるはずの内訳」であって、確定額ではない。
   ログイン中は同じ計算をサーバー（/api/valuegame?action=reward）が改めて行い、
   1日上限・ゲームIDの二重送信・放置/即退出を判定したうえで確定させる。
   クライアント側のこの関数は、結果画面の表示と、通信に失敗したときの
   フォールバックにだけ使う。

   ctx: {
     finished       … ゲームを最後まで終えたか
     success        … 協力モードとして成功したか（規定ラウンドをクリア）
     perfect        … 一度もライフを失わなかったか
     firstWinToday  … 本日の初勝利か
     withFriend     … フレンドと一緒に遊んだか
     participated   … 参加とみなせるか（開始直後の退出・放置ではない）
   } */
export function vgRewardBreakdown(ctx){
  const c = ctx || {};
  const items = [];
  if(c.participated) items.push({ reason: VG_AMOUNT_KEYS.join, label: "ゲームへ参加" });
  if(c.finished) items.push({ reason: VG_AMOUNT_KEYS.finish, label: "1ゲーム完了" });
  if(c.success) items.push({ reason: VG_AMOUNT_KEYS.coopWin, label: "協力モード成功" });
  if(c.success && c.perfect) items.push({ reason: VG_AMOUNT_KEYS.perfect, label: "パーフェクト成功" });
  if(c.success && c.firstWinToday) items.push({ reason: VG_AMOUNT_KEYS.firstWinToday, label: "本日の初勝利" });
  if(c.finished && c.withFriend) items.push({ reason: VG_AMOUNT_KEYS.withFriend, label: "フレンドとプレイ" });
  return items;
}
