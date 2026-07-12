export default {
  id: "s014",
  title: "ディスク圧迫の原因調査と対処",
  difficulty: "LPIC Level1",
  difficultyLevel: 4,
  category: "ディスク管理",
  requester: { name: "松本さん", role: "インフラ担当", avatar: "🧑‍💻" },
  request: [
    "/var/log の使用量が急に増えてるってアラートが来てるんだ。",
    "du で調べて、容量を圧迫してる大きいファイルを消しておいてくれる？",
  ],
  initialEnv: {
    dirs: ["/var/log"],
    files: [
      { path: "/var/log/huge.log", content: "E".repeat(6000) },
      { path: "/var/log/small.log", content: "ok\n" },
    ],
  },
  steps: [
    {
      id: "cleanup",
      label: "容量を圧迫している huge.log を削除する",
      hint: "du -h /var/log や du -ah /var/log でファイルごとの使用量を確認できます。大きいファイルを見つけたら rm で削除しましょう。",
      goal: { type: "diskUsageUnder", path: "/var/log", maxBytes: 200 },
    },
  ],
  explanation: {
    why: "du（disk usage）はディレクトリやファイルが使っている容量を集計するコマンドです。-a を付けるとファイル単位まで、-h を付けると人間が読みやすい単位（K/M/G）で表示されます。原因になっている大きなファイルを特定してから削除する、という2段階の流れが実務でのディスク逼迫対応の基本です。",
    alternatives: "ファイル単位ではなくディレクトリごとの合計だけを知りたいときは du -sh ディレクトリ名 のように -s（summarize）を使います。ディスク全体の空き容量を見るときは du ではなく df -h を使います。",
    lpic: "LPIC Level1では du と df の役割の違い（duはファイル・ディレクトリ単位の使用量、dfはファイルシステム全体の空き容量）が定番の出題ポイントです。",
  },
};
