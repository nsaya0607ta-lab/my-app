import { outLine, errLine, PATH_COMMANDS, binPathFor } from './_util.js';

export default function which(ctx){
  if(!ctx.args.length) return { lines:[], err:[] };
  const lines = [];
  const err = [];
  ctx.args.forEach(cmd => {
    const bin = PATH_COMMANDS.includes(cmd) ? binPathFor(cmd) : null;
    if(bin) lines.push(outLine(`${bin}/${cmd}`));
    else err.push(errLine(`which: no ${cmd} in (/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin)`));
  });
  return { lines, err };
}
