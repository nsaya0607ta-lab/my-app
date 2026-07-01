import { CERTS } from './data/certs.js';
import { DC_PHASES, L, REGIONS } from './data/constants.js';
import { CONCEPTS, DRAW, PASS, Q, TIERS, applySkin, certById, certStat, commit, correctSet, dcCount, dcPhase, dcTitle, esc, exportCode, fmt, getBP, getProfileName, grade, importCode, isMulti, loadHist, loadReviewStats, loadWrong, overallLevel, overallStat, pick, pts, publishLeaderboard, purchaseSkin, saveToCloud, selectCert, setBP, setProfileName, stars, start, startReview, totalBP } from './core.js';
import { getNews } from './news.js';
import { getLiveStocks } from './stocks.js';
import { SKIN_DATA } from './data/skins.js';
import { S, state } from './state.js';
import { FEE_RATE, calcFee, cancelOrder, checkLimitOrders, executeMarketOrder, getPosition, loadPortfolio, ordersFor, placeLimitOrder, unrealizedPL } from './trading.js';

export const app = document.getElementById("app");

export function go(s){ S.screen=s; render(); }

// 右上の共通ステータスバー：上段=総合Lv／下段=選択中の資格Lv／右=AC。render()のたびに最新化

export function renderStatusBar(){
  const el=document.getElementById("statusbar"); if(!el) return;
  // 認証前・ユーザー名未設定などプレイヤーが確定していない画面では非表示
  const gated = (!state.guestMode && !state.authReady)
             || (!state.guestMode && !state.currentUser)
             || (!state.guestMode && state.currentUser && (!state.profileChecked || !getProfileName()));
  // ホーム画面（ニュースカードのある起動直後の画面）ではランクカードごと非表示にする
  const hiddenOnScreen = (S.screen === "select");
  if(gated || hiddenOnScreen){ el.classList.remove("show"); el.innerHTML=""; return; }
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

// ヘッダーのランキング／プロフィール丸型ボタンは「資格を選ぶ」画面と
// 資格ごとのホーム画面でのみ表示する。S.screen の値だけでは実際に描画される
// 画面と食い違うことがある（例：資格未選択だと screen="home" でも実際は
// renderSelect が表示される）ため、各画面側で明示的に表示・非表示を指定する。
function updateHeaderNav(show){
  const nav = document.querySelector(".top-nav");
  if(nav) nav.style.display = show ? "" : "none";
}

// ヘッダーのメインタイトルを状態に応じて動的に切り替える：
// 資格を選択中はその資格コード（AZ-900 など）、未選択なら「ホーム」
function updateHeaderTitle(){
  const titleEl = document.querySelector("h1.title");
  if(!titleEl) return;
  const c = S.cert ? certById(S.cert) : null;
  titleEl.textContent = c ? c.code : "ホーム";
}

export function render(){
  renderStatusBar();   // 画面が変わっても常に最新の Lv/BP/AC を反映
  updateHeaderNav(false); // デフォルトは非表示。表示すべき画面側で個別に true にする
  updateHeaderTitle();
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
  if(S.screen==="skins") return renderSkinShop();
  if(S.screen==="analytics") return renderAnalytics();
  if(S.screen==="certs") return renderCertList();
  // 大元：資格選択画面
  if(S.screen==="select" || !S.cert) return renderSelect();
  if(S.screen==="home") return renderHome();
  if(S.screen==="quiz") return renderQuiz();
  if(S.screen==="result") return renderResult();
  if(S.screen==="review") return renderReview();
  if(S.screen==="dict") return renderDict();
  if(S.screen==="transfer") return renderTransfer();
  if(S.screen==="history") return renderHistory();
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
  }catch(e){}
  state.cloudData=null; state.currentUser=null; state.currentUserId=null; state.profileChecked=false; S.coins=0;
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
  }catch(e){}
  // 認証削除で onAuthStateChanged(null) が発火しログイン画面へ遷移するが、保険で状態も初期化
  state.cloudData=null; state.currentUser=null; state.currentUserId=null; state.profileChecked=false; state.guestMode=false; S.coins=0;
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
  updateHeaderNav(true);
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
      <button class="quit" data-go="certs">← 資格選択</button>
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

    <div style="display:flex; gap:10px; margin-top:20px;">
      ${S.idx > 0 ? `
        <button class="ghost" id="quiz-prev" style="flex:1; margin-top:0; padding:16px;">← 戻る</button>
      ` : ""}
      <button class="cta" data-commit ${S.sel.length===0?"disabled":""} style="flex:2; margin-top:0;">
        ${S.idx+1<S.deck.length?"次の問題へ ➔":"採点する 🎉"}
      </button>
    </div>
  `;

  // 選択肢をタップした時の処理（元のロジックを完全維持）
  app.querySelectorAll("[data-pick]").forEach(b=>b.onclick=()=>pick(+b.dataset.pick));
  
  // 中断ボタンなどの遷移処理
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  
  // 次へ進む（コミット）処理
  const cm=app.querySelector("[data-commit]"); if(cm) cm.onclick=commit;

  // 💡 【新設】戻るボタンが画面にある場合のみ、クリックイベントを紐付ける
  const prevBtn = document.getElementById("quiz-prev");
  if(prevBtn) {
    prevBtn.onclick = () => {
      // core.js から prevQuestion を動的に読み込んで実行
      import('./core.js').then(core => {
        core.prevQuestion();
      });
    };
  }
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

/* ニュースダッシュボード：資格一覧画面の上部。5件のニュース（タイトル＋要約）を
   フェード切り替えで自動巡回し、ドット・矢印で手動切り替えもできる。
   左側には現在時刻を示すアナログ時計（SVG）を常時表示する。
   取得完了まで「読み込み中…」を表示し、失敗時は news.js 側のフォールバック
   （ダミーのIT/Azure系ニュース）に自動で切り替わる。 */

let newsItems = [];
let newsIndex = 0;
let newsTimer = null;
let clockTimer = null;
const NEWS_ROTATE_MS = 5500;

// 時計の文字盤の目盛り（12個）を三角関数で一度だけ組み立てる静的SVG片
function buildClockTicksSVG(){
  let ticks = "";
  for(let i=0;i<12;i++){
    const angle = (i*30) * Math.PI/180;
    const major = i % 3 === 0; // 12・3・6・9 は長め・太めの目盛り
    const outerR = 44, innerR = major ? 36 : 40;
    const x1 = (50 + outerR*Math.sin(angle)).toFixed(2), y1 = (50 - outerR*Math.cos(angle)).toFixed(2);
    const x2 = (50 + innerR*Math.sin(angle)).toFixed(2), y2 = (50 - innerR*Math.cos(angle)).toFixed(2);
    ticks += `<line class="clock-tick${major?" major":""}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }
  return ticks;
}
const CLOCK_TICKS_SVG = buildClockTicksSVG();

