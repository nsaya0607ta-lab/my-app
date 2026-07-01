import { CERTS } from './data/certs.js';
import { DC_PHASES, L, REGIONS } from './data/constants.js';
import { CONCEPTS, DRAW, PASS, Q, TIERS, certById, certStat, commit, correctSet, dcCount, dcPhase, dcTitle, esc, exportCode, fmt, getBP, getProfileName, grade, importCode, isMulti, loadHist, loadReviewStats, loadWrong, overallLevel, overallStat, pick, pts, publishLeaderboard, saveSkins, saveToCloud, selectCert, setBP, setProfileName, stars, start, startReview, totalBP } from './core.js';
import { MISSIONS, PT_SHOP } from './data/missions.js';
import { S, state } from './state.js';

export const app = document.getElementById("app");

export function go(s){ S.screen=s; render(); }

// 右上の共通ステータスバー：上段=総合Lv／下段=選択中の資格Lv／右=AC。render()のたびに最新化

export function renderStatusBar(){
  const el=document.getElementById("statusbar"); if(!el) return;
  // 認証前・ユーザー名未設定などプレイヤーが確定していない画面では非表示
  const gated = (!state.guestMode && !state.authReady)
             || (!state.guestMode && !state.currentUser)
             || (!state.guestMode && state.currentUser && (!state.profileChecked || !getProfileName()));
  if(gated){ el.classList.remove("show"); el.innerHTML=""; return; }
  const ov = overallStat();          // 上段：全資格合計から総合Lvと次Lvまでの進捗(%)
  const coins = (S.coins||0);

  // 下段：選択中の資格レベルと、次のリソース解放までの進捗（データセンターと同じロジック）
  let certRow = "";
  if(S.cert){
    const c = certById(S.cert) || {};
    const bp = getBP();
    const lvl = dcCount(bp);
    const next = TIERS.find(t=>t.bp>bp);
    let cpct;
    if(next){ const prevBp = lvl>0 ? TIERS[lvl-1].bp : 0; cpct = Math.max(0, Math.min(100, Math.round((bp-prevBp)/(next.bp-prevBp)*100))); }
    else cpct = 100;
    // どのリソース間の進捗か（例：VM → ストレージ）をツールチップに明示
    const curName = lvl>0 ? (TIERS[lvl-1].icon+" "+TIERS[lvl-1].name) : "スタート";
    const certTitle = next ? `${curName} → ${next.icon} ${next.name}（あと ${(next.bp-bp).toLocaleString()} BP）` : "全リソース稼働";
    certRow = `
      <div class="sb-line">
        <span class="sb-lab sb-lab-cert">${esc(c.code||"選択資格")} Lv.<b>${lvl}</b></span>
        <span class="sb-prog" title="${esc(certTitle)}"><span class="sb-prog-f cert" style="width:${cpct}%"></span></span>
      </div>`;
  }

  el.innerHTML = `
    <div class="sb-levels">
      <div class="sb-line">
        <span class="sb-lab">総合ランク Lv.<b>${ov.lv}</b></span>
        <span class="sb-prog" title="次の総合Lvまで ${ov.remain.toLocaleString()} BP"><span class="sb-prog-f overall" style="width:${ov.pct}%"></span></span>
      </div>
      ${certRow}
    </div>
    <span class="sb-div"></span>
    <span class="sb-coin">💰 <b>${coins.toLocaleString()}</b> AC</span>
  `;
  el.classList.add("show");
}

/* ======================= 仮想Azureデモ環境（ポータル） ======================= */
/* ドックのリソース（配置は無料。コインは消費しない） */

export function missionBP(stars){ return ({1:500,2:1000,3:1500,4:2000,5:3000})[stars] || stars*500; }

/* ====== ミッション（お題）レジストリ ======
   stars: 難易度(1-5) / hints: ❓で表示する設計ヒント / check(inf): true でクリア。
   新しいお題はここに足すだけで目次に並ぶ。 */

export let currentMission = MISSIONS[0];   // デフォルトのお題

export function missionStars(n){
  let s=""; for(let i=0;i<5;i++) s += `<span class="pt-star ${i<n?'on':''}">★</span>`; return s;
}

export function ptValidZones(key){
  if(key==="vnet")   return ["canvas"];
  if(key==="subnet") return ["vnetbody","subnet"];
  if(key==="vm")     return ["subnet"];
  if(key==="lb")     return ["lb"];
  return [];
}

export function resetInfra(){
  S.infra = { vnet:false, vnetPrefix:"", subnets:[], lb:false };
  renderSandbox();
  renderStatusBar();
}
// 目次画面：ミッションカードのみを表示。タップで構築シミュレーターへ

export function renderPortal(){
  S.infra || (S.infra={vnet:false,vnetPrefix:"",subnets:[],lb:false});
  const cards = MISSIONS.map(mn=>{
    const cleared = missionCleared(mn.id);
    return `<button class="pt-mission pt-mission-btn" data-mission="${mn.id}">
      <div class="pt-m-top"><span class="pt-m-tag">MISSION</span><span class="pt-m-stars" title="難易度 ${mn.stars} / 5">${missionStars(mn.stars)}</span></div>
      <div class="pt-m-title">${esc(mn.title)}${cleared?' <span class="pt-cleared">✓ クリア済み</span>':''}</div>
      <div class="pt-m-desc">${esc(mn.desc)}</div>
      <div class="pt-m-foot"><span class="pt-m-reward">クリア報酬：⚡ ${missionBP(mn.stars).toLocaleString()} BP</span><span class="pt-m-go">挑戦する →</span></div>
    </button>`;
  }).join("");
  app.innerHTML = `
    <div class="q-head"><button class="quit" data-go="home">🏠 ホーム</button><span class="q-count">Azure デモ環境</span></div>
    <div class="pt-coinbar pt-coinbar-info">🧪 配置は無料で何度でも試せます。<b>クリアでBP獲得！</b></div>
    <div class="pt-mlist-lab">ミッション一覧</div>
    <div class="pt-mlist">${cards}</div>
  `;
  app.querySelectorAll("[data-go]").forEach(x=>x.onclick=()=>go(x.dataset.go));
  app.querySelectorAll("[data-mission]").forEach(x=>x.onclick=()=>openMission(x.dataset.mission));
  window.scrollTo(0,0);
}

export function missionCleared(id){ return !!localStorage.getItem("portal_done_"+id) || (S.clearedMissions||[]).includes(id); }

export function openMission(id){
  const mn = MISSIONS.find(m=>m.id===id); if(!mn) return;
  currentMission = mn;
  S.screen = "sandbox"; render();
}

// 構築シミュレーター画面：ボード・採点・リセット・ドック・アドレス入力・❓ヒント

