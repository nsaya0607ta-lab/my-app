import { errLine } from './_util.js';
import { partitionRefFromDevice } from '../diskCatalog.js';

export default function mount(ctx){
  const shell = ctx.state;
  const vfs = ctx.vfs;
  const operands = ctx.args.filter(a => !a.startsWith("-"));
  if(operands.length < 2) return { lines:[], err:[ errLine("usage: mount デバイス名 マウント先ディレクトリ") ] };

  const [devArg, mountArg] = operands;
  const ref = partitionRefFromDevice(devArg);
  const part = ref && shell.findPartition(ref.diskName, ref.partNum);
  if(!part) return { lines:[], err:[ errLine(`mount: ${devArg}: special device does not exist`) ] };
  if(!part.fsType) return { lines:[], err:[ errLine(`mount: ${devArg}: unknown filesystem type '(unknown)'`) ] };

  if(!ctx.session || !ctx.session.isRoot()){
    return { lines:[], err:[ errLine("mount: only root can do that") ] };
  }
  if(shell.isMounted(devArg)){
    return { lines:[], err:[ errLine(`mount: ${devArg}: already mounted.`) ] };
  }

  const mountSegs = vfs.resolvePath(mountArg);
  const node = vfs.getNode(mountSegs);
  if(!node) return { lines:[], err:[ errLine(`mount: ${mountArg}: mount point does not exist.`) ] };
  if(node.type !== "dir") return { lines:[], err:[ errLine(`mount: ${mountArg}: not a directory.`) ] };

  const mountpointAbs = "/" + mountSegs.join("/");
  if(shell.mounts.some(m => m.mountpoint === mountpointAbs)){
    return { lines:[], err:[ errLine(`mount: ${mountpointAbs}: mount point is busy.`) ] };
  }

  shell.mountDevice(devArg, mountpointAbs, part.fsType);
  return { lines:[], err:[] };
}
