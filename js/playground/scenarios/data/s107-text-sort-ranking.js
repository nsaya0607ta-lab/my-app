const SALES_FILE =
  "320 りんごジュース\n" +
  "85 バナナチップス\n" +
  "1200 コーヒー豆セット\n" +
  "410 紅茶ギフト\n" +
  "97 ミックスナッツ\n" +
  "560 クッキー詰め合わせ\n";

const RANKING_LINES = [
  "1200 コーヒー豆セット",
  "560 クッキー詰め合わせ",
  "410 紅茶ギフト",
  "320 りんごジュース",
  "97 ミックスナッツ",
  "85 バナナチップス",
];

export default {
  id: "s107",
  title: "売上ランキングを作りたい",
  difficulty: "初級〜中級",
  difficultyLevel: 1,
  category: "テキスト処理",
  requester: { name: "佐藤さん", role: "企画チーム", avatar: "🧑‍💼" },
  request: [
    "今月の商品別売上を sales.txt にまとめたんだけど、入力した順のままでバラバラなんだよね。",
    "売上の大きい順に並べ替えて、ranking.txt として保存してもらえない？会議でそのまま見せたいんだ。",
  ],
  initialEnv: {
    files: [{ path: "~/sales.txt", content: SALES_FILE }],
  },
  steps: [
    {
      id: "sort-try",
      label: "sort で sales.txt を並べ替えてみる",
      hint: [
        "行を並べ替えるには sort コマンドを使います。",
        "まずはオプションなしで実行して、どう並ぶか確認してみましょう。",
        "sort sales.txt と入力します。「1200」が「97」より前に来てしまうのは、文字として並べ替えているためです。",
      ],
      goal: { type: "commandRan", cmd: "sort" },
    },
    {
      id: "sort-ranking",
      label: "売上の大きい順（数値の降順）で ranking.txt に保存する",
      hint: [
        "数値として正しく並べ替えるには -n、逆順（大きい順）にするには -r オプションを使います。",
        "2つのオプションはまとめて -nr と書けます。保存には > を使います。",
        "sort -nr sales.txt > ranking.txt と入力します。",
      ],
      goal: {
        type: "custom",
        fn: (vfs) => {
          const res = vfs.readFile("~/ranking.txt");
          if(res.error) return false;
          const lines = res.content.split("\n").filter(Boolean);
          return lines.length === RANKING_LINES.length && RANKING_LINES.every((l, i) => lines[i] === l);
        },
      },
    },
  ],
  clearComment: "コーヒー豆セットが1位か〜！このまま会議資料に貼れるよ、ありがとう！",
  explanation: {
    why: "sort は行単位で並べ替えるコマンドです。注意すべきは、既定では「文字」として並べ替える点で、数値の 1200 と 97 を比べると先頭文字の 1 と 9 で判定されて 1200 が先に来てしまいます。数値として比較するには -n（numeric）を付け、大きい順にしたい場合はさらに -r（reverse）で逆順にします。",
    alternatives: "特定の列で並べ替えたい場合は -k オプションを使います（例: sort -k2 file で2列目基準）。また sort -u とすると並べ替えと同時に重複行の削除もできます。パイプの途中で使うことも多く、コマンド | sort -nr | head -n 5 で「上位5件のランキング」が一発で作れます。",
    lpic: "LPIC Level1（102試験）では、sort の -n（数値順）・-r（逆順）・-k（キー指定）・-u（重複除去）が頻出です。特に「数値の並べ替えに -n が必要な理由」はよく問われます。",
  },
};
