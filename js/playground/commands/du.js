import { parseFlags, humanSize, outLine, errLine } from './_util.js';

// シェルが通常行う * の展開を、学習用ターミナルではdu側で最小限再現する。
// 対象は「*」と「ディレクトリ/*」のみ。隠しファイルは通常のシェルと同様に除外する。
function expandTargets(vfs, rawTargets){
  const expanded = [];
  rawTargets.forEach(target => {
    if(target !== "*" && !target.endsWith("/*")){
      expanded.push(target);
      return;
    }

    const base = target === "*" ? "." : (target.slice(0, -2) || "/");
    const segs = vfs.resolvePath(base);
    const node = vfs.getNode(segs);
    if(!node || node.type !== "dir"){
      expanded.push(target);
      return;
    }

    const names = Object.keys(node.children).filter(name => !name.startsWith(".")).sort();
    if(!names.length){
      expanded.push(target);
      return;
    }

    names.forEach(name => {
      if(target === "*") expanded.push(name);
      else expanded.push(`${base.replace(/\/$/, "")}/${name}`);
    });
  });
  return expanded;
}

export default function du(ctx){
  const { flags, operands } = parseFlags(ctx.args);
  const human = flags.has("h");
  const all = flags.has("a");
  const summarize = flags.has("s");
  const showTotal = flags.has("c");
  const targets = expandTargets(ctx.vfs, operands.length ? operands : ["."]);
  const fmt = (bytes) => human ? humanSize(bytes) : String(Math.max(1, Math.ceil(bytes / 1024)));

  const collect = (node, path, acc) => {
    if(node.type === "file"){ if(all) acc.push({ path, size: node.content.length }); return node.content.length; }
    if(node.type === "link") return 0;
    let total = 0;
    Object.keys(node.children).sort().forEach(name => {
      const childPath = path === "." ? name : `${path}/${name}`;
      total += collect(node.children[name], childPath, acc);
    });
    acc.push({ path, size: total });
    return total;
  };

  const lines = [];
  const err = [];
  let grandTotal = 0;
  targets.forEach(target => {
    const segs = ctx.vfs.resolvePath(target);
    const node = ctx.vfs.getNode(segs);
    if(!node){ err.push(errLine(`du: cannot access '${target}': No such file or directory`)); return; }
    const acc = [];
    const total = collect(node, target, acc);
    grandTotal += total;
    if(summarize) lines.push(outLine(`${fmt(total)}\t${target}`));
    else acc.forEach(e => lines.push(outLine(`${fmt(e.size)}\t${e.path}`)));
  });
  if(showTotal) lines.push(outLine(`${fmt(grandTotal)}\ttotal`));
  return { lines, err };
}
