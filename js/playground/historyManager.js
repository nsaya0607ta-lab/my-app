/* =========================================================================
   HistoryManager — コマンド入力欄の上下キー履歴。
   ・push(cmd)：Enterで送信した内容を履歴末尾に追加し、閲覧位置を末尾に戻す
   ・prev()/next()：↑/↓キーで一つ前・一つ後ろの履歴文字列を取得する
   ========================================================================= */

export class HistoryManager {
  constructor(){ this.reset(); }

  reset(){
    this.items = [];
    this.cursor = 0; // items.length の位置は「まだ何も呼び出していない末尾」
    this.draft = "";
  }

  push(cmd){
    if(cmd && cmd.trim()) this.items.push(cmd);
    this.cursor = this.items.length;
    this.draft = "";
  }

  // draft: ↑キーで履歴をさかのぼる直前に入力欄にあった未送信の文字列
  prev(currentInput){
    if(!this.items.length) return null;
    if(this.cursor === this.items.length) this.draft = currentInput || "";
    this.cursor = Math.max(0, this.cursor - 1);
    return this.items[this.cursor];
  }

  next(){
    if(!this.items.length || this.cursor >= this.items.length) return null;
    this.cursor++;
    return this.cursor === this.items.length ? this.draft : this.items[this.cursor];
  }

  toJSON(){ return this.items.slice(); }

  loadFromJSON(items){
    this.items = Array.isArray(items) ? items.filter(s => typeof s === "string") : [];
    this.cursor = this.items.length;
    this.draft = "";
  }
}