// 構築シミュレーター画面（無限キャンバス・背景スキンショップ対応完全版）
export function renderSandbox(){
  const inf = S.infra || (S.infra={vnet:false,vnetPrefix:"",subnets:[],lb:false});
  const currentSkin = S.currentSkin || "default"; // 現在のスキンを読み込む

  const subnetHTML = (sn,i)=>`
    <div class="pt-drop pt-subnet" data-zone="subnet" data-idx="${i}">
      <div class="pt-sn-lab">サブネット${i+1} <span class="pt-addr">10.0.${i+1}.0/<input class="pt-ip-in" data-sn-prefix="${i}" value="${esc(sn.prefix||"")}" placeholder="24" inputmode="numeric" maxlength="2"></span></div>
      <div class="pt-sn-items">${sn.vms.length
        ? sn.vms.map((vm,j)=>`<span class="pt-chip">🖥️ 10.0.${i+1}.<input class="pt-ip-in pt-ip-oct" data-vm-octet="${i}-${j}" value="${esc(vm.octet||"")}" placeholder="4" inputmode="numeric" maxlength="3"></span>`).join("")
        : '<span class="pt-empty">VMをここへドラッグ</span>'}</div>
    </div>`;
  const sandbox = !inf.vnet ? `
      <div class="pt-drop pt-canvas" data-zone="canvas">
        <div class="pt-canvas-lab">VNet 未デプロイ</div>
        <div class="pt-canvas-sub">下のドックから「🌐 VNet」をここへドラッグ</div>
      </div>`
    : `
      <div class="pt-vnet">
        <div class="pt-vnet-head">
          <span class="pt-vnet-lab">VNet 10.0.0.0/<input class="pt-ip-in" id="vnet-prefix" value="${esc(inf.vnetPrefix||"")}" placeholder="16" inputmode="numeric" maxlength="2"></span>
          <span class="pt-drop pt-lbslot ${inf.lb?'filled':''}" data-zone="lb">${inf.lb?'⚖️ LB':'＋ LB'}</span>
        </div>
        <div class="pt-drop pt-vnetbody" data-zone="vnetbody">
          ${inf.subnets.length ? inf.subnets.map((sn,i)=>subnetHTML(sn,i)).join("") : '<div class="pt-vnet-empty">🗂️ サブネットをここへドラッグ</div>'}
        </div>
      </div>`;
  const dock = PT_SHOP.map(it=>`<div class="pt-item" data-key="${it.key}">
      <span class="pt-ic">${it.icon}</span><span class="pt-nm">${it.name}</span>
    </div>`).join("");
    
  // 🔥 無限ビューポートとスキンショップボトムシートを組み込んだレイアウト構造
  app.innerHTML = `
    <div class="q-head"><button class="quit" data-go="portal">← ミッション一覧</button><span class="q-count">構築シミュレーター</span></div>
    <div class="pt-mission-strip"><span class="pt-m-stars">${missionStars(currentMission.stars)}</span><span class="pt-strip-title">${esc(currentMission.title)}</span><button class="pt-help" id="pt-help" title="ヒントを見る">❓</button></div>
    
    <div id="sb-viewport">
      <div id="sb-board" class="sb-theme-${currentSkin}">
        <div id="sb-mark">SANDBOX</div>
        <div style="position:absolute; left:1300px; top:1350px; width:400px; padding:10px;">
          ${sandbox}
        </div>
      </div>
      <div id="sb-coord">X: <b id="sb-cx">0</b>　Y: <b id="sb-cy">0</b></div>
      <div id="sb-skin-fab">🎨 スキン</div>
      <div id="sb-toast-skin"></div>
      
      <div id="sb-shop-bd"></div>
      <div id="sb-shop">
        <div class="sb-shop-hd">
          <div class="sb-shop-ttl">背景スキン<small>見た目をカスタマイズ</small></div>
          <div class="sb-shop-x" id="sb-shop-x">✕</div>
        </div>
        <div id="sb-skin-list"></div>
      </div>
    </div>

    <div id="pt-result" class="pt-result"></div>
    <button class="cta" id="pt-test">構成をテスト・採点する</button>
    <div class="pt-btnrow"><button class="ghost" id="pt-reset">リセット</button></div>
    <div class="pt-dock-lab">ドック（指で上にドラッグして配置・無料）</div>
    <div class="pt-dock">${dock}</div>
  `;
  app.querySelectorAll("[data-go]").forEach(x=>x.onclick=()=>go(x.dataset.go));
  document.getElementById("pt-test").onclick=testInfra;
  document.getElementById("pt-help").onclick=openHintModal;
  document.getElementById("pt-reset").onclick=()=>{ if(confirm("構築した構成をリセットしますか？")) resetInfra(); };
  
  const vp=document.getElementById("vnet-prefix"); if(vp) vp.oninput=(e)=>{ inf.vnetPrefix = e.target.value; };
  app.querySelectorAll("[data-sn-prefix]").forEach(el=>el.oninput=(e)=>{ const i=+el.dataset.snPrefix; if(inf.subnets[i]) inf.subnets[i].prefix=e.target.value; });
  app.querySelectorAll("[data-vm-octet]").forEach(el=>el.oninput=(e)=>{ const [i,j]=el.dataset.vmOctet.split("-").map(Number); if(inf.subnets[i]&&inf.subnets[i].vms[j]) inf.subnets[i].vms[j].octet=e.target.value; });
  app.querySelectorAll(".pt-item").forEach(elem=>ptAttachDrag(elem));
  
  // 🔥 【追加】次に追記するショップ開閉・スワイプの制御エンジンを起動
  initSkinShopLogic();
  window.scrollTo(0,0);
}

// ドラッグ＆ドロップ（タッチ＆マウス両対応・無料）。サブネット等の動的パーツにも対応

export function ptAttachDrag(elem){
  const key = elem.dataset.key;
  const onStart = (e)=>{
    e.preventDefault();
    const it = PT_SHOP.find(s=>s.key===key);
    const ghost = document.createElement("div");
    ghost.className="pt-ghost"; ghost.textContent=it.icon;
    document.body.appendChild(ghost);
    const valid = ptValidZones(key);
    const move=(ev)=>{
      const p = ev.touches ? ev.touches[0] : ev;
      ghost.style.left = p.clientX+"px"; ghost.style.top = p.clientY+"px";
      ptHighlight(p.clientX, p.clientY, valid);
    };
    const end=(ev)=>{
      const p = ev.changedTouches ? ev.changedTouches[0] : ev;
      const zi = ptZoneAt(p.clientX, p.clientY);
      ghost.remove();
      ptClearHighlight();
      document.removeEventListener("touchmove",move,{passive:false});
      document.removeEventListener("touchend",end);
      document.removeEventListener("mousemove",move);
      document.removeEventListener("mouseup",end);
      ptDeploy(key, zi);
    };
    move(e);
    document.addEventListener("touchmove",move,{passive:false});
    document.addEventListener("touchend",end);
    document.addEventListener("mousemove",move);
    document.addEventListener("mouseup",end);
  };
  elem.addEventListener("touchstart", onStart, {passive:false});
  elem.addEventListener("mousedown", onStart);
}

export function ptZoneEl(x,y){
  const el = document.elementFromPoint(x,y);
  return el && el.closest ? el.closest("[data-zone]") : null;
}

export function ptZoneAt(x,y){
  const z = ptZoneEl(x,y);
  if(!z) return null;
  return { zone:z.dataset.zone, idx: (z.dataset.idx!=null ? parseInt(z.dataset.idx,10) : null) };
}

export function ptHighlight(x,y,valid){
  ptClearHighlight();
  const z = ptZoneEl(x,y);
  if(z && valid.indexOf(z.dataset.zone)>=0) z.classList.add("pt-over");
}

export function ptClearHighlight(){ document.querySelectorAll(".pt-over").forEach(e=>e.classList.remove("pt-over")); }

export function ptMsg(txt, ok){
  const r=document.getElementById("pt-result"); if(!r) return;
  r.className = "pt-result " + (ok===true?"ok":(ok===false?"ng":""));
  r.innerHTML = txt;
}
// 配置（無料・データ追加のみ）。無効なドロップは黙って無視（自動ヒントは出さない）

export function ptDeploy(key, zi){
  const inf = S.infra;
  const valid = ptValidZones(key);
  if(!zi || valid.indexOf(zi.zone)<0) return;
  if(key==="vnet"){
    if(inf.vnet) return;
    inf.vnet = true;
  } else if(key==="subnet"){
    if(!inf.vnet) return;
    inf.subnets.push({ prefix:"", vms:[] });
  } else if(key==="vm"){
    if(!inf.vnet) return;
    const i = zi.idx;
    if(i==null || !inf.subnets[i]) return;
    inf.subnets[i].vms.push({ octet:"" });
  } else if(key==="lb"){
    if(!inf.vnet || inf.lb) return;
    inf.lb = true;
  }
  renderSandbox();   // 入力値は S.infra に保存済みなので再描画で復元される
}
// ❓ヒント：ユーザーが押した時だけ設計ヒントをモーダル表示（自動表示はしない）

export function openHintModal(){
  const mn = currentMission;
  const ov = document.createElement("div"); ov.className="modal-ov";
  ov.innerHTML = `
    <div class="modal">
      <div class="modal-title">❓ ヒント</div>
      <div class="pt-hint-head">${missionStars(mn.stars)} <span>${esc(mn.title)}</span></div>
      <ul class="pt-hint-list">${(mn.hints||["このミッションのヒントは準備中です。"]).map(h=>`<li>${esc(h)}</li>`).join("")}</ul>
      <button class="cta" id="pt-hint-close">閉じる</button>
    </div>`;
  document.body.appendChild(ov);
  const close=()=>{ try{ ov.remove(); }catch(e){} };
  ov.querySelector("#pt-hint-close").onclick=close;
  ov.addEventListener("click",(e)=>{ if(e.target===ov) close(); });
}
// 採点：現在のミッションのクリア条件で判定。失敗時は具体ヒントを自動表示しない
// 採点：現在のミッションのクリア条件で判定。ビット演算による詳細フィードバック版

export function testInfra(){
  const res = currentMission.check(S.infra);
  
  // 判定が失敗（res.okがfalse、または真偽値でfalseが返った場合）
  if(!res || res.ok === false || res === false){
    const errMsg = res.msg || "❌ まだ構成が完成していません。右上の「❓」でヒントを確認しながら見直しましょう。";
    ptMsg(errMsg, false);
    return;
  }
  
  const id = currentMission.id;
  const already = missionCleared(id);
  let msg = `${"⭐".repeat(currentMission.stars)} ミッション達成！<br>「${esc(currentMission.title)}」をクリアしました。`;
  if(!already){
    const bp = missionBP(currentMission.stars);
    setBP(getBP() + bp);                         // 資格BPに加算 → レベル/ステータスバーへ反映
    if(!S.clearedMissions) S.clearedMissions=[];
    S.clearedMissions.push(id);
    try{ localStorage.setItem("portal_done_"+id, "1"); }catch(e){}
    msg += `<br>🎉 初クリア報酬 <b>+${bp.toLocaleString()} BP</b> 獲得！レベルに反映されました。`;
    try{ publishLeaderboard(); }catch(e){}        // ランキングも更新
    try{ saveToCloud(getBP(), loadWrong(), loadHist()); }catch(e){}  // クラウド同期
  } else {
    msg += "<br>（このミッションの報酬は獲得済みです）";
  }
  renderSandbox();
  renderStatusBar();   // 最上部のBPバー・レベルに即反映
  ptMsg(msg, true);
}

