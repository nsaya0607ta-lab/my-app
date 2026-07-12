export default {
  id: "s041",
  title: "サーバーが重い",
  difficulty: "初級〜中級",
  difficultyLevel: 2,
  category: "ジョブ管理・プロセス管理",
  requester: { name: "先輩", role: "運用担当", avatar: "🧑‍💻" },
  request: [
    "今日はサーバーが重いな。",
    "CPUをたくさん使っているプロセスを探してみよう。",
  ],
  initialEnv: {
    processes: [
      { pid: 2222, ppid: 640, user: "student", cpu: 92.3, mem: 4.5, tty: "pts/0", stat: "R+", cmd: "video-encode --batch" },
    ],
  },
  steps: [
    {
      id: "top-check",
      label: "top でCPU使用率の高いプロセスを確認する",
      hint: "top コマンドで、CPU・メモリ使用率が高い順にプロセスを確認できます。",
      goal: { type: "commandRan", cmd: "top" },
    },
    {
      id: "kill-heavy",
      label: "CPUを使い続けているプロセスを終了する",
      hint: [
        "top の一覧の一番上（%CPUが最も高い行）に注目します。",
        "PIDを確認したら kill PID で終了します。",
      ],
      goal: { type: "processGone", match: "video-encode" },
    },
  ],
  explanation: {
    why: "サーバーが重いと感じたら、まず top でCPU・メモリ使用率をリアルタイムに確認し、原因になっているプロセスを特定します。原因のプロセスが分かったら、そのPIDを kill で終了させます。「重い→top で見る→怪しいプロセスを止める」という流れは、サーバー運用における基本的な切り分け手順です。",
    alternatives: "一覧をスナップショットとして確認したいだけなら ps aux --sort=-%cpu のようにCPU使用率順に並べ替えて見る方法もあります。top の画面内では k キーでPIDを指定してプロセスを終了することもできます。",
    lpic: "LPIC Level1では top の見方（load average・%CPU・%MEMなど）や、ps と組み合わせたプロセスの状況把握、負荷の高いプロセスへの対処方法が問われます。",
  },
};
