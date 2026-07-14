export default {
  id: "s062",
  title: "Webサーバーの500エラーを追え",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "FHS・ディレクトリ構成",
  pack: "fhs-operations",
  requester: { name: "高橋先輩", role: "インフラ運用", avatar: "🧑‍💻" },
  request: [
    "【現場からの依頼】Webサイトで500エラーが出ている。まずWebサーバーのログを確認して。",
    "【状況】nginxのエラーログが保存されている場所を判断し、原因が書かれたファイルを読んでください。",
    "【問題】ログなど、運用中に内容が変化するデータは、どのディレクトリを確認するべきでしょうか。",
  ],
  initialEnv: {
    dirs: ["/var/log/nginx"],
    files: [
      { path: "/var/log/nginx/access.log", content: "192.0.2.10 - - [14/Jul/2026:21:04:18] GET / 200\n", owner: "root", group: "root" },
      { path: "/var/log/nginx/error.log", content: "2026/07/14 21:05:02 [error] connect() failed (111: Connection refused) while connecting to upstream\n", owner: "root", group: "root" },
    ],
  },
  steps: [
    {
      id: "list-nginx-log",
      label: "/var/log/nginx の内容を確認する",
      hint: [
        "ログやキャッシュなど、内容が増減するデータは /var 配下に置かれるのが基本です。",
        "Webサーバーのログは /var/log の下を探します。",
        "ls -l /var/log/nginx を実行してみましょう。",
      ],
      goal: { type: "commandRan", cmd: "ls", pattern: "/var/log/nginx" },
    },
    {
      id: "read-error-log",
      label: "error.log を読み、障害の手掛かりを確認する",
      hint: [
        "ファイルの内容を表示する代表的なコマンドは cat です。",
        "cat /var/log/nginx/error.log を実行します。",
      ],
      goal: { type: "commandRan", cmd: "cat", pattern: "/var/log/nginx/error\\.log" },
    },
  ],
  clearComment: "upstreamへの接続失敗が出ているね。まず確認する場所を正しく選べたよ！",
  explanation: {
    why: "【正解】/var（今回の具体的な場所は /var/log/nginx）です。/var は variable の略で、ログ、キャッシュ、メールキューなど、OSやサービスの稼働中に内容や容量が変化するデータが置かれます。Web障害では、まず /var/log 配下の対象サービスのログを確認するのが基本です。",
    alternatives: "【確認コマンド】ls -l /var/log/nginx、cat /var/log/nginx/error.log。実環境では tail -f や less、journalctl を使って、新しいログを追跡することもあります。",
    lpic: "LPIC Level1では、FHS上で /var が可変データを置く場所であること、/var/log がログの代表的な保存先であることが問われます。単に名前を覚えるだけでなく、障害調査なら /var/log と判断できるようにしましょう。",
  },
};