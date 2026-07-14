export default {
  id: "s076",
  title: "名前の分からないFTPクライアントを探せ",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ソフトウェア管理",
  pack: "software-management",
  requester: { name: "鈴木先輩", role: "運用チーム", avatar: "🔎" },
  request: [
    "【現場からの依頼】ファイル転送に使えるFTPクライアントを探して。まだインストールはしなくていい。",
    "【使用環境】Red Hat系（Rocky Linux 9）。",
    "【状況】必要な機能は分かっていますが、正確なパッケージ名が分かりません。リポジトリから候補を検索し、詳細を確認します。",
    "【問題】どのコマンドで検索し、候補パッケージの情報を確認しますか。",
  ],
  initialEnv: { env:[{name:"PKG_SYSTEM",value:"redhat"}] },
  steps: [
    { id:"search", label:"リポジトリからFTP関連パッケージを検索する", hint:["パッケージ名が分からない場合はsearchを使います。","dnf search ftp を実行します。"], goal:{type:"commandRan",cmd:"dnf",pattern:"search\\s+ftp"} },
    { id:"info", label:"候補のlftpについて詳細を確認する", hint:["インストール前に概要や依存関係を確認します。","dnf info lftp を実行します。"], goal:{type:"commandRan",cmd:"dnf",pattern:"info\\s+lftp"} },
  ],
  clearComment: "名前が分からないときに、検索してから詳細確認する流れができたね。",
  explanation: {
    why: "【正解コマンド】dnf search ftp、dnf info lftp。searchはパッケージ名や説明文をキーワード検索し、infoは候補のバージョン、概要、依存情報などを表示します。正確な名前が分からない状態で、いきなりinstallしないことが重要です。",
    alternatives: "【注意点】検索結果にはFTPサーバー、クライアント、ライブラリなど複数種類が含まれます。用途を確認してから選択します。有効なリポジトリによって検索結果は異なります。",
    lpic: "LPIC Level1では yum search／dnf search と、yum info／dnf info の基本的な使い分けを押さえます。検索はroot権限なしでも実行できます。",
  },
};
