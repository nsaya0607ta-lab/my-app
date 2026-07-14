export default {
  id: "s084",
  title: "サーバー全体の空き容量を確認せよ",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ディスク容量確認",
  pack: "disk-usage-basics",
  requester: { name: "高橋先輩", role: "インフラ運用", avatar: "🧑‍💻" },
  request: [
    "【現場からの依頼】監視通知を確認する前に、サーバー全体のディスク空き容量を見ておいて。",
    "【状況】どのファイルが大きいかではなく、マウントされているファイルシステム全体の使用量と空き容量を確認します。",
    "【問題】dfとduのどちらを使用し、どのコマンドを実行するべきでしょうか。",
  ],
  initialEnv: {},
  steps: [
    {
      id: "check-filesystems-human",
      label: "ファイルシステム全体の容量を読みやすい単位で確認する",
      hint: [
        "ファイルシステム全体の空き容量を確認するコマンドは df です。",
        "GBやMBなどの読みやすい単位にするには -h を付けます。",
        "df -h を実行しましょう。",
      ],
      goal: { type: "commandRan", cmd: "df", pattern: "^df\\s+-h$" },
    },
  ],
  clearComment: "ファイルシステム全体の空き容量を確認できたね。",
  explanation: {
    why: "【正解コマンド】df -h。dfはマウントされているファイルシステム全体の使用量と空き容量を確認するコマンドです。duは特定のファイルやディレクトリが使用している容量を調べるため、今回のようなサーバー全体の確認にはdfを使います。-hを付けるとGBやMBなどの読みやすい単位になります。",
    alternatives: "【実行結果の見方】Avail列で空き容量、Use%列で使用率、Mounted on列でマウント先を確認します。空き容量が少ない、またはUse%が高い行がないかを見ます。",
    lpic: "LPIC Level1では、dfがファイルシステム単位、duがファイル・ディレクトリ単位という違いが重要です。",
  },
};
