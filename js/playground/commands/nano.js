import { errLine, fsError } from './_util.js';

export default function nano(ctx){
  const path = ctx.args[0];
  if(!path) return { lines:[], err:[ errLine("usage: nano FILE") ] };
  const segs = ctx.vfs.resolvePath(path);
  const node = ctx.vfs.getNode(segs);
  if(node && node.type === "dir") return { lines:[], err:[ fsError("nano", null, { error:"EISDIR", path }) ] };
  if(node && !ctx.vfs.can(node, "r")) return { lines:[], err:[ fsError("nano", null, { error:"EACCES", path }) ] };
  return { lines:[], err:[], overlay:{ type:"nano", path, content: node ? node.content : "" } };
}
