/* =========================================================================
   🧭🛠⏱ ディレクトリ探検の拡張機能（探索ミッション／時間経過・イベント／
   障害対応モード）の状態管理・永続化を一手に引き受けるモジュール。

   ・DOM操作は一切行わない（画面描画は js/render.js 側の責務）。
   ・保存方式は既存の js/playground/scenarios/progressStore.js と同じ
     「ログインユーザーIDごとにキーを分けたlocalStorage」方式に合わせる。
   ・実際のOS・実際のファイル・実際のコマンドには一切アクセスしない、
     すべてアプリ内で完結する疑似データに対してのみ動作する。
   ========================================================================= */
import { S, state } from './state.js';
import { saveCoins } from './core.js';
import { LPIC1_DIR_FS } from './data/lpic1-directory-explorer.js';
import { DIRX_MISSIONS, missionRewardForHints } from './data/dirx-missions.js';
import { DIRX_EVENTS, DIRX_SEVERITY_RANK } from './data/dirx-events.js';
import { DIRX_SCENARIOS } from './data/dirx-scenarios.js';

const STORE_VERSION = 1;
const MAX_HISTORY = 200;
const MAX_TERMINAL_LINES = 60;
const AUTO_TICK_MINUTES = 5;      // 自動進行1回あたりの疑似Linux内経過時間
const AUTO_TICK_MS = 75000;       // 自動進行の実時間間隔（低頻度：約75秒に1回チェック）
const MANUAL_TICK_MINUTES = 30;   // 「時間を進める」ボタン1回あたりの経過時間
const FREQUENCY_MULT = { low: 0.5, normal: 1, high: 1.8 };

function storeKey(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `dirxProgress_v1::${uid}`;
}

function defaultData(){
  return {
    v: STORE_VERSION,
    exp: 0,
    missions: { completed: [], hintsUsedById: {} },
    scenarios: { completed: [] },
    clock: { day: 1, minutes: 8 * 60 },   // 疑似Linuxは朝8:00から開始
    settings: { autoAdvance: true, frequency: "low" },
    events: { history: [], nextSeq: 1 },
    active: {
      missionId: null,
      missionState: { hintsRevealed: 0 },
      incidentId: null,
      incidentState: null,
    },
  };
}

function normalize(raw){
  const base = defaultData();
  if(!raw || typeof raw !== "object") return base;
  if(Array.isArray(raw.missions?.completed)) base.missions.completed = raw.missions.completed.filter(x=>typeof x==="string");
  if(raw.missions?.hintsUsedById && typeof raw.missions.hintsUsedById === "object") base.missions.hintsUsedById = raw.missions.hintsUsedById;
  if(Array.isArray(raw.scenarios?.completed)) base.scenarios.completed = raw.scenarios.completed.filter(x=>typeof x==="string");
  if(typeof raw.exp === "number" && isFinite(raw.exp)) base.exp = Math.max(0, raw.exp);
  if(raw.clock && typeof raw.clock.minutes === "number") base.clock.minutes = ((raw.clock.minutes % 1440) + 1440) % 1440;
  if(raw.clock && typeof raw.clock.day === "number" && raw.clock.day > 0) base.clock.day = raw.clock.day;
  if(raw.settings && typeof raw.settings === "object"){
    if(raw.settings.autoAdvance === true || raw.settings.autoAdvance === false) base.settings.autoAdvance = raw.settings.autoAdvance;
    if(["low","normal","high"].includes(raw.settings.frequency)) base.settings.frequency = raw.settings.frequency;
  }
  if(raw.events && Array.isArray(raw.events.history)) base.events.history = raw.events.history.slice(-MAX_HISTORY);
  if(raw.events && typeof raw.events.nextSeq === "number") base.events.nextSeq = raw.events.nextSeq;
  if(raw.active && typeof raw.active === "object"){
    if(typeof raw.active.missionId === "string" || raw.active.missionId === null) base.active.missionId = raw.active.missionId;
    if(raw.active.missionState && typeof raw.active.missionState === "object") base.active.missionState = { hintsRevealed: Math.max(0, raw.active.missionState.hintsRevealed|0) };
    if(typeof raw.active.incidentId === "string" || raw.active.incidentId === null) base.active.incidentId = raw.active.incidentId;
    if(raw.active.incidentState && typeof raw.active.incidentState === "object") base.active.incidentState = raw.active.incidentState;
  }
  // 起動中に一覧データからミッション／シナリオが削除された場合に備え、存在しないIDは破棄する
  if(base.active.missionId && !DIRX_MISSIONS.some(m=>m.id===base.active.missionId)) { base.active.missionId = null; base.active.missionState = { hintsRevealed: 0 }; }
  if(base.active.incidentId && !DIRX_SCENARIOS.some(s=>s.id===base.active.incidentId)) { base.active.incidentId = null; base.active.incidentState = null; }
  return base;
}

