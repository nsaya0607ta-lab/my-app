import { outLine } from './_util.js';

export default function env(ctx){
  const lines = [...ctx.state.env.entries()].map(([k, v]) => outLine(`${k}=${v}`));
  return { lines, err:[] };
}
