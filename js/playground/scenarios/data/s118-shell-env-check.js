export default {
  id: "s118",
  title: "スクリプトが動かない…環境変数を疑え",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "シェル環境",
  requester: { name: "先輩", role: "開発チーム", avatar: "👨‍💻" },
  request: [
    "デプロイスクリプトが「コマンドが見つからない」ってエラーで落ちるんだ。こういうときは、まず環境変数を疑うのが定石。",
    "今のシェルに設定されている環境変数を一覧で確認して、それから PATH に何が入っているかを絞り込んで見せてくれる？",
  ],
  steps: [
    {
      id: "env-list",
      label: "env で環境変数の一覧を表示する",
      hint: [
        "現在のシェルに設定されている環境変数をすべて表示するコマンドがあります。",
        "environment を短くした名前のコマンドです。",
        "env と入力します。NAME=値 の形式で一覧表示されます。",
      ],
      goal: { type: "commandRan", cmd: "env" },
    },
    {
      id: "env-grep-path",
      label: "env の出力から PATH の行だけを絞り込む",
      hint: [
        "一覧が長いときは、パイプで grep に渡して必要な行だけ絞り込みます。",
        "env | grep 検索したい文字列 の形です。",
        "env | grep PATH と入力します。コマンド検索に使われるディレクトリの一覧が : 区切りで確認できます。",
      ],
      goal: { type: "commandRan", pattern: "env\\s*\\|\\s*grep\\s+PATH" },
    },
  ],
  clearComment: "PATH に /usr/local/bin が入ってるか確認できたね。「コマンドが見つからない」系のエラーは、だいたい PATH か権限。この確認手順は今後も使うよ。",
  explanation: {
    why: "env は、現在のシェルに設定されている環境変数を一覧表示するコマンドです。環境変数はコマンドの動作に影響する「シェルの設定値」で、特に PATH（コマンドを探すディレクトリの一覧）、HOME（ホームディレクトリ）、LANG（言語設定）は動作トラブルの原因になりやすい重要変数です。「スクリプトが手動では動くのにcronでは動かない」といった問題も、環境変数の違いが原因の定番パターンです。",
    alternatives: "特定の変数1つだけ見たいなら echo $PATH が手軽です。printenv も env とほぼ同じ一覧を表示します。変数を新しく設定するには export NAME=VALUE を使い、設定した変数は env の一覧に加わります。恒久的に設定したい場合は ~/.bashrc などの設定ファイルに export 行を書きます。",
    lpic: "LPIC Level1（102試験）では、env / printenv / echo $変数 / export の使い分け、PATH の役割と : 区切りの書式、環境変数とシェル変数の違いが頻出テーマです。",
  },
};
