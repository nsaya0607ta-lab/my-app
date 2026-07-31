// 🃏 価値観ゲームのBP報酬：金額とルールの「正」はここ（サーバー側）にある。
// クライアント（js/bp/config.js）にも同じ数値があるが、それは表示と
// オフライン時のフォールバック専用で、実際の付与額はこの表で決まる。

// 1回あたりの付与額
const VG_REWARDS = {
  gameJoin: 2,            // ゲームへ参加
  gameFinish: 5,          // 1ゲーム完了
  gameCoopWin: 10,        // 協力モード成功
  gamePerfect: 10,        // パーフェクト成功（追加）
  gameFirstWinToday: 10,  // 本日の初勝利（追加）
  gameWithFriend: 5,      // フレンドとプレイ（追加）
};

const VG_LABELS = {
  gameJoin: "ゲームへ参加",
  gameFinish: "1ゲーム完了",
  gameCoopWin: "協力モード成功",
  gamePerfect: "パーフェクト成功",
  gameFirstWinToday: "本日の初勝利",
  gameWithFriend: "フレンドとプレイ",
};

// 1日にゲームから受け取れるBPの上限
const VG_DAILY_CAP = 40;

// 同じ相手と短時間に繰り返し遊んだ場合の減額
//  ・直近この時間内に同じ相手と遊んでいたら対象
const VG_REPEAT_WINDOW_MS = 30 * 60 * 1000;
//  ・2回目以降は報酬をこの割合にする（切り上げ）
const VG_REPEAT_RATE = 0.5;

// 「参加した」とみなす最低条件：これ以上のラウンドで回答していること。
// 開始直後に抜けた・ずっと放置していた場合は参加報酬も付けない
const VG_MIN_ANSWERED_ROUNDS = 1;

// 日本時間の日付キー（アプリ内の他の日次判定と揃える）
function jstDateKey(d) {
  const t = d || new Date();
  const jst = new Date(t.getTime() + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${jst.getUTCFullYear()}-${p(jst.getUTCMonth() + 1)}-${p(jst.getUTCDate())}`;
}

/* 報酬の内訳を組み立てる。
   ctx: {
     answeredRounds, finished, success, perfect, firstWinToday, withFriend, repeat
   }
   戻り値: [{ reason, label, amount }] */
function buildRewards(ctx) {
  const c = ctx || {};
  const participated = Number(c.answeredRounds || 0) >= VG_MIN_ANSWERED_ROUNDS;
  if (!participated) return [];   // 即退出・放置には参加報酬すら付けない

  const items = [];
  const add = (reason) => items.push({ reason, label: VG_LABELS[reason], amount: VG_REWARDS[reason] });

  add("gameJoin");
  if (c.finished) add("gameFinish");
  if (c.finished && c.success) add("gameCoopWin");
  if (c.finished && c.success && c.perfect) add("gamePerfect");
  if (c.finished && c.success && c.firstWinToday) add("gameFirstWinToday");
  if (c.finished && c.withFriend) add("gameWithFriend");

  // 同じ相手との短時間の連続プレイは報酬を減らす
  if (c.repeat) {
    items.forEach((i) => { i.amount = Math.max(1, Math.ceil(i.amount * VG_REPEAT_RATE)); });
  }
  return items;
}

// 1日上限に収まるよう内訳を切り詰める。
// 戻り値 { items, total, capped }
function applyDailyCap(items, alreadyToday) {
  let room = Math.max(0, VG_DAILY_CAP - Math.max(0, Number(alreadyToday) || 0));
  const out = [];
  let capped = false;
  for (const i of items) {
    if (room <= 0) { capped = true; break; }
    const amount = Math.min(i.amount, room);
    if (amount < i.amount) capped = true;
    out.push({ ...i, amount });
    room -= amount;
  }
  return { items: out, total: out.reduce((s, i) => s + i.amount, 0), capped };
}

module.exports = {
  VG_REWARDS, VG_LABELS, VG_DAILY_CAP, VG_REPEAT_WINDOW_MS, VG_MIN_ANSWERED_ROUNDS,
  buildRewards, applyDailyCap, jstDateKey,
};
