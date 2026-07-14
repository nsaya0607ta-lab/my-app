export default {
  id: "s075",
  title: "OpenSSLをセキュリティ更新せよ",
  difficulty: "初級〜中級",
  difficultyLevel: 2,
  category: "ソフトウェア管理",
  pack: "software-management",
  requester: { name: "セキュリティ担当", role: "SOC", avatar: "🛡️" },
  request: [
    "【現場からの依頼】OpenSSLに脆弱性情報が出た。対象パッケージを最新版へ更新して。",
    "【使用環境】Red Hat系（CentOS 7相当の旧環境）。",
    "【状況】この環境ではyumが標準的に使われています。リポジトリからopensslだけを更新します。",
    "【問題】どのコマンドで更新し、更新後のバージョンをどう確認しますか。",
  ],
  initialEnv: {
    env: [
      { name:"PKG_SYSTEM", value:"redhat" },
      { name:"PKG_INSTALLED", value:"bash=4.2.46-35.el7;coreutils=8.22-24.el7;openssl=3.0.7-20.el9;openssl-libs=3.0.7-20.el9" },
    ],
  },
  steps: [
    { id:"root", label:"rootユーザーへ切り替える", hint:"suを実行し、パスワードにrootと入力します。", goal:{type:"becameRoot"} },
    { id:"update", label:"yumでopensslを更新する", hint:["旧Red Hat系ではyumを使う場面があります。","yum update openssl を実行します。"], goal:{type:"commandRan",cmd:"yum",pattern:"update\\s+(?:-y\\s+)?openssl|update\\s+openssl"} },
    { id:"verify", label:"更新後のopensslバージョンを確認する", hint:"rpm -q openssl を実行します。", goal:{type:"commandRan",cmd:"rpm",pattern:"-q\\s+openssl"} },
  ],
  clearComment: "古い環境ではyum、現在の環境ではdnfという違いも判断できたね。",
  explanation: {
    why: "【正解コマンド】yum update openssl、確認は rpm -q openssl。yumは旧世代のRed Hat系で広く使われるリポジトリ型パッケージ管理コマンドで、依存関係を解決しながら更新します。現在のRHEL、Rocky Linux、AlmaLinuxでは主にdnfが使われます。",
    alternatives: "【注意点】暗号ライブラリの更新後は、OpenSSLを利用するWebサーバーやSSHなどの再起動が必要になることがあります。本番環境では影響範囲、更新対象、再起動要否を確認します。現在の環境なら dnf update openssl が基本です。",
    lpic: "LPIC Level1では yum update パッケージ名、yum install、yum remove、yum search などの基本操作を学びます。yumとdnfは用途が近く、世代の違いとして整理しましょう。",
  },
};
