/* =========================================================================
   VirtualFileSystem — Linuxプレイグラウンド用の仮想ファイルシステム
   実OSには一切アクセスせず、メモリ上のツリー構造だけで pwd/ls/cd/mkdir/
   touch/cat/echo/cp/mv/rm/ln/chmod/chown/find/du などの状態変化を再現する。

   ノードは以下のいずれか：
     { type:"dir",  children:{name:Node}, mode, owner, group, mtime }
     { type:"file", content:string,       mode, owner, group, mtime }
     { type:"link", target:string[](絶対セグメント), mode, owner, group, mtime }

   パーミッションは常に3クラス9文字（例:"rwxr-xr-x"）で保持する。
   実際の権限判定は「ファイルの owner が現在のユーザー(student)と一致するか」
   で owner/group/other のどのビット集合を見るかを決める（chownで所有者を
   変えると、それ以降は group/other 側の権限で判定されるようになる）。
   ========================================================================= */
import { USER, GROUP } from './constants.js';

const HOME_PATH = ["home", "student"];
const DEFAULT_HOME_DIRS = ["Desktop", "Documents", "Downloads", "Pictures", "Videos"];
const ROOT_DEFAULT_DIRS = ["bin", "etc", "home", "root", "tmp", "usr", "var"];

const MODE_DIR = "rwxr-xr-x";
const MODE_FILE = "rw-r--r--";
const MODE_LINK = "rwxrwxrwx";

function now(){ return new Date(); }

function makeDir(owner=USER, group=GROUP, mode=MODE_DIR){
  return { type:"dir", children:{}, mode, owner, group, mtime: now() };
}
function makeFile(content="", owner=USER, group=GROUP, mode=MODE_FILE){
  return { type:"file", content, mode, owner, group, mtime: now() };
}
function makeLink(target, owner=USER, group=GROUP){
  return { type:"link", target, mode: MODE_LINK, owner, group, mtime: now() };
}

function buildInitialRoot(){
  const root = makeDir("root", "root");
  ROOT_DEFAULT_DIRS.forEach(name => { root.children[name] = makeDir(name === "root" ? "root" : USER); });
  // /root は実際のLinuxと同様 root専用（700）にし、一般ユーザーからは
  // cd/lsできないようにする（「root専用ディレクトリ」の最小の例）
  root.children.root = makeDir("root", "root", "rwx------");
  root.children.etc.children.hostname = makeFile("linux-playground\n", "root", "root");
  root.children.etc.children.passwd = makeFile("root:x:0:0:root:/root:/bin/bash\nstudent:x:1000:1000:student:/home/student:/bin/bash\n", "root", "root");

  const home = makeDir();
  DEFAULT_HOME_DIRS.forEach(name => { home.children[name] = makeDir(); });
  home.children["memo.txt"] = makeFile("Linux プレイグラウンドへようこそ。\n");
  root.children.home = makeDir("root", "root");
  root.children.home.children.student = home;
  return root;
}

// 9文字のrwx文字列をパーミッションビット（chmod用の数値0-7を3つ）に変換
function rwxToOctalDigit(rwx){
  return (rwx[0] !== "-" ? 4 : 0) + (rwx[1] !== "-" ? 2 : 0) + (rwx[2] !== "-" ? 1 : 0);
}
function octalDigitToRwx(d){
  return (d & 4 ? "r" : "-") + (d & 2 ? "w" : "-") + (d & 1 ? "x" : "-");
}

// chmod の引数（8進 or シンボリック）を現在のmodeへ適用し、新しいmode文字列を返す。
// 失敗時は null。
export function applyChmodSpec(currentMode, spec){
  if(/^[0-7]{3,4}$/.test(spec)){
    const digits = spec.length === 4 ? spec.slice(1) : spec;
    return digits.split("").map(octalDigitToRwx).join("");
  }
  const clauses = spec.split(",");
  let owner = rwxToOctalDigit(currentMode.slice(0,3));
  let group = rwxToOctalDigit(currentMode.slice(3,6));
  let other = rwxToOctalDigit(currentMode.slice(6,9));
  for(const clause of clauses){
    const m = /^([ugoa]*)([+\-=])([rwx]*)$/.exec(clause.trim());
    if(!m) return null;
    let who = m[1] || "a";
    if(who === "a") who = "ugo";
    const op = m[2];
    let bits = 0;
    if(m[3].includes("r")) bits |= 4;
    if(m[3].includes("w")) bits |= 2;
    if(m[3].includes("x")) bits |= 1;
    for(const w of who){
      const apply = (cur) => {
        if(op === "+") return cur | bits;
        if(op === "-") return cur & ~bits;
        return bits; // "="
      };
      if(w === "u") owner = apply(owner);
      else if(w === "g") group = apply(group);
      else if(w === "o") other = apply(other);
    }
  }
  return octalDigitToRwx(owner) + octalDigitToRwx(group) + octalDigitToRwx(other);
}

