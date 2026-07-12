const EMP_FILE =
  "E001 田中太郎 営業 320000\n" +
  "E002 鈴木花子 総務 280000\n" +
  "E003 佐藤次郎 営業 350000\n" +
  "E004 高橋三郎 経理 300000\n" +
  "E005 伊藤久美 人事 270000\n" +
  "E006 渡辺健一 営業 360000\n" +
  "E007 山本愛 経理 290000\n";

export default {
  id: "s025",
  title: "一番給料が高い社員を知りたい",
  difficulty: "LPIC Level1",
  difficultyLevel: 4,
  category: "テキスト処理",
  requester: { name: "部長", role: "", avatar: "👨" },
  request: [
    "また私だ、頼れる新人くん。",
    "employees.txt の中で、一番給料が高い社員が誰か知りたいんだ。",
    "該当する行を top_salary.txt に保存しておいてくれ。",
  ],
  initialEnv: {
    files: [{ path: "~/employees.txt", content: EMP_FILE }],
  },
  steps: [
    {
      id: "find-max-salary",
      label: "一番給料が高い社員の行を top_salary.txt に保存する",
      hint: [
        "「今までで一番大きい値」を覚えておくには、自分で用意した変数と条件分岐（if）を組み合わせます。",
        "各行の給与($4)を、覚えている最大値の変数と比較し、大きければ変数を更新（上書き）します。",
        "例: awk 'NR==1{max=$4; line=$0} $4>max{max=$4; line=$0} END{print line}' employees.txt > top_salary.txt",
      ],
      goal: {
        type: "custom",
        fn: (vfs) => {
          const res = vfs.readFile("~/top_salary.txt");
          if(res.error) return false;
          const lines = res.content.split("\n").map(l => l.trim()).filter(Boolean);
          return lines.length === 1 && lines[0] === "E006 渡辺健一 営業 360000";
        },
      },
    },
  ],
  explanation: {
    why: "「一番大きい値」を求めるには、最初の行を仮の最大値としておき、以降の行を1つずつ比較して、より大きい値が見つかるたびに変数を更新していく、という流れが定番です。この「これまでの最大値を覚えておく変数」を使う考え方は、awk に限らずプログラミング全般でよく使う基本パターンです。",
    alternatives: "sort -k4 -nr employees.txt | head -1 のように、給与（4列目）を数値として降順に並べ替えてから先頭1行を取り出す、という方法でも同じ結果が得られます。件数が多いデータに対して1回だけ最大値を知りたい場合は、この sort + head の組み合わせもよく使われます。",
    lpic: "LPIC Level1では、if文による条件分岐や、比較演算子を使った値の更新処理など、awk 内でのプログラミング的な書き方（変数・条件分岐の組み合わせ）が出題されることがあります。sort コマンドのオプション（-k 列指定、-n 数値ソート、-r 逆順）と組み合わせて理解しておくと役立ちます。",
  },
  clearComment: "さすがだな！これで表彰の準備ができるよ。",
};
