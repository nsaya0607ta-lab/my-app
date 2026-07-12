import { parseFlags, fsError, humanSize, pad, padStart, formatMtime, LINE } from './_util.js';

function typeChar(type){ return type === "dir" ? "d" : type === "link" ? "l" : "-"; }
function nameCls(entry){
  if(entry.type === "dir") return "pg-tok-dir";
  if(entry.type === "link") return "pg-tok-link";
  return "pg-tok-file";
}

function renderList(entries, opts, out){
  entries.forEach(entry => {
    if(!opts.long){
      out.push(LINE(entry.name, nameCls(entry)));
      return;
    }
    const links = entry.type === "dir" ? 2 : 1;
    const size = opts.human ? humanSize(entry.size) : String(entry.size);
    const prefix = `${typeChar(entry.type)}${entry.mode}  ${links} ${pad(entry.owner,7)} ${pad(entry.group,7)} ${padStart(size, opts.human?5:6)} ${formatMtime(entry.mtime)} `;
    const nameToken = { text: entry.name, cls: nameCls(entry) };
    const suffixToken = entry.type === "link" ? { text: ` -> ${entry.linkTarget}` } : null;
    out.push(suffixToken ? [{ text: prefix }, nameToken, suffixToken] : [{ text: prefix }, nameToken]);
  });
}

export default function ls(ctx){
  const { flags, operands } = parseFlags(ctx.args);
  const opts = { all: flags.has("a"), long: flags.has("l"), human: flags.has("h") };
  const targets = operands.length ? operands : ["."];
  const lines = [];
  const err = [];

  targets.forEach((target, idx) => {
    const res = ctx.vfs.list(target);
    if(res.error){
      const verb = res.error.error === "EACCES" ? "cannot open directory" : "cannot access";
      err.push(fsError("ls", verb, res.error));
      return;
    }
    if(targets.length > 1){
      if(idx > 0) lines.push(LINE(""));
      lines.push(LINE(`${target}:`));
    }
    let entries = res.entries;
    if(entries.length === 1 && entries[0].name === target){
      // ls した対象がファイル1つだった場合（実際のLinuxと同様、total行は出さない）
    } else {
      entries = opts.all ? entries : entries.filter(e => !e.name.startsWith("."));
      if(opts.all){
        entries = [
          { name:".", type:"dir", mode: res.dirMode || "rwxr-xr-x", owner:"student", group:"student", size:4096, mtime:new Date() },
          { name:"..", type:"dir", mode:"rwxr-xr-x", owner:"student", group:"student", size:4096, mtime:new Date() },
          ...entries,
        ];
      }
      if(opts.long) lines.push(LINE(`total ${entries.length}`));
    }
    renderList(entries, opts, lines);
  });

  return { lines, err };
}
