import { CERTS } from './data/certs.js';
import { DC_PHASES, IMP_POINTS, L, OVERALL_STEP } from './data/constants.js';
import { go, render } from './render.js';
import { S, state } from './state.js';

export let PASS = 700;   // 選択中の資格の合格ライン（loadCertで設定）

export let DRAW = 45;    // 選択中の資格の1回の出題数（loadCertで設定）

export let Q = [], CONCEPTS = [], TIERS = [];   // 選択中の資格のデータ（loadCertで差し替え）

export function ipToNum(ipStr) {
  const parts = (ipStr || "").split('.').map(Number);
  if (parts.length !== 4 || parts.some(num => isNaN(num) || num < 0 || num > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

export function numToIp(num) {
  return [num >>> 24, (num >>> 16) & 255, (num >>> 8) & 255, num & 255].join('.');
}
// ネットワークの開始・終了IPの数値を計算（プレフィックス長の上限を32に設定・制限）

export function getIpRange(ipStr, prefix) {
  const ipNum = ipToNum(ipStr);
  if (ipNum === null) return null;
  
  const p = parseInt(prefix, 10);
  // ❌ プレフィックス長が 8 〜 32 の範囲外、または数字でない場合は無効（制限）
  if (isNaN(p) || p < 8 || p > 32) return null;
  
  // /32 の場合は開始IPと終了IPが全く同じになるため、ビットシフトをせず直接返す
  if (p === 32) {
    return { start: ipNum, end: ipNum };
  }
  
  const mask = p === 0 ? 0 : (~0 << (32 - p)) >>> 0;
  const start = (ipNum & mask) >>> 0;
  const end = (start | ~mask) >>> 0;
  
  return { start, end };
}
// ▲▲▲ 【追加ここまで】 ▲▲▲

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
  const earned = Math.max(0, (cs-ws)*per);
  const full = (cs===cor.length && ws===0);
  return {earned, full};
}

export function start(mode, count){
  state.practicePick=false;
  S.review=false;
  S.mode = (mode==="practice") ? "practice" : "exam";
  const n = (S.mode==="practice") ? (count||10) : DRAW;   // 演習は選択数、試験は従来どおりDRAW
  S.deck = shuffle(Q).slice(0, Math.min(n, Q.length));
  S.idx=0; S.picks=[]; S.sel=[]; S.screen="quiz"; render();
}

export function startReview(){
  state.practicePick=false;
  const wrong=loadWrong();
  const pool=Q.filter(q=>wrong.indexOf(q.id)>=0);
  if(!pool.length){ go("home"); return; }
  S.review=true;
  S.deck = shuffle(pool).slice(0, Math.min(DRAW, pool.length));
  S.idx=0; S.picks=[]; S.sel=[]; S.screen="quiz"; render();
}

export function pick(i){
  const q=S.deck[S.idx];
  if(isMulti(q)){ const k=S.sel.indexOf(i); if(k>=0)S.sel.splice(k,1); else S.sel.push(i); }
  else { S.sel=[i]; }
  render();
}

export function commit(){            // 試験モード：正誤は出さず次へ進む
  if(!S.sel.length) return;
  S.picks.push(S.sel.slice());
  if(S.idx+1 < S.deck.length){ S.idx++; S.sel=[]; render(); }
  else finish();
}
  // ▼▼▼ 【追加】データをクラウドへ送信するための関数 ▼▼▼

export async function saveToCloud(bp, wrongList, historyList) {
  if (!state.db || !state.currentUserId || !S.cert) return;
  try {
    const patch = {};
    patch[S.cert] = { bp: bp, wrong: wrongList, history: historyList };
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

/* ===== スキン（背景テーマ）の永続化：端末ローカルに保存 ===== */
export function saveSkins(){
  try{
    localStorage.setItem("currentSkin", S.currentSkin || "default");
    localStorage.setItem("ownedSkins", JSON.stringify(S.ownedSkins || ["default"]));
  }catch(e){}
}
export function loadSkins(){
  try{
    const cur = localStorage.getItem("currentSkin");
    const own = JSON.parse(localStorage.getItem("ownedSkins") || "null");
    if(cur) S.currentSkin = cur;
    if(Array.isArray(own) && own.length) S.ownedSkins = own;
    if(!S.ownedSkins.includes("default")) S.ownedSkins.unshift("default");
  }catch(e){}
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
  if(runMode==="practice"){
    // 演習：1000点換算を廃止。実際の配点合計(total)を満点、獲得点を切り上げてスコア。EXP=スコア
    score = Math.ceil(earned);
    scoreMax = total;
    exp = score;
  } else {
    // 試験・復習：従来どおり1000点満点換算（変更しない）
    score = total ? Math.round(earned/total*1000) : 0;
    scoreMax = 1000;
    if(runMode==="exam"){ mult = examMult(score); exp = calcExp(score, "exam"); }
    else { exp = score; }   // 復習：従来どおり点数がそのままEXP
  }

  // EXPをBP(=経験値)として加算 → 資格内レベルと全体レベルの両方に反映
  const prevBp = getBP();
  const newBp = prevBp + exp;
  setBP(newBp);
  // コイン(AC)の獲得：試験はスコア帯で固定、演習・復習は正解数×3
  const coinGain = coinReward(runMode, correct, score);
  S.coins = (S.coins||0) + coinGain;
  saveCoins(S.coins);
  const unlocked = TIERS.filter(t=>t.bp>prevBp && t.bp<=newBp).map(t=>t.icon+" "+t.name);
  const modeLabel = (runMode==="review" ? "復習" : runMode==="practice" ? "演習" : "試験") + S.deck.length + "問";
  const entry = {id:Date.now(), date:new Date().toISOString(), modeLabel,
                 mode:runMode, mult, correct, total:S.deck.length, score, scoreMax, earned:Math.ceil(earned), totalPts:total,
                 bpGain:exp, bpTotal:newBp, coinGain, coinTotal:S.coins, unlocked, review:!!S.review};
  const h=[entry,...loadHist()].slice(0,50); saveHist(h);
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
  const payload={v:1, bp:getBP(), wrong:loadWrong(), hist:loadHist()};
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
  if(Array.isArray(obj.hist)) saveHist(obj.hist);
  return obj;
}

export function certById(id){ return CERTS.find(c=>c.id===id) || null; }

// 選択中の資格データを現在の変数へ読み込む

export function loadCert(id){
  const c = certById(id); if(!c) return;
  S.cert = c.id;
  Q = c.Q || []; CONCEPTS = c.CONCEPTS || []; TIERS = c.TIERS || [];
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
    if(d.history !== undefined) localStorage.setItem("cert_"+certId+"_history", JSON.stringify(d.history));
  }catch(e){}
}

/* クラウドのアカウント単位データ（スキン）を反映。db.js の onSnapshot から applyCloudSkins(data) で呼ぶ */
export function applyCloudSkins(data){
  if(!data) return;
  if(data.currentSkin) S.currentSkin = data.currentSkin;
  if(Array.isArray(data.ownedSkins) && data.ownedSkins.length) S.ownedSkins = data.ownedSkins;
  if(!S.ownedSkins.includes("default")) S.ownedSkins.unshift("default");
  saveSkins();
}

// 新規アカウント時：この端末にあるローカルの各資格データをクラウドへ初期投入

export function seedCloudFromLocal(){
  if(!state.db || !state.currentUserId || !window.FirebaseSync) return;
  const patch = {};
  CERTS.forEach(c=>{
    const bp = localStorage.getItem("cert_"+c.id+"_bp");
    const wrong = localStorage.getItem("cert_"+c.id+"_wrong");
    const hist = localStorage.getItem("cert_"+c.id+"_history");
    if(bp || wrong || hist){
      patch[c.id] = {
        bp: bp ? (parseInt(bp,10)||0) : 0,
        wrong: wrong ? (JSON.parse(wrong)||[]) : [],
        history: hist ? (JSON.parse(hist)||[]) : []
      };
    }
  });
  if(Object.keys(patch).length || loadCoins()){
    try{
      window.FirebaseSync.setDoc(window.FirebaseSync.doc(state.db,"users",state.currentUserId),
        { certs: patch, coins: loadCoins(), updatedAt:new Date().toISOString() }, { merge:true });
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

/* ---- 総合エンジニアレベル（全資格の合計BPから連続的に算出）----
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

export function getProfileName(){ return localStorage.getItem("profile_name") || ""; }

export function setProfileName(n){ try{ localStorage.setItem("profile_name", n); }catch(e){} }

// 表示名が未設定の場合のデフォルト名（メールは公開せず、ID由来の匿名名）

export function defaultName(){ return "エンジニア" + (state.currentUserId ? state.currentUserId.slice(-4).toUpperCase() : "0000"); }

// 公開用の要約データ（個人の問題履歴などは含めない）

export function buildPublic(){
  const certLevels={};
  CERTS.forEach(c=>{
    if(c.status==="ready"){
      const bp=parseInt(localStorage.getItem("cert_"+c.id+"_bp")||"0",10)||0;
      certLevels[c.id]=(c.TIERS||[]).filter(t=>bp>=t.bp).length;
    }
  });
  const ov=overallStat();
  return { displayName:getProfileName()||defaultName(), totalBP:ov.tbp, overallLevel:ov.lv,
           title:ov.title, certLevels, updatedAt:new Date().toISOString() };
}
// ランキングへ自動公開・更新（ログイン中なら表示名の有無に関わらず自動で反映）

export function publishLeaderboard(){
  if(!window.LB || !state.currentUserId || state.guestMode) return;
  try{ window.LB.publish(buildPublic()); }catch(e){}
}