let cache = null;
let identityToken;

function load(){
  if(cache) return cache;
  try{ cache = normalize(JSON.parse(localStorage.getItem(storeKey()) || "null")); }
  catch(e){ cache = defaultData(); }
  return cache;
}
function persist(){
  try{ localStorage.setItem(storeKey(), JSON.stringify(cache)); }catch(e){}
}

// ログインユーザーの切替を検知し、前の人の進捗が一瞬でも見えないようキャッシュを破棄する
export function dirxHandleIdentityChange(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  if(identityToken === uid) return;
  const isFirstRun = identityToken === undefined;
  identityToken = uid;
  if(isFirstRun) return;
  cache = null;
  stopAutoTimer();
  startAutoTimerIfNeeded();
}

/* ===== 共通：AC・探索EXPの付与 ===== */
function grantReward(ac, exp){
  S.coins = (S.coins || 0) + Math.max(0, ac|0);
  saveCoins(S.coins);
  const st = load();
  st.exp = Math.max(0, st.exp + Math.max(0, exp|0));
  persist();
}

export function dirxExplorationExp(){ return load().exp; }

/* ===== 疑似ファイルシステム上のノード検索（正誤判定・不正解時の説明に使用） ===== */
export function dirxFindNode(segs){
  let node = LPIC1_DIR_FS;
  for(const seg of (segs||[])){
    if(!node || node.type !== "dir" || !node.children[seg]) return null;
    node = node.children[seg];
  }
  return node;
}
function segsEqual(a, b){
  if(!a || !b || a.length !== b.length) return false;
  return a.every((s,i)=>s===b[i]);
}

/* =========================================================================
   🧭 探索ミッション
   ========================================================================= */
export function dirxListMissions(){
  const st = load();
  return DIRX_MISSIONS.map(m => ({
    mission: m,
    completed: st.missions.completed.includes(m.id),
    active: st.active.missionId === m.id,
  }));
}
export function dirxIsMissionCompleted(id){ return load().missions.completed.includes(id); }
export function dirxActiveMissionId(){ return load().active.missionId; }
export function dirxActiveMission(){
  const st = load();
  if(!st.active.missionId) return null;
  const mission = DIRX_MISSIONS.find(m=>m.id===st.active.missionId);
  if(!mission) return null;
  return { mission, hintsRevealed: st.active.missionState.hintsRevealed || 0 };
}
export function dirxStartMission(id){
  const mission = DIRX_MISSIONS.find(m=>m.id===id);
  if(!mission) return false;
  const st = load();
  st.active.missionId = id;
  st.active.missionState = { hintsRevealed: 0 };
  persist();
  return true;
}
export function dirxEndMission(){
  const st = load();
  st.active.missionId = null;
  st.active.missionState = { hintsRevealed: 0 };
  persist();
}
export function dirxRevealMissionHint(){
  const st = load();
  const mission = DIRX_MISSIONS.find(m=>m.id===st.active.missionId);
  if(!mission) return null;
  const cur = st.active.missionState.hintsRevealed || 0;
  if(cur >= mission.hints.length) return { hints: mission.hints.slice(0, cur), exhausted: true };
  st.active.missionState.hintsRevealed = cur + 1;
  persist();
  return { hints: mission.hints.slice(0, cur+1), exhausted: (cur+1)>=mission.hints.length };
}

// segsで選ばれたファイル／ディレクトリをミッションの回答として判定する
export function dirxSubmitMissionAnswer(segs){
  const st = load();
  const mission = DIRX_MISSIONS.find(m=>m.id===st.active.missionId);
  if(!mission) return { ok:false, reason:"no-active-mission" };
  const node = dirxFindNode(segs);
  const alreadyCompleted = st.missions.completed.includes(mission.id);
  const correct = segsEqual(segs, mission.answerPath);
  if(!correct){
    return { ok:true, correct:false, mission, node, path:segs };
  }
  const hintsUsed = st.active.missionState.hintsRevealed || 0;
  const { ac, exp } = missionRewardForHints(mission, hintsUsed);
  let rewarded = false;
  if(!alreadyCompleted){
    st.missions.completed.push(mission.id);
    grantReward(ac, exp);
    rewarded = true;
    persist();
  }
  return { ok:true, correct:true, mission, node, path:segs, rewardAC: rewarded?ac:0, rewardExp: rewarded?exp:0, alreadyCompleted, hintsUsed };
}

