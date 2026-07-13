import { outLine, pad, padStart, humanSize } from './_util.js';

// "8:0" のディスクのMAJ:MINから、パーティション番号ぶんズラしたMAJ:MINを作る
// （実際のLinuxでも sda1 は 8:1、sda2 は 8:2 のように連番になる）
function partitionMajMin(diskMajMin, partNum){
  const [maj, min] = diskMajMin.split(":").map(Number);
  return `${maj}:${min + partNum}`;
}

export default function lsblk(ctx){
  const shell = ctx.state;
  const lines = [ outLine("NAME    MAJ:MIN RM   SIZE RO TYPE MOUNTPOINTS") ];
  for(const [name, disk] of shell.disks.entries()){
    lines.push(outLine(`${pad(name, 7)} ${pad(disk.majMin, 7)}  0 ${padStart(humanSize(disk.sizeBytes), 5)}  0 disk`));
    disk.partitions.forEach((p, idx) => {
      const isLast = idx === disk.partitions.length - 1;
      const branch = isLast ? "└─" : "├─";
      const partName = `${name}${p.num}`;
      const mount = shell.mounts.find(m => m.device === `/dev/${partName}`);
      lines.push(outLine(`${pad(branch + partName, 7)} ${pad(partitionMajMin(disk.majMin, p.num), 7)}  0 ${padStart(humanSize(p.sizeBytes), 5)}  0 part${mount ? " " + mount.mountpoint : ""}`));
    });
  }
  return { lines, err:[] };
}
