/* =========================================================================
   🎖️ BP（総合ランクの経験値）獲得システム：付与額・上限・ミッション定義

   ここは「値の定義だけ」を持つデータファイル。付与判定・重複防止・
   永続化はすべて js/bp/store.js 側の責務。

   総合ランクは元々「各資格のBP合計」だけで決まっていたため、学習以外の
   行動からはランクが上がらなかった。この機能では資格BPとは別枠の
   「活動BP（activity BP）」を新設し、core.js の totalBP() で合算する。
   資格ごとの cert_*_bp には一切書き込まないので、資格レベル・履歴・
   ランキングの既存表示は今までどおり動く。
   ========================================================================= */

/* ---- 1回あたりの付与額 ---- */
export const BP_AMOUNT = {
  // 毎日の基本行動
  dailyLogin: 5,          // アプリへの初回ログイン（1日1回）
  scheduleAdd: 3,         // カレンダーへ予定を登録
  scheduleDone: 5,        // 登録した予定を完了
  taskDone: 3,            // タスクを1件完了
  allTasksDone: 10,       // その日のタスクをすべて完了
  studyLog: 5,            // 学習記録を登録（演習・試験・復習を1回終える）
  newsRead: 2,            // ニュースを1件確認
  chappyCare: 2,          // チャッピーのお世話

  // 継続ボーナス
  streak3: 10,            // 3日連続ログイン
  streak7: 30,            // 7日連続ログイン
  streak14: 60,           // 14日連続ログイン
  streak30: 150,          // 30日連続ログイン
  studyStreak7: 50,       // 7日連続学習
  weeklySchedule80: 50,   // 1週間の予定達成率80%以上
  weeklyTask100: 100,     // 1週間のタスク達成率100%

  // チャッピーハウス（初回達成）
  chappyFirstFeed: 10,    // はじめてごはんをあげた
  chappyFirstClean: 10,   // はじめて部屋を掃除した
  chappyFirstDressUp: 10, // はじめて着せ替えをした
  chappyFirstFurniture: 15, // はじめて家具を購入した
  chappyBond: 30,         // なかよし度が一定値に到達
  chappyLevelUp: 5,       // チャッピーのレベルが上がった
  chappySeasonEvent: 20,  // 季節イベントへ参加した

  // ゲーム（価値観ゲーム）
  gameJoin: 2,            // ゲームへ参加
  gameFinish: 5,          // 1ゲーム完了
  gameCoopWin: 10,        // 協力モード成功
  gamePerfect: 10,        // パーフェクト成功（追加）
  gameFirstWinToday: 10,  // 本日の初勝利（追加）
  gameWithFriend: 5,      // フレンドとプレイ（追加）
};

/* ---- 付与理由の表示ラベル（履歴・通知に使う） ---- */
export const BP_REASON_LABEL = {
  dailyLogin: "今日もようこそ",
  scheduleAdd: "予定を登録しました",
  scheduleDone: "予定を完了しました",
  taskDone: "タスクを完了しました",
  allTasksDone: "今日のタスクをすべて完了",
  studyLog: "学習を記録しました",
  newsRead: "ニュースを読みました",
  chappyCare: "チャッピーのお世話",
  streak3: "3日連続ログイン",
  streak7: "7日連続ログイン",
  streak14: "14日連続ログイン",
  streak30: "30日連続ログイン",
  studyStreak7: "7日連続で学習しました",
  weeklySchedule80: "今週の予定達成率80%達成",
  weeklyTask100: "今週のタスクを100%達成",
  chappyFirstFeed: "はじめてのごはん",
  chappyFirstClean: "はじめてのお掃除",
  chappyFirstDressUp: "はじめての着せ替え",
  chappyFirstFurniture: "はじめての家具",
  chappyBond: "チャッピーとなかよし",
  chappyLevelUp: "チャッピーがレベルアップ",
  chappySeasonEvent: "季節イベントに参加",
  gameJoin: "価値観ゲームに参加",
  gameFinish: "ゲームを完了しました",
  gameCoopWin: "協力モード成功",
  gamePerfect: "パーフェクト成功",
  gameFirstWinToday: "本日の初勝利",
  gameWithFriend: "フレンドとプレイ",
};

/* ---- 1日の獲得上限 ----
   全体上限（DAILY_TOTAL_CAP）に加えて、行動グループごとの上限も設ける。
   連打・同じ操作の繰り返しで大量獲得できないようにするため。
   継続ボーナス（連続ログイン・週次の達成率）と初回達成系は、そもそも
   回数が限られているので個別上限の対象外にし、全体上限だけを見る。 */
export const BP_DAILY_TOTAL_CAP = 100;

export const BP_DAILY_CAPS = {
  scheduleAdd: 15,   // 予定登録：1日5件分まで
  scheduleDone: 25,  // 予定完了：1日5件分まで
  taskDone: 15,      // タスク完了：1日5件分まで
  studyLog: 15,      // 学習記録：1日3回分まで
  newsRead: 10,      // ニュース確認：1日5件分まで
  chappyCare: 6,     // チャッピーのお世話：1日3回分まで
  game: 40,          // ゲーム関連の合計：1日40BPまで
};

