export default {
  id: "s063",
  title: "nginxの接続数設定を修正せよ",
  difficulty: "初級〜中級",
  difficultyLevel: 2,
  category: "FHS・ディレクトリ構成",
  pack: "fhs-operations",
  requester: { name: "佐藤リーダー", role: "サーバー運用", avatar: "👨‍💼" },
  request: [
    "【現場からの依頼】nginxの同時接続数を1024から2048へ変更して。",
    "【状況】サービスの設定ファイルがどこに置かれているか判断し、root権限で修正してください。",
    "【問題】Linux全体やサービスの設定ファイルは、どのディレクトリを確認するべきでしょうか。",
  ],
  initialEnv: {
    dirs: ["/etc/nginx"],
    files: [
      { path: "/etc/nginx/nginx.conf", content: "events {\n    worker_connections 1024;\n}\n", mode: "644", owner: "root", group: "root" },
    ],
  },
  steps: [
    {
      id: "become-root",
      label: "rootユーザーへ切り替える",
      hint: [
        "システム設定ファイルの変更には管理者権限が必要です。",
        "su を実行し、パスワードには root と入力します。",
      ],
      goal: { type: "becameRoot" },
    },
    {
      id: "edit-nginx-config",
      label: "/etc/nginx/nginx.conf の worker_connections を2048へ変更する",
      hint: [
        "設定ファイルは /etc 配下にあります。",
        "nano /etc/nginx/nginx.conf で開き、1024を2048へ書き換えて保存します。",
      ],
      goal: { type: "fileContains", path: "/etc/nginx/nginx.conf", includes: "worker_connections 2048;" },
    },
    {
      id: "return-student",
      label: "作業後にexitで一般ユーザーへ戻る",
      hint: "管理者作業が終わったら exit を実行し、必要以上にrootのまま作業しないようにします。",
      goal: { type: "backToOriginalUser" },
    },
  ],
  clearComment: "設定値が2048になっているね。変更場所も権限の扱いも正しいよ。",
  explanation: {
    why: "【正解】/etc です。/etc にはOS全体や各サービスの設定ファイルが保存されます。例として /etc/ssh/sshd_config、/etc/nginx/nginx.conf、/etc/fstab、/etc/passwd などがあります。設定変更の依頼を受けたら、まず /etc 配下を探す判断が重要です。",
    alternatives: "【確認コマンド】ls -l /etc/nginx、cat /etc/nginx/nginx.conf、nano /etc/nginx/nginx.conf。実務では編集前に cp でバックアップを作り、変更後に nginx -t などで文法確認を行います。",
    lpic: "LPIC Level1では /etc がホスト固有のシステム設定を置く場所であることが重要です。設定ファイルの代表的なパスと、一般ユーザーでは変更できない場合があることも合わせて理解しましょう。",
  },
};