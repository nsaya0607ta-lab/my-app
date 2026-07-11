import { parseFlags, humanSize, outLine, pad, padStart } from './_util.js';

const MEM = { total:8039384, used:2145312, free:3890216, shared:102436, buffCache:2003856 };
const SWAP = { total:2097148, used:0, free:2097148 };

const COL_WIDTH = 13;

function row(label, vals, human){
  const fmt = (kb) => human ? humanSize(kb * 1024) : String(kb);
  const cols = vals.map(v => padStart(fmt(v), COL_WIDTH));
  return outLine(`${pad(label, 8)}${cols.join("")}`);
}

export default function free(ctx){
  const { flags } = parseFlags(ctx.args);
  const human = flags.has("h") || flags.has("m") || flags.has("g");
  const header = ["total", "used", "free", "shared", "buff/cache", "available"].map(h => padStart(h, COL_WIDTH)).join("");
  const lines = [
    outLine(`${pad("", 8)}${header}`),
    row("Mem:", [MEM.total, MEM.used, MEM.free, MEM.shared, MEM.buffCache, MEM.free + MEM.buffCache], human),
    row("Swap:", [SWAP.total, SWAP.used, SWAP.free], human),
  ];
  return { lines, err:[] };
}
