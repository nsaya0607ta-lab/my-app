/* =========================================================================
   SpeakerRecognitionService
   =========================================================================
   「録音した音声から、登録済みメンバーの誰の声か」を判定する部分だけを
   切り出した差し替え可能なサービス層。

   現状はサーバーもAIモデルも使わず、ブラウザのWeb Audio APIだけで
   完結する簡易フィンガープリント（帯域別エネルギー＋ゼロ交差率のベクトル
   ＋コサイン類似度によるマッチング）で実装している。
   将来、話者識別AI（サーバーAPIや専用モデル）へ差し替える際は、
   この2関数 extractVoiceprint / identifySpeaker の中身とMATCH_THRESHOLDだけを
   置き換えれば良く、呼び出し側（VoiceprintManager・introQuiz.js）は
   一切変更不要になるように設計している。
   ========================================================================= */

// log間隔の帯域中心周波数（人の声の基本周波数〜フォルマント帯をおおまかにカバー）
const BAND_HZ = [120, 200, 340, 550, 900, 1400, 2200, 3500];

// コサイン類似度がこれ未満なら「登録者の誰とも一致しない」として扱う。
// 簡易フィンガープリントゆえの暫定値。AI実装へ差し替える際に調整・撤廃してよい
const MATCH_THRESHOLD = 0.82;

export function isSupported() {
  return !!(window.AudioContext || window.webkitAudioContext) && !!window.OfflineAudioContext;
}

async function decodeAudio(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const Ctor = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctor();
  try {
    return await ctx.decodeAudioData(arrayBuffer);
  } finally {
    try { ctx.close(); } catch (e) {}
  }
}

function monoSamples(audioBuffer) {
  if (audioBuffer.numberOfChannels === 1) return audioBuffer.getChannelData(0);
  const len = audioBuffer.length;
  const out = new Float32Array(len);
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < len; i++) out[i] += data[i] / audioBuffer.numberOfChannels;
  }
  return out;
}

function rms(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (samples.length || 1));
}

function zeroCrossingRate(samples) {
  let crossings = 0;
  for (let i = 1; i < samples.length; i++) {
    if ((samples[i - 1] >= 0) !== (samples[i] >= 0)) crossings++;
  }
  return crossings / (samples.length || 1);
}

async function bandEnergy(audioBuffer, hz) {
  const OfflineCtor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const offline = new OfflineCtor(1, audioBuffer.length, audioBuffer.sampleRate);
  const source = offline.createBufferSource();
  source.buffer = audioBuffer;
  const filter = offline.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = hz;
  filter.Q.value = 1.2;
  source.connect(filter);
  filter.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();
  return rms(rendered.getChannelData(0));
}

function normalize(vec) {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // 双方とも単位ベクトルに正規化済みなので内積=コサイン類似度
}

// 録音した音声から特徴ベクトルを抽出する（登録時・判定時の両方で使う共通処理）
export async function extractVoiceprint(audioBlob) {
  if (!isSupported()) throw new Error("web-audio-unsupported");
  const audioBuffer = await decodeAudio(audioBlob);
  const mono = monoSamples(audioBuffer);
  const bandVals = await Promise.all(BAND_HZ.map((hz) => bandEnergy(audioBuffer, hz)));
  const vector = normalize([...bandVals, zeroCrossingRate(mono), rms(mono)]);
  return {
    vector,
    sampleRate: audioBuffer.sampleRate,
    duration: audioBuffer.duration,
    capturedAt: new Date().toISOString(),
  };
}

// candidates: VoiceprintManager.list() で得られる登録者配列（各要素に.voiceprint.vectorを含む）
// 戻り値: { registrantId, name, score } | null（該当者なし・判定不能）
export async function identifySpeaker(audioBlob, candidates) {
  const usable = (candidates || []).filter((c) => c && c.voiceprint && Array.isArray(c.voiceprint.vector));
  if (!usable.length || !isSupported()) return null;
  let probe;
  try { probe = await extractVoiceprint(audioBlob); } catch (e) { return null; }
  let best = null, bestScore = -Infinity;
  usable.forEach((c) => {
    const score = cosineSimilarity(probe.vector, c.voiceprint.vector);
    if (score > bestScore) { bestScore = score; best = c; }
  });
  if (!best || bestScore < MATCH_THRESHOLD) return null;
  return { registrantId: best.id, name: best.name, score: bestScore };
}

export const SpeakerRecognitionService = { isSupported, extractVoiceprint, identifySpeaker };
