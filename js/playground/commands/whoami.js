import { outLine } from './_util.js';
import { USER } from '../constants.js';

export default function whoami(){
  return { lines:[ outLine(USER) ], err:[] };
}
