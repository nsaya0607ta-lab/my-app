/* ===== タップ音（音声ファイル不要・Web Audio APIでその場合成） =====
   S.tapSound（"wood"|"drop"|"click"|"mute"）に応じた効果音を鳴らす。
   AudioContextはユーザー操作（タップ）内で生成・resumeすることで
   iOS Safariの自動再生制限を回避する。 */
import { S } from './state.js';

let _ctx = null;
function ctx(){
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return null;
  if(!_ctx) _ctx = new AC();
  if(_ctx.state === "suspended") _ctx.resume();
  return _ctx;
}

function noiseBuffer(c, seconds){
  const buf = c.createBuffer(1, Math.max(1, Math.round(c.sampleRate * seconds)), c.sampleRate);
  const d = buf.getChannelData(0);
  for(let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// ①「ポポッ」：ウッドブロック／木琴のような、低域寄りでマイルドな短い音
function playWood(c){
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  const f = c.createBiquadFilter();
  f.type = "lowpass"; f.frequency.value = 1600; f.Q.value = 0.7;
  o.type = "triangle";
  o.frequency.setValueAtTime(500, t);
  o.frequency.exponentialRampToValueAtTime(340, t + 0.09);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.15, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  o.connect(f); f.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + 0.16);
}

// ②「コトッ」：水滴が落ちたようなクリアな高音から余韻を残して降下
function playDrop(c){
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(1500, t);
  o.frequency.exponentialRampToValueAtTime(480, t + 0.17);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.13, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + 0.37);
}

// ③「プチッ」：極短いノイズバーストをハイパスに通した微小クリック音
function playClick(c){
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 0.02);
  const f = c.createBiquadFilter();
  f.type = "highpass"; f.frequency.value = 2600;
  const g = c.createGain();
  g.gain.setValueAtTime(0.16, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.024);
  src.connect(f); f.connect(g); g.connect(c.destination);
  src.start(t); src.stop(t + 0.03);
}

// kindを省略した場合は現在の設定（S.tapSound）を使う。「mute」は常に無音。
export function playTapSound(kind){
  const key = kind || S.tapSound || "wood";
  if(key === "mute") return;
  const c = ctx();
  if(!c) return;
  try{
    if(key === "drop") playDrop(c);
    else if(key === "click") playClick(c);
    else playWood(c);
  }catch(e){}
}
