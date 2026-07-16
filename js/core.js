import { CERTS } from './data/certs.js';
import { DC_PHASES, IMP_POINTS, L, OVERALL_STEP } from './data/constants.js';
import { SKIN_DATA } from './data/skins.js';
import { gcalLoadAuthorName, go, loadGcalStore, loadGcalTodoStore, loadPortfolio, render } from './render.js';
import { S, state } from './state.js';
import { chappyOnLinuxCorrect } from './chappy.js';
import { loadCmdStats, recordCmdResults, saveCmdStats, updateAiScores } from './reviewAI.js';
import { mpExportRaw } from './mindpalette.js';
import { scenarioModeExportRaw } from './playground/scenarios/progressStore.js';

export let PASS = 700;   // 選択中の資格の合格ライン（loadCertで設定）

export let DRAW = 45;    // 選択中の資格の1回の出題数（loadCertで設定）

export let Q = [], CONCEPTS = [], TIERS = [];   // 選択中の資格のデータ（loadCertで差し替え）

export let ExtraQ = [];   // 資格ごとの追加問題プール（例：LPIC-1のコマンド別学習問題）。loadCertで差し替え

/* =========================================================================
   問題プール（ここに追加していけば自動でランダム出題の対象になります）
   imp  = 重要度(1〜5)。配点は IMP_POINTS で決定。
   a    = 単一選択の正解インデックス
   c    = 複数選択の正解インデックス配列（指定があれば複数選択問題）
   毎回プールから DRAW 問をランダム抽出し、最終スコアは
   「獲得した点 ÷ その回の満点 × 1000」で1000点満点に正規化します。
   複数選択は「正答1つ＝配点/正答数」、誤答1つにつき同額を減点（0点未満は0）。
   ========================================================================= */

export function ckey(name){ return "cert_" + (S.cert || "az900") + "_" + name; }

export function loadHist(){ try{ return JSON.parse(localStorage.getItem(ckey("history"))) || []; }catch(e){ return []; } }

export function loadWrong(){ try{ const a=JSON.parse(localStorage.getItem(ckey("wrong")))||[]; return [...new Set(a)]; }catch(e){ return []; } }

export function saveWrong(a){ try{ localStorage.setItem(ckey("wrong"), JSON.stringify([...new Set(a||[])])); }catch(e){} }

/* ===== 「後で見直す」ブックマーク =====
   演習モード中に🔖ボタンでマークした問題IDのリスト。
   復習リスト(wrong)と違い正解しても自動では消えず、ユーザーが自分で外すまで残る */

export function loadMarked(){ try{ const a=JSON.parse(localStorage.getItem(ckey("marked")))||[]; return [...new Set(a)]; }catch(e){ return []; } }

export function saveMarked(a){ try{ localStorage.setItem(ckey("marked"), JSON.stringify([...new Set(a||[])])); }catch(e){} }

// 指定問題のブックマークを付け外しし、付いた後の状態(true=登録済み)を返す
export function toggleMarked(id){
  const m = loadMarked();
  const k = m.indexOf(id);
  if(k>=0) m.splice(k,1); else m.push(id);
  saveMarked(m);
  try{ saveToCloud(getBP(), loadWrong(), loadHist()); }catch(e){}
  return k<0;
}

export function isMarked(id){ return loadMarked().indexOf(id)>=0; }

export function saveHist(h){ try{ localStorage.setItem(ckey("history"), JSON.stringify(h)); }catch(e){} }

export function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]];} return a; }

