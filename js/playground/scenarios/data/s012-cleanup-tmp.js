export default {
  id: "s012",
  title: "一時ファイルの掃除",
  difficulty: "LPIC Level1",
  difficultyLevel: 4,
  category: "ファイル管理",
  requester: { name: "吉田さん", role: "インフラ担当", avatar: "🧑‍💻" },
  request: [
    "/tmp の中に .tmp ファイルが溜まっちゃってるみたい。",
    "不要な .tmp ファイルだけ消しておいてくれる？ keep.txt はまだ使うから残しておいて。",
  ],
  initialEnv: {
    dirs: ["/tmp"],
    files: [
      { path: "/tmp/session_a.tmp", content: "x" },
      { path: "/tmp/session_b.tmp", content: "x" },
      { path: "/tmp/keep.txt", content: "do not delete" },
    ],
  },
  steps: [
    {
      id: "find-check",
      label: "session_a.tmp を削除する",
      hint: "ls /tmp や find /tmp -name \"*.tmp\" で対象を確認してから rm で削除しましょう。この環境ではワイルドカード(*)の一括展開には対応していないため、ファイル名を1つずつ指定して削除してください。",
      goal: { type: "notExists", path: "/tmp/session_a.tmp" },
    },
    {
      id: "remove-b",
      label: "session_b.tmp を削除する",
      hint: "rm /tmp/session_b.tmp のように削除します。",
      goal: { type: "notExists", path: "/tmp/session_b.tmp" },
    },
    {
      id: "keep-file",
      label: "keep.txt は削除せずに残っている",
      hint: "keep.txt はまだ使うファイルなので消さないよう注意しましょう。",
      goal: { type: "fileExists", path: "/tmp/keep.txt" },
    },
  ],
  explanation: {
    why: "不要なファイルの掃除は、find で対象を洗い出してから rm で削除する、という2段階で行うのが安全です。いきなり rm する前に find /tmp -name \"*.tmp\" で「本当にこれらだけが消える対象か」を確認する習慣をつけると、実務での誤削除事故を防げます。",
    alternatives: "本物のLinuxでは find /tmp -name \"*.tmp\" -delete や、find ... | xargs rm のようにfindの結果をそのまま削除に使う方法もよく使われます（このプレイグラウンドは学習用の簡易実装のため、まずは1件ずつ rm する操作に慣れておきましょう）。",
    lpic: "LPIC Level1では /tmp のようなシステム標準ディレクトリの役割（一時ファイル置き場で、再起動時にクリアされることがある）や、find コマンドの検索条件の組み合わせ方が出題されます。",
  },
};
