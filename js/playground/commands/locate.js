import { errLine, outLine } from './_util.js';

export default function locate(ctx){
  const pattern = ctx.args[0];
  if(!pattern) return { lines:[], err:[ errLine("locate: no pattern to search for specified") ] };
  const res = ctx.vfs.findAll("/");
  const matches = res.results.filter(r => r.path.includes(pattern) && r.path !== "/");
  return { lines: matches.map(r => outLine(r.path)), err:[] };
}
