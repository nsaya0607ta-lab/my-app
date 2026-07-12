export default {
  id: "s048",
  pack: "file-dir-newbie",
  title: "最新版はどれ？",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ファイル・ディレクトリ操作",
  requester: { name: "部長", role: "営業部", avatar: "🧑‍💼" },
  request: [
    "どれが最新版の資料なのか分からないな。",
    "更新日時やサイズも一緒に確認できないかな？",
  ],
  initialEnv: {
    dirs: ["~/reports"],
    files: [
      { path: "~/reports/report_v1.docx", content: "第1版の内容\n" },
      { path: "~/reports/report_v2.docx", content: "第2版の内容\n" },
      { path: "~/reports/report_final.docx", content: "最終版の内容\n" },
    ],
    cwd: "~/reports",
  },
  steps: [
    {
      id: "list-detail",
      label: "ls -l で各ファイルの詳細情報を確認する",
      hint: [
        "ファイル名だけでなく、更新日時やサイズも見える形で確認しましょう。",
        "ls コマンドを使います。",
        "詳細情報を表示するには -l オプションを付けて ls -l のように実行します。",
      ],
      goal: { type: "commandRan", cmd: "ls", flag: "l" },
    },
  ],
  clearComment: "なるほど、これが最新版か。ありがとう、助かったよ。",
  explanation: {
    why: "ls -l を使うと、ファイル名だけでなく権限・所有者・サイズ・更新日時までまとめて確認できます。「どれが最新か」「どれくらいの大きさか」を判断したいときは、名前を眺めるだけでなくこの詳細表示を使う習慣が重要です。",
    alternatives: "更新日時で並べ替えたいときは ls -lt（新しい順）、サイズで判断したいときは ls -lh（見やすい単位で表示）と組み合わせることもできます。特定のファイルだけ確認したい場合は ls -l report_final.docx のように名前を指定する方法もあります。",
    lpic: "LPIC Level1では、ls -l の出力形式（種別、権限、リンク数、所有者、グループ、サイズ、更新日時、名前の並び）を正しく読み取れることが頻出のポイントです。「見た目の名前」だけでなく「詳細情報」から判断する視点は実務でもそのまま役立ちます。",
  },
};
