/* =========================================================================
   UserSession — Linux プレイグラウンドの「現在ログイン中のユーザー」と
   「ユーザー一覧」（/etc/passwd 相当）を保持する。

   su で他ユーザーへスタックを積み（su → su → ... と何段でも重ねられる）、
   exit で1段ずつ元のユーザーへ戻す（実際のLinuxのログインシェルと同様）。

   ユーザー情報はオブジェクトで管理しており、今後 useradd / passwd / groups /
   sudo などのコマンドを追加する際は、このMap（users）とUserSessionクラスに
   メソッドを足すだけで拡張できる（例: useradd → this.users.set(...)、
   passwd → 対象ユーザーの password フィールドを書き換える、など）。
   ========================================================================= */
import { USER, GROUP, UID, GID } from './constants.js';

function defaultUsers(){
  return new Map([
    [USER, { username: USER, password: USER, home: `/home/${USER}`, uid: UID, gid: GID, group: GROUP, shell: "/bin/bash", isRoot: false }],
    ["root", { username: "root", password: "root", home: "/root", uid: 0, gid: 0, group: "root", shell: "/bin/bash", isRoot: true }],
  ]);
}

// 今はただの文字列比較だが、将来ハッシュ化パスワードなどへ差し替えやすい
// よう、呼び出し側からは verifyPassword() 経由でのみ照合させる。
export function verifyPassword(user, password){
  return !!user && user.password === password;
}

export class UserSession {
  constructor(){ this.reset(); }

  reset(){
    this.users = defaultUsers();
    this.stack = [USER]; // 末尾が現在有効なユーザー。suでpush、exitでpopする
    // 一度でもrootへ切り替えたことがあるか（exitで戻った後も保持する）。
    // シナリオモードで「rootに切り替えて作業した」を判定するのに使う。
    this.everRoot = false;
  }

  current(){ return this.users.get(this.stack[this.stack.length - 1]); }
  isRoot(){ return !!this.current().isRoot; }
  find(username){ return this.users.get(username) || null; }

  switchTo(username){
    if(!this.users.has(username)) return false;
    this.stack.push(username);
    if(this.current().isRoot) this.everRoot = true;
    return true;
  }

  // stack.length === 1 は「最初にログインしたユーザー」で、これ以上は戻れない
  canExit(){ return this.stack.length > 1; }
  exit(){
    if(!this.canExit()) return false;
    this.stack.pop();
    return true;
  }

  toJSON(){ return { stack: this.stack.slice(), everRoot: this.everRoot }; }
  loadFromJSON(data){
    if(!data || !Array.isArray(data.stack)) return;
    const valid = data.stack.filter(name => this.users.has(name));
    this.stack = valid.length ? valid : [USER];
    this.everRoot = !!data.everRoot;
  }
}

// su/exit でユーザーが切り替わった際、VFSのパーミッション判定基準（誰が
// 「所有者」か）とシェルの環境変数（USER/LOGNAME/HOME/SHELL）を新しい
// ユーザーに合わせて更新する共通処理。cwd（作業ディレクトリ）はここでは
// 一切変更しない＝実際のLinuxで `su`（`su -` ではない）を実行した時と同様、
// 作業ディレクトリは維持される。
export function applyUserEnv(vfs, state, user){
  vfs.setCurrentUser(user);
  state.env.set("USER", user.username);
  state.env.set("LOGNAME", user.username);
  state.env.set("HOME", user.home);
  state.env.set("SHELL", user.shell);
}
