export default {
  id: "s066",
  title: "ログ肥大化でディスクが危険",
  difficulty: "LPIC Level1",
  difficultyLevel: 3,
  category: "FHS・ディレクトリ構成",
  pack: "fhs-operations",
  requester: { name: "小林さん", role: "監視担当", avatar: "🚨" },
  request: [
    "【現場からの依頼】ディスク使用率が90%を超えた。ログの中から容量を圧迫しているファイルを調べて削除して。",
    "【状況】アプリケーションログの保存先に、古いデバッグログが大量に残っています。",
    "【問題】増え続けるログデータを調査するとき、まずどのディレクトリを確認するべきでしょうか。",
  ],
  initialEnv: {
    dirs: ["/var/log/myapp"],
    files: [
      { path: "/var/log/myapp/app.log", content: "INFO application started\n", owner: "root", group: "root" },
      { path: "/var/log/myapp/old-debug.log", content: "DEBUG ".repeat(1200), owner: "root", group: "root" },
    ],
  },
  steps: [
    {
      id: "measure-var-log",
      label: "duで /var/log 配下の使用量を調査する",
      hint: [
        "ファイルやディレクトリ単位の容量は du で調べます。",
        "du -ah /var/log を実行すると、ファイルごとの容量も確認できます。",
      ],
      goal: { type: "commandRan", cmd: "du", pattern: "/var/log" },
    },
    {
      id: "remove-large-log",
      label: "容量を圧迫している old-debug.log を削除する",
      hint: [
        "duの結果で大きいファイルを特定してから削除します。",
        "rm /var/log/myapp/old-debug.log を実行します。",
      ],
      goal: { type: "notExists", path: "/var/log/myapp/old-debug.log" },
    },
  ],
  clearComment: "大きな古いログだけを特定して削除できたね。調査してから対処する流れが大切だよ。",
  explanation: {
    why: "【正解】/var です。特にログは /var/log に置かれます。/var は内容が変化するデータの保存先なので、ログローテーションが失敗すると容量が急増し、ルートファイルシステムを圧迫することがあります。",
    alternatives: "【確認コマンド】du -ah /var/log、du -sh /var/log/*、rm /var/log/myapp/old-debug.log。ディスク全体の空き容量は df -h、ログの世代管理には logrotate が使われます。",
    lpic: "LPIC Level1では、dfはファイルシステム全体の空き容量、duはファイルやディレクトリの使用量を確認するコマンドとして区別されます。FHSの /var と合わせて覚えましょう。",
  },
};