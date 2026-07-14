export default {
  id: "s072",
  title: "検証WebサーバーにApacheを導入せよ",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ソフトウェア管理",
  pack: "software-management",
  requester: { name: "佐藤先輩", role: "インフラ運用", avatar: "🧑‍💻" },
  request: [
    "【現場からの依頼】Rocky Linuxの検証サーバーにApacheをインストールして。",
    "【使用環境】Red Hat系（Rocky Linux 9）。",
    "【状況】リポジトリからhttpdを取得し、必要な依存パッケージも一緒に導入する必要があります。",
    "【問題】rpmとdnfのどちらを使い、どのようにインストールするべきでしょうか。",
  ],
  initialEnv: {
    env: [
      { name:"PKG_SYSTEM", value:"redhat" },
      { name:"PKG_INSTALLED", value:"bash=5.1.8-9.el9;coreutils=8.32-36.el9;openssl=3.0.7-20.el9" },
    ],
  },
  steps: [
    { id:"root", label:"rootユーザーへ切り替える", hint:["パッケージのインストールには管理者権限が必要です。","suを実行し、パスワードにrootと入力します。"], goal:{type:"becameRoot"} },
    { id:"install", label:"dnfでhttpdを依存関係込みでインストールする", hint:["Red Hat系でリポジトリを利用する場合はdnfを使います。","dnf install httpd を実行します。"], goal:{type:"commandRan",cmd:"dnf",pattern:"install\\s+(?:-y\\s+)?httpd|install\\s+httpd"} },
    { id:"verify", label:"httpdがインストール済みか確認する", hint:["rpmの問い合わせ機能を使います。","rpm -q httpd を実行します。"], goal:{type:"commandRan",cmd:"rpm",pattern:"-q\\s+httpd"} },
  ],
  clearComment: "依存関係が必要な通常の導入ではdnfを選べたね。",
  explanation: {
    why: "【正解コマンド】dnf install httpd。dnfはRed Hat系のリポジトリを利用し、httpd本体だけでなくaprなどの依存パッケージも自動的に解決します。rpmは手元の.rpmファイルを個別操作する低レベルのコマンドなので、通常のリポジトリ導入ではdnfが適しています。",
    alternatives: "【注意点】実環境では sudo dnf install httpd のようにsudoを使う場合もあります。この学習環境ではsuでrootへ切り替えます。古いRed Hat系では yum install httpd が使われます。-yは確認を省略するため、本番では変更内容を確認してから使用します。",
    lpic: "LPIC Level1では、rpmはRPMパッケージの個別管理、yum・dnfはリポジトリと依存関係を扱うコマンドとして区別します。インストール確認には rpm -q パッケージ名 を使います。",
  },
};
