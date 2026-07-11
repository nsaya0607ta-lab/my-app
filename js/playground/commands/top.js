import { pad, padStart, outLine } from './_util.js';

function uptimeText(bootedAt){
  const mins = Math.max(0, Math.floor((Date.now() - bootedAt.getTime()) / 60000));
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? `${h}:${padStart(m,2)}` : `${m} min`;
}

// top（簡易版）: リアルタイム更新はせず、1回分のスナップショット（top -bn1相当）を表示する
export default function top(ctx){
  const now = new Date();
  const hh = padStart(now.getHours(),2), mm = padStart(now.getMinutes(),2), ss = padStart(now.getSeconds(),2);
  const procs = ctx.state.processes.slice().sort((a,b) => b.cpu - a.cpu);
  const running = procs.filter(p => p.stat.startsWith("R")).length;

  const lines = [
    outLine(`top - ${hh}:${mm}:${ss} up ${uptimeText(ctx.state.bootedAt)},  1 user,  load average: 0.15, 0.10, 0.05`),
    outLine(`Tasks: ${padStart(procs.length,3)} total, ${padStart(running,3)} running, ${padStart(procs.length-running,3)} sleeping,   0 stopped,   0 zombie`),
    outLine(`%Cpu(s):  3.2 us,  1.1 sy,  0.0 ni, 95.5 id,  0.2 wa,  0.0 hi,  0.0 si,  0.0 st`),
    outLine(`MiB Mem :   7851.9 total,   3799.0 free,   2095.0 used,   1957.0 buff/cache`),
    outLine(`MiB Swap:   2048.0 total,   2048.0 free,      0.0 used.   5688.6 avail Mem`),
    outLine(""),
    outLine(`${padStart("PID",7)} ${pad("USER",9)}${pad("PR",3)}${pad("NI",4)}${padStart("VIRT",8)} ${padStart("RES",6)} ${pad("SHR",6)}${pad("S",2)}${padStart("%CPU",6)} ${padStart("%MEM",5)} ${pad("TIME+",9)}COMMAND`),
  ];
  procs.forEach(p => {
    const virt = Math.round(20000 + p.mem * 8000);
    const res = Math.round(virt * 0.3);
    lines.push(outLine(`${padStart(p.pid,7)} ${pad(p.user,9)}${pad("20",3)}${pad("0",4)}${padStart(virt,8)} ${padStart(res,6)} ${pad(String(Math.round(res*0.4)),6)}${pad(p.stat[0],2)}${padStart(p.cpu.toFixed(1),6)} ${padStart(p.mem.toFixed(1),5)} ${pad("0:00.00",9)}${p.cmd}`));
  });
  return { lines, err:[] };
}