/* =========================================================================
   ⏱ 時間経過・イベント
   ========================================================================= */
const eventListeners = [];
export function dirxOnEvent(cb){ if(typeof cb === "function") eventListeners.push(cb); }
function emitEvent(ev){ eventListeners.forEach(cb => { try{ cb(ev); }catch(e){} }); }

export function dirxGetClock(){
  const st = load();
  const h = String(Math.floor(st.clock.minutes/60)).padStart(2,"0");
  const m = String(st.clock.minutes%60).padStart(2,"0");
  return { day: st.clock.day, minutes: st.clock.minutes, label: `${h}:${m}`, totalMinutes: (st.clock.day-1)*1440 + st.clock.minutes };
}
export function dirxTotalMinutes(){
  const st = load();
  return (st.clock.day-1)*1440 + st.clock.minutes;
}
export function dirxGetSettings(){ return { ...load().settings }; }
export function dirxSetSettings(partial){
  const st = load();
  if(partial && (partial.autoAdvance === true || partial.autoAdvance === false)) st.settings.autoAdvance = partial.autoAdvance;
  if(partial && ["low","normal","high"].includes(partial.frequency)) st.settings.frequency = partial.frequency;
  persist();
  startAutoTimerIfNeeded();
}
export function dirxEventHistory(){
  return load().events.history.slice().sort((a,b)=>b.atTotalMinutes-a.atTotalMinutes);
}
export function dirxUnreadCount(){
  return load().events.history.filter(e=>!e.read).length;
}
export function dirxGetSystemStatus(){
  const unresolved = load().events.history.filter(e=>!e.resolved);
  let maxRank = -1;
  unresolved.forEach(e=>{ const r = DIRX_SEVERITY_RANK[e.severity] ?? 0; if(r>maxRank) maxRank = r; });
  if(maxRank >= 3) return { key:"critical", label:"重大" };
  if(maxRank >= 2) return { key:"warning", label:"警告" };
  if(maxRank >= 1) return { key:"notice", label:"注意" };
  return { key:"normal", label:"正常" };
}
export function dirxMarkEventRead(id){
  const st = load();
  const ev = st.events.history.find(e=>e.id===id);
  if(ev && !ev.read){ ev.read = true; persist(); }
}
export function dirxMarkAllEventsRead(){
  const st = load();
  let changed = false;
  st.events.history.forEach(e=>{ if(!e.read){ e.read = true; changed = true; } });
  if(changed) persist();
}
export function dirxMarkEventResolved(id){
  const st = load();
  const ev = st.events.history.find(e=>e.id===id);
  if(ev && !ev.resolved){ ev.resolved = true; persist(); }
}

function weightedPickEvent(){
  const total = DIRX_EVENTS.reduce((s,e)=>s+(e.weight||1), 0);
  let r = Math.random()*total;
  for(const e of DIRX_EVENTS){
    r -= (e.weight||1);
    if(r <= 0) return e;
  }
  return DIRX_EVENTS[DIRX_EVENTS.length-1];
}

function spawnEvent(){
  const st = load();
  const tpl = weightedPickEvent();
  const ev = {
    id: `ev_${st.events.nextSeq++}`,
    templateId: tpl.id,
    message: tpl.message,
    severity: tpl.severity,
    relatedPath: tpl.relatedPath ? tpl.relatedPath.slice() : null,
    atTotalMinutes: dirxTotalMinutes(),
    atLabel: dirxGetClock().label,
    read: false,
    resolved: false,
  };
  st.events.history.push(ev);
  if(st.events.history.length > MAX_HISTORY) st.events.history = st.events.history.slice(-MAX_HISTORY);
  persist();
  emitEvent(ev);
  return ev;
}

function rollEvent(baseChance){
  const freq = load().settings.frequency;
  const mult = FREQUENCY_MULT[freq] ?? 1;
  const chance = Math.min(0.9, baseChance * mult);
  if(Math.random() < chance) return spawnEvent();
  return null;
}