export function render(){
  renderStatusBar();   // 画面が変わっても常に最新の Lv/BP/AC を反映
  // 🎨 アプリ全体の背景スキンを body に適用（default のときは元の背景のまま）
  const sk = S.currentSkin || "default";
  document.body.className = (sk && sk!=="default") ? ("sb-theme-"+sk) : "";
  // アカウントの認証ゲート（ゲストモードならスキップ）
  if(!state.guestMode && !state.authReady) return renderLoading();
  if(!state.guestMode && !state.currentUser) return renderAuth();
  // ログイン済みでユーザー名が未設定なら、必ずユーザー名設定画面へ
  if(!state.guestMode && state.currentUser){
    if(!state.profileChecked) return renderLoading();
    if(!getProfileName()) return renderUsername();
  }
  // 資格選択なしでも開ける画面
  if(S.screen==="ranking") return renderRanking();
  if(S.screen==="profile") return renderProfile();
  if(S.screen==="settings") return renderSettings();
  if(S.screen==="analytics") return renderAnalytics();
  // 大元：資格選択画面
  if(S.screen==="select" || !S.cert) return renderSelect();
  if(S.screen==="home") return renderHome();
  if(S.screen==="quiz") return renderQuiz();
  if(S.screen==="result") return renderResult();
  if(S.screen==="review") return renderReview();
  if(S.screen==="dict") return renderDict();
  if(S.screen==="transfer") return renderTransfer();
  if(S.screen==="history") return renderHistory();
  if(S.screen==="portal") return renderPortal();
  if(S.screen==="sandbox") return renderSandbox();
}

export function renderLoading(){
  app.innerHTML = `<div class="loading">読み込み中…<br>
    <button class="link" id="ld-guest" style="margin-top:16px">アカウントなしで使う（この端末のみ）</button></div>`;
  const g=document.getElementById("ld-guest"); if(g)g.onclick=()=>{ state.guestMode=true; S.screen="home"; render(); };
}

export function authErrorMsg(e){
  const c=(e&&(e.code||e.message))||"";
  if(c.indexOf("email-already-in-use")>=0) return "このメールアドレスは既に登録されています。「ログイン」に切り替えてください。";
  if(c.indexOf("invalid-email")>=0) return "メールアドレスの形式が正しくありません。";
  if(c.indexOf("weak-password")>=0) return "パスワードは6文字以上にしてください。";
  if(c.indexOf("wrong-password")>=0 || c.indexOf("invalid-credential")>=0) return "メールアドレスまたはパスワードが違います。";
  if(c.indexOf("user-not-found")>=0) return "アカウントが見つかりません。新規登録してください。";
  if(c.indexOf("too-many-requests")>=0) return "試行回数が多すぎます。少し時間をおいて再度お試しください。";
  if(c.indexOf("operation-not-allowed")>=0) return "メール認証が有効化されていません（Firebaseの設定が必要です）。";
  if(c.indexOf("network")>=0) return "通信エラーです。ネット接続を確認してください。";
  return "エラー: " + ((e&&e.message)||c||"不明");
}

export function renderAuth(){
  const signup = state.authMode==="signup";
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-title">${signup?"アカウント作成":"ログイン"}</div>
      <div class="auth-sub">${signup
        ? "メールとパスワードでアカウントを作成すると、スコア・BP・復習データがアカウントに保存され、機種変更やアプリの更新後もログインすれば引き継げます。"
        : "登録済みのメールアドレスとパスワードでログインしてください。"}</div>
      <input id="auth-email" class="auth-input" type="email" placeholder="メールアドレス" autocomplete="email" inputmode="email">
      <input id="auth-pw" class="auth-input" type="password" placeholder="パスワード（6文字以上）" autocomplete="${signup?"new-password":"current-password"}">
      <div id="auth-msg" class="auth-msg"></div>
      <button class="cta" id="auth-go" style="margin-top:4px">${signup?"アカウントを作成":"ログイン"}</button>
      <button class="ghost" id="auth-switch">${signup?"すでにアカウントをお持ちの方はログイン":"新規登録はこちら"}</button>
      <button class="link" id="auth-guest">アカウントなしで使う（この端末のみ・同期なし）</button>
    </div>
  `;
  const emailEl=document.getElementById("auth-email");
  const pwEl=document.getElementById("auth-pw");
  const msg=document.getElementById("auth-msg");
  document.getElementById("auth-switch").onclick=()=>{ state.authMode = signup?"login":"signup"; render(); };
  document.getElementById("auth-guest").onclick=()=>{ state.guestMode=true; S.screen="home"; render(); };
  document.getElementById("auth-go").onclick=async ()=>{
    if(state.authBusy) return;
    const email=(emailEl.value||"").trim(), pw=pwEl.value||"";
    if(!email || !pw){ msg.style.color="var(--gold)"; msg.textContent="メールアドレスとパスワードを入力してください。"; return; }
    if(!window.Auth){ msg.style.color="var(--bad)"; msg.textContent="認証の準備中です。少し待って再度お試しください。"; return; }
    state.authBusy=true; msg.style.color="var(--muted)"; msg.textContent="処理中…";
    try{
      if(signup) await window.Auth.signup(email,pw);
      else await window.Auth.login(email,pw);
      // 成功すると onAuthStateChanged が発火し、自動でホームへ切り替わります
    }catch(e){
      msg.style.color="var(--bad)"; msg.textContent=authErrorMsg(e);
    }finally{ state.authBusy=false; }
  };
  window.scrollTo(0,0);
}

export async function logout(){
  try{ if(window.Auth) await window.Auth.logout(); }catch(e){}
  // 別の人のデータが残らないよう、全資格のローカルデータを消去（クラウドには残っています）
  try{
    CERTS.forEach(c=>{
      localStorage.removeItem("cert_"+c.id+"_bp");
      localStorage.removeItem("cert_"+c.id+"_wrong");
      localStorage.removeItem("cert_"+c.id+"_history");
    });
    localStorage.removeItem("profile_name");
    localStorage.removeItem("coins");
    MISSIONS.forEach(mn=>localStorage.removeItem("portal_done_"+mn.id));
  }catch(e){}
  state.cloudData=null; state.currentUser=null; state.currentUserId=null; state.profileChecked=false; S.coins=0;
  S.clearedMissions=[]; S.infra={vnet:false,vnetPrefix:"",subnets:[],lb:false};
  S.cert=null; S.screen="select"; state.authMode="login"; render();
}

// 退会：認証アカウントと個人データを削除し、ローカルを消去してログイン画面へ

export async function deleteAccount(password){
  if(!window.Account) { const e=new Error("not-ready"); e.code="not-ready"; throw e; }
  await window.Account.delete(password);   // 再認証→個人データ削除→認証削除（失敗時は例外）
  // この端末のローカルデータを消去（集計qstatsはサーバー側で保持）
  try{
    CERTS.forEach(c=>{
      localStorage.removeItem("cert_"+c.id+"_bp");
      localStorage.removeItem("cert_"+c.id+"_wrong");
      localStorage.removeItem("cert_"+c.id+"_history");
    });
    localStorage.removeItem("profile_name");
    localStorage.removeItem("coins");
    MISSIONS.forEach(mn=>localStorage.removeItem("portal_done_"+mn.id));
  }catch(e){}
  // 認証削除で onAuthStateChanged(null) が発火しログイン画面へ遷移するが、保険で状態も初期化
  state.cloudData=null; state.currentUser=null; state.currentUserId=null; state.profileChecked=false; state.guestMode=false; S.coins=0;
  S.clearedMissions=[]; S.infra={vnet:false,vnetPrefix:"",subnets:[],lb:false};
  S.cert=null; S.screen="select"; state.authMode="login"; render();
}

// 退会の確認モーダル（パスワード再入力＋最終確認）

export function openDeleteModal(){
  if(state.guestMode || !state.currentUser) return;
  const ov=document.createElement("div");
  ov.className="modal-ov";
  ov.innerHTML=`
    <div class="modal">
      <div class="modal-title">⚠️ アカウントを削除（退会）</div>
      <div class="modal-body">本当に削除しますか？<b>この操作は取り消せません。</b><br>アカウント情報・スコア・履歴・ランキング登録がすべて削除されます。<br><br>確認のため、パスワードを入力してください。</div>
      <input type="password" id="del-pw" class="auth-input" placeholder="パスワード" autocomplete="current-password">
      <div id="del-msg" class="auth-msg"></div>
      <button class="cta danger-solid" id="del-go">削除を実行する</button>
      <button class="ghost" id="del-cancel" style="margin-top:8px">キャンセル</button>
    </div>`;
  document.body.appendChild(ov);
  const close=()=>{ try{ ov.remove(); }catch(e){} };
  const msg=ov.querySelector("#del-msg");
  ov.querySelector("#del-cancel").onclick=close;
  ov.addEventListener("click",(e)=>{ if(e.target===ov) close(); });
  ov.querySelector("#del-go").onclick=async ()=>{
    const pw=(ov.querySelector("#del-pw").value||"");
    if(!pw){ msg.style.color="var(--gold)"; msg.textContent="パスワードを入力してください。"; return; }
    msg.style.color="var(--muted)"; msg.textContent="削除処理中…";
    ov.querySelector("#del-go").disabled=true;
    try{
      await deleteAccount(pw);
      close();   // 成功後はログイン画面へ遷移済み
    }catch(e){
      const code=(e&&e.code)||"";
      let t="削除に失敗しました。時間をおいて再度お試しください。";
      if(code.indexOf("wrong-password")>=0 || code.indexOf("invalid-credential")>=0) t="パスワードが正しくありません。";
      else if(code.indexOf("too-many-requests")>=0) t="試行回数が多すぎます。しばらくしてから再度お試しください。";
      else if(code.indexOf("network")>=0) t="通信エラーです。接続を確認してください。";
      else if(code==="no-user") t="ログイン状態を確認できません。再ログインしてからお試しください。";
      msg.style.color="var(--bad)"; msg.textContent=t;
      ov.querySelector("#del-go").disabled=false;
    }
  };
}

// アカウント作成直後など、ユーザー名が未設定のときに表示（空欄不可・重複不可）

export function renderUsername(){
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-title">ユーザー名を設定</div>
      <div class="auth-sub">ランキングに表示される名前です。他の人と重複しない名前を入力してください（後からプロフィールで変更できます）。</div>
      <input id="un-name" class="auth-input" maxlength="16" placeholder="例：くらうど太郎" autocomplete="off">
      <div id="un-msg" class="auth-msg"></div>
      <button class="cta" id="un-go">この名前で決定</button>
    </div>
  `;
  const nameEl=document.getElementById("un-name");
  const msg=document.getElementById("un-msg");
  document.getElementById("un-go").onclick=async ()=>{
    const v=(nameEl.value||"").trim();
    if(!v){ msg.style.color="var(--gold)"; msg.textContent="ユーザー名を入力してください（空にはできません）。"; return; }
    if(!window.LB){ msg.style.color="var(--bad)"; msg.textContent="準備中です。少し待って再度お試しください。"; return; }
    msg.style.color="var(--muted)"; msg.textContent="重複を確認中…";
    try{
      const taken = await window.LB.nameTaken(v);
      if(taken){ msg.style.color="var(--bad)"; msg.textContent="その名前はすでに使われています。別の名前にしてください。"; return; }
      setProfileName(v);
      publishLeaderboard();        // ユーザー名でランキングへ登録
      S.screen="select"; render(); // ユーザー名設定後、資格選択へ
    }catch(e){
      msg.style.color="var(--bad)"; msg.textContent="確認に失敗しました。通信環境を確認して再度お試しください。";
    }
  };
  window.scrollTo(0,0);
}

