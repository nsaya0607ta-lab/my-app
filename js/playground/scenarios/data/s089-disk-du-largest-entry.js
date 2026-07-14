export default {
  id: "s089",
  title: "容量を多く使用している場所を探せ",
  difficulty: "初級〜中級",
  difficultyLevel: 2,
  category: "ディスク容量確認",
  pack: "disk-usage-basics",
  requester: { name: "中村先輩", role: "サーバー保守", avatar: "🔎" },
  request: [
    "【現場からの依頼】/varの中で、どのディレクトリが容量を多く使っているか確認して。",
    "【状況】/var全体の合計だけでは原因を特定できないため、直下にあるlog・cache・libを個別に比較します。",
    "【問題】現在のディレクトリ内にある各ファイルやディレクトリの容量を、まとめて確認するコマンドを答えてください。",
  ],
  initialEnv: {
    dirs: ["/var/log", "/var/cache", "/var/lib"],
    files: [
      { path: "/var/log/system.log", content: "system log entry\n".repeat(900) },
      { path: "/var/cache/package.cache", content: "cache-block-".repeat(350) },
      { path: "/var/lib/app.db", content: "database-row-".repeat(120) },
    ],
    cwd: "/var",
  },
  steps: [
    {
      id: "compare-var-children",
      label: "現在のディレクトリ直下を項目ごとに比較する",
      hint: [
        "各項目の合計容量を1行ずつ表示するにはdu -shを使います。",
        "*は現在のディレクトリ内の各ファイルやディレクトリを表します。",
        "du -sh *を実行しましょう。",
      ],
      goal: { type: "commandRan", cmd: "du", pattern: "^du\\s+-(?=[a-zA-Z]*s)(?=[a-zA-Z]*h)[a-zA-Z]+\\s+\\*$" },
    },
  ],
  clearComment: "項目ごとの容量を比較して、大きい場所を絞り込めたね。",
  explanation: {
    why: "【正解コマンド】du -sh *。*によって現在のディレクトリ直下の各項目が対象になり、-sで項目ごとの合計、-hで読みやすい単位が表示されます。容量問題の原因を段階的に絞り込むときによく使います。",
    alternatives: "【実行結果の見方】左側の容量を比較し、最も大きな数値の行を確認します。右側には対応するファイルまたはディレクトリ名が表示されます。",
    lpic: "du -sh *は、現在地の直下を項目単位で比較する基本的な使い方です。必要に応じて大きいディレクトリへcdし、同じ確認を繰り返します。",
  },
};
