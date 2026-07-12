export default {
  id: "s050",
  pack: "file-dir-newbie",
  title: "最新ファイルを探そう",
  difficulty: "初級〜中級",
  difficultyLevel: 2,
  category: "ファイル・ディレクトリ操作",
  requester: { name: "先輩", role: "開発部", avatar: "🧑‍💻" },
  request: [
    "今日更新した資料だけ確認したいんだよね。",
    "新しい順に並べられるかな？",
  ],
  initialEnv: {
    dirs: ["~/reports"],
    files: [
      { path: "~/reports/report_old.docx", content: "古い資料\n" },
      { path: "~/reports/report_today.docx", content: "今日更新した資料\n" },
    ],
    cwd: "~/reports",
  },
  steps: [
    {
      id: "list-by-time",
      label: "ls -lt で更新日時の新しい順に並べて確認する",
      hint: [
        "更新日時の新しい順に並び替えて確認しましょう。",
        "ls コマンドを使います。",
        "更新日時順に並べるには -t、詳細表示には -l を組み合わせて ls -lt のように実行します。",
      ],
      goal: { type: "commandRan", cmd: "ls", pattern: "^ls\\s+-(?=[a-zA-Z]*l)(?=[a-zA-Z]*t)[a-zA-Z]+" },
    },
  ],
  clearComment: "おお、一番上が今日更新した分か。助かるよ！",
  explanation: {
    why: "-t オプションは更新日時が新しい順にファイルを並べ替えて表示します。詳細表示の -l と組み合わせた ls -lt を使うことで、「一番上が最新」という分かりやすい形で更新日時を確認できます。",
    alternatives: "古い順に見たい場合は ls -ltr のように -r（逆順）を追加します。特定の日付だけを厳密に絞り込みたい場合は find コマンドの方が向いていますが、ざっくり「最近更新したもの」を知りたいだけなら ls -lt で十分です。",
    lpic: "LPIC Level1では、ls の並び替えオプション（-t：更新日時順、-S：サイズ順、-r：逆順）の意味を理解しておくことが求められます。「大量のファイルの中から最近触ったものを探す」のは実務でも頻出の作業です。",
  },
};
