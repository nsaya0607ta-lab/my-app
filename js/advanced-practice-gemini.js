/* =========================================================================
   AdvancedPracticeGeminiFix
   - コマンド入力前の正解漏えいを防止
   - プレイグラウンドツールを問題画面の最下部へ移動
   ========================================================================= */

import { S } from "./state.js";
import { app } from "./render.js";

let patchQueued = false;

function moveQuizToolsToBottom(){
  const tools = app && app.querySelector(".ap-quiz-tools");
  const commitButton = app && app.querySelector("[data-commit]");
  const navigation = commitButton && commitButton.parentElement;
  if(!tools || !navigation) return;
  if(tools.previousElementSibling !== navigation) navigation.insertAdjacentElement("afterend",tools);
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

function patchCurrentScreen(){
  if(!app || S.cert !== "lpic1") return;
  removeAnswerLeaks();
  if(S.screen === "quiz") moveQuizToolsToBottom();
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
