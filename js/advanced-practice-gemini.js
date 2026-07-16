/* =========================================================================
   AdvancedPracticeGeminiFix
   - コマンド入力前の正解漏えいを防止
   - ヒント／プレイグラウンドを問題画面の最下部へ移動
   - 既存 /api/gemini/chat を再利用した可変ヒント・個別解説
   ========================================================================= */

import { S } from "./state.js";
import { app } from "./render.js";
import { grade } from "./core.js";
import {
  displayCorrectAnswer,
  isCommandInputQuestion,
  isOutputPredictionQuestion,
} from "./questionEngine.js";

const MAX_HINTS = 3;
const MAX_EXPLANATIONS = 3;
const REQUEST_TIMEOUT_MS = 35000;

let observedDeck = null;
let patchQueued = false;
const hintStates = new Map();
const explanationStates = new Map();

function esc(value){
  return String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;",
  }[ch]));
}

function ensureDeckState(){
  if(S.deck === observedDeck) return;
  observedDeck = S.deck;
  hintStates.clear();
  explanationStates.clear();
}

function currentQuestion(){
  return Array.isArray(S.deck) ? S.deck[S.idx] : null;
}

function stateKey(question, index=S.idx){
  return `${index}:${question && question.id ? question.id : "unknown"}`;
}

function clip(value, max=520){
  const text = String(value == null ? "" : value).trim();
  return text.length > max ? `${text.slice(0,max)}…` : text;
}

