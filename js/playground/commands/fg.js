import { errLine, outLine } from './_util.js';

// バックグラウンド／停止中のジョブをフォアグラウンドへ戻す。実際のbashは
// そのまま処理の完了を待つが、本環境のジョブは実時間で進行しないため、
// フォアグラウンドへ戻した時点で処理が完了したものとしてジョブテーブル
// から取り除く（コマンド行のエコー表示だけは実際のfgと同じ）。
export default function fg(ctx){
  const token = ctx.args[0];
  const job = ctx.state.findJob(token);
  if(!job){
    return { lines:[], err:[ errLine(token ? `bash: fg: ${token}: no such job` : "bash: fg: current: no such job") ] };
  }
  ctx.state.removeJob(job);
  return { lines:[ outLine(job.cmd) ], err:[] };
}
