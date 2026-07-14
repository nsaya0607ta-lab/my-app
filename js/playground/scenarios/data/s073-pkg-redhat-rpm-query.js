export default {
  id: "s073",
  title: "httpdの導入状況と依存関係を確認せよ",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ソフトウェア管理",
  pack: "software-management",
  requester: { name: "田中先輩", role: "サーバー保守", avatar: "👨‍🔧" },
  request: [
    "【現場からの依頼】このAlmaLinuxサーバーにhttpdが入っているか、バージョンと依存関係も確認して。",
    "【使用環境】Red Hat系（AlmaLinux 9）。",
    "【状況】サービスを起動する前に、インストール状態、パッケージ情報、必要パッケージを確認します。",
    "【問題】rpmのどの問い合わせオプションを使えばよいでしょうか。",
  ],
  initialEnv: {
    env: [
      { name:"PKG_SYSTEM", value:"redhat" },
      { name:"PKG_INSTALLED", value:"bash=5.1.8-9.el9;httpd=2.4.57-8.el9;apr=1.7.0-10.el9;apr-util=1.6.1-20.el9" },
    ],
  },
  steps: [
    { id:"query", label:"httpdがインストール済みか確認する", hint:["rpmのqueryを使います。","rpm -q httpd を実行します。"], goal:{type:"commandRan",cmd:"rpm",pattern:"-q\\s+httpd"} },
    { id:"info", label:"httpdの詳細情報とバージョンを確認する", hint:["queryにinformationのiを加えます。","rpm -qi httpd を実行します。"], goal:{type:"commandRan",cmd:"rpm",pattern:"-qi\\s+httpd|-q\\s+-i\\s+httpd"} },
    { id:"requires", label:"httpdが必要とする依存関係を確認する", hint:["Requiresを確認する大文字Rのオプションを使います。","rpm -qR httpd を実行します。"], goal:{type:"commandRan",cmd:"rpm",pattern:"-qR\\s+httpd"} },
  ],
  clearComment: "rpmの問い合わせオプションを用途ごとに使い分けられたね。",
  explanation: {
    why: "【正解コマンド】rpm -q httpd、rpm -qi httpd、rpm -qR httpd。-qはインストール状態、-qiはバージョンや説明などの詳細、-qRはそのパッケージが必要とする依存関係を表示します。読み取りだけなのでroot権限は通常不要です。",
    alternatives: "【注意点】rpm -qa はインストール済みパッケージをすべて表示します。サービス名とパッケージ名が異なる場合もあるため、正確なパッケージ名を確認します。インストール済みでもサービスが起動中とは限りません。",
    lpic: "LPIC Level1では rpm -q、-qa、-qi、-qR の意味が頻出です。qはquery、aはall、iはinformation、RはRequiresと関連付けて覚えましょう。",
  },
};
