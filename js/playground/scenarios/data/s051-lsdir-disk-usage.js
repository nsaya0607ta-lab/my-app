export default {
  id: "s051",
  pack: "file-dir-newbie",
  title: "容量が大きい原因",
  difficulty: "初級〜中級",
  difficultyLevel: 2,
  category: "ファイル・ディレクトリ操作",
  requester: { name: "先輩", role: "開発部", avatar: "🧑‍💻" },
  request: [
    "ディスク容量が少なくなってきたな…。",
    "まずはファイルサイズを見やすい単位で確認してみようか。",
  ],
  initialEnv: {
    dirs: ["~/data"],
    files: [
      { path: "~/data/access.log", content: "big log line\n".repeat(80) },
      { path: "~/data/summary.txt", content: "サマリー\n" },
    ],
    cwd: "~/data",
  },
  steps: [
    {
      id: "list-human-size",
      label: "ls -lh でファイルサイズを見やすい単位で確認する",
      hint: [
        "ファイルサイズを人が読みやすい単位（KB/MBなど）で確認しましょう。",
        "ls コマンドを使います。",
        "サイズを読みやすくするには -h、詳細表示には -l を組み合わせて ls -lh のように実行します。",
      ],
      goal: { type: "commandRan", cmd: "ls", pattern: "^ls\\s+-(?=[a-zA-Z]*l)(?=[a-zA-Z]*h)[a-zA-Z]+" },
    },
  ],
  clearComment: "うわ、このファイルがこんなに大きかったのか…。ありがとう！",
  explanation: {
    why: "ls -l だけだとサイズがバイト単位の数字（例: 1048576）で表示され、直感的に大きさを把握しづらいことがあります。-h（human-readable）を組み合わせた ls -lh なら KB・MB・GBといった単位で表示され、容量問題の原因を素早く見つけやすくなります。",
    alternatives: "フォルダ全体の合計容量を見たいときは du -sh フォルダ名 の方が向いています。特定のファイルだけ確認するなら ls -lh ファイル名 のように対象を絞り込むこともできます。",
    lpic: "LPIC Level1では、-h（human-readable）オプションが ls だけでなく df や du など複数のコマンドで共通して使えることが問われます。「ディスク容量が足りない」というのは実務で非常によくあるトラブルで、まずサイズを見える化するという発想はそのまま現場で使えます。",
  },
};
