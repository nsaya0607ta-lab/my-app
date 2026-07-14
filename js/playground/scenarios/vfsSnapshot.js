/* =========================================================================
   VFS/ShellStateのスナップショット化 — シナリオモードの進捗保存
   （localStorage・Firestore）のために、現在のLinux環境をJSON化可能な
   プレーンオブジェクトへ変換／復元する。vfs.js・shellState.js自体は
   変更せず、公開プロパティ（root/cwd/env/cronJobs/processes）だけを見て
   組み立てるので、既存のミッションモード側には一切影響しない。
   ========================================================================= */

function serializeNode(node){
  const base = { type: node.type, mode: node.mode, owner: node.owner, group: node.group, mtime: node.mtime.toISOString() };
  if(node.type === 'dir'){
    base.children = {};
    Object.keys(node.children).forEach(k => { base.children[k] = serializeNode(node.children[k]); });
  } else if(node.type === 'file'){
    base.content = node.content;
  } else if(node.type === 'link'){
    base.target = node.target.slice();
  }
  return base;
}

function deserializeNode(data){
  const base = { type: data.type, mode: data.mode, owner: data.owner, group: data.group, mtime: data.mtime ? new Date(data.mtime) : new Date() };
  if(data.type === 'dir'){
    base.children = {};
    Object.keys(data.children || {}).forEach(k => { base.children[k] = deserializeNode(data.children[k]); });
  } else if(data.type === 'file'){
    base.content = data.content || '';
  } else if(data.type === 'link'){
    base.target = Array.isArray(data.target) ? data.target.slice() : [];
  }
  return base;
}

export function serializeSession(vfs, shellState, userSession){
  return {
    vfs: { root: serializeNode(vfs.root), cwd: vfs.cwd.slice(), strictChown: !!vfs.strictChown },
    shell: {
      env: Object.fromEntries(shellState.env.entries()),
      cronJobs: JSON.parse(JSON.stringify(shellState.cronJobs || [])),
      processes: JSON.parse(JSON.stringify(shellState.processes || [])),
      jobs: JSON.parse(JSON.stringify(shellState.jobs || [])),
      kernelModules: Array.from((shellState.kernelModules || new Map()).entries()),
      disks: Array.from((shellState.disks || new Map()).entries()).map(([name, d]) => [name, { ...d, partitions: d.partitions.map(p => ({ ...p })) }]),
      mounts: JSON.parse(JSON.stringify(shellState.mounts || [])),
      swapFiles: Array.from((shellState.swapFiles || new Map()).entries()).map(([path, s]) => [path, { ...s }]),
      nextJobId: shellState.nextJobId,
      nextPid: shellState.nextPid,
    },
    session: userSession ? { stack: userSession.stack.slice(), everRoot: !!userSession.everRoot } : null,
  };
}

export function restoreSession(vfs, shellState, snapshot, userSession){
  if(!snapshot || typeof snapshot !== 'object') return false;
  try{
    if(snapshot.vfs && snapshot.vfs.root && snapshot.vfs.root.type === 'dir'){
      vfs.root = deserializeNode(snapshot.vfs.root);
      vfs.cwd = Array.isArray(snapshot.vfs.cwd) ? snapshot.vfs.cwd.slice() : vfs.cwd;
      vfs.strictChown = !!snapshot.vfs.strictChown;
    }
    if(snapshot.shell){
      if(snapshot.shell.env && typeof snapshot.shell.env === 'object') shellState.env = new Map(Object.entries(snapshot.shell.env));
      if(Array.isArray(snapshot.shell.cronJobs)) shellState.cronJobs = snapshot.shell.cronJobs;
      if(Array.isArray(snapshot.shell.processes) && snapshot.shell.processes.length) shellState.processes = snapshot.shell.processes;
      if(Array.isArray(snapshot.shell.jobs)) shellState.jobs = snapshot.shell.jobs;
      if(Array.isArray(snapshot.shell.kernelModules)) shellState.kernelModules = new Map(snapshot.shell.kernelModules);
      if(Array.isArray(snapshot.shell.disks)) shellState.disks = new Map(snapshot.shell.disks.map(([name, d]) => [name, { ...d, partitions: (d.partitions || []).map(p => ({ ...p })) }]));
      if(Array.isArray(snapshot.shell.mounts)) shellState.mounts = snapshot.shell.mounts;
      if(Array.isArray(snapshot.shell.swapFiles)) shellState.swapFiles = new Map(snapshot.shell.swapFiles.map(([path, s]) => [path, { ...s }]));
      if(typeof snapshot.shell.nextJobId === 'number') shellState.nextJobId = snapshot.shell.nextJobId;
      if(typeof snapshot.shell.nextPid === 'number') shellState.nextPid = snapshot.shell.nextPid;
    }
    if(userSession && snapshot.session && Array.isArray(snapshot.session.stack)){
      const valid = snapshot.session.stack.filter(name => userSession.users.has(name));
      userSession.stack = valid.length ? valid : userSession.stack;
      userSession.everRoot = !!snapshot.session.everRoot;
      vfs.setCurrentUser(userSession.current());
    }
    return true;
  }catch(e){ return false; }
}
