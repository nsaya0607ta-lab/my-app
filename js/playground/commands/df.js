import { parseFlags, humanSize, pad, padStart, outLine } from './_util.js';

// 単位はdfの既定と同じ1Kブロック
const FILESYSTEMS = [
  { fs:"/dev/sda1", total:20971520, used:8552000, mount:"/" },
  { fs:"/dev/sda2", total:1048576,  used:215000,  mount:"/boot" },
  { fs:"tmpfs",     total:4019692,  used:0,       mount:"/dev/shm" },
  { fs:"/dev/sda3", total:10485760, used:3312000, mount:"/home" },
];

export default function df(ctx){
  const { flags } = parseFlags(ctx.args);
  const human = flags.has("h");
  const lines = [ outLine(human
    ? "Filesystem      Size  Used Avail Use% Mounted on"
    : "Filesystem     1K-blocks    Used Available Use% Mounted on") ];
  FILESYSTEMS.forEach(f => {
    const avail = f.total - f.used;
    const pct = `${Math.round((f.used / f.total) * 100)}%`;
    if(human){
      lines.push(outLine(`${pad(f.fs, 15)} ${padStart(humanSize(f.total*1024), 4)} ${padStart(humanSize(f.used*1024), 4)} ${padStart(humanSize(avail*1024), 5)} ${padStart(pct, 4)} ${f.mount}`));
    } else {
      lines.push(outLine(`${pad(f.fs, 14)} ${padStart(f.total, 9)} ${padStart(f.used, 7)} ${padStart(avail, 9)} ${padStart(pct, 4)} ${f.mount}`));
    }
  });
  return { lines, err:[] };
}
