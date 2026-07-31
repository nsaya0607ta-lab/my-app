/* =========================================================================
   🃏 チャッピーの価値観ゲーム：ルール計算（DOM非依存の純粋ロジック）

   ・数字の配布（重複なし）
   ・並び順の判定（小さい順になっているか）
   ・「価値観のズレ」の計算
   ・報酬（BP）の内訳の計算

   1人用（solo.js）とオンライン（online.js）の両方から使う。
   ========================================================================= */
import { VG_AMOUNT_KEYS } from './rewardKeys.js';
import { VG_MAX_NUMBER, VG_MIN_NUMBER } from './config.js';

/* 重複なしで n 個の数字を配る（1〜100） */
export function vgDealNumbers(n){
  const pool = [];
  for(let i = VG_MIN_NUMBER; i <= VG_MAX_NUMBER; i++) pool.push(i);
  for(let i = pool.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  return pool.slice(0, Math.max(0, n));
}

/* 並び順の判定。
   order   … プレイヤーIDの配列（プレイヤーが「小さいと思う順」に並べたもの）
   numbers … { playerId: number }
   戻り値 {
     ok            … 完全に昇順なら true
     correctOrder  … 実際の昇順のプレイヤーID配列
     firstWrongAt  … 最初に順番が崩れた位置（0始まり）。okならnull
     ranks         … [{ playerId, number, guessRank, trueRank, diff }]
   } */
export function vgCheckOrder(order, numbers){
  const ids = order.slice();
  const correctOrder = ids.slice().sort((a, b) => numbers[a] - numbers[b]);
  let firstWrongAt = null;
  for(let i = 0; i < ids.length - 1; i++){
    if(numbers[ids[i]] > numbers[ids[i + 1]]){ firstWrongAt = i; break; }
  }
  const trueRankOf = {};
  correctOrder.forEach((id, i) => { trueRankOf[id] = i; });
  const ranks = ids.map((id, i) => ({
    playerId: id,
    number: numbers[id],
    guessRank: i,
    trueRank: trueRankOf[id],
    diff: Math.abs(i - trueRankOf[id]),
  }));
  return { ok: firstWrongAt === null, correctOrder, firstWrongAt, ranks };
}

/* 「今回の価値観のズレ」。予想順位と正しい順位の差の合計を、
   起こりうる最大のズレで割った0〜100の値。0なら全員の感覚が一致、
   数字が大きいほど感じ方が違ったということ（悪いことではない）。 */
export function vgValueGap(ranks){
  const n = ranks.length;
  if(n < 2) return 0;
  const sum = ranks.reduce((s, r) => s + r.diff, 0);
  // n枚の並びで生じうる順位差の合計の最大値（完全に逆順のとき）
  const max = (n % 2 === 0) ? (n * n / 2) : ((n * n - 1) / 2);
  return Math.round(sum / max * 100);
}

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
   クライアント側のこの関数は、結果画面の表示と、オフライン／ゲスト時の
   フォールバックにだけ使う。

   ctx: {
     finished       … ゲームを最後まで終えたか
     success        … 協力モードとして成功したか（規定ラウンドをクリア）
     perfect        … 一度もライフを失わなかったか
     firstWinToday  … 本日の初勝利か
     withFriend     … フレンド（実プレイヤー）と一緒に遊んだか
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
