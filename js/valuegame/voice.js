/* =========================================================================
   🎤 価値観ゲームのボイスチャット（WebRTCのメッシュ接続）

   仕組み
   ・音声は参加者どうしのブラウザが直接やり取りする（P2P）。サーバーを
     経由しないので、会話の中身がFirestoreに保存されることはない。
   ・接続を始めるための情報（SDP・ICE候補）のやり取りだけを、ルームの
     signals サブコレクション経由で行う。届いた合図は処理した直後に
     削除するので、残り続けることはない。
   ・相手が増えるたびに1本ずつ接続を張る「メッシュ」方式。人数が増えると
     接続本数は急に増える（n人でn×(n-1)/2本）ため、端末とネットワークの
     負荷を考えて VOICE_MAX_PEERS 人までに制限する。それを超える人数の
     ルームでは、ボイスチャットの代わりにテキストチャットを使ってもらう。

   限界について（正直に）
   ・TURNサーバーを用意していないため、職場や学校など一部の厳しい
     ネットワークからは音声が繋がらないことがある。その場合は画面に
     その旨を表示し、テキストチャットへ誘導する（アプリ自体は止めない）。
   ・マイクの使用許可はブラウザがユーザーに尋ねる。断られた場合も
     エラーで止めず、「マイクなしで参加（聞くだけ）」に切り替える。

   DOM操作は行わない（状態が変わったら onChange で画面へ知らせる）。
   ========================================================================= */
import { state } from '../state.js';

// メッシュ方式で無理なく繋がる人数の上限
export const VOICE_MAX_PEERS = 6;

// 公開STUNサーバー（NAT越えの補助）。TURNは用意していない
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// 合図（シグナル）が残り続けないよう、この時間を過ぎたものは無視して削除する
const SIGNAL_TTL_MS = 60 * 1000;

const V = {
  active: false,
  roomId: "",
  myId: "",
  micOn: false,          // マイクを送っているか
  listenOnly: false,     // マイクは使えないが聞くことはできる状態
  localStream: null,
  peers: new Map(),      // uid -> { pc, stream, audioEl, state }
  mutedPeers: new Set(), // こちらでミュートした相手
  unsub: null,
  onChange: null,
  error: "",
  speaking: new Set(),   // いま声が出ている相手のuid
  levelTimer: null,
};

export function vgVoiceState(){
  return {
    active: V.active,
    micOn: V.micOn,
    listenOnly: V.listenOnly,
    error: V.error,
    peers: [...V.peers.entries()].map(([uid, p]) => ({
      uid,
      state: p.state,
      muted: V.mutedPeers.has(uid),
      speaking: V.speaking.has(uid),
    })),
  };
}

function emit(){ if(V.onChange) { try{ V.onChange(vgVoiceState()); }catch(e){} } }

function fb(){ return window.FirebaseSync || null; }
function db(){ return state.db || null; }

