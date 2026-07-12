/* =========================================================================
   awk — フィールド処理・パターンマッチングを行うテキスト処理言語の簡易実装。
   対応範囲: -F/-v オプション、BEGIN/END、パターン（正規表現・比較式・論理式）、
   print/printf、フィールド参照($0,$1,...)と組み込み変数(NR,NF,FS,OFS,ORS)、
   算術・比較・論理演算、if/else、length/substr/toupper/tolower/index/int/sprintf。
   完全なawk仕様の再現ではなく、LPIC1レベルの学習用途を想定した縮小実装。
   ========================================================================= */
import { errLine, fsError, outLine } from './_util.js';

const RESERVED = new Set(["BEGIN","END","if","else","print","printf","next","in","function","while","for","do","return","getline"]);

/* ---------------- Lexer ---------------- */
function lex(src){
  const tokens = [];
  const n = src.length;
  let i = 0;
  const canPrecedeRegex = () => {
    if(!tokens.length) return true;
    const t = tokens[tokens.length-1];
    if(t.type === "NUM" || t.type === "STR" || t.type === "REGEX" || t.type === "IDENT") return false;
    if(t.type === "PUNCT" && (t.value === ")" || t.value === "]")) return false;
    return true;
  };
  const TWO = ["==","!=","<=",">=","&&","||","++","--","+=","-=","*=","/=","%=","^=","!~"];
  while(i < n){
    const ch = src[i];
    if(ch === " " || ch === "\t"){ i++; continue; }
    if(ch === "\n"){ tokens.push({ type:"NL" }); i++; continue; }
    if(ch === "#"){ while(i < n && src[i] !== "\n") i++; continue; }
    if(ch === '"'){
      let j = i + 1, s = "";
      while(j < n && src[j] !== '"'){
        if(src[j] === "\\" && j + 1 < n){
          const esc = src[j+1];
          const MAP = { n:"\n", t:"\t", "\\":"\\", '"':'"', r:"\r" };
          s += MAP[esc] !== undefined ? MAP[esc] : esc;
          j += 2;
        } else { s += src[j]; j++; }
      }
      tokens.push({ type:"STR", value:s });
      i = j + 1;
      continue;
    }
    if(ch === "/" && canPrecedeRegex()){
      let j = i + 1, s = "";
      while(j < n && src[j] !== "/"){
        if(src[j] === "\\" && j + 1 < n){ s += src[j] + src[j+1]; j += 2; }
        else { s += src[j]; j++; }
      }
      tokens.push({ type:"REGEX", value:s });
      i = j + 1;
      continue;
    }
    if(/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i+1] || ""))){
      let j = i;
      while(j < n && /[0-9.]/.test(src[j])) j++;
      tokens.push({ type:"NUM", value: parseFloat(src.slice(i, j)) });
      i = j;
      continue;
    }
    if(/[A-Za-z_]/.test(ch)){
      let j = i;
      while(j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      tokens.push({ type:"IDENT", value: src.slice(i, j) });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if(TWO.includes(two)){ tokens.push({ type:"PUNCT", value: two }); i += 2; continue; }
    if("${}(),;+-*/%^<>=!~".includes(ch)){ tokens.push({ type:"PUNCT", value: ch }); i++; continue; }
    i++; // 未知の文字は読み飛ばす
  }
  tokens.push({ type:"EOF" });
  return tokens;
}

