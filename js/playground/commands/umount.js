import { errLine } from './_util.js';

// OSが動作に使っているマウントポイント。誤って外すと環境が壊れるため、
// 実際のLinuxで "target is busy" になるのと同じように解除を拒否する。
const PROTECTED_MOUNTPOINTS = ["/", "/boot", "/home", "/dev/shm"];

export default function umount(ctx){
  const shell = ctx.state;
  const vfs = ctx.vfs;
  const operands = ctx.args.filter(a => !a.startsWith("-"));
  if(!operands.length) return { lines:[], err:[ errLine("usage: umount デバイス名またはマウント先ディレクトリ") ] };

  if(!ctx.session || !ctx.session.isRoot()){
    return { lines:[], err:[ errLine("umount: only root can do that") ] };
  }

  const target = operands[0];
  // デバイス名（/dev/sdb1）とマウントポイント（/mnt/data）のどちらでも指定できる
  let idx = shell.mounts.findIndex(m => m.device === target);
  if(idx === -1){
    const abs = "/" + vfs.resolvePath(target).join("/");
    idx = shell.mounts.findIndex(m => m.mountpoint === abs);
  }
  if(idx === -1) return { lines:[], err:[ errLine(`umount: ${target}: not mounted.`) ] };

  const mountpoint = shell.mounts[idx].mountpoint;
  if(PROTECTED_MOUNTPOINTS.includes(mountpoint)){
    return { lines:[], err:[ errLine(`umount: ${mountpoint}: target is busy.`) ] };
  }

  shell.mounts.splice(idx, 1);
  return { lines:[], err:[] };
}
