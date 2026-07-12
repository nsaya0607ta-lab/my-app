/* =========================================================================
   applyInitialEnv — シナリオ開始時のLinux環境を、宣言的な spec から組み立てる。
   シナリオ定義ファイル（scenarios/data/*.js）の initialEnv フィールドを
   そのまま渡すだけで、追加のディレクトリ／ファイル／権限／環境変数／
   疑似プロセスをVFS・ShellStateへ反映できる。
   ========================================================================= */
export function applyInitialEnv(vfs, shellState, spec){
  if(!spec) return;
  // シナリオの初期状態を組み立てる操作は「現実の操作」ではなく舞台設定なので、
  // 対象パスの権限（例: /root配下はroot以外書き込み不可）に関わらず必ず成功
  // させたい。一時的にroot相当の判定にして、最後に元の状態へ戻す。
  const wasRootUser = vfs.isRootUser;
  vfs.isRootUser = true;
  (spec.dirs || []).forEach(path => { vfs.makeDir(path, { parents: true }); });
  (spec.files || []).forEach(f => {
    vfs.writeFile(f.path, f.content || "");
    if(f.mode) vfs.chmod(f.path, f.mode);
    if(f.owner || f.group) vfs.chown(f.path, `${f.owner || ""}:${f.group || ""}`);
  });
  (spec.symlinks || []).forEach(s => { vfs.link(s.target, s.path, { symbolic: true }); });
  (spec.chmod || []).forEach(c => { vfs.chmod(c.path, c.mode, { recursive: !!c.recursive }); });
  (spec.env || []).forEach(e => { shellState.env.set(e.name, e.value); });
  (spec.processes || []).forEach(p => { shellState.processes.push(p); });
  if(spec.cwd) vfs.changeDir(spec.cwd);
  vfs.isRootUser = wasRootUser;
  // strictChownは「所有者の変更にroot権限が必要」という実際のLinuxの挙動を
  // 再現するかどうかのスイッチ（権限管理編のroot必須シナリオでのみtrueにする）。
  // 上のisRootUser一時解除より後で反映することで、strictChown自体の判定にも
  // 影響しない。
  if(spec.strictChown) vfs.strictChown = true;
}