function todayContext(){
  const now = new Date();
  const pad = value => String(value).padStart(2,"0");
  return {
    date:`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`,
    weekday:["日","月","火","水","木","金","土"][now.getDay()],
    time:`${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}

async function askExistingGemini(message, onChunk){
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), REQUEST_TIMEOUT_MS);
  try{
    const res = await fetch("/api/gemini/chat", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({
        message:clip(message,1950),
        history:[],
        today:todayContext(),
        appContext:{ weather:null, todos:[], events:[], stocks:null },
      }),
      signal:controller.signal,
    });
    if(!res.ok){
      const data = await res.json().catch(()=>({}));
      throw new Error((data && data.error) || `request-failed-${res.status}`);
    }
    if(!res.body){
      const data = await res.json().catch(()=>({}));
      const text = String(data.reply || "").trim();
      if(!text) throw new Error("empty-response");
      if(onChunk) onChunk(text);
      return text;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let completed = false;

    while(true){
      const { done, value } = await reader.read();
      if(done) break;
      buffer += decoder.decode(value,{ stream:true });
      let newline;
      while((newline = buffer.indexOf("\n")) !== -1){
        const raw = buffer.slice(0,newline).trim();
        buffer = buffer.slice(newline+1);
        if(!raw) continue;
        let event;
        try{ event = JSON.parse(raw); }catch(_){ continue; }
        if(event.type === "chunk"){
          text += event.text || "";
          if(onChunk) onChunk(text);
        }else if(event.type === "done"){
          completed = true;
          if(!text) text = String(event.reply || "");
        }else if(event.type === "error"){
          throw new Error(event.error || "stream-error");
        }else if(event.type === "functionCall"){
          throw new Error("unexpected-function-call");
        }
      }
    }
    if(!completed && !text.trim()) throw new Error("stream-incomplete");
    if(onChunk) onChunk(text);
    return text.trim();
  }finally{
    clearTimeout(timer);
  }
}

function fallbackHint(question, attempt){
  const candidates = [];
  if(question && question.hint) candidates.push(question.hint);
  if(isCommandInputQuestion(question)){
    candidates.push("問題文を『何を変更するか』『対象は何か』『条件は何か』に分け、コマンド名・指定値・対象の順で組み立ててください。");
    candidates.push("入力後に、対象名とオプションの位置が入れ替わっていないか、余分な権限や条件を付けていないかを確認してください。");
  }else if(isOutputPredictionQuestion(question)){
    candidates.push("入力データの各行にコマンドの処理を順番に適用し、『残る行・取り出される列・並び順』を紙に書いて追ってみてください。");
    candidates.push("オプションなしの基本動作と、問題で指定されたオプションが出力のどこを変えるかを分けて考えてください。");
  }else{
    candidates.push("問題文の目的語と、各選択肢が実際に操作する対象を照合してください。");
    candidates.push("似たコマンド名ではなく、『対象がファイルか内容か』『結果が表示か変更か』で整理してください。");
  }
  return candidates[Math.min(Math.max(0,attempt-1),candidates.length-1)] || "問題文の条件を一つずつ分解して確認してください。";
}

function optionsForPrompt(question){
  if(!Array.isArray(question && question.o) || isCommandInputQuestion(question)) return "";
  return question.o.map((item,index)=>`${String.fromCharCode(65+index)}. ${clip(item,120)}`).join("\n");
}

function hintPrompt(question, attempt, previous){
  const type = isCommandInputQuestion(question) ? "コマンド入力" : (isOutputPredictionQuestion(question) ? "実行結果予想" : "選択問題");
  const levelInstruction = attempt === 1
    ? "概念や用途に気づけるヒント"
    : attempt === 2
      ? "構文・処理順序・出力の読み方に気づける別角度のヒント"
      : "最後に自分で確認すべきチェックポイントを示す強めのヒント";
  return [
    "あなたはLPIC Level1の丁寧な講師です。次の問題について、回答前の学習者へヒントを1つだけ返してください。",
    `問題形式: ${type}`,
    `問題: ${clip(question && question.q,650)}`,
    optionsForPrompt(question) ? `選択肢:\n${optionsForPrompt(question)}` : "",
    previous.length ? `すでに表示したヒント:\n${previous.map((item,index)=>`${index+1}. ${clip(item,220)}`).join("\n")}` : "",
    `今回は第${attempt}段階なので、${levelInstruction}にしてください。`,
    "必須条件:",
    "- 完成した正解コマンド、正解のコマンド名、正解選択肢の記号や文言を直接書かない",
    "- 既存ヒントと同じ表現・同じ観点を繰り返さない",
    "- 1〜3文、120文字程度の分かりやすい日本語にする",
    "- 前置きや『答えは』という表現は不要。ヒント本文だけを返す",
  ].filter(Boolean).join("\n");
}

function setHintBox(box, title, text, footer){
  if(!box) return;
  box.hidden = false;
  box.innerHTML = `<strong>${esc(title)}</strong><span class="ap-gemini-text"></span>${footer ? `<small>${esc(footer)}</small>` : ""}`;
  const textEl = box.querySelector(".ap-gemini-text");
  if(textEl) textEl.textContent = text || "";
}

function moveQuizToolsToBottom(){
  const tools = app && app.querySelector(".ap-quiz-tools");
  const hintBox = app && app.querySelector(".ap-hint-box");
  const commitButton = app && app.querySelector("[data-commit]");
  const navigation = commitButton && commitButton.parentElement;
  if(!tools || !hintBox || !navigation) return;
  if(hintBox.previousElementSibling !== navigation) navigation.insertAdjacentElement("afterend",hintBox);
  if(tools.previousElementSibling !== hintBox) hintBox.insertAdjacentElement("afterend",tools);
  tools.classList.add("ap-quiz-tools-bottom");
}

function removeAnswerLeaks(){
  const input = document.getElementById("ap-command-input");
  if(input){
    input.placeholder = "コマンドを入力してください";
    input.removeAttribute("title");
  }
  document.querySelectorAll(".ap-playground-overlay [data-ap-fill]").forEach(button=>button.remove());
}

function wireGeminiHint(question){
  const button = app && app.querySelector("[data-ap-hint]");
  const box = app && app.querySelector("[data-ap-hint-box]");
  if(!button || !box || button.dataset.apGeminiBound === "1") return;
  button.dataset.apGeminiBound = "1";
  const key = stateKey(question);
  const state = hintStates.get(key) || { hints:[], busy:false, penaltyMarked:false };
  hintStates.set(key,state);
  const originalHandler = button.onclick;

  const refresh = () => {
    if(state.hints.length){
      setHintBox(box,`Geminiヒント ${state.hints.length}/${MAX_HINTS}`,state.hints[state.hints.length-1],"ヒントを使った問題で正解した場合、獲得EXPが20%減ります。");
    }else if(!state.busy){
      box.hidden = true;
      box.innerHTML = "";
    }
    button.disabled = state.busy || state.hints.length >= MAX_HINTS;
    button.textContent = state.busy
      ? "🧠 Geminiが考え中…"
      : state.hints.length >= MAX_HINTS
        ? "🧠 3段階のヒントを表示済み"
        : state.hints.length
          ? "🧠 別のヒントをもらう"
          : "🧠 Geminiにヒントをもらう";
  };

  if(state.hints.length) refresh();
  else if(!state.penaltyMarked){
    // 旧固定ヒントが描画されていても、ユーザー操作前には見せない。
    box.hidden = true;
    box.innerHTML = "";
    button.disabled = false;
    button.textContent = "🧠 Geminiにヒントをもらう";
  }

  button.onclick = async () => {
    if(state.busy || state.hints.length >= MAX_HINTS) return;
    if(!state.penaltyMarked){
      // 既存のEXP減額管理へ「この問題でヒントを使った」事実だけを登録する。
      if(typeof originalHandler === "function") originalHandler.call(button);
      state.penaltyMarked = true;
    }
    state.busy = true;
    const attempt = state.hints.length + 1;
    setHintBox(box,`Geminiヒント ${attempt}/${MAX_HINTS}`,"問題に合った別角度のヒントを考えています…","正解そのものは表示しません。");
    refresh();
    try{
      let streaming = "";
      const answer = await askExistingGemini(hintPrompt(question,attempt,state.hints), partial => {
        streaming = partial;
        setHintBox(box,`Geminiヒント ${attempt}/${MAX_HINTS}`,partial || "考えています…","正解そのものは表示しません。");
      });
      const finalText = answer || streaming || fallbackHint(question,attempt);
      state.hints.push(finalText);
    }catch(error){
      state.hints.push(fallbackHint(question,attempt));
    }finally{
      state.busy = false;
      refresh();
    }
  };
}

function chosenAnswerFromCard(question, index, card){
  if(isCommandInputQuestion(question)){
    const entered = card && card.querySelector(".ap-command-review code");
    return entered ? entered.textContent.trim() : "未入力";
  }
  const picks = (S.picks && S.picks[index]) || [];
  if(!picks.length) return "未回答";
  return picks.map(choiceIndex => {
    const label = String.fromCharCode(65+choiceIndex);
    return `${label}. ${(question.o || [])[choiceIndex] || ""}`;
  }).join(" / ");
}

function explanationPrompt(question, userAnswer, correctAnswer, isCorrect, attempt, previous){
  return [
    "あなたはLPIC Level1の実務経験がある講師です。採点後の学習者へ、問題に即した個別解説をしてください。",
    `問題: ${clip(question && question.q,520)}`,
    optionsForPrompt(question) ? `選択肢:\n${optionsForPrompt(question)}` : "",
    `ユーザーの回答: ${clip(userAnswer,300)}`,
    `正解: ${clip(correctAnswer,300)}`,
    `採点結果: ${isCorrect ? "正解" : "不正解"}`,
    question && question.e ? `既存の基本解説: ${clip(question.e,300)}` : "",
    previous.length ? `前回までのGemini解説の要点: ${clip(previous[previous.length-1],420)}` : "",
    `今回は第${attempt}回の説明です。前回と異なる例え・観点を使ってください。`,
    "次の順番で、短い見出し付きで説明してください:",
    "1. なぜ正解になるか",
    "2. ユーザー回答のどこを直すべきか（正解なら良かった点）",
    "3. 実務で使う場面",
    "4. LPICで間違えない覚え方",
    "断定できない情報は作らず、完成コマンドや正解は採点後なので表示して構いません。日本語で350文字程度にしてください。",
  ].filter(Boolean).join("\n");
}

function wireGeminiExplanation(card, question, index){
  const actions = card && card.querySelector(".ap-review-actions");
  if(!actions || actions.querySelector("[data-ap-gemini-explain]")) return;
  const key = stateKey(question,index);
  const state = explanationStates.get(key) || { answers:[], busy:false };
  explanationStates.set(key,state);
  const response = document.createElement("div");
  response.className = "ap-gemini-explanation";
  response.hidden = !state.answers.length;
  if(state.answers.length) response.textContent = state.answers[state.answers.length-1];
  actions.parentElement.insertBefore(response,actions);

  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("data-ap-gemini-explain",String(index));
  actions.insertBefore(button,actions.firstChild);

  const refresh = () => {
    button.disabled = state.busy || state.answers.length >= MAX_EXPLANATIONS;
    button.textContent = state.busy
      ? "✨ Geminiが解説を作成中…"
      : state.answers.length >= MAX_EXPLANATIONS
        ? "✨ Gemini解説を3種類表示済み"
        : state.answers.length
          ? "✨ 別の説明をGeminiにもらう"
          : "✨ Geminiに個別解説してもらう";
    if(state.answers.length){
      response.hidden = false;
      response.textContent = state.answers[state.answers.length-1];
    }
  };
  refresh();

  button.onclick = async () => {
    if(state.busy || state.answers.length >= MAX_EXPLANATIONS) return;
    state.busy = true;
    response.hidden = false;
    response.textContent = "Geminiが、あなたの回答に合わせて解説を作っています…";
    refresh();
    const userAnswer = chosenAnswerFromCard(question,index,card);
    const correctAnswer = displayCorrectAnswer(question);
    const result = grade(question,(S.picks && S.picks[index]) || []);
    const attempt = state.answers.length + 1;
    try{
      let streaming = "";
      const answer = await askExistingGemini(
        explanationPrompt(question,userAnswer,correctAnswer,result.full,attempt,state.answers),
        partial => {
          streaming = partial;
          response.textContent = partial || "考えています…";
        }
      );
      state.answers.push(answer || streaming || "解説を取得できませんでした。");
    }catch(error){
      response.textContent = "Geminiの解説を取得できませんでした。通信状態を確認して、もう一度お試しください。";
    }finally{
      state.busy = false;
      refresh();
    }
  };
}

function patchQuiz(){
  const question = currentQuestion();
  if(!question || !app) return;
  removeAnswerLeaks();
  moveQuizToolsToBottom();
  wireGeminiHint(question);
}

function patchReview(){
  if(!app || !Array.isArray(S.deck)) return;
  app.querySelectorAll(".review-q").forEach((card,index)=>{
    const question = S.deck[index];
    if(question) wireGeminiExplanation(card,question,index);
  });
}

function patchCurrentScreen(){
  if(!app || S.cert !== "lpic1") return;
  ensureDeckState();
  removeAnswerLeaks();
  if(S.screen === "quiz") patchQuiz();
  else if(S.screen === "review") patchReview();
}

function schedulePatch(){
  if(patchQueued) return;
  patchQueued = true;
  requestAnimationFrame(()=>{
    patchQueued = false;
    patchCurrentScreen();
  });
}

if(app){
  new MutationObserver(schedulePatch).observe(app,{ childList:true, subtree:true });
  new MutationObserver(()=>removeAnswerLeaks()).observe(document.body,{ childList:true, subtree:true });
  schedulePatch();
}
