/* =========================================================================
   VirtualFileSystem — Linuxプレイグラウンド用の仮想ファイルシステム
   実OSには一切アクセスせず、メモリ上のツリー構造だけで pwd/ls/cd/mkdir/
   touch/cat/echo の状態変化を再現する。
   ノードは { type:"dir", children:{name:Node} } または
   { type:"file", content:string } のいずれか。
   ========================================================================= */

const HOME_PATH = ["home", "student"];
const DEFAULT_HOME_DIRS = ["Desktop", "Documents", "Downloads", "Pictures", "Videos"];

function makeDir(){ return { type:"dir", children:{} }; }
function makeFile(content){ return { type:"file", content: content||"" }; }

function buildInitialRoot(){
  const home = makeDir();
  DEFAULT_HOME_DIRS.forEach(name => { home.children[name] = makeDir(); });
  const root = makeDir();
  root.children.home = makeDir();
  root.children.home.children.student = home;
  return root;
}

export class VirtualFileSystem {
  constructor(){ this.reset(); }

  reset(){
    this.root = buildInitialRoot();
    this.cwd = HOME_PATH.slice();
  }

  // pathStr（絶対/相対/~/./..混在可）を、ルートからのセグメント配列へ解決する
  resolvePath(pathStr){
    let segs;
    if(pathStr.startsWith("/")) segs = [];
    else if(pathStr === "~" || pathStr.startsWith("~/")) segs = HOME_PATH.slice();
    else segs = this.cwd.slice();
    const rest = pathStr.startsWith("~") ? pathStr.slice(1) : pathStr;
    rest.split("/").filter(Boolean).forEach(part => {
      if(part === ".") return;
      if(part === "..") { if(segs.length) segs.pop(); return; }
      segs.push(part);
    });
    return segs;
  }

  getNode(segs){
    let node = this.root;
    for(const part of segs){
      if(!node || node.type !== "dir" || !node.children[part]) return null;
      node = node.children[part];
    }
    return node;
  }

  currentDir(){ return this.getNode(this.cwd); }

  // pwd の表示は常に絶対パス（例: /home/student/study）
  pwd(){ return "/" + this.cwd.join("/"); }

  // プロンプトに使う短縮パス（ホーム配下なら ~ で省略。例: ~/study）
  promptPath(){
    const home = HOME_PATH.join("/");
    const cur = this.cwd.join("/");
    if(cur === home) return "~";
    if(cur.startsWith(home + "/")) return "~" + cur.slice(home.length);
    return "/" + cur;
  }

  list(pathStr){
    const segs = pathStr ? this.resolvePath(pathStr) : this.cwd;
    const node = this.getNode(segs);
    if(!node) return { error:`ls: ${pathStr}: No such file or directory` };
    if(node.type === "file") return { entries:[{ name: pathStr, type:"file" }] };
    const entries = Object.keys(node.children).sort().map(name => ({
      name, type: node.children[name].type,
    }));
    return { entries };
  }

  changeDir(pathStr){
    const target = pathStr && pathStr.trim() ? pathStr.trim() : "~";
    const segs = this.resolvePath(target);
    const node = this.getNode(segs);
    if(!node) return { error:`cd: ${target}: No such file or directory` };
    if(node.type !== "dir") return { error:`cd: ${target}: Not a directory` };
    this.cwd = segs;
    return { ok:true };
  }

  makeDir(pathStr){
    if(!pathStr) return { error:"mkdir: missing operand" };
    const segs = this.resolvePath(pathStr);
    const name = segs[segs.length-1];
    const parent = this.getNode(segs.slice(0,-1));
    if(!parent || parent.type !== "dir") return { error:`mkdir: cannot create directory '${pathStr}': No such file or directory` };
    if(parent.children[name]) return { error:`mkdir: cannot create directory '${pathStr}': File exists` };
    parent.children[name] = makeDir();
    return { ok:true };
  }

  touch(pathStr){
    if(!pathStr) return { error:"touch: missing operand" };
    const segs = this.resolvePath(pathStr);
    const name = segs[segs.length-1];
    const parent = this.getNode(segs.slice(0,-1));
    if(!parent || parent.type !== "dir") return { error:`touch: cannot touch '${pathStr}': No such file or directory` };
    if(!parent.children[name]) parent.children[name] = makeFile("");
    return { ok:true };
  }

  readFile(pathStr){
    if(!pathStr) return { error:"cat: missing operand" };
    const segs = this.resolvePath(pathStr);
    const node = this.getNode(segs);
    if(!node) return { error:`cat: ${pathStr}: No such file or directory` };
    if(node.type === "dir") return { error:`cat: ${pathStr}: Is a directory` };
    return { content: node.content };
  }

  writeFile(pathStr, content){
    if(!pathStr) return { error:"missing file operand" };
    const segs = this.resolvePath(pathStr);
    const name = segs[segs.length-1];
    const parent = this.getNode(segs.slice(0,-1));
    if(!parent || parent.type !== "dir") return { error:`${pathStr}: No such file or directory` };
    if(parent.children[name] && parent.children[name].type === "dir") return { error:`${pathStr}: Is a directory` };
    parent.children[name] = makeFile(content);
    return { ok:true };
  }
}
