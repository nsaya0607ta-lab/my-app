import { outLine, pad, padStart } from './_util.js';

export default function lsmod(ctx){
  const lines = [ outLine(`${pad("Module", 22)}${padStart("Size", 8)}  Used by`) ];
  [...ctx.state.kernelModules.entries()].forEach(([name, info]) => {
    lines.push(outLine(`${pad(name, 22)}${padStart(info.size, 8)}  ${info.usedBy}`));
  });
  return { lines, err: [] };
}
