import { outLine, errLine, LINE } from './_util.js';
import { MAN_PAGES } from '../manPages.js';

export default function man(ctx){
  const name = ctx.args[0];
  if(!name) return { lines:[], err:[ errLine("What manual page do you want?") ] };
  const page = MAN_PAGES[name];
  if(!page) return { lines:[], err:[ errLine(`No manual entry for ${name}`) ] };
  const lines = [
    LINE("NAME", "pg-man-head"),
    outLine(`    ${name}`),
    outLine(""),
    LINE("SYNOPSIS", "pg-man-head"),
    outLine(`    ${page.synopsis}`),
    outLine(""),
    LINE("DESCRIPTION", "pg-man-head"),
    outLine(`    ${page.desc}`),
  ];
  if(page.options && page.options.length){
    lines.push(outLine(""), LINE("OPTIONS", "pg-man-head"));
    page.options.forEach(([flag, desc]) => {
      lines.push(outLine(`    ${flag}`));
      lines.push(outLine(`        ${desc}`));
    });
  }
  return { lines, err:[] };
}