export function esc(s){ return s.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

export function fmt(iso){ const d=new Date(iso),p=n=>String(n).padStart(2,"0"); return `${d.getFullYear()}/${p(d.getMonth()+1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }

export function pts(q){ return IMP_POINTS[q.imp] || 21; }

export function stars(n){ return "★".repeat(n)+"☆".repeat(5-n); }

export function isMulti(q){ return Array.isArray(q.c); }

export function correctSet(q){ return isMulti(q) ? q.c : [q.a]; }

// 1問の採点：{earned, full}

export function grade(q, sel){
  const W = pts(q);
  if(!isMulti(q)){ const ok = sel && sel[0]===q.a; return {earned: ok?W:0, full: ok}; }
  const cor = q.c, per = W/cor.length;
  let cs=0, ws=0;
  (sel||[]).forEach(i=>{ if(cor.indexOf(i)>=0) cs++; else ws++; });
  
  // 💡 【修正部分】 ws（誤答数）による減点をなくし、cs（正解数）だけで計算する
  const earned = cs * per; 
  
  const full = (cs===cor.length && ws===0);
  return {earned, full};
}

// 出題ごとの回答時間（秒）を計測する（AIおすすめ復習の平均回答時間に使用）
function resetQuizTimer(){ S.qTimes=[]; S.qShownAt=Date.now(); }

export function start(mode, count){
  state.practicePick=false;
  S.review=false;
  S.markedRun=false;
  S.commandCmd=null;
  S.mode = (mode==="practice") ? "practice" : "exam";
  const n = (S.mode==="practice") ? (count||10) : DRAW;   // 演習は選択数、試験は従来どおりDRAW
  // 演習（ランダム演習）は、コマンド別問題（ExtraQ）も出題プールに含める。
  // これに答えた分もAIおすすめ復習の学習データとして記録されるようにするため
  // （コマンドを選んで演習する場合しかAIおすすめ復習にデータが貯まらないと、
  // AIが提案する意味が薄れてしまう）。試験は従来どおりQのみで出題する
  const pool = (S.mode==="practice") ? [...Q, ...ExtraQ] : Q;
  S.deck = shuffle(pool).slice(0, Math.min(n, pool.length));
  S.idx=0; S.picks=[]; S.sel=[]; S.screen="quiz"; resetQuizTimer(); render();
}

export function startReview(){
  state.practicePick=false;
  S.commandCmd=null;
  S.markedRun=false;
  const wrong=loadWrong();
  const pool=[...Q, ...ExtraQ].filter(q=>wrong.indexOf(q.id)>=0);
  if(!pool.length){ go("home"); return; }
  S.review=true;
  S.deck = shuffle(pool).slice(0, Math.min(DRAW, pool.length));
  S.idx=0; S.picks=[]; S.sel=[]; S.screen="quiz"; resetQuizTimer(); render();
}

// 「後で見直す」演習：ブックマークした問題だけを出題する演習モード
// （スコア・EXPの扱いは通常の演習と共通。マークは正解しても自動では外れない）
export function startMarkedPractice(){
  state.practicePick=false;
  S.review=false;
  S.commandCmd=null;
  const marked=loadMarked();
  const pool=[...Q, ...ExtraQ].filter(q=>marked.indexOf(q.id)>=0);
  if(!pool.length){ go("home"); return; }
  S.mode="practice";
  S.markedRun=true;
  S.deck = shuffle(pool).slice(0, Math.min(DRAW, pool.length));
  S.idx=0; S.picks=[]; S.sel=[]; S.screen="quiz"; resetQuizTimer(); render();
}

// コマンド別学習：指定コマンドにタグ付けされた問題だけを出題する演習モード
// （EXP/スコアの加算ロジックはstart("practice")と共通。正解した問題の配点のみが加算される）
export function questionsForCommand(cmd){ return ExtraQ.filter(q=>q.cmd===cmd); }

export function startCommandPractice(cmd){
  state.practicePick=false;
  S.review=false;
  S.markedRun=false;
  S.mode="practice";
  S.commandCmd=cmd;
  const pool = questionsForCommand(cmd);
  if(!pool.length){ return; }
  S.deck = shuffle(pool);
  S.idx=0; S.picks=[]; S.sel=[]; S.screen="quiz"; resetQuizTimer(); render();
}

export function pick(i){
  const q=S.deck[S.idx];
  if(isMulti(q)){ const k=S.sel.indexOf(i); if(k>=0)S.sel.splice(k,1); else S.sel.push(i); }
  else { S.sel=[i]; }
  render();
}

export function commit(){            // 試験モード：正誤は出さず次へ進む
  if(!S.sel.length) return;
  // この問題の回答時間を記録（「戻る」で解き直した場合は上書き）
  if(S.qTimes) S.qTimes[S.idx] = Math.round((Date.now() - (S.qShownAt||Date.now())) / 100) / 10;
  S.qShownAt = Date.now();
  S.picks.push(S.sel.slice());
  if(S.idx+1 < S.deck.length){ S.idx++; S.sel=[]; render(); }
  else finish();
}
  // ▼▼▼ 【追加】データをクラウドへ送信するための関数 ▼▼▼

export async function saveToCloud(bp, wrongList, historyList) {
  if (!state.db || !state.currentUserId || !S.cert) return;
  try {
    const patch = {};
    patch[S.cert] = { bp: bp, wrong: wrongList, history: historyList, marked: loadMarked(), cmdStats: loadCmdStats(S.cert) };
    await window.FirebaseSync.setDoc(window.FirebaseSync.doc(state.db, "users", state.currentUserId), {
      certs: patch,
      coins: (S.coins || 0),   // アカウント共通のコイン残高（資格横断）
      currentSkin: (S.currentSkin || "default"),   // ☁️ 背景スキンもクラウドへバックアップ
      ownedSkins: (S.ownedSkins || ["default"]),
      updatedAt: new Date().toISOString()
    }, { merge: true });
    console.log("Cloud synced:", S.cert);
  } catch(e) {
    console.error("Cloud sync failed:", e);
  }
}
// ▲▲▲ 【追加ここまで】 ▲▲▲

/* ===== 経験値(EXP)の計算：モード別 =====
   ・演習モード：獲得点数がそのままEXP
   ・試験モード：700点未満は0、以上はスコア帯ごとにボーナス倍率
   端数は四捨五入（Math.round）で処理 */

export function examMult(score){
  if(score < 700) return 0;
  if(score < 800) return 1.25;
  if(score < 900) return 1.5;
  if(score < 950) return 1.75;
  return 2.0;
}

export function calcExp(score, mode){
  if(mode === "practice") return score;           // 演習：点数 = EXP
  return Math.round(score * examMult(score));      // 試験：倍率適用後に四捨五入
}

/* ===== コイン(AC) ===== アカウント共通のウォレット（資格横断） */

export function loadCoins(){ const v=parseInt(localStorage.getItem("coins")||"0",10); return isNaN(v)?0:v; }

export function saveCoins(v){ try{ localStorage.setItem("coins", String(v||0)); }catch(e){} }

/* ===== スキン（背景テーマ）の永続化：端末ローカルに保存 =====
   ログインユーザーごとにキーを分けて保存する（同じ端末を複数アカウントで
   使っても、他人が購入・適用したスキンが自分の画面に表示されないように） */
function skinStorageKey(base){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `${base}::${uid}`;
}
export function saveSkins(){
  try{
    localStorage.setItem(skinStorageKey("currentSkin"), S.currentSkin || "default");
    localStorage.setItem(skinStorageKey("ownedSkins"), JSON.stringify(S.ownedSkins || ["default"]));
  }catch(e){}
}
export function loadSkins(){
  let cur = null, own = null;
  try{
    cur = localStorage.getItem(skinStorageKey("currentSkin"));
    own = JSON.parse(localStorage.getItem(skinStorageKey("ownedSkins")) || "null");
  }catch(e){}
  S.currentSkin = cur || "default";
  S.ownedSkins = (Array.isArray(own) && own.length) ? own : ["default"];
  if(!S.ownedSkins.includes("default")) S.ownedSkins.unshift("default");
}

// ログイン中のユーザーが切り替わった（ログイン／ログアウト／別アカウントへの
// 切替）ことを検知し、直前のユーザーのスキン状態が新しいユーザーの画面に一瞬
// でも残らないよう、そのユーザー専用のローカル保存領域を読み直す。
// render()の先頭から毎回呼ばれる軽量なチェック（gcalの識別子切替と同じ方式）
let skinIdentityToken;
export function skinHandleIdentityChange(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  if(skinIdentityToken === uid) return;
  const isFirstRun = skinIdentityToken === undefined;
  skinIdentityToken = uid;
  if(isFirstRun) return; // 初回描画は起動時のloadSkins()で読み込み済み
  loadSkins();
}

export function skinByKey(key){ return SKIN_DATA.find(s=>s.key===key) || null; }

// スキン購入：所持済み／コイン不足をここで検証してから減算・所持登録・適用を行う
export function purchaseSkin(key){
  const sk = skinByKey(key);
  if(!sk) return { ok:false, msg:"不明なスキンです。" };
  if(S.ownedSkins.includes(key)) return { ok:false, msg:"このスキンは既に所持しています。" };
  if((S.coins||0) < sk.cost) return { ok:false, msg:"コインが不足しています。" };
  S.coins -= sk.cost;
  S.ownedSkins.push(key);
  S.currentSkin = key;
  saveCoins(S.coins);
  saveSkins();
  try{ saveToCloud(getBP(), loadWrong(), loadHist()); }catch(e){}
  return { ok:true, skin:sk };
}

// スキン適用：所持済みスキンのみ現在の背景として設定できる
export function applySkin(key){
  if(!S.ownedSkins.includes(key)) return { ok:false, msg:"未所持のスキンです。先に購入してください。" };
  S.currentSkin = key;
  saveSkins();
  try{ saveToCloud(getBP(), loadWrong(), loadHist()); }catch(e){}
  return { ok:true };
}
/* ===== UIテーマ（背景の配色）・タップ音の永続化 =====
   購入制のスキン（上記）とは異なり、コイン不要・アカウント非依存の
   単純な端末表示設定のため、ユーザーごとに分けず1つのキーで保存する */
const UI_THEME_STORE_KEY = "ui_theme_v1";
const TAP_SOUND_STORE_KEY = "tap_sound_v1";

export function loadUiTheme(){
  try{ return localStorage.getItem(UI_THEME_STORE_KEY) || "default"; }catch(e){ return "default"; }
}
export function saveUiTheme(key){
  try{ localStorage.setItem(UI_THEME_STORE_KEY, key); }catch(e){}
}
export function loadTapSound(){
  try{ return localStorage.getItem(TAP_SOUND_STORE_KEY) || "wood"; }catch(e){ return "wood"; }
}
export function saveTapSound(key){
  try{ localStorage.setItem(TAP_SOUND_STORE_KEY, key); }catch(e){}
}

// 獲得コイン：試験はスコア帯で固定、演習・復習は「正解数×3」

export function coinReward(runMode, correct, score){
  if(runMode === "exam"){
    if(score < 700) return 50;
    if(score < 800) return 150;
    if(score < 900) return 200;
    if(score < 950) return 250;
    return 300;
  }
  return correct * 3;   // 演習・復習
}

export function finish(){
  let earned=0, total=0, correct=0;
  S.deck.forEach((q,i)=>{ total+=pts(q); const g=grade(q,S.picks[i]); earned+=g.earned; if(g.full)correct++; });
  // 復習リストの更新：間違えた問題を登録、正解できた問題は克服として除外
  const wrong=new Set(loadWrong());
  S.deck.forEach((q,i)=>{ if(grade(q,S.picks[i]).full) wrong.delete(q.id); else wrong.add(q.id); });
  const wrongList=[...wrong];
  saveWrong(wrongList);

  // モード判定（exam=試験 / practice=演習 / review=復習）
  const runMode = S.review ? "review" : (S.mode==="practice" ? "practice" : "exam");
  let score, scoreMax, exp, mult=0;
  if(runMode==="practice" || runMode==="review"){
    // 演習・復習：1000点換算を廃止。実際の配点合計(total)を満点、獲得点を切り上げてスコア。EXP=スコア
    score = Math.ceil(earned);
    scoreMax = total;
    exp = score;
  } else {
    // 試験：1000点満点換算
    score = total ? Math.round(earned/total*1000) : 0;
    scoreMax = 1000;
    mult = examMult(score); exp = calcExp(score, "exam");
  }

  // EXPをBP(=経験値)として加算 → 資格内レベルと全体レベルの両方に反映
  const prevBp = getBP();
  const newBp = prevBp + exp;
  setBP(newBp);
  // コイン(AC)の獲得：試験はスコア帯で固定、演習・復習は正解数×3
  const coinGain = coinReward(runMode, correct, score);
  S.coins = (S.coins||0) + coinGain;
  saveCoins(S.coins);
  // 🏠 Linux（LPIC系資格）の問題に正解した分だけ、まるチャピにXPを付与する
  // （1日上限つき。5問正解ごとのコインもchappy.js側でまとめて処理される）
  const certMeta = certById(S.cert);
  if(certMeta && certMeta.vendor === "lpic" && correct > 0) chappyOnLinuxCorrect(correct);
  const unlocked = TIERS.filter(t=>t.bp>prevBp && t.bp<=newBp).map(t=>t.icon+" "+t.name);
  const modeLabel = (runMode==="review" ? "復習" : runMode==="practice" ? (S.commandCmd ? `${S.commandCmd}コマンド演習` : S.markedRun ? "後で見直す演習" : "演習") : "試験") + S.deck.length + "問";
  const entry = {id:Date.now(), date:new Date().toISOString(), modeLabel,
                 mode:runMode, mult, correct, total:S.deck.length, score, scoreMax, earned:Math.ceil(earned), totalPts:total,
                 bpGain:exp, bpTotal:newBp, coinGain, coinTotal:S.coins, unlocked, review:!!S.review};
  const h=[entry,...loadHist()].slice(0,50); saveHist(h);
  // 🧠 AIおすすめ復習：コマンドにタグ付けされた問題の結果を記録し、AIスコアを自動更新。
  // 必ず saveToCloud より先に行う。後だと今回の結果を含まない古いcmdStatsが
  // クラウドへ送られ、そのsnapshotエコー（db.js→applyCloud→saveCmdStats）が
  // 記録したばかりのローカル統計を古い内容で上書きしてしまう
  try{
    const cmdResults = S.deck
      .map((q,i)=>({ cmd:q.cmd, correct: grade(q,S.picks[i]).full, timeSec: S.qTimes ? S.qTimes[i] : undefined }))
      .filter(r=>r.cmd);
    if(cmdResults.length){
      recordCmdResults(cmdResults, S.cert);
      updateAiScores(S.cert);
    }
  }catch(e){ console.error("AI review record failed:", e); }
  saveToCloud(newBp, wrongList, h);
  publishLeaderboard();   // ランキング（総合レベル・合計BP）も更新
  // 問題ごとの正答率を集計（出題+1・全問正解なら正答+1）
  if(window.QStats){
    const results = S.deck.map((q,i)=>({ qid:q.id, correct: grade(q,S.picks[i]).full }));
    window.QStats.record(S.cert, results);
  }

  S.last=entry; S.screen="result"; render();
}

export function qRate(st){ if(!st || !st.attempts) return null; return Math.round((st.correct/st.attempts)*1000)/10; }
// 解説画面の各問に全体正答率を非同期で流し込む

export async function loadReviewStats(){
  if(!window.QStats || !S.cert || !S.deck) return;
  const qids = S.deck.map(q=>q.id);
  let map={};
  try{ map = await window.QStats.getMany(S.cert, qids); }catch(e){ return; }
  S.deck.forEach(q=>{
    const box=document.getElementById("qstat-"+q.id); if(!box) return;
    const v=box.querySelector(".qstat-v");
    const st=map[q.id], rate=qRate(st);
    if(rate===null){ v.textContent="データなし（まだ集計がありません）"; }
    else { v.textContent = rate + "%"; v.title = (st.correct||0)+" / "+(st.attempts||0)+" 回正解"; box.insertAdjacentHTML("beforeend", `<span class="qstat-n">（${st.correct}/${st.attempts}）</span>`); }
  });
}

export function getBP(){ const v=parseInt(localStorage.getItem(ckey("bp"))||"0",10); return isNaN(v)?0:v; }

export function setBP(v){ try{ localStorage.setItem(ckey("bp"), String(v)); }catch(e){} }

export function dcCount(bp){ return TIERS.filter(t=>bp>=t.bp).length; }

export function dcTitle(n){
  if(n>=TIERS.length) return "グローバル インフラ完成 🎉";
  if(n>=10) return "マルチリージョン運用";
  if(n>=7)  return "高可用性アーキテクチャ";
  if(n>=4)  return "サービス拡張フェーズ";
  if(n>=2)  return "インフラ構築フェーズ";
  return "リージョン開設";
}

/* ---- データセンターの「時代（フェーズ）」とビジュアル進化 ----
   資格レベル(n=稼働リソース数)で背景の世界観が変わる。
   グローバル期になると背景が世界地図になり、各拠点が点灯する。 */

export function dcPhase(n){ return DC_PHASES.filter(p=>n>=p.min).pop() || DC_PHASES[0]; }

/* Azureリージョン（座標は地図SVG viewBox 320×130 上の位置）。lv=点灯に必要なレベル */

export function b64e(str){ return btoa(unescape(encodeURIComponent(str))); }

export function b64d(b64){ return decodeURIComponent(escape(atob(b64))); }

export function hash36(s){ let h=5381; for(let i=0;i<s.length;i++){ h=((h*33)^s.charCodeAt(i))>>>0; } return h.toString(36); }

export function exportCode(){
  const payload={v:1, bp:getBP(), wrong:loadWrong(), marked:loadMarked(), hist:loadHist()};
  const base=JSON.stringify(payload);
  payload.sig=hash36(base);
  return "AZ9-"+b64e(JSON.stringify(payload));
}

export function importCode(code){
  code=(code||"").trim().replace(/\s/g,"");
  if(code.indexOf("AZ9-")===0) code=code.slice(4);
  if(!code) throw new Error("コードが空です");
  let obj;
  try{ obj=JSON.parse(b64d(code)); }catch(e){ throw new Error("コードを読み取れませんでした"); }
  if(!obj || obj.v!==1) throw new Error("対応していないコード形式です");
  const sig=obj.sig; delete obj.sig;
  if(hash36(JSON.stringify(obj))!==sig) throw new Error("コードが壊れているか、入力ミスがあります");
  if(typeof obj.bp==="number" && obj.bp>=0) setBP(obj.bp);
  if(Array.isArray(obj.wrong)) saveWrong(obj.wrong);
  if(Array.isArray(obj.marked)) saveMarked(obj.marked);
  if(Array.isArray(obj.hist)) saveHist(obj.hist);
  return obj;
}

export function certById(id){ return CERTS.find(c=>c.id===id) || null; }

// 選択中の資格データを現在の変数へ読み込む

export function loadCert(id){
  const c = certById(id); if(!c) return;
  S.cert = c.id;
  Q = c.Q || []; CONCEPTS = c.CONCEPTS || []; TIERS = c.TIERS || [];
  ExtraQ = c.extraQ || [];
  DRAW = c.draw || 45; PASS = c.pass || 700;
}

export function selectCert(id){
  const c = certById(id); if(!c || c.status!=="ready") return;
  loadCert(id);
  applyCloud(id);          // ログイン中ならクラウドの該当データを取り込む
  S.screen = "home"; render();
}

// クラウド(state.cloudData)の該当資格データを、この端末のローカルへ反映

export function applyCloud(certId){
  if(!state.cloudData) return;
  const d = state.cloudData[certId]; if(!d) return;
  try{
    if(d.bp !== undefined) localStorage.setItem("cert_"+certId+"_bp", String(d.bp));
    if(d.wrong !== undefined) localStorage.setItem("cert_"+certId+"_wrong", JSON.stringify([...new Set(d.wrong||[])]));
    if(d.marked !== undefined) localStorage.setItem("cert_"+certId+"_marked", JSON.stringify([...new Set(d.marked||[])]));
    if(d.history !== undefined) localStorage.setItem("cert_"+certId+"_history", JSON.stringify(d.history));
    if(d.cmdStats !== undefined) saveCmdStats(d.cmdStats||{}, certId);   // AIおすすめ復習の学習統計
  }catch(e){}
}

/* クラウドのアカウント単位データ（スキン）を反映。db.js の onSnapshot から applyCloudSkins(data) で呼ぶ。
   このonSnapshotは自分自身の書き込み（例:Linuxプレイグラウンドでの保存）の
   echoでも毎回発火し、currentSkin/ownedSkinsは値が変わっていなくても毎回
   届く。ここで無条件にrender()（画面全体の再構築）を呼ぶと、他の画面を
   操作中でもそのたびに画面が丸ごと作り直され、スクロール位置や入力中の
   状態を巻き添えで失ってしまう。背景スキンの反映はbodyのクラスを直接
   書き換えるだけで足り、画面全体の再構築が実際に必要な「スキン設定」
   画面を見ている時だけrender()を呼ぶ */
export function applyCloudSkins(data){
  if(!data) return;
  if(data.currentSkin) S.currentSkin = data.currentSkin;
  if(Array.isArray(data.ownedSkins) && data.ownedSkins.length) S.ownedSkins = data.ownedSkins;
  if(!S.ownedSkins.includes("default")) S.ownedSkins.unshift("default");
  saveSkins();
  const sk = S.currentSkin || "default";
  document.body.className = (sk && sk!=="default") ? ("sb-theme-"+sk) : "";
  if(S.screen === "skins") render();
}

// 新規アカウント時：この端末にあるローカルの各資格データをクラウドへ初期投入

export function seedCloudFromLocal(){
  if(!state.db || !state.currentUserId || !window.FirebaseSync) return;
  const patch = {};
  CERTS.forEach(c=>{
    const bp = localStorage.getItem("cert_"+c.id+"_bp");
    const wrong = localStorage.getItem("cert_"+c.id+"_wrong");
    const marked = localStorage.getItem("cert_"+c.id+"_marked");
    const hist = localStorage.getItem("cert_"+c.id+"_history");
    if(bp || wrong || marked || hist){
      patch[c.id] = {
        bp: bp ? (parseInt(bp,10)||0) : 0,
        wrong: wrong ? (JSON.parse(wrong)||[]) : [],
        marked: marked ? (JSON.parse(marked)||[]) : [],
        history: hist ? (JSON.parse(hist)||[]) : []
      };
    }
  });
  const portfolio = loadPortfolio();
  const hasPortfolio = Object.keys(portfolio).length > 0;
  const gcalStore = loadGcalStore();
  const gcalTodos = loadGcalTodoStore();
  const gcalAuthorName = gcalLoadAuthorName();
  const hasGcal = !!gcalAuthorName
    || Object.keys(gcalTodos).length > 0
    || gcalStore.calendars.length > 1
    || Object.values(gcalStore.events || {}).some(m => m && Object.keys(m).length > 0);
  const mindPalette = mpExportRaw();
  const hasMindPalette = Array.isArray(mindPalette.boards)
    && mindPalette.boards.some(b => (b.notes && b.notes.length) || (b.links && b.links.length));
  const scenarioMode = scenarioModeExportRaw();
  const hasScenarioMode = (scenarioMode.cleared && scenarioMode.cleared.length) || Object.keys(scenarioMode.inProgress || {}).length;
  if(Object.keys(patch).length || loadCoins() || hasPortfolio || hasGcal || hasMindPalette || hasScenarioMode){
    const payload = { certs: patch, coins: loadCoins(), updatedAt:new Date().toISOString() };
    if(hasPortfolio) payload.portfolio = portfolio;
    if(hasGcal) payload.gcal = { store: gcalStore, todos: gcalTodos, authorName: gcalAuthorName };
    if(hasMindPalette) payload.mindPalette = mindPalette;
    if(hasScenarioMode) payload.scenarioMode = scenarioMode;
    try{
      window.FirebaseSync.setDoc(window.FirebaseSync.doc(state.db,"users",state.currentUserId),
        payload, { merge:true });
    }catch(e){}
  }
}

// 旧バージョン（資格未対応）のローカルデータを cert_az900_* へ引き継ぎ

export function migrateOldData(){
  const map = [["az900_bp","cert_az900_bp"],["az900_wrong","cert_az900_wrong"],["az900_history_v1","cert_az900_history"]];
  map.forEach(([o,n])=>{
    try{ const v=localStorage.getItem(o); if(v!==null && localStorage.getItem(n)===null) localStorage.setItem(n,v); }catch(e){}
  });
  loadSkins();   // 起動時に保存済みスキンを S へ復元
}

// 資格カード1枚分のステータス（ローカル保存から算出）

export function certStat(c){
  const bp = parseInt(localStorage.getItem("cert_"+c.id+"_bp")||"0",10)||0;
  let hist=[]; try{ hist=JSON.parse(localStorage.getItem("cert_"+c.id+"_history")||"[]")||[]; }catch(e){}
  const best = hist.reduce((m,x)=>Math.max(m,x.score),0);
  const tiers = c.TIERS||[];
  const lvl = tiers.filter(t=>bp>=t.bp).length;
  return { bp, best, plays:hist.length, lvl, tiers:tiers.length };
}

/* ---- 総合レベル（全資格の合計BPから連続的に算出）----
   資格レベルが TIERS の段数なのに対し、総合は「合計BPの数式」で出す。
   資格が増えても合計BPが増えて自然にレベルが上がるだけなので破綻しない。 */

export function totalBP(){ return CERTS.reduce((s,c)=>s + (parseInt(localStorage.getItem("cert_"+c.id+"_bp")||"0",10)||0), 0); }

export function overallLevel(tbp){ return Math.floor((Math.sqrt(1 + 8*tbp/OVERALL_STEP) - 1) / 2); }

export function bpForLevel(L){ return OVERALL_STEP * L * (L+1) / 2; }   // レベルLの開始に必要な合計BP

export function overallTitle(lv){
  if(lv>=40) return "クラウドアーキテクト";
  if(lv>=30) return "シニアエンジニア";
  if(lv>=20) return "クラウドエンジニア";
  if(lv>=12) return "アソシエイト";
  if(lv>=6)  return "ジュニアエンジニア";
  if(lv>=1)  return "見習いエンジニア";
  return "ビギナー";
}

export function overallStat(){
  const tbp = totalBP();
  const lv = overallLevel(tbp);
  const start = bpForLevel(lv), next = bpForLevel(lv+1);
  const pct = next>start ? Math.round((tbp-start)/(next-start)*100) : 100;
  const remain = Math.max(0, next - tbp);
  const active = CERTS.filter(c=>c.status==="ready" && (parseInt(localStorage.getItem("cert_"+c.id+"_bp")||"0",10)||0)>0).length;
  return { tbp, lv, pct, remain, active, title:overallTitle(lv) };
}

// 管理者アカウント判定：メールアドレスまたは表示名（プロフィール名）が
// 一致する場合に管理者とみなす。管理者はランキングへの公開対象から除外し、
// 日本経済ニュース画面の投稿フォームはこの判定が真の場合のみ表示する
export function isAdminAccount(){
  const email = (state.currentUser && state.currentUser.email) || "";
  const name = getProfileName() || "";
  return email.toLowerCase() === "for.administ@gmail.com" || name.toLowerCase() === "admin";
}

export function getProfileName(){ return localStorage.getItem("profile_name") || ""; }

export function setProfileName(n){ try{ localStorage.setItem("profile_name", n); }catch(e){} }

// 表示名が未設定の場合のデフォルト名（メールは公開せず、ID由来の匿名名）

export function defaultName(){ return "エンジニア" + (state.currentUserId ? state.currentUserId.slice(-4).toUpperCase() : "0000"); }

// 公開用の要約データ（個人の問題履歴などは含めない）

export function buildPublic(){
  const certLevels={};
  const certBP={};
  CERTS.forEach(c=>{
    if(c.status==="ready"){
      const bp=parseInt(localStorage.getItem("cert_"+c.id+"_bp")||"0",10)||0;
      certLevels[c.id]=(c.TIERS||[]).filter(t=>bp>=t.bp).length;
      certBP[c.id]=bp;
    }
  });
  const ov=overallStat();
  return { displayName:getProfileName()||defaultName(), totalBP:ov.tbp, overallLevel:ov.lv,
           title:ov.title, certLevels, certBP, updatedAt:new Date().toISOString() };
}
// ランキングへ自動公開・更新（ログイン中なら表示名の有無に関わらず自動で反映）

export function publishLeaderboard(){
  // 管理者アカウントは公開ランキングコレクションへ一切書き込まない
  // （書き込み自体を止めることで、一覧表示・件数集計・myRank等の
  // すべての集計ロジックから確実に除外される）
  if(!window.LB || !state.currentUserId || state.guestMode || isAdminAccount()) return;
  try{ window.LB.publish(buildPublic()); }catch(e){}
}

// js/core.js の一番最後に追加
export function prevQuestion() {
  if (S.idx > 0) {
    S.idx--;
    S.qShownAt = Date.now();   // 戻った問題の回答時間を計り直す
    // 過去にこの問題で選んでいた選択肢を現在の選択状態（S.sel）に復元
    S.sel = S.picks[S.idx] || [];
    render();
  }
}
