import { outLine } from './_util.js';
import { USER } from '../constants.js';

export default function whoami(ctx){
  const username = (ctx && ctx.session) ? ctx.session.current().username : USER;
  return { lines:[ outLine(username) ], err:[] };
}
