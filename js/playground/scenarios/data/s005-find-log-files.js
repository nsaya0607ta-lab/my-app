export default {
  id: "s005",
  title: "散らかったログファイルの棚卸し",
  difficulty: "初級〜中級",
  difficultyLevel: 2,
  category: "検索",
  requester: { name: "高橋さん", role: "先輩エンジニア", avatar: "🧑‍💻" },
  request: [
    "project フォルダの中に .log ファイルが色々な場所に散らかってるみたいで。",
    "全部見つけて、ファイルパスの一覧を found_logs.txt に保存しておいてもらえる？",
  ],
  initialEnv: {
    dirs: ["~/project", "~/project/src", "~/project/tmp"],
    files: [
      { path: "~/project/app.log", content: "log" },
      { path: "~/project/src/debug.log", content: "log" },
      { path: "~/project/notes.txt", content: "memo" },
    ],
  },
  steps: [
    {
      id: "find-logs",
      label: ".log ファイルを見つけて found_logs.txt に保存する",
      hint: "find の -name オプションでファイル名を指定して検索できます。例: find ~/project -name \"*.log\" > found_logs.txt",
      goal: {
        type: "custom",
        fn: (vfs) => {
          const res = vfs.readFile("~/found_logs.txt");
          if(res.error) return false;
          return res.content.includes("app.log") && res.content.includes("debug.log");
        },
      },
    },
  ],
  explanation: {
    why: "find はディレクトリを再帰的にたどってファイルを探すコマンドです。-name \"*.log\" のようにワイルドカードを使うパターンを指定すると、サブディレクトリの中まで含めて名前が一致するものを全部見つけてくれます。",
    alternatives: "見つけた一覧をその場で確認したいだけなら、リダイレクトせずに find ~/project -name \"*.log\" とだけ実行しても構いません。件数だけ知りたい場合は find ~/project -name \"*.log\" | wc -l のようにパイプでwcへ渡す方法もあります。",
    lpic: "LPIC Level1では find の基本的な検索条件（-name, -type）や、locate コマンドとの違い（locateは事前に作られたデータベースを検索するため高速だが最新の変更が反映されないことがある）がよく出題されます。",
  },
};
