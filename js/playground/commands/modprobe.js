import { errLine } from './_util.js';
import { MODULE_CATALOG } from '../moduleCatalog.js';

export default function modprobe(ctx){
  const name = ctx.args.find(a => !a.startsWith("-"));
  if(!name) return { lines: [], err: [ errLine("modprobe: missing module name") ] };
  const mod = MODULE_CATALOG[name];
  if(!mod){
    return { lines: [], err: [ errLine(`modprobe: FATAL: Module ${name} not found in directory /lib/modules/6.8.0-generic`) ] };
  }
  ctx.state.loadModule(name, mod);
  return { lines: [], err: [] };
}
