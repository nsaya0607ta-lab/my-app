export default {
  id: "s042",
  title: "間違えてCtrl+Z",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ジョブ管理・プロセス管理",
  requester: { name: "先輩", role: "開発チーム", avatar: "🧑‍💻" },
  request: [
    "あ、作業中に Ctrl+Z を押しちゃった…処理が止まってる。",
    "バックグラウンドで再開しておいてもらえる？",
  ],
  initialEnv: {
    jobs: [
      { cmd: "rsync -av ./data /backup", status: "stopped" },
    ],
  },
  steps: [
    {
      id: "check-jobs",
      label: "jobs で停止中のジョブを確認する",
      hint: "jobs コマンドで、Ctrl+Zなどで停止（Stopped）しているジョブを確認できます。",
      goal: { type: "commandRan", cmd: "jobs" },
    },
    {
      id: "bg-resume",
      label: "bg でバックグラウンド実行を再開する",
      hint: "bg コマンドで、停止中のジョブをバックグラウンドで動かしたまま再開できます。",
      goal: { type: "job", state: "running" },
    },
  ],
  explanation: {
    why: "作業中に誤って Ctrl+Z を押すと、実行中の処理はフォアグラウンドのまま停止（Stopped）した状態になります。jobs で今どんなジョブが停止しているかを確認し、そのまま裏側で続けさせたいときは bg でバックグラウンド実行として再開させます。中断してしまった処理を完全に止めずに済む、実務でもよくある操作です。",
    alternatives: "フォアグラウンドに戻して作業の続きをそのまま見たい場合は、bg の代わりに fg を使います（次のシナリオで扱います）。停止したまま処理自体をやめたい場合は kill %1 のようにジョブ番号を指定して終了させることもできます。",
    lpic: "LPIC Level1では、Ctrl+Zによるジョブの一時停止（Stopped）と、bg/fg によるジョブ状態の切り替え、jobs でのジョブ番号（[1]など）の確認方法が問われます。",
  },
};
