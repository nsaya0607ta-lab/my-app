export default {
  id: "s070",
  title: "高負荷サーバーの内部状態を確認せよ",
  difficulty: "LPIC Level1",
  difficultyLevel: 3,
  category: "FHS・ディレクトリ構成",
  pack: "fhs-operations",
  requester: { name: "鈴木先輩", role: "障害対応", avatar: "📈" },
  request: [
    "【現場からの依頼】サーバーの負荷が高い。CPU、メモリ、対象プロセスの状態をOSが持つ情報から確認して。",
    "【状況】PID 2480のapp-workerが調査対象です。CPU型番と総メモリ量も確認してください。",
    "【問題】プロセスやカーネルが公開している実行中のシステム情報は、どの仮想ファイルシステムで確認できますか。",
  ],
  initialEnv: {
    dirs: ["/proc/2480"],
    files: [
      { path: "/proc/cpuinfo", content: "processor\t: 0\nmodel name\t: Virtual CPU 3.40GHz\ncpu cores\t: 4\n", owner: "root", group: "root" },
      { path: "/proc/meminfo", content: "MemTotal:        8160000 kB\nMemFree:          420000 kB\nMemAvailable:    1540000 kB\n", owner: "root", group: "root" },
      { path: "/proc/2480/status", content: "Name:\tapp-worker\nState:\tR (running)\nPid:\t2480\nVmRSS:\t1240000 kB\nThreads:\t32\n", owner: "root", group: "root" },
    ],
  },
  steps: [
    {
      id: "read-cpuinfo",
      label: "/proc/cpuinfo でCPU情報を確認する",
      hint: [
        "CPU情報は /proc/cpuinfo に公開されています。",
        "cat /proc/cpuinfo を実行します。",
      ],
      goal: { type: "commandRan", cmd: "cat", pattern: "/proc/cpuinfo" },
    },
    {
      id: "read-meminfo",
      label: "/proc/meminfo でメモリ情報を確認する",
      hint: "cat /proc/meminfo を実行します。",
      goal: { type: "commandRan", cmd: "cat", pattern: "/proc/meminfo" },
    },
    {
      id: "read-process-status",
      label: "PID 2480のstatusを確認する",
      hint: [
        "各プロセスの情報は /proc/PID 配下にあります。",
        "cat /proc/2480/status を実行します。",
      ],
      goal: { type: "commandRan", cmd: "cat", pattern: "/proc/2480/status" },
    },
  ],
  clearComment: "CPU、メモリ、プロセスの状態を /proc から確認できたね。実行中の情報を読む場所として覚えよう。",
  explanation: {
    why: "【正解】/proc です。/proc はディスク上の通常ファイルではなく、カーネルがプロセスやシステム状態をファイルの形で公開する仮想ファイルシステムです。/proc/cpuinfo、/proc/meminfo、/proc/PID/status などから情報を確認できます。",
    alternatives: "【確認コマンド】cat /proc/cpuinfo、cat /proc/meminfo、cat /proc/2480/status。実務では ps、top、free、lscpu などが /proc の情報を読みやすく整形して表示します。",
    lpic: "LPIC Level1では、/proc がプロセス情報とカーネル情報を提供する仮想ファイルシステムであることが重要です。再起動後も同じ内容が保存される通常ファイルではない点を理解しましょう。",
  },
};