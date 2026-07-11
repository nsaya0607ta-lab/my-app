import { outLine, PATH_COMMANDS, binPathFor } from './_util.js';

export default function whereis(ctx){
  if(!ctx.args.length) return { lines:[], err:[] };
  const lines = ctx.args.map(cmd => {
    const bin = PATH_COMMANDS.includes(cmd) ? binPathFor(cmd) : null;
    const parts = [`${cmd}:`];
    if(bin){
      parts.push(`${bin}/${cmd}`);
      parts.push(`/usr/share/man/man1/${cmd}.1.gz`);
    }
    return outLine(parts.join(" "));
  });
  return { lines, err:[] };
}
