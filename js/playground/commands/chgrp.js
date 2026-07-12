import { parseFlags, fsError, errLine } from './_util.js';

// chgrp GROUP FILE...（所属グループだけを変更する。実体はchownと同じVFS
// メソッドを「所有者は変えず、グループだけ渡す」形で呼び出すだけ）
export default function chgrp(ctx){
  const { flags, operands } = parseFlags(ctx.args);
  if(operands.length < 2) return { lines:[], err:[ errLine("chgrp: missing operand") ] };
  const [group, ...paths] = operands;
  const err = [];
  paths.forEach(path => {
    const res = ctx.vfs.chown(path, `:${group}`, { recursive: flags.has("R") });
    if(res.error) err.push(fsError("chgrp", "cannot access", res.error));
  });
  return { lines:[], err };
}
