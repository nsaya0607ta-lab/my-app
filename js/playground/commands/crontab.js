import { parseFlags, outLine, errLine } from './_util.js';
import { parseCrontabText, formatCrontabText } from '../cronUtil.js';
import { USER } from '../constants.js';

// crontab -l : 一覧表示 / -e : 疑似エディタで編集 / -r : 全削除
// crontab FILE : ファイルの内容をそのままcrontabとしてインストール
// ... | crontab -  : パイプで受け取った標準入力をインストール
export default function crontab(ctx){
  const { flags, operands } = parseFlags(ctx.args);

  if(flags.has("r")){
    ctx.state.cronJobs = [];
    return { lines:[], err:[] };
  }

  if(flags.has("l")){
    if(!ctx.state.cronJobs.length) return { lines:[], err:[ errLine(`crontab: no crontab for ${USER}`) ] };
    const body = formatCrontabText(ctx.state.cronJobs).replace(/\n$/, "");
    return { lines: body.split("\n").map(outLine), err:[] };
  }

  if(flags.has("e")){
    return { lines:[], err:[], overlay:{ type:"crontab", content: formatCrontabText(ctx.state.cronJobs) } };
  }

  let text = null;
  if(operands.length && operands[0] !== "-"){
    const res = ctx.vfs.readFile(operands[0]);
    if(res.error) return { lines:[], err:[ errLine(`crontab: ${operands[0]}: No such file or directory`) ] };
    text = res.content;
  } else if(ctx.stdin !== null && ctx.stdin !== undefined && ctx.stdin !== ""){
    text = ctx.stdin;
  }

  if(text === null) return { lines:[], err:[ errLine("usage: crontab [-l | -e | -r | FILE]") ] };

  const { jobs, errors } = parseCrontabText(text);
  ctx.state.cronJobs = jobs;
  const err = errors.map(raw => errLine(`crontab: ignoring invalid line: "${raw}"`));
  return { lines:[], err };
}
