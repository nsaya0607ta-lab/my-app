export default {
  id: "s031",
  pack: "permissions-newbie",
  title: "研修ツールを755にする",
  difficulty: "初級〜中級",
  difficultyLevel: 2,
  category: "権限",
  requester: { name: "高橋さん", role: "教育担当", avatar: "👩" },
  request: [
    "新人研修で使うセットアップツールなんだけど、",
    "この「755」って数字、どういう意味なのか新人向けに説明できる？",
    "説明できるようになったら、実際に ~/training/setup.sh を755にしてみて。",
  ],
  initialEnv: {
    dirs: ["~/training"],
    files: [
      { path: "~/training/setup.sh", content: "#!/bin/bash\necho \"研修環境をセットアップします\"\n", mode: "700" },
    ],
  },
  steps: [
    {
      id: "chmod-755",
      label: "setup.sh の権限を755にする",
      hint: [
        "権限を数値（8進数）で一気に指定するコマンドを使います。",
        "chmod コマンドを使います。",
        "755は「所有者7・グループ5・その他5」＝chmod 755 setup.sh です。",
      ],
      goal: { type: "octal", path: "~/training/setup.sh", value: "755" },
    },
  ],
  clearComment: "説明もバッチリだったよ！755の意味、今度は後輩にも教えてあげてね。",
  explanation: {
    why: "chmodの数値指定は、rwxの各権限をr=4・w=2・x=1のビットとみなし、所有者・グループ・その他ごとに合計した3桁（または4桁）の数字で表します。755は「7＝4+2+1＝rwx（所有者：読み書き実行すべて可）」「5＝4+0+1＝r-x（グループ：読み取りと実行のみ、書き込み不可）」「5＝r-x（その他も同様）」という意味です。スクリプトやコマンドを『所有者は自由に編集できるが、他の人は実行できても書き換えられない』状態にしたいときの定番の権限がこの755です。",
    alternatives: "chmod 755 setup.sh（数値指定）と chmod u=rwx,go=rx setup.sh（シンボリック指定・所有者はrwx、グループとその他はrxに設定）は同じ結果になります。既存の権限から差分だけ変えたい場合は chmod go+rx setup.sh のような書き方も使えますが、755のように「最終的にこの権限にしたい」という指定なら数値指定の方が意図が明確で分かりやすいです。",
    lpic: "LPIC Level1では、755・644・700・600・777のような代表的な数値権限を見て即座にrwxの並びに変換できるかがよく問われます。755＝rwxr-xr-x（実行可能なプログラム・ディレクトリの定番）、644＝rw-r--r--（一般的なテキストファイルの定番）という組み合わせは特に頻出なので、意味とセットで覚えておくと試験にも実務にも直結します。",
  },
};
