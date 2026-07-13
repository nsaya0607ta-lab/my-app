import { outLine, errLine, pad } from './_util.js';
import { MODULE_CATALOG } from '../moduleCatalog.js';

function field(lines, label, value){
  lines.push(outLine(`${pad(label + ":", 14)}${value}`));
}

export default function modinfo(ctx){
  const name = ctx.args.find(a => !a.startsWith("-"));
  if(!name) return { lines: [], err: [ errLine("modinfo: missing module name") ] };
  const mod = MODULE_CATALOG[name];
  if(!mod) return { lines: [], err: [ errLine(`modinfo: ERROR: Module ${name} not found.`) ] };
  const lines = [];
  field(lines, "filename", mod.filename);
  field(lines, "description", mod.description);
  field(lines, "author", mod.author);
  field(lines, "license", mod.license);
  field(lines, "depends", mod.depends);
  field(lines, "vermagic", mod.vermagic);
  return { lines, err: [] };
}
