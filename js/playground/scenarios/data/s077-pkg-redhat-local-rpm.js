export default {
  id: "s077",
  title: "ベンダー提供のRPMを直接導入せよ",
  difficulty: "初級〜中級",
  difficultyLevel: 2,
  category: "ソフトウェア管理",
  pack: "software-management",
  requester: { name: "監視基盤担当", role: "インフラ監視", avatar: "📡" },
  request: [
    "【現場からの依頼】ベンダーから届いた監視エージェントを検証サーバーへ入れて。",
    "【使用環境】Red Hat系（Rocky Linux 9）。",
    "【状況】/home/student/Downloads に monitor-agent-1.0.0.rpm があります。通常のリポジトリには登録されていません。",
    "【問題】手元の.rpmファイルを直接操作する場合、どのコマンドを使いますか。",
  ],
  initialEnv: {
    dirs:["/home/student/Downloads"],
    files:[{path:"/home/student/Downloads/monitor-agent-1.0.0.rpm",content:"RPM PACKAGE DATA\n"}],
    env:[
      {name:"PKG_SYSTEM",value:"redhat"},
      {name:"PKG_INSTALLED",value:"bash=5.1.8-9.el9;coreutils=8.32-36.el9"},
    ],
  },
  steps: [
    { id:"root", label:"rootユーザーへ切り替える", hint:"suを実行し、パスワードにrootと入力します。", goal:{type:"becameRoot"} },
    { id:"install", label:"rpmでローカルRPMファイルを直接インストールする", hint:["rpmのインストールは-i、詳細表示は-v、進行状況は-hです。","rpm -ivh /home/student/Downloads/monitor-agent-1.0.0.rpm を実行します。"], goal:{type:"commandRan",cmd:"rpm",pattern:"-ivh\\s+/home/student/Downloads/monitor-agent-1\\.0\\.0\\.rpm"} },
    { id:"verify", label:"monitor-agentが導入されたか確認する", hint:"rpm -q monitor-agent を実行します。", goal:{type:"commandRan",cmd:"rpm",pattern:"-q\\s+monitor-agent"} },
  ],
  clearComment: "リポジトリではなく、手元のRPMを直接操作する場面だと判断できたね。",
  explanation: {
    why: "【正解コマンド】rpm -ivh /home/student/Downloads/monitor-agent-1.0.0.rpm。rpmは.rpmファイルを個別に管理するコマンドです。-iはinstall、-vは詳細表示、-hは進行状況表示です。リポジトリにないベンダー配布物などで使われます。",
    alternatives: "【注意点】rpmは不足した依存パッケージを自動取得しません。依存関係も解決したい場合は dnf install ./monitor-agent-1.0.0.rpm を使える環境もあります。提供元、署名、対応OS、既存バージョンを確認してから導入します。",
    lpic: "LPIC Level1では rpm -ivh、rpm -Uvh、rpm -e、rpm -q の基本オプションが出題範囲です。ローカルファイル操作はrpm、リポジトリ利用はyum／dnfと整理します。",
  },
};
