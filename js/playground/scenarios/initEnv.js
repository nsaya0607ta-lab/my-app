/* =========================================================================
   applyInitialEnv — シナリオ開始時のLinux環境を、宣言的な spec から組み立てる。
   シナリオ定義ファイル（scenarios/data/*.js）の initialEnv フィールドを
   そのまま渡すだけで、追加のディレクトリ／ファイル／権限／環境変数／
   疑似プロセスをVFS・ShellStateへ反映できる。
   ========================================================================= */
export function applyInitialEnv(vfs, shellState, spec){
  if(!spec) return;
  (spec.dirs || []).forEach(path => { vfs.makeDir(path, { parents: true }); });
  (spec.files || []).forEach(f => {
    vfs.writeFile(f.path, f.content || "");
    if(f.mode) vfs.chmod(f.path, f.mode);
  });
  (spec.symlinks || []).forEach(s => { vfs.link(s.target, s.path, { symbolic: true }); });
  (spec.chmod || []).forEach(c => { vfs.chmod(c.path, c.mode, { recursive: !!c.recursive }); });
  (spec.env || []).forEach(e => { shellState.env.set(e.name, e.value); });
  (spec.processes || []).forEach(p => { shellState.processes.push(p); });
  if(spec.cwd) vfs.changeDir(spec.cwd);
}
