export default {
  id: "s045",
  title: "本番障害",
  difficulty: "LPIC Level1",
  difficultyLevel: 4,
  category: "ジョブ管理・プロセス管理",
  requester: { name: "先輩", role: "システム管理者", avatar: "🧑‍💻" },
  request: [
    "report.sh がCPUを使い続けてるみたい。",
    "状況を確認して、安全に停止して。",
  ],
  initialEnv: {
    processes: [
      { pid: 2233, ppid: 640, user: "student", cpu: 99.1, mem: 5.6, tty: "pts/0", stat: "R+", cmd: "report.sh --generate", stubborn: true },
    ],
  },
  steps: [
    {
      id: "ps-aux",
      label: "ps aux でプロセス一覧を確認する",
      hint: "ps aux コマンドで、動いているすべてのプロセスを一覧表示できます。",
      goal: { type: "commandRan", pattern: "^ps\\s+aux" },
    },
    {
      id: "grep-report",
      label: "grep で report のプロセスを絞り込む",
      hint: "ps aux | grep report のようにパイプ（|）でつないで、目的のプロセスだけを絞り込みます。",
      goal: { type: "commandRan", pattern: "grep\\s+.*report" },
    },
    {
      id: "kill-term",
      label: "まずは通常の kill で終了を試みる",
      hint: "確認したPIDに対して kill PID を実行し、まずは穏やかな終了（SIGTERM）を試みます。",
      goal: { type: "commandRan", pattern: "^kill\\s+(-15\\s+)?\\d+\\s*$" },
    },
    {
      id: "kill-9",
      label: "止まらない場合のみ kill -9 で強制終了する",
      hint: [
        "report.sh は通常のkill（SIGTERM）では終了しません。",
        "kill -9 PID でSIGKILL（強制終了）を送ります。",
      ],
      goal: { type: "processGone", match: "report.sh" },
    },
  ],
  explanation: {
    why: "本番障害の対応では、まず ps aux と grep で「何が」「どのPIDで」CPUを使い続けているのかを正確に特定することが最優先です。特定できたら、まずは通常の kill（SIGTERM）で正常終了を試み、それでも終了しない場合に限って kill -9（SIGKILL）で強制終了します。いきなり -9 を使わないのは、処理中のデータが不完全な状態のまま失われるリスクを避けるためで、本番環境ほどこの順序が重要になります。",
    alternatives: "同じ内容は killall report.sh / killall -9 report.sh のようにプロセス名指定でも行えます。障害調査では、終了させる前に top で継続的にCPU使用率を観察し、本当に暴走しているかを見極めることも大切です。",
    lpic: "LPIC Level1では、ps aux / -ef の出力の読み方、grep との組み合わせによるプロセス特定、kill のデフォルトシグナル（SIGTERM=15）とSIGKILL（9）の使い分けが頻出です。本番運用を意識した『まず穏やかに、ダメなら強制的に』という順序も実務・試験の両方で重要な考え方です。",
  },
};
