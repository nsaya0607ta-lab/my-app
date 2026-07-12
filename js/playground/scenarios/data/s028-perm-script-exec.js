export default {
  id: "s028",
  pack: "permissions-newbie",
  title: "動かないシェルスクリプトを直す",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "権限",
  requester: { name: "佐藤さん", role: "開発部", avatar: "👨" },
  request: [
    "昨日作ったシェルスクリプトが実行できないんだけど…。",
    "権限がおかしい気がするから見てもらえる？ ファイルは script.sh です。",
  ],
  initialEnv: {
    files: [
      { path: "~/script.sh", content: "#!/bin/bash\necho \"デプロイ処理を開始します\"\n" },
    ],
  },
  steps: [
    {
      id: "chmod-exec",
      label: "script.sh に実行権限を付与する",
      hint: [
        "権限を変更するコマンドを使います。",
        "chmod コマンドを使います。",
        "実行権限を足すだけなら chmod +x script.sh、数字でまとめて指定するなら chmod 755 script.sh のようにも書けます。",
      ],
      goal: { type: "permission", path: "~/script.sh", rule: "owner-exec" },
    },
  ],
  clearComment: "おお、動いた！助かったよ、ありがとう！",
  explanation: {
    why: "Linuxのファイルには読み取り(r)・書き込み(w)・実行(x)の3種類の権限があり、スクリプトファイルであっても「実行(x)」の権限が付いていなければコマンドとして実行できません（新規作成したファイルは既定でrw-r--r--＝実行権限なしになることが多いのはこのためです）。chmod +x はこの「実行権限だけを追加する」操作で、新人が最初につまずきやすい典型的なトラブルの原因です。",
    alternatives: "chmod +x script.sh（シンボリック指定・所有者/グループ/その他すべてに実行権限を追加）と、chmod 755 script.sh（8進数指定・所有者に読み書き実行、グループ・その他に読み取りと実行を明示的に設定）はどちらも「所有者が実行できる」という目的を満たします。より限定的に chmod u+x script.sh（所有者だけに実行権限を追加）と書くことも可能です。",
    lpic: "LPIC Level1（101試験）の「ファイル、ディレクトリの操作」領域では、chmodの記号モード（u/g/o + +/-/= + r/w/x）と数値モード（4/2/1の合計）の両方の書き方、およびその変換問題が頻出します。「実行できないスクリプト」は実務でも非常によくある事象で、まず chmod +x を疑う、という判断は現場でそのまま使えるスキルです。",
  },
};
