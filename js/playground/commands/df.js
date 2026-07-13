import { parseFlags, humanSize, pad, padStart, outLine } from './_util.js';
import { partitionRefFromDevice } from '../diskCatalog.js';

// tmpfsのように物理パーティションを持たないマウントの既定使用量（1Kブロック単位）
const TMPFS_USED_1K = 0;
const TMPFS_TOTAL_1K = 4019692;

// マウント済みの各ファイルシステムの使用量を1Kブロック単位で組み立てる。
// sda1〜3は元々の固定値（OS用ディスクは常に一定の使用量とみなす）、
// mkfs.ext4 で新しく作られたパーティションはフォーマット直後を想定した
// ごく小さい使用量（数十MB程度のメタデータ分のみ）で表示する。
function filesystemsFor(shell){
  return shell.mounts.map(m => {
    if(m.device === "tmpfs") return { fs: m.device, total: TMPFS_TOTAL_1K, used: TMPFS_USED_1K, mount: m.mountpoint };
    if(m.device === "/dev/sda1") return { fs: m.device, total: 20971520, used: 8552000, mount: m.mountpoint };
    if(m.device === "/dev/sda2") return { fs: m.device, total: 1048576,  used: 215000,  mount: m.mountpoint };
    if(m.device === "/dev/sda3") return { fs: m.device, total: 10485760, used: 3312000, mount: m.mountpoint };
    const ref = partitionRefFromDevice(m.device);
    const part = ref && shell.findPartition(ref.diskName, ref.partNum);
    const totalKb = part ? Math.floor(part.sizeBytes / 1024 * 0.95) : 0; // ext4のメタデータ分を差し引いた実効サイズ
    return { fs: m.device, total: totalKb, used: 24576, mount: m.mountpoint };
  });
}

export default function df(ctx){
  const { flags } = parseFlags(ctx.args);
  const human = flags.has("h");
  const lines = [ outLine(human
    ? "Filesystem      Size  Used Avail Use% Mounted on"
    : "Filesystem     1K-blocks    Used Available Use% Mounted on") ];
  filesystemsFor(ctx.state).forEach(f => {
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
