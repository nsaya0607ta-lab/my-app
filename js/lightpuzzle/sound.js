/* =========================================================================
   💡 ライト消しパズル：効果音（Web Audio APIでその場合成、音声ファイル不要）
   既存のタップ音設定（S.tapSound）に従い、"mute" のときは一切再生しない。
   ========================================================================= */
import { S } from '../state.js';

let _ctx = null;
function ctx(){
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return null;
  if(!_ctx) _ctx = new AC();
  if(_ctx.state === "suspended") _ctx.resume();
  return _ctx;
}

function muted(){ return (S.tapSound || "wood") === "mute"; }

function tone(c, { freq, from, to, dur, type = "sine", gain = 0.12, delay = 0 }){
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if(from != null && to != null){
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

// ライト切り替え音：マスをタップして反転させたとき
export function sfxToggle(){
  if(muted()) return;
  const c = ctx(); if(!c) return;
  try{ tone(c, { freq: 720, from: 640, to: 860, dur: 0.07, type: "triangle", gain: 0.1 }); }catch(e){}
}

// 操作を戻す音：1手戻す
export function sfxUndo(){
  if(muted()) return;
  const c = ctx(); if(!c) return;
  try{ tone(c, { freq: 420, from: 460, to: 300, dur: 0.09, type: "sine", gain: 0.09 }); }catch(e){}
}

// ステージクリア音
export function sfxClear(){
  if(muted()) return;
  const c = ctx(); if(!c) return;
  try{
    [[0, 880], [0.09, 1108], [0.18, 1318], [0.27, 1568]].forEach(([delay, freq]) => tone(c, { freq, dur: 0.22, type: "sine", gain: 0.13, delay }));
  }catch(e){}
}

// コイン獲得音
export function sfxCoin(){
  if(muted()) return;
  const c = ctx(); if(!c) return;
  try{
    tone(c, { freq: 1200, dur: 0.05, type: "square", gain: 0.09 });
    tone(c, { freq: 1600, dur: 0.09, type: "square", gain: 0.09, delay: 0.05 });
  }catch(e){}
}
