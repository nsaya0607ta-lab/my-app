import { outLine } from './_util.js';
import { USER, GROUP, UID, GID } from '../constants.js';

export default function id(ctx){
  const u = (ctx && ctx.session) ? ctx.session.current() : { username: USER, group: GROUP, uid: UID, gid: GID, isRoot: false };
  const groups = u.isRoot ? `${u.gid}(${u.group})` : `${u.gid}(${u.group}),27(sudo)`;
  return { lines:[ outLine(`uid=${u.uid}(${u.username}) gid=${u.gid}(${u.group}) groups=${groups}`) ], err:[] };
}
