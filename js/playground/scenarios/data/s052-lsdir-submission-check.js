export default {
  id: "s052",
  pack: "file-dir-newbie",
  title: "提出前チェック",
  difficulty: "LPIC Level1",
  difficultyLevel: 4,
  category: "ファイル・ディレクトリ操作",
  requester: { name: "先輩", role: "開発部", avatar: "🧑‍💻" },
  request: [
    "提出前の最終確認をお願い！",
    "隠しファイルも、詳細情報も、見やすい容量表示も、全部まとめて確認してから提出しよう。",
  ],
  initialEnv: {
    dirs: ["~/reports"],
    files: [
      { path: "~/reports/report_final.docx", content: "最終版の資料です\n" },
      { path: "~/reports/.draft_backup", content: "下書きのバックアップ\n" },
    ],
    cwd: "~/reports",
  },
  steps: [
    {
      id: "list-all-detail-human",
      label: "ls -lah で隠しファイル・詳細情報・見やすい容量をまとめて確認する",
      hint: [
        "隠しファイル・詳細情報・読みやすい容量表示、すべてまとめて確認しましょう。",
        "ls コマンドを使います。",
        "-l と -a と -h を組み合わせて ls -lah のように実行します。",
      ],
      goal: {
        type: "commandRan",
        cmd: "ls",
        pattern: "^ls\\s+-(?=[a-zA-Z]*l)(?=[a-zA-Z]*a)(?=[a-zA-Z]*h)[a-zA-Z]+",
      },
    },
  ],
  clearComment: "完璧です！これで安心して提出できるよ、ありがとう！",
  explanation: {
    why: "これまで学んだ -l（詳細表示）・-a（隠しファイルも表示）・-h（サイズを見やすく表示）の3つを組み合わせた ls -lah は、「提出前に漏れなく総点検する」場面で実務でも定番の組み合わせです。1つずつ別々に確認するより、まとめて一度に確認できるのが強みです。",
    alternatives: "-l -a -h の順番はどう並べても結果は同じで、ls -lah も ls -hal も同じ意味になります。特定のフォルダだけをまとめて確認したいときは ls -lah フォルダ名 のように対象を指定することもできます。",
    lpic: "LPIC Level1では、単文字オプションを自由な順番で1つの「-」にまとめられること、そして -l・-a・-h それぞれの意味を個別に説明できることの両方が問われます。今回のように複数のオプションを目的に応じて組み合わせる力は、試験対策としても実務としてもそのまま活きるスキルです。",
  },
};
