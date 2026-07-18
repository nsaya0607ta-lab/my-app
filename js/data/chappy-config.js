/* =========================================================================
   🏠 チャッピーハウス：設定（経験値・コイン・上限・成長段階・ごはん・セリフ）
   数値バランスを変えたいときはこのファイルだけを編集すれば済むよう、
   付与量・1日上限・成長段階のしきい値をすべてここへ集約する。
   ========================================================================= */

// 経験値（XP）の付与量。キーは js/chappy.js の各 chappyOn〜() が参照する
export const CHAPPY_XP = {
  taskDone: 10,        // タスクを1件完了
  scheduleDone: 15,    // 予定を1件完了（連携元イベント未実装：chappyOnScheduleCompleted）
  linuxCorrect: 5,     // Linux問題に1問正解
  scenarioClear: 30,   // Linuxシナリオを1件クリア
  studyLog: 10,        // 学習記録を1件登録（連携元イベント未実装：chappyOnStudyLogAdded）
  newsOpen: 3,         // ニュースを1件開く
  newsSave: 5,         // ニュースを1件保存（連携元イベント未実装：chappyOnNewsSaved）
  dailyLogin: 5,       // 1日1回の利用
  streak7: 50,         // 7日連続利用（7日ごと）
  certPass: 500,       // 資格合格記録（連携元イベント未実装：chappyOnCertPassed）
  lineboundFirstClear: 15, // ラインバウンド：ステージ初回クリア（ステージごとに一度だけ）
  lineboundStar3: 20,      // ラインバウンド：星3達成（ステージごとに一度だけ）
};

// コインの付与量
export const CHAPPY_COIN = {
  taskDone: 5,         // タスク完了ごと
  linuxPer5Correct: 10,// Linux問題を5問正解するごと
  allSchedulesDone: 20,// その日の予定をすべて完了（連携元イベント未実装）
  streak7: 100,        // 7日連続利用（7日ごと）
  monthlyGoal: 300,    // 月間目標達成（連携元イベント未実装：chappyOnMonthlyGoalAchieved）
  lineboundFirstClear: 2,  // ラインバウンド：ステージ初回クリア（ステージごとに一度だけ）
  lineboundStar3: 1,       // ラインバウンド：星3達成（ステージごとに一度だけ）
};

// 連打・不正加算対策の1日上限（回数ベース）
export const CHAPPY_DAILY_CAPS = {
  taskDone: 10,        // XP/コインが付くタスク完了は1日10件まで
  linuxCorrect: 30,    // XPが付くLinux正解は1日30問まで
  newsOpen: 5,         // XPが付くニュース閲覧は1日5件まで
  newsSave: 5,
  pet: 15,             // なかよし度が上がる「なでる」は1日15回まで
  stocksView: 3,       // 株価・経済ポイントが付く株価画面の閲覧は1日3回まで
  scheduleDone: 10,
  studyLog: 5,
};

// 成長段階（総XPのしきい値）。将来の最終進化・分岐進化は branches に追加する
export const CHAPPY_STAGES = [
  { key: "egg",   name: "たまご",   minXp: 0    },
  { key: "baby",  name: "ベビー",   minXp: 50   },
  { key: "kids",  name: "キッズ",   minXp: 300  },
  { key: "grown", name: "成長体",   minXp: 1000 },
];

/* 将来の進化分岐（現時点ではデータ構造のみ。判定・見た目は未実装）。
   各分野の活動ポイント（state.points）が判定材料になる想定 */
export const CHAPPY_BRANCHES = [
  { key: "study",   name: "こまるチャピ",     pointKey: "learn"  },
  { key: "task",    name: "おてつだいチャピ", pointKey: "task"   },
  { key: "news",    name: "しりたがりチャピ", pointKey: "news"   },
  { key: "finance", name: "おかねチャピ",     pointKey: "stocks" },
  { key: "balance", name: "まるまるチャピ",   pointKey: "balance" },
];

// ごはんアイテム（コイン消費で使用。ステータス最大値は CHAPPY_STAT_MAX）
export const CHAPPY_FOODS = [
  { key: "onigiri", name: "おにぎり",     icon: "🍙", cost: 10, hunger: 10, bond: 0, genki: 0,  desc: "お腹 +10" },
  { key: "cake",    name: "ケーキ",       icon: "🍰", cost: 25, hunger: 20, bond: 5, genki: 0,  desc: "お腹 +20・なかよし度 +5" },
  { key: "cookie",  name: "知識クッキー", icon: "🍪", cost: 15, hunger: 0,  bond: 3, genki: 0,  desc: "なかよし度 +3" },
  { key: "juice",   name: "元気ジュース", icon: "🧃", cost: 20, hunger: 0,  bond: 0, genki: 20, desc: "元気 +20" },
];

export const CHAPPY_STAT_MAX = 100;

// レベルアップに必要なXP：Lv1→2は20XP、以降1レベルごとに+10XPずつ増える
export function chappyXpToNext(level){ return 20 + (level - 1) * 10; }

// なでる1回あたりのなかよし度上昇量
export const CHAPPY_PET_BOND_GAIN = 1;

// 状況別のセリフ（吹き出し）。ランダムに1つ選んで一定時間表示する
export const CHAPPY_LINES = {
  greet:      ["おかえり〜！", "きょうもがんばろ〜", "いっしょにがんばる〜"],
  morning:    ["おはよ〜！", "あさだよ〜、のびのび〜"],
  night:      ["ねむくなってきた…", "そろそろおやすみ〜？"],
  taskDone:   ["ひとつ終わったね、えらい！", "やったね〜！"],
  levelUp:    ["レベルアップしたよ〜！", "つよくなった…かも！"],
  nearLevel:  ["もうすこしでレベルアップだよ！"],
  eat:        ["ごはん、おいしい〜", "もぐもぐ…しあわせ〜"],
  petted:     ["なでてくれてうれしい！", "えへへ〜"],
  hungry:     ["おなかすいた〜…", "ごはん、まだかな…"],
  rest:       ["ちょっと休けいしよっか"],
  idle:       ["ふぁ〜…", "ひなたぼっこ〜"],
  preparing:  ["じゅんびちゅうだよ〜！もうすこし待っててね"],
};
