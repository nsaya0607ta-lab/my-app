import { outLine } from './_util.js';

export default function pwd(ctx){
  return { lines:[outLine(ctx.vfs.pwd())], err:[] };
}
