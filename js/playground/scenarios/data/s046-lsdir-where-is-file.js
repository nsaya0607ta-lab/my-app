export default {
  id: "s046",
  pack: "file-dir-newbie",
  title: "資料はどこ？",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ファイル・ディレクトリ操作",
  requester: { name: "先輩", role: "開発部", avatar: "🧑‍💻" },
  request: [
    "部長から昨日作った資料を送ってほしいって連絡が来たんだけど、",
    "このフォルダに保存したはずなんだ。まずは何が入っているか確認してくれる？",
  ],
  initialEnv: {
    dirs: ["~/reports"],
    files: [
      { path: "~/reports/proposal.pptx", content: "（資料ファイルの中身はダミーです）\n" },
      { path: "~/reports/notes.txt", content: "会議メモ\n" },
    ],
    cwd: "~/reports",
  },
  steps: [
    {
      id: "list-files",
      label: "reports フォルダの中身を確認する",
      hint: [
        "まずは今のフォルダに何が入っているか、目で確認してみましょう。",
        "ls コマンドを使います。",
        "そのまま ls と入力するだけで、フォルダの中身が一覧表示されます。",
      ],
      goal: { type: "commandRan", cmd: "ls" },
    },
  ],
  clearComment: "おお、ちゃんと入ってた！助かるよ、部長に送っておくね。",
  explanation: {
    why: "ls は「今いる場所に何があるか」を確認するための最も基本的なコマンドです。ファイルを探す・作業を始める・状態を確認する、そのすべての起点になるため、Linux操作の第一歩として真っ先に覚えるコマンドです。",
    alternatives: "ls の代わりに ls ~/reports のようにパスを直接指定して確認する方法もあります。フォルダを移動してから ls する（cd ~/reports → ls）のと、移動せずに ls ~/reports で確認するのは、どちらも同じ目的を達成できます。",
    lpic: "LPIC Level1（101試験）では、ls をはじめとするファイル・ディレクトリ操作コマンドの基本的な使い方が土台となります。まずは「今どこにいて、何があるか」を確認する習慣が、以降のすべての操作の前提になります。",
  },
};