export function renderHome(){
  const h=loadHist();
  const c=certById(S.cert)||{};
  const ov=overallStat();
  const bp=getBP(); // 現在の資格の獲得ビルドポイント(EXP)

  // 統計データの集計
  const examHistory = h.filter(x => x.mode === "exam");
  const examPlays = examHistory.length;
  const examBest = examPlays > 0 ? examHistory.reduce((m, x) => Math.max(m, x.score), 0) : 0;
  const examAvg = examPlays > 0 ? Math.round(examHistory.reduce((s, x) => s + x.score, 0) / examPlays) : 0;

  const practiceHistory = h.filter(x => x.mode === "practice");
  const practiceQuestions = practiceHistory.reduce((s, x) => s + (x.total || 0), 0);

  app.innerHTML = `
    <div class="q-head" style="margin-bottom:14px">
      <button class="quit" data-go="select">← 資格選択</button>
      <span class="q-count" style="color:${c.accent||'var(--accent)'}">${esc(c.code||"")}</span>
    </div>

    ${state.practicePick ? `
    <div class="pcount-wrap">
      <div class="pcount-lab">📝 演習モード・問題数を選択</div>
      <div class="pcount">
        <button class="pcount-btn" data-pc="5">5問</button>
        <button class="pcount-btn" data-pc="10">10問</button>
        <button class="pcount-btn" data-pc="15">15問</button>
      </div>
      <button class="link" data-pcancel>キャンセル</button>
    </div>` : `
    <button class="cta" data-practice>📝 演習モード</button>`}
    
    <button class="cta cta-exam" data-mode="exam" style="margin-top:12px">🎯 試験モード</button>

    <div class="an-card" style="margin-top:16px; background:rgba(255,255,255,0.85);">
      <div class="an-ttl" style="display:flex; align-items:center; gap:6px; font-size:14px; color:var(--text);">
        📊 ${esc(c.code)} 学習統計ダッシュボード
      </div>
      <div class="an-aggro" style="display:grid; grid-template-columns: repeat(2, 1fr); gap:10px; margin-top:12px;">
        <div class="an-ag" style="background:var(--bg); padding:10px; border-radius:10px; text-align:center;">
          <div class="an-ag-num" style="font-size:20px; font-weight:800; color:var(--accent);">${practiceQuestions}<small style="font-size:11px; font-weight:600; color:var(--muted); margin-left:2px;">問</small></div>
          <div class="an-ag-lab" style="font-size:10.5px; color:var(--muted); margin-top:2px;">演習解いた問題数</div>
        </div>
        <div class="an-ag" style="background:var(--bg); padding:10px; border-radius:10px; text-align:center;">
          <div class="an-ag-num" style="font-size:20px; font-weight:800; color:var(--gold);">${examPlays}<small style="font-size:11px; font-weight:600; color:var(--muted); margin-left:2px;">回</small></div>
          <div class="an-ag-lab" style="font-size:10.5px; color:var(--muted); margin-top:2px;">試験モード実施回数</div>
        </div>
        <div class="an-ag" style="background:var(--bg); padding:10px; border-radius:10px; text-align:center; grid-column: span 1;">
          <div class="an-ag-num" style="font-size:16px; font-weight:800; color:var(--text); line-height:1.2;">
            <span style="color:var(--good);">${examBest}</span><span style="font-size:11px; color:var(--muted); font-weight:500;"> / ${examAvg}</span>
          </div>
          <div class="an-ag-lab" style="font-size:10.5px; color:var(--muted); margin-top:2px;">試験最高得点 / 平均点</div>
        </div>
        <div class="an-ag" style="background:var(--bg); padding:10px; border-radius:10px; text-align:center;">
          <div class="an-ag-num" style="font-size:18px; font-weight:800; color:var(--good);">⚡ ${bp.toLocaleString()}</div>
          <div class="an-ag-lab" style="font-size:10.5px; color:var(--muted); margin-top:2px;">現在の獲得経験値(BP)</div>
        </div>
      </div>
    </div>

    ${(loadWrong().length)?`<button class="ghost rev-btn" data-review style="margin-top:12px">🔁 復習モード（間違えた ${loadWrong().length} 問）</button>`:`<div class="x-hint" style="margin-top:12px;text-align:center">復習モード：間違えた問題がここに溜まり、再挑戦できます</div>`}
    <button class="ghost" data-go="dict" style="margin-top:10px">📖 用語辞典</button>
    <button class="ghost" data-go="analytics" style="margin-top:10px">📊 統計パネル </button>
    <button class="ghost" data-go="portal" style="margin-top:10px">🧪 Azure デモ環境 </button>
    <button class="ghost" data-go="settings" style="margin-top:10px">⚙️ 設定</button>
    ${h.length?`<button class="link" data-go="history">スコア履歴を見る（${h.length}件）</button>`:
      `<div class="install">ヒント：ブラウザの共有メニューから「ホーム画面に追加」すると、アプリのように起動できます。</div>`}
    ${state.currentUser
      ? `<div class="acct-bar">👤 ${esc(state.currentUser.email||"ログイン中")}<button class="link2" data-logout>ログアウト</button></div>`
      : (state.guestMode ? `<div class="acct-bar">ゲストモード（この端末のみ・同期なし）<button class="link2" data-login>ログイン / 新規登録</button></div>` : "")}
  `;
  app.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>start(b.dataset.mode));
  const prn=app.querySelector("[data-practice]"); if(prn)prn.onclick=()=>{ state.practicePick=true; render(); };
  const pcn=app.querySelector("[data-pcancel]"); if(pcn)pcn.onclick=()=>{ state.practicePick=false; render(); };
  app.querySelectorAll("[data-pc]").forEach(b=>b.onclick=()=>start("practice", +b.dataset.pc));
  const rv=app.querySelector("[data-review]"); if(rv)rv.onclick=()=>startReview();
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  const lo=app.querySelector("[data-logout]"); if(lo)lo.onclick=()=>logout();
  const li=app.querySelector("[data-login]"); if(li)li.onclick=()=>{ state.guestMode=false; state.authMode="login"; render(); };
}

export function renderQuiz(){
  const q=S.deck[S.idx], pct=(S.idx/S.deck.length)*100, multi=isMulti(q);
  app.innerHTML = `
    <div class="q-head">
      <button class="quit" data-go="home">✕ 中断</button>
      <span class="q-count">${S.review?'<span class="rev-tag-q">🔁 復習</span> ':(S.mode==="practice"?'<span class="mode-tag practice">📝 演習</span> ':'<span class="mode-tag exam">🎯 試験</span> ')}${S.idx+1} <em>/ ${S.deck.length}</em></span>
    </div>
    <div class="progress"><div class="progress-fill" style="width:${pct}%"></div></div>
    <div class="q-badge"><span class="stars">${stars(q.imp)}</span><span>重要度 ${q.imp}</span><span class="pts">${pts(q)} 点</span>${multi?`<span class="multi">複数選択（${q.c.length}つ）</span>`:""}</div>
    <p class="q-text">${esc(q.q)}</p>
    <div class="opts">
      ${q.o.map((opt,i)=>{
        const picked=S.sel.indexOf(i)>=0;
        return `<button class="opt${picked?" picked":""}" data-pick="${i}">
          <span class="opt-key${multi?" box":""}">${L[i]}</span><span class="opt-label">${esc(opt)}</span></button>`;
      }).join("")}
    </div>
    <button class="cta" data-commit ${S.sel.length===0?"disabled":""}>${S.idx+1<S.deck.length?"次の問題へ":"採点する"}</button>
  `;
  app.querySelectorAll("[data-pick]").forEach(b=>b.onclick=()=>pick(+b.dataset.pick));
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  const cm=app.querySelector("[data-commit]"); if(cm)cm.onclick=commit;
}