function newsCardHTML(){
  return `
    <div class="news-card" id="news-card">
      <div class="news-card-head">
        <span class="news-badge">📰 NEWS</span>
        <div class="news-nav">
          <button type="button" class="news-arrow" id="news-prev" aria-label="前のニュース">‹</button>
          <button type="button" class="news-arrow" id="news-next" aria-label="次のニュース">›</button>
        </div>
      </div>
      <div class="news-body">
        <div class="news-clock">
          <svg viewBox="0 0 100 100" class="news-clock-svg">
            <circle class="clock-face" cx="50" cy="50" r="46"/>
            ${CLOCK_TICKS_SVG}
            <line class="clock-hand hour" id="clock-hour" x1="50" y1="50" x2="50" y2="29"/>
            <line class="clock-hand minute" id="clock-minute" x1="50" y1="50" x2="50" y2="19"/>
            <line class="clock-hand second" id="clock-second" x1="50" y1="50" x2="50" y2="15"/>
            <circle class="clock-center" cx="50" cy="50" r="3"/>
          </svg>
          <div class="news-clock-date" id="news-clock-date"></div>
        </div>
        <div class="news-content">
          <div class="news-headline" id="news-headline">読み込み中…</div>
          <div class="news-summary" id="news-summary"></div>
          <a class="news-readmore" id="news-readmore" href="#" target="_blank" rel="noopener noreferrer" style="visibility:hidden">続きを読む →</a>
        </div>
      </div>
      <div class="news-dots" id="news-dots"></div>
    </div>`;
}

function renderNewsSlide(){
  const headline = document.getElementById("news-headline");
  const summaryEl = document.getElementById("news-summary");
  const readmore = document.getElementById("news-readmore");
  const dotsEl = document.getElementById("news-dots");
  if(!headline || !summaryEl || !dotsEl || !newsItems.length) return;
  const n = newsItems[newsIndex];
  // クラスを一度外して再付与し、フェードインアニメーションを毎回やり直す
  [headline, summaryEl].forEach(el => { el.classList.remove("news-fade-in"); void el.offsetWidth; el.classList.add("news-fade-in"); });
  headline.textContent = n.title;
  headline.title = n.title; // 行数で切れた分はホバーで全文確認できる
  summaryEl.textContent = n.summary || "";
  summaryEl.title = n.summary || "";
  if(readmore){
    if(n.link){ readmore.href = n.link; readmore.style.visibility = "visible"; }
    else { readmore.removeAttribute("href"); readmore.style.visibility = "hidden"; }
  }
  dotsEl.innerHTML = newsItems.map((_, i) => `<span class="news-dot${i===newsIndex?" on":""}" data-idx="${i}"></span>`).join("");
  dotsEl.querySelectorAll("[data-idx]").forEach(d => d.onclick = () => gotoNewsSlide(+d.dataset.idx));
}

