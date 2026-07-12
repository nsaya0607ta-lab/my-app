import { pad, outLine } from './_util.js';

// bashのjobsコマンド相当。直近に追加されたジョブを「現在のジョブ(+)」、
// その1つ前を「1つ前のジョブ(-)」として表示する（実際のbashと同じ記法）。
export default function jobs(ctx){
  const list = ctx.state.jobs;
  if(!list.length) return { lines:[], err:[] };
  const lines = list.map((j, i) => {
    const marker = i === list.length - 1 ? "+" : (i === list.length - 2 ? "-" : " ");
    const statusText = j.status === "running" ? "Running" : "Stopped";
    const suffix = j.status === "running" ? " &" : "";
    return outLine(`[${j.id}]${marker}  ${pad(statusText, 10)}${j.cmd}${suffix}`);
  });
  return { lines, err:[] };
}
