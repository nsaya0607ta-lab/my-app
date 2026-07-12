export default {
  id: "s002",
  title: "設定ファイルの事前バックアップ",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ファイル操作",
  requester: { name: "田中さん", role: "先輩エンジニア", avatar: "👨‍💻" },
  request: [
    "これから config.txt の中身を書き換える作業をお願いしたいんだけど、",
    "念のため作業前に config.txt.bak という名前でバックアップを取っておいて。",
    "もちろん元の config.txt はそのまま残しておいてね。",
  ],
  initialEnv: {
    files: [
      { path: "~/config.txt", content: "port=8080\ntimeout=30\n" },
    ],
  },
  steps: [
    {
      id: "copy",
      label: "config.txt を config.txt.bak としてコピーする",
      hint: "cp コマンドでファイルをコピーできます。例: cp config.txt config.txt.bak",
      goal: { type: "fileExists", path: "~/config.txt.bak", contains: "port=8080" },
    },
    {
      id: "keep-original",
      label: "元の config.txt はそのまま残っている",
      hint: "cp は元のファイルを削除しません。もし誤って mv を使ってしまった場合はやり直しましょう。",
      goal: { type: "fileContains", path: "~/config.txt", includes: "port=8080" },
    },
  ],
  explanation: {
    why: "ファイルの複製には cp を使います。mv と混同しやすいですが、mv は「移動（＝元の場所からは消える）」、cp は「複製（＝元のファイルは残る）」という違いがあります。本番の設定ファイルを触る前にバックアップを取る、という作業は現場で非常によくあります。",
    alternatives: "日付を含めた名前でバックアップを取ることもよくあります: cp config.txt config.txt.$(date +%F) のようにすると、いつ時点のバックアップかが一目で分かります（このプレイグラウンドでは date コマンドの日付をそのまま貼り付ける形でも代用できます）。",
    lpic: "LPIC Level1では cp/mv/rm の違いと、誤って上書き・削除してしまった場合の挙動（本物のLinuxには「ゴミ箱」がないこと）が頻出テーマです。",
  },
};