// 「時間を進める」ボタン：まとまった時間を進め、比較的高めの確率でイベントを1件判定する
export function dirxAdvanceTime(minutes){
  const st = load();
  const add = minutes || MANUAL_TICK_MINUTES;
  const totalBefore = dirxTotalMinutes();
  const newTotal = totalBefore + add;
  st.clock.day = Math.floor(newTotal/1440) + 1;
  st.clock.minutes = newTotal % 1440;
  persist();
  const ev = rollEvent(0.35);
  return { clock: dirxGetClock(), event: ev };
}

let autoTimer = null;
function autoTick(){
  const st = load();
  if(!st.settings.autoAdvance) return;
  const totalBefore = dirxTotalMinutes();
  const newTotal = totalBefore + AUTO_TICK_MINUTES;
  st.clock.day = Math.floor(newTotal/1440) + 1;
  st.clock.minutes = newTotal % 1440;
  persist();
  rollEvent(0.12);
}
export function startAutoTimerIfNeeded(){
  if(autoTimer) return;
  autoTimer = setInterval(autoTick, AUTO_TICK_MS);
}
export function stopAutoTimer(){
  if(autoTimer){ clearInterval(autoTimer); autoTimer = null; }
}

/* =========================================================================
   🛠 障害対応モード
   ========================================================================= */
export function dirxListScenarios(){
  const st = load();
  return DIRX_SCENARIOS.map(s => ({
    scenario: s,
    completed: st.scenarios.completed.includes(s.id),
    active: st.active.incidentId === s.id,
  }));
}
export function dirxIsScenarioCompleted(id){ return load().scenarios.completed.includes(id); }
export function dirxActiveIncidentId(){ return load().active.incidentId; }
export function dirxActiveIncident(){
  const st = load();
  if(!st.active.incidentId) return null;
  const scenario = DIRX_SCENARIOS.find(s=>s.id===st.active.incidentId);
  if(!scenario) return null;
  return { scenario, runtime: st.active.incidentState };
}
export function dirxStartIncident(id){
  const scenario = DIRX_SCENARIOS.find(s=>s.id===id);
  if(!scenario) return false;
  const st = load();
  st.active.incidentId = id;
  st.active.incidentState = {
    investigated: [],
    causeId: null,
    causeCorrect: null,
    fixId: null,
    completed: false,
    hintsRevealed: 0,
    startedAtTotalMinutes: dirxTotalMinutes(),
    terminal: [],
    usedCommands: [],
  };
  persist();
  return true;
}
export function dirxEndIncident(){
  const st = load();
  st.active.incidentId = null;
  st.active.incidentState = null;
  persist();
}
// 現在アクティブなシナリオの調査対象のうち、指定パス(segs)に一致するものを返す
export function dirxFindTargetForPath(segs){
  const active = dirxActiveIncident();
  if(!active || !segs) return null;
  return active.scenario.investigateTargets.find(t => t.path && segsEqual(t.path, segs)) || null;
}
export function dirxIsInvestigated(targetId){
  const st = load();
  return !!(st.active.incidentState && st.active.incidentState.investigated.includes(targetId));
}
export function dirxMarkInvestigated(targetId){
  const st = load();
  if(!st.active.incidentState) return;
  if(!st.active.incidentState.investigated.includes(targetId)){
    st.active.incidentState.investigated.push(targetId);
    persist();
  }
}
export function dirxAllInvestigated(){
  const active = dirxActiveIncident();
  if(!active) return false;
  return active.scenario.investigateTargets.every(t => dirxIsInvestigated(t.id));
}
export function dirxRevealIncidentHint(){
  const st = load();
  if(!st.active.incidentState) return null;
  st.active.incidentState.hintsRevealed = (st.active.incidentState.hintsRevealed||0) + 1;
  persist();
  return st.active.incidentState.hintsRevealed;
}
export function dirxChooseCause(optionId){
  const active = dirxActiveIncident();
  if(!active) return null;
  const opt = active.scenario.causeOptions.find(o=>o.id===optionId);
  if(!opt) return null;
  const st = load();
  st.active.incidentState.causeId = optionId;
  st.active.incidentState.causeCorrect = !!opt.correct;
  persist();
  return opt;
}
export function dirxChooseFix(optionId){
  const active = dirxActiveIncident();
  if(!active) return null;
  const opt = active.scenario.fixOptions.find(o=>o.id===optionId);
  if(!opt) return null;
  const st = load();
  st.active.incidentState.fixId = optionId;
  let cleared = false;
  if(opt.correct && st.active.incidentState.causeCorrect && !st.active.incidentState.completed){
    st.active.incidentState.completed = true;
    if(!st.scenarios.completed.includes(active.scenario.id)){
      st.scenarios.completed.push(active.scenario.id);
      grantReward(active.scenario.rewardAC, active.scenario.rewardExp);
      cleared = true;
    }
    // 関連するイベント（例：SSH停止イベント）を解決済みにする
    (active.scenario.resolvesEventIds||[]).forEach(tid=>{
      st.events.history.filter(e=>e.templateId===tid && !e.resolved).forEach(e=>{ e.resolved = true; });
    });
  }
  persist();
  return { option: opt, cleared, completed: st.active.incidentState.completed };
}
export function dirxIncidentElapsedMinutes(){
  const active = dirxActiveIncident();
  if(!active) return 0;
  return Math.max(0, dirxTotalMinutes() - active.runtime.startedAtTotalMinutes);
}
export function dirxIncidentSummary(){
  const active = dirxActiveIncident();
  if(!active) return null;
  const { scenario, runtime } = active;
  const cause = scenario.causeOptions.find(o=>o.id===runtime.causeId) || null;
  const fix = scenario.fixOptions.find(o=>o.id===runtime.fixId) || null;
  return {
    scenario, cause, fix,
    elapsedMinutes: dirxIncidentElapsedMinutes(),
    hintsUsed: runtime.hintsRevealed || 0,
    usedCommands: runtime.usedCommands || [],
    rewardAC: runtime.completed ? scenario.rewardAC : 0,
    rewardExp: runtime.completed ? scenario.rewardExp : 0,
  };
}