// --- Firestore保存用のシリアライズ / 復元 -----------------------------------
// mtimeはDateのままだとFirestoreに保存できない（プレーンなオブジェクトへ変換
// する際にメソッドが失われる）ため、エポックミリ秒の数値に変換して往復させる。
function serializeNode(node){
  if(node.type === "dir"){
    const children = {};
    Object.keys(node.children).forEach(k => { children[k] = serializeNode(node.children[k]); });
    return { type:"dir", children, mode:node.mode, owner:node.owner, group:node.group, mtime:+node.mtime };
  }
  if(node.type === "file"){
    return { type:"file", content:node.content, mode:node.mode, owner:node.owner, group:node.group, mtime:+node.mtime };
  }
  return { type:"link", target:node.target.slice(), mode:node.mode, owner:node.owner, group:node.group, mtime:+node.mtime };
}

function deserializeNode(obj){
  if(!obj || typeof obj !== "object") return null;
  const mtime = new Date(typeof obj.mtime === "number" ? obj.mtime : Date.now());
  if(obj.type === "dir"){
    const children = {};
    Object.keys(obj.children || {}).forEach(k => {
      const child = deserializeNode(obj.children[k]);
      if(child) children[k] = child;
    });
    return { type:"dir", children, mode: obj.mode || MODE_DIR, owner: obj.owner || USER, group: obj.group || GROUP, mtime };
  }
  if(obj.type === "file"){
    return { type:"file", content: typeof obj.content === "string" ? obj.content : "", mode: obj.mode || MODE_FILE, owner: obj.owner || USER, group: obj.group || GROUP, mtime };
  }
  if(obj.type === "link"){
    return { type:"link", target: Array.isArray(obj.target) ? obj.target.slice() : [], mode: obj.mode || MODE_LINK, owner: obj.owner || USER, group: obj.group || GROUP, mtime };
  }
  return null;
}

// 9文字のrwx文字列を3桁の8進数文字列（例:"755"）へ変換する（ミッションの
// 権限判定など、chmodの指定方法によらず最終的なモードだけを比べたい場合に使う）
export function modeToOctal(mode){
  return String(rwxToOctalDigit(mode.slice(0,3))) + rwxToOctalDigit(mode.slice(3,6)) + rwxToOctalDigit(mode.slice(6,9));
}

export class VirtualFileSystem {
  constructor(){ this.reset(); }

  reset(){
    this.root = buildInitialRoot();
    this.currentUser = USER;
    this.currentGroup = GROUP;
    this.isRootUser = false;
    this.currentHomeSegs = HOME_PATH.slice();
    this.cwd = this.currentHomeSegs.slice();
    // 既定では（他のミッションと同様）一般ユーザーでもchownを自由に使える
    // 学習用の緩和挙動のまま。シナリオ側がinitEnvで明示的にtrueにした時だけ、
    // 実際のLinuxと同様「所有者の変更にはroot権限が必要」を再現する。
    this.strictChown = false;
  }

  // su/exit から呼ばれる。パーミッション判定の基準となる「現在のユーザー」を
  // 切り替える。cwdはここでは変更しない（作業ディレクトリは維持される）。
  setCurrentUser(user){
    this.currentUser = user.username;
    this.currentGroup = user.group;
    this.isRootUser = !!user.isRoot;
    this.currentHomeSegs = user.home.split("/").filter(Boolean);
  }

  homeSegs(){ return this.currentHomeSegs; }

  // su で root 等へ切り替えていても変わらない、既定ユーザー(student)の
  // ホームパス。シナリオのゴール判定（"~/..."）はここを基準に絶対パス化する。
  defaultHomeSegs(){ return HOME_PATH.slice(); }

