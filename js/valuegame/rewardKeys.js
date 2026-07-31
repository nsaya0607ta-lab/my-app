/* =========================================================================
   🃏 価値観ゲームの報酬キー

   クライアント（js/bp/config.js の BP_AMOUNT）とサーバー
   （api/_lib/vgRewards.js）の両方が同じ名前を使うため、名前の定義だけを
   ここに切り出している。値（BP額）の正はサーバー側にあり、クライアントの
   BP_AMOUNT は表示・オフライン時のフォールバック用。
   ========================================================================= */
export const VG_AMOUNT_KEYS = {
  join: "gameJoin",
  finish: "gameFinish",
  coopWin: "gameCoopWin",
  perfect: "gamePerfect",
  firstWinToday: "gameFirstWinToday",
  withFriend: "gameWithFriend",
};
