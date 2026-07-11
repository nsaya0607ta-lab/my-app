import { outLine } from './_util.js';
import { HOSTNAME } from '../constants.js';

export default function hostname(){
  return { lines:[ outLine(HOSTNAME) ], err:[] };
}
