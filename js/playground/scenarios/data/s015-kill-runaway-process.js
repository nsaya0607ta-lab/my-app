export default {
  id: "s015",
  title: "暴走プロセスの停止",
  difficulty: "LPIC Level1",
  difficultyLevel: 4,
  category: "プロセス管理",
  requester: { name: "井上さん", role: "運用担当", avatar: "🧑‍💻" },
  request: [
    "サーバのCPU使用率がずっと高いままなんだけど、",
    "top というプロセスが動きっぱなしになってるみたい。止めておいてもらえる？",
  ],
  steps: [
    {
      id: "kill",
      label: "top プロセスを終了させる",
      hint: "ps コマンドでPIDを確認し、kill PID で終了できます。プロセス名で指定したい場合は killall top も使えます。",
      goal: { type: "processGone", match: "top" },
    },
  ],
  explanation: {
    why: "動きっぱなしで止まらないプロセスは、PIDを指定して kill するか、プロセス名で killall して終了させます。まず ps や top でPIDと状況を確認してから対処する、という順番が基本です。いきなり全プロセスに近いものを止めてしまうと他の処理まで巻き込む危険があるため、対象の特定は慎重に行います。",
    alternatives: "kill はデフォルトでSIGTERM（15番、穏やかな終了要求）を送ります。それでも終了しない場合は kill -9 PID でSIGKILL（強制終了）を送ることもありますが、保存されていないデータが失われる可能性があるため最後の手段として使います。",
    lpic: "LPIC Level1では ps aux / ps -ef の出力の読み方、kill が送るシグナル番号（15=SIGTERM, 9=SIGKILL, 1=SIGHUP）の意味がよく出題されます。",
  },
};
