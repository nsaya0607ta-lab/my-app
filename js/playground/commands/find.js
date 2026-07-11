import { errLine, outLine } from './_util.js';

function globToRegExp(glob, ci){
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, ci ? "i" : "");
}

export default function find(ctx){
  const args = ctx.args.slice();
  let path = ".";
  if(args.length && !args[0].startsWith("-")) path = args.shift();

  let namePattern = null;
  let type = null;
  for(let i = 0; i < args.length; i++){
    if(args[i] === "-name"){ namePattern = { pat: args[++i], ci:false }; }
    else if(args[i] === "-iname"){ namePattern = { pat: args[++i], ci:true }; }
    else if(args[i] === "-type"){ type = args[++i]; }
  }

  const res = ctx.vfs.findAll(path);
  if(res.error) return { lines:[], err:[ errLine(`find: '${path}': No such file or directory`) ] };
  const startSegs = ctx.vfs.resolvePath(path);

  let results = res.results;
  if(namePattern){
    const re = globToRegExp(namePattern.pat, namePattern.ci);
    results = results.filter(r => re.test(r.segs[r.segs.length-1] ?? ""));
  }
  if(type){
    const want = type === "f" ? "file" : type === "d" ? "dir" : type === "l" ? "link" : null;
    results = results.filter(r => r.node.type === want);
  }

  const relative = path === ".";
  const displayPath = (r) => {
    if(!relative) return r.path;
    const rel = r.segs.slice(startSegs.length).join("/");
    return rel ? `./${rel}` : ".";
  };

  return { lines: results.map(r => outLine(displayPath(r))), err:[] };
}
