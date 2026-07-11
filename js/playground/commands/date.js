import { outLine, padStart, MONTH_ABBR, WEEK_ABBR } from './_util.js';

export default function date(){
  const d = new Date();
  const hh = padStart(d.getHours(), 2), mm = padStart(d.getMinutes(), 2), ss = padStart(d.getSeconds(), 2);
  const text = `${WEEK_ABBR[d.getDay()]} ${MONTH_ABBR[d.getMonth()]} ${padStart(d.getDate(),2)} ${hh}:${mm}:${ss} JST ${d.getFullYear()}`;
  return { lines:[ outLine(text) ], err:[] };
}
