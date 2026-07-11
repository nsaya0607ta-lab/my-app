import { outLine } from './_util.js';

export default function echo(ctx){
  const args = ctx.args.slice();
  if(args.length && /^-[neE]+$/.test(args[0])) args.shift();
  return { lines:[ outLine(args.join(" ")) ], err:[] };
}
