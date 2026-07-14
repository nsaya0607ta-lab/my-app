export default {
  id: "s087",
  title: "ユーザーのホーム容量を確認せよ",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ディスク容量確認",
  pack: "disk-usage-basics",
  requester: { name: "田中先輩", role: "アカウント管理", avatar: "🧑‍💼" },
  request: [
    "【現場からの依頼】studentユーザーのホームディレクトリがどれくらい容量を使っているか確認して。",
    "【状況】サーバー全体ではなく、/home/student配下のファイルとディレクトリをまとめた合計容量を確認します。",
    "【問題】どのコマンドを実行するべきでしょうか。",
  ],
  initialEnv: {
    dirs: ["/home/student/documents", "/home/student/downloads"],
    files: [
      { path: "/home/student/documents/report.txt", content: "report-data\n".repeat(300) },
      { path: "/home/student/downloads/manual.pdf", content: "pdf-data-".repeat(1200) },
    ],
  },
  steps: [
    {
      id: "summarize-home",
      label: "/home/studentの合計容量を確認する",
      hint: [
        "特定ユーザーのホームディレクトリ容量はduで確認します。",
        "合計だけを読みやすい単位で表示するには-shを使います。",
        "du -sh /home/studentを実行しましょう。",
      ],
      goal: { type: "commandRan", cmd: "du", pattern: "^du\\s+-(?=[a-zA-Z]*s)(?=[a-zA-Z]*h)[a-zA-Z]+\\s+/home/student$" },
    },
  ],
  clearComment: "studentユーザーのホーム全体の使用容量を確認できたね。",
  explanation: {
    why: "【正解コマンド】du -sh /home/student。duは指定したファイルやディレクトリが使用している容量を調べます。-sで合計だけ、-hで読みやすい単位にして表示します。",
    alternatives: "【実行結果の見方】左側の数値が/home/student全体の合計容量です。ユーザー別の容量を調べたい場合は、それぞれの/home/ユーザー名を指定します。",
    lpic: "dfでは/home/student単体ではなく、それが置かれているファイルシステム全体の容量が表示される点に注意しましょう。",
  },
};
