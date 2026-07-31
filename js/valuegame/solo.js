/* =========================================================================
   🃏 1人用モード（チャッピーがAIプレイヤーとして参加する練習モード）

   ゲームの進行状態だけを持つ層。DOM操作は screen.js の責務。

   数字の扱い：1人用はすべて端末内で完結するため、他プレイヤーの数字が
   通信に乗ることはそもそも無い。ただし「画面から見えない」ことは大事なので、
   ・AIの数字は state 内に持つが、画面へ渡すのは回答文だけ
   ・自分の数字も、長押ししている間だけ表示する（screen.js側）
   としている。

   ゲーム途中でページを更新しても続きから戻れるよう、進行状態は
   localStorage へ保存する（vgSaveSession / vgRestoreSession）。
   ========================================================================= */
import { state } from '../state.js';
import { VG_MAX_ROUNDS, vgDifficulty } from './config.js';
import { vgAiAnswer, vgAiReaction } from './ai.js';
import { vgCheckOrder, vgDealNumbers, vgValueGap } from './engine.js';
import { vgPickTopic, vgTopicById } from '../data/valuegame-topics.js';

const SESSION_KEY_BASE = "valuegame_session_v1";

function sessionKey(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `${SESSION_KEY_BASE}::${uid}`;
}

export function vgNewGameId(){
  return "vg" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/* チャッピーAIの名前・アイコン・表情。
   icon … 一覧の丸いアバターに出す1文字（幅が一定なので崩れない）
   face … リアクションの吹き出しに出す顔文字（横に長いので一覧には使わない） */
const AI_PROFILES = [
  { name: "チャッピー",     icon: "🐶", face: "(◍•ᴗ•◍)" },
  { name: "ちびチャピ",     icon: "🐱", face: "(・ω・)"   },
  { name: "まるチャピ",     icon: "🐰", face: "(๑•̀ᴗ•́)" },
  { name: "そらチャピ",     icon: "🐻", face: "( ˘ω˘ )"  },
  { name: "こはるチャピ",   icon: "🐼", face: "(๑˃̵ᴗ˂̵)" },
  { name: "ゆきチャピ",     icon: "🦊", face: "(◕‿◕)"    },
  { name: "なつチャピ",     icon: "🐨", face: "(*'ω'*)"  },
  { name: "きらチャピ",     icon: "🐯", face: "(★‿★)"    },
  { name: "のんびりチャピ", icon: "🐹", face: "(´-ω-`)"  },
];

/* 新しい1人用ゲームを開始する。
   opts: { aiCount, difficulty, rounds, playerName } */
export function vgStartSolo(opts){
  const o = opts || {};
  const aiCount = Math.max(1, Math.min(AI_PROFILES.length, Number(o.aiCount) || 2));
  const diff = vgDifficulty(o.difficulty);
  const rounds = Math.max(1, Math.min(VG_MAX_ROUNDS, Number(o.rounds) || 3));

  const players = [{ id: "me", name: o.playerName || "あなた", isAI: false, icon: "🙂", face: "" }];
  for(let i = 0; i < aiCount; i++){
    const p = AI_PROFILES[i % AI_PROFILES.length];
    players.push({ id: `ai${i}`, name: p.name, isAI: true, icon: p.icon, face: p.face });
  }

  const session = {
    gameId: vgNewGameId(),
    mode: "solo",
    difficulty: diff.key,
    players,
    rounds,
    round: 1,
    lives: diff.lives,
    maxLives: diff.lives,
    timeLimit: diff.timeLimit,
    clearedRounds: 0,
    answeredRounds: 0,
    usedTopicIds: [],
    perfect: true,
    finished: false,
    success: false,
    // ラウンドの状態
    phase: "answer",       // "answer" | "order" | "reveal" | "gameover"
    topicId: null,
    numbers: {},           // { playerId: number } ※画面へは自分のぶんしか渡さない
    answers: {},           // { playerId: 回答文 }
    order: [],             // プレイヤーが並べた順（小さいと思う順）
    lastResult: null,
    reactions: [],         // チャッピーのリアクション文（新しい順）
    myAnswers: [],         // 戦績用（自分の回答履歴）
    startedAt: new Date().toISOString(),
  };
  startRound(session);
  vgSaveSession(session);
  return session;
}

/* ラウンドの準備：お題を選び、全員に数字を配る */
function startRound(s){
  const topic = vgPickTopic(s.usedTopicIds);
  s.topicId = topic.id;
  s.usedTopicIds.push(topic.id);
  const nums = vgDealNumbers(s.players.length);
  s.numbers = {};
  s.players.forEach((p, i) => { s.numbers[p.id] = nums[i]; });
  s.answers = {};
  s.order = [];
  s.phase = "answer";
  s.lastResult = null;
  s.reactions = [];
  s.roundStartedAt = Date.now();
}

export function vgCurrentTopic(s){ return vgTopicById(s.topicId); }

// 自分の数字（長押し表示のときだけ画面へ渡す）
export function vgMyNumber(s){ return s.numbers.me; }

/* プレイヤーが回答を確定する → AIも回答し、並べ替えフェーズへ進む */
export function vgSubmitMyAnswer(s, text){
  if(s.phase !== "answer") return s;
  const answer = String(text || "").trim().slice(0, 40);
  if(!answer) return s;
  s.answers.me = answer;

  const diff = vgDifficulty(s.difficulty);
  const used = [answer];
  s.players.forEach(p => {
    if(!p.isAI) return;
    const a = vgAiAnswer(s.numbers[p.id], s.topicId, diff.aiClarity, used);
    used.push(a);
    s.answers[p.id] = a;
  });

  // チャッピーからプレイヤーへの短いリアクション（数字には基づかない相づち）
  const reactor = s.players.find(p => p.isAI);
  if(reactor) s.reactions = [{ name: reactor.name, face: reactor.face, text: vgAiReaction() }];

  // 並べ替えの初期順はランダム（正解の並びが最初から出ないように）
  s.order = shuffle(s.players.map(p => p.id));
  s.phase = "order";
  s.answeredRounds += 1;
  vgSaveSession(s);
  return s;
}

function shuffle(a){
  const list = a.slice();
  for(let i = list.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    const t = list[i]; list[i] = list[j]; list[j] = t;
  }
  return list;
}

/* 並べ替え：index から to へカードを移動する */
export function vgMoveCard(s, fromIndex, toIndex){
  if(s.phase !== "order") return s;
  const list = s.order.slice();
  if(fromIndex < 0 || fromIndex >= list.length) return s;
  const to = Math.max(0, Math.min(list.length - 1, toIndex));
  const [item] = list.splice(fromIndex, 1);
  list.splice(to, 0, item);
  s.order = list;
  vgSaveSession(s);
  return s;
}

/* 確定して数字を公開する */
export function vgRevealRound(s){
  if(s.phase !== "order") return s;
  const check = vgCheckOrder(s.order, s.numbers);
  const gap = vgValueGap(check.ranks);
  const topic = vgCurrentTopic(s);
  if(check.ok){
    s.clearedRounds += 1;
  } else {
    s.lives = Math.max(0, s.lives - 1);
    s.perfect = false;
  }
  s.lastResult = {
    ok: check.ok,
    gap,
    rows: check.ranks
      .map(r => {
        const p = s.players.find(x => x.id === r.playerId) || {};
        return {
          playerId: r.playerId,
          name: p.name || "",
          isAI: !!p.isAI,
          icon: p.icon || "🙂",
          answer: s.answers[r.playerId] || "",
          number: r.number,
          guessRank: r.guessRank + 1,
          trueRank: r.trueRank + 1,
        };
      })
      .sort((a, b) => a.number - b.number),
  };
  // 自分の回答を戦績へ残す（数字は公開済みなので保存してよい）
  s.myAnswers.push({
    topicId: s.topicId,
    topicTitle: topic ? topic.title : "",
    number: s.numbers.me,
    answer: s.answers.me || "",
  });
  s.phase = "reveal";
  vgSaveSession(s);
  return s;
}

/* 次のラウンドへ。ゲームの終了条件もここで判定する */
export function vgNextRound(s){
  if(s.phase !== "reveal") return s;
  if(s.lives <= 0){
    s.finished = true;
    s.success = false;
    s.phase = "gameover";
    vgSaveSession(s);
    return s;
  }
  if(s.round >= s.rounds){
    s.finished = true;
    // 成功＝「ライフが0になる前に規定ラウンドを最後までやり切った」。
    // 途中で順番を外していてもライフが残っていればクリア扱い（協力ゲーム
    // としての標準的なルール）。一度もライフを失わなかった場合だけ
    // s.perfect が true のまま残り、パーフェクトとして扱われる。
    // サーバー側の判定（api/valuegame/reward.js）と同じ基準
    s.success = s.lives > 0;
    s.phase = "gameover";
    vgSaveSession(s);
    return s;
  }
  s.round += 1;
  startRound(s);
  vgSaveSession(s);
  return s;
}

/* 制限時間切れ：回答が間に合わなかった場合はライフを1つ失って次へ進む */
export function vgTimeUp(s){
  if(s.phase === "reveal" || s.phase === "gameover") return s;
  s.lives = Math.max(0, s.lives - 1);
  s.perfect = false;
  s.lastResult = { ok: false, gap: 0, timeUp: true, rows: [] };
  s.phase = "reveal";
  vgSaveSession(s);
  return s;
}

/* =========================================================================
   セッションの保存・復元（ゲーム中にページを更新しても続きから遊べる）
   ========================================================================= */
export function vgSaveSession(s){
  try{
    if(!s || s.phase === "gameover"){ localStorage.removeItem(sessionKey()); return; }
    localStorage.setItem(sessionKey(), JSON.stringify(s));
  }catch(e){}
}

export function vgRestoreSession(){
  try{
    const raw = JSON.parse(localStorage.getItem(sessionKey()) || "null");
    if(!raw || !raw.gameId || raw.mode !== "solo") return null;
    // 24時間以上前のセッションは破棄する
    if(raw.startedAt && (Date.now() - new Date(raw.startedAt).getTime()) > 86400000){
      localStorage.removeItem(sessionKey());
      return null;
    }
    return raw;
  }catch(e){ return null; }
}

export function vgClearSession(){
  try{ localStorage.removeItem(sessionKey()); }catch(e){}
}