function sigId(){ return "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/* =========================================================================
   参加・退出
   ========================================================================= */

/* ボイスチャットに参加する。
   roomId … 対象のルーム
   peerIds … 同じルームにいる自分以外の参加者のuid配列
   onChange … 状態が変わったときに呼ばれるコールバック

   戻り値 { ok, message } */
export async function vgVoiceJoin(roomId, peerIds, onChange){
  if(V.active) return { ok: true };
  if(!db() || !fb()) return { ok: false, message: "通信の準備ができていません。" };
  if(!state.currentUserId) return { ok: false, message: "ボイスチャットにはログインが必要です。" };
  if(!window.RTCPeerConnection || !navigator.mediaDevices){
    return { ok: false, message: "このブラウザはボイスチャットに対応していません。テキストチャットをご利用ください。" };
  }
  const others = (peerIds || []).filter(id => id && id !== state.currentUserId);
  if(others.length + 1 > VOICE_MAX_PEERS){
    return { ok: false, message: `ボイスチャットは${VOICE_MAX_PEERS}人までです。テキストチャットをご利用ください。` };
  }

  V.roomId = roomId;
  V.myId = state.currentUserId;
  V.onChange = onChange || null;
  V.error = "";

  // マイクを取得する。断られた／マイクが無い場合も止めず「聞くだけ」で続ける
  try{
    V.localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    V.micOn = true;
    V.listenOnly = false;
  }catch(e){
    V.localStream = null;
    V.micOn = false;
    V.listenOnly = true;
    V.error = "マイクを使えないため、聞くだけの参加になります。";
  }

  V.active = true;
  startSignalListener();
  // 相手ごとに接続を張る。同時に発信し合って衝突しないよう、
  // uidの文字列比較で「小さい側が発信、大きい側が待ち受け」と決めておく
  others.forEach(uid => { if(V.myId < uid) connectTo(uid, true); else ensurePeer(uid); });
  startLevelMonitor();
  emit();
  return { ok: true };
}

export function vgVoiceLeave(){
  if(!V.active) return;
  V.active = false;
  if(V.unsub){ try{ V.unsub(); }catch(e){} V.unsub = null; }
  if(V.levelTimer){ clearInterval(V.levelTimer); V.levelTimer = null; }
  V.peers.forEach(p => closePeer(p));
  V.peers.clear();
  V.speaking.clear();
  V.mutedPeers.clear();
  if(V.localStream){
    V.localStream.getTracks().forEach(t => { try{ t.stop(); }catch(e){} });
    V.localStream = null;
  }
  V.micOn = false;
  V.listenOnly = false;
  V.error = "";
  emit();
}

function closePeer(p){
  if(!p) return;
  try{ p.pc.close(); }catch(e){}
  if(p.audioEl){
    try{ p.audioEl.pause(); p.audioEl.srcObject = null; p.audioEl.remove(); }catch(e){}
  }
  if(p.analyser){ try{ p.audioCtx.close(); }catch(e){} }
}

/* 自分のマイクのON/OFF。切っている間は音声トラックを止めるので、
   「切ったつもりで声が流れていた」ということが起きない */
export function vgVoiceToggleMic(){
  if(!V.active || !V.localStream) return V.micOn;
  V.micOn = !V.micOn;
  V.localStream.getAudioTracks().forEach(t => { t.enabled = V.micOn; });
  emit();
  return V.micOn;
}

/* 相手ごとのミュート（自分の耳だけの設定。相手には伝わらない） */
export function vgVoiceToggleMute(uid){
  if(V.mutedPeers.has(uid)) V.mutedPeers.delete(uid); else V.mutedPeers.add(uid);
  const p = V.peers.get(uid);
  if(p && p.audioEl) p.audioEl.muted = V.mutedPeers.has(uid);
  emit();
}

/* ルームの参加者が変わったときに呼ぶ。増えた人へは接続し、抜けた人の
   接続は片付ける */
export function vgVoiceSyncPeers(peerIds){
  if(!V.active) return;
  const want = new Set((peerIds || []).filter(id => id && id !== V.myId));
  // 抜けた人
  [...V.peers.keys()].forEach(uid => {
    if(!want.has(uid)){ closePeer(V.peers.get(uid)); V.peers.delete(uid); V.speaking.delete(uid); }
  });
  // 増えた人（発信側かどうかはuidの大小で決める）
  want.forEach(uid => {
    if(V.peers.has(uid)) return;
    if(V.myId < uid) connectTo(uid, true); else ensurePeer(uid);
  });
  emit();
}

/* =========================================================================
   ピア接続
   ========================================================================= */
function ensurePeer(uid){
  let p = V.peers.get(uid);
  if(p) return p;
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  p = { pc, stream: null, audioEl: null, state: "connecting" };
  V.peers.set(uid, p);

  if(V.localStream){
    V.localStream.getTracks().forEach(t => {
      try{ pc.addTrack(t, V.localStream); }catch(e){}
    });
  } else {
    // マイクが無くても受信はしたいので、受け取り専用の枠を用意する
    try{ pc.addTransceiver("audio", { direction: "recvonly" }); }catch(e){}
  }

  pc.onicecandidate = (e) => {
    if(e.candidate) sendSignal(uid, "ice", { candidate: e.candidate.toJSON() });
  };
  pc.ontrack = (e) => {
    p.stream = e.streams[0];
    attachAudio(uid, p);
  };
  pc.onconnectionstatechange = () => {
    p.state = pc.connectionState;
    if(pc.connectionState === "failed"){
      // TURNを持たないため、厳しいネットワークではここに落ちることがある。
      // アプリは止めず、画面に案内を出すだけにする
      V.error = "一部の相手と音声がつながりませんでした。ネットワークによっては接続できないことがあります。テキストチャットもご利用ください。";
    }
    emit();
  };
  return p;
}

// 受信した音声を再生する。<audio>は画面に出さない（音だけ鳴らす）
function attachAudio(uid, p){
  if(!p.audioEl){
    const el = document.createElement("audio");
    el.autoplay = true;
    el.playsInline = true;
    el.style.display = "none";
    document.body.appendChild(el);
    p.audioEl = el;
  }
  p.audioEl.srcObject = p.stream;
  p.audioEl.muted = V.mutedPeers.has(uid);
  // 自動再生がブロックされる環境向けに、失敗しても例外で止めない
  const play = p.audioEl.play();
  if(play && play.catch) play.catch(() => {});
  setupLevelAnalyser(uid, p);
  emit();
}

async function connectTo(uid, initiator){
  const p = ensurePeer(uid);
  if(!initiator) return p;
  try{
    const offer = await p.pc.createOffer();
    await p.pc.setLocalDescription(offer);
    sendSignal(uid, "offer", { sdp: p.pc.localDescription.toJSON ? p.pc.localDescription.toJSON() : { type: offer.type, sdp: offer.sdp } });
  }catch(e){
    console.error("voice offer failed:", e);
  }
  return p;
}

/* =========================================================================
   合図（シグナル）のやり取り
   ========================================================================= */
function signalsCol(){ return fb().collection(db(), "vgRooms", V.roomId, "signals"); }

async function sendSignal(to, kind, payload){
  if(!V.active) return;
  try{
    const id = sigId();
    await fb().setDoc(fb().doc(db(), "vgRooms", V.roomId, "signals", id), {
      from: V.myId, to, kind, payload,
      at: new Date().toISOString(),
    });
  }catch(e){ console.error("voice signal send failed:", e); }
}

function startSignalListener(){
  if(V.unsub){ try{ V.unsub(); }catch(e){} }
  try{
    const q = fb().query(signalsCol(), fb().where("to", "==", V.myId));
    V.unsub = fb().onSnapshot(q, (snap) => {
      snap.docChanges().forEach((chg) => {
        if(chg.type !== "added") return;
        const data = chg.doc.data() || {};
        // 処理したかどうかに関わらず必ず削除する（溜め込まない）
        fb().deleteDoc(fb().doc(db(), "vgRooms", V.roomId, "signals", chg.doc.id)).catch(() => {});
        if(Date.now() - new Date(data.at || 0).getTime() > SIGNAL_TTL_MS) return;  // 古い合図は無視
        handleSignal(data);
      });
    }, (err) => {
      console.error("voice signal listen failed:", err);
      V.error = "ボイスチャットの接続情報を受け取れませんでした。";
      emit();
    });
  }catch(e){ console.error("voice listener setup failed:", e); }
}

async function handleSignal(data){
  const from = data.from;
  if(!from || from === V.myId) return;
  const p = ensurePeer(from);
  try{
    if(data.kind === "offer"){
      await p.pc.setRemoteDescription(new RTCSessionDescription(data.payload.sdp));
      const answer = await p.pc.createAnswer();
      await p.pc.setLocalDescription(answer);
      sendSignal(from, "answer", { sdp: { type: answer.type, sdp: answer.sdp } });
    } else if(data.kind === "answer"){
      // 既に接続済みの場合に再適用すると例外になるため、待ち状態のときだけ適用する
      if(p.pc.signalingState === "have-local-offer"){
        await p.pc.setRemoteDescription(new RTCSessionDescription(data.payload.sdp));
      }
    } else if(data.kind === "ice"){
      if(p.pc.remoteDescription) await p.pc.addIceCandidate(data.payload.candidate);
      else (p.pendingIce ||= []).push(data.payload.candidate);
    }
    // 相手の情報が揃った後に、先に届いていたICE候補をまとめて適用する
    if(p.pendingIce && p.pc.remoteDescription){
      const list = p.pendingIce; p.pendingIce = null;
      for(const c of list){ try{ await p.pc.addIceCandidate(c); }catch(e){} }
    }
  }catch(e){
    console.error("voice signal handling failed:", e);
  }
}

/* =========================================================================
   誰がしゃべっているかの表示
   受信した音声の大きさを見て、話している人の枠を光らせるためのしきい値判定。
   音声そのものはどこにも保存しない。
   ========================================================================= */
function setupLevelAnalyser(uid, p){
  if(p.analyser || !p.stream) return;
  try{
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return;
    const ctx = new Ctx();
    const src = ctx.createMediaStreamSource(p.stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    p.audioCtx = ctx;
    p.analyser = analyser;
    p.levelBuf = new Uint8Array(analyser.frequencyBinCount);
  }catch(e){}
}

function startLevelMonitor(){
  if(V.levelTimer) clearInterval(V.levelTimer);
  V.levelTimer = setInterval(() => {
    if(!V.active) return;
    let changed = false;
    V.peers.forEach((p, uid) => {
      if(!p.analyser) return;
      p.analyser.getByteFrequencyData(p.levelBuf);
      let sum = 0;
      for(let i = 0; i < p.levelBuf.length; i++) sum += p.levelBuf[i];
      const avg = sum / p.levelBuf.length;
      const talking = avg > 12 && !V.mutedPeers.has(uid);
      if(talking && !V.speaking.has(uid)){ V.speaking.add(uid); changed = true; }
      else if(!talking && V.speaking.has(uid)){ V.speaking.delete(uid); changed = true; }
    });
    if(changed) emit();
  }, 400);
}
