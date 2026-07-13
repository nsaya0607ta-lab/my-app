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

// ④「ベル」：基音＋倍音を重ねた軽く綺麗なベルの響き
function playBell(c){
  const t = c.currentTime;
  const master = c.createGain();
  master.gain.value = 1;
  master.connect(c.destination);
  [[1046, 1, 0.5], [2093, 0.35, 0.4], [3136, 0.18, 0.3]].forEach(([freq, amp, dur]) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.15 * amp, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  });
}

// ⑤「風鈴」：高めの澄んだ音が少しずつ間隔をあけて連なる涼しげな音
function playFurin(c){
  const t = c.currentTime;
  [[0, 1760], [0.06, 1568], [0.13, 2093]].forEach(([delay, freq]) => {
    const tt = t + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, tt);
    o.frequency.exponentialRampToValueAtTime(freq * 0.92, tt + 0.3);
    g.gain.setValueAtTime(0.0001, tt);
    g.gain.exponentialRampToValueAtTime(0.09, tt + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.32);
    o.connect(g); g.connect(c.destination);
    o.start(tt); o.stop(tt + 0.34);
  });
}

// ⑥「キラッ」：ゲーム風に短く駆け上がるきらめき音
function playSparkle(c){
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "triangle";
  o.frequency.setValueAtTime(900, t);
  o.frequency.exponentialRampToValueAtTime(2200, t + 0.1);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + 0.2);
}

// ⑦「レトロゲーム」：矩形波2音による8bit風クリック音
function playRetroGame(c){
  const t = c.currentTime;
  [[0, 660], [0.05, 990]].forEach(([delay, freq]) => {
    const tt = t + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(freq, tt);
    g.gain.setValueAtTime(0.09, tt);
    g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.045);
    o.connect(g); g.connect(c.destination);
    o.start(tt); o.stop(tt + 0.05);
  });
}

// ⑧「iPhone風」：シンプルで心地よい短いタップ音
function playIphone(c){
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(1200, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.13, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + 0.07);
}

// kindを省略した場合は現在の設定（S.tapSound）を使う。「mute」は常に無音。
const TAP_SOUND_PLAYERS = {
  drop: playDrop,
  click: playClick,
  bell: playBell,
  furin: playFurin,
  sparkle: playSparkle,
  retrogame: playRetroGame,
  iphone: playIphone,
};

export function playTapSound(kind){
  const key = kind || S.tapSound || "wood";
  if(key === "mute") return;
  const c = ctx();
  if(!c) return;
  try{
    (TAP_SOUND_PLAYERS[key] || playWood)(c);
  }catch(e){}
}
