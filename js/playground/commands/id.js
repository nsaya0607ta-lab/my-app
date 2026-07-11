import { outLine } from './_util.js';
import { USER, GROUP, UID, GID } from '../constants.js';

export default function id(){
  return { lines:[ outLine(`uid=${UID}(${USER}) gid=${GID}(${GROUP}) groups=${GID}(${GROUP}),27(sudo)`) ], err:[] };
}
