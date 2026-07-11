import { parseFlags, outLine } from './_util.js';
import { HOSTNAME, KERNEL } from '../constants.js';

export default function uname(ctx){
  const { flags } = parseFlags(ctx.args);
  if(flags.has("a")){
    return { lines:[ outLine(`Linux ${HOSTNAME} ${KERNEL} #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux`) ], err:[] };
  }
  if(flags.has("r")) return { lines:[ outLine(KERNEL) ], err:[] };
  if(flags.has("n")) return { lines:[ outLine(HOSTNAME) ], err:[] };
  if(flags.has("m")) return { lines:[ outLine("x86_64") ], err:[] };
  return { lines:[ outLine("Linux") ], err:[] };
}
