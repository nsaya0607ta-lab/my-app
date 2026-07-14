export default {
  id: "s074",
  title: "不要になったFTPサーバーを削除せよ",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ソフトウェア管理",
  pack: "software-management",
  requester: { name: "伊藤主任", role: "インフラ管理", avatar: "🧑‍💼" },
  request: [
    "【現場からの依頼】検証で使ったvsftpdはもう不要だから削除して。",
    "【使用環境】Red Hat系（Rocky Linux 9）。",
    "【状況】依存関係や削除対象を確認しながら、リポジトリ管理機能を使ってアンインストールします。",
    "【問題】rpm -eとdnf removeのどちらを使うべきでしょうか。",
  ],
  initialEnv: {
    env: [
      { name:"PKG_SYSTEM", value:"redhat" },
      { name:"PKG_INSTALLED", value:"bash=5.1.8-9.el9;coreutils=8.32-36.el9;vsftpd=3.0.5-5.el9" },
    ],
  },
  steps: [
    { id:"root", label:"rootユーザーへ切り替える", hint:"suを実行し、パスワードにrootと入力します。", goal:{type:"becameRoot"} },
    { id:"remove", label:"dnfでvsftpdを削除する", hint:["依存関係を確認しながら削除するにはdnfを使います。","dnf remove vsftpd を実行します。"], goal:{type:"commandRan",cmd:"dnf",pattern:"remove\\s+(?:-y\\s+)?vsftpd|remove\\s+vsftpd"} },
  ],
  clearComment: "削除時にも依存関係を扱えるdnfを選べたね。",
  explanation: {
    why: "【正解コマンド】dnf remove vsftpd。dnfは削除時にも関連するパッケージや影響を確認できます。rpm -eでも削除できますが、依存関係により削除できない場合があるため、通常の運用ではdnf removeが分かりやすく安全です。",
    alternatives: "【注意点】削除前にサービスの利用者、設定ファイル、保存データを確認します。-yを付けると確認なしで進むため、本番環境では表示された削除対象を必ず確認してください。",
    lpic: "LPIC Level1では rpm -e と yum remove／dnf remove の違いを理解します。rpmは個別操作、dnfは依存関係を含む高レベル管理です。",
  },
};
