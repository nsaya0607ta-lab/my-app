export default {
  id: "s086",
  title: "/varの合計容量を確認せよ",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ディスク容量確認",
  pack: "disk-usage-basics",
  requester: { name: "鈴木先輩", role: "サーバー運用", avatar: "🧑‍💻" },
  request: [
    "【現場からの依頼】ログやキャッシュが増えていないか、/var全体の使用容量を確認して。",
    "【状況】ファイルシステム全体の空き容量ではなく、特定のディレクトリである/varの合計容量を調べます。",
    "【問題】dfとduのどちらを使用し、どのコマンドを実行するべきでしょうか。",
  ],
  initialEnv: {
    dirs: ["/var/log/app", "/var/cache/app"],
    files: [
      { path: "/var/log/app/access.log", content: "access log line\n".repeat(500) },
      { path: "/var/log/app/error.log", content: "error log line\n".repeat(180) },
      { path: "/var/cache/app/cache.dat", content: "cache-data-".repeat(900) },
    ],
  },
  steps: [
    {
      id: "summarize-var",
      label: "/varの合計容量を読みやすい単位で表示する",
      hint: [
        "特定のディレクトリの容量を確認するにはduを使います。",
        "合計だけを表示する-sと、読みやすい単位にする-hを組み合わせます。",
        "du -sh /varを実行しましょう。",
      ],
      goal: { type: "commandRan", cmd: "du", pattern: "^du\\s+-(?=[a-zA-Z]*s)(?=[a-zA-Z]*h)[a-zA-Z]+\\s+/var$" },
    },
  ],
  clearComment: "/var全体の合計容量を1行で確認できたね。",
  explanation: {
    why: "【正解コマンド】du -sh /var。duはファイルやディレクトリが実際に使用している容量を確認します。-sは指定したディレクトリの合計だけを表示し、-hはKB・MB・GBなどの読みやすい単位にします。",
    alternatives: "【実行結果の見方】左側に/varの合計容量、右側に対象パス/varが表示されます。df -hでは/varというディレクトリ単体の容量ではなく、/varが属するファイルシステム全体の容量が表示されます。",
    lpic: "特定のディレクトリの合計容量はdu -sh、ファイルシステム全体の空き容量はdf -hと使い分けます。",
  },
};
