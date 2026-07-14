export default {
  id: "s090",
  title: "空き容量不足の原因を二段階で調べよ",
  difficulty: "初級〜中級",
  difficultyLevel: 2,
  category: "ディスク容量確認",
  pack: "disk-usage-basics",
  requester: { name: "伊藤主任", role: "障害対応", avatar: "🚨" },
  request: [
    "【現場からの依頼】ディスク容量の警告が出た。まず全体を確認してから、ログがある/varの使用量を調べて。",
    "【状況】最初にファイルシステム全体の空き容量を確認し、その後に特定ディレクトリの容量を確認して原因を絞り込みます。",
    "【問題】dfとduをどの順番で、どのように使用するべきでしょうか。",
  ],
  initialEnv: {
    dirs: ["/var/log/web", "/var/cache/web"],
    files: [
      { path: "/var/log/web/access.log", content: "web access\n".repeat(700) },
      { path: "/var/log/web/error.log", content: "web error\n".repeat(260) },
      { path: "/var/cache/web/cache.bin", content: "cache-bin-".repeat(500) },
    ],
  },
  steps: [
    {
      id: "check-whole-filesystem",
      label: "df -hでファイルシステム全体の空き容量を確認する",
      hint: [
        "最初はどのファイルシステムが圧迫されているかを確認します。",
        "df -hを実行しましょう。",
      ],
      goal: { type: "commandRan", cmd: "df", pattern: "^df\\s+-h$" },
    },
    {
      id: "check-var-total",
      label: "du -shで/varの合計容量を確認する",
      hint: [
        "次に、原因候補である特定のディレクトリを確認します。",
        "du -sh /varを実行しましょう。",
      ],
      goal: { type: "commandRan", cmd: "du", pattern: "^du\\s+-(?=[a-zA-Z]*s)(?=[a-zA-Z]*h)[a-zA-Z]+\\s+/var$" },
    },
  ],
  clearComment: "dfで全体を見て、duで特定の場所へ絞り込む流れを実践できたね。",
  explanation: {
    why: "【正解コマンド】最初にdf -h、次にdu -sh /var。dfでファイルシステム全体の使用率と空き容量を確認し、問題のある場所を把握します。その後、duで特定ディレクトリの使用容量を調べて原因を絞り込みます。",
    alternatives: "【実行結果の見方】df -hではUse%とAvailを確認します。du -sh /varでは左側の合計容量を確認します。dfとduは競合するコマンドではなく、全体確認と個別確認で役割を分けて使用します。",
    lpic: "容量調査の基本は、dfで全体を確認し、duでディレクトリ単位へ掘り下げることです。",
  },
};
