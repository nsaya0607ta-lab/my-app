import { errLine, outLine, humanSize, pad, padStart } from './_util.js';
import chmod from './chmod.js';
import tee from './tee.js';

function parseSize(raw){
  const m = /^(\d+(?:\.\d+)?)([KMGTP]?)$/i.exec(String(raw || '').trim());
  if(!m) return null;
  const units = { '':1, K:1024, M:1024**2, G:1024**3, T:1024**4, P:1024**5 };
  const bytes = Number(m[1]) * units[m[2].toUpperCase()];
  return Number.isFinite(bytes) && bytes > 0 ? Math.round(bytes) : null;
}

function absPath(vfs, path){
  return vfs.absPath(vfs.resolvePath(path));
}

function octalMode(node){
  const bits = (s) => (s[0] !== '-' ? 4 : 0) + (s[1] !== '-' ? 2 : 0) + (s[2] !== '-' ? 1 : 0);
  return `${bits(node.mode.slice(0,3))}${bits(node.mode.slice(3,6))}${bits(node.mode.slice(6,9))}`;
}

export function fallocate(ctx){
  let sizeRaw = null;
  let path = null;
  for(let i = 0; i < ctx.args.length; i++){
    const arg = ctx.args[i];
    if(arg === '-l' || arg === '--length') sizeRaw = ctx.args[++i];
    else if(arg.startsWith('--length=')) sizeRaw = arg.slice('--length='.length);
    else if(!arg.startsWith('-')) path = arg;
  }
  if(!sizeRaw || !path) return { lines:[], err:[ errLine('usage: fallocate -l SIZE FILE') ] };
  const sizeBytes = parseSize(sizeRaw);
  if(!sizeBytes) return { lines:[], err:[ errLine(`fallocate: invalid length value specified: ${sizeRaw}`) ] };
  const fullPath = absPath(ctx.vfs, path);
  const existing = ctx.state.swapFiles instanceof Map ? ctx.state.swapFiles.get(fullPath) : null;
  if(existing && existing.active) return { lines:[], err:[ errLine(`fallocate: cannot resize active swap file '${path}'`) ] };
  const res = ctx.vfs.writeFile(path, '', { append:false });
  if(res.error){
    const reason = res.error.error === 'EACCES' ? 'Permission denied' : 'No such file or directory';
    return { lines:[], err:[ errLine(`fallocate: cannot open ${path}: ${reason}`) ] };
  }
  if(!(ctx.state.swapFiles instanceof Map)) ctx.state.swapFiles = new Map();
  ctx.state.swapFiles.set(fullPath, { path:fullPath, sizeBytes, usedBytes:0, initialized:false, active:false });
  return { lines:[], err:[] };
}

export function mkswap(ctx){
  const path = ctx.args.find(a => !a.startsWith('-'));
  if(!path) return { lines:[], err:[ errLine('usage: mkswap FILE') ] };
  if(!ctx.vfs.isRootUser) return { lines:[], err:[ errLine(`mkswap: cannot open ${path}: Permission denied`) ] };
  const fullPath = absPath(ctx.vfs, path);
  const node = ctx.vfs.getNode(ctx.vfs.resolvePath(path));
  if(!node) return { lines:[], err:[ errLine(`mkswap: cannot open ${path}: No such file or directory`) ] };
  if(node.type !== 'file') return { lines:[], err:[ errLine(`mkswap: error: ${path} is not a regular file`) ] };
  if(!(ctx.state.swapFiles instanceof Map)) ctx.state.swapFiles = new Map();
  let area = ctx.state.swapFiles.get(fullPath);
  if(!area || !area.sizeBytes) return { lines:[], err:[ errLine('mkswap: error: swap area needs to be created with fallocate first') ] };
  const lines = [];
  const mode = octalMode(node);
  if(mode !== '600') lines.push(outLine(`mkswap: warning: insecure permissions ${mode}, fix with: chmod 0600 ${path}`));
  area = { ...area, initialized:true, active:false, usedBytes:0 };
  ctx.state.swapFiles.set(fullPath, area);
  lines.push(outLine(`Setting up swapspace version 1, size = ${humanSize(area.sizeBytes)} (${area.sizeBytes} bytes)`));
  lines.push(outLine('no label, UUID=6d3f96a2-4f3d-4b8e-91aa-0d7a6f2e8c10'));
  return { lines, err:[] };
}

