import { outLine, padStart } from './_util.js';

export default function history(ctx){
  const items = ctx.history || [];
  const lines = items.map((cmd, i) => outLine(`${padStart(i+1, 5)}  ${cmd}`));
  return { lines, err:[] };
}