/* ---- 疑似ターミナル（障害対応モード専用の最小限のコマンド実行） ---- */
const SUPPORTED_COMMANDS = new Set([
  "pwd","ls","cd","cat","grep","df -h","du -sh","lsblk","blkid","mount","mount -a","systemctl status","systemctl restart","ping",
]);
function commandFamily(raw){
  const t = raw.trim().replace(/\s+/g," ");
  if(t === "pwd" || t === "ls" || t.startsWith("cd")) return t.split(" ")[0];
  if(t.startsWith("cat ")) return "cat";
  if(t.startsWith("grep ")) return "grep";
  if(t.startsWith("df -h")) return "df -h";
  if(t.startsWith("du -sh")) return "du -sh";
  if(t === "lsblk") return "lsblk";
  if(t === "blkid") return "blkid";
  if(t.startsWith("mount -a")) return "mount -a";
  if(t === "mount") return "mount";
  if(t.startsWith("systemctl status")) return "systemctl status";
  if(t.startsWith("systemctl restart")) return "systemctl restart";
  if(t.startsWith("ping")) return "ping";
  return null;
}

// 障害対応モード中に、ユーザーが入力した疑似コマンド1行を実行する
export function dirxRunIncidentCommand(raw){
  const cmd = (raw||"").trim().replace(/\s+/g," ");
  const active = dirxActiveIncident();
  if(!cmd) return { output: "" };
  if(!active){
    return { output: "現在、障害対応中のシナリオがありません。" };
  }
  const st = load();
  const rt = st.active.incidentState;
  const family = commandFamily(cmd);
  let output;
  if(!family || !SUPPORTED_COMMANDS.has(family)){
    output = "この学習環境では、まだこのコマンドに対応していません。";
  } else if(active.scenario.terminal[cmd] != null){
    output = active.scenario.terminal[cmd];
  } else {
    output = `（${cmd} は実行できましたが、このシナリオでは特に注目すべき出力はありません）`;
  }
  rt.terminal.push({ cmd, output });
  if(rt.terminal.length > MAX_TERMINAL_LINES) rt.terminal = rt.terminal.slice(-MAX_TERMINAL_LINES);
  // クリア画面の「使用したコマンド」には、この学習環境に対応している（＝実際に調査に使えた）
  // コマンドだけを残す。未対応コマンドはターミナルの履歴にだけ残す
  if(family && SUPPORTED_COMMANDS.has(family) && !rt.usedCommands.includes(cmd)) rt.usedCommands.push(cmd);
  // 調査対象に紐づくコマンドなら、自動的に「調査済み」にする
  active.scenario.investigateTargets.forEach(t => {
    if(t.command === cmd && !rt.investigated.includes(t.id)) rt.investigated.push(t.id);
  });
  persist();
  return { output, family };
}
export function dirxIncidentTerminalLog(){
  const active = dirxActiveIncident();
  return active ? active.runtime.terminal : [];
}
