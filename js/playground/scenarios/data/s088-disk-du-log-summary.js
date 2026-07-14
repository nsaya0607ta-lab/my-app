export default {
  id: "s088",
  title: "ログディレクトリの合計容量を確認せよ",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ディスク容量確認",
  pack: "disk-usage-basics",
  requester: { name: "山本先輩", role: "監視担当", avatar: "📊" },
  request: [
    "【現場からの依頼】/var/logの合計容量を確認して、通常の数値表示と読みやすい表示の違いも見ておいて。",
    "【状況】ログファイルが増えているため、/var/log配下を合計した容量を確認します。",
    "【問題】du -sとdu -shを使い、どのように確認するべきでしょうか。",
  ],
  initialEnv: {
    dirs: ["/var/log/nginx", "/var/log/app"],
    files: [
      { path: "/var/log/nginx/access.log", content: "GET /index.html 200\n".repeat(600) },
      { path: "/var/log/nginx/error.log", content: "upstream timeout\n".repeat(220) },
      { path: "/var/log/app/application.log", content: "application event\n".repeat(350) },
    ],
  },
  steps: [
    {
      id: "summary-log-blocks",
      label: "du -sで/var/logの合計容量を表示する",
      hint: [
        "-sは指定したディレクトリの合計だけを表示します。",
        "まずdu -s /var/logを実行しましょう。",
      ],
      goal: { type: "commandRan", cmd: "du", pattern: "^du\\s+-s\\s+/var/log$" },
    },
    {
      id: "summary-log-human",
      label: "du -shで読みやすい単位にして表示する",
      hint: [
        "-hを追加するとKB・MB・GBなどの単位になります。",
        "du -sh /var/logを実行しましょう。",
      ],
      goal: { type: "commandRan", cmd: "du", pattern: "^du\\s+-(?=[a-zA-Z]*s)(?=[a-zA-Z]*h)[a-zA-Z]+\\s+/var/log$" },
    },
  ],
  clearComment: "-sと-shの表示の違いを確認できたね。",
  explanation: {
    why: "【正解コマンド】du -s /var/log、続けてdu -sh /var/log。どちらも/var/logの合計容量を表示します。-hがない場合は通常KB単位の数値で、-hを付けるとK・M・Gなどの読みやすい単位になります。",
    alternatives: "【実行結果の見方】各結果の左側が合計容量、右側が対象パスです。同じ対象を指定しているため容量自体は同じで、表示形式だけが変わります。",
    lpic: "-sはsummarize、-hはhuman-readableです。複数の短いオプションは-shのようにまとめられます。",
  },
};