  // Firestoreへ保存する形（プレーンなJSONのみ）に変換する
  toJSON(){
    return { root: serializeNode(this.root), cwd: this.cwd.slice() };
  }

  // toJSON()で保存したデータから状態を復元する。壊れたデータ（形式不一致等）
  // の場合は何もせず false を返し、呼び出し側は既定状態のまま使い続ける
  loadFromJSON(data){
    if(!data || typeof data !== "object") return false;
    const root = deserializeNode(data.root);
    if(!root || root.type !== "dir") return false;
    this.root = root;
    this.cwd = (Array.isArray(data.cwd) && data.cwd.length) ? data.cwd.slice() : HOME_PATH.slice();
    return true;
  }

  // pathStr（絶対/相対/~/./..混在可）を、ルートからのセグメント配列へ解決する
  resolvePath(pathStr, base){
    let segs;
    if(pathStr.startsWith("/")) segs = [];
    else if(pathStr === "~" || pathStr.startsWith("~/")) segs = this.homeSegs().slice();
    else segs = (base || this.cwd).slice();
    const rest = pathStr.startsWith("~") ? pathStr.slice(1) : pathStr;
    rest.split("/").filter(Boolean).forEach(part => {
      if(part === ".") return;
      if(part === "..") { if(segs.length) segs.pop(); return; }
      segs.push(part);
    });
    return segs;
  }

  // シンボリックリンクを辿らない生の子ノード取得
  rawChild(segs){
    let node = this.root;
    for(const part of segs){
      if(!node || node.type !== "dir" || !node.children[part]) return null;
      node = node.children[part];
    }
    return node;
  }

  followLink(linkNode, hops = 0){
    if(!linkNode || linkNode.type !== "link") return linkNode;
    if(hops > 10) return { __eloop: true };
    const next = this.rawChild(linkNode.target);
    if(!next) return null;
    if(next.type === "link") return this.followLink(next, hops + 1);
    return next;
  }

  // シンボリックリンクを辿ってノードを解決する（cd/cat等の通常用途）
  getNode(segs, opts = {}){
    const followLast = opts.followLast !== false;
    let node = this.root;
    for(let i = 0; i < segs.length; i++){
      if(!node || node.type !== "dir") return null;
      let child = node.children[segs[i]];
      if(!child) return null;
      const isLast = i === segs.length - 1;
      if(child.type === "link" && (!isLast || followLast)){
        child = this.followLink(child);
        if(!child || child.__eloop) return null;
      }
      node = child;
    }
    return node;
  }

  currentDir(){ return this.getNode(this.cwd); }

  // pwd の表示は常に絶対パス（例: /home/student/study）
  pwd(){ return "/" + this.cwd.join("/"); }

  absPath(segs){ return "/" + segs.join("/"); }

  // プロンプトに使う短縮パス（ホーム配下なら ~ で省略。例: ~/study）
  promptPath(){
    const home = this.homeSegs().join("/");
    const cur = this.cwd.join("/");
    if(cur === home) return "~";
    if(cur.startsWith(home + "/")) return "~" + cur.slice(home.length);
    return "/" + cur;
  }

  // --- パーミッション判定 -------------------------------------------------
  permClass(node){
    if(node.owner === this.currentUser) return 0;
    if(node.group === this.currentGroup) return 1;
    return 2;
  }
  can(node, perm){
    if(!node) return false;
    // root は実際のLinuxと同様、ファイルのパーミッションに関わらず常に許可される
    if(this.isRootUser) return true;
    const idx = { r:0, w:1, x:2 }[perm];
    const cls = this.permClass(node);
    return node.mode[cls*3 + idx] !== "-";
  }

  // --- ls -----------------------------------------------------------------
  list(pathStr){
    const segs = pathStr ? this.resolvePath(pathStr) : this.cwd;
    const node = this.getNode(segs);
    if(!node) return { error:{ error:"ENOENT", path: pathStr || this.pwd() } };
    if(node.type === "file") return { entries:[ this.describe(pathStr, node, segs) ] };
    if(!this.can(node, "r")) return { error:{ error:"EACCES", path: pathStr || this.pwd() } };
    const names = Object.keys(node.children).sort();
    const entries = names.map(name => this.describe(name, node.children[name], segs.concat(name)));
    return { entries, dirMode: node.mode };
  }

