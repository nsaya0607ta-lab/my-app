export default {
  id: "s067",
  title: "残った一時ファイルを整理せよ",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "FHS・ディレクトリ構成",
  pack: "fhs-operations",
  requester: { name: "伊藤先輩", role: "サーバー保守", avatar: "🧹" },
  request: [
    "【現場からの依頼】昨日のインストール作業で作った一時ファイルが残っている。対象を確認して削除して。",
    "【状況】削除対象は install-cache.tmp と session-old.tmp です。ほかの利用中ファイルには触れないでください。",
    "【問題】処理途中だけ使う一時ファイルは、通常どのディレクトリに置かれるでしょうか。",
  ],
  initialEnv: {
    dirs: ["/tmp"],
    files: [
      { path: "/tmp/install-cache.tmp", content: "temporary package cache\n" },
      { path: "/tmp/session-old.tmp", content: "expired session\n" },
      { path: "/tmp/service-active.lock", content: "active\n" },
    ],
  },
  steps: [
    {
      id: "list-tmp",
      label: "/tmp の内容を確認する",
      hint: [
        "一時ファイルの代表的な保存先は /tmp です。",
        "ls -la /tmp で隠しファイルを含めて確認できます。",
      ],
      goal: { type: "commandRan", cmd: "ls", pattern: "/tmp" },
    },
    {
      id: "remove-install-cache",
      label: "install-cache.tmp を削除する",
      hint: "rm /tmp/install-cache.tmp を実行します。",
      goal: { type: "notExists", path: "/tmp/install-cache.tmp" },
    },
    {
      id: "remove-old-session",
      label: "session-old.tmp を削除する",
      hint: "rm /tmp/session-old.tmp を実行します。service-active.lock は残してください。",
      goal: { type: "notExists", path: "/tmp/session-old.tmp" },
    },
  ],
  clearComment: "指定された古い一時ファイルだけ消せたね。利用中のlockファイルを残した判断も正しいよ。",
  explanation: {
    why: "【正解】/tmp です。/tmp はプログラムやユーザーが短期間だけ利用する一時ファイルの保存先です。再起動時や定期処理で削除される構成もありますが、削除方針は環境ごとに異なります。",
    alternatives: "【確認コマンド】ls -la /tmp、du -sh /tmp、rm /tmp/install-cache.tmp。実務では更新日時や利用中プロセスを確認し、/tmp の中身を無条件で全削除しないことが重要です。",
    lpic: "LPIC Level1では /tmp が一時ファイル用であり、多くのユーザーやプロセスから利用される場所であることがポイントです。権限やsticky bitと組み合わせて出題されることもあります。",
  },
};