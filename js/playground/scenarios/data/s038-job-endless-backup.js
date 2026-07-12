export default {
  id: "s038",
  title: "終わらないバックアップ",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ジョブ管理・プロセス管理",
  requester: { name: "先輩", role: "開発チーム", avatar: "🧑‍💻" },
  request: [
    "昨日からバックアップが終わらないんだ。",
    "どのプロセスが動いているか確認して止めてくれる？",
  ],
  initialEnv: {
    processes: [
      { pid: 2201, ppid: 640, user: "student", cpu: 96.4, mem: 3.2, tty: "pts/0", stat: "R+", cmd: "backup.sh --full" },
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
      id: "grep-backup",
      label: "grep で backup のプロセスを絞り込む",
      hint: [
        "ps aux の出力は行数が多いので、目的のプロセスだけを探すには grep と組み合わせます。",
        "ps aux | grep backup のようにパイプ（|）でつなぎます。",
      ],
      goal: { type: "commandRan", pattern: "grep\\s+.*backup" },
    },
    {
      id: "kill-backup",
      label: "backup プロセスを終了する",
      hint: [
        "絞り込んだ行に表示されているPID（プロセスID）を確認します。",
        "kill PID のように、確認したPIDを指定してプロセスを終了します。",
      ],
      goal: { type: "processGone", match: "backup" },
    },
  ],
  explanation: {
    why: "「今どんなプロセスが動いているか分からない」ときは、まず ps aux で全プロセスを一覧表示し、grep で目的のプロセス名だけに絞り込んでPIDを特定し、最後に kill PID で終了させる、という流れが基本です。いきなりPIDが分かっていることは少なく、この3ステップの組み合わせを覚えておくと現場調査でそのまま使えます。",
    alternatives: "grep の代わりに pgrep backup でPIDだけを直接調べることもできます。また、プロセス名が分かっているなら ps を使わずに killall backup.sh のようにプロセス名で直接終了させることも可能です。",
    lpic: "LPIC Level1では ps aux / ps -ef の出力項目（USER・PID・%CPU・COMMANDなど）の読み方や、grep との組み合わせによるプロセス調査、kill の基本的な使い方が問われます。",
  },
};
