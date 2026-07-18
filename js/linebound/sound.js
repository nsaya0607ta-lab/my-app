/* =========================================================================
   🎯 ラインバウンド：効果音（Web Audio APIでその場合成、音声ファイル不要）
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

export function sfxDraw(){
  if(muted()) return;
  const c = ctx(); if(!c) return;
  try{ tone(c, { freq: 900, dur: 0.03, type: "triangle", gain: 0.05 }); }catch(e){}
}

export function sfxLaunch(){
  if(muted()) return;
  const c = ctx(); if(!c) return;
  try{ tone(c, { freq: 300, from: 260, to: 640, dur: 0.16, type: "sawtooth", gain: 0.11 }); }catch(e){}
}

export function sfxHit(kind){
  if(muted()) return;
  const c = ctx(); if(!c) return;
  try{
    if(kind === "rubber") tone(c, { freq: 700, from: 500, to: 900, dur: 0.09, type: "sine", gain: 0.12 });
    else tone(c, { freq: 260, from: 320, to: 180, dur: 0.06, type: "square", gain: 0.08 });
  }catch(e){}
}

export function sfxGoal(){
  if(muted()) return;
  const c = ctx(); if(!c) return;
  try{
    [[0, 880], [0.08, 1108], [0.16, 1318]].forEach(([delay, freq]) => tone(c, { freq, dur: 0.22, type: "sine", gain: 0.14, delay }));
  }catch(e){}
}

export function sfxFail(){
  if(muted()) return;
  const c = ctx(); if(!c) return;
  try{ tone(c, { freq: 220, from: 220, to: 90, dur: 0.32, type: "sawtooth", gain: 0.1 }); }catch(e){}
}

export function sfxCoin(){
  if(muted()) return;
  const c = ctx(); if(!c) return;
  try{
    tone(c, { freq: 1200, dur: 0.05, type: "square", gain: 0.09 });
    tone(c, { freq: 1600, dur: 0.09, type: "square", gain: 0.09, delay: 0.05 });
  }catch(e){}
}