function showSwapLines(state){
  const areas = state.swapFiles instanceof Map ? Array.from(state.swapFiles.values()).filter(a => a.active) : [];
  if(!areas.length) return [];
  const lines = [ outLine(`${pad('NAME',20)} ${pad('TYPE',6)} ${padStart('SIZE',8)} ${padStart('USED',8)} ${padStart('PRIO',5)}`) ];
  areas.forEach(area => {
    lines.push(outLine(`${pad(area.path,20)} ${pad('file',6)} ${padStart(humanSize(area.sizeBytes),8)} ${padStart(humanSize(area.usedBytes || 0),8)} ${padStart('-2',5)}`));
  });
  return lines;
}

export function swapon(ctx){
  if(ctx.args.includes('--show') || ctx.args.includes('-s') || ctx.args.includes('--summary')) return { lines:showSwapLines(ctx.state), err:[] };
  const path = ctx.args.find(a => !a.startsWith('-'));
  if(!path) return { lines:[], err:[ errLine('usage: swapon [--show] FILE') ] };
  if(!ctx.vfs.isRootUser) return { lines:[], err:[ errLine(`swapon: ${path}: swapon failed: Operation not permitted`) ] };
  const fullPath = absPath(ctx.vfs, path);
  const node = ctx.vfs.getNode(ctx.vfs.resolvePath(path));
  if(!node || node.type !== 'file') return { lines:[], err:[ errLine(`swapon: cannot open ${path}: No such file or directory`) ] };
  if(!(ctx.state.swapFiles instanceof Map)) ctx.state.swapFiles = new Map();
  const area = ctx.state.swapFiles.get(fullPath);
  if(!area || !area.initialized) return { lines:[], err:[ errLine(`swapon: ${path}: read swap header failed`) ] };
  if(area.active) return { lines:[], err:[ errLine(`swapon: ${path}: swapon failed: Device or resource busy`) ] };
  const lines = [];
  const mode = octalMode(node);
  if(mode !== '600') lines.push(outLine(`swapon: warning: insecure permissions ${mode}, 0600 suggested.`));
  ctx.state.swapFiles.set(fullPath, { ...area, active:true });
  return { lines, err:[] };
}

export function swapoff(ctx){
  if(!ctx.vfs.isRootUser){
    const target = ctx.args.find(a => !a.startsWith('-')) || ctx.args[0] || '';
    return { lines:[], err:[ errLine(`swapoff: ${target || 'swapoff'}: swapoff failed: Operation not permitted`) ] };
  }
  if(!(ctx.state.swapFiles instanceof Map)) ctx.state.swapFiles = new Map();
  if(ctx.args.includes('-a') || ctx.args.includes('--all')){
    ctx.state.swapFiles.forEach((area, key) => {
      if(area.active) ctx.state.swapFiles.set(key, { ...area, active:false, usedBytes:0 });
    });
    return { lines:[], err:[] };
  }
  const path = ctx.args.find(a => !a.startsWith('-'));
  if(!path) return { lines:[], err:[ errLine('usage: swapoff [-a] FILE') ] };
  const fullPath = absPath(ctx.vfs, path);
  const area = ctx.state.swapFiles.get(fullPath);
  if(!area || !area.active) return { lines:[], err:[ errLine(`swapoff: ${path}: swapoff failed: Invalid argument`) ] };
  ctx.state.swapFiles.set(fullPath, { ...area, active:false, usedBytes:0 });
  return { lines:[], err:[] };
}

const SUDO_HANDLERS = { chmod, tee, fallocate, mkswap, swapon, swapoff };

export function sudo(ctx){
  const [name, ...args] = ctx.args;
  if(!name) return { lines:[], err:[ errLine('usage: sudo COMMAND [ARG]...') ] };
  const handler = SUDO_HANDLERS[name];
  if(!handler) return { lines:[], err:[ errLine(`sudo: ${name}: command not supported in this playground`) ] };
  const prev = { currentUser:ctx.vfs.currentUser, currentGroup:ctx.vfs.currentGroup, isRootUser:ctx.vfs.isRootUser };
  ctx.vfs.currentUser = 'root';
  ctx.vfs.currentGroup = 'root';
  ctx.vfs.isRootUser = true;
  try{
    return handler({ ...ctx, args, sudo:true });
  } finally {
    ctx.vfs.currentUser = prev.currentUser;
    ctx.vfs.currentGroup = prev.currentGroup;
    ctx.vfs.isRootUser = prev.isRootUser;
  }
}
