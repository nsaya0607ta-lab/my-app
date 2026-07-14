export default {
  id: "s081",
  title: "古いUbuntuサーバーを安全に更新せよ",
  difficulty: "初級〜中級",
  difficultyLevel: 2,
  category: "ソフトウェア管理",
  pack: "software-management",
  requester: { name: "山本先輩", role: "セキュリティ運用", avatar: "🔄" },
  request: [
    "【現場からの依頼】しばらく更新していないUbuntuサーバーだ。利用可能な最新版を確認してから更新して。",
    "【使用環境】Debian系（Ubuntu Server）。",
    "【状況】ローカルのパッケージ一覧が古いため、最初にリポジトリ情報を更新し、その後インストール済みパッケージを更新します。",
    "【問題】apt updateとapt upgradeを、どの順番で実行するべきでしょうか。",
  ],
  initialEnv: {
    env:[
      {name:"PKG_SYSTEM",value:"debian"},
      {name:"PKG_REPO_FRESH",value:"0"},
      {name:"PKG_INSTALLED",value:"bash=5.2.21-2ubuntu4;coreutils=9.4-3ubuntu6;curl=8.5.0-2ubuntu9;libcurl4=8.5.0-2ubuntu9;openssl=3.0.12-0ubuntu1;libssl3=3.0.12-0ubuntu1"},
    ],
  },
  steps: [
    { id:"root", label:"rootユーザーへ切り替える", hint:"suを実行し、パスワードにrootと入力します。", goal:{type:"becameRoot"} },
    { id:"update", label:"apt updateでリポジトリ情報を更新する", hint:["updateはパッケージ本体ではなく、利用可能なバージョン一覧を更新します。","apt update を実行します。"], goal:{type:"commandRan",cmd:"apt",pattern:"^apt\\s+update(?:\\s|$)"} },
    { id:"upgrade", label:"apt upgradeでインストール済みパッケージを更新する", hint:["新しい一覧を取得した後、実際の更新を行います。","apt upgrade を実行します。"], goal:{type:"commandRan",cmd:"apt",pattern:"^apt\\s+upgrade(?:\\s|$)"} },
  ],
  clearComment: "updateで一覧、upgradeで本体という順番を正しく判断できたね。",
  explanation: {
    why: "【正解コマンド】apt update の後に apt upgrade。apt updateはリポジトリからパッケージ一覧を取得するだけで、インストール済みパッケージ自体は更新しません。apt upgradeが、取得した一覧を基にパッケージ本体を更新します。",
    alternatives: "【注意点】更新対象、サービス再起動、カーネル更新後の再起動要否を確認します。本番環境では事前検証やメンテナンス時間の確保が必要です。確認なしで進める-yの使用は慎重に判断します。",
    lpic: "LPIC Level1では apt update と apt upgrade の役割の違いが重要です。update＝索引更新、upgrade＝インストール済みパッケージ更新と覚えましょう。",
  },
};
