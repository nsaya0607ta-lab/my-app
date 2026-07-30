/* =========================================================================
   🏠 チャッピーハウス：設定（経験値・コイン・上限・成長段階・お世話・部屋）

   数値バランスを変えたいときはこのファイルだけを編集すれば済むよう、
   付与量・1日上限・成長段階のしきい値・部屋レベルをすべてここへ集約する。
   家具や衣装などの「モノ」は js/data/chappy-items.js、セリフは
   js/data/chappy-lines.js、ミッション・イベントは js/data/chappy-quests.js。
   ========================================================================= */

// 経験値（XP）の付与量。キーは js/chappy.js の各 chappyOn〜() が参照する
export const CHAPPY_XP = {
  taskDone: 10,        // タスクを1件完了
  scheduleDone: 15,    // 予定を1件完了
  linuxCorrect: 5,     // Linux問題に1問正解
  scenarioClear: 30,   // Linuxシナリオを1件クリア
  studyLog: 10,        // 学習記録を1件登録
  studySession: 12,    // 演習・試験を1回やりきった
  studyMinute: 1,      // 学習1分あたり（30分で+30XP。1日上限あり）
  newsOpen: 3,         // ニュースを1件開く
  newsSave: 5,         // ニュースを1件保存
  dailyLogin: 5,       // 1日1回の利用
  streak7: 50,         // 7日連続利用（7日ごと）
  certPass: 500,       // 資格合格記録
  calendarAdd: 6,      // カレンダーに予定を登録
  gcalSync: 8,         // Googleカレンダーと同期
  missionClear: 0,     // ミッション報酬は個別定義（js/data/chappy-quests.js）
  lightpuzzleFirstClear: 15, // ライト消しパズル：ステージ初回クリア（ステージごとに一度だけ）
  lightpuzzleStar3: 20,      // ライト消しパズル：星3達成（ステージごとに一度だけ）
};

// コインの付与量
export const CHAPPY_COIN = {
  taskDone: 5,         // タスク完了ごと
  linuxPer5Correct: 10,// Linux問題を5問正解するごと
  studySession: 8,     // 演習・試験を1回やりきった
  allSchedulesDone: 20,// その日の予定をすべて完了
  streak7: 100,        // 7日連続利用（7日ごと）
  monthlyGoal: 300,    // 月間目標達成
  calendarAdd: 3,      // カレンダーに予定を登録
  gcalSync: 15,        // Googleカレンダーと同期（1日1回）
  lightpuzzleFirstClear: 20, // ライト消しパズル：ステージ初回クリア（ステージごとに一度だけ）
  lightpuzzleStar3: 15,      // ライト消しパズル：星3達成（ステージごとに一度だけ）
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
  studySession: 6,     // XPが付く演習・試験のやりきりは1日6回まで
  studyMinute: 60,     // 学習時間ボーナスは1日60分まで
  calendarAdd: 5,      // 予定登録ボーナスは1日5件まで
  gcalSync: 1,         // Googleカレンダー同期ボーナスは1日1回
  care: 12,            // お世話（おふろ・ねかしつけ等）は1日12回まで報酬あり
};

/* 成長段階（総XPのしきい値）。既存ユーザーの段階が下がらないよう、
   egg/baby/kids/grown のしきい値は据え置いたまま上位2段階を追加している */
