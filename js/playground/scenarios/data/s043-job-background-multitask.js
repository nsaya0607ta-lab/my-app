export default {
  id: "s043",
  title: "バックグラウンド実行",
  difficulty: "初級〜中級",
  difficultyLevel: 2,
  category: "ジョブ管理・プロセス管理",
  requester: { name: "先輩", role: "開発チーム", avatar: "🧑‍💻" },
  request: [
    "2つの作業を同時に進めたいな。",
    "片方の処理をバックグラウンドで動かそう。",
  ],
  steps: [
    {
      id: "bg-sleep",
      label: "sleep 100 & でバックグラウンド実行する",
      hint: "コマンドの末尾に & を付けると、バックグラウンドで実行できます。例: sleep 100 &",
      goal: { type: "commandRan", pattern: "sleep\\s+\\d+\\s*&\\s*$" },
    },
    {
      id: "check-jobs",
      label: "jobs でジョブ番号を確認する",
      hint: "jobs コマンドで、実行中のジョブとその番号（[1]など）を確認できます。",
      goal: { type: "commandRan", cmd: "jobs" },
    },
    {
      id: "fg-job1",
      label: "fg %1 でジョブ番号を指定してフォアグラウンドに戻す",
      hint: [
        "ジョブが複数ある場合は、fg だけでなく番号を指定すると狙ったジョブを操作できます。",
        "fg %1 のように、% とジョブ番号を組み合わせて指定します。",
      ],
      goal: { type: "commandRan", pattern: "^fg\\s+%1\\s*$" },
    },
  ],
  explanation: {
    why: "バックグラウンドで動かしたジョブが複数あるとき、fg や bg だけでは「どのジョブを操作したいか」があいまいになります。jobs で表示されるジョブ番号（[1], [2]…）を使い、fg %1 のように指定すると、狙ったジョブだけを確実にフォアグラウンドへ戻せます。",
    alternatives: "ジョブが1つしかない場合は番号を省略して fg だけでも直近のジョブ（jobsで+が付く「現在のジョブ」）が対象になります。%+ で現在のジョブ、%- で1つ前のジョブを明示的に指定することもできます。",
    lpic: "LPIC Level1では、複数のバックグラウンドジョブを %N の番号で指定して操作する方法や、jobs の出力に含まれる + / - の意味が問われることがあります。",
  },
};
