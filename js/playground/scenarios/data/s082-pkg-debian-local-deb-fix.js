export default {
  id: "s082",
  title: "ベンダー提供DEBの依存関係を修復せよ",
  difficulty: "LPIC Level1",
  difficultyLevel: 4,
  category: "ソフトウェア管理",
  pack: "software-management",
  requester: { name: "バックアップ担当", role: "基盤運用", avatar: "💾" },
  request: [
    "【現場からの依頼】ベンダー提供のバックアップエージェントをUbuntuへ入れて。依存関係エラーが出たら修復もお願い。",
    "【使用環境】Debian系（Ubuntu Server）。",
    "【状況】/home/student/Downloads に backup-agent_2.0.0_amd64.deb があります。dpkgで直接導入するとlibbackup1が不足します。",
    "【問題】.debの直接インストールと、依存関係の修復にはどのコマンドを使いますか。",
  ],
  initialEnv: {
    dirs:["/home/student/Downloads"],
    files:[{path:"/home/student/Downloads/backup-agent_2.0.0_amd64.deb",content:"DEB PACKAGE DATA\n"}],
    env:[
      {name:"PKG_SYSTEM",value:"debian"},
      {name:"PKG_INSTALLED",value:"bash=5.2.21-2ubuntu4;coreutils=9.4-3ubuntu6"},
    ],
  },
  steps: [
    { id:"root", label:"rootユーザーへ切り替える", hint:"suを実行し、パスワードにrootと入力します。", goal:{type:"becameRoot"} },
    { id:"dpkg", label:"dpkgでローカルDEBファイルを直接インストールする", hint:[".debファイルの直接インストールはdpkg -iです。","dpkg -i /home/student/Downloads/backup-agent_2.0.0_amd64.deb を実行します。依存関係エラーが出ても次へ進みます。"], goal:{type:"commandRan",cmd:"dpkg",pattern:"-i\\s+/home/student/Downloads/backup-agent_2\\.0\\.0_amd64\\.deb"} },
    { id:"fix", label:"aptで壊れた依存関係を修復する", hint:["不足した依存パッケージをリポジトリから取得します。","apt -f install を実行します。"], goal:{type:"commandRan",cmd:"apt",pattern:"-f\\s+install|--fix-broken\\s+install"} },
    { id:"verify", label:"backup-agentが正常な状態か確認する", hint:"dpkg -s backup-agent を実行します。", goal:{type:"commandRan",cmd:"dpkg",pattern:"-s\\s+backup-agent"} },
  ],
  clearComment: "dpkgの不足をaptで補う流れまで対応できたね。",
  explanation: {
    why: "【正解コマンド】dpkg -i backup-agent_2.0.0_amd64.deb、続いて apt -f install。dpkgは.debファイルを直接展開しますが、不足する依存パッケージを自動取得しません。apt -f installは壊れた依存関係を修復し、不足パッケージをリポジトリから取得します。",
    alternatives: "【注意点】現在は apt install ./backup-agent_2.0.0_amd64.deb とすれば、ローカルDEBを扱いながら依存関係も解決できます。ただしLPIC学習では dpkg -i と apt -f install の組み合わせも重要です。配布元と対応OSを確認してください。",
    lpic: "LPIC Level1では dpkg -i が依存関係を自動解決しないこと、apt -f installで依存関係を修復できることが代表的な出題点です。",
  },
};
