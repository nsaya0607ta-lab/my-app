export default {
  id: "s080",
  title: "Ubuntuから不要なFTPサーバーを削除せよ",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ソフトウェア管理",
  pack: "software-management",
  requester: { name: "加藤主任", role: "運用管理", avatar: "🧹" },
  request: [
    "【現場からの依頼】テスト用に入れたvsftpdをUbuntuサーバーから削除して。",
    "【使用環境】Debian系（Ubuntu Server）。",
    "【状況】パッケージ本体を削除します。設定ファイルまで消す必要はありません。",
    "【問題】apt removeとapt purgeのどちらを使うべきでしょうか。",
  ],
  initialEnv: {
    env:[
      {name:"PKG_SYSTEM",value:"debian"},
      {name:"PKG_INSTALLED",value:"bash=5.2.21-2ubuntu4;coreutils=9.4-3ubuntu6;vsftpd=3.0.5-0ubuntu1"},
    ],
  },
  steps: [
    { id:"root", label:"rootユーザーへ切り替える", hint:"suを実行し、パスワードにrootと入力します。", goal:{type:"becameRoot"} },
    { id:"remove", label:"apt removeでvsftpd本体を削除する", hint:["設定ファイルを残して本体を削除するならremoveです。","apt remove vsftpd を実行します。"], goal:{type:"commandRan",cmd:"apt",pattern:"remove\\s+(?:-y\\s+)?vsftpd|remove\\s+vsftpd"} },
  ],
  clearComment: "removeとpurgeの違いを考えて削除できたね。",
  explanation: {
    why: "【正解コマンド】apt remove vsftpd。removeはパッケージ本体を削除し、再利用できるよう一部の設定ファイルを残します。設定ファイルまで削除する必要がある場合は apt purge vsftpd を使います。",
    alternatives: "【注意点】削除前にサービスの利用状況と保存データを確認します。不要になった依存パッケージは apt autoremove で削除できますが、表示される対象を確認してから実行してください。",
    lpic: "LPIC Level1では apt remove、apt purge、dpkg -r の基本的な違いを理解します。通常の依存関係管理を含む削除にはaptが適しています。",
  },
};
