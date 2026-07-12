export default {
  id: "s047",
  pack: "file-dir-newbie",
  title: "設定ファイルが見つからない",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ファイル・ディレクトリ操作",
  requester: { name: "先輩", role: "開発部", avatar: "🧑‍💻" },
  request: [
    "昨日編集した設定ファイルが見当たらないんだよね…。",
    "Linuxには普段見えないファイルもあるらしいんだけど、確認してみてくれる？",
  ],
  initialEnv: {
    dirs: ["~/app"],
    files: [
      { path: "~/app/.env", content: "APP_ENV=production\nDB_HOST=localhost\n" },
      { path: "~/app/readme.txt", content: "アプリケーションの説明\n" },
    ],
    cwd: "~/app",
  },
  steps: [
    {
      id: "list-hidden",
      label: "隠しファイルも含めて app フォルダの中身を確認する",
      hint: [
        "普段は表示されない「隠しファイル」まで含めて確認する必要があります。",
        "ls コマンドを使います。",
        "隠しファイルも表示するには -a オプションを付けて ls -a のように実行します。",
      ],
      goal: { type: "commandRan", cmd: "ls", flag: "a" },
    },
  ],
  clearComment: "あった、.env だ！ありがとう、見つかったよ。",
  explanation: {
    why: "Linuxでは名前が「.（ドット）」から始まるファイルは「隠しファイル」として扱われ、通常の ls では表示されません。設定ファイルにはこの形式（.env や .bashrc など）がよく使われるため、-a オプションで「.」から始まるファイルも含めてすべて表示する必要があります。",
    alternatives: "ls -a のほかに、. と .. （現在のフォルダ自身と親フォルダ）を表示せずに隠しファイルだけ見たい場合は ls -A を使う方法もあります。特定のファイルが本当にあるか確認するだけなら ls -a .env のように名前を直接指定することもできます。",
    lpic: "LPIC Level1では、ドットファイル（隠しファイル）の概念と、ls -a / ls -A の違い（. と .. を含めるかどうか）がよく問われます。設定ファイルの多くがドットファイルであることは実務でも頻繁に遭遇する知識です。",
  },
};