function gotoNewsSlide(i){
  if(!newsItems.length) return;
  newsIndex = (i + newsItems.length) % newsItems.length;
  renderNewsSlide();
  restartNewsTimer();
}

function restartNewsTimer(){
  if(newsTimer){ clearInterval(newsTimer); newsTimer = null; }
  if(newsItems.length > 1){
    newsTimer = setInterval(() => {
      if(!document.getElementById("news-card")){ clearInterval(newsTimer); newsTimer = null; return; }
      newsIndex = (newsIndex + 1) % newsItems.length;
      renderNewsSlide();
    }, NEWS_ROTATE_MS);
  }
}

const WEEKDAY_JA = ["日","月","火","水","木","金","土"];

function updateClock(){
  const hourHand = document.getElementById("clock-hour");
  const minHand = document.getElementById("clock-minute");
  const secHand = document.getElementById("clock-second");
  const dateEl = document.getElementById("news-clock-date");
  if(!hourHand || !minHand || !secHand){
    if(clockTimer){ clearInterval(clockTimer); clockTimer = null; }
    return;
  }
  const now = new Date();
  const h = now.getHours() % 12, m = now.getMinutes(), s = now.getSeconds();
  hourHand.setAttribute("transform", `rotate(${(h*30 + m*0.5).toFixed(2)} 50 50)`);
  minHand.setAttribute("transform", `rotate(${(m*6 + s*0.1).toFixed(2)} 50 50)`);
  secHand.setAttribute("transform", `rotate(${(s*6).toFixed(2)} 50 50)`);
  if(dateEl) dateEl.textContent = `${now.getMonth()+1}/${now.getDate()}(${WEEKDAY_JA[now.getDay()]})`;
}

function startClock(){
  if(clockTimer){ clearInterval(clockTimer); clockTimer = null; }
  updateClock();
  clockTimer = setInterval(updateClock, 1000);
}

async function loadNewsCard(){
  const card = document.getElementById("news-card");
  if(!card) return;
  const prev = document.getElementById("news-prev");
  const next = document.getElementById("news-next");
  if(prev) prev.onclick = () => gotoNewsSlide(newsIndex - 1);
  if(next) next.onclick = () => gotoNewsSlide(newsIndex + 1);

  startClock();

  newsItems = await getNews();
  newsIndex = 0;
  renderNewsSlide();
  restartNewsTimer();
}

/* =========================================================================
   株価カード（STOCKS）：ニュースカードと同じデザインシステムを流用した
   ダッシュボード風ウィジェット＋模擬投資（ペーパートレード）機能。
   起動直後はサンプル株価で表示し、Finnhubの株価APIから実際の株価を取得
   できた場合はそちらに置き換える。取得に失敗した場合、一度も実データを
   取得できていなければ引き続きサンプル値を、既に実データを取得済みの
   銘柄であれば最後に取得できた値（最終参照値）をそのまま据え置いて表示する
   （実データのように見える擬似変動はさせない）。
   ========================================================================= */

// series: 分足（Intraday）の {t: 時刻(ms), close: 終値} 配列。X軸=時間(hh:mm)・
// Y軸=株価としてチャートにそのまま使う。モックは start→end へゆるやかに
// ランダムウォークする擬似的な当日値動きを、5分間隔で90ポイント生成する。
function mockIntradaySeries(start, end, points=90, stepMinutes=5){
  const now = Date.now();
  const stepMs = stepMinutes*60*1000;
  const swing = Math.abs(end-start) * 0.05 || 0.3;
  const series = [];
  let v = start;
  for(let i=0;i<points;i++){
    const target = start + (end-start) * (i/(points-1));
    v += (target - v) * 0.25 + (Math.random()-0.5) * swing;
    series.push({ t: now - (points-1-i)*stepMs, close: round2(v) });
  }
  series[series.length-1].close = end; // 最新値は現在値と必ず一致させる
  return series;
}

const STOCKS = [
  { ticker:"MSFT", name:"Microsoft", price:435.12, previousClose:429.91, session:"regular", sessionLabel:"サンプル", isLive:false, chartIsLive:false, everLive:false,
    series: mockIntradaySeries(429.91, 435.12) },
  { ticker:"AMZN", name:"Amazon", price:189.50, previousClose:190.45, session:"regular", sessionLabel:"サンプル", isLive:false, chartIsLive:false, everLive:false,
    series: mockIntradaySeries(190.45, 189.50) },
  { ticker:"GOOGL", name:"Alphabet", price:199.80, previousClose:200.80, session:"regular", sessionLabel:"サンプル", isLive:false, chartIsLive:false, everLive:false,
    series: mockIntradaySeries(200.80, 199.80) },
];
// change(%)は常に previousClose（前日終値）を基準に計算する＝日足ベース。
// 実データ取得時・擬似変動時ともにこの基準値を更新して整合性を保つ。
STOCKS.forEach(s => { s.change = ((s.price - s.previousClose) / s.previousClose) * 100; });
// 起動直後は実データ取得前なので、必ず「サンプル」表示から始める（実データと誤認させない）

