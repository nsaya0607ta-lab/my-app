export default {
  id: "s003",
  title: "使わなくなった画像の削除",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ファイル操作",
  requester: { name: "鈴木さん", role: "デザイナー", avatar: "🧑‍🎨" },
  request: [
    "確認用に置いてもらってた old_icon.png、もう使わないから消しちゃって大丈夫です。",
  ],
  initialEnv: {
    files: [
      { path: "~/old_icon.png", content: "(image data)" },
    ],
  },
  steps: [
    {
      id: "remove",
      label: "old_icon.png を削除する",
      hint: "rm コマンドでファイルを削除できます。例: rm old_icon.png",
      goal: { type: "notExists", path: "~/old_icon.png" },
    },
  ],
  explanation: {
    why: "ファイルの削除には rm を使います。本物のLinuxではゴミ箱に移動するのではなく即座に削除されるため、業務ではrmする前に対象のパスを ls や pwd で必ず確認する習慣が重要です。",
    alternatives: "確認しながら消したい場合は rm -i を使うと、1件ずつ「本当に消しますか」と確認してくれます（この環境ではプロンプト表示は省略されますが、実際のLinuxでは非常によく使われるオプションです）。",
    lpic: "LPIC Level1では rm の基本用法に加え、-r（ディレクトリごと再帰的に削除）・-f（確認なし・存在しなくてもエラーにしない）の組み合わせでの挙動もよく問われます。",
  },
};