export function renderResult(){
  const e=S.last;
  const max = e.scoreMax || 1000;
  const ratio = max ? Math.min(1, e.score/max) : 0;
  const R=80, C=2*Math.PI*R, off=C*(1-ratio);
  const isExam = (e.mode==="exam");
  const isPractice = (e.mode==="practice");
  const passed = isExam ? (e.score>=PASS) : (ratio>=0.7);
  const t={high:[0,0],mid:[0,0],low:[0,0]};
  S.deck.forEach((q,i)=>{ const k=q.imp>=4?"high":(q.imp===3?"mid":"low"); t[k][1]++; if(grade(q,S.picks[i]).full)t[k][0]++; });
  const TLAB={high:"重要度 高 (4-5)", mid:"重要度 中 (3)", low:"重要度 低 (1-2)"};
  const gain = (e.bpGain!=null) ? e.bpGain : e.score;
  let expLine, verdictTxt, verdictPass, subLine;
  if(isPractice){
    expLine = "演習モード：獲得した配点合計がそのまま EXP";
    verdictTxt = "演習完了"; verdictPass = ratio>=0.7;
    subLine = `獲得 ${e.score} / ${max} 点（実際の配点合計・部分点込み・小数切り上げ）`;
  } else if(e.mode==="review"){
    expLine = "復習：点数がそのまま EXP";
    verdictTxt = "復習完了"; verdictPass = e.score>=PASS;
    subLine = `獲得 ${e.earned} / ${e.totalPts} 点 → 1000点換算で ${e.score} 点`;
  } else { // 試験モード（1000点満点換算・従来どおり）
    expLine = gain>0 ? `試験モード：${e.score}点 × ${e.mult} = ${gain} EXP` : "試験モード：700点未満のため EXP 獲得なし";
    verdictPass = passed; verdictTxt = passed ? "合格！ボーナス EXP 獲得" : "不合格（700点未満）・EXP なし";
    subLine = `獲得 ${e.earned} / ${e.totalPts} 点（重み付け・部分点込み）→ 1000点換算で ${e.score} 点`;
  }
  app.innerHTML = `
    <div class="gauge-wrap">
      <svg viewBox="0 0 200 200" class="gauge">
        <circle cx="100" cy="100" r="${R}" class="gauge-bg"></circle>
        <circle cx="100" cy="100" r="${R}" class="gauge-fg ${verdictPass?"pass":"fail"}"
          stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 100 100)"></circle>
      </svg>
      <div class="gauge-mid"><div class="gauge-score">${e.score}</div><div class="gauge-max">/ ${max}</div></div>
    </div>
    <div class="verdict ${verdictPass?"pass":"fail"}">${verdictTxt}</div>
    <div class="result-meta">完全正解 ${e.correct} / ${e.total} 問</div>
    <div class="result-sub">${subLine}</div>
    <div class="breakdown">
      ${Object.keys(t).filter(k=>t[k][1]>0).map(k=>`
        <div class="bd-row"><span class="bd-lab" style="width:96px">${TLAB[k]}</span>
        <div class="bd-bar"><div class="bd-fill" style="width:${t[k][0]/t[k][1]*100}%"></div></div>
        <span class="bd-num">${t[k][0]}/${t[k][1]}</span></div>`).join("")}
    </div>
    <div class="bp-card">
      <div class="bp-row"><span>⚡ 獲得EXP</span><span class="bp-gain">+${gain} EXP</span></div>
      <div class="bp-exp-line">${esc(expLine)}</div>
      <div class="bp-total">資格内＆全体レベルに加算 ・ 累計 ${(e.bpTotal||getBP()).toLocaleString()} BP</div>
      ${(e.unlocked&&e.unlocked.length)?`<div class="bp-unlock">🎉 新たに稼働：${e.unlocked.map(esc).join("、")}</div>`:""}
      <button class="bp-link" data-go="analytics">📊 全ユーザーの統計を見る →</button>
    </div>
    <div class="coin-card">
      <div class="coin-row"><span class="coin-ic">💰</span><span class="coin-gain">+${(e.coinGain!=null?e.coinGain:0)} AC 獲得！</span></div>
      <div class="coin-total">現在の総所持：${(e.coinTotal!=null?e.coinTotal:(S.coins||0)).toLocaleString()} AC</div>
    </div>
    <div class="actions">
      <button class="cta" data-go="review">解答・解説を確認</button>
      <button class="ghost" data-retry>もう一度挑戦</button>
      <button class="ghost" data-go="home">🏠 ホームへ戻る</button>
    </div>
  `;
  requestAnimationFrame(()=>{ const c=app.querySelector(".gauge-fg"); if(c)c.style.strokeDashoffset=off; });
  app.querySelector("[data-retry]").onclick=()=>{ if(S.review){ if(loadWrong().length) startReview(); else go("home"); } else start(S.mode); };
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
}

export function renderReview(){
  const rows = S.deck.map((q,i)=>{
    const sel=S.picks[i]||[], cor=correctSet(q), g=grade(q,sel), W=pts(q), multi=isMulti(q);
    let kind,label;
    if(g.full){ kind="ok"; label="正解"; }
    else if(g.earned>0){ kind="partial"; label="一部正解"; }
    else { kind="ng"; label="不正解"; }
    const opts = q.o.map((opt,j)=>{
      const isCor=cor.indexOf(j)>=0, picked=sel.indexOf(j)>=0;
      let cls="opt"; let mark="";
      if(isCor){ cls+=" correct"; mark='<span class="opt-mark">✓</span>'; }
      else if(picked){ cls+=" wrong"; mark='<span class="opt-mark">✕</span>'; }
      else cls+=" dim";
      return `<div class="${cls}"><span class="opt-key${multi?" box":""}">${L[j]}</span><span class="opt-label">${esc(opt)}</span>${mark}</div>`;
    }).join("");
    const earnTxt = `獲得 ${Math.round(g.earned*10)/10} / ${W} 点`;
    return `<div class="review-q">
      <div class="review-num"><span>第 ${i+1} 問 ・ 重要度 ${q.imp}${multi?" ・ 複数選択":""}</span><span class="rv-tag ${kind}">${label}・${earnTxt}</span></div>
      <p class="q-text">${esc(q.q)}</p>
      <div class="opts">${opts}</div>
      <div class="expl ${kind}"><strong>解説</strong><span>${esc(q.e)}</span></div>
      <div class="qstat" id="qstat-${q.id}">📊 全体正答率：<span class="qstat-v">—</span></div>
    </div>`;
  }).join("");
  app.innerHTML = `
    <div class="q-head"><button class="quit" data-go="result">← 結果へ</button><span class="q-count">解答・解説</span></div>
    ${rows}
    <button class="ghost" data-go="home">🏠 ホームへ戻る</button>
  `;
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  loadReviewStats();
  window.scrollTo(0,0);
}

// 正答率（%）：correct/attempts×100 を小数第1位（第2位四捨五入）で。データ無しはnull

export function renderHistory(){
  const h=loadHist();
  if(!h.length){
    app.innerHTML=`<div class="q-head"><button class="quit" data-go="home">🏠 ホーム</button><span class="q-count">履歴</span></div>
      <div class="empty">まだ記録がありません。<br>問題を解くとここにスコアが残ります。</div>`;
    app.querySelector("[data-go]").onclick=()=>go("home"); return;
  }
  const recent=h.slice(0,12).reverse();
  const rOf = x => { const mx=x.scoreMax||1000; return mx? Math.min(1, x.score/mx) : 0; };
  app.innerHTML = `
    <div class="q-head"><button class="quit" data-go="home">🏠 ホーム</button><span class="q-count">履歴</span></div>
    <div class="chart">
      ${recent.map(x=>`<div class="chart-col">
        <div class="chart-bar-track"><div class="chart-bar ${rOf(x)>=0.7?"pass":"fail"}" style="height:${rOf(x)*100}%"></div></div>
        <span class="chart-val">${x.score}</span></div>`).join("")}
      <div class="chart-passline" style="bottom:70%"><span>70%</span></div>
    </div>
    <div class="hist-list">
      ${h.map(x=>`<div class="hist-row">
        <div class="hist-left"><span class="hist-mode">${x.modeLabel||"ランダム"}</span><span class="hist-date">${fmt(x.date)}</span></div>
        <div class="hist-right"><span class="hist-score ${rOf(x)>=0.7?"pass":"fail"}">${x.score}<small>/${x.scoreMax||1000}</small></span><span class="hist-correct">${x.correct}/${x.total}</span></div>
      </div>`).join("")}
    </div>
  `;
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go("home"));
}


/* ======================= 用語辞典のデータ ======================= */
/* 各用語: t=用語, m=説明（定義）, k=重要ポイント */

