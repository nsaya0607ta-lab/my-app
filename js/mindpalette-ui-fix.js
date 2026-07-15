import { S } from './state.js';

const BODY_CLASS = 'mp-screen-clean-header';
const CANVAS_CLASS = 'mp-screen-mind-palette';
const EXPLORER_CLASS = 'mp-screen-mind-palette-folders';
let applyQueued = false;

function setIconOnlyBack(button, label){
  if(!button) return;
  if(button.textContent.trim() !== '←') button.textContent = '←';
  button.classList.add('mp-icon-back');
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
}

function applyMindPaletteUi(){
  applyQueued = false;
  const screen = S && S.screen;
  const isCanvas = screen === 'mind-palette';
  const isExplorer = screen === 'mind-palette-folders';
  const isMindPalette = isCanvas || isExplorer;

  document.body.classList.toggle(BODY_CLASS, isMindPalette);
  document.body.classList.toggle(CANVAS_CLASS, isCanvas);
  document.body.classList.toggle(EXPLORER_CLASS, isExplorer);

  if(isCanvas){
    const head = document.querySelector('#app .q-head');
    if(head){
      head.classList.add('mp-compact-head');
      const title = head.querySelector('.q-count');
      if(title){
        title.hidden = true;
        title.setAttribute('aria-hidden', 'true');
      }
      setIconOnlyBack(head.querySelector('.quit[data-go="select"]'), 'ホームへ戻る');
    }
  }

  if(isExplorer){
    setIconOnlyBack(document.getElementById('mpx-back'), 'マインドパレットへ戻る');
  }
}

function queueApply(){
  if(applyQueued) return;
  applyQueued = true;
  queueMicrotask(applyMindPaletteUi);
}

const app = document.getElementById('app');
if(app){
  new MutationObserver(queueApply).observe(app, { childList: true, subtree: true });
}

window.addEventListener('pageshow', queueApply);
applyMindPaletteUi();
