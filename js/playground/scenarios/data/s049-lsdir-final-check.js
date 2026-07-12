export default {
  id: "s049",
  pack: "file-dir-newbie",
  title: "提出前の最終確認",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ファイル・ディレクトリ操作",
  requester: { name: "先輩", role: "開発部", avatar: "🧑‍💻" },
  request: [
    "提出前だから念のため全部確認しよう。",
    "隠しファイルも含めて、詳しく一覧表示してみてくれる？",
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
      id: "list-all-detail",
      label: "ls -la で隠しファイルも含めて詳細確認する",
      hint: [
        "隠しファイルも含めて、詳細情報まで一度に確認しましょう。",
        "ls コマンドを使います。",
        "-l と -a を組み合わせて ls -la（またはls -al）のように実行します。",
      ],
      goal: { type: "commandRan", cmd: "ls", pattern: "^ls\\s+-(?=[a-zA-Z]*l)(?=[a-zA-Z]*a)[a-zA-Z]+" },
    },
  ],
  clearComment: "これで安心して提出できるね、ありがとう！",
  explanation: {
    why: "提出前の最終確認では「見えているファイル」だけでなく「隠しファイル」や「詳細情報」まで漏れなくチェックしたいものです。-l（詳細表示）と -a（隠しファイルも表示）を組み合わせた ls -la は、そうした総点検の場面で定番の使い方です。",
    alternatives: "オプションの順番は前後しても構わず、ls -la と ls -al は同じ結果になります。「.」「..」を除いた隠しファイルだけを詳細表示したい場合は ls -lA を使う方法もあります。",
    lpic: "LPIC Level1では、ls -la のように複数の単文字オプションを1つの「-」にまとめて指定できること（-l -a と -la が同じ意味であること）が基本知識として問われます。実務でも「まとめて全部確認する」場面で頻繁に使われる組み合わせです。",
  },
};
