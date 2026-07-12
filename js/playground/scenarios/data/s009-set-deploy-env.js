export default {
  id: "s009",
  title: "デプロイ先環境の切り替え",
  difficulty: "中級",
  difficultyLevel: 3,
  category: "シェル環境",
  requester: { name: "小林さん", role: "インフラ担当", avatar: "🧑‍💻" },
  request: [
    "デプロイスクリプトは DEPLOY_ENV という環境変数を見て動く仕組みになってるんだ。",
    "今回は検証環境への反映だから、DEPLOY_ENV を staging に設定しておいて。",
  ],
  steps: [
    {
      id: "export",
      label: "環境変数 DEPLOY_ENV を staging に設定する",
      hint: "export 変数名=値 で環境変数を設定できます。例: export DEPLOY_ENV=staging",
      goal: { type: "envVar", name: "DEPLOY_ENV", equals: "staging" },
    },
  ],
  explanation: {
    why: "export は、シェルの変数を「環境変数」として、これから起動する子プロセス（スクリプトなど）にも見えるようにするコマンドです。多くのデプロイツールやアプリケーションは、環境変数を見て動作（接続先やモード）を切り替えます。",
    alternatives: "設定済みの環境変数を確認したいときは env または export だけを実行すると一覧表示されます。1回のコマンド実行だけに有効な変数を渡したい場合は DEPLOY_ENV=staging ./deploy.sh のように先頭に変数を並べる書き方も使われます。",
    lpic: "LPIC Level1では、シェル変数と環境変数の違い（exportしないとサブシェル・子プロセスには引き継がれない）や、env・set・export・unset といったコマンドの役割の違いが頻出です。",
  },
};