  describe(name, node, segs){
    const entry = {
      name, type: node.type, mode: node.mode, owner: node.owner, group: node.group,
      mtime: node.mtime, size: this.sizeOf(node),
    };
    if(node.type === "link") entry.linkTarget = this.absPath(node.target);
    return entry;
  }

  sizeOf(node){
    if(node.type === "file") return node.content.length;
    if(node.type === "link") return node.target.length ? this.absPath(node.target).length : 0;
    return 4096; // ディレクトリのサイズは実Linuxに合わせて固定4096として表示する
  }

  // --- cd -----------------------------------------------------------------
  changeDir(pathStr){
    const target = pathStr && pathStr.trim() ? pathStr.trim() : "~";
    const segs = this.resolvePath(target);
    const node = this.getNode(segs);
    if(!node) return { error:{ error:"ENOENT", path: target } };
    if(node.type !== "dir") return { error:{ error:"ENOTDIR", path: target } };
    if(!this.can(node, "x")) return { error:{ error:"EACCES", path: target } };
    this.cwd = segs;
    return { ok:true };
  }

  // --- mkdir ----------------------------------------------------------------
  makeDir(pathStr, opts = {}){
    if(!pathStr) return { error:{ error:"ENOENT_OPERAND" } };
    const segs = this.resolvePath(pathStr);
    if(opts.parents){
      let cur = this.root;
      const built = [];
      for(const part of segs){
        built.push(part);
        if(!cur.children[part]){
          if(!this.can(cur, "w")) return { error:{ error:"EACCES", path: built.join("/") } };
          cur.children[part] = makeDir(this.currentUser, this.currentGroup);
        } else if(cur.children[part].type !== "dir"){
          return { error:{ error:"ENOTDIR", path: built.join("/") } };
        }
        cur = cur.children[part];
      }
      return { ok:true };
    }
    const name = segs[segs.length-1];
    const parent = this.getNode(segs.slice(0,-1));
    if(!parent || parent.type !== "dir") return { error:{ error:"ENOENT", path: pathStr } };
    if(!this.can(parent, "w")) return { error:{ error:"EACCES", path: pathStr } };
    if(parent.children[name]) return { error:{ error:"EEXIST", path: pathStr } };
    parent.children[name] = makeDir(this.currentUser, this.currentGroup);
    return { ok:true };
  }

  removeDir(pathStr){
    if(!pathStr) return { error:{ error:"ENOENT_OPERAND" } };
    const segs = this.resolvePath(pathStr);
    const name = segs[segs.length-1];
    const parent = this.getNode(segs.slice(0,-1));
    const node = this.getNode(segs);
    if(!node) return { error:{ error:"ENOENT", path: pathStr } };
    if(node.type !== "dir") return { error:{ error:"ENOTDIR", path: pathStr } };
    if(Object.keys(node.children).length) return { error:{ error:"ENOTEMPTY", path: pathStr } };
    if(!this.can(parent, "w")) return { error:{ error:"EACCES", path: pathStr } };
    delete parent.children[name];
    return { ok:true };
  }

  // --- touch ----------------------------------------------------------------
  touch(pathStr){
    if(!pathStr) return { error:{ error:"ENOENT_OPERAND" } };
    const segs = this.resolvePath(pathStr);
    const name = segs[segs.length-1];
    const parent = this.getNode(segs.slice(0,-1));
    if(!parent || parent.type !== "dir") return { error:{ error:"ENOENT", path: pathStr } };
    if(parent.children[name]){
      parent.children[name].mtime = now();
      return { ok:true };
    }
    if(!this.can(parent, "w")) return { error:{ error:"EACCES", path: pathStr } };
    parent.children[name] = makeFile("", this.currentUser, this.currentGroup);
    return { ok:true };
  }

  // --- cat / read -------------------------------------------------------
  readFile(pathStr){
    if(!pathStr) return { error:{ error:"ENOENT_OPERAND" } };
    const segs = this.resolvePath(pathStr);
    const node = this.getNode(segs);
    if(!node) return { error:{ error:"ENOENT", path: pathStr } };
    if(node.type === "dir") return { error:{ error:"EISDIR", path: pathStr } };
    if(!this.can(node, "r")) return { error:{ error:"EACCES", path: pathStr } };
    return { content: node.content, node };
  }

