export default {
  id: "s102",
  title: "空フォルダの後片付け",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ファイル操作",
  requester: { name: "先輩", role: "開発チーム", avatar: "👨‍💻" },
  request: [
    "前のプロジェクトで使ってたフォルダ、中身はもう全部移したんだけど空のフォルダだけ残っちゃってるんだ。",
    "old_project と temp_work、この2つの空フォルダを削除しておいてくれる？",
    "backup フォルダはまだ中身が入ってるから、絶対に消さないでね。",
  ],
  initialEnv: {
    dirs: ["~/old_project", "~/temp_work", "~/backup"],
    files: [{ path: "~/backup/important_data.txt", content: "重要な顧客データ（削除禁止）\n" }],
  },
  steps: [
    {
      id: "rmdir-old-project",
      label: "空のディレクトリ old_project を削除する",
      hint: [
        "空のディレクトリの削除には rmdir コマンドを使います。中身が入っているディレクトリは削除できない、安全なコマンドです。",
        "rmdir ディレクトリ名 のように指定します。",
        "rmdir old_project と入力します。",
      ],
      goal: { type: "notExists", path: "~/old_project" },
    },
    {
      id: "rmdir-temp-work",
      label: "空のディレクトリ temp_work を削除する",
      hint: [
        "同じように rmdir で削除します。複数のディレクトリをまとめて指定することもできます。",
        "rmdir temp_work と入力します（最初から rmdir old_project temp_work とまとめてもOKでした）。",
        "ちなみに rmdir backup を試すと「Directory not empty」エラーになり、中身のあるフォルダは守られます。",
      ],
      goal: { type: "notExists", path: "~/temp_work" },
    },
  ],
  clearComment: "おお、ちゃんと空のフォルダだけ消えてる！backup が無事なのも確認したよ。rmdir なら消しすぎる心配がなくて安心だね。",
  explanation: {
    why: "rmdir は「空のディレクトリだけ」を削除するコマンドです。中にファイルやサブディレクトリが1つでも残っていると「Directory not empty」エラーになって削除できません。この「空でないと消せない」という性質が安全装置になっており、うっかり必要なデータごと消してしまう事故を防げます。",
    alternatives: "中身ごと削除したい場合は rm -r ディレクトリ名 を使います。ただし rm -r は中のファイルもまとめて消える強力なコマンドなので、実行前に ls で中身を確認する癖をつけましょう。「まず rmdir を試して、エラーになったら中身を確認する」という手順も、消し間違い防止のテクニックとして有効です。",
    lpic: "LPIC Level1（101試験）では、rmdir が空ディレクトリ専用であること、中身のあるディレクトリの削除には rm -r が必要なこと、mkdir -p と対になる rmdir -p（空の親ディレクトリもまとめて削除）が出題されます。",
  },
};
