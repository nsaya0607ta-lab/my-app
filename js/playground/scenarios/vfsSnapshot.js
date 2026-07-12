/* =========================================================================
   VFS/ShellStateのスナップショット化 — シナリオモードの進捗保存
   （localStorage・Firestore）のために、現在のLinux環境をJSON化可能な
   プレーンオブジェクトへ変換／復元する。vfs.js・shellState.js自体は
   変更せず、公開プロパティ（root/cwd/env/cronJobs/processes）だけを見て
   組み立てるので、既存のミッションモード側には一切影響しない。
   ========================================================================= */

function serializeNode(node){
  const base = { type: node.type, mode: node.mode, owner: node.owner, group: node.group, mtime: node.mtime.toISOString() };
  if(node.type === "dir"){
    base.children = {};
    Object.keys(node.children).forEach(k => { base.children[k] = serializeNode(node.children[k]); });
  } else if(node.type === "file"){
    base.content = node.content;
  } else if(node.type === "link"){
    base.target = node.target.slice();
  }
  return base;
}

function deserializeNode(data){
  const base = { type: data.type, mode: data.mode, owner: data.owner, group: data.group, mtime: data.mtime ? new Date(data.mtime) : new Date() };
  if(data.type === "dir"){
    base.children = {};
    Object.keys(data.children || {}).forEach(k => { base.children[k] = deserializeNode(data.children[k]); });
  } else if(data.type === "file"){
    base.content = data.content || "";
  } else if(data.type === "link"){
    base.target = Array.isArray(data.target) ? data.target.slice() : [];
  }
  return base;
}

export function serializeSession(vfs, shellState){
  return {
    vfs: { root: serializeNode(vfs.root), cwd: vfs.cwd.slice() },
    shell: {
      env: Object.fromEntries(shellState.env.entries()),
      cronJobs: JSON.parse(JSON.stringify(shellState.cronJobs || [])),
      processes: JSON.parse(JSON.stringify(shellState.processes || [])),
    },
  };
}

export function restoreSession(vfs, shellState, snapshot){
  if(!snapshot || typeof snapshot !== "object") return false;
  try{
    if(snapshot.vfs && snapshot.vfs.root && snapshot.vfs.root.type === "dir"){
      vfs.root = deserializeNode(snapshot.vfs.root);
      vfs.cwd = Array.isArray(snapshot.vfs.cwd) ? snapshot.vfs.cwd.slice() : vfs.cwd;
    }
    if(snapshot.shell){
      if(snapshot.shell.env && typeof snapshot.shell.env === "object") shellState.env = new Map(Object.entries(snapshot.shell.env));
      if(Array.isArray(snapshot.shell.cronJobs)) shellState.cronJobs = snapshot.shell.cronJobs;
      if(Array.isArray(snapshot.shell.processes) && snapshot.shell.processes.length) shellState.processes = snapshot.shell.processes;
    }
    return true;
  }catch(e){ return false; }
}
