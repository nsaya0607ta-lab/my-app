export default {
  id: "s091",
  title: "ホーム内の容量内訳を確認せよ",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ディスク容量確認",
  pack: "disk-usage-basics",
  requester: { name: "小林先輩", role: "ユーザーサポート", avatar: "🧑‍💻" },
  request: [
    "【現場からの依頼】studentユーザーのホーム内で、どのサブディレクトリが容量を使っているか確認して。",
    "【状況】合計容量だけではなく、documentsやdownloadsなど、配下のディレクトリごとの容量も表示する必要があります。",
    "【問題】duのどのオプションを使用し、どのコマンドを実行するべきでしょうか。",
  ],
  initialEnv: {
    dirs: ["/home/student/documents", "/home/student/downloads", "/home/student/projects"],
    files: [
      { path: "/home/student/documents/notes.txt", content: "study-note\n".repeat(120) },
      { path: "/home/student/downloads/archive.zip", content: "archive-data-".repeat(1000) },
      { path: "/home/student/projects/source.txt", content: "source-code\n".repeat(300) },
    ],
  },
  steps: [
    {
      id: "show-home-breakdown",
      label: "du -hでホーム配下のディレクトリ容量を表示する",
      hint: [
        "-sを付けると合計1行だけになるため、今回は付けません。",
        "読みやすい単位にする-hだけを付けます。",
        "du -h /home/studentを実行しましょう。",
      ],
      goal: { type: "commandRan", cmd: "du", pattern: "^du\\s+-h\\s+/home/student$" },
    },
  ],
  clearComment: "ホーム全体だけでなく、配下のディレクトリごとの容量も確認できたね。",
  explanation: {
    why: "【正解コマンド】du -h /home/student。duに-hだけを付けると、配下の各ディレクトリと最後の合計を読みやすい単位で表示します。合計だけが必要な場合は-sを追加してdu -shを使います。",
    alternatives: "【実行結果の見方】各行の左側が容量、右側がディレクトリのパスです。大きい数値の行を探すことで、容量を多く使用しているサブディレクトリを判断できます。",
    lpic: "du -hは内訳確認、du -shは合計確認という違いを理解しておきましょう。",
  },
};