export let dictSort = "theme"; // theme | aiueo

export function renderDict(){
  const items = CONCEPTS.map((c,i)=>({c,i}));
  if(dictSort==="aiueo") items.sort((a,b)=>a.c.t.localeCompare(b.c.t,"ja"));
  app.innerHTML = `
    <div class="q-head"><button class="quit" data-go="home">🏠 ホーム</button><span class="q-count">用語辞典</span></div>
    <input id="dict-search" class="dict-search" placeholder="用語を検索（例：RBAC、冗長、ゼロトラスト）" autocomplete="off">
    <div class="dict-bar">
      <span id="dict-count">${CONCEPTS.length} 語</span>
      <button id="dict-sort" class="dict-sortbtn">${dictSort==="theme"?"並び：テーマ順":"並び：あいうえお順"}</button>
    </div>
    <div id="dict-list">
      ${items.map(({c})=>`
        <div class="dict-card" data-text="${esc((c.t+' '+c.m+' '+c.k.map(k=>k.l).join(' ')).toLowerCase())}">
          <div class="dict-term">${esc(c.t)}</div>
          <div class="dict-def">${esc(c.m)}</div>
          ${c.k.length?`<div class="dict-points">${c.k.map(k=>`<span class="dict-pt">${esc(k.l)}</span>`).join("")}</div>`:""}
        </div>`).join("")}
    </div>
  `;
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  const sb=document.getElementById("dict-search");
  const list=document.getElementById("dict-list");
  const cnt=document.getElementById("dict-count");
  if(sb) sb.oninput=()=>{
    const q=sb.value.trim().toLowerCase(); let n=0;
    list.querySelectorAll(".dict-card").forEach(card=>{
      const show=!q || card.dataset.text.indexOf(q)>=0;
      card.style.display=show?"":"none"; if(show)n++;
    });
    cnt.textContent = q ? (n+" 語 ヒット") : (CONCEPTS.length+" 語");
  };
  const srt=document.getElementById("dict-sort");
  if(srt) srt.onclick=()=>{ dictSort = dictSort==="theme"?"aiueo":"theme"; render(); };
  window.scrollTo(0,0);
}

/* ======================= データセンター育成 ======================= */

export function worldMapSVG(n){
  const dots = REGIONS.map(r=>{
    const on = n>=r.lv;
    return `<g class="rg ${on?'on':'off'}">
      ${on?`<circle class="rg-glow" cx="${r.x}" cy="${r.y}" r="7"/>`:''}
      <circle class="rg-dot" cx="${r.x}" cy="${r.y}" r="${on?3:2}"/>
      ${on?`<text class="rg-nm" x="${r.x}" y="${r.y-8}">${esc(r.name)}</text>`:''}
    </g>`;
  }).join("");
  const grat = [26,52,78,104].map(y=>`<line x1="0" y1="${y}" x2="320" y2="${y}"/>`).join("")
             + [64,128,192,256].map(x=>`<line x1="${x}" y1="0" x2="${x}" y2="130"/>`).join("");
  return `<svg class="scene-map" viewBox="0 0 320 130" preserveAspectRatio="xMidYMid slice">
    <g class="grat">${grat}</g>
    <g class="land">
      <path d="M30,30 L70,26 L88,46 L80,72 L96,96 L86,116 L66,112 L58,84 L40,66 L34,46 Z"/>
      <path d="M150,26 L182,30 L188,52 L172,74 L176,96 L160,104 L150,82 L156,58 L146,42 Z"/>
      <path d="M205,28 L280,24 L300,44 L282,58 L250,62 L232,52 L210,50 Z"/>
      <path d="M276,96 L302,98 L300,114 L280,112 Z"/>
    </g>
    ${dots}
  </svg>`;
}

export function homeScene(){
  const bp=getBP(), n=dcCount(bp), ph=dcPhase(n);
  
  // 🔥 【追加】デフォルト背景（b1〜b4）の代わりに購入したスキン背景のクラスを適用
  const currentSkin = S.currentSkin || "default";
  const skinClass = "sb-theme-" + currentSkin;

  const band=ph.band;
  const starN = band==="b4"?16:(band==="b3"?9:0);
  let stars="";
  for(let i=0;i<starN;i++){ stars+=`<span class="scene-star" style="left:${(i*37%92)+3}%;top:${(i*29%48)+6}%;animation-delay:${(i%5)*0.4}s"></span>`; }
  let body;
  if(ph.worldmap){
    body = worldMapSVG(n);
  } else {
    const ons=TIERS.filter(t=>bp>=t.bp);
    const sizes=[26,31,24,33,28,35,25,30,23,34,27,32];
    const builds = ons.map((t,i)=>`<span class="scene-b" style="font-size:${sizes[i%sizes.length]}px">${t.icon}</span>`).join("");
    const next=TIERS.find(t=>t.bp>bp);
    const tail = next?`<span class="scene-ghost">🏗️</span>`:"";
    body = `<div class="scene-ground">${builds}${tail}</div>`;
  }
  
  // 🔥 【修正】クラス名に ${skinClass} を上書き合体
  return `<div class="home-scene ${skinClass}">
    ${stars}
    <div class="scene-info"><span class="scene-lvl">Lv.${n}</span><span class="scene-bp">${bp.toLocaleString()} BP</span></div>
    ${body}
  </div>`;
}


export function renderAnalytics(){
  // 匿名化された試験モードのスコア分布（モック集計データ：0-99 … 900-1000 の10区間）
  const bins   = [2,5,9,16,28,44,63,52,30,14];
  const labels = ["0","100","200","300","400","500","600","700","800","900"];
  const total = bins.reduce((a,b)=>a+b,0);
  const maxv  = Math.max(...bins);
  const avg   = Math.round(bins.reduce((s,c,i)=>s + c*(i*100+50), 0) / total);
  const passCount = bins.slice(7).reduce((a,b)=>a+b,0);   // 700点以上
  const passRate  = Math.round(passCount/total*100);

  const barsHTML = bins.map((c,i)=>{
    const h = Math.max(4, Math.round(c/maxv*100));
    const isPass = i>=7;
    return `<div class="an-bar-wrap">
      <div class="an-bar ${isPass?'an-pass':''}" style="height:${h}%"><span class="an-bar-v">${c}</span></div>
      <div class="an-bar-x">${labels[i]}</div>
    </div>`;
  }).join("");

  // 直近クリアした匿名エンジニア5名（モック・毎回更新でシャッフル）
  const hex = ()=>Math.floor(Math.random()*0xffff).toString(16).toUpperCase().padStart(4,"0");
  const logHTML = Array.from({length:5}).map((_,i)=>{
    const sc = 480 + Math.floor(Math.random()*520);   // 480〜999点
    const ok = sc>=700;
    return `<div class="an-log-row ${ok?'ok':'ng'}" style="animation-delay:${i*0.06}s">
      <span class="an-log-id">エンジニア${hex()}</span>
      <span class="an-log-arrow">➔</span>
      <span class="an-log-score">${sc}点</span>
      <span class="an-log-judge">${ok?'合格！':'不合格'}</span>
    </div>`;
  }).join("");

  app.innerHTML = `
    <div class="q-head"><button class="quit" data-go="${S.cert?'home':'select'}">← 戻る</button><span class="q-count">統計パネル</span></div>
    <div class="an-card">
      <div class="an-ttl">全ユーザーの試験モード結果</div>
      <div class="an-sub">匿名化されたスコア分布（0〜1000点）</div>
      <div class="an-chart">
        <div class="an-passline"><span>合格 700</span></div>
        ${barsHTML}
      </div>
      <div class="an-aggro">
        <div class="an-ag"><div class="an-ag-num">${avg}</div><div class="an-ag-lab">全ユーザー平均点</div></div>
        <div class="an-ag"><div class="an-ag-num">${passRate}<small>%</small></div><div class="an-ag-lab">合格率（700点以上）</div></div>
        <div class="an-ag"><div class="an-ag-num">${total.toLocaleString()}</div><div class="an-ag-lab">集計サンプル数</div></div>
      </div>
    </div>
    <div class="an-card">
      <div class="an-ttl">📡 直近クリアした匿名エンジニア</div>
      <div class="an-log">${logHTML}</div>
      <button class="ghost" id="an-refresh" style="margin-top:10px">🔄 最新を取得</button>
    </div>
  `;
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  const rf=document.getElementById("an-refresh"); if(rf) rf.onclick=()=>renderAnalytics();
  window.scrollTo(0,0);
}

/* ======================= データ引き継ぎ（保存・復元） ======================= */

