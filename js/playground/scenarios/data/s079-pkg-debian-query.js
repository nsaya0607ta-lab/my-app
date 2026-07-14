export default {
  id: "s079",
  title: "curlの導入状況とバージョンを確認せよ",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ソフトウェア管理",
  pack: "software-management",
  requester: { name: "小林先輩", role: "アプリ運用", avatar: "🧪" },
  request: [
    "【現場からの依頼】このUbuntuサーバーにcurlが入っているか、バージョンも確認して。",
    "【使用環境】Debian系（Ubuntu Server）。",
    "【状況】インストール済みパッケージ一覧と、curlの詳細な状態を確認します。",
    "【問題】dpkgのどのオプションを使えばよいでしょうか。",
  ],
  initialEnv: {
    env:[
      {name:"PKG_SYSTEM",value:"debian"},
      {name:"PKG_INSTALLED",value:"bash=5.2.21-2ubuntu4;coreutils=9.4-3ubuntu6;curl=8.5.0-2ubuntu9;libcurl4=8.5.0-2ubuntu9"},
    ],
  },
  steps: [
    { id:"list", label:"インストール済み一覧からcurlを確認する", hint:["dpkgの一覧表示は-lです。","dpkg -l curl を実行します。"], goal:{type:"commandRan",cmd:"dpkg",pattern:"-l\\s+curl"} },
    { id:"status", label:"curlの状態とバージョンを確認する", hint:["指定パッケージのstatusを表示します。","dpkg -s curl を実行します。"], goal:{type:"commandRan",cmd:"dpkg",pattern:"-s\\s+curl"} },
  ],
  clearComment: "dpkgでインストール済みパッケージを確認できたね。",
  explanation: {
    why: "【正解コマンド】dpkg -l curl、dpkg -s curl。-lはパッケージ一覧、-sはStatus・Version・Dependsなどの詳細情報を表示します。確認だけなので通常はroot権限を必要としません。",
    alternatives: "【注意点】dpkg -lの先頭がiiなら正常にインストール済みです。dpkg -l | grep curl でも検索できますが、名前にcurlを含む別パッケージも表示される可能性があります。",
    lpic: "LPIC Level1では dpkg -l、dpkg -s、dpkg -i、dpkg -r の用途が基本です。apt list --installed でも一覧確認できますが、試験ではdpkgの代表的なオプションも覚えます。",
  },
};
