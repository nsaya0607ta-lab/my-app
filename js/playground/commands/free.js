import { parseFlags, humanSize, outLine, pad, padStart } from './_util.js';

const MEM = { total:8039384, used:2145312, free:3890216, shared:102436, buffCache:2003856 };

const COL_WIDTH = 13;

function row(label, vals, human){
  const fmt = (kb) => human ? humanSize(kb * 1024) : String(kb);
  const cols = vals.map(v => padStart(fmt(v), COL_WIDTH));
  return outLine(`${pad(label, 8)}${cols.join('')}`);
}

function activeSwapKb(state){
  if(!(state.swapFiles instanceof Map)) return { total:0, used:0, free:0 };
  let totalBytes = 0;
  let usedBytes = 0;
  state.swapFiles.forEach(area => {
    if(!area || !area.active) return;
    totalBytes += area.sizeBytes || 0;
    usedBytes += area.usedBytes || 0;
  });
  const total = Math.round(totalBytes / 1024);
  const used = Math.round(usedBytes / 1024);
  return { total, used, free:Math.max(0, total - used) };
}

export default function free(ctx){
  const { flags } = parseFlags(ctx.args);
  const human = flags.has('h') || flags.has('m') || flags.has('g');
  const swap = activeSwapKb(ctx.state);
  const header = ['total', 'used', 'free', 'shared', 'buff/cache', 'available'].map(h => padStart(h, COL_WIDTH)).join('');
  const lines = [
    outLine(`${pad('', 8)}${header}`),
    row('Mem:', [MEM.total, MEM.used, MEM.free, MEM.shared, MEM.buffCache, MEM.free + MEM.buffCache], human),
    row('Swap:', [swap.total, swap.used, swap.free], human),
  ];
  return { lines, err:[] };
}
