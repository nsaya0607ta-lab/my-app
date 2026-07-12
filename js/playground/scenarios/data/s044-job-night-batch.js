export default {
  id: "s044",
  title: "夜間バッチ",
  difficulty: "中級",
  difficultyLevel: 3,
  category: "ジョブ管理・プロセス管理",
  requester: { name: "先輩", role: "運用担当", avatar: "🧑‍💻" },
  request: [
    "朝出社したら、夜間バッチが途中で止まっていたよ。",
    "ジョブを確認して再開してくれる？",
  ],
  initialEnv: {
    jobs: [
      { cmd: "nightly_batch.sh", status: "stopped" },
    ],
  },
  steps: [
    {
      id: "check-jobs",
      label: "jobs で止まっているジョブを確認する",
      hint: "jobs コマンドで、停止（Stopped）しているジョブがないか確認できます。",
      goal: { type: "commandRan", cmd: "jobs" },
    },
    {
      id: "fg-resume",
      label: "fg でジョブをフォアグラウンドに戻して再開する",
      hint: "fg コマンドで、止まっているジョブをフォアグラウンドに戻して処理を再開できます。",
      goal: { type: "job", state: "none" },
    },
  ],
  explanation: {
    why: "何らかの理由（Ctrl+Zによる一時停止など）でジョブが途中で止まっていることがあります。まず jobs で状況を確認し、そのまま処理の続きを見届けたい・再開させたいときは fg でフォアグラウンドに戻します。夜間バッチのように結果を確実に見届けたい処理は、バックグラウンドのまま bg で再開するより、fg で戻して完了を確認する方が安心です。",
    alternatives: "処理自体をやり直したい場合は、止まっているジョブを kill %1 のように終了させてから、あらためてバッチを実行し直すという判断も現場ではあり得ます。",
    lpic: "LPIC Level1では、jobs / fg / bg の役割の違いと、停止（Stopped）・実行中（Running）というジョブの状態遷移の理解が問われます。",
  },
};
