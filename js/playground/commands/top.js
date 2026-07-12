import { pad, padStart, outLine } from './_util.js';

function pad0(n){ return String(n).padStart(2, "0"); }

function uptimeText(bootedAt){
  const mins = Math.max(0, Math.floor((Date.now() - bootedAt.getTime()) / 60000));
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? `${h}:${pad0(m)}` : `${m} min`;
}

function jitter(base, spread){
  return Math.max(0, base + (Math.random() - 0.5) * spread);
}

// top -bn1 相当の1画面分のスナップショットを生成する。呼び出すたびに
// CPU/メモリ/ロードアベレージ・各プロセスの%CPUへ小さな揺らぎを加えることで、
// 実際のtopのように一定間隔で少しずつ数値が変化して見えるようにしている。
export function buildTopLines(state){
  const now = new Date();
  const hh = pad0(now.getHours()), mm = pad0(now.getMinutes()), ss = pad0(now.getSeconds());
  const procs = state.processes.slice().sort((a,b) => b.cpu - a.cpu);
  const running = procs.filter(p => p.stat.startsWith("R")).length;

  const us = jitter(3.2, 2.4);
  const sy = jitter(1.1, 1.2);
  const id = Math.max(0, 100 - us - sy - 0.2);
  const load1 = jitter(0.15, 0.12);
  const load5 = jitter(0.10, 0.06);
  const load15 = jitter(0.05, 0.03);
  const memUsed = jitter(2095.0, 120);
  const memFree = Math.max(0, 7851.9 - memUsed - 1957.0);

  const lines = [
    outLine(`top - ${hh}:${mm}:${ss} up ${uptimeText(state.bootedAt)},  1 user,  load average: ${load1.toFixed(2)}, ${load5.toFixed(2)}, ${load15.toFixed(2)}`),
    outLine(`Tasks: ${padStart(procs.length,3)} total, ${padStart(running,3)} running, ${padStart(procs.length-running,3)} sleeping,   0 stopped,   0 zombie`),
    outLine(`%Cpu(s): ${padStart(us.toFixed(1),4)} us, ${padStart(sy.toFixed(1),4)} sy,  0.0 ni, ${padStart(id.toFixed(1),4)} id,  0.2 wa,  0.0 hi,  0.0 si,  0.0 st`),
    outLine(`MiB Mem :   7851.9 total,   ${memFree.toFixed(1)} free,   ${memUsed.toFixed(1)} used,   1957.0 buff/cache`),
    outLine(`MiB Swap:   2048.0 total,   2048.0 free,      0.0 used.   ${(memFree + 1957.0).toFixed(1)} avail Mem`),
    outLine(""),
    outLine(`${padStart("PID",7)} ${pad("USER",9)}${pad("PR",3)}${pad("NI",4)}${padStart("VIRT",8)} ${padStart("RES",6)} ${pad("SHR",6)}${pad("S",2)}${padStart("%CPU",6)} ${padStart("%MEM",5)} ${pad("TIME+",9)}COMMAND`),
  ];
  procs.forEach(p => {
    const cpu = jitter(p.cpu, p.cpu > 0 ? p.cpu * 0.6 + 0.3 : 0.2);
    const virt = Math.round(20000 + p.mem * 8000);
    const res = Math.round(virt * 0.3);
    lines.push(outLine(`${padStart(p.pid,7)} ${pad(p.user,9)}${pad("20",3)}${pad("0",4)}${padStart(virt,8)} ${padStart(res,6)} ${pad(String(Math.round(res*0.4)),6)}${pad(p.stat[0],2)}${padStart(cpu.toFixed(1),6)} ${padStart(p.mem.toFixed(1),5)} ${pad("0:00.00",9)}${p.cmd}`));
  });
  return lines;
}

// top（フルスクリーン疑似ターミナル版）: 通常のコマンド出力ではなく、
// nano/lessと同じ「overlay」を介して専用画面を開く。実際の描画・自動更新
// ・q/kキー操作は各画面（screen.js / scenarios/scenarioTerminal.js）側の
// openTopModal()が、このファイルのbuildTopLines()を約1秒ごとに呼び直す
// ことで行う。
export default function top(){
  return { lines: [], err: [], overlay: { type: "top" } };
}
