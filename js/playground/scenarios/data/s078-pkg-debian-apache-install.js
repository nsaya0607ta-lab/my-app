export default {
  id: "s078",
  title: "UbuntuへApacheを導入せよ",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ソフトウェア管理",
  pack: "software-management",
  requester: { name: "中村先輩", role: "クラウド基盤", avatar: "☁️" },
  request: [
    "【現場からの依頼】Ubuntuの検証サーバーにApacheをインストールして。",
    "【使用環境】Debian系（Ubuntu Server）。",
    "【状況】リポジトリからapache2を取得し、必要な依存パッケージも一緒に導入します。",
    "【問題】dpkgとaptのどちらを使用するべきでしょうか。",
  ],
  initialEnv: {
    env:[
      {name:"PKG_SYSTEM",value:"debian"},
      {name:"PKG_INSTALLED",value:"bash=5.2.21-2ubuntu4;coreutils=9.4-3ubuntu6"},
    ],
  },
  steps: [
    { id:"root", label:"rootユーザーへ切り替える", hint:"suを実行し、パスワードにrootと入力します。", goal:{type:"becameRoot"} },
    { id:"install", label:"aptでapache2を依存関係込みでインストールする", hint:["Debian系でリポジトリを使う場合はaptです。","apt install apache2 を実行します。"], goal:{type:"commandRan",cmd:"apt",pattern:"install\\s+(?:-y\\s+)?apache2|install\\s+apache2"} },
    { id:"verify", label:"apache2のパッケージ状態を確認する", hint:"dpkg -s apache2 を実行します。", goal:{type:"commandRan",cmd:"dpkg",pattern:"-s\\s+apache2"} },
  ],
  clearComment: "Debian系のリポジトリ管理ではaptを使うと判断できたね。",
  explanation: {
    why: "【正解コマンド】apt install apache2。aptはDebian系のリポジトリを利用し、apache2本体と依存パッケージを自動的に導入します。dpkgは手元の.debファイルを個別操作するコマンドで、依存関係を自動取得しません。",
    alternatives: "【注意点】パッケージ一覧が古い場合は先に apt update を実行します。実環境では sudo apt install apache2 とする場合が一般的です。この学習環境ではsuでrootへ切り替えます。",
    lpic: "LPIC Level1では、Debian系の高レベル管理がapt、低レベルの.deb操作がdpkgであることを区別します。状態確認には dpkg -s パッケージ名 を使えます。",
  },
};
