export default {
  id: "s001",
  title: "会議資料フォルダの準備",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ファイル操作",
  requester: { name: "佐藤さん", role: "企画チーム", avatar: "🧑‍💼" },
  request: [
    "来週の定例会議用に「report」という名前のフォルダを作ってほしいんだ。",
    "その中に議事録用の空ファイル「minutes.txt」も作っておいてもらえると助かる。",
  ],
  steps: [
    {
      id: "mkdir",
      label: "report フォルダを作成する",
      hint: "mkdir コマンドで新しいディレクトリを作成できます。例: mkdir report",
      goal: { type: "dirExists", path: "~/report" },
    },
    {
      id: "touch",
      label: "report の中に minutes.txt を作成する",
      hint: "cd report で移動してから touch minutes.txt、または touch report/minutes.txt のようにパスを直接指定してもOKです。",
      goal: { type: "fileExists", path: "~/report/minutes.txt" },
    },
  ],
  explanation: {
    why: "ディレクトリの作成には mkdir、空ファイルの作成（または更新日時の更新）には touch を使います。Linuxではファイルを作る前にディレクトリを用意しておく、という順番がとても多いため、まずこの2つをセットで覚えておくと業務でもすぐに使えます。",
    alternatives: "1行でまとめて作ることもできます: mkdir report && touch report/minutes.txt。移動せずに済ませたいときや、スクリプトに組み込みたいときに便利です。「&&」は前のコマンドが成功したときだけ次を実行する、という意味です。",
    lpic: "LPIC Level1（101試験）の「ファイル、ディレクトリの操作」領域で、mkdir・touch の基本的な使い方や、相対パス／絶対パスの違いを問う問題が頻出します。",
  },
};
