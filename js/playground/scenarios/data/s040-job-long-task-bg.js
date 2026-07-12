export default {
  id: "s040",
  title: "長時間処理",
  difficulty: "初級",
  difficultyLevel: 1,
  category: "ジョブ管理・プロセス管理",
  requester: { name: "先輩", role: "開発チーム", avatar: "🧑‍💻" },
  request: [
    "この処理は時間がかかるから、裏で動かして別の作業を進めよう。",
  ],
  steps: [
    {
      id: "bg-sleep",
      label: "sleep 300 & でバックグラウンド実行する",
      hint: "コマンドの末尾に & を付けると、その処理をバックグラウンド（裏側）で実行できます。例: sleep 300 &",
      goal: { type: "commandRan", pattern: "sleep\\s+\\d+\\s*&\\s*$" },
    },
    {
      id: "check-jobs",
      label: "jobs でバックグラウンドジョブを確認する",
      hint: "jobs コマンドで、現在バックグラウンドで動いているジョブの一覧を確認できます。",
      goal: { type: "commandRan", cmd: "jobs" },
    },
    {
      id: "fg-job",
      label: "fg でジョブをフォアグラウンドに戻す",
      hint: "fg コマンドで、バックグラウンドのジョブをフォアグラウンドに戻せます。",
      goal: { type: "commandRan", cmd: "fg" },
    },
  ],
  explanation: {
    why: "時間のかかる処理をそのまま実行すると、終わるまでターミナルを占有されてしまいます。コマンドの末尾に & を付けるとバックグラウンドで実行され、すぐにプロンプトが戻ってくるので別の作業を続けられます。jobs で今どんなジョブが動いているかを確認し、その処理の様子を見たくなったら fg でフォアグラウンドに戻せます。",
    alternatives: "既に実行してしまった処理を後からバックグラウンドに回したい場合は、Ctrl+Zでいったん停止してから bg コマンドで再開する、という方法もあります（このあと別のシナリオで扱います）。",
    lpic: "LPIC Level1では、& によるバックグラウンド実行、jobs でのジョブ一覧確認、fg/bg によるフォアグラウンド・バックグラウンドの切り替えという、シェルのジョブ制御の基本がよく出題されます。",
  },
};