  // --- echo > / >> / nano保存 --------------------------------------------
  writeFile(pathStr, content, opts = {}){
    if(!pathStr) return { error:{ error:"ENOENT_OPERAND" } };
    const segs = this.resolvePath(pathStr);
    const name = segs[segs.length-1];
    const parent = this.getNode(segs.slice(0,-1));
    if(!parent || parent.type !== "dir") return { error:{ error:"ENOENT", path: pathStr } };
    const existing = parent.children[name];
    if(existing && existing.type === "dir") return { error:{ error:"EISDIR", path: pathStr } };
    if(existing){
      if(!this.can(existing, "w")) return { error:{ error:"EACCES", path: pathStr } };
      existing.content = opts.append ? existing.content + content : content;
      existing.mtime = now();
      return { ok:true };
    }
    if(!this.can(parent, "w")) return { error:{ error:"EACCES", path: pathStr } };
    parent.children[name] = makeFile(content, this.currentUser, this.currentGroup);
    return { ok:true };
  }

  // --- rm -------------------------------------------------------------------
  remove(pathStr, opts = {}){
    if(!pathStr) return { error:{ error:"ENOENT_OPERAND" } };
    const segs = this.resolvePath(pathStr);
    const name = segs[segs.length-1];
    const parent = this.getNode(segs.slice(0,-1));
    const node = this.rawChild(segs);
    if(!node){
      if(opts.force) return { ok:true, skipped:true };
      return { error:{ error:"ENOENT", path: pathStr } };
    }
    if(node.type === "dir" && !opts.recursive) return { error:{ error:"EISDIR", path: pathStr } };
    if(!this.can(parent, "w")) return { error:{ error:"EACCES", path: pathStr } };
    delete parent.children[name];
    return { ok:true };
  }

  // --- cp / mv --------------------------------------------------------------
  cloneNode(node){
    if(node.type === "file") return makeFile(node.content, node.owner, node.group, node.mode);
    if(node.type === "link") return makeLink(node.target.slice(), node.owner, node.group);
    const dir = makeDir(node.owner, node.group, node.mode);
    Object.keys(node.children).forEach(k => { dir.children[k] = this.cloneNode(node.children[k]); });
    return dir;
  }

  // 目的地パスが既存ディレクトリならその配下に元の名前で置く。返り値は最終セグメント。
  resolveDestSegs(srcName, destPathStr){
    const destSegs = this.resolvePath(destPathStr);
    const destNode = this.getNode(destSegs);
    if(destNode && destNode.type === "dir") return destSegs.concat(srcName);
    return destSegs;
  }

  copy(srcPathStr, destPathStr, opts = {}){
    const srcSegs = this.resolvePath(srcPathStr);
    const srcNode = this.rawChild(srcSegs) || this.getNode(srcSegs);
    if(!srcNode) return { error:{ error:"ENOENT", path: srcPathStr, stat:true } };
    if(srcNode.type === "dir" && !opts.recursive) return { error:{ error:"EISDIR_NEEDS_R", path: srcPathStr } };
    const srcName = srcSegs[srcSegs.length-1];
    const finalSegs = this.resolveDestSegs(srcName, destPathStr);
    const destName = finalSegs[finalSegs.length-1];
    const destParent = this.getNode(finalSegs.slice(0,-1));
    if(!destParent || destParent.type !== "dir") return { error:{ error:"ENOENT", path: destPathStr, stat:true } };
    if(!this.can(destParent, "w")) return { error:{ error:"EACCES", path: destPathStr } };
    destParent.children[destName] = this.cloneNode(srcNode);
    return { ok:true };
  }

  move(srcPathStr, destPathStr){
    const srcSegs = this.resolvePath(srcPathStr);
    const srcName = srcSegs[srcSegs.length-1];
    const srcParent = this.getNode(srcSegs.slice(0,-1));
    const srcNode = srcParent && srcParent.type === "dir" ? srcParent.children[srcName] : null;
    if(!srcNode) return { error:{ error:"ENOENT", path: srcPathStr, stat:true } };
    if(!this.can(srcParent, "w")) return { error:{ error:"EACCES", path: srcPathStr } };
    const finalSegs = this.resolveDestSegs(srcName, destPathStr);
    const destName = finalSegs[finalSegs.length-1];
    const destParent = this.getNode(finalSegs.slice(0,-1));
    if(!destParent || destParent.type !== "dir") return { error:{ error:"ENOENT", path: destPathStr, stat:true } };
    if(!this.can(destParent, "w")) return { error:{ error:"EACCES", path: destPathStr } };
    destParent.children[destName] = srcNode;
    delete srcParent.children[srcName];
    return { ok:true };
  }

