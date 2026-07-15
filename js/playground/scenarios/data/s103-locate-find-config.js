export default {
  id: "s103",
  title: "設定ファイルはどこ？locateで即答",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "検索",
  requester: { name: "部長", role: "システム部", avatar: "👨‍💼" },
  request: [
    "アプリの設定ファイル server.conf を確認したいんだが、どこに置いてあるか分かるか？",
    "サーバーの中を上から下まで探すのは大変だから、素早く見つけて中身を報告してくれ。",
  ],
  initialEnv: {
    dirs: ["/etc/myapp", "/var/log/myapp", "~/notes"],
    files: [
      { path: "/etc/myapp/server.conf", content: "listen_port=8080\nmax_connections=100\nlog_level=info\n" },
      { path: "/var/log/myapp/server.log", content: "2026-07-15 09:00 server started\n" },
      { path: "~/notes/server_memo.txt", content: "serverの設定変更はインフラチームに連絡すること\n" },
    ],
  },
  steps: [
    {
      id: "locate-conf",
      label: "locate で server.conf の場所を探す",
      hint: [
        "ファイル名からパスを素早く探すには locate コマンドが便利です。",
        "locate 探したい名前 のように、ファイル名の一部を指定します。",
        "locate server.conf と入力します。パスに server.conf を含むファイルが一覧表示されます。",
      ],
      goal: { type: "commandRan", cmd: "locate", pattern: "locate\\s+\\S*server" },
    },
    {
      id: "cat-conf",
      label: "見つけた server.conf の中身を確認する",
      hint: [
        "場所が分かったら、ファイルの中身を表示して報告しましょう。",
        "ファイルの内容表示には cat コマンドを使います。",
        "cat /etc/myapp/server.conf と入力します。",
      ],
      goal: { type: "commandRan", cmd: "cat", pattern: "server\\.conf" },
    },
  ],
  clearComment: "/etc/myapp か、なるほどな。ポートは8080と…よし、報告ありがとう。一瞬で見つかるもんだな！",
  explanation: {
    why: "locate は、あらかじめ作成されたファイル名データベースを検索するコマンドです。ディスク全体を実際に走査する find と違い、データベースを引くだけなので非常に高速です。「ファイル名（の一部）は分かるが場所が分からない」という場面で最初に試す価値があります。",
    alternatives: "find / -name server.conf でも探せますが、ルート直下からの find は全ディレクトリを実際に辿るため時間がかかります。一方 locate のデータベースは通常1日1回（updatedb コマンド）更新されるため、作られた直後のファイルはヒットしないことがあります。「速いが少し古い locate、遅いが正確な find」と使い分けましょう。",
    lpic: "LPIC Level1（102試験）では、locate がデータベース検索であること、データベースの更新に updatedb を使うこと、find との違い（リアルタイム性・速度）が頻出の比較ポイントです。",
  },
};
