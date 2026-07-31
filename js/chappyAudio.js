/* =========================================================================
   🏠 チャッピーハウス：BGM・環境音（⑭）

   ・音声ファイルは使わず、Web Audio API でその場で合成する（既存のタップ音と
     同じ方針）。追加のダウンロードが発生しないので通信量にも優しい。
   ・時間帯（朝／昼／夕方／夜）・天気（雨／雪）・季節イベントで音色と
     テンポが変わる、ゆるやかなアンビエント。
   ・既定はOFF。ユーザーがチャッピーハウスの設定でONにしたときだけ鳴る
     （iOS/Androidの自動再生制限に合わせ、必ずタップ操作の中で開始する）。
   ・画面を離れる・タブが非表示になると自動で止まる。
   ========================================================================= */

const MASTER_VOLUME = 0.055;   // 控えめ。BGMが主役にならないように

/* 時間帯・天気ごとの音の性格
   scale … 使う音（MIDIノート番号）／ tempo … 1音の間隔(ms)
   wave  … 波形／ cutoff … ローパスの明るさ／ pad … 和音を鳴らすか        */
const PROFILES = {
  morning: { scale: [72, 74, 76, 79, 81, 84], tempo: 1500, wave: "triangle", cutoff: 2600, pad: [48, 55, 64], padWave: "sine",     detune: 4 },
  noon:    { scale: [69, 72, 74, 76, 79, 81], tempo: 1300, wave: "triangle", cutoff: 2900, pad: [45, 52, 60], padWave: "sine",     detune: 5 },
  evening: { scale: [67, 69, 72, 74, 76, 79], tempo: 1900, wave: "sine",     cutoff: 1700, pad: [43, 50, 59], padWave: "triangle", detune: 7 },
  night:   { scale: [62, 65, 67, 69, 72, 74], tempo: 2600, wave: "sine",     cutoff: 1100, pad: [38, 45, 53], padWave: "sine",     detune: 3 },
  rain:    { scale: [64, 67, 69, 71, 74],     tempo: 2200, wave: "sine",     cutoff: 1300, pad: [40, 47, 55], padWave: "sine",     detune: 6, noise: "rain" },
  snow:    { scale: [72, 76, 79, 83, 84],     tempo: 2800, wave: "sine",     cutoff: 2200, pad: [48, 55, 60], padWave: "sine",     detune: 2, noise: "snow" },
  event:   { scale: [72, 76, 79, 81, 84, 88], tempo: 1200, wave: "triangle", cutoff: 3200, pad: [48, 55, 64], padWave: "triangle", detune: 6, bell: true },
};

let ctx = null;
let master = null;
let padNodes = [];
let noiseNode = null;
let arpTimer = null;
let currentKey = null;
let playing = false;

function midiToFreq(n){ return 440 * Math.pow(2, (n - 69) / 12); }

function audioCtx(){
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return null;
  if(!ctx) ctx = new AC();
  if(ctx.state === "suspended"){ try{ ctx.resume(); }catch(e){} }
  return ctx;
}

/* 時間帯・天気・イベントから、いま鳴らすべきプロファイルを決める。
   優先順位は 雨/雪 ＞ イベント ＞ 時間帯 */
export function chappyAudioProfileFor({ slot, weather, event } = {}){
  if(weather === "rain") return "rain";
  if(weather === "snow") return "snow";
  if(event) return "event";
  return PROFILES[slot] ? slot : "noon";
}

export function chappyAudioIsPlaying(){ return playing; }
export function chappyAudioCurrent(){ return currentKey; }

export function chappyAudioStart(profileKey){
  const c = audioCtx();
  if(!c) return false;
  if(playing && currentKey === profileKey) return true;
  teardown();

  const p = PROFILES[profileKey] || PROFILES.noon;
  currentKey = profileKey;
  playing = true;

  master = c.createGain();
  master.gain.setValueAtTime(0.0001, c.currentTime);
  master.gain.exponentialRampToValueAtTime(MASTER_VOLUME, c.currentTime + 2.2);
  master.connect(c.destination);

  buildPad(c, p);
  if(p.noise) buildNoise(c, p);
  startArp(c, p);
  return true;
}

export function chappyAudioStop(){
  if(!ctx || !playing){ teardown(); return; }
  const c = ctx;
  try{
    master.gain.cancelScheduledValues(c.currentTime);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), c.currentTime);
    master.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.9);
  }catch(e){}
  const old = { master, padNodes, noiseNode };
  playing = false;
  currentKey = null;
  clearInterval(arpTimer); arpTimer = null;
  master = null; padNodes = []; noiseNode = null;
  setTimeout(() => {
    old.padNodes.forEach(n => { try{ n.stop(); }catch(e){} try{ n.disconnect(); }catch(e){} });
    if(old.noiseNode){ try{ old.noiseNode.stop(); }catch(e){} try{ old.noiseNode.disconnect(); }catch(e){} }
    if(old.master){ try{ old.master.disconnect(); }catch(e){} }
  }, 1000);
}