export function renderTransfer(){
  const code=exportCode();
  const h=loadHist();
  app.innerHTML = `
    <div class="q-head"><button class="quit" data-go="home">🏠 ホーム</button><span class="q-count">データ引き継ぎ</span></div>
    <p class="x-hint" style="margin-top:0;margin-bottom:14px">スコア履歴・ビルドポイント・復習リストを1本のコードにまとめて保存／復元できます。アカウント登録は不要です。</p>

    <div class="x-sub" style="margin-top:0">① 引き継ぎコードを書き出す</div>
    <p class="x-hint" style="margin-top:0;margin-bottom:8px">下のコードをメモ帳などにコピーして保管してください（履歴 ${h.length}件・${getBP().toLocaleString()} BP）。</p>
    <textarea id="tf-out" class="x-area" readonly style="min-height:96px;font-size:12px">${esc(code)}</textarea>
    <button class="cta" id="tf-copy" style="margin-top:10px">コードをコピー</button>

    <div class="dc-sub">② コードから復元する</div>
    <p class="x-hint" style="margin-top:0;margin-bottom:8px">控えておいたコードを貼り付けて復元します。<b style="color:var(--gold)">この端末の現在のデータは上書き</b>されます。</p>
    <textarea id="tf-in" class="x-area" placeholder="AZ9-... を貼り付け" style="min-height:96px;font-size:12px"></textarea>
    <button class="ghost" id="tf-load" style="margin-top:10px">このコードで復元する</button>
    <div id="tf-msg" class="x-hint" style="margin-top:12px"></div>
  `;
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  const msg=document.getElementById("tf-msg");
  const setMsg=(t,c)=>{ msg.innerHTML=t; msg.style.color=c||"var(--muted)"; };

  document.getElementById("tf-copy").onclick=()=>{
    const ta=document.getElementById("tf-out");
    ta.focus(); ta.select(); ta.setSelectionRange(0,99999);
    let ok=false;
    try{ ok=document.execCommand("copy"); }catch(e){}
    if(navigator.clipboard){ navigator.clipboard.writeText(ta.value).then(()=>{},()=>{}); ok=true; }
    setMsg(ok?"✓ コピーしました。メモ帳やメールに貼り付けて保管してください。":"自動コピーできませんでした。コードを長押しで選択してコピーしてください。", ok?"var(--good)":"var(--gold)");
  };

  document.getElementById("tf-load").onclick=()=>{
    const v=document.getElementById("tf-in").value;
    if(!v.trim()){ setMsg("コードを貼り付けてください。","var(--gold)"); return; }
    if(!confirm("この端末の現在のデータ（履歴・BP・復習リスト）を、入力したコードの内容で上書きします。よろしいですか？")) return;
    try{
      const obj=importCode(v);
      setMsg("✓ 復元しました（履歴 "+( (obj.hist||[]).length )+"件・"+(obj.bp||0).toLocaleString()+" BP）。ホームに戻ります。","var(--good)");
      setTimeout(()=>go("home"), 900);
    }catch(e){
      setMsg("⚠ "+esc(String(e.message||e))+"。コードをもう一度確認してください。","var(--bad)");
    }
  };
  window.scrollTo(0,0);
}

/* ======================= 複数資格対応 ======================= */
/* 資格レジストリ。資格を増やすときはここに1要素足すだけ。
   status:"ready" … 学習可能 / "coming" … 近日公開（ロック表示）          */
/* ======================= SC-300 のデータ ======================= */
/* SC-300: Microsoft Identity and Access Administrator（IDとアクセスの管理）*/

export function renderSelect(){
  const ov = overallStat();
  const cards = CERTS.map(c=>{
    if(c.status!=="ready"){
      return `<div class="cert-card locked">
        <div class="cert-top"><span class="cert-code">${esc(c.code)}</span><span class="cert-soon">🔒 近日公開</span></div>
        <div class="cert-name">${esc(c.name)}</div>
        <div class="cert-sub">${esc(c.sub||"")}</div>
      </div>`;
    }
    const st = certStat(c);
    const started = st.plays>0;
    return `<button class="cert-card" data-cert="${c.id}" style="--ca:${c.accent}">
      <div class="cert-top"><span class="cert-code">${esc(c.code)}</span><span class="cert-go">${started?"学習を続ける":"はじめる"} →</span></div>
      <div class="cert-name">${esc(c.name)}</div>
      <div class="cert-sub">${esc(c.sub||"")}</div>
      <div class="cert-pool">出題プール：${(c.Q||[]).length} 問</div>
      <div class="cert-stats">
        <span>Lv.${st.lvl}<small>/${st.tiers}</small></span>
        <span>最高 ${st.best}</span>
        <span>${st.plays} 回</span>
      </div>
    </button>`;
  }).join("");
  app.innerHTML = `
    <div class="me-hero">
      <div class="me-top">
        <div>
          <div class="me-lab">総合エンジニアレベル</div>
          <div class="me-lvrow"><span class="me-lv">Lv.${ov.lv}</span><span class="me-title">${esc(ov.title)}</span></div>
        </div>
        <div class="me-bp">${ov.tbp.toLocaleString()} BP</div>
      </div>
      <div class="me-prog"><div class="me-prog-f" style="width:${ov.pct}%"></div></div>
      <div class="me-next">次のレベルまで ${ov.remain.toLocaleString()} BP ・ 学習中 ${ov.active} 資格 ・ 💰 ${(S.coins||0).toLocaleString()} AC</div>
    </div>
    <div class="me-actions">
      <button class="me-btn" data-go="ranking">🏆 ランキング</button>
      <button class="me-btn" data-go="profile">👤 プロフィール</button>
    </div>
    <div class="sel-head">
      <span class="eyebrow">MICROSOFT 認定対策</span>
      <h2 class="sel-title">資格を選ぶ</h2>
      <p class="sel-sub">学習したい資格を選んでください。資格ごとにスコア・BP・復習データは別々に保存されます。</p>
    </div>
    <div class="cert-list">${cards}</div>
    ${state.currentUser
      ? `<div class="acct-bar">👤 ${esc(state.currentUser.email||"ログイン中")}<button class="link2" data-logout>ログアウト</button></div>`
      : (state.guestMode ? `<div class="acct-bar">ゲストモード（この端末のみ・同期なし）<button class="link2" data-login>ログイン / 新規登録</button></div>` : "")}
  `;
  app.querySelectorAll("[data-cert]").forEach(b=>b.onclick=()=>selectCert(b.dataset.cert));
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  const lo=app.querySelector("[data-logout]"); if(lo)lo.onclick=()=>logout();
  const li=app.querySelector("[data-login]"); if(li)li.onclick=()=>{ state.guestMode=false; state.authMode="login"; render(); };
  window.scrollTo(0,0);
}

/* ======================= プロフィール／ランキング ======================= */

export function renderProfile(){
  const ov=overallStat();
  const name=getProfileName();
  const certRows = CERTS.filter(c=>c.status==="ready").map(c=>{
    const st=certStat(c);
    return `<div class="pf-cert"><span style="color:${c.accent}">${esc(c.code)}</span><span class="pf-cn">${esc(c.name)}</span><span class="pf-cl">Lv.${st.lvl} ・ 最高 ${st.best}</span></div>`;
  }).join("");
  app.innerHTML = `
    <div class="q-head"><button class="quit" data-go="select">← 資格選択</button><span class="q-count">プロフィール</span></div>
    <div class="me-hero">
      <div class="me-lab">総合エンジニアレベル</div>
      <div class="me-lvrow"><span class="me-lv">Lv.${ov.lv}</span><span class="me-title">${esc(ov.title)}</span></div>
      <div class="me-next" style="margin-top:6px">${ov.tbp.toLocaleString()} BP ・ 学習中 ${ov.active} 資格</div>
    </div>
    <div class="dc-sub">ユーザー名</div>
    <input id="pf-name" class="auth-input" maxlength="16" placeholder="例：くらうど太郎" value="${esc(name)}">
    <div id="pf-msg" class="auth-msg"></div>
    <button class="cta" id="pf-save">${state.guestMode?"※ ログインするとランキングに参加できます":"ユーザー名を保存"}</button>
    <div class="x-hint" style="margin-top:8px">ランキングはログイン中、クイズを解くたびに<b style="color:var(--good)">自動で更新</b>されます。ユーザー名は空にできず、他の人と重複しない名前にしてください。</div>
    <div class="dc-sub">資格別レベル</div>
    <div class="pf-list">${certRows}</div>
    <button class="ghost" data-go="ranking" style="margin-top:14px">🏆 ランキングを見る</button>
    ${(!state.guestMode && state.currentUser) ? `
    <div class="danger-zone">
      <div class="dz-title">アカウント削除</div>
      <div class="dz-note">退会するとアカウント情報・スコア・履歴がすべて削除され、元に戻せません。</div>
      <button class="ghost danger" id="pf-del">アカウントを削除する（退会）</button>
    </div>` : ""}
  `;
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  const pd=document.getElementById("pf-del"); if(pd)pd.onclick=openDeleteModal;
  const msg=document.getElementById("pf-msg");
  document.getElementById("pf-save").onclick=async ()=>{
    if(state.guestMode || !state.currentUser){ msg.style.color="var(--gold)"; msg.textContent="ランキングに参加するにはログインが必要です。"; return; }
    const v=(document.getElementById("pf-name").value||"").trim();
    if(!v){ msg.style.color="var(--gold)"; msg.textContent="ユーザー名を入力してください（空にはできません）。"; return; }
    if(v===getProfileName()){ msg.style.color="var(--muted)"; msg.textContent="現在のユーザー名と同じです。"; return; }
    if(!window.LB){ msg.style.color="var(--bad)"; msg.textContent="準備中です。少し待って再度お試しください。"; return; }
    msg.style.color="var(--muted)"; msg.textContent="重複を確認中…";
    try{
      const taken=await window.LB.nameTaken(v);
      if(taken){ msg.style.color="var(--bad)"; msg.textContent="その名前はすでに使われています。別の名前にしてください。"; return; }
      setProfileName(v);
      publishLeaderboard();
      msg.style.color="var(--good)"; msg.textContent="✓ ユーザー名を保存し、ランキングに反映しました。";
    }catch(e){
      msg.style.color="var(--bad)"; msg.textContent="確認に失敗しました。通信環境を確認してください。";
    }
  };
  window.scrollTo(0,0);
}