export const CHAPPY_STAGES = [
  { key: "egg",    name: "たまご",   minXp: 0,    scale: 1.00, note: "うまれるまえ" },
  { key: "baby",   name: "赤ちゃん", minXp: 50,   scale: 0.80, note: "よちよち期" },
  { key: "kids",   name: "子ども",   minXp: 300,  scale: 0.92, note: "やんちゃ期" },
  { key: "grown",  name: "成長体",   minXp: 1000, scale: 1.02, note: "しっかり者" },
  { key: "adult",  name: "大人",     minXp: 3000, scale: 1.10, note: "たよれる相棒" },
  { key: "master", name: "マスター", minXp: 8000, scale: 1.16, note: "きわめし者" },
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

export const CHAPPY_STAT_MAX = 100;

/* お世話ステータス。
   ・decayMin … 何分でおおよそ1ポイント動くか（0なら自然変化しない）
   ・floor    … 放置してもここより悪くならない下限（極端なペナルティなし）
   ・invert   … true は「高いほど困る」ステータス（ストレス）
   ・derived  … true は他の状態から自動計算する（おしゃれ）           */
export const CHAPPY_CARE_STATS = [
  { key: "genki",  label: "元気",       icon: "⚡",  decayMin: 90,  floor: 40, invert: false, color: "genki"  },
  { key: "hunger", label: "お腹",       icon: "🍙",  decayMin: 45,  floor: 15, invert: false, color: "hunger" },
  { key: "clean",  label: "清潔",       icon: "🫧",  decayMin: 120, floor: 30, invert: false, color: "clean"  },
  { key: "sleep",  label: "睡眠",       icon: "🌙",  decayMin: 100, floor: 25, invert: false, color: "sleep"  },
  { key: "fun",    label: "楽しさ",     icon: "🎈",  decayMin: 150, floor: 30, invert: false, color: "fun"    },
  { key: "style",  label: "おしゃれ",   decayMin: 0, floor: 0,  invert: false, icon: "✨", derived: true, color: "style" },
  { key: "stress", label: "ストレス",   icon: "💭",  decayMin: 200, floor: 0,  invert: true,  color: "stress" },
  { key: "bond",   label: "なかよし度", icon: "💗",  decayMin: 0,   floor: 0,  invert: false, color: "bond"   },
];

// 自然変化するステータスのキー（ストレスだけ上がっていく）
export const CHAPPY_DECAY_STATS = CHAPPY_CARE_STATS.filter(s => s.decayMin > 0);

// ごはんアイテム（コイン消費で使用。ステータス最大値は CHAPPY_STAT_MAX）
export const CHAPPY_FOODS = [
  { key: "onigiri", name: "おにぎり",     icon: "🍙", cost: 10, effect: { hunger: 10 },                    desc: "お腹 +10" },
  { key: "cake",    name: "ケーキ",       icon: "🍰", cost: 25, effect: { hunger: 20, bond: 5 },           desc: "お腹 +20・なかよし度 +5" },
  { key: "cookie",  name: "知識クッキー", icon: "🍪", cost: 15, effect: { bond: 3, stress: -5 },           desc: "なかよし度 +3・ストレス -5" },
  { key: "juice",   name: "元気ジュース", icon: "🧃", cost: 20, effect: { genki: 20 },                     desc: "元気 +20" },
  { key: "soup",    name: "あったかスープ", icon: "🍲", cost: 30, effect: { hunger: 15, genki: 10, stress: -8 }, desc: "お腹 +15・元気 +10・ストレス -8" },
  { key: "parfait", name: "ごほうびパフェ", icon: "🍨", cost: 45, effect: { hunger: 25, fun: 15, bond: 8 },     desc: "お腹 +25・楽しさ +15・なかよし度 +8" },
];

/* お世話メニュー（ごはん以外）。コインは使わず、1日上限つきで自由にできる。
   cooldownSec を置くことで連打による演出の暴走を防ぐ */
export const CHAPPY_CARES = [
  { key: "bath",    name: "おふろ",     icon: "🛁", effect: { clean: 30, stress: -10 },            anim: "chp-anim-splash", line: "bath",    desc: "清潔 +30・ストレス -10" },
  { key: "brush",   name: "ブラッシング", icon: "🪮", effect: { clean: 15, bond: 3 },              anim: "chp-anim-bounce", line: "brush",   desc: "清潔 +15・なかよし度 +3" },
  { key: "sleepy",  name: "ねかしつけ", icon: "🛏️", effect: { sleep: 30, genki: 10, stress: -8 }, anim: "chp-anim-sleep",  line: "sleepy",  desc: "睡眠 +30・元気 +10" },
  { key: "play",    name: "あそぶ",     icon: "🎲", effect: { fun: 25, bond: 4, genki: -5 },       anim: "chp-anim-jump",   line: "play",    desc: "楽しさ +25・なかよし度 +4" },
  { key: "massage", name: "マッサージ", icon: "💆", effect: { stress: -22, bond: 3 },              anim: "chp-anim-bounce", line: "massage", desc: "ストレス -22・なかよし度 +3" },
  { key: "stretch", name: "ストレッチ", icon: "🤸", effect: { genki: 18, stress: -6 },             anim: "chp-anim-stretch",line: "stretch", desc: "元気 +18・ストレス -6" },
];

// レベルアップに必要なXP：Lv1→2は20XP、以降1レベルごとに+10XPずつ増える
export function chappyXpToNext(level){ return 20 + (level - 1) * 10; }

// なでる1回あたりのなかよし度上昇量
export const CHAPPY_PET_BOND_GAIN = 1;

/* =========================================================================
   部屋レベル：コインで増築する。チャッピーのレベルが足りないと増築できない
   ＝「現実で頑張るほど家が広くなる」。slots は各フロアで使えるマス数。
   ========================================================================= */
export const CHAPPY_ROOM_LEVELS = [
  { level: 1,  cost: 0,    reqLv: 1,  slots: { f1: 3,  f2: 0,  garden: 0 }, unlock: "はじまりのおへや" },
  { level: 2,  cost: 150,  reqLv: 3,  slots: { f1: 5,  f2: 0,  garden: 0 }, unlock: "壁紙と床を変えられる" },
  { level: 3,  cost: 400,  reqLv: 6,  slots: { f1: 7,  f2: 0,  garden: 0 }, unlock: "お部屋テーマが選べる" },
  { level: 4,  cost: 800,  reqLv: 10, slots: { f1: 8,  f2: 4,  garden: 0 }, unlock: "2階がふえる" },
  { level: 5,  cost: 1400, reqLv: 14, slots: { f1: 9,  f2: 6,  garden: 0 }, unlock: "窓とカーテンを変えられる" },
  { level: 6,  cost: 2200, reqLv: 18, slots: { f1: 10, f2: 7,  garden: 4 }, unlock: "庭がふえる" },
  { level: 7,  cost: 3200, reqLv: 23, slots: { f1: 11, f2: 8,  garden: 6 }, unlock: "照明を変えられる" },
  { level: 8,  cost: 4600, reqLv: 28, slots: { f1: 12, f2: 9,  garden: 7 }, unlock: "テーマがもっと増える" },
  { level: 9,  cost: 6400, reqLv: 34, slots: { f1: 13, f2: 10, garden: 8 }, unlock: "屋根裏まで模様替えできる" },
  { level: 10, cost: 9000, reqLv: 40, slots: { f1: 14, f2: 11, garden: 9 }, unlock: "チャッピーの夢のおうち" },
];

export const CHAPPY_ROOM_MAX_LEVEL = CHAPPY_ROOM_LEVELS[CHAPPY_ROOM_LEVELS.length - 1].level;

// 部屋レベルごとの解放機能（部屋編集画面のタブ表示制御に使う）
export const CHAPPY_ROOM_FEATURE_LV = {
  wallpaper: 2,
  floor: 2,
  theme: 3,
  f2: 4,
  window: 5,
  curtain: 5,
  garden: 6,
  light: 7,
};

/* フロアごとの配置マス。左上からの％座標で、部屋レベルに応じて先頭から
   slots 個ぶんが解放される。kind は置ける家具の種類：
     floor … 床置き ／ wall … 壁掛け ／ hang … 天井から吊るす           */
export const CHAPPY_SLOTS = {
  f1: [
    { id: "f1-a", x: 20, y: 70, kind: "floor" },
    { id: "f1-b", x: 79, y: 70, kind: "floor" },
    { id: "f1-c", x: 50, y: 82, kind: "floor" },
    { id: "f1-d", x: 33, y: 34, kind: "wall"  },
    { id: "f1-e", x: 68, y: 34, kind: "wall"  },
    { id: "f1-f", x: 10, y: 57, kind: "floor" },
    { id: "f1-g", x: 90, y: 57, kind: "floor" },
    { id: "f1-h", x: 50, y: 14, kind: "hang"  },
    { id: "f1-i", x: 33, y: 57, kind: "floor" },
    { id: "f1-j", x: 66, y: 57, kind: "floor" },
    { id: "f1-k", x: 15, y: 34, kind: "wall"  },
    { id: "f1-l", x: 86, y: 34, kind: "wall"  },
    { id: "f1-m", x: 24, y: 84, kind: "floor" },
    { id: "f1-n", x: 76, y: 84, kind: "floor" },
  ],
  f2: [
    { id: "f2-a", x: 26, y: 70, kind: "floor" },
    { id: "f2-b", x: 74, y: 70, kind: "floor" },
    { id: "f2-c", x: 50, y: 30, kind: "wall"  },
    { id: "f2-d", x: 50, y: 82, kind: "floor" },
    { id: "f2-e", x: 13, y: 58, kind: "floor" },
    { id: "f2-f", x: 88, y: 58, kind: "floor" },
    { id: "f2-g", x: 22, y: 30, kind: "wall"  },
    { id: "f2-h", x: 78, y: 30, kind: "wall"  },
    { id: "f2-i", x: 50, y: 13, kind: "hang"  },
    { id: "f2-j", x: 36, y: 84, kind: "floor" },
    { id: "f2-k", x: 64, y: 84, kind: "floor" },
  ],
  garden: [
    { id: "gd-a", x: 18, y: 72, kind: "floor" },
    { id: "gd-b", x: 82, y: 72, kind: "floor" },
    { id: "gd-c", x: 50, y: 84, kind: "floor" },
    { id: "gd-d", x: 32, y: 55, kind: "floor" },
    { id: "gd-e", x: 68, y: 55, kind: "floor" },
    { id: "gd-f", x: 12, y: 55, kind: "floor" },
    { id: "gd-g", x: 88, y: 55, kind: "floor" },
    { id: "gd-h", x: 40, y: 84, kind: "floor" },
    { id: "gd-i", x: 62, y: 84, kind: "floor" },
  ],
};

export const CHAPPY_FLOORS = [
  { key: "f1",     label: "1階",  icon: "🏠", reqRoomLv: 1 },
  { key: "f2",     label: "2階",  icon: "🪜", reqRoomLv: CHAPPY_ROOM_FEATURE_LV.f2 },
  { key: "garden", label: "庭",   icon: "🌿", reqRoomLv: CHAPPY_ROOM_FEATURE_LV.garden },
];

// 互換のためセリフ集を再輸出する（旧コードは chappy-config から読み込んでいた）
export { CHAPPY_LINES } from './chappy-lines.js';
