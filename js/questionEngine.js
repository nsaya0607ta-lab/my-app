/* =========================================================================
   QuestionEngine — 資格横断で使える追加問題形式と回答判定
   ========================================================================= */

export const QUESTION_TYPES = Object.freeze({
  MULTIPLE_CHOICE: "multipleChoice",
  COMMAND_INPUT: "commandInput",
  OUTPUT_PREDICTION: "outputPrediction",
});

export const HINT_REWARD_RATE = 0.8;

export function questionTypeOf(question){
  if(!question || typeof question !== "object") return QUESTION_TYPES.MULTIPLE_CHOICE;
  return question.questionType || QUESTION_TYPES.MULTIPLE_CHOICE;
}

export function isCommandInputQuestion(question){
  return questionTypeOf(question) === QUESTION_TYPES.COMMAND_INPUT;
}

export function isOutputPredictionQuestion(question){
  return questionTypeOf(question) === QUESTION_TYPES.OUTPUT_PREDICTION;
}

export function normalizeShellInput(raw){
  return String(raw || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*([|><])\s*/g, " $1 ")
    .replace(/\s+/g, " ")
    .trim();
}

export function shellSplit(raw){
  const text = String(raw || "");
  const tokens = [];
  let current = "";
  let quote = null;
  let escaped = false;

  for(let i=0; i<text.length; i++){
    const ch = text[i];
    if(escaped){
      current += ch;
      escaped = false;
      continue;
    }
    if(ch === "\\"){
      escaped = true;
      continue;
    }
    if(quote){
      if(ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if(ch === "'" || ch === '"'){
      quote = ch;
      continue;
    }
    if(/\s/.test(ch)){
      if(current){ tokens.push(current); current = ""; }
      continue;
    }
    if("|><".includes(ch)){
      if(current){ tokens.push(current); current = ""; }
      if(ch === ">" && text[i+1] === ">"){ tokens.push(">>"); i++; }
      else tokens.push(ch);
      continue;
    }
    current += ch;
  }
  if(current) tokens.push(current);
  return tokens;
}

function stripOptionalSudo(tokens){
  const next = tokens.slice();
  if(next[0] === "sudo") next.shift();
  return next;
}

function compactMode(mode){
  const value = String(mode || "").replace(/^0+/, "");
  return value.padStart(3, "0").slice(-3);
}

function symbolicBits(chars){
  let value = 0;
  if(chars.includes("r")) value += 4;
  if(chars.includes("w")) value += 2;
  if(chars.includes("x")) value += 1;
  return value;
}

function symbolicModeToOctal(symbolic){
  const values = { u:null, g:null, o:null };
  const clauses = String(symbolic || "").split(",").map(s=>s.trim()).filter(Boolean);
  if(!clauses.length) return null;

  for(const clause of clauses){
    const match = /^([ugoa]+)=([rwx]*)$/.exec(clause);
    if(!match) return null;
    const classes = match[1].includes("a") ? ["u","g","o"] : [...new Set(match[1].split(""))];
    const bits = symbolicBits(match[2]);
    classes.forEach(cls => { if(cls in values) values[cls] = bits; });
  }
  if(Object.values(values).some(v => v === null)) return null;
  return `${values.u}${values.g}${values.o}`;
}

function validateChmod(question, input){
  const tokens = stripOptionalSudo(shellSplit(input));
  if(tokens[0] !== "chmod") return { correct:false, reason:"アクセス権を変更する chmod コマンドになっていません。" };

  let index = 1;
  while(tokens[index] && /^-[A-Za-z]+$/.test(tokens[index])) index++;
  const modeToken = tokens[index];
  const pathToken = tokens[index+1];
  if(!modeToken || !pathToken) return { correct:false, reason:"chmod のモードと対象ファイルを指定してください。" };

  const expectedPath = question.validator.path;
  if(pathToken !== expectedPath){
    return { correct:false, reason:`対象は ${expectedPath} です。入力では ${pathToken} が指定されています。` };
  }

  const actualMode = /^[0-7]{3,4}$/.test(modeToken)
    ? compactMode(modeToken)
    : symbolicModeToOctal(modeToken);
  if(!actualMode){
    return { correct:false, reason:"数値指定、または u=rw,go= のような確定的なシンボリック指定を使用してください。" };
  }
  const expectedMode = compactMode(question.validator.mode);
  return actualMode === expectedMode
    ? { correct:true, normalized:`chmod ${actualMode} ${expectedPath}`, reason:"数値指定とシンボリック指定を同じアクセス権として判定しました。" }
    : { correct:false, normalized:`chmod ${actualMode} ${expectedPath}`, reason:`設定されるアクセス権は ${actualMode} ですが、必要なのは ${expectedMode} です。` };
}

function validateGrep(question, input){
  const tokens = stripOptionalSudo(shellSplit(input));
  if(tokens[0] !== "grep") return { correct:false, reason:"文字列検索を行う grep コマンドを使用してください。" };
  const args = tokens.slice(1).filter(t => !t.startsWith("-"));
  const expectedPattern = String(question.validator.pattern);
  const expectedFile = String(question.validator.file);
  if(args[0] !== expectedPattern || args[1] !== expectedFile){
    return { correct:false, reason:`grepでは検索文字列 ${expectedPattern}、対象ファイル ${expectedFile} の順に指定してください。` };
  }
  return { correct:true, normalized:`grep ${expectedPattern} ${expectedFile}`, reason:"クォートの有無や安全な表示オプションの違いを許容しました。" };
}

function validateFind(question, input){
  const tokens = stripOptionalSudo(shellSplit(input));
  if(tokens[0] !== "find") return { correct:false, reason:"ファイルを条件検索する find コマンドを使用してください。" };
  const start = tokens[1];
  const nameIndex = tokens.indexOf("-name");
  if(start !== question.validator.startPath){
    return { correct:false, reason:`検索開始位置は ${question.validator.startPath} です。` };
  }
  if(nameIndex < 0 || tokens[nameIndex+1] !== question.validator.name){
    return { correct:false, reason:`-name '${question.validator.name}' の条件が必要です。` };
  }
  return { correct:true, normalized:`find ${start} -name '${question.validator.name}'`, reason:"引用符の種類が違っても、同じ検索条件として判定しました。" };
}

function tarFlags(tokens){
  const flags = new Set();
  tokens.forEach(token => {
    if(/^-[A-Za-z]+$/.test(token)) token.slice(1).split("").forEach(ch=>flags.add(ch));
    else if(/^[czxvft]+$/.test(token)) token.split("").forEach(ch=>flags.add(ch));
  });
  return flags;
}

function validateTar(question, input){
  const tokens = stripOptionalSudo(shellSplit(input));
  if(tokens[0] !== "tar") return { correct:false, reason:"アーカイブ作成には tar コマンドを使用してください。" };
  const flags = tarFlags(tokens.slice(1));
  for(const required of question.validator.flags){
    if(!flags.has(required)) return { correct:false, reason:`tar の ${required} オプションが不足しています。` };
  }
  let archiveIndex = -1;
  for(let i=1; i<tokens.length; i++){
    const token = tokens[i];
    if(token.startsWith("--file=")){
      if(token.slice(7) !== question.validator.archive){
        return { correct:false, reason:`出力先アーカイブは ${question.validator.archive} です。` };
      }
      archiveIndex = i;
      break;
    }
    if((/^-[A-Za-z]+$/.test(token) || /^[A-Za-z]+$/.test(token)) && token.replace(/^-/, "").includes("f")){
      archiveIndex = i + 1;
      break;
    }
  }
  if(archiveIndex < 0 || tokens[archiveIndex] !== question.validator.archive){
    return { correct:false, reason:`fオプションの直後に出力先アーカイブ ${question.validator.archive} を指定してください。` };
  }
  if(!tokens.slice(archiveIndex + 1).includes(question.validator.source)){
    return { correct:false, reason:`アーカイブ名の後ろに対象 ${question.validator.source} を指定してください。` };
  }
  return { correct:true, normalized:`tar -${question.validator.flags.join("")} ${question.validator.archive} ${question.validator.source}`, reason:"オプションをまとめた書き方と分けた書き方を同等として判定しました。" };
}

function validateCommandParts(question, input){
  const tokens = stripOptionalSudo(shellSplit(input));
  const validator = question.validator;
  if(tokens[0] !== validator.command){
    return { correct:false, reason:`使用するコマンドは ${validator.command} です。` };
  }
  const missing = (validator.requiredTokens || []).filter(t => !tokens.includes(t));
  if(missing.length){
    return { correct:false, reason:`必要な指定が不足しています: ${missing.join("、")}` };
  }
  const forbidden = (validator.forbiddenTokens || []).filter(t => tokens.includes(t));
  if(forbidden.length){
    return { correct:false, reason:`この問題では使用しない指定が含まれています: ${forbidden.join("、")}` };
  }
  return { correct:true, normalized:normalizeShellInput(input), reason:"必要なコマンドと引数がすべて含まれています。" };
}

function validateAcceptedAnswers(question, input){
  const normalized = normalizeShellInput(input);
  const accepted = (question.acceptedAnswers || []).map(normalizeShellInput);
  const index = accepted.indexOf(normalized);
  return index >= 0
    ? { correct:true, normalized:accepted[index], reason:"登録済みの同等コマンドと一致しました。" }
    : { correct:false, normalized, reason:"目的を満たすコマンドとして登録されていません。コマンド名・対象・オプションを確認してください。" };
}

export function validateCommandAnswer(question, input){
  const raw = String(input || "").trim();
  if(!raw) return { correct:false, normalized:"", reason:"コマンドを入力してください。" };
  const kind = question && question.validator && question.validator.kind;
  let result;
  if(kind === "chmod") result = validateChmod(question, raw);
  else if(kind === "grep") result = validateGrep(question, raw);
  else if(kind === "find") result = validateFind(question, raw);
  else if(kind === "tar") result = validateTar(question, raw);
  else if(kind === "commandParts") result = validateCommandParts(question, raw);
  else result = validateAcceptedAnswers(question || {}, raw);
  return { input:raw, ...result };
}

const COMMAND_HINTS = {
  chmod:"アクセス権を変更するコマンドを考え、所有者・グループ・その他の3区分に分けてください。",
  grep:"ファイル内の行から、指定した文字列を検索するコマンドです。",
  find:"検索を開始する場所と、名前を指定する条件を組み合わせます。",
  tar:"作成・gzip・出力ファイル指定の3つのオプションに注目してください。",
  df:"ファイルシステム全体の空き容量を見るコマンドです。",
  du:"特定のファイルやディレクトリが占める容量を見るコマンドです。",
  kill:"PIDを指定してプロセスへシグナルを送ります。",
};

export function hintForQuestion(question){
  if(question && question.hint) return question.hint;
  if(question && question.cmd && COMMAND_HINTS[question.cmd]) return COMMAND_HINTS[question.cmd];
  return "問題文の目的と対象を分け、各選択肢やコマンドが『何を』『どこに』作用させるか整理してみましょう。";
}

export function displayCorrectAnswer(question){
  if(!question) return "";
  if(isCommandInputQuestion(question)){
    return question.displayAnswer || (question.acceptedAnswers && question.acceptedAnswers[0]) || "";
  }
  const correct = Array.isArray(question.c) ? question.c : [question.a];
  return correct.map(index => question.o && question.o[index]).filter(Boolean).join(" / ");
}

export function commandForPlayground(question){
  if(!question) return "";
  if(isCommandInputQuestion(question)) return displayCorrectAnswer(question);
  return question.terminalInput || question.playgroundCommand || "";
}