export function renderRanking(){
  app.innerHTML = `
    <div class="q-head"><button class="quit" data-go="select">← 資格選択</button><span class="q-count">ランキング</span></div>
    <div id="lb-body"><div class="loading">読み込み中…</div></div>
  `;
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  loadRanking();
  window.scrollTo(0,0);
}

export async function loadRanking(){
  const body=document.getElementById("lb-body"); if(!body) return;
  if(state.guestMode || !window.LB || !state.currentUser){
    body.innerHTML=`<div class="empty">ランキングを見るにはログインが必要です。<br>ログインして、プロフィールで表示名を設定すると参加できます。</div>`;
    return;
  }
  try{
    const rows = await window.LB.top(50);
    const ov = overallStat();
    let myRank=null; try{ myRank = await window.LB.myRank(ov.tbp); }catch(e){}
    if(!rows.length){
      body.innerHTML=`<div class="empty">まだ誰もランキングに登録していません。<br>プロフィールで表示名を設定すると一番乗りで参加できます。</div>`;
      return;
    }
    const myUid=state.currentUserId;
    const mine = rows.find(r=>r.uid===myUid);
    body.innerHTML = `
      ${(myRank && !mine || myRank)?`<div class="lb-me">あなた：${myRank?("<b>"+myRank+"位</b>"):"未公開"} ・ 総合Lv.${ov.lv} ・ ${ov.tbp.toLocaleString()} BP${getProfileName()?"":' <button class="link2" data-go="profile">表示名を変更</button>'}</div>`:""}
      <div class="lb-list">
        ${rows.map((r,i)=>`
          <div class="lb-row ${r.uid===myUid?'me':''}">
            <span class="lb-rank ${i<3?'top':''}">${i+1}</span>
            <div class="lb-info">
              <span class="lb-name">${esc(r.displayName||"名無し")}${r.uid===myUid?' <small>(あなた)</small>':''}</span>
              <span class="lb-cert">総合Lv.${r.overallLevel||0}${r.title?" ・ "+esc(r.title):""}</span>
            </div>
            <span class="lb-bp">${(r.totalBP||0).toLocaleString()}<small> BP</small></span>
          </div>`).join("")}
      </div>
      <div class="x-hint" style="margin-top:14px">${getProfileName()?"":'表示名は未設定でも自動で参加中です。<button class="link2" data-go="profile">表示名を変更</button>'}</div>
    `;
    app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  }catch(e){
    body.innerHTML=`<div class="empty">読み込みに失敗しました。<br>${esc(String(e.message||e))}</div>`;
  }
}
/* =========================================================================
   🎨 背景スキンショップ＆無限マップパン移動制御エンジン
   ========================================================================= */
import { saveCoins } from './core.js';

const SKIN_DATA = [
  { key:"default", icon:"🌐", name:"標準グリッド",       sub:"初期テーマ",                cost:0 },
  { key:"space",   icon:"🌌", name:"宇宙空間",           sub:"星空＆ネビュラ",            cost:300 },
  { key:"magma",   icon:"🌋", name:"マグマ冷却基地",     sub:"赤黒サイバー・脈動グロー",  cost:300 },
  { key:"retro",   icon:"👾", name:"レトロドット絵",     sub:"ファミコン風ドット",        cost:400 },
];

let sbPanX = -1050, sbPanY = -1100; // 初期表示座標

function initSkinShopLogic() {
  const viewport = document.getElementById("sb-viewport");
  const board    = document.getElementById("sb-board");
  const cxEl     = document.getElementById("sb-cx");
  const cyEl     = document.getElementById("sb-cy");
  const shop     = document.getElementById("sb-shop");
  const shopBd   = document.getElementById("sb-shop-bd");
  const listEl   = document.getElementById("sb-skin-list");
  const toastEl  = document.getElementById("sb-toast-skin");

  function toast(msg) {
    if(!toastEl) return;
    toastEl.textContent = msg; toastEl.classList.add("sb-show");
    setTimeout(() => { if(toastEl) toastEl.classList.remove("sb-show"); }, 2000);
  }

  function applyPan() {
    if(!board) return;
    board.style.transform = "translate3d(" + sbPanX + "px," + sbPanY + "px,0)";
    if(cxEl && cyEl) { cxEl.textContent = Math.round(-sbPanX); cyEl.textContent = Math.round(-sbPanY); }
  }

  function renderSkinShopList() {
    if(!listEl) return;
    listEl.innerHTML = "";
    SKIN_DATA.forEach(sk => {
      const isOwned = S.ownedSkins.includes(sk.key);
      const isApplied = S.currentSkin === sk.key;
      
      const card = document.createElement("div");
      card.className = "sb-skin-card" + (isApplied ? " sb-applied" : "");
      card.innerHTML = `
        <div class="sb-skin-prev sb-theme-${sk.key}"></div>
        <div class="sb-skin-meta">
          <div class="sb-skin-nm">${sk.icon} ${sk.name}</div>
          <div class="sb-skin-sub">${sk.sub}${sk.cost > 0 ? ' (' + sk.cost + ' AC)' : ' (無料)'}</div>
        </div>
      `;
      
      const btn = document.createElement("button");
      btn.className = "sb-skin-btn";
      
      if (isOwned) {
        if (isApplied) {
          btn.classList.add("sb-applied-btn"); btn.textContent = "適用中"; btn.disabled = true;
        } else {
          btn.textContent = "適用する";
          btn.onclick = () => { 
            S.currentSkin = sk.key; 
            board.className = "sb-theme-" + sk.key; 
            saveSkins();                                   // 端末へ永続化
            renderSkinShopList(); 
            render(); // 🏠 ホーム画面の背景も即時同期するために全体再描画を呼ぶ
            try { saveToCloud(getBP(), loadWrong(), loadHist()); } catch(e){} // ☁️ 適用状態もクラウドへ同期
          };
        }
      } else {
        if ((S.coins || 0) >= sk.cost) {
          btn.classList.add("sb-buy"); btn.textContent = `購入 (${sk.cost}AC)`;
          btn.onclick = () => {
            S.coins -= sk.cost;
            S.ownedSkins.push(sk.key);
            S.currentSkin = sk.key;
            board.className = "sb-theme-" + sk.key;
            saveCoins(S.coins);
            saveSkins();                                   // 端末へ永続化
            renderStatusBar();
            renderSkinShopList();
            render(); // 所持金減額と背景をホームに即反映
            toast(`「${sk.name}」を購入・適用しました！`);
            try { saveToCloud(getBP(), loadWrong(), loadHist()); } catch(e){} // ☁️ Firebase/Cloudへのバックアップ
          };
        } else {
          btn.classList.add("sb-locked"); btn.textContent = "🔒 不足"; btn.disabled = true;
        }
      }
      card.appendChild(btn);
      listEl.appendChild(card);
    });
  }

  document.getElementById("sb-skin-fab").onclick = () => { shop.classList.add("sb-open"); shopBd.classList.add("sb-open"); renderSkinShopList(); };
  const closeShop = () => { shop.classList.remove("sb-open"); shopBd.classList.remove("sb-open"); };
  document.getElementById("sb-shop-x").onclick = closeShop;
  shopBd.onclick = closeShop;

  // マップパン（ドラッグ移動）制御
  let isPanning = false, startX = 0, startY = 0, origX = 0, origY = 0;
  viewport.onpointerdown = (e) => {
    if (e.target.closest("input") || e.target.closest("button") || e.target.closest(".pt-item") || e.target.closest(".pt-chip")) return;
    isPanning = true; startX = e.clientX; startY = e.clientY; origX = sbPanX; origY = sbPanY;
    viewport.classList.add("sb-grabbing");
    try { viewport.setPointerCapture(e.pointerId); } catch(_) {}
  };
  viewport.onpointermove = (e) => {
    if (!isPanning) return;
    sbPanX = origX + (e.clientX - startX);
    sbPanY = origY + (e.clientY - startY);
    sbPanX = Math.min(0, Math.max(viewport.clientWidth - 3000, sbPanX));
    sbPanY = Math.min(0, Math.max(viewport.clientHeight - 3000, sbPanY));
    applyPan();
  };
  const endPan = () => { isPanning = false; viewport.classList.remove("sb-grabbing"); };
  viewport.onpointerup = endPan;
  viewport.onpointercancel = endPan;

  applyPan();
}

export function renderSettings() {
  app.innerHTML = `
    <div class="q-head" style="margin-bottom:20px">
      <button class="quit" data-go="home">← ホーム</button>
      <span class="q-count" style="color:var(--accent)">⚙️ 設定</span>
    </div>

    <div class="settings-list" style="display:flex; flex-direction:column; gap:12px;">
      <button class="ghost" data-go="portal" style="text-align:left; padding:16px;">🎨 背景変更 (スキン購入)</button>
      
      </div>
  `;

  // ボタンのイベント紐付け
  app.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
}