  // --- ln ---------------------------------------------------------------
  link(targetPathStr, linkPathStr, opts = {}){
    const linkSegs = this.resolvePath(linkPathStr);
    let finalSegs = linkSegs;
    const maybeDir = this.getNode(linkSegs);
    if(maybeDir && maybeDir.type === "dir"){
      const targetName = this.resolvePath(targetPathStr).slice(-1)[0];
      finalSegs = linkSegs.concat(targetName);
    }
    const linkName = finalSegs[finalSegs.length-1];
    const parent = this.getNode(finalSegs.slice(0,-1));
    if(!parent || parent.type !== "dir") return { error:{ error:"ENOENT", path: linkPathStr } };
    if(parent.children[linkName]) return { error:{ error:"EEXIST", path: linkPathStr } };
    if(!this.can(parent, "w")) return { error:{ error:"EACCES", path: linkPathStr } };
    if(opts.symbolic){
      const targetSegs = this.resolvePath(targetPathStr);
      parent.children[linkName] = makeLink(targetSegs, this.currentUser, this.currentGroup);
      return { ok:true };
    }
    const targetSegs = this.resolvePath(targetPathStr);
    const targetNode = this.getNode(targetSegs);
    if(!targetNode) return { error:{ error:"ENOENT", path: targetPathStr, stat:true } };
    if(targetNode.type === "dir") return { error:{ error:"EPERM_DIR", path: targetPathStr } };
    parent.children[linkName] = targetNode; // ハードリンク＝同一ノードを共有
    return { ok:true };
  }

  // --- chmod / chown ------------------------------------------------------
  chmod(pathStr, spec, opts = {}){
    const segs = this.resolvePath(pathStr);
    const node = this.rawChild(segs);
    if(!node) return { error:{ error:"ENOENT", path: pathStr } };
    const apply = (n) => {
      const newMode = applyChmodSpec(n.mode, spec);
      if(newMode === null) return false;
      n.mode = newMode;
      return true;
    };
    if(!apply(node)) return { error:{ error:"EINVAL", path: spec } };
    if(opts.recursive && node.type === "dir"){
      const walk = (dir) => Object.values(dir.children).forEach(child => { apply(child); if(child.type === "dir") walk(child); });
      walk(node);
    }
    return { ok:true, node };
  }

  chown(pathStr, ownerSpec, opts = {}){
    const segs = this.resolvePath(pathStr);
    const node = this.rawChild(segs);
    if(!node) return { error:{ error:"ENOENT", path: pathStr } };
    const [owner, group] = ownerSpec.split(":");
    // 実際のLinuxでは所有者の変更はroot専用（グループ変更は一般ユーザーでも
    // 自分が所属するグループへなら可能）。strictChownが有効なシナリオでのみ
    // この制約を再現する（既定では他ミッションと同じく自由に変更できる）。
    if(owner && this.strictChown && !this.isRootUser){
      return { error:{ error:"EPERM", path: pathStr } };
    }
    const apply = (n) => { if(owner) n.owner = owner; if(group) n.group = group; };
    apply(node);
    if(opts.recursive && node.type === "dir"){
      const walk = (dir) => Object.values(dir.children).forEach(child => { apply(child); if(child.type === "dir") walk(child); });
      walk(node);
    }
    return { ok:true, node };
  }

  // --- du -------------------------------------------------------------------
  du(node){
    if(node.type === "file") return node.content.length;
    if(node.type === "link") return 0;
    return Object.values(node.children).reduce((sum, c) => sum + this.du(c), 0);
  }

  // --- find / locate --------------------------------------------------------
  walk(segs, node, visit){
    visit(segs, node);
    if(node.type === "dir"){
      Object.keys(node.children).sort().forEach(name => this.walk(segs.concat(name), node.children[name], visit));
    }
  }

  findAll(startPathStr){
    const startSegs = this.resolvePath(startPathStr || ".");
    const startNode = this.getNode(startSegs);
    if(!startNode) return { error:{ error:"ENOENT", path: startPathStr } };
    const results = [];
    this.walk(startSegs, startNode, (segs, node) => results.push({ path: this.absPath(segs), segs, node }));
    return { results };
  }
}