let stockIndex = 0;
let stockRefreshTimer = null;
const STOCK_REFRESH_MS = 45000; // 実株価の再取得・擬似変動の更新間隔
const STOCK_TICK_PCT = 0.006;   // 実データが使えない場合の1回あたりの変動幅（±0.3%程度）

function round2(n){ return Math.round(n*100)/100; }

function formatChartTime(ms){
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function stocksCardHTML(){
  return `
    <div class="news-card stocks-card" id="stocks-card">
      <div class="news-card-head">
        <span class="news-badge stock-badge">📊 株価 (STOCKS)</span>
        <div class="news-nav">
          <button type="button" class="news-arrow" id="stock-prev" aria-label="前の銘柄">‹</button>
          <button type="button" class="news-arrow" id="stock-next" aria-label="次の銘柄">›</button>
        </div>
      </div>
      <div class="stock-row" id="stock-row"></div>
      <div class="stock-position" id="stock-position"></div>
      <div class="stock-trade-btns">
        <button type="button" class="stock-trade-btn buy" id="stock-buy">購入</button>
        <button type="button" class="stock-trade-btn sell" id="stock-sell">売却</button>
      </div>
      <div class="stock-orders" id="stock-orders"></div>
      <div class="stock-chart-wrap" id="stock-chart-wrap"></div>
      <div class="stock-chart-xaxis" id="stock-chart-xaxis"></div>
      <div class="stock-period" id="stock-chart-period">分足 (Intraday)</div>
    </div>`;
}

function renderStockRow(){
  const rowEl = document.getElementById("stock-row");
  if(!rowEl) return;
  rowEl.innerHTML = STOCKS.map((s,i) => {
    const up = s.change >= 0;
    return `<button type="button" class="stock-item${i===stockIndex?" active":""}" data-idx="${i}">
      <div class="stock-ticker">${esc(s.ticker)}</div>
      ${s.sessionLabel?`<div class="stock-session">${esc(s.sessionLabel)}</div>`:""}
      <div class="stock-name">(${esc(s.name)})</div>
      <div class="stock-priceline">
        <span class="stock-price">$${s.price.toFixed(2)}</span>
        <span class="stock-change ${up?"up":"down"}">${up?"▲":"▼"} ${up?"+":""}${s.change.toFixed(1)}%</span>
      </div>
    </button>`;
  }).join("");
  rowEl.querySelectorAll("[data-idx]").forEach(b => b.onclick = () => {
    stockIndex = +b.dataset.idx;
    renderStockRow();
    renderStockChart();
    renderStockPosition();
  });
}

// 前日終値比が上昇なら緑、下降なら赤（Yahoo!ファイナンス風の動的な配色）
function stockTrendColors(up){
  return up
    ? { line: "#16a34a", fillTop: "rgba(22,163,74,.28)" }
    : { line: "#dc2626", fillTop: "rgba(220,38,38,.22)" };
}

// 分足（Intraday）チャートを外部CDNに頼らず純粋なSVGで自前描画する。
// Chart.js（CDN経由）は実機のネットワーク環境によって読み込みに失敗し、
// チャートが永久に空白のままになる不具合があったため、外部依存のない
// この方式に置き換えた。X軸=時間(hh:mm)／Y軸=株価、タップ/ドラッグで
// 該当時点の時刻・価格をツールチップ表示する。
function renderStockChart(){
  const periodEl = document.getElementById("stock-chart-period");
  const s = STOCKS[stockIndex];
  if(periodEl){
    periodEl.textContent = s.chartIsLive ? "分足 (Intraday)" : (s.everLive ? "分足 (Intraday・最終参照)" : "分足 (Intraday・サンプル)");
  }
  const wrap = document.getElementById("stock-chart-wrap");
  const xAxisEl = document.getElementById("stock-chart-xaxis");
  if(!wrap) return;
  const series = s.series;
  const n = series.length;
  if(!n){ wrap.innerHTML = ""; if(xAxisEl) xAxisEl.innerHTML = ""; return; }

  const W = 300, H = 84;
  const closes = series.map(p => p.close);
  const min = Math.min(...closes), max = Math.max(...closes);
  const pad = (max - min) * 0.1 || Math.max(min * 0.01, 0.5);
  const lo = min - pad, hi = max + pad;
  const mid = (lo + hi) / 2;
  const xAt = i => n<=1 ? W/2 : (i/(n-1)) * W;
  const yAt = v => H - ((v - lo) / ((hi - lo) || 1)) * H;
  const pts = series.map((p,i) => `${xAt(i).toFixed(1)},${yAt(p.close).toFixed(1)}`);
  const linePath = "M" + pts.join(" L");
  const areaPath = `M${xAt(0).toFixed(1)},${H} L${pts.join(" L")} L${xAt(n-1).toFixed(1)},${H} Z`;
  const { line, fillTop } = stockTrendColors(s.change >= 0);
  const gid = "stock-grad-" + stockIndex;

  wrap.innerHTML = `
    <div class="stock-chart-yaxis">
      <span>$${hi.toFixed(2)}</span>
      <span>$${mid.toFixed(2)}</span>
      <span>$${lo.toFixed(2)}</span>
    </div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="stock-chart-svg" id="stock-chart-svg">
      <defs>
        <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${fillTop}"></stop>
          <stop offset="100%" stop-color="rgba(255,255,255,0)"></stop>
        </linearGradient>
      </defs>
      <line x1="0" y1="${(H/2).toFixed(1)}" x2="${W}" y2="${(H/2).toFixed(1)}" class="stock-chart-gridline"></line>
      <path d="${areaPath}" fill="url(#${gid})" stroke="none"></path>
      <path d="${linePath}" fill="none" stroke="${line}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>
      <circle id="stock-chart-dot" cx="0" cy="0" r="3" fill="${line}" style="display:none"></circle>
    </svg>
    <div class="stock-chart-tip" id="stock-chart-tip" style="display:none"></div>
  `;

  if(xAxisEl){
    const idxs = n>=3 ? [0, Math.floor((n-1)/2), n-1] : series.map((_,i)=>i);
    xAxisEl.innerHTML = idxs.map(i => `<span>${formatChartTime(series[i].t)}</span>`).join("");
  }

  const svg = document.getElementById("stock-chart-svg");
  const dot = document.getElementById("stock-chart-dot");
  const tip = document.getElementById("stock-chart-tip");
  if(!svg || !dot || !tip) return;

  function showAt(clientX){
    const rect = svg.getBoundingClientRect();
    if(rect.width <= 0) return;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const idx = Math.round(frac * (n - 1));
    const p = series[idx];
    dot.setAttribute("cx", xAt(idx).toFixed(1));
    dot.setAttribute("cy", yAt(p.close).toFixed(1));
    dot.style.display = "";
    tip.style.display = "";
    tip.textContent = `${formatChartTime(p.t)}  $${p.close.toFixed(2)}`;
    tip.style.left = Math.min(78, Math.max(0, frac * 100)) + "%";
  }
  function hide(){ dot.style.display = "none"; tip.style.display = "none"; }

  svg.onpointerdown = (e) => showAt(e.clientX);
  svg.onpointermove = (e) => showAt(e.clientX);
  svg.onpointerup = hide;
  svg.onpointerleave = hide;
}

// 保有株数・平均取得単価・評価損益と、その銘柄の指値予約注文を表示
function renderStockPosition(){
  const posEl = document.getElementById("stock-position");
  const ordersEl = document.getElementById("stock-orders");
  if(!posEl) return;
  const s = STOCKS[stockIndex];
  const pl = unrealizedPL(s.ticker, s.price);
  posEl.innerHTML = pl.shares
    ? `保有 <b>${pl.shares}株</b>　平均取得 $${pl.avgCost.toFixed(2)}　評価損益 <span class="${pl.amount>=0?"up":"down"}">${pl.amount>=0?"+":""}${pl.amount.toFixed(2)} AC（${pl.amount>=0?"+":""}${pl.pct.toFixed(1)}%）</span>`
    : `この銘柄は保有していません`;
  if(!ordersEl) return;
  const list = ordersFor(s.ticker);
  ordersEl.innerHTML = list.map(o => `
    <div class="stock-order-row">
      <span>${o.side==="buy"?"買":"売"}指値 ${o.qty}株 @ $${o.limitPrice.toFixed(2)}</span>
      <button type="button" class="stock-order-cancel" data-oid="${o.id}">取消</button>
    </div>`).join("");
  ordersEl.querySelectorAll("[data-oid]").forEach(b => b.onclick = () => { cancelOrder(b.dataset.oid); renderStockPosition(); });
}

// 実株価取得の結果をSTOCKSへ反映する（銘柄ごと。取得できなかった銘柄だけ
// フォールバックに回す＝一部失敗しても他の銘柄は実データを表示できる）
function applyLiveStocks(liveItems){
  if(!liveItems) return;
  liveItems.forEach(live => {
    if(!live) return; // その銘柄は取得失敗（nullが入る）→ 後段の擬似変動に任せる
    const s = STOCKS.find(x => x.ticker === live.ticker);
    if(!s) return;
    s.price = live.price;
    s.previousClose = live.previousClose;
    s.change = live.change;
    s.session = live.session;
    s.sessionLabel = live.sessionLabel; // 時間外のPre-market/After-hours、通常時間はnull
    s.isLive = true;
    s.everLive = true; // 一度でも実データを取得できたことを記録（以後の取得失敗時に擬似変動ではなく最終参照値を出すために使う）
    if(live.series){
      // チャート（分足）も取得できた場合のみ実データに置き換える
      s.series = live.series;
      s.chartIsLive = true;
    } else {
      // 価格は実データだがチャート(candle)だけ取得できなかった場合：
      // 既存のサンプル系列を使い続けつつ、末尾だけ実際の現在値に合わせておく
      const last = s.series[s.series.length - 1];
      if(last) last.close = s.price;
      s.chartIsLive = false;
    }
  });
}

// 実データが取得できなかった銘柄のフォールバック処理。
// 一度でも実データを取得できたことがある銘柄（everLive）は、ランダムな擬似変動は
// させず、最後に取得できた実際の値をそのまま据え置いて表示する（「最終参照」）。
// まだ一度も実データを取得できていない起動直後のみ、デモ表示用に擬似的な値動きを見せる
// （この場合のみ「サンプル」ラベルを出し、実データと誤認されないようにする）。
// 日足の本数は増やさず、直近（今日）の終値ポイントだけを動かして表示を維持する。
const STOCK_MOCK_SERIES_MAX = 180; // 擬似変動時に series が際限なく伸びないよう上限を設ける

function simulateStockTick(s){
  s.isLive = false;
  s.chartIsLive = false;
  if(s.everLive){
    // 実データ取得済みの銘柄：価格・変化率は動かさず、最後に取得できた値のまま据え置く
    s.sessionLabel = "最終参照";
    return;
  }
  const delta = (Math.random() - 0.5) * STOCK_TICK_PCT;
  s.price = Math.max(0.01, round2(s.price * (1 + delta)));
  s.change = ((s.price - s.previousClose) / s.previousClose) * 100;
  s.session = "regular";
  s.sessionLabel = "サンプル";
  // 分足チャートらしく、実際に新しい時刻のポイントを追加していく（古い分は切り捨て）
  s.series.push({ t: Date.now(), close: s.price });
  if(s.series.length > STOCK_MOCK_SERIES_MAX) s.series.shift();
}

async function refreshStockPrices(){
  const live = await getLiveStocks();
  STOCKS.forEach(s => { s.isLive = false; }); // 今回の取得結果で改めて判定し直す
  applyLiveStocks(live);
  STOCKS.forEach(s => { if(!s.isLive) simulateStockTick(s); });
  renderStockRow();
  renderStockChart();
  renderStockPosition();
  const executed = checkLimitOrders(ticker => STOCKS.find(s => s.ticker === ticker)?.price ?? null);
  if(executed.length){
    renderStockRow();
    renderStockPosition();
    renderStatusBar();
  }
}

function startStockRefresh(){
  if(stockRefreshTimer){ clearInterval(stockRefreshTimer); stockRefreshTimer = null; }
  refreshStockPrices();
  stockRefreshTimer = setInterval(() => {
    if(!document.getElementById("stocks-card")){ clearInterval(stockRefreshTimer); stockRefreshTimer = null; return; }
    refreshStockPrices();
  }, STOCK_REFRESH_MS);
}

// 購入・売却モーダル：成行／指値の切り替え、数量・指値価格入力、手数料込みの概算表示
function openTradeModal(side){
  const s = STOCKS[stockIndex];
  const pos = getPosition(s.ticker);
  const ov = document.createElement("div");
  ov.className = "modal-ov";
  ov.innerHTML = `
    <div class="modal trade-modal">
      <div class="modal-title trade-modal-title">${side==="buy"?"購入":"売却"}：${esc(s.ticker)}（${esc(s.name)}）</div>
      <div class="modal-body">現在値 <b>$${s.price.toFixed(2)}</b>　保有 ${pos.shares}株</div>
      <div class="trade-type-toggle">
        <button type="button" class="trade-type-btn active" data-type="market">成行</button>
        <button type="button" class="trade-type-btn" data-type="limit">指値</button>
      </div>
      <div class="trade-field">
        <label>数量（株）</label>
        <input type="number" id="trade-qty" class="auth-input" min="1" step="1" value="1" inputmode="numeric">
      </div>
      <div class="trade-field" id="trade-limit-field" style="display:none">
        <label>指値価格（$）</label>
        <input type="number" id="trade-limit-price" class="auth-input" min="0.01" step="0.01" value="${s.price.toFixed(2)}" inputmode="decimal">
      </div>
      <div class="trade-preview" id="trade-preview"></div>
      <div id="trade-msg" class="auth-msg"></div>
      <button class="cta" id="trade-confirm" style="margin-top:0">${side==="buy"?"購入する":"売却する"}</button>
      <button class="ghost" id="trade-cancel" style="margin-top:8px">キャンセル</button>
    </div>`;
  document.body.appendChild(ov);
  const close = () => { try{ ov.remove(); }catch(e){} };
  ov.addEventListener("click", (e) => { if(e.target === ov) close(); });
  ov.querySelector("#trade-cancel").onclick = close;

  const qtyEl = ov.querySelector("#trade-qty");
  const limitFieldEl = ov.querySelector("#trade-limit-field");
  const limitPriceEl = ov.querySelector("#trade-limit-price");
  const previewEl = ov.querySelector("#trade-preview");
  const msgEl = ov.querySelector("#trade-msg");
  const typeBtns = ov.querySelectorAll(".trade-type-btn");

  function currentType(){ return ov.querySelector(".trade-type-btn.active").dataset.type; }

  function updatePreview(){
    const qty = Math.max(1, parseInt(qtyEl.value, 10) || 1);
    const type = currentType();
    const refPrice = type === "market" ? s.price : (parseFloat(limitPriceEl.value) || s.price);
    const amount = refPrice * qty;
    const fee = calcFee(amount);
    previewEl.innerHTML = side === "buy"
      ? `概算金額 ${amount.toFixed(2)} AC ＋ 手数料(${(FEE_RATE*100).toFixed(1)}%) ${fee.toFixed(2)} AC = <b>合計 ${(amount+fee).toFixed(2)} AC</b>`
      : `概算受取 ${amount.toFixed(2)} AC － 手数料(${(FEE_RATE*100).toFixed(1)}%) ${fee.toFixed(2)} AC = <b>手取り ${(amount-fee).toFixed(2)} AC</b>`;
  }

  typeBtns.forEach(b => b.onclick = () => {
    typeBtns.forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    limitFieldEl.style.display = b.dataset.type === "limit" ? "" : "none";
    updatePreview();
  });
  qtyEl.oninput = updatePreview;
  limitPriceEl.oninput = updatePreview;
  updatePreview();

  ov.querySelector("#trade-confirm").onclick = () => {
    const qty = Math.max(1, parseInt(qtyEl.value, 10) || 1);
    const type = currentType();
    let res;
    if(type === "market"){
      res = executeMarketOrder(s.ticker, side, qty, s.price);
    } else {
      const limitPrice = parseFloat(limitPriceEl.value);
      res = placeLimitOrder(s.ticker, side, qty, limitPrice);
    }
    if(!res.ok){ msgEl.style.color = "var(--bad)"; msgEl.textContent = res.msg; return; }
    close();
    renderStockRow();
    renderStockPosition();
    renderStatusBar(); // AC残高を即時反映
  };
}

function initStocksCard(){
  const card = document.getElementById("stocks-card");
  if(!card) return;
  loadPortfolio();
  const prev = document.getElementById("stock-prev");
  const next = document.getElementById("stock-next");
  if(prev) prev.onclick = () => { stockIndex = (stockIndex - 1 + STOCKS.length) % STOCKS.length; renderStockRow(); renderStockChart(); renderStockPosition(); };
  if(next) next.onclick = () => { stockIndex = (stockIndex + 1) % STOCKS.length; renderStockRow(); renderStockChart(); renderStockPosition(); };
  const buyBtn = document.getElementById("stock-buy");
  const sellBtn = document.getElementById("stock-sell");
  if(buyBtn) buyBtn.onclick = () => openTradeModal("buy");
  if(sellBtn) sellBtn.onclick = () => openTradeModal("sell");
  renderStockRow();
  renderStockChart();
  renderStockPosition();
  startStockRefresh();
}

export function renderSelect(){
  app.innerHTML = `
    ${newsCardHTML()}
    ${stocksCardHTML()}
    <button class="cta cta-jump" id="cta-goto-certs">🎓 資格を選ぶ →</button>
    ${state.currentUser
      ? `<div class="acct-bar">👤 ${esc(state.currentUser.email||"ログイン中")}<button class="link2" data-logout>ログアウト</button></div>`
      : (state.guestMode ? `<div class="acct-bar">ゲストモード（この端末のみ・同期なし）<button class="link2" data-login>ログイン / 新規登録</button></div>` : "")}
  `;
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  const lo=app.querySelector("[data-logout]"); if(lo)lo.onclick=()=>logout();
  const li=app.querySelector("[data-login]"); if(li)li.onclick=()=>{ state.guestMode=false; state.authMode="login"; render(); };
  const jump=document.getElementById("cta-goto-certs");
  if(jump) jump.onclick=()=>go("certs");
  loadNewsCard();
  initStocksCard();
  window.scrollTo(0,0);
}

/* 「資格を選ぶ」CTAボタンから遷移する専用画面：総合レベルと資格カード一覧 */

export function renderCertList(){
  updateHeaderNav(true);
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
    <div class="q-head" style="margin-bottom:14px">
      <button class="quit" data-go="select">← ホーム</button>
      <span class="q-count" style="color:var(--accent)">資格を選ぶ</span>
    </div>
    <div class="sel-head">
      <span class="eyebrow">MICROSOFT 認定対策</span>
      <h2 class="sel-title">資格を選ぶ</h2>
      <p class="sel-sub">学習したい資格を選んでください。資格ごとにスコア・BP・復習データは別々に保存されます。</p>
    </div>
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
    <div class="cert-list">${cards}</div>
  `;
  app.querySelectorAll("[data-cert]").forEach(b=>b.onclick=()=>selectCert(b.dataset.cert));
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
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
    <div class="q-head"><button class="quit" data-go="certs">← 資格選択</button><span class="q-count">プロフィール</span></div>
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
    <div class="q-head"><button class="quit" data-go="certs">← 資格選択</button><span class="q-count">ランキング</span></div>
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

export function renderSettings() {
  app.innerHTML = `
    <div class="q-head" style="margin-bottom:20px">
      <button class="quit" data-go="home">← ホーム</button>
      <span class="q-count" style="color:var(--accent)">⚙️ 設定</span>
    </div>

    <div class="settings-list" style="display:flex; flex-direction:column; gap:12px;">
      <button class="ghost" data-go="skins" style="text-align:left; padding:16px;">🎨 背景変更 (スキン購入)</button>

      </div>
  `;

  // ボタンのイベント紐付け
  app.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
}

/* 設定＞背景変更：スキン一覧・購入・適用 */

export function renderSkinShop() {
  const cards = SKIN_DATA.map(sk=>{
    const isOwned = S.ownedSkins.includes(sk.key);
    const isApplied = S.currentSkin === sk.key;
    const canBuy = (S.coins||0) >= sk.cost;
    let btnHTML;
    if(isApplied) btnHTML = `<button class="sb-skin-btn sb-applied-btn" disabled>適用中</button>`;
    else if(isOwned) btnHTML = `<button class="sb-skin-btn" data-apply="${sk.key}">適用する</button>`;
    else if(canBuy) btnHTML = `<button class="sb-skin-btn sb-buy" data-buy="${sk.key}">購入 (${sk.cost}AC)</button>`;
    else btnHTML = `<button class="sb-skin-btn sb-locked" disabled>🔒 AC不足</button>`;
    return `<div class="sb-skin-card${isApplied?" sb-applied":""}">
      <div class="sb-skin-prev sb-theme-${sk.key}"></div>
      <div class="sb-skin-meta">
        <div class="sb-skin-nm">${sk.icon} ${esc(sk.name)}</div>
        <div class="sb-skin-sub">${esc(sk.sub)}${sk.cost>0?` (${sk.cost} AC)`:" (無料)"}</div>
      </div>
      ${btnHTML}
    </div>`;
  }).join("");

  app.innerHTML = `
    <div class="q-head" style="margin-bottom:14px">
      <button class="quit" data-go="settings">← 設定</button>
      <span class="q-count" style="color:var(--accent)">🎨 背景変更</span>
    </div>
    <div class="x-hint" style="margin-top:0;margin-bottom:14px">好きなスキンを選んで購入・適用できます。所持金：💰 <b>${(S.coins||0).toLocaleString()} AC</b></div>
    <div id="skin-shop-msg" class="x-hint" style="margin-top:0;min-height:1.4em"></div>
    <div id="skin-shop-list">${cards}</div>
  `;
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));

  app.querySelectorAll("[data-buy]").forEach(b=>b.onclick=()=>{
    const res = purchaseSkin(b.dataset.buy);
    render(); // 所持金・所持スキン・背景色を画面全体（ステータスバー含む）へ即時反映
    const m = document.getElementById("skin-shop-msg");
    if(!m) return;
    m.style.color = res.ok ? "var(--good)" : "var(--bad)";
    m.textContent = res.ok ? `✓ 「${res.skin.name}」を購入し、背景に適用しました！` : res.msg;
  });
  app.querySelectorAll("[data-apply]").forEach(b=>b.onclick=()=>{
    const res = applySkin(b.dataset.apply);
    render();
    const m = document.getElementById("skin-shop-msg");
    if(!m) return;
    m.style.color = res.ok ? "var(--good)" : "var(--bad)";
    m.textContent = res.ok ? "✓ 背景を適用しました。" : res.msg;
  });
  window.scrollTo(0,0);
}
