import { pad, padStart, outLine } from './_util.js';

function shortCmd(cmd){ return cmd.split(/\s+/)[0].replace(/^-/, ""); }

export default function ps(ctx){
  const args = ctx.args.join(" ");
  const procs = ctx.state.processes;

  if(args.includes("aux")){
    const lines = [ outLine(`${pad("USER",10)}${padStart("PID",6)} ${padStart("%CPU",5)} ${padStart("%MEM",5)} ${padStart("VSZ",8)} ${padStart("RSS",7)} ${pad("TTY",8)} ${pad("STAT",5)} ${pad("START",6)}${pad("TIME",8)} COMMAND`) ];
    procs.forEach(p => {
      const vsz = Math.round(20000 + p.mem * 8000);
      const rss = Math.round(vsz * 0.3);
      lines.push(outLine(`${pad(p.user,10)}${padStart(p.pid,6)} ${padStart(p.cpu.toFixed(1),5)} ${padStart(p.mem.toFixed(1),5)} ${padStart(vsz,8)} ${padStart(rss,7)} ${pad(p.tty,8)} ${pad(p.stat,5)} ${pad("07:00",6)}${pad("0:00",8)} ${p.cmd}`));
    });
    return { lines, err:[] };
  }

  if(args.includes("-ef") || args.includes("ef")){
    const lines = [ outLine(`${pad("UID",10)}${padStart("PID",6)} ${padStart("PPID",6)} ${padStart("C",3)} ${pad("STIME",6)}${pad("TTY",9)}${pad("TIME",9)}CMD`) ];
    procs.forEach(p => {
      lines.push(outLine(`${pad(p.user,10)}${padStart(p.pid,6)} ${padStart(p.ppid,6)} ${padStart(Math.round(p.cpu),3)} ${pad("07:00",6)}${pad(p.tty,9)}${pad("00:00:00",9)}${p.cmd}`));
    });
    return { lines, err:[] };
  }

  const visible = procs.filter(p => p.tty === "pts/0");
  const lines = [ outLine(`${padStart("PID",7)} ${pad("TTY",10)}${pad("TIME",10)}CMD`) ];
  visible.forEach(p => {
    lines.push(outLine(`${padStart(p.pid,7)} ${pad(p.tty,10)}${pad("00:00:00",10)}${shortCmd(p.cmd)}`));
  });
  return { lines, err:[] };
}