// 各付与理由がどの上限グループに属するか（未掲載＝全体上限のみ）
export const BP_CAP_GROUP = {
  scheduleAdd: "scheduleAdd",
  scheduleDone: "scheduleDone",
  taskDone: "taskDone",
  studyLog: "studyLog",
  newsRead: "newsRead",
  chappyCare: "chappyCare",
  gameJoin: "game",
  gameFinish: "game",
  gameCoopWin: "game",
  gamePerfect: "game",
  gameFirstWinToday: "game",
  gameWithFriend: "game",
};

/* ---- デイリーミッション ----
   need … 当日その理由で付与された「回数」の目標。
   BPそのものは各行動の付与で入るため、ミッションは達成時に
   ボーナスBP（bonus）を1回だけ追加で付与する。 */
export const BP_DAILY_MISSIONS = [
  { id: "d-login",  icon: "🌅", title: "アプリを開く",           reason: "dailyLogin", need: 1, bonus: 0 },
  { id: "d-task",   icon: "✅", title: "タスクを2件完了する",     reason: "taskDone",   need: 2, bonus: 5 },
  { id: "d-sched",  icon: "📅", title: "予定を1件登録する",       reason: "scheduleAdd", need: 1, bonus: 3 },
  { id: "d-study",  icon: "📘", title: "学習を1回記録する",       reason: "studyLog",   need: 1, bonus: 5 },
  { id: "d-news",   icon: "📰", title: "ニュースを2件確認する",   reason: "newsRead",   need: 2, bonus: 3 },
  { id: "d-chappy", icon: "🐾", title: "チャッピーのお世話をする", reason: "chappyCare", need: 1, bonus: 3 },
  { id: "d-game",   icon: "🃏", title: "価値観ゲームを1回遊ぶ",   reason: "gameFinish", need: 1, bonus: 5 },
];

/* ---- ウィークリーミッション ----
   週（日曜はじまり）の合計回数で判定する */
export const BP_WEEKLY_MISSIONS = [
  { id: "w-login",  icon: "🗓️", title: "5日アプリを開く",         reason: "dailyLogin", need: 5,  bonus: 20 },
  { id: "w-task",   icon: "✅", title: "タスクを10件完了する",     reason: "taskDone",   need: 10, bonus: 25 },
  { id: "w-study",  icon: "📘", title: "学習を5回記録する",        reason: "studyLog",   need: 5,  bonus: 30 },
  { id: "w-sched",  icon: "📅", title: "予定を5件完了する",        reason: "scheduleDone", need: 5, bonus: 25 },
  { id: "w-game",   icon: "🃏", title: "価値観ゲームを3回遊ぶ",    reason: "gameFinish", need: 3,  bonus: 30 },
  { id: "w-news",   icon: "📰", title: "ニュースを7件確認する",    reason: "newsRead",   need: 7,  bonus: 20 },
];

/* ---- 実績（一度きり・累計での達成） ----
   kind:"count" … 指定reasonの累計回数、kind:"total" … 累計BP */
export const BP_ACHIEVEMENTS = [
  { id: "a-first",     icon: "🌱", title: "はじめの一歩",     desc: "はじめてBPを獲得する",         kind: "total", need: 1,    bonus: 5 },
  { id: "a-bp500",     icon: "🎖️", title: "コツコツ500",      desc: "累計500BPを獲得する",          kind: "total", need: 500,  bonus: 20 },
  { id: "a-bp2000",    icon: "🏅", title: "積み重ね2000",     desc: "累計2000BPを獲得する",         kind: "total", need: 2000, bonus: 50 },
  { id: "a-bp5000",    icon: "👑", title: "ランクの探究者",   desc: "累計5000BPを獲得する",         kind: "total", need: 5000, bonus: 100 },
  { id: "a-task50",    icon: "✅", title: "タスクマスター",   desc: "タスクを累計50件完了する",     kind: "count", reason: "taskDone",   need: 50, bonus: 30 },
  { id: "a-study30",   icon: "📘", title: "学びの習慣",       desc: "学習を累計30回記録する",       kind: "count", reason: "studyLog",   need: 30, bonus: 30 },
  { id: "a-news50",    icon: "📰", title: "ニュース通",       desc: "ニュースを累計50件確認する",   kind: "count", reason: "newsRead",   need: 50, bonus: 30 },
  { id: "a-streak7",   icon: "🔥", title: "1週間つづいた",     desc: "7日連続ログインを達成する",     kind: "count", reason: "streak7",    need: 1,  bonus: 20 },
  { id: "a-game10",    icon: "🃏", title: "価値観コレクター", desc: "価値観ゲームを10回完了する",   kind: "count", reason: "gameFinish", need: 10, bonus: 40 },
];

/* ---- 通知の表示時間（ミリ秒） ---- */
export const BP_TOAST_MS = 2400;

/* ---- 履歴の保持件数 ---- */
export const BP_LEDGER_MAX = 120;
