import { errLine, outLine } from './_util.js';
import { partitionRefFromDevice } from '../diskCatalog.js';

export default function mkfsExt4(ctx){
  const shell = ctx.state;
  const operands = ctx.args.filter(a => !a.startsWith("-"));
  const target = operands[0];
  if(!target) return { lines:[], err:[ errLine("usage: mkfs.ext4 デバイス名 (例: /dev/sdb1)") ] };

  const ref = partitionRefFromDevice(target);
  const part = ref && shell.findPartition(ref.diskName, ref.partNum);
  if(!part) return { lines:[], err:[ errLine(`mkfs.ext4: ${target}: No such file or directory`) ] };

  if(!ctx.session || !ctx.session.isRoot()){
    return { lines:[], err:[ errLine(`mkfs.ext4: cannot open ${target}: Permission denied`) ] };
  }
  if(shell.isMounted(target)){
    return { lines:[], err:[ errLine(`mkfs.ext4: ${target} is mounted; will not make a filesystem here!`) ] };
  }

  const blocks = Math.floor(part.sizeBytes / 4096);
  const inodes = Math.floor(blocks / 8);
  part.fsType = "ext4";
  const lines = [
    outLine("mke2fs 1.47.0 (5-Feb-2023)"),
    outLine(`Creating filesystem with ${blocks} 4k blocks and ${inodes} inodes`),
    outLine("Filesystem UUID: 8f3c1e2a-9b4d-4c1a-8e6f-2d3c4b5a6e7f"),
    outLine("Superblock backups stored on blocks: "),
    outLine("\t32768, 98304, 163840, 229376, 294912, 819200, 884736"),
    outLine(""),
    outLine("Allocating group tables: done                            "),
    outLine("Writing inode tables: done                            "),
    outLine("Writing superblocks and filesystem accounting information: done"),
    outLine(""),
  ];
  return { lines, err:[] };
}
