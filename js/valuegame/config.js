/* =========================================================================
   🃏 チャッピーの価値観ゲーム：ルール定数・難易度・定型文

   ito形式の協力カードゲーム。1〜100の数字を配り、その数字を直接言わずに
   お題に沿った言葉で表現し、全員で小さい順を予想する。

   このアプリ独自のルール文・難易度名・リアクション文で構成している。
   ========================================================================= */

export const VG_MIN_NUMBER = 1;
export const VG_MAX_NUMBER = 100;

export const VG_MIN_PLAYERS = 2;
export const VG_MAX_PLAYERS = 10;

/* ---- 難易度 ---- */
export const VG_DIFFICULTIES = [
  {
    key: "easy", name: "やさしい", icon: "🌱",
    lives: 5, timeLimit: 0,
    desc: "ライフ5・制限時間なし。はじめての人におすすめ。",
    aiClarity: 0.85,   // チャッピーAIの回答の分かりやすさ（1に近いほど数字を推測しやすい）
  },
  {
    key: "normal", name: "ふつう", icon: "🌤️",
    lives: 3, timeLimit: 0,
    desc: "ライフ3。標準のバランス。",
    aiClarity: 0.6,
  },
  {
    key: "hard", name: "むずかしい", icon: "🔥",
    lives: 2, timeLimit: 90,
    desc: "ライフ2・制限時間あり（1ラウンド90秒）。",
    aiClarity: 0.38,
  },
];

export function vgDifficulty(key){
  return VG_DIFFICULTIES.find(d => d.key === key) || VG_DIFFICULTIES[1];
}

export const VG_MAX_ROUNDS = 5;
export const VG_DEFAULT_ROUNDS = 3;

/* ---- ルール説明（ゲーム開始前に必ず案内する） ----
   禁止表現の自動判定は完全にはできないため、「何がダメか」を
   具体例つきで先に共有してもらう方式にしている ---- */
export const VG_RULES = {
  flow: [
    "各プレイヤーに1〜100の数字が1枚ずつ配られます。",
    "自分の数字は自分だけが確認できます（ボタンを長押ししている間だけ表示）。",
    "全員に共通のお題が1つ出ます。お題には「1がどんな状態か」「100がどんな状態か」が必ず書いてあります。",
    "自分の数字を直接言わず、その大きさを表す言葉で表現します。",
    "会話しながら、数字が小さいと思う順にカードを並べます。",
    "全員が確定したら数字を公開。小さい順に並んでいれば成功です。",
  ],
  forbidden: [
    "数字そのものを言う（例：「57」）",
    "範囲を示す（例：「50より上」「2桁」「90くらい」）",
    "位置を示す（例：「真ん中より少し上」「上から3番目くらい」）",
    "数式・計算で表す（例：「10かける5より少し多い」）",
    "単位を置き換えただけの表現（例：「時速◯◯キロ」「◯◯円」「◯◯段階中の◯」）",
  ],
  note: "禁止表現はアプリ側では完全には判定できません。みんなが楽しく遊べるよう、上のルールを守ってから始めてください。数字が分かってしまう言い方をした人を責めるのではなく、次のラウンドで気をつければ大丈夫です。",
};

/* ---- 定型リアクション ---- */
export const VG_REACTIONS = [
  { key: "higher",  label: "もっと上だと思う", icon: "⬆️" },
  { key: "lower",   label: "もっと下だと思う", icon: "⬇️" },
  { key: "close",   label: "近そう",           icon: "🎯" },
  { key: "clear",   label: "分かりやすい",     icon: "💡" },
  { key: "hard",    label: "難しい",           icon: "😵" },
  { key: "strong",  label: "それは強い",       icon: "💪" },
  { key: "unsure",  label: "迷う",             icon: "🌀" },
  { key: "isee",    label: "なるほど",         icon: "🙌" },
];

/* ---- チャッピーのスタンプ（表情） ---- */
export const VG_STAMPS = [
  { key: "happy",   label: "うれしい",   face: "(◍•ᴗ•◍)" },
  { key: "think",   label: "かんがえ中", face: "(  •_•)?" },
  { key: "wow",     label: "びっくり",   face: "( ﾟдﾟ)!" },
  { key: "cheer",   label: "がんばれ",   face: "٩(๑•̀ω•́๑)۶" },
  { key: "sweat",   label: "あせあせ",   face: "(´･ω･`;)" },
  { key: "love",    label: "だいすき",   face: "(｡♡‿♡｡)" },
  { key: "sleepy",  label: "ねむい",     face: "(－_－) zzZ" },
  { key: "yay",     label: "やったー",   face: "＼(^o^)／" },
];

/* ---- 称号（実績） ----
   kind:"plays"|"wins"|"streak"|"perfect"|"friends"|"soloWins" */
export const VG_TITLES = [
  { id: "t-first",    icon: "🌱", name: "はじめての価値観",     desc: "はじめて1ゲームを完了する",       kind: "plays",    need: 1 },
  { id: "t-reader",   icon: "🔍", name: "意図を読む人",         desc: "5回成功する",                     kind: "wins",     need: 5 },
  { id: "t-win10",    icon: "🏆", name: "10回成功",             desc: "10回成功する",                    kind: "wins",     need: 10 },
  { id: "t-master",   icon: "👑", name: "価値観マスター",       desc: "30回成功する",                    kind: "wins",     need: 30 },
  { id: "t-buddy",    icon: "🐾", name: "チャッピーとの名コンビ", desc: "1人用モードで10回成功する",      kind: "soloWins", need: 10 },
  { id: "t-perfect",  icon: "✨", name: "パーフェクト達成",     desc: "一度もライフを減らさずに成功する", kind: "perfect",  need: 1 },
  { id: "t-streak5",  icon: "🔥", name: "連勝の勢い",           desc: "5連続で成功する",                 kind: "streak",   need: 5 },
  { id: "t-social",   icon: "🤝", name: "100人と交流",          desc: "のべ100人と一緒に遊ぶ",           kind: "friends",  need: 100 },
];

/* ---- 結果画面の文言（失敗時も責めない） ---- */
export const VG_RESULT_LINES = {
  successTitle: "そろった！",
  successBody: "みんなの価値観がぴったり重なりました。",
  failTitle: "惜しい！",
  failBody: "価値観の違いも面白いね",
  clearTitle: "ゲームクリア！",
  clearBody: "最後までライフを守りきりました。",
  overTitle: "ここまで！",
  overBody: "ライフはなくなったけれど、たくさんの価値観が見られました。またあそぼう。",
};

/* ---- ルームコードの長さ ---- */
export const VG_ROOM_CODE_LENGTH = 6;