// 鳴らしたまま時間帯だけ変わったときの切り替え（いったん止めて鳴らし直す）
export function chappyAudioSwitch(profileKey){
  if(!playing || currentKey === profileKey) return;
  chappyAudioStop();
  setTimeout(() => { if(!playing) chappyAudioStart(profileKey); }, 1100);
}

function teardown(){
  clearInterval(arpTimer); arpTimer = null;
  padNodes.forEach(n => { try{ n.stop(); }catch(e){} try{ n.disconnect(); }catch(e){} });
  padNodes = [];
  if(noiseNode){ try{ noiseNode.stop(); }catch(e){} try{ noiseNode.disconnect(); }catch(e){} noiseNode = null; }
  if(master){ try{ master.disconnect(); }catch(e){} master = null; }
  playing = false;
  currentKey = null;
}

/* ---- 低くゆっくり揺れる和音（ベッド） ---- */
function buildPad(c, p){
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = p.cutoff;
  filter.Q.value = 0.5;
  filter.connect(master);

  p.pad.forEach((note, i) => {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = p.padWave;
    osc.frequency.value = midiToFreq(note);
    osc.detune.value = (i - 1) * (p.detune || 4);
    g.gain.value = 0.12 / p.pad.length * (i === 0 ? 1.4 : 1);

    // ゆっくりした呼吸（LFOで音量を揺らす）
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 0.045 + i * 0.011;
    lfoGain.gain.value = g.gain.value * 0.55;
    lfo.connect(lfoGain); lfoGain.connect(g.gain);

    osc.connect(g); g.connect(filter);
    osc.start(); lfo.start();
    padNodes.push(osc, lfo);
  });
}

/* ---- 雨・雪の環境音（ノイズをフィルタで整える） ---- */
function buildNoise(c, p){
  const len = Math.round(c.sampleRate * 2);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for(let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const f = c.createBiquadFilter();
  const g = c.createGain();
  if(p.noise === "rain"){
    f.type = "bandpass"; f.frequency.value = 1200; f.Q.value = 0.4;
    g.gain.value = 0.5;
  } else {
    // 雪は「しんとした空気」を表す、ごく薄い高域のノイズ
    f.type = "highpass"; f.frequency.value = 5200;
    g.gain.value = 0.16;
  }
  src.connect(f); f.connect(g); g.connect(master);
  src.start();
  noiseNode = src;
}

/* ---- ぽろん…と鳴るメロディ（アルペジオ） ---- */
function startArp(c, p){
  let idx = Math.floor(Math.random() * p.scale.length);
  const playNote = () => {
    if(!playing || !master) return;
    if(document.visibilityState !== "visible") return;   // 裏に回ったら鳴らさない
    // 隣の音へゆらゆら動く（跳びすぎない旋律にする）
    idx = Math.max(0, Math.min(p.scale.length - 1, idx + (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.75 ? 1 : 2)));
    const t = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = p.cutoff;
    osc.type = p.wave;
    osc.frequency.value = midiToFreq(p.scale[idx]);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    osc.connect(f); f.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + 1.9);

    // イベント中はときどき鈴の音を重ねる
    if(p.bell && Math.random() < 0.28){
      const b = c.createOscillator();
      const bg = c.createGain();
      b.type = "sine";
      b.frequency.value = midiToFreq(p.scale[p.scale.length - 1] + 12);
      bg.gain.setValueAtTime(0.0001, t);
      bg.gain.exponentialRampToValueAtTime(0.1, t + 0.02);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      b.connect(bg); bg.connect(master);
      b.start(t); b.stop(t + 1.5);
    }
  };
  playNote();
  arpTimer = setInterval(playNote, p.tempo);
}

/* =========================================================================
   ごほうび演出の効果音（⑬）。BGMのON/OFFに関わらず鳴らす短い音
   ========================================================================= */
export function chappySfx(kind){
  const c = audioCtx();
  if(!c) return;
  const t = c.currentTime;
  const seqs = {
    levelup: [72, 76, 79, 84],
    reward:  [79, 84],
    rare:    [72, 76, 79, 83, 86, 91],
    pop:     [84],
  };
  const notes = seqs[kind] || seqs.pop;
  notes.forEach((n, i) => {
    const osc = c.createOscillator();
    const g = c.createGain();
    const at = t + i * 0.085;
    osc.type = "triangle";
    osc.frequency.value = midiToFreq(n);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.12, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);
    osc.connect(g); g.connect(c.destination);
    osc.start(at); osc.stop(at + 0.36);
  });
}
