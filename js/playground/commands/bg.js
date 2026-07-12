import { errLine, outLine } from './_util.js';

// 停止中（Stopped）のジョブを、バックグラウンドで動かしたまま再開する。
// フォアグラウンドへは戻さないため、ジョブテーブルには残り続ける。
export default function bg(ctx){
  const token = ctx.args[0];
  const job = ctx.state.findJob(token);
  if(!job){
    return { lines:[], err:[ errLine(token ? `bash: bg: ${token}: no such job` : "bash: bg: current: no such job") ] };
  }
  job.status = "running";
  return { lines:[ outLine(`[${job.id}]+ ${job.cmd} &`) ], err:[] };
}
