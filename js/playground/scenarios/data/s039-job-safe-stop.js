export default {
  id: "s039",
  title: "安全に停止しよう",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ジョブ管理・プロセス管理",
  requester: { name: "先輩", role: "開発チーム", avatar: "🧑‍💻" },
  request: [
    "そのプログラム止めて！",
    "…あ、いきなり kill -9 はダメだよ。まずは普通に kill で終了させてみよう。",
  ],
  initialEnv: {
    processes: [
      { pid: 2210, ppid: 640, user: "student", cpu: 45.0, mem: 1.8, tty: "pts/0", stat: "R+", cmd: "data-sync", stubborn: true },
    ],
  },
  steps: [
    {
      id: "kill-term",
      label: "まずは通常の kill で終了を試みる",
      hint: "kill PID コマンドで、プロセスへ終了要求（SIGTERM）を送れます。",
      goal: { type: "commandRan", pattern: "^kill\\s+(-15\\s+)?\\d+\\s*$" },
    },
    {
      id: "kill-9",
      label: "それでも終了しない場合は kill -9 で強制終了する",
      hint: [
        "通常のkill（SIGTERM）を無視してしまうプロセスもあります。",
        "その場合は kill -9 PID でSIGKILL（強制終了）を送ります。",
      ],
      goal: { type: "processGone", match: "data-sync" },
    },
  ],
  explanation: {
    why: "kill はデフォルトでSIGTERM（15番）という「穏やかな終了要求」を送ります。多くのプログラムはこれで正しく後片付けをして終了しますが、正常に終了できない・シグナルを無視するプログラムも存在します。そのときだけ kill -9（SIGKILL・9番）で強制的に終了させます。いきなり -9 を使わない理由は、保存中のデータが中途半端な状態のまま強制終了され、ファイルが壊れる可能性があるためです。",
    alternatives: "kill -15 PID のように明示的にSIGTERMを指定することもできます（何も付けない場合と同じ意味です）。プロセス名で操作したい場合は killall data-sync や killall -9 data-sync も使えます。",
    lpic: "LPIC Level1では、kill が送るシグナル番号の意味（1=SIGHUP, 9=SIGKILL, 15=SIGTERM）と、SIGTERMとSIGKILLの違い（後片付けの機会があるかどうか）がよく出題されます。",
  },
};
