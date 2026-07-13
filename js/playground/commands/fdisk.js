import { errLine, outLine, pad, padStart, humanSize } from './_util.js';
import { diskNameFromDevice } from '../diskCatalog.js';

// fdisk -l の1台ぶんの表示（ヘッダ情報＋パーティション一覧）
export function diskListingLines(shell, diskName){
  const disk = shell.disks.get(diskName);
  const totalSectors = Math.floor(disk.sizeBytes / 512);
  const lines = [
    outLine(`Disk ${disk.device}: ${humanSize(disk.sizeBytes)}, ${disk.sizeBytes} bytes, ${totalSectors} sectors`),
    outLine(`Disk model: ${disk.model}`),
    outLine("Units: sectors of 1 * 512 = 512 bytes"),
    outLine("Sector size (logical/physical): 512 bytes / 512 bytes"),
    outLine("I/O size (minimum/optimal): 512 bytes / 512 bytes"),
    outLine("Disklabel type: gpt"),
    outLine(`Disk identifier: ${disk.identifier}`),
  ];
  if(disk.partitions.length){
    lines.push(outLine(""));
    lines.push(outLine("Device       Start       End   Sectors  Size Type"));
    let start = 2048;
    disk.partitions.forEach(p => {
      const sectorCount = Math.floor(p.sizeBytes / 512);
      const end = start + sectorCount - 1;
      lines.push(outLine(`${pad(disk.device + p.num, 12)} ${padStart(start, 9)} ${padStart(end, 9)} ${padStart(sectorCount, 9)} ${padStart(humanSize(p.sizeBytes), 4)} Linux filesystem`));
      start = end + 1;
    });
  }
  return lines;
}

export default function fdisk(ctx){
  const shell = ctx.state;
  const operands = ctx.args.filter(a => !a.startsWith("-"));
  const listMode = ctx.args.includes("-l") || ctx.args.includes("--list");

  if(listMode){
    const targets = operands.length ? operands : Array.from(shell.disks.keys()).map(n => shell.disks.get(n).device);
    const lines = [];
    const err = [];
    let first = true;
    targets.forEach(devArg => {
      const diskName = diskNameFromDevice(devArg);
      if(!diskName || !shell.disks.has(diskName)){
        err.push(errLine(`fdisk: cannot open ${devArg}: No such file or directory`));
        return;
      }
      if(!first) lines.push(outLine(""));
      first = false;
      diskListingLines(shell, diskName).forEach(l => lines.push(l));
    });
    return { lines, err };
  }

  if(!operands.length) return { lines:[], err:[ errLine("usage: fdisk [-l] [デバイス名]") ] };

  const devArg = operands[0];
  const diskName = diskNameFromDevice(devArg);
  if(!diskName || !shell.disks.has(diskName)){
    return { lines:[], err:[ errLine(`fdisk: cannot open ${devArg}: No such file or directory`) ] };
  }
  if(!ctx.session || !ctx.session.isRoot()){
    return { lines:[], err:[ errLine(`fdisk: cannot open ${devArg}: Permission denied`) ] };
  }
  return { lines:[], err:[], overlay:{ type:"fdisk", diskName } };
}