/* ---------------- Runtime helpers ---------------- */
function toNum(v){
  if(typeof v === "number") return v;
  if(v === undefined || v === null) return 0;
  const m = String(v).trim().match(/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}
function numToStr(n){
  if(!isFinite(n)) return String(n);
  if(Object.is(n, -0)) n = 0;
  if(Number.isInteger(n)) return String(n);
  let s = n.toPrecision(6);
  if(s.includes("e")) return String(n);
  if(s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s;
}
function toStr(v){
  if(typeof v === "number") return numToStr(v);
  if(v === undefined || v === null) return "";
  return String(v);
}
function truthy(v){
  if(typeof v === "number") return v !== 0;
  if(v === undefined || v === null) return false;
  return String(v) !== "";
}
function isNumericLike(v){
  if(typeof v === "number") return true;
  if(v === undefined || v === null) return true;
  const s = String(v).trim();
  if(s === "") return false;
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s);
}

function getField(env, idx){
  idx = Math.trunc(idx);
  if(idx === 0) return env.fields[0] ?? "";
  return env.fields[idx] ?? "";
}
function splitRecord(env){
  const fs = env.vars.FS;
  const line = env.fields[0] ?? "";
  let parts;
  if(fs === " "){
    const trimmed = line.trim();
    parts = trimmed === "" ? [] : trimmed.split(/\s+/);
  } else if(fs.length === 1){
    parts = line === "" ? [] : line.split(fs);
  } else {
    let re;
    try{ re = new RegExp(fs); } catch(e){ re = new RegExp(fs.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")); }
    parts = line === "" ? [] : line.split(re);
  }
  env.fields = [line, ...parts];
  env.vars.NF = parts.length;
}
function rebuildRecord(env){
  const parts = env.fields.slice(1, env.vars.NF + 1);
  env.fields[0] = parts.join(env.vars.OFS);
}
function setField(env, idx, val){
  idx = Math.trunc(idx);
  if(idx <= 0){
    if(idx === 0){ env.fields[0] = toStr(val); splitRecord(env); }
    return;
  }
  while(env.fields.length <= idx) env.fields.push("");
  env.fields[idx] = toStr(val);
  if(idx > env.vars.NF) env.vars.NF = idx;
  rebuildRecord(env);
}
function getVar(env, name){
  if(Object.prototype.hasOwnProperty.call(env.vars, name)) return env.vars[name];
  return "";
}
function setVar(env, name, val){
  if(name === "NF"){
    const nf = Math.trunc(toNum(val));
    if(nf < env.vars.NF) env.fields.length = nf + 1;
    else while(env.fields.length <= nf) env.fields.push("");
    env.vars.NF = nf;
    rebuildRecord(env);
    return;
  }
  env.vars[name] = val;
}

function unescapeSimple(s){
  return s.replace(/\\t/g, "\t").replace(/\\n/g, "\n");
}

/* ---------------- sprintf ---------------- */
function formatOne(spec, val){
  const m = spec.match(/^%([-+0 #]*)(\d*)(?:\.(\d+))?([a-zA-Z%])$/);
  if(!m) return "";
  const flags = m[1], width = m[2] ? parseInt(m[2], 10) : 0;
  const prec = m[3] !== undefined ? parseInt(m[3], 10) : null;
  const conv = m[4];
  let s;
  if(conv === "d" || conv === "i"){
    let num = Math.trunc(toNum(val));
    s = Math.abs(num).toString();
    if(prec !== null) s = s.padStart(prec, "0");
    s = num < 0 ? "-" + s : (flags.includes("+") ? "+" + s : s);
  } else if(conv === "f"){
    const num = toNum(val);
    s = num.toFixed(prec === null ? 6 : prec);
    if(num >= 0 && flags.includes("+")) s = "+" + s;
  } else if(conv === "s"){
    s = toStr(val);
    if(prec !== null) s = s.slice(0, prec);
  } else if(conv === "c"){
    s = typeof val === "number" ? String.fromCharCode(val) : toStr(val).charAt(0);
  } else if(conv === "x"){
    s = (Math.trunc(toNum(val)) >>> 0).toString(16);
  } else if(conv === "o"){
    s = (Math.trunc(toNum(val)) >>> 0).toString(8);
  } else {
    s = toStr(val);
  }
  if(width > s.length){
    s = flags.includes("-") ? s.padEnd(width, " ") : s.padStart(width, flags.includes("0") && conv !== "s" ? "0" : " ");
  }
  return s;
}
function doSprintf(values){
  const fmt = toStr(values[0]);
  let vi = 1, out = "";
  for(let i = 0; i < fmt.length; i++){
    const ch = fmt[i];
    if(ch !== "%"){ out += ch; continue; }
    let j = i + 1;
    if(fmt[j] === "%"){ out += "%"; i = j; continue; }
    let spec = "%";
    while(j < fmt.length && "-+ 0#".includes(fmt[j])){ spec += fmt[j]; j++; }
    while(j < fmt.length && /[0-9]/.test(fmt[j])){ spec += fmt[j]; j++; }
    if(fmt[j] === "."){ spec += "."; j++; while(j < fmt.length && /[0-9]/.test(fmt[j])){ spec += fmt[j]; j++; } }
    spec += fmt[j] || "s";
    out += formatOne(spec, values[vi++]);
    i = j;
  }
  return out;
}

/* ---------------- Builtin functions ---------------- */
function callBuiltin(name, argFns, env){
  const A = (i) => (argFns[i] ? argFns[i](env) : undefined);
  switch(name){
    case "length": return argFns.length ? toStr(A(0)).length : toStr(getField(env, 0)).length;
    case "substr": {
      const s = toStr(A(0));
      let start = Math.trunc(toNum(A(1))) - 1;
      let end = argFns.length > 2 ? start + Math.trunc(toNum(A(2))) : s.length;
      start = Math.max(0, start);
      end = Math.max(start, Math.min(s.length, end));
      return s.slice(start, end);
    }
    case "toupper": return toStr(A(0)).toUpperCase();
    case "tolower": return toStr(A(0)).toLowerCase();
    case "index": return toStr(A(0)).indexOf(toStr(A(1))) + 1;
    case "int": return Math.trunc(toNum(A(0)));
    case "sprintf": return doSprintf(argFns.map((a) => a(env)));
    case "sin": return Math.sin(toNum(A(0)));
    case "cos": return Math.cos(toNum(A(0)));
    case "sqrt": return Math.sqrt(toNum(A(0)));
    case "exp": return Math.exp(toNum(A(0)));
    case "log": return Math.log(toNum(A(0)));
    default: throw new Error(`calling undefined function ${name}`);
  }
}

/* ---------------- Parser ---------------- */
class Parser{
  constructor(tokens){ this.toks = tokens; this.pos = 0; }
  peek(o = 0){ return this.toks[this.pos + o]; }
  at(type, value){ const t = this.peek(); return t.type === type && (value === undefined || t.value === value); }
  atPunct(v){ return this.at("PUNCT", v); }
  next(){ return this.toks[this.pos++]; }
  expectPunct(v){ if(!this.atPunct(v)) throw new Error(`'${v}' がありません`); return this.next(); }
  skipTerm(){ while(this.at("NL") || this.atPunct(";")) this.next(); }

  parseProgram(){
    const rules = [];
    this.skipTerm();
    while(!this.at("EOF")){
      let kind = null, pattern = null;
      if(this.at("IDENT", "BEGIN")){ this.next(); kind = "BEGIN"; }
      else if(this.at("IDENT", "END")){ this.next(); kind = "END"; }
      else if(!this.atPunct("{")){ pattern = this.parseAssign(); }
      let action = null;
      if(this.atPunct("{")) action = this.parseBlock();
      rules.push({ kind, pattern, action });
      this.skipTerm();
    }
    return rules;
  }

  parseBlock(){
    this.expectPunct("{");
    this.skipTerm();
    const stmts = [];
    while(!this.atPunct("}") && !this.at("EOF")){
      stmts.push(this.parseStatement());
      this.skipTerm();
    }
    this.expectPunct("}");
    return (env) => { for(const s of stmts){ const sig = s(env); if(sig) return sig; } };
  }

  parsePrintArgs(){
    const args = [];
    if(this.atPunct("(")){
      const save = this.pos;
      this.next();
      const first = this.parseAssign();
      if(this.atPunct(",")){
        args.push(first);
        while(this.atPunct(",")){ this.next(); args.push(this.parseAssign()); }
        this.expectPunct(")");
        return args;
      } else if(this.atPunct(")")){
        this.next();
        args.push(first);
      } else {
        this.pos = save;
        args.push(this.parseAssign());
      }
    } else if(!(this.atPunct(";") || this.at("NL") || this.atPunct("}") || this.at("EOF"))){
      args.push(this.parseAssign());
    }
    while(this.atPunct(",")){ this.next(); args.push(this.parseAssign()); }
    return args;
  }

  parseStatement(){
    if(this.atPunct("{")) return this.parseBlock();
    if(this.atPunct(";")){ this.next(); return () => {}; }
    if(this.at("IDENT", "if")) return this.parseIf();
    if(this.at("IDENT", "print")){
      this.next();
      const args = this.parsePrintArgs();
      return (env) => {
        const parts = args.length ? args.map((a) => toStr(a(env))) : [toStr(getField(env, 0))];
        env.out.push(parts.join(env.vars.OFS) + env.vars.ORS);
      };
    }
    if(this.at("IDENT", "printf")){
      this.next();
      const args = this.parsePrintArgs();
      return (env) => { env.out.push(doSprintf(args.map((a) => a(env)))); };
    }
    if(this.at("IDENT", "next")){ this.next(); return () => "NEXT"; }
    const e = this.parseAssign();
    return (env) => { e(env); };
  }

  parseIf(){
    this.next();
    this.expectPunct("(");
    const cond = this.parseAssign();
    this.expectPunct(")");
    this.skipTerm();
    const thenS = this.parseStatement();
    const save = this.pos;
    this.skipTerm();
    let elseS = null;
    if(this.at("IDENT", "else")){ this.next(); this.skipTerm(); elseS = this.parseStatement(); }
    else this.pos = save;
    return (env) => (truthy(cond(env)) ? thenS(env) : (elseS ? elseS(env) : undefined));
  }

  parseAssign(){
    const left = this.parseOr();
    const compound = ["=", "+=", "-=", "*=", "/=", "%=", "^="];
    const t = this.peek();
    if(t.type === "PUNCT" && compound.includes(t.value) && left.set){
      const op = this.next().value;
      const rhs = this.parseAssign();
      const target = left;
      return (env) => {
        const rv = rhs(env);
        let nv;
        if(op === "=") nv = rv;
        else {
          const cur = toNum(target(env)), rn = toNum(rv);
          nv = op === "+=" ? cur + rn : op === "-=" ? cur - rn : op === "*=" ? cur * rn : op === "/=" ? cur / rn : op === "%=" ? cur % rn : Math.pow(cur, rn);
        }
        target.set(env, nv);
        return nv;
      };
    }
    return left;
  }
  parseOr(){
    let left = this.parseAnd();
    while(this.atPunct("||")){
      this.next();
      const l = left, r = this.parseAnd();
      left = (env) => (truthy(l(env)) || truthy(r(env)) ? 1 : 0);
    }
    return left;
  }
  parseAnd(){
    let left = this.parseMatch();
    while(this.atPunct("&&")){
      this.next();
      const l = left, r = this.parseMatch();
      left = (env) => (truthy(l(env)) && truthy(r(env)) ? 1 : 0);
    }
    return left;
  }
  parseMatch(){
    let left = this.parseRel();
    while(this.atPunct("~") || this.atPunct("!~")){
      const op = this.next().value;
      const l = left, r = this.parseRel();
      left = (env) => {
        const s = toStr(l(env));
        let re;
        try{ re = r.regexSource !== undefined ? new RegExp(r.regexSource) : new RegExp(toStr(r(env))); }
        catch(e){ re = null; }
        const m = re ? re.test(s) : false;
        return (op === "~" ? m : !m) ? 1 : 0;
      };
    }
    return left;
  }
  parseRel(){
    let left = this.parseConcat();
    const ops = ["==", "!=", "<", "<=", ">", ">="];
    const t = this.peek();
    if(t.type === "PUNCT" && ops.includes(t.value)){
      const op = this.next().value;
      const l = left, r = this.parseConcat();
      left = (env) => {
        const a = l(env), b = r(env);
        let cmp;
        if(isNumericLike(a) && isNumericLike(b)){
          const an = toNum(a), bn = toNum(b);
          cmp = an < bn ? -1 : an > bn ? 1 : 0;
        } else {
          const as = toStr(a), bs = toStr(b);
          cmp = as < bs ? -1 : as > bs ? 1 : 0;
        }
        const res = op === "==" ? cmp === 0 : op === "!=" ? cmp !== 0 : op === "<" ? cmp < 0 : op === "<=" ? cmp <= 0 : op === ">" ? cmp > 0 : cmp >= 0;
        return res ? 1 : 0;
      };
    }
    return left;
  }
  canStartConcatOperand(){
    const t = this.peek();
    if(t.type === "NUM" || t.type === "STR" || t.type === "REGEX") return true;
    if(t.type === "IDENT") return !RESERVED.has(t.value);
    if(t.type === "PUNCT") return t.value === "$" || t.value === "(" || t.value === "!";
    return false;
  }
  parseConcat(){
    let left = this.parseAdditive();
    while(this.canStartConcatOperand()){
      const l = left, r = this.parseAdditive();
      left = (env) => toStr(l(env)) + toStr(r(env));
    }
    return left;
  }
  parseAdditive(){
    let left = this.parseMultiplicative();
    while(this.atPunct("+") || this.atPunct("-")){
      const op = this.next().value;
      const l = left, r = this.parseMultiplicative();
      left = (env) => (op === "+" ? toNum(l(env)) + toNum(r(env)) : toNum(l(env)) - toNum(r(env)));
    }
    return left;
  }
  parseMultiplicative(){
    let left = this.parseUnary();
    while(this.atPunct("*") || this.atPunct("/") || this.atPunct("%")){
      const op = this.next().value;
      const l = left, r = this.parseUnary();
      left = (env) => {
        const a = toNum(l(env)), b = toNum(r(env));
        return op === "*" ? a * b : op === "/" ? a / b : a % b;
      };
    }
    return left;
  }
  parseUnary(){
    if(this.atPunct("!")){ this.next(); const e = this.parseUnary(); return (env) => (truthy(e(env)) ? 0 : 1); }
    if(this.atPunct("-")){ this.next(); const e = this.parseUnary(); return (env) => -toNum(e(env)); }
    if(this.atPunct("+")){ this.next(); const e = this.parseUnary(); return (env) => toNum(e(env)); }
    if(this.atPunct("++") || this.atPunct("--")){
      const op = this.next().value;
      const target = this.parseUnary();
      if(!target.set) throw new Error("代入対象が不正です");
      return (env) => { const nv = toNum(target(env)) + (op === "++" ? 1 : -1); target.set(env, nv); return nv; };
    }
    return this.parsePow();
  }
  parsePow(){
    const left = this.parsePostfix();
    if(this.atPunct("^")){ this.next(); const right = this.parseUnary(); return (env) => Math.pow(toNum(left(env)), toNum(right(env))); }
    return left;
  }
  parsePostfix(){
    const e = this.parsePrimary();
    if((this.atPunct("++") || this.atPunct("--")) && e.set){
      const op = this.next().value;
      const target = e;
      return (env) => { const old = toNum(target(env)); target.set(env, old + (op === "++" ? 1 : -1)); return old; };
    }
    return e;
  }
  parsePrimary(){
    const t = this.peek();
    if(t.type === "NUM"){ this.next(); const v = t.value; return () => v; }
    if(t.type === "STR"){ this.next(); const v = t.value; return () => v; }
    if(t.type === "REGEX"){
      this.next();
      const src = t.value;
      const fn = (env) => { try{ return new RegExp(src).test(toStr(getField(env, 0))) ? 1 : 0; } catch(e){ return 0; } };
      fn.regexSource = src;
      return fn;
    }
    if(this.atPunct("$")){
      this.next();
      const idxFn = this.parsePrimary();
      const fn = (env) => getField(env, toNum(idxFn(env)));
      fn.set = (env, val) => setField(env, toNum(idxFn(env)), val);
      return fn;
    }
    if(this.atPunct("(")){
      this.next();
      const inner = this.parseAssign();
      this.expectPunct(")");
      return inner;
    }
    if(t.type === "IDENT"){
      this.next();
      if(this.atPunct("(")){
        this.next();
        const args = [];
        if(!this.atPunct(")")){
          args.push(this.parseAssign());
          while(this.atPunct(",")){ this.next(); args.push(this.parseAssign()); }
        }
        this.expectPunct(")");
        const name = t.value;
        return (env) => callBuiltin(name, args, env);
      }
      const name = t.value;
      const fn = (env) => getVar(env, name);
      fn.set = (env, val) => setVar(env, name, val);
      return fn;
    }
    throw new Error(`予期しないトークンです`);
  }
}

function parseProgram(src){
  return new Parser(lex(src)).parseProgram();
}

/* ---------------- Command entry point ---------------- */
function splitBody(text){
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  return body === "" ? [] : body.split("\n");
}

export default function awk(ctx){
  const args = ctx.args.slice();
  let fsOpt = null;
  const initVars = {};
  let programText = null;
  const files = [];
  for(let i = 0; i < args.length; i++){
    const a = args[i];
    if(a === "-F"){ fsOpt = args[++i]; }
    else if(a.startsWith("-F") && a.length > 2){ fsOpt = a.slice(2); }
    else if(a === "-v"){
      const kv = args[++i] || "";
      const eq = kv.indexOf("=");
      if(eq >= 0) initVars[kv.slice(0, eq)] = kv.slice(eq + 1);
    } else if(a.startsWith("-v") && a.length > 2){
      const kv = a.slice(2);
      const eq = kv.indexOf("=");
      if(eq >= 0) initVars[kv.slice(0, eq)] = kv.slice(eq + 1);
    } else if(programText === null){ programText = a; }
    else files.push(a);
  }
  if(programText === null) return { lines:[], err:[ errLine("使い方: awk [-F FS] [-v VAR=VALUE] 'プログラム' [FILE...]") ] };

  let rules;
  try{ rules = parseProgram(programText); }
  catch(e){ return { lines:[], err:[ errLine(`awk: 構文エラー: ${e.message}`) ] }; }

  const env = {
    vars: { NR:0, NF:0, FS: fsOpt !== null ? unescapeSimple(fsOpt) : " ", OFS:" ", ORS:"\n", FILENAME:"" },
    fields: [""],
    out: [],
  };
  Object.entries(initVars).forEach(([k, v]) => { env.vars[k] = v; });

  const errOut = [];
  try{ rules.forEach((r) => { if(r.kind === "BEGIN" && r.action) r.action(env); }); }
  catch(e){ errOut.push(errLine(`awk: ${e.message}`)); }

  function processLine(line, filename){
    env.fields = [line];
    env.vars.FILENAME = filename || "";
    splitRecord(env);
    env.vars.NR += 1;
    for(const r of rules){
      if(r.kind === "BEGIN" || r.kind === "END") continue;
      const matched = r.pattern ? truthy(r.pattern(env)) : true;
      if(!matched) continue;
      const action = r.action || ((e2) => { e2.out.push(toStr(getField(e2, 0)) + e2.vars.ORS); });
      const sig = action(env);
      if(sig === "NEXT") break;
    }
  }

  const readsInput = rules.some((r) => r.kind !== "BEGIN");
  if(readsInput && errOut.length === 0){
    try{
      if(!files.length){
        splitBody(ctx.stdin || "").forEach((line) => processLine(line, ""));
      } else {
        files.forEach((f) => {
          const res = ctx.vfs.readFile(f);
          if(res.error){ errOut.push(fsError("awk", null, res.error)); return; }
          splitBody(res.content).forEach((line) => processLine(line, f));
        });
      }
    } catch(e){ errOut.push(errLine(`awk: ${e.message}`)); }
  }

  try{ rules.forEach((r) => { if(r.kind === "END" && r.action) r.action(env); }); }
  catch(e){ errOut.push(errLine(`awk: ${e.message}`)); }

  const lines = splitBody(env.out.join("")).map(outLine);
  return { lines, err: errOut };
}
