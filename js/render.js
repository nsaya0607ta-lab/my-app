import { CERTS } from './data/certs.js';
import { DC_PHASES, L, REGIONS } from './data/constants.js';
import { CONCEPTS, DRAW, PASS, Q, TIERS, applySkin, certById, certStat, commit, correctSet, dcCount, dcPhase, dcTitle, esc, exportCode, fmt, getBP, getProfileName, grade, importCode, isAdminAccount, isMulti, loadHist, loadReviewStats, loadWrong, overallLevel, overallStat, pick, pts, publishLeaderboard, purchaseSkin, saveCoins, saveToCloud, selectCert, setBP, setProfileName, skinHandleIdentityChange, stars, start, startReview, totalBP } from './core.js';
import { getLiveStocks, getLiveStocksJP } from './stocks.js';
import { getWeather } from './weather.js';
import { SKIN_DATA } from './data/skins.js';
import { S, state } from './state.js';

export const app = document.getElementById("app");

// 「資格を選ぶ」画面・ホーム（select）画面はどちらも特定の資格に紐づかない
// 全体ビューのため、遷移するたびに選択中の資格をクリアする。これにより、
// 個別資格の画面（AZ-900など）から資格一覧へ「戻る」際に、前の資格の
// ランク表示が残ってしまうバグを防ぐ（ステータスバーの再描画は
// S.cert の値を見て個別資格行の要否を判断しているため）。
export function go(s){
  if(s === "certs" || s === "select") S.cert = null;
  S.screen = s;
  render();
}

// 最上段の共通ステータスバー：render()のたびに最新化。表示する画面ごとに
// レイアウトが変わる（左に縦積みのランク行、右にAC。.statusbarがalign-items:
// centerのflexコンテナのため、AC表示は左側の行数（1行/2行）の高さに応じて
// 自動的に縦中央へ揃う）。
//   ・ホーム（select）／資格一覧（certs）画面 … 総合ランクのみ1行＋AC
//   ・AZ-900などの個別資格の画面（home/quiz/result等） … 総合ランク＋個別
//     資格ランクの2段＋AC（右側は2行分の高さに揃って縦中央）
//   ・ランキング／プロフィール／設定などその他の画面 … 完全に非表示
// go()側でselect/certsへ遷移するたびにS.certをクリアしているため、
// 個別資格の画面から資格一覧に戻った直後は自動的に1行表示へ切り替わる。
export function renderStatusBar(){
  const el=document.getElementById("statusbar"); if(!el) return;
  // 認証前・ユーザー名未設定などプレイヤーが確定していない画面では非表示
  const gated = (!state.guestMode && !state.authReady)
             || (!state.guestMode && !state.currentUser)
             || (!state.guestMode && state.currentUser && (!state.profileChecked || !getProfileName()));
  const screen = resolveScreen();
  const otherScreens = ["ranking","profile","settings","skins","analytics","schedule","portfolio","news-japan","news-world","calendar"];
  if(gated || otherScreens.includes(screen)){ el.classList.remove("show"); el.innerHTML=""; return; }
  const ov = overallStat();          // 総合Lvと次Lvまでの進捗(%)
  const coins = (S.coins||0);

  // 個別資格の画面（select/certs以外）でのみ、総合ランクの下に個別資格ランクを追加する
  let certRow = "";
  if(screen !== "select" && screen !== "certs" && S.cert){
    const c = certById(S.cert) || {};
    const bp = getBP();
    const lvl = dcCount(bp);
    const next = TIERS.find(t=>t.bp>bp);
    let cpct;
    if(next){ const prevBp = lvl>0 ? TIERS[lvl-1].bp : 0; cpct = Math.max(0, Math.min(100, Math.round((bp-prevBp)/(next.bp-prevBp)*100))); }
    else cpct = 100;
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

// S.screen の値だけでは実際に描画される画面と食い違うことがある
// （例：資格未選択だと screen="home" でも実際は renderSelect が表示される。
// render()末尾の分岐と同じ優先順位で判定する）ため、ヘッダー周りの表示制御は
// この「実際に描画される画面名」を使って判断する。
function resolveScreen(){
  const noCertScreens = ["ranking","profile","settings","skins","analytics","certs","schedule","portfolio","news-japan","news-world","calendar"];
  if(noCertScreens.includes(S.screen)) return S.screen;
  if(S.screen==="select" || !S.cert) return "select";
  return S.screen; // home/quiz/result/review/dict/transfer/history
}

// ヘッダーのランキング／プロフィール丸型ボタンは「資格を選ぶ」画面と
// 資格ごとのホーム画面でのみ表示する。各画面側で明示的に表示・非表示を指定する。
function updateHeaderNav(show){
  const nav = document.querySelector(".top-nav");
  if(nav) nav.style.display = show ? "" : "none";
}

// ヘッダーのメインタイトル・見出しブロックを状態に応じて切り替える：
// ホーム（select）画面では見出し自体を非表示にし、ステータスバーが最上段に
// ピタッと収まるミニマルなレイアウトにする。資格選択中はその資格コード
// （AZ-900 など）、それ以外の画面（ランキング等）では「ホーム」を表示する。
function updateHeaderTitle(){
  const topEl = document.querySelector(".top");
  const titleEl = document.querySelector("h1.title");
  if(!topEl || !titleEl) return;
  const screen = resolveScreen();
  if(screen === "select"){
    topEl.style.display = "none";
    return;
  }
  topEl.style.display = "";
  const c = S.cert ? certById(S.cert) : null;
  titleEl.textContent = c ? c.code : "ホーム";
}

export function render(){
  gcalHandleIdentityChange(); // ログインユーザーの切替を検知し、前の人のGoogle連携状態を破棄
  skinHandleIdentityChange(); // ログインユーザーの切替を検知し、前の人のスキン状態を読み直す
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
  if(S.screen==="schedule") return renderSchedule();
  if(S.screen==="portfolio") return renderPortfolio();
  if(S.screen==="news-japan") return renderNewsJapan();
  if(S.screen==="news-world") return renderNewsWorld();
  if(S.screen==="calendar") return renderCalendarScreen();
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

/* お天気カード：資格一覧画面の上部。左から「日付＋デジタル時計」
   「天気（地名・気温・降水確率）」「簡易予定表」の3カラム構成。
   位置情報が取得できない場合はデフォルト地点（東京）にフォールバックし、
   取得できないことを隠さずラベルで示す。天気データ自体が取得できない
   場合は「取得できませんでした」の案内を表示し、実データのように見える
   ダミー値は表示しない。 */

let clockTimer = null;
let weatherRefreshTimer = null;
const WEATHER_REFRESH_MS = 20 * 60 * 1000; // 20分ごとに天気を自動で再フェッチする

// カードは左（比率2.4）＝「日付＋デジタル時計｜天気（地名・アイコン・気温）」
// ＋その下の降水確率の推移を示す滑らかな曲線グラフ、
// 右（比率1）＝簡易予定表（ダミー表示。予定管理機能は未実装）の2エリア構成。
function weatherCardHTML(){
  return `
    <div class="news-card weather-card" id="weather-card">
      <div class="weather-body">
        <div class="weather-left">
          <div class="weather-left-top">
            <div class="weather-datetime">
              <div class="weather-date" id="weather-clock-date"></div>
              <div class="weather-time">
                <span id="weather-clock-time"></span><span class="weather-time-sec" id="weather-clock-sec"></span>
              </div>
            </div>
            <div class="weather-info" id="weather-info">
              <div class="weather-city" id="weather-city">取得中…</div>
              <div class="weather-asof" id="weather-asof"></div>
              <div class="weather-main">
                <span class="weather-icon" id="weather-icon">🌡️</span>
                <span class="weather-temp" id="weather-temp"></span>
              </div>
            </div>
          </div>
          <div class="weather-pop-chart" id="weather-pop-chart"></div>
        </div>
        <div class="weather-schedule">
          <div class="weather-schedule-title">予定</div>
          <div class="weather-schedule-item">15:00 勉強会</div>
          <div class="weather-schedule-item">19:00 買い物</div>
        </div>
      </div>
    </div>`;
}

const WEEKDAY_JA = ["日","月","火","水","木","金","土"];

function updateClock(){
  const dateEl = document.getElementById("weather-clock-date");
  const timeEl = document.getElementById("weather-clock-time");
  if(!dateEl && !timeEl){
    if(clockTimer){ clearInterval(clockTimer); clockTimer = null; }
    return;
  }
  const now = new Date();
  const pad = (n) => String(n).padStart(2,"0");
  if(dateEl) dateEl.textContent = `${now.getMonth()+1}/${now.getDate()}(${WEEKDAY_JA[now.getDay()]})`;
  if(timeEl) timeEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const secEl = document.getElementById("weather-clock-sec");
  if(secEl) secEl.textContent = `:${pad(now.getSeconds())}`;
}

function startClock(){
  if(clockTimer){ clearInterval(clockTimer); clockTimer = null; }
  updateClock();
  clockTimer = setInterval(updateClock, 1000);
}

// 予報時刻(ISO文字列)を軸ラベル用の「時」の数字だけに整形する（単位の「時」は
// 軸全体で右端に1回だけ表示するため、ラベル自体には付けない）
function formatPopChartHour(isoTime){
  return `${new Date(isoTime).getHours()}`;
}

// 点列を通る滑らかな曲線（Catmull-Rom→3次ベジェ変換）のSVGパスを組み立てる。
// 折れ線をそのまま描くとカクカクするため、各区間を前後の点も考慮した
// ベジェ曲線に変換し、視覚的に滑らかな推移として見せる
function catmullRomSmoothPath(points){
  if(points.length < 2) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for(let i=0; i<points.length-1; i++){
    const p0 = points[i-1] || points[i];
    const p1 = points[i];
    const p2 = points[i+1];
    const p3 = points[i+2] || p2;
    const cp1x = p1.x + (p2.x - p0.x)/6;
    const cp1y = p1.y + (p2.y - p0.y)/6;
    const cp2x = p2.x - (p3.x - p1.x)/6;
    const cp2y = p2.y - (p3.y - p1.y)/6;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

const POP_CHART_W = 220, POP_CHART_H = 40, POP_CHART_PAD = 4;
const POP_CHART_Y_TICKS = [100, 80, 60, 40, 20, 0]; // 縦軸目盛り・％（左軸、上→下）
// 縦軸目盛り・降水量mm（右軸、上→下）。天気アプリでよく使われる区切り
// （弱い雨〜激しい雨の目安）に合わせているため値の間隔は不均等だが、
// 目盛り線自体はPOP_CHART_Y_TICKSと同じ6段に均等割りして共有する
const PRECIP_Y_TICKS = [25, 15, 10, 6, 3, 0];
const POP_CHART_LABEL_EVERY = 3; // 横軸の数字は3時間ごとにのみ表示する

// 目盛りのインデックス位置（0=一番上、tickCount-1=一番下）をSVGのY座標に変換する。
// 端（インデックス0・最後）ではストローク幅の半分がSVG表示範囲の外に出て
// 消えてしまうため、半径0.5分だけ内側にクランプする
function axisTickY(index, tickCount){
  const raw = (index / (tickCount - 1)) * POP_CHART_H;
  return Math.min(POP_CHART_H - 0.5, Math.max(0.5, raw));
}

// 降水量(mm)を、PRECIP_Y_TICKS の目盛り間隔（不等間隔）に沿って0(下端)〜
// 1(上端)の比率に変換する。目盛りの間は線形補間するため、棒グラフの高さが
// 対応する目盛り線の位置にちょうど揃う
function precipValueToFrac(mm){
  const ticksAsc = [...PRECIP_Y_TICKS].reverse(); // [0,3,6,10,15,25]
  const bands = ticksAsc.length - 1;
  const max = ticksAsc[bands];
  const v = Math.max(0, Math.min(max, mm));
  for(let i=0; i<bands; i++){
    const lo = ticksAsc[i], hi = ticksAsc[i+1];
    if(v <= hi || i === bands - 1){
      const frac = hi > lo ? (v - lo) / (hi - lo) : 0;
      return (i + frac) / bands;
    }
  }
  return 0;
}

// 降水確率の推移（今＋1時間おき24点）を、数値の縦並びリストではなく
// 滑らかな曲線グラフとして描画する。1時間ごとの点をそのままドットとして
// 打ち、横軸の数字ラベルは3時間ごとにのみ間引いて表示する。縦軸には
// 0〜100%の目盛りを添え、単位（%）は縦軸の一番上、単位（時）は横軸の
// 一番右端にそれぞれ1回だけ表示する
function renderWeatherPopChart(w){
  const el = document.getElementById("weather-pop-chart");
  if(!el) return;
  const points = (w && typeof w.pop === "number")
    ? [{ label:"今", pop:w.pop, precip:w.precip }, ...(w.hourly||[]).map(h => ({ label: formatPopChartHour(h.time), pop:h.pop, precip:h.precip }))]
    : [];
  if(points.length < 2){ el.innerHTML = ""; return; }
  const n = points.length;
  const innerW = POP_CHART_W - POP_CHART_PAD*2;
  const innerH = POP_CHART_H - POP_CHART_PAD*2;
  const coords = points.map((p,i) => ({
    x: POP_CHART_PAD + (i/(n-1))*innerW,
    y: POP_CHART_PAD + innerH - (Math.max(0,Math.min(100,p.pop))/100)*innerH,
  }));
  const pathD = catmullRomSmoothPath(coords);
  const dots = coords.map(c => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="1.7" fill="var(--accent)"></circle>`).join("");

  // 降水量(mm)のヒストグラム。折れ線と同じx座標(coords)に、点の間隔の半分の
  // 太さの棒を中心にして立てる。棒は折れ線より奥（背面）に描く
  const barW = Math.max(1.2, (innerW / (n - 1)) * 0.5);
  const bars = points.map((p, i) => {
    const mm = Math.max(0, typeof p.precip === "number" ? p.precip : 0);
    const barH = precipValueToFrac(mm) * POP_CHART_H;
    const x = coords[i].x;
    return `<rect x="${(x - barW/2).toFixed(1)}" y="${(POP_CHART_H - barH).toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" fill="var(--precip)" opacity=".85" rx=".6"></rect>`;
  }).join("");

  // 目盛り線とラベルを同じY座標式で位置決めする（別々のflex配置に頼らない）。
  // ％軸（左）とmm軸（右）は目盛りの本数が同じ(6本)なので、線そのものは
  // 共有し、ラベルの数字だけ左右で意味（％ / mm）を変える
  const gridlines = POP_CHART_Y_TICKS.map((_, i) => {
    const y = axisTickY(i, POP_CHART_Y_TICKS.length);
    return `<line x1="0" y1="${y.toFixed(1)}" x2="${POP_CHART_W}" y2="${y.toFixed(1)}" stroke="var(--line)" stroke-width="1" opacity=".5"></line>`;
  }).join("");
  const yTicks = POP_CHART_Y_TICKS.map((v, i) => `<span style="top:${(axisTickY(i, POP_CHART_Y_TICKS.length)/POP_CHART_H*100).toFixed(2)}%">${v}</span>`).join("");
  const mmTicks = PRECIP_Y_TICKS.map((v, i) => `<span style="top:${(axisTickY(i, PRECIP_Y_TICKS.length)/POP_CHART_H*100).toFixed(2)}%">${v}</span>`).join("");

  // 横軸の数字ラベルは3時間ごと（今＝0時間後を含む）にのみ間引く。
  // 元データが1時間おきの等間隔のため、間引いた後も均等割り付けで軸と揃う
  const labelPoints = points.filter((_,i) => i % POP_CHART_LABEL_EVERY === 0);
  const labels = labelPoints.map(p => `<span>${esc(p.label)}</span>`).join("");
  el.innerHTML = `
    <div class="weather-pop-chart-units">
      <div class="pop-axis-yunit">%</div>
      <div class="pop-axis-yunit-right">mm</div>
    </div>
    <div class="weather-pop-chart-row">
      <div class="pop-axis-ycol pop-axis-yticks">${yTicks}</div>
      <div class="weather-pop-chart-plot">
        <svg class="weather-pop-chart-svg" viewBox="0 0 ${POP_CHART_W} ${POP_CHART_H}" preserveAspectRatio="none">
          ${bars}
          ${gridlines}
          <path d="${pathD}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
          ${dots}
        </svg>
      </div>
      <div class="pop-axis-ycol pop-axis-yticks-right">${mmTicks}</div>
    </div>
    <div class="weather-pop-chart-xrow">
      <div class="pop-axis-ycol pop-axis-yspacer"></div>
      <div class="weather-pop-chart-labels">${labels}</div>
      <div class="pop-axis-xunit">時</div>
      <div class="pop-axis-ycol pop-axis-yspacer"></div>
    </div>`;
}

// 天気情報を取得してカードを再描画する。ホーム画面から離れて weather-card が
// DOM上から消えている場合は、取得結果を無駄に描画せず自動更新タイマーも止める
// （画面遷移時のクリーンアップ）。
async function refreshWeatherCard(){
  if(!document.getElementById("weather-card")){
    if(weatherRefreshTimer){ clearInterval(weatherRefreshTimer); weatherRefreshTimer = null; }
    return;
  }
  const cityEl = document.getElementById("weather-city");
  const asofEl = document.getElementById("weather-asof");
  const iconEl = document.getElementById("weather-icon");
  const tempEl = document.getElementById("weather-temp");
  const w = await getWeather();
  if(!document.getElementById("weather-card")) return; // フェッチ中に画面遷移した場合は描画しない
  if(!w){
    if(cityEl) cityEl.textContent = "天気を取得できませんでした";
    if(asofEl) asofEl.textContent = "";
    if(iconEl) iconEl.textContent = "🌡️";
    if(tempEl) tempEl.textContent = "";
    renderWeatherPopChart(null);
    return;
  }
  if(cityEl) cityEl.textContent = w.isDefaultLocation ? `${w.city}（現在地未取得）` : w.city;
  // この天気がいつ時点の観測かをアイコンのすぐ上に明記する
  if(asofEl){
    if(w.currentTime){
      const d = new Date(w.currentTime);
      asofEl.textContent = `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}時点`;
    } else {
      asofEl.textContent = "現在";
    }
  }
  if(iconEl) iconEl.textContent = w.icon;
  if(tempEl) tempEl.textContent = `${w.temp}℃`;
  renderWeatherPopChart(w);
}

function startWeatherRefresh(){
  if(weatherRefreshTimer){ clearInterval(weatherRefreshTimer); weatherRefreshTimer = null; }
  weatherRefreshTimer = setInterval(() => {
    if(!document.getElementById("weather-card")){ clearInterval(weatherRefreshTimer); weatherRefreshTimer = null; return; }
    refreshWeatherCard();
  }, WEATHER_REFRESH_MS);
}

async function loadWeatherCard(){
  const card = document.getElementById("weather-card");
  if(!card) return;
  startClock();
  await refreshWeatherCard(); // 画面を開いた瞬間の即時フェッチ
  startWeatherRefresh();      // 以後20分間隔でバックグラウンド自動更新
}

/* =========================================================================
   MARKET WATCH（株価ティッカー）：ニュースカードと同じデザインシステムを
   流用した「電光掲示板（ティッカーボード）風」の株価ティッカー。
   銘柄名＋株価＋前日比が右から左へエンドレスに流れるマーキーと、左上の
   最終更新日時からなる。ホーム画面には表示せず、日本経済・世界経済の
   各ニュース画面の最上部にcreateMarketWatch()のインスタンスとしてそれぞれ
   独立して表示する（日本経済＝JP_STOCKS＝日本の主要企業のNYSE上場ADR、
   世界経済＝STOCKS＝米国株6銘柄。どちらもFinnhub実データ取得を同条件で試みる）。
   起動直後はサンプル株価で表示し、Finnhubの株価APIから実際の株価を取得
   できた場合はそちらに置き換える（東証の個別銘柄・指数はFinnhub無料枠では
   実データが取得できないことを確認済みのため、日本経済側はNYSE上場のADRを
   採用している）。取得に失敗した場合、一度も実データを取得できていなければ
   引き続きサンプル値を、既に実データを取得済みの銘柄であれば最後に取得
   できた値（最終参照値）をそのまま据え置いて表示する（実データのように
   見える擬似変動はさせない）。
   ========================================================================= */

const STOCKS = [
  { ticker:"MSFT", name:"Microsoft", price:435.12, previousClose:429.91, sessionLabel:"サンプル", isLive:false, everLive:false },
  { ticker:"AMZN", name:"Amazon", price:189.50, previousClose:190.45, sessionLabel:"サンプル", isLive:false, everLive:false },
  { ticker:"GOOGL", name:"Alphabet", price:199.80, previousClose:200.80, sessionLabel:"サンプル", isLive:false, everLive:false },
  { ticker:"AAPL", name:"Apple", price:213.40, previousClose:211.20, sessionLabel:"サンプル", isLive:false, everLive:false },
  { ticker:"META", name:"Meta", price:512.30, previousClose:520.10, sessionLabel:"サンプル", isLive:false, everLive:false },
  { ticker:"NVDA", name:"NVIDIA", price:135.60, previousClose:131.90, sessionLabel:"サンプル", isLive:false, everLive:false },
];

// 日本経済ニュース画面用の株価ティッカー。東証の個別銘柄・指数はFinnhub無料枠
// では実データ取得ができないことを確認済みのため使用せず、日本の主要企業が
// NYSEに上場しているADR（米国預託証券）を採用する。米国株と全く同じ取引所・
// 取得経路のため、米国株と同条件（取得できた銘柄だけ実データに置き換え、
// 失敗した銘柄はサンプル値の擬似変動）でFinnhubの実データ取得を試みる
const JP_STOCKS = [
  { ticker:"TM", name:"トヨタ自動車(ADR)", price:195.40, previousClose:193.80, sessionLabel:"サンプル", isLive:false, everLive:false },
  { ticker:"SONY", name:"ソニーG(ADR)", price:24.60, previousClose:24.30, sessionLabel:"サンプル", isLive:false, everLive:false },
  { ticker:"HMC", name:"本田技研(ADR)", price:32.10, previousClose:32.50, sessionLabel:"サンプル", isLive:false, everLive:false },
  { ticker:"MUFG", name:"三菱UFJ(ADR)", price:11.20, previousClose:11.05, sessionLabel:"サンプル", isLive:false, everLive:false },
  { ticker:"MFG", name:"みずほFG(ADR)", price:4.55, previousClose:4.60, sessionLabel:"サンプル", isLive:false, everLive:false },
  { ticker:"NMR", name:"野村HD(ADR)", price:6.35, previousClose:6.20, sessionLabel:"サンプル", isLive:false, everLive:false },
];

// change(%)は常に previousClose（前日終値）を基準に計算する。
// 実データ取得時・擬似変動時ともにこの基準値を更新して整合性を保つ。
[STOCKS, JP_STOCKS].forEach(list => list.forEach(s => { s.change = ((s.price - s.previousClose) / s.previousClose) * 100; }));
// 起動直後は実データ取得前なので、必ず「サンプル」表示から始める（実データと誤認させない）

const STOCK_REFRESH_MS = 45000; // 実株価の再取得・擬似変動の更新間隔
const STOCK_TICK_PCT = 0.006;   // 実データが使えない場合の1回あたりの変動幅（±0.3%程度）

/* ---- 保有株（デモ取引のポートフォリオ）。端末ローカルに保存する ----
   保存キーは「現在ログインしているユーザー」ごとに独立させる。ベースキーに
   ログイン中のFirebase UID（未ログイン＝ゲスト利用中は"guest"固定）を連結
   することで、同じ端末・同じブラウザを複数人が使い回しても、他人の売買
   履歴や保有株が絶対に混入しないようにする（gcalStorageKeyと同じ方式） */
const PORTFOLIO_KEY = "stock_portfolio_v1";

function portfolioStorageKey(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `${PORTFOLIO_KEY}::${uid}`;
}

export function loadPortfolio(){
  try{
    const p = JSON.parse(localStorage.getItem(portfolioStorageKey()) || "{}");
    return (p && typeof p === "object" && !Array.isArray(p)) ? p : {};
  }catch(e){ return {}; }
}
function savePortfolio(p){
  try{ localStorage.setItem(portfolioStorageKey(), JSON.stringify(p)); }catch(e){}
}

// クラウド（Firestoreの users/{uid}.portfolio）から届いた保有株データを
// この端末のローカル保存へ反映する。db.jsのonSnapshotから、ログイン中の
// 本人のドキュメントが更新されるたびに呼ばれる（他人のデータは購読して
// いないため混入しない）。ポートフォリオ画面を表示中なら即座に描画し直す
export function applyCloudPortfolio(pf){
  if(!pf || typeof pf !== "object" || Array.isArray(pf)) return;
  savePortfolio(pf);
  if(S.screen === "portfolio") renderPortfolio();
}

function round2(n){ return Math.round(n*100)/100; }

// 「◯月◯日 ◯時◯分時点」形式に整形する（最終更新日時の表示用）
function formatStocksUpdatedAt(ms){
  const d = new Date(ms);
  return `${d.getMonth()+1}月${d.getDate()}日 ${d.getHours()}時${String(d.getMinutes()).padStart(2,"0")}分時点`;
}

// 実データが取得できなかった銘柄のフォールバック処理。
// 一度でも実データを取得できたことがある銘柄（everLive）は、ランダムな擬似変動は
// させず、最後に取得できた実際の値をそのまま据え置いて表示する（「最終参照」）。
// まだ一度も実データを取得できていない起動直後のみ、デモ表示用に擬似的な値動きを見せる
// （この場合のみ「サンプル」ラベルを出し、実データと誤認されないようにする）。
function simulateStockTick(s){
  s.isLive = false;
  if(s.everLive){
    // 実データ取得済みの銘柄：価格・変化率は動かさず、最後に取得できた値のまま据え置く
    s.sessionLabel = "最終参照";
    return;
  }
  const delta = (Math.random() - 0.5) * STOCK_TICK_PCT;
  s.price = Math.max(0.01, round2(s.price * (1 + delta)));
  s.change = ((s.price - s.previousClose) / s.previousClose) * 100;
  s.sessionLabel = "サンプル";
}

// ティッカー1銘柄分。マーキーをシームレスにループさせるため同じ列を2周分
// 描画する（copy=0/1）。中身のテキストはIDで直接更新し、アニメーション中の
// DOM再構築（＝流れのリセット）を避ける。instanceIdで日本経済／世界経済の
// 2インスタンス分のDOM idを衝突なく分離する
function stockTapeItemHTML(instanceId, copy, i){
  const hidden = copy === 1 ? ` aria-hidden="true"` : "";
  return `
    <span class="stock-tape-item"${hidden}>
      <span class="tape-ticker" id="tape-ticker-${instanceId}-${copy}-${i}"></span>
      <span class="tape-price" id="tape-price-${instanceId}-${copy}-${i}"></span>
      <span class="tape-change" id="tape-change-${instanceId}-${copy}-${i}"></span>
      <span class="tape-session" id="tape-session-${instanceId}-${copy}-${i}" style="display:none"></span>
    </span>`;
}

// 日本経済・世界経済それぞれのMARKET WATCHインスタンスを生成するファクトリー。
// instanceIdごとに独立したDOM id・自動更新タイマー・電光掲示板テープを持つため、
// 2画面で同時に（切り替えながら）使っても互いに干渉しない。
// fetchLiveを渡した場合のみFinnhub実データ取得を試み、銘柄ごとに成否を判定
// する（一部の銘柄が取得できなくても他の銘柄は実データを表示できる）。
// fetchLiveを渡さない場合は常にサンプル値の擬似変動で表示する
// MARKET WATCHカード右上のミニ買付/売却/ポートフォリオボタン用アイコン。
// カレンダー起動アイコン等と同じ、線画のみのプレーンなSVGで統一する
const STOCK_MINI_ICON_BUY = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="6 11 12 5 18 11"></polyline></svg>`;
const STOCK_MINI_ICON_SELL = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="6 13 12 19 18 13"></polyline></svg>`;
const STOCK_MINI_ICON_PORTFOLIO = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V7a2 2 0 0 1 2-2h9l5 5v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"></path><path d="M15 5v5h5"></path><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="13" y2="17"></line></svg>`;

function createMarketWatch({ instanceId, stocks, fetchLive, formatPrice }){
  let lastUpdatedAt = null;
  let refreshTimer = null;
  const tapeId = `stock-tape-${instanceId}`;
  const updatedId = `stock-updated-${instanceId}`;
  // 価格の通貨表示：世界経済（米国株）は"$"、日本経済（円建て指標・銘柄）は
  // 桁区切りの円表示にするため、インスタンスごとにフォーマットを差し替える
  const priceText = formatPrice || (s => `$${s.price.toFixed(2)}`);

  function html(){
    const tapeCopy = (copy) => stocks.map((_,i) => stockTapeItemHTML(instanceId, copy, i)).join("");
    return `
      <div class="news-card stocks-card" id="stocks-card-${instanceId}">
        <div class="news-card-head">
          <div class="stock-head-left">
            <span class="news-badge stock-badge">📈 株価</span>
            <div class="stock-updated" id="${updatedId}"></div>
          </div>
          <div class="stock-mini-actions">
            <button type="button" class="stock-mini-btn buy" id="stock-buy-${instanceId}" aria-label="買付" title="買付">
              ${STOCK_MINI_ICON_BUY}買付
            </button>
            <button type="button" class="stock-mini-btn sell" id="stock-sell-${instanceId}" aria-label="売却" title="売却">
              ${STOCK_MINI_ICON_SELL}売却
            </button>
            <button type="button" class="stock-mini-portfolio" id="stock-portfolio-${instanceId}" aria-label="ポートフォリオへ" title="ポートフォリオ">
              ${STOCK_MINI_ICON_PORTFOLIO}
            </button>
          </div>
        </div>
        <div class="stock-tape" id="${tapeId}">
          <div class="stock-tape-track">${tapeCopy(0)}${tapeCopy(1)}</div>
        </div>
      </div>`;
  }

  function renderUpdated(){
    const el = document.getElementById(updatedId);
    if(el) el.textContent = lastUpdatedAt ? formatStocksUpdatedAt(lastUpdatedAt) : "";
  }

  function renderTapeContent(i){
    const s = stocks[i];
    if(!s) return;
    const up = s.change >= 0;
    for(let copy = 0; copy < 2; copy++){
      const tickerEl = document.getElementById(`tape-ticker-${instanceId}-${copy}-${i}`);
      const priceEl = document.getElementById(`tape-price-${instanceId}-${copy}-${i}`);
      const changeEl = document.getElementById(`tape-change-${instanceId}-${copy}-${i}`);
      const sessionEl = document.getElementById(`tape-session-${instanceId}-${copy}-${i}`);
      if(tickerEl) tickerEl.textContent = s.ticker;
      if(priceEl) priceEl.textContent = priceText(s);
      if(changeEl){
        changeEl.textContent = `${up?"▲":"▼"} ${up?"+":""}${s.change.toFixed(1)}%`;
        changeEl.className = `tape-change ${up?"up":"down"}`;
      }
      if(sessionEl){
        if(s.sessionLabel){ sessionEl.textContent = s.sessionLabel; sessionEl.style.display = ""; }
        else { sessionEl.style.display = "none"; }
      }
    }
  }
  function renderTape(){ stocks.forEach((_,i) => renderTapeContent(i)); }

  // 実株価取得の結果をstocksへ反映する（銘柄ごと。取得できなかった銘柄だけ
  // フォールバックに回す＝一部失敗しても他の銘柄は実データを表示できる）
  function applyLiveStocks(liveItems){
    if(!liveItems) return;
    let appliedAny = false;
    liveItems.forEach(liveItem => {
      if(!liveItem) return; // その銘柄は取得失敗（nullが入る）→ 後段の擬似変動に任せる
      const s = stocks.find(x => x.ticker === liveItem.ticker);
      if(!s) return;
      s.price = liveItem.price;
      s.previousClose = liveItem.previousClose;
      s.change = liveItem.change;
      s.sessionLabel = null; // 実データ取得成功時はバッジ非表示
      s.isLive = true;
      s.everLive = true;
      appliedAny = true;
    });
    // 1銘柄でも実データを反映できたら、その瞬間を「最終更新日時」として記録する
    if(appliedAny) lastUpdatedAt = Date.now();
  }

  async function refresh(){
    stocks.forEach(s => { s.isLive = false; }); // 今回の取得結果で改めて判定し直す
    if(fetchLive){
      const liveItems = await fetchLive();
      applyLiveStocks(liveItems);
    }
    stocks.forEach(s => { if(!s.isLive) simulateStockTick(s); });
    renderTape();
    renderUpdated();
  }

  function startRefresh(){
    if(refreshTimer){ clearInterval(refreshTimer); refreshTimer = null; }
    refresh();
    refreshTimer = setInterval(() => {
      if(!document.getElementById(tapeId)){ clearInterval(refreshTimer); refreshTimer = null; return; }
      refresh();
    }, STOCK_REFRESH_MS);
  }

  // 画面のinnerHTML挿入後に呼び出す。DOMが無い（別画面に切り替わった）場合は何もしない
  function mount(){
    if(!document.getElementById(tapeId)) return;
    renderTape();
    renderUpdated();
    startRefresh();
    initHybridTape(tapeId, 27); // 株価ティッカー（自動ループ＋手動スワイプ）

    const buyBtn = document.getElementById(`stock-buy-${instanceId}`);
    const sellBtn = document.getElementById(`stock-sell-${instanceId}`);
    const portfolioBtn = document.getElementById(`stock-portfolio-${instanceId}`);
    if(buyBtn) buyBtn.onclick = () => openTradeModal("buy", stocks);
    if(sellBtn) sellBtn.onclick = () => openTradeModal("sell", stocks);
    if(portfolioBtn) portfolioBtn.onclick = () => go("portfolio");
  }

  return { html, mount };
}

// JP_STOCKSはNYSE上場のADR（米国預託証券）でドル建てのため、価格表示は
// 世界経済側と同じ既定の"$"フォーマットのままでよい（formatPriceの指定なし）
const jpMarketWatch = createMarketWatch({
  instanceId: "jp",
  stocks: JP_STOCKS,
  fetchLive: getLiveStocksJP, // 米国株と同条件でFinnhubから実データ取得を試みる
});
const worldMarketWatch = createMarketWatch({ instanceId: "world", stocks: STOCKS, fetchLive: getLiveStocks });

/* ---- ハイブリッドテープ（自動ループ＋手動スワイプ）の共通制御 ----
   株価ティッカーとIT/AIニュースの両方で使う汎用の仕組み。
   CSSアニメーションではなく、実際にスクロールできるコンテナ（overflow-x:auto）の
   scrollLeftをrequestAnimationFrameで少しずつ進めて「流れる」動きを作る。
   こうすることで、ユーザーはいつでも指でタッチして左右に自由にスワイプでき
   （タッチ中は自動送りを一時停止）、指を離すと少しのディレイの後に
   その位置から自動スクロールが滑らかに再開する。
   同じ列を2周分並べてあるため、scrollLeftが1周分を超えたら1周分だけ
   巻き戻す（左端まで巻き戻したら1周分進める）ことで、前後どちらの方向にも
   境目なく無限にループしているように見せる */

const TAPE_RESUME_DELAY_MS = 2500;  // 指を離してから自動送りを再開するまでの待ち時間
const tapeControllers = {};        // 要素ID -> テープごとの状態
let tapeRafId = null;
let tapeDragId = null;             // マウスドラッグ中のテープの要素ID（PC向け）
let tapeDragStartX = 0;
let tapeDragStartScroll = 0;
let tapeDragMoved = 0;             // ドラッグ移動量（直後のクリック抑止の判定用）

function tapeHalfWidth(tapeEl){
  const track = tapeEl.firstElementChild;
  return track ? track.scrollWidth / 2 : 0;
}

// すべてのテープを1つのrAFループでまとめて進める。要素がDOMから消えた
// テープは登録を外し、テープが1つも無くなったらループ自体を止める
function tapeLoop(ts){
  let anyAlive = false;
  Object.keys(tapeControllers).forEach(id => {
    const st = tapeControllers[id];
    const tapeEl = document.getElementById(id);
    if(!tapeEl){ clearTimeout(st.resumeTimer); delete tapeControllers[id]; return; }
    anyAlive = true;
    if(st.lastTs && !st.paused){
      st.pos += st.speed * (ts - st.lastTs) / 1000;
      const half = tapeHalfWidth(tapeEl);
      if(half > 0 && st.pos >= half) st.pos -= half;
      tapeEl.scrollLeft = st.pos;
    }
    st.lastTs = ts;
  });
  tapeRafId = anyAlive ? requestAnimationFrame(tapeLoop) : null;
}

function ensureTapeLoop(){
  if(!tapeRafId) tapeRafId = requestAnimationFrame(tapeLoop);
}

function pauseTape(id){
  const st = tapeControllers[id];
  if(!st) return;
  st.paused = true;
  clearTimeout(st.resumeTimer);
}

// 指を離してから一定時間後に、ユーザーが動かした位置を引き継いで自動送りを再開する
function scheduleTapeResume(id){
  const st = tapeControllers[id];
  if(!st) return;
  clearTimeout(st.resumeTimer);
  st.resumeTimer = setTimeout(() => {
    const tapeEl = document.getElementById(id);
    if(tapeEl) st.pos = tapeEl.scrollLeft;
    st.paused = false;
  }, TAPE_RESUME_DELAY_MS);
}

// 手動スクロール中のシームレスなループ処理（1周分を超えたら巻き戻す）
function onTapeManualScroll(id){
  const st = tapeControllers[id];
  const tapeEl = document.getElementById(id);
  if(!st || !tapeEl || !st.paused) return; // 自動送り中の巻き戻しはtapeLoop側で行う
  const half = tapeHalfWidth(tapeEl);
  if(half <= 0) return;
  if(tapeEl.scrollLeft >= half) tapeEl.scrollLeft -= half;
  // 左端まで巻き戻したら1周先の同じ見た目の位置へ（half丁度に置くと直後に
  // 上の巻き戻し条件と往復してしまうため、1px内側に着地させる）
  else if(tapeEl.scrollLeft < 1) tapeEl.scrollLeft += half - 1;
}

// PCのマウスドラッグでもスワイプできるようにする（moveとupは画面全体で拾う
// 必要があるためwindowに一度だけ登録し、対象要素は都度探す）
window.addEventListener("mousemove", (e) => {
  if(!tapeDragId) return;
  const tapeEl = document.getElementById(tapeDragId);
  if(!tapeEl) return;
  const dx = e.clientX - tapeDragStartX;
  tapeDragMoved = Math.max(tapeDragMoved, Math.abs(dx));
  tapeEl.scrollLeft = tapeDragStartScroll - dx;
});
window.addEventListener("mouseup", () => {
  if(!tapeDragId) return;
  const tapeEl = document.getElementById(tapeDragId);
  if(tapeEl) tapeEl.classList.remove("dragging");
  scheduleTapeResume(tapeDragId);
  tapeDragId = null;
});

// テープ1本分の登録解除（前回は流れていた行が静止表示に切り替わった場合など）
function removeHybridTape(id){
  const st = tapeControllers[id];
  if(!st) return;
  clearTimeout(st.resumeTimer);
  delete tapeControllers[id];
}

// テープ1本分の初期化。再レンダー時に呼び直しても多重にならない
// （イベントはon〇〇プロパティへの代入、状態はIDで上書き）
function initHybridTape(id, speedPxS){
  const tapeEl = document.getElementById(id);
  if(!tapeEl) return;
  const prev = tapeControllers[id];
  if(prev) clearTimeout(prev.resumeTimer);
  const st = { speed: speedPxS, pos: Math.max(1, tapeEl.scrollLeft), paused: false, lastTs: 0, resumeTimer: null };
  tapeControllers[id] = st;
  tapeEl.scrollLeft = st.pos;
  // タッチ中は自動送りを止め、指の動き（ネイティブスクロール）に任せる。
  // on〇〇プロパティはタッチ非対応環境だとイベント登録にならないため、
  // addEventListenerで確実に登録する（要素は再レンダーごとに作り直される
  // ので多重登録にはならない）
  tapeEl.addEventListener("touchstart", () => pauseTape(id), { passive: true });
  tapeEl.addEventListener("touchend", () => scheduleTapeResume(id), { passive: true });
  tapeEl.addEventListener("touchcancel", () => scheduleTapeResume(id), { passive: true });
  // トラックパッド等の横スクロールでも同様に一時停止→自動再開
  tapeEl.addEventListener("wheel", () => { pauseTape(id); scheduleTapeResume(id); }, { passive: true });
  tapeEl.onscroll = () => onTapeManualScroll(id);
  tapeEl.onmousedown = (e) => {
    tapeDragId = id;
    tapeDragStartX = e.clientX;
    tapeDragStartScroll = tapeEl.scrollLeft;
    tapeDragMoved = 0;
    tapeEl.classList.add("dragging");
    pauseTape(id);
    e.preventDefault();
  };
  // ドラッグ操作の直後に発生するclickでリンクへ飛んでしまわないようにする
  // （ニュースのテープは中身がリンクのため。単純なタップ・クリックは通す）
  tapeEl.onclick = (e) => {
    if(tapeDragMoved > 5){ e.preventDefault(); e.stopPropagation(); }
  };
  ensureTapeLoop();
}

/* ---- AC連動のデモ売買 ---- */

// 売買金額の換算レート：1ドル＝1ACとして四捨五入する（デモ取引用）
function tradeAmount(price, qty){ return Math.max(1, Math.round(price * qty)); }

// 買付・売却1回分の検証込み計算。amount（総額）はAC不足／保有不足の
// チェックに使うほか、成功時は更新後のcoins・portfolioを組み立てて返す。
// ok:falseの場合はmsgのみを返し、呼び出し側は何も書き込まない
function computeTrade(mode, ticker, qty, price, coins, pf){
  const amount = tradeAmount(price, qty);
  if(mode === "buy"){
    if((coins||0) < amount){
      return { ok:false, msg:`ACが不足しています（必要 ${amount.toLocaleString()} AC / 残高 ${(coins||0).toLocaleString()} AC）。` };
    }
    const h = pf[ticker] || { shares:0, cost:0 };
    const newPf = Object.assign({}, pf, { [ticker]: { shares: h.shares + qty, cost: h.cost + amount } });
    return { ok:true, amount, coins: (coins||0) - amount, portfolio: newPf };
  }
  const h = pf[ticker];
  const held = h ? h.shares : 0;
  if(held < qty){
    return { ok:false, msg:`保有株数が足りません（${ticker} の保有：${held} 株）。` };
  }
  const remaining = held - qty;
  const newPf = Object.assign({}, pf);
  if(remaining <= 0){
    delete newPf[ticker];
  } else {
    // 取得原価は平均取得単価ベースで按分して減らす
    newPf[ticker] = { shares: remaining, cost: Math.round(h.cost * remaining / held) };
  }
  return { ok:true, amount, coins: (coins||0) + amount, portfolio: newPf };
}

// 買付・売却を実行し、AC残高と保有株を更新する。検証エラーはmsgで返す。
// stocksは呼び出し元のMARKET WATCHインスタンスが持つ銘柄配列（STOCKSまたは
// JP_STOCKS）で、日本経済・世界経済どちらの画面から売買しても対象銘柄を
// 正しく参照できるようにする（保有株は共通のPORTFOLIO_KEYに銘柄ticker単位で
// 保存されるため、日米の保有をまとめて1つのポートフォリオ画面で確認できる）。
//
// ログイン中はFirestoreの users/{uid} ドキュメントをトランザクションで読み書きする。
// サーバー上の最新のAC残高・保有株数を基準に検証したうえでcoins・portfolioの
// 両方を1回の書き込みで原子的に更新するため、複数端末で同時に操作しても
// 不整合（AC減算漏れ・保有株の消し忘れ等）が起きない。未ログイン（ゲスト
// 利用）時はローカル保存のみで同じ検証ロジックを使って更新する
async function executeTrade(mode, stocks, ticker, qty){
  const s = stocks.find(x => x.ticker === ticker);
  if(!s) return { ok:false, msg:"不明な銘柄です。" };
  if(!Number.isInteger(qty) || qty < 1) return { ok:false, msg:"株数は1株以上で指定してください。" };

  if(state.db && state.currentUserId && window.FirebaseSync && window.FirebaseSync.runTransaction){
    try{
      const ref = window.FirebaseSync.doc(state.db, "users", state.currentUserId);
      const result = await window.FirebaseSync.runTransaction(state.db, async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists() ? snap.data() : {};
        const coins = typeof data.coins === "number" ? data.coins : (S.coins||0);
        const pf = (data.portfolio && typeof data.portfolio === "object" && !Array.isArray(data.portfolio))
          ? data.portfolio : loadPortfolio();
        const r = computeTrade(mode, ticker, qty, s.price, coins, pf);
        if(!r.ok) return r;
        tx.set(ref, { coins: r.coins, portfolio: r.portfolio, updatedAt: new Date().toISOString() }, { merge:true });
        return r;
      });
      if(!result.ok) return result;
      S.coins = result.coins;
      saveCoins(S.coins);
      savePortfolio(result.portfolio);
      renderStatusBar(); // 画面上部のAC残高へ即時反映
      return { ok:true, amount: result.amount };
    }catch(e){
      console.error("trade transaction failed:", e);
      return { ok:false, msg:"通信エラーのため取引を完了できませんでした。もう一度お試しください。" };
    }
  }

  // 未ログイン（ゲスト利用）はローカル保存のみで検証・更新する
  const r = computeTrade(mode, ticker, qty, s.price, S.coins, loadPortfolio());
  if(!r.ok) return r;
  S.coins = r.coins;
  saveCoins(S.coins);
  savePortfolio(r.portfolio);
  renderStatusBar();
  return { ok:true, amount: r.amount };
}

// 買付／売却モーダル。銘柄と株数を選ぶと合計ACをその場で計算して表示し、
// 実行時にAC残高・保有株を検証のうえ更新する（ゲーム内デモ取引）。
// stocksはボタンを開いたMARKET WATCHインスタンスの銘柄配列（STOCKSまたは
// JP_STOCKS）で、そのカードで表示中の銘柄だけを売買対象にする
function openTradeModal(mode, stocks){
  const isBuy = mode === "buy";
  const pf = loadPortfolio();
  const heldOf = (t) => (pf[t] ? pf[t].shares : 0);
  const tickers = isBuy ? stocks.map(s => s.ticker) : stocks.filter(s => heldOf(s.ticker) > 0).map(s => s.ticker);

  const ov = document.createElement("div");
  ov.className = "modal-ov";
  if(!tickers.length){
    ov.innerHTML = `
      <div class="modal">
        <div class="modal-title" style="color:var(--text)">📉 売却</div>
        <div class="modal-body">売却できる保有株がありません。<br>まずは「買付」からACで株を購入してみましょう。</div>
        <button class="ghost" id="trade-cancel">閉じる</button>
      </div>`;
  } else {
    const options = tickers.map(t => {
      const s = stocks.find(x => x.ticker === t);
      const held = heldOf(t);
      return `<option value="${t}">${t}（$${s.price.toFixed(2)}${!isBuy || held ? ` / 保有 ${held}株` : ""}）</option>`;
    }).join("");
    ov.innerHTML = `
      <div class="modal">
        <div class="modal-title" style="color:${isBuy?"var(--accent)":"var(--text)"}">${isBuy?"📈 買付":"📉 売却"}<span class="trade-demo-tag">デモ取引</span></div>
        <div class="trade-balance">💰 AC残高：<b>${(S.coins||0).toLocaleString()}</b> AC</div>
        <label class="trade-lab" for="trade-sym">銘柄</label>
        <select id="trade-sym" class="trade-select">${options}</select>
        <label class="trade-lab" for="trade-qty">株数</label>
        <div class="trade-qty-row">
          <button type="button" class="trade-qty-btn" id="trade-minus" aria-label="1株減らす">−</button>
          <input id="trade-qty" class="trade-qty" type="number" inputmode="numeric" min="1" step="1" value="1">
          <button type="button" class="trade-qty-btn" id="trade-plus" aria-label="1株増やす">＋</button>
        </div>
        <div class="trade-summary" id="trade-summary"></div>
        <div class="trade-msg" id="trade-msg"></div>
        <button class="cta" id="trade-go">${isBuy?"買付を実行":"売却を実行"}</button>
        <button class="ghost" id="trade-cancel" style="margin-top:8px">キャンセル</button>
        <div class="trade-note">※ゲーム内通貨ACを使ったシミュレーションです。実際の売買は行われません。</div>
      </div>`;
  }
  document.body.appendChild(ov);
  const close = () => { try{ ov.remove(); }catch(e){} };
  ov.addEventListener("click", (e) => { if(e.target === ov) close(); });
  const cancelBtn = ov.querySelector("#trade-cancel");
  if(cancelBtn) cancelBtn.onclick = close;
  if(!tickers.length) return;

  const symEl = ov.querySelector("#trade-sym");
  const qtyEl = ov.querySelector("#trade-qty");
  const msgEl = ov.querySelector("#trade-msg");
  const summaryEl = ov.querySelector("#trade-summary");

  const readQty = () => {
    const v = parseInt(qtyEl.value, 10);
    return (isNaN(v) || v < 1) ? 1 : v;
  };
  const updateSummary = () => {
    const s = stocks.find(x => x.ticker === symEl.value);
    if(!s) return;
    const qty = readQty();
    const amount = tradeAmount(s.price, qty);
    const held = heldOf(s.ticker);
    summaryEl.innerHTML = `合計 <b>${amount.toLocaleString()}</b> AC（$${s.price.toFixed(2)} × ${qty}株）` +
      (isBuy ? "" : `<span class="trade-held">保有 ${held}株</span>`);
    msgEl.textContent = "";
  };
  symEl.onchange = updateSummary;
  qtyEl.oninput = updateSummary;
  ov.querySelector("#trade-minus").onclick = () => { qtyEl.value = String(Math.max(1, readQty() - 1)); updateSummary(); };
  ov.querySelector("#trade-plus").onclick = () => { qtyEl.value = String(readQty() + 1); updateSummary(); };
  updateSummary();

  const goBtn = ov.querySelector("#trade-go");
  goBtn.onclick = async () => {
    goBtn.disabled = true;
    msgEl.textContent = "";
    try{
      const r = await executeTrade(mode, stocks, symEl.value, readQty());
      if(!r.ok){ msgEl.textContent = r.msg; goBtn.disabled = false; return; }
      close();
    }catch(e){
      msgEl.textContent = "処理中にエラーが発生しました。もう一度お試しください。";
      goBtn.disabled = false;
    }
  };
}

/* ポートフォリオ（資産保有額）詳細画面：日本経済・世界経済どちらのMARKET WATCH
   から買付/売却しても、保有株は共通のPORTFOLIO_KEYにまとまるため、
   この画面ではSTOCKS・JP_STOCKS両方から銘柄情報を検索して表示する。
   現金AC＋保有株の評価額（現在株価ベース）のサマリーと保有明細を表示する */
export function renderPortfolio(){
  const pf = loadPortfolio();
  const tickers = Object.keys(pf);
  const allStocks = [...STOCKS, ...JP_STOCKS];
  let stockValue = 0;
  const rows = tickers.map(t => {
    const s = allStocks.find(x => x.ticker === t);
    const h = pf[t];
    const val = s ? tradeAmount(s.price, h.shares) : h.cost;
    stockValue += val;
    return `<div class="pf-row">
      <div class="pf-row-left">
        <span class="pf-ticker">${esc(t)}</span>
        <span class="pf-name">${esc(s ? s.name : "")}</span>
      </div>
      <div class="pf-row-right">
        <span class="pf-shares">${h.shares}株</span>
        <span class="pf-val">${val.toLocaleString()} AC</span>
      </div>
    </div>`;
  }).join("");
  const cash = S.coins || 0;
  app.innerHTML = `
    <div class="q-head"><button class="quit" data-go="select">← ホーム</button><span class="q-count">ポートフォリオ</span></div>
    <div class="pf-hero">
      <div class="pf-hero-lab">総資産（評価額）</div>
      <div class="pf-hero-total">${(cash + stockValue).toLocaleString()} <small>AC</small></div>
      <div class="pf-hero-sub">💰 現金 ${cash.toLocaleString()} AC ・ 📈 株式 ${stockValue.toLocaleString()} AC</div>
    </div>
    ${rows
      ? `<div class="section-lab">保有株</div><div class="pf-list">${rows}</div>`
      : `<div class="sel-sub" style="margin-top:24px;text-align:center;">保有している株はまだありません。<br>株価カードの「買付」からACで購入できます。</div>`}
    <div class="trade-note" style="text-align:center;margin-top:18px;">※ゲーム内通貨ACを使ったデモ取引のポートフォリオです。</div>
  `;
  app.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
  window.scrollTo(0,0);
}


// アイコン＋その下のテキストの1組。テキストは最大9文字までは静止表示、
// それを超える場合は電光掲示板風に右から左へ無限ループでスライドする。
// アイコン・テキストのどちらをタップしても指定画面へ遷移する。
// Microsoft認定試験カード・ホーム画面の統合起動カードの両方で共有する
// 最小単位のパーツ（launcherCardHTML／homeLauncherCardHTMLの両方から使う）
const LAUNCHER_LABEL_MAX_CHARS = 9;

function launcherItemHTML({ iconHTML, label, dataGo, ariaLabel }){
  const chars = [...label]; // サロゲートペアも1文字として正しく数える
  const needsMarquee = chars.length > LAUNCHER_LABEL_MAX_CHARS;
  const labelHTML = needsMarquee
    ? `<span class="ms-cert-marquee-track">
         <span class="ms-cert-marquee-item">${esc(label)}</span>
         <span class="ms-cert-marquee-item" aria-hidden="true">${esc(label)}</span>
       </span>`
    : `<span class="ms-cert-static">${esc(label)}</span>`;
  return `
    <div class="launcher-item">
      <button type="button" class="ms-logo-btn" data-go="${dataGo}" aria-label="${esc(ariaLabel)}" title="${esc(ariaLabel)}">
        ${iconHTML}
      </button>
      <button type="button" class="ms-cert-link" data-go="${dataGo}" title="${esc(label)}">
        <span class="ms-cert-textwrap">${labelHTML}</span>
      </button>
    </div>`;
}

// launcherItemHTML1組を、お天気・株価カードと同じ .news-card
// （白背景・角丸・薄いシャドウ）に内包した独立カードとして表示する。
// 現在はMicrosoft認定試験カードのみがこの単独カード形式を使う
function launcherCardHTML({ cardId, cardClass, iconHTML, label, dataGo, ariaLabel }){
  return `
    <div class="news-card ms-cert-card${cardClass ? " " + cardClass : ""}" id="${cardId}">
      ${launcherItemHTML({ iconHTML, label, dataGo, ariaLabel })}
    </div>`;
}

// Microsoftロゴ（4色の田の字）をイメージした丸型ボタン。タップで資格選択画面へ
function msCertLauncherHTML(){
  return launcherCardHTML({
    cardId: "ms-cert-card",
    iconHTML: `<span class="ms-logo-grid">
      <span class="ms-logo-sq r"></span>
      <span class="ms-logo-sq g"></span>
      <span class="ms-logo-sq b"></span>
      <span class="ms-logo-sq y"></span>
    </span>`,
    label: "Microsoft認定試験",
    dataGo: "certs",
    ariaLabel: "資格を選ぶ",
  });
}

// 「予定管理」「日本NEWS」「海外ニュース」「ポートフォリオ」の4項目を
// 1つの横長カードにまとめたもの。外枠はMicrosoft認定試験カードと同じ
// .ms-cert-card（背景・角丸・シャドウ・margin-top）を流用し、中身だけを
// launcherItemHTML4個の横並びに差し替えている。
// MARKET WATCH（株価ティッカー）は各ニュース画面側の最上部に移設済みのため
// ここには置かず、日本経済／世界経済への起動ボタンのみを配置する
const CALENDAR_LAUNCHER_ICON_SVG = `
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4.5" width="18" height="16" rx="2.5"></rect>
    <line x1="8" y1="2.5" x2="8" y2="6.5"></line>
    <line x1="16" y1="2.5" x2="16" y2="6.5"></line>
    <line x1="3" y1="10" x2="21" y2="10"></line>
  </svg>`;
const PORTFOLIO_LAUNCHER_ICON_SVG = `
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 19V7a2 2 0 0 1 2-2h9l5 5v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"></path>
    <path d="M15 5v5h5"></path>
    <line x1="8" y1="13" x2="16" y2="13"></line>
    <line x1="8" y1="17" x2="13" y2="17"></line>
  </svg>`;
// Googleカレンダーのアプリアイコンを思わせる「今日の日付を表示する
// カレンダー」デザイン（青いヘッダーバー＋今日の日付の数字）。予定管理
// アイコン（線画のみ）とは見た目を分け、単独の「カレンダー」画面への
// 入口だと一目でわかるようにする
const CALENDAR_APP_LAUNCHER_ICON_SVG = `
  <svg viewBox="0 0 24 24" width="19" height="19">
    <rect x="2.5" y="4" width="19" height="17" rx="3" fill="#ffffff" stroke="var(--line)" stroke-width="1.2"></rect>
    <path d="M2.5 7a3 3 0 0 1 3-3h13a3 3 0 0 1 3 3v2H2.5V7z" fill="#4285f4"></path>
    <line x1="7.5" y1="2" x2="7.5" y2="6.5" stroke="#1a56c4" stroke-width="1.7" stroke-linecap="round"></line>
    <line x1="16.5" y1="2" x2="16.5" y2="6.5" stroke="#1a56c4" stroke-width="1.7" stroke-linecap="round"></line>
    <text x="12" y="18" text-anchor="middle" font-size="9" font-weight="700" fill="#3c4043" font-family="Arial, sans-serif">${new Date().getDate()}</text>
  </svg>`;

function homeLauncherCardHTML(){
  const items = [
    { iconHTML: CALENDAR_LAUNCHER_ICON_SVG, label: "予定管理", dataGo: "schedule", ariaLabel: "予定管理" },
    { iconHTML: `<span class="launcher-emoji" aria-hidden="true">🇯🇵</span>`, label: "日本NEWS", dataGo: "news-japan", ariaLabel: "日本NEWS" },
    { iconHTML: `<span class="launcher-emoji" aria-hidden="true">🌐</span>`, label: "海外ニュース", dataGo: "news-world", ariaLabel: "海外ニュース" },
    { iconHTML: PORTFOLIO_LAUNCHER_ICON_SVG, label: "ポートフォリオ", dataGo: "portfolio", ariaLabel: "ポートフォリオ" },
    { iconHTML: CALENDAR_APP_LAUNCHER_ICON_SVG, label: "カレンダー", dataGo: "calendar", ariaLabel: "カレンダー" },
  ];
  return `
    <div class="news-card ms-cert-card home-launcher-card" id="home-launcher-card">
      <div class="home-launcher-row">
        ${items.map(it => launcherItemHTML(it)).join("")}
      </div>
    </div>`;
}

/* お天気カードと統合起動カードの間に置く、1ヶ月表示のカレンダーカード。
   タイトル文言は持たず、カレンダーUIそのものだけを表示する。
   ・上段：表示するカレンダー（自分／共有相手のカレンダーなど）をワンタップ
     で切り替えるスイッチャー。各カレンダーの横に共有ユーザー設定ボタンを
     配置し、＋ボタンでカレンダーを追加できる
   ・下段：月表示グリッド。日付セルをタップすると、その日の予定を確認・
     追加・削除できるポップアップを開く
   データはこの端末のlocalStorageに保存する簡易実装（他ユーザーへの実際の
   共有・同期は行わない） */
const GCAL_STORE_KEY = "gcal_store_v1";
const GCAL_COLORS = ["#0284c7","#16a34a","#d97706","#dc2626","#7c3aed","#0d9488","#db2777","#65a30d"];

// カレンダー機能が使うlocalStorageキーは、すべて「現在アプリにログイン
// しているユーザー」ごとに独立させる。ベースキーにログイン中のFirebase
// UID（未ログイン＝ゲスト利用中は"guest"固定）を連結することで、同じ
// 端末・同じブラウザを複数人が使い回しても、他人が連携したGoogleカレン
// ダーのトークンやデモ用データが絶対に見えないようにする
function gcalStorageKey(base){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `${base}::${uid}`;
}

// ログイン中のユーザーが切り替わった（ログイン／ログアウト／別アカウント
// への切替）ことを検知し、前のユーザーのGoogle連携状態（アクセストークン・
// カレンダー一覧・イベントキャッシュ）をメモリ上から完全に破棄する。
// render()の先頭から毎回呼ばれる軽量なチェックで、localStorageのキー
// 空間の切替と、メモリ上キャッシュの破棄を必ずセットで行う
let gcalIdentityToken;
function gcalHandleIdentityChange(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  if(gcalIdentityToken === uid) return;
  const isFirstRun = gcalIdentityToken === undefined;
  gcalIdentityToken = uid;
  if(isFirstRun) return; // 初回描画は「切替」ではないので何もしない
  gcalGoogleAccessToken = null;
  gcalGoogleCalendars = null;
  gcalGoogleEventsCache = {};
  gcalGoogleDayEventsCache = {};
  gcalGoogleError = null;
  gcalGoogleConnecting = false;
  gcalGoogleAutoTried = false;
}

// カレンダー機能のうち「デモカレンダーの予定」「ToDo」「登録者名」の3つを
// Firestoreの users/{uid}.gcal へ同期し、別端末でも引き継げるようにする。
// GoogleのOAuthアクセストークンと選択中カレンダーIDは、各端末でのGoogle
// 連携そのものに紐づく情報のため、あえて同期対象に含めずローカル限定
// のままにする（同期しても他端末では改めて連携が必要になり、トークンの
// ようなセンシティブな情報をクラウドへ置くリスクだけが増えるため）
function syncGcalToCloud(){
  if(!state.db || !state.currentUserId || !window.FirebaseSync) return;
  try{
    window.FirebaseSync.setDoc(window.FirebaseSync.doc(state.db, "users", state.currentUserId), {
      gcal: {
        store: loadGcalStore(),
        todos: loadGcalTodoStore(),
        authorName: gcalLoadAuthorName(),
        calNameOverrides: gcalLoadCalNameOverrides()
      },
      updatedAt: new Date().toISOString()
    }, { merge: true });
  }catch(e){ console.error("gcal cloud sync failed:", e); }
}

// クラウド（Firestoreの users/{uid}.gcal）から届いたデータをこの端末の
// localStorageへ反映する。db.jsのonSnapshotから呼ばれる。ここではsave〇〇()
// ではなく直接localStorageへ書き込む（save〇〇()はsyncGcalToCloud()を
// 呼び出すため、そちらを使うと反映のたびにクラウドへ書き戻してしまい、
// onSnapshotとの間で無限ループになってしまう）
export function applyCloudGcal(gcal){
  if(!gcal || typeof gcal !== "object") return;
  let changed = false;
  if(gcal.store && typeof gcal.store === "object" && !Array.isArray(gcal.store) && Array.isArray(gcal.store.calendars) && gcal.store.calendars.length){
    try{ localStorage.setItem(gcalStorageKey(GCAL_STORE_KEY), JSON.stringify(gcal.store)); changed = true; }catch(e){}
  }
  if(gcal.todos && typeof gcal.todos === "object" && !Array.isArray(gcal.todos)){
    try{ localStorage.setItem(gcalStorageKey(GCAL_TODO_STORE_KEY), JSON.stringify(gcal.todos)); changed = true; }catch(e){}
  }
  if(typeof gcal.authorName === "string" && gcal.authorName.trim()){
    try{ localStorage.setItem(gcalStorageKey(GCAL_AUTHOR_NAME_KEY), gcal.authorName.trim()); changed = true; }catch(e){}
  }
  if(gcal.calNameOverrides && typeof gcal.calNameOverrides === "object" && !Array.isArray(gcal.calNameOverrides)){
    try{
      localStorage.setItem(gcalStorageKey(GCAL_CAL_NAME_OVERRIDE_KEY), JSON.stringify(gcal.calNameOverrides));
      changed = true;
      // 取得済みのGoogleカレンダー一覧が既にメモリ上にあるなら、再取得を
      // 待たずに表示名だけその場で反映する
      if(gcalGoogleCalendars) gcalGoogleCalendars.forEach(c => { if(gcal.calNameOverrides[c.id]){ c.name = gcal.calNameOverrides[c.id]; c.renamed = true; } });
    }catch(e){}
  }
  if(changed) renderGcalActiveView();
}

export function loadGcalStore(){
  let store = null;
  try{ store = JSON.parse(localStorage.getItem(gcalStorageKey(GCAL_STORE_KEY)) || "null"); }catch(e){}
  if(!store || !Array.isArray(store.calendars) || !store.calendars.length){
    store = {
      calendars: [{ id: "self", name: "自分のカレンダー", color: GCAL_COLORS[0], shared: [] }],
      activeId: "self",
      events: {},
    };
  }
  if(!store.events) store.events = {};
  store.calendars.forEach(c => { if(!Array.isArray(c.shared)) c.shared = []; });
  if(!store.activeId || !store.calendars.some(c => c.id === store.activeId)){
    store.activeId = store.calendars[0].id;
  }
  return store;
}

function saveGcalStore(store){
  try{ localStorage.setItem(gcalStorageKey(GCAL_STORE_KEY), JSON.stringify(store)); }catch(e){}
  syncGcalToCloud();
}

function gcalGenId(prefix){
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// 表示中の年月。renderSelect()によるホーム画面全体の再描画をまたいでも
// 見ていた月を保持するため、モジュール変数として保持する（初回のみ今月）
let gcalViewY = null, gcalViewM = null;

// 「カレンダー」画面の月グリッドでタップして選んでいる日（グリッド真下の
// 予定一覧エリアに表示する対象日）。初回は今日を初期値にする
let gcalSelectedDay = null;
let gcalSelDayBusy = false;
let gcalSelDayError = null;

/* ---- 予定の「登録者名」（このカレンダー機能専用のプロフィール名） ----
   アプリのログインアカウントのユーザー名（getProfileName()）とは完全に
   別物として、カレンダー機能に初めて触れた時に一度だけ設定してもらい、
   以後は予定の登録者表示に使う。localStorageで独立管理する */
const GCAL_AUTHOR_NAME_KEY = "gcal_author_name";

export function gcalLoadAuthorName(){
  try{ return (localStorage.getItem(gcalStorageKey(GCAL_AUTHOR_NAME_KEY)) || "").trim(); }catch(e){ return ""; }
}

function gcalSaveAuthorName(name){
  try{ localStorage.setItem(gcalStorageKey(GCAL_AUTHOR_NAME_KEY), (name||"").trim()); }catch(e){}
  syncGcalToCloud();
  gcalPublishOwnName();
}

// 「今アプリを使っている本人」が登録した表示名（カレンダー専用の登録者名、
// 無ければアプリのユーザー名）を、Google連携メールアドレスをキーにした公開
// ディレクトリへ発行する。共有カレンダーの相手側が、自分の予定一覧の見出し
// にGmailアドレスではなくこの登録名を表示できるようにするため。Google連携
// 済みで名前が決まっているときだけ発行し、ローカル（デモ）モードや連携前は
// 発行しようがないため何もしない
function gcalPublishOwnName(){
  const email = gcalOwnGoogleEmail();
  const name = gcalLoadAuthorName() || getProfileName();
  if(email && name && window.GcalNames) window.GcalNames.publish(email, name).catch(() => {});
}

// 登録者名が未設定なら設定用モーダルを開いてから、設定済みならすぐに
// callback(name)を呼ぶ。予定を追加・閲覧する画面を開く直前に必ず通す
// ことで「カレンダーに最初に触れた時に名前を決める」動線にしている
function gcalEnsureAuthorName(cb){
  const name = gcalLoadAuthorName();
  if(name){ cb(name); return; }
  openGcalAuthorNameModal(cb);
}

function openGcalAuthorNameModal(onSaved, opts){
  const ov = document.createElement("div");
  ov.className = "modal-ov";
  const current = gcalLoadAuthorName();
  // 未保存（初回）の場合は「アプリに登録したユーザー名」をそのままの
  // デフォルト値として入力欄に表示する（見出しタップでの編集時も同様）
  const prefill = current || getProfileName() || "";
  const allowCancel = opts && typeof opts.allowCancel === "boolean" ? opts.allowCancel : !!current;
  ov.innerHTML = `
    <div class="modal">
      <div class="modal-title" style="color:var(--text)">✏️ カレンダーで使う名前</div>
      <div class="gcal-modal-sub">予定の登録者として表示される名前です。アプリのログイン名とは別に、カレンダー専用の名前として保存されます。</div>
      <input type="text" class="gcal-ev-input gcal-newcal-input" id="gcal-author-input" placeholder="例：山田太郎" maxlength="20" value="${esc(prefill)}">
      <button class="cta" id="gcal-author-save">保存する</button>
      ${allowCancel ? `<button class="ghost" id="gcal-author-cancel" style="margin-top:8px">キャンセル</button>` : ""}
    </div>`;
  document.body.appendChild(ov);
  const close = () => { try{ ov.remove(); }catch(e){} };
  if(allowCancel) ov.addEventListener("click", (e) => { if(e.target === ov) close(); });
  const cancelBtn = ov.querySelector("#gcal-author-cancel");
  if(cancelBtn) cancelBtn.onclick = close;
  const input = ov.querySelector("#gcal-author-input");
  const submit = () => {
    const name = (input.value||"").trim();
    if(!name){ input.focus(); return; }
    gcalSaveAuthorName(name);
    close();
    if(onSaved) onSaved(name);
  };
  ov.querySelector("#gcal-author-save").onclick = submit;
  input.onkeydown = (e) => { if(e.key === "Enter") submit(); };
  input.focus();
}

/* ---- Googleカレンダーの表示名の上書き ----
   Google側のカレンダー名（プライマリカレンダーならGmailアドレスがそのまま
   表示される）を、この端末（ログイン中ユーザー）専用の好きな表示名に
   置き換えるための上書き設定。Google側の実際のカレンダー名は変更しない、
   あくまでこのアプリ内の表示だけを差し替える簡易実装 */
const GCAL_CAL_NAME_OVERRIDE_KEY = "gcal_cal_name_override_v1"; // { [calId]: customName }

export function gcalLoadCalNameOverrides(){
  try{
    const data = JSON.parse(localStorage.getItem(gcalStorageKey(GCAL_CAL_NAME_OVERRIDE_KEY)) || "{}");
    return (data && typeof data === "object" && !Array.isArray(data)) ? data : {};
  }catch(e){ return {}; }
}

function gcalSaveCalNameOverride(calId, name){
  const overrides = gcalLoadCalNameOverrides();
  const trimmed = (name||"").trim();
  if(trimmed) overrides[calId] = trimmed; else delete overrides[calId];
  try{ localStorage.setItem(gcalStorageKey(GCAL_CAL_NAME_OVERRIDE_KEY), JSON.stringify(overrides)); }catch(e){}
  syncGcalToCloud();
}

/* ---- 本日のタスク（ToDo）。Googleカレンダー連携の有無に関わらず、常に
   この端末のlocalStorageで日付ごとに独立管理する簡易ToDoリスト ---- */
const GCAL_TODO_STORE_KEY = "gcal_todo_store_v1"; // { dateKey: [{id,text,done}] }

export function loadGcalTodoStore(){
  try{ return JSON.parse(localStorage.getItem(gcalStorageKey(GCAL_TODO_STORE_KEY)) || "{}"); }catch(e){ return {}; }
}

function saveGcalTodoStore(store){
  try{ localStorage.setItem(gcalStorageKey(GCAL_TODO_STORE_KEY), JSON.stringify(store)); }catch(e){}
  syncGcalToCloud();
}

// ホーム画面：本日（表示中の1日）だけのコンパクトな確認用ウィジェット
function gcalDayWidgetHTML(){
  return `<div class="gcal-card" id="gcal-day-card"></div>`;
}

// 「カレンダー」画面：連携設定・カレンダー切替・1ヶ月フル表示をまとめて行う
function gcalMonthCardHTML(){
  return `<div class="gcal-card" id="gcal-month-card"></div>`;
}

// Google連携済み・未連携どちらの状態変化でも、現在画面に出ている方（日
// ウィジェット／月カード）だけを再描画する共通ディスパッチャ。ホーム画面
// とカレンダー画面のどちらから呼ばれたかをGoogle連携系の関数側が意識
// しなくて済むようにするための薄いラッパー
function renderGcalActiveView(){
  if(document.getElementById("gcal-day-card")) renderGcalDailyWidget();
  if(document.getElementById("gcal-month-card")) renderGcalMonthCard();
}

/* ================= Google カレンダー本体との連携 =================
   Googleの「認可コードフロー」（Authorization Code Flow）でrefresh_token
   を取得し、Firestore（google_tokensコレクション、Firebase UIDをドキュ
   メントIDとする）にサーバー側（Vercel Serverless Functions + Firebase
   Admin SDK）だけが読み書きできる形で保存する。ブラウザ側はrefresh_token
   に一切触れず、Firebase Authのログイン状態（IDトークン）を鍵にして
   /api/google/* エンドポイントへ問い合わせるだけで完結させる：
   　1) 連携時（gcalConnectGoogle）: /api/google/authorize がGoogleの同意
   　   画面URLを発行 → ブラウザがそこへ遷移 → 同意後 /api/google/callback
   　   が受け取ったcodeをrefresh_tokenと交換し、Firestoreに保存してアプリ
   　   へ戻す
   　2) 通常利用時（gcalBackendTokenRefresh）: /api/google/token にFirebase
   　   のIDトークンを送るだけで、保存済みrefresh_tokenから新しいアクセス
   　   トークン（有効期限1時間）を発行してもらえる。API呼び出し直前
   　   （gcalEnsureFreshGoogleToken）と、開いている間の1分おきのバック
   　   グラウンドタイマー（gcalStartGoogleAutoRefreshTimer）の両方から
   　   使うことで、一度連携すればブラウザ・端末を変えてもGoogleの同意
   　   画面を再度出さずに使い続けられる
   　3) 連携解除（gcalDisconnectGoogle）: /api/google/disconnect がGoogle
   　   側のトークンを失効させ、Firestoreの保存分も削除する
   取得したアクセストークン自体はこれまで通りCalendar REST APIへブラウザ
   から直接fetchする（Calendar APIはCORSに対応しているため）。ゲスト利用
   （Firebaseログインなし）では紐づけるUIDが無いため、Google連携は
   ログイン中のみ利用可能とする。未連携時は既存のローカル保存
   （localStorage）のデモ用カレンダーにフォールバックする */
const GCAL_GOOGLE_TOKEN_KEY = "gcal_google_token_v1";
const GCAL_GOOGLE_ACTIVE_KEY = "gcal_google_active_id";
// アクセストークンの有効期限のこのぶん手前から「期限切れ間近」とみなし、
// 使う前にバックエンド経由のリフレッシュへ回す（期限ぎりぎりでAPIが401を返すのを防ぐ）
const GCAL_GOOGLE_EXPIRY_BUFFER_MS = 5 * 60 * 1000;
// バックグラウンドで有効期限をチェックする間隔（この間隔ごとに、期限切れ
// 間近なら気付かれないうちに自動リフレッシュする）
const GCAL_GOOGLE_REFRESH_CHECK_INTERVAL_MS = 60 * 1000;

let gcalGoogleAccessToken = null;
let gcalGoogleConnecting = false;
let gcalGoogleAutoTried = false;
let gcalGoogleError = null;
let gcalGoogleCalendars = null;       // [{id,name,color,primary}] / 未取得ならnull
let gcalGoogleEventsCache = {};       // "<calId>|<y>-<m>" -> { dateKey: [{id,title,start,end,author}] }（カレンダー画面の月表示用）
let gcalGoogleDayEventsCache = {};    // "<calId>|day|<dateKey>" -> { dateKey: [{id,title,start,end,author}] }（ホームの日表示用）
let gcalGoogleSilentRefreshPromise = null; // バックエンド経由リフレッシュの多重実行を防ぐための進行中Promise
let gcalGoogleAutoRefreshTimerStarted = false;

// 「変更を反映」ボタン（手動リロード）の進行中フラグ。trueの間はボタンを
// 無効化しつつ回転アイコンでローディング状態を示す。ホーム画面の日
// ウィジェットとカレンダー画面の月カードはそれぞれ別画面なので別々に持つ
let gcalDayReloading = false;
let gcalMonthReloading = false;

// Googleの同意画面から /api/google/callback を経て戻ってきた直後の後処理。
// URLの ?gcal=connected|error を読み取ってすぐにURLから消し（リロード時の
// 誤動作・履歴汚染を防ぐ）、失敗時のみメッセージを用意する。成功時は何も
// しなくてよく、この直後に呼ばれる gcalMaybeAutoReconnect() がバックエンド
// 経由で新しいアクセストークンを自動的に取得しにいく
(function gcalConsumeOAuthRedirectParam(){
  try{
    const url = new URL(window.location.href);
    if(!url.searchParams.has("gcal")) return;
    const status = url.searchParams.get("gcal");
    url.searchParams.delete("gcal");
    const qs = url.searchParams.toString();
    history.replaceState(null, "", url.pathname + (qs ? `?${qs}` : "") + url.hash);
    if(status === "error") gcalGoogleError = "Google連携に失敗しました。もう一度お試しください。";
  }catch(e){}
})();

/* ---- アクセストークンの一時キャッシュ ----
   refresh_tokenはサーバー側にしかないが、発行済みのアクセストークン
   （最長1時間）自体は通信を減らすためlocalStorageへ短期キャッシュする。
   期限切れ・未キャッシュのときだけ /api/google/token を叩く */
function gcalSaveGoogleToken(accessToken, expiresInSec){
  const expiresAt = Date.now() + (Number(expiresInSec || 0) * 1000);
  try{ localStorage.setItem(gcalStorageKey(GCAL_GOOGLE_TOKEN_KEY), JSON.stringify({ access_token: accessToken, expires_at: expiresAt })); }catch(e){}
}

function gcalLoadGoogleToken(){
  try{
    const data = JSON.parse(localStorage.getItem(gcalStorageKey(GCAL_GOOGLE_TOKEN_KEY)) || "null");
    if(!data || !data.access_token || !data.expires_at) return null;
    return data;
  }catch(e){ return null; }
}

function gcalClearGoogleToken(){
  try{ localStorage.removeItem(gcalStorageKey(GCAL_GOOGLE_TOKEN_KEY)); }catch(e){}
}

// ページ読み込み時に一度だけ実行する自動ログイン復元。ホーム画面の週
// ウィジェット／カレンダー画面の月カード、どちらが先にマウントされても
// 一度しか実行されないよう gcalGoogleAutoTried で guard する
function gcalMaybeAutoReconnect(){
  gcalStartGoogleAutoRefreshTimer();
  if(gcalGoogleAccessToken || gcalGoogleConnecting || gcalGoogleAutoTried) return;
  // Firebaseのログイン状態（state.currentUser）はonAuthStateChangedの解決を
  // 待つ非同期処理のため、まだ確定していない間はここで確定を待つ（一度きり
  // のgcalGoogleAutoTriedを消費しない）。authReadyが立った直後にdb.js側の
  // onAuthStateChangedがrender()を呼び直すため、この関数も再度呼ばれる
  if(!state.authReady) return;
  gcalGoogleAutoTried = true;
  if(state.guestMode || !state.currentUser) return; // ゲスト利用中はGoogle連携なし
  const token = gcalLoadGoogleToken();
  if(token && token.expires_at - Date.now() > GCAL_GOOGLE_EXPIRY_BUFFER_MS){
    // まだ有効期限内：通信なしで即座にログイン状態を復元する。
    // カレンダー一覧の取得は、この直後に呼び出し元（週ウィジェット／月
    // カード）がgcalGoogleCalendars===nullを検知して自動的に行う
    gcalGoogleAccessToken = token.access_token;
    return;
  }
  // キャッシュが無い・期限切れ：バックエンド経由でrefresh_tokenからアクセス
  // トークンを取り直す（このアカウントで一度もGoogle連携していなければ
  // 404が返るだけで、静かに何もしない）
  gcalBackendTokenRefresh();
}

// カレンダー画面／ホームウィジェットが開いている間、有効期限が切れる前に
// バックグラウンドで自動的にアクセストークンをリフレッシュし続けるための
// タイマー。ページ内で一度だけ起動する
function gcalStartGoogleAutoRefreshTimer(){
  if(gcalGoogleAutoRefreshTimerStarted) return;
  gcalGoogleAutoRefreshTimerStarted = true;
  setInterval(() => {
    if(!gcalGoogleAccessToken) return;
    const token = gcalLoadGoogleToken();
    if(!token) return;
    if(token.expires_at - Date.now() <= GCAL_GOOGLE_EXPIRY_BUFFER_MS){
      gcalBackendTokenRefresh();
    }
  }, GCAL_GOOGLE_REFRESH_CHECK_INTERVAL_MS);
}

// /api/google/token にFirebaseのIDトークンを送り、保存済みrefresh_token
// から新しいアクセストークンを発行してもらう。同時に複数箇所（起動時の
// 自動復元、定期タイマー、401からの自動復旧、API呼び出し直前のチェック）
// から呼ばれ得るため、進行中のリフレッシュがあればそれを使い回して多重
// リクエストを防ぐ
function gcalBackendTokenRefresh(){
  if(gcalGoogleSilentRefreshPromise) return gcalGoogleSilentRefreshPromise;
  gcalGoogleSilentRefreshPromise = (async () => {
    if(state.guestMode || !state.currentUser) return false;
    try{
      const idToken = await state.currentUser.getIdToken();
      const res = await fetch("/api/google/token", { headers: { Authorization: `Bearer ${idToken}` } });
      if(res.status === 404) return false; // このアカウントではまだ連携していない
      if(res.status === 401){
        // 保存済みのrefresh_token自体が失効・取り消し済み → 再連携が必要
        gcalGoogleAccessToken = null;
        gcalClearGoogleToken();
        gcalGoogleError = "Google連携の有効期限が切れました。もう一度連携してください。";
        renderGcalActiveView();
        return false;
      }
      if(!res.ok) throw new Error(`gcal-token-http-${res.status}`);
      const data = await res.json();
      gcalGoogleAccessToken = data.access_token;
      gcalGoogleError = null;
      gcalSaveGoogleToken(data.access_token, data.expires_in);
      if(gcalGoogleCalendars){
        // 既にカレンダー一覧を表示中：アクセストークンだけを気付かれない
        // ように差し替える
        renderGcalActiveView();
      } else {
        gcalRefreshGoogleCalendars();
      }
      return true;
    }catch(e){
      if(!gcalGoogleError) gcalGoogleError = "Googleとの接続確認に失敗しました。時間をおいて再度お試しください。";
      renderGcalActiveView();
      return false;
    }
  })();
  gcalGoogleSilentRefreshPromise = gcalGoogleSilentRefreshPromise.finally(() => { gcalGoogleSilentRefreshPromise = null; });
  return gcalGoogleSilentRefreshPromise;
}

// ユーザー操作で明示的に連携する（「連携」ボタン）唯一の入口。
// /api/google/authorize からGoogleの同意画面URLを受け取り、そこへ遷移する
// （同意後は/api/google/callbackがcodeをrefresh_tokenと交換してアプリへ
// リダイレクトで戻す）
async function gcalConnectGoogle(){
  if(state.guestMode || !state.currentUser){
    gcalGoogleError = "Google連携を使うにはログインしてください（ゲスト利用では連携できません）。";
    renderGcalActiveView();
    return;
  }
  gcalGoogleConnecting = true;
  gcalGoogleError = null;
  renderGcalActiveView();
  try{
    const idToken = await state.currentUser.getIdToken();
    const res = await fetch("/api/google/authorize", { headers: { Authorization: `Bearer ${idToken}` } });
    if(!res.ok) throw new Error(`gcal-authorize-http-${res.status}`);
    const data = await res.json();
    if(!data.authUrl) throw new Error("gcal-no-auth-url");
    window.location.href = data.authUrl; // ここでページ遷移するため、この関数は実質ここで終了する
  }catch(e){
    gcalGoogleConnecting = false;
    gcalGoogleError = "Google連携の開始に失敗しました。時間をおいて再度お試しください。";
    renderGcalActiveView();
  }
}

// 連携解除：ローカルの状態は即座に消し、バックエンドへは念のため通知する
// （失敗してもローカルの解除自体は既に完了しているため致命的ではない）
async function gcalDisconnectGoogle(){
  gcalGoogleAccessToken = null;
  gcalGoogleCalendars = null;
  gcalGoogleEventsCache = {};
  gcalGoogleDayEventsCache = {};
  gcalGoogleError = null;
  gcalClearGoogleToken();
  try{ localStorage.removeItem(gcalStorageKey(GCAL_GOOGLE_ACTIVE_KEY)); }catch(e){}
  renderGcalActiveView();
  if(!state.currentUser) return;
  try{
    const idToken = await state.currentUser.getIdToken();
    await fetch("/api/google/disconnect", { method: "POST", headers: { Authorization: `Bearer ${idToken}` } });
  }catch(e){}
}

// 401（認証切れ）を検知したときの共通処理：保存済みトークンを破棄した上で、
// バックエンド経由の自動リフレッシュをバックグラウンドで試みる。それでも
// 復帰できない場合にだけ「連携」ボタンでの再認証が必要になる（ユーザーには
// 一旦エラーメッセージを表示しつつ、裏では自動復旧を試みる「スマートな
// 再認証」の形）
function gcalHandleUnauthorized(){
  gcalGoogleAccessToken = null;
  gcalClearGoogleToken();
  gcalGoogleError = "Googleとの接続が切れました。自動で再接続を試みています…";
  renderGcalActiveView();
  gcalBackendTokenRefresh();
}

// カレンダーAPIを叩く直前に必ず有効期限をチェックし、切れている／切れ
// かけている場合はここで一旦バックグラウンドリフレッシュを待ち合わせて
// から実際のリクエストを送る（期限ぎりぎりで401を受けてから復旧する
// 「事後対応」ではなく、そもそも401を発生させない「予防」を優先する）
async function gcalEnsureFreshGoogleToken(){
  if(!gcalGoogleAccessToken) return;
  const token = gcalLoadGoogleToken();
  if(token && token.expires_at - Date.now() > GCAL_GOOGLE_EXPIRY_BUFFER_MS) return;
  await gcalBackendTokenRefresh();
}

async function gcalGoogleApiFetch(path, options){
  await gcalEnsureFreshGoogleToken();
  const res = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, Object.assign({}, options, {
    headers: Object.assign({ "Authorization": `Bearer ${gcalGoogleAccessToken}` }, (options && options.headers) || {}),
  }));
  if(res.status === 401){
    gcalHandleUnauthorized();
    throw new Error("gcal-unauthorized");
  }
  if(!res.ok) throw new Error(`gcal-api-error-${res.status}`);
  if(res.status === 204) return null;
  return res.json();
}

// Googleカレンダーの「日本の祝日」購読カレンダー（ja.japanese#holiday@…）を
// 判定する。このカレンダーはタブ／予定一覧には出さず、祝日判定は
// gcalComputeJapanHolidays()側の計算結果を使う（Google側の購読解除有無に
// 左右されず、ローカル（未連携）モードでも同じ祝日色を出せるようにするため）
function gcalIsJapanHolidayCalendar(c){
  const id = c.id || "";
  const name = c.summaryOverride || c.summary || "";
  return id.endsWith("#holiday@group.v.calendar.google.com") && (id.startsWith("ja.") || name.includes("祝日"));
}

async function gcalRefreshGoogleCalendars(){
  try{
    // minAccessRole="reader"：閲覧のみ許可された共有カレンダー（他アカウントから
    // 共有してもらったサブカレンダーなど）も一覧に含める。以前は"writer"指定で
    // 書き込み権限があるものだけに絞っていたため、閲覧権限のみで共有されたカレン
    // ダーが一覧にすら出ず、予定も取得できていなかった。freeBusyReader（予定の
    // 有無しか分からない権限）はタイトル等を取得できないためこれまで通り除外する
    const data = await gcalGoogleApiFetch("users/me/calendarList?minAccessRole=reader");
    const nameOverrides = gcalLoadCalNameOverrides();
    gcalGoogleCalendars = (data.items || []).filter(c => !gcalIsJapanHolidayCalendar(c)).map((c, i) => ({
      id: c.id,
      name: nameOverrides[c.id] || c.summaryOverride || c.summary || c.id,
      color: c.backgroundColor || GCAL_COLORS[i % GCAL_COLORS.length],
      primary: !!c.primary,
      accessRole: c.accessRole || "reader",
      renamed: !!nameOverrides[c.id],
    }));
    let activeId = null;
    try{ activeId = localStorage.getItem(gcalStorageKey(GCAL_GOOGLE_ACTIVE_KEY)); }catch(e){}
    if(!activeId || !gcalGoogleCalendars.some(c => c.id === activeId)){
      const primary = gcalGoogleCalendars.find(c => c.primary);
      activeId = (primary || gcalGoogleCalendars[0] || {}).id || null;
    }
    if(activeId){ try{ localStorage.setItem(gcalStorageKey(GCAL_GOOGLE_ACTIVE_KEY), activeId); }catch(e){} }
    // カレンダー連携が確認できたタイミングで、既存ユーザーが名前を編集して
    // いなくても自分の登録名を公開ディレクトリへ発行しておく（相手側が
    // 開くたびに毎回発行されるだけで、内容が同じなら実質的に無害な上書き）
    gcalPublishOwnName();
  }catch(e){
    if(!gcalGoogleError) gcalGoogleError = "カレンダー一覧の取得に失敗しました。";
    gcalGoogleCalendars = [];
  }
  renderGcalActiveView();
}

// Google Calendarのイベントタイトルは"(登録者名) 本来のタイトル"という
// 形式で保存する（登録者名はこのアプリ独自の概念で、Calendar APIに専用
// フィールドが無いためタイトルへ埋め込む）。表示のたびにこの形式を
// 分解して登録者名とタイトルを取り出す
function gcalParseAuthorTitle(summary){
  const m = /^\(([^)]{1,20})\)\s*(.*)$/.exec(summary || "");
  if(m) return { author: m[1], title: m[2] || "(タイトルなし)" };
  return { author: "", title: summary || "(タイトルなし)" };
}

function gcalFormatHHMM(date){
  return `${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}`;
}

// Google Calendar APIのevents.listレスポンスを
// dateKey -> [{id,title,start,end,author,calId,calColor,calName,calPrimary}] の
// マップに変換する共通処理（月表示・日表示の両方から使う）。終日予定は
// start/endを空文字にする。calMetaには取得元カレンダー（{id,color,name,primary}）
// を渡し、複数カレンダーの予定をまとめて表示したときにどのカレンダーの予定かを
// 判別できるようにする
function gcalMapGoogleEventItems(items, calMeta){
  const map = {};
  (items || []).forEach(ev => {
    if(ev.status === "cancelled") return;
    const startInfo = ev.start || {};
    const endInfo = ev.end || {};
    const startStr = startInfo.dateTime || startInfo.date || null;
    if(!startStr) return;
    const startDate = new Date(startStr);
    const dk = newsDateKey(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const isTimed = !!startInfo.dateTime;
    const start = isTimed ? gcalFormatHHMM(startDate) : "";
    const end = (isTimed && endInfo.dateTime) ? gcalFormatHHMM(new Date(endInfo.dateTime)) : "";
    const { author, title } = gcalParseAuthorTitle(ev.summary);
    // 「ユーザーごとの分別表示」用：手動入力の登録者名(author)が無い予定でも、
    // Googleカレンダー本来の作成者情報（creator.email/displayName）があれば
    // それを使って作成者を判別できるようにする
    const creatorEmail = ev.creator ? ev.creator.email : undefined;
    const creatorName = ev.creator ? (ev.creator.displayName || ev.creator.email) : undefined;
    if(!map[dk]) map[dk] = [];
    map[dk].push({
      id: ev.id, iCalUID: ev.iCalUID, title, start, end, author, creatorEmail, creatorName,
      calId: calMeta ? calMeta.id : undefined,
      calColor: calMeta ? calMeta.color : undefined,
      calName: calMeta ? calMeta.name : undefined,
      calPrimary: calMeta ? !!calMeta.primary : undefined,
      calRenamed: calMeta ? !!calMeta.renamed : undefined,
    });
  });
  return map;
}

// 同じ予定が複数カレンダーから重複して届いた場合の判定キー。
// カレンダー共有と招待（ゲスト追加）を両方行うと、同一の予定が
// 共有カレンダー側と自分のプライマリカレンダー側の両方から取得され、
// 画面に2件ずつ表示されてしまう。iCalUIDは同一予定なら参加者全員の
// カレンダーで共通なので、これを優先キーにし、無ければidで、
// それも無ければタイトル・開始・終了時刻の組み合わせで判定する
function gcalEventDedupeKey(ev){
  if(ev.iCalUID) return `uid:${ev.iCalUID}`;
  if(ev.id) return `id:${ev.id}`;
  return `t:${ev.title}|${ev.start}|${ev.end}`;
}

function gcalMergeEventMaps(maps){
  const merged = {};
  maps.forEach(m => {
    Object.keys(m).forEach(dk => {
      if(!merged[dk]) merged[dk] = [];
      merged[dk].push(...m[dk]);
    });
  });
  Object.keys(merged).forEach(dk => {
    const seen = new Map();
    merged[dk].forEach(ev => {
      const key = gcalEventDedupeKey(ev);
      const existing = seen.get(key);
      // 同じ予定の重複コピーが複数あるときは、プライマリカレンダー側の
      // コピーを優先して残す（編集権限や表示上の整合性のため）
      if(!existing || (!existing.calPrimary && ev.calPrimary)) seen.set(key, ev);
    });
    merged[dk] = Array.from(seen.values());
  });
  return merged;
}

// 連携中の全カレンダーぶんをまとめて保持しているイベントmapから、指定
// カレンダーID（スイッチャーで選択中のカレンダー）の予定だけを取り出す。
// これによりカレンダーの切替（タブ）が「新しい予定の追加先」だけでなく
// 「グリッドの●印・下の予定一覧に表示する対象」も切り替える仕様になる
function gcalFilterMapByCal(map, calId){
  const out = {};
  Object.keys(map).forEach(dk => {
    const evs = map[dk].filter(ev => ev.calId === calId);
    if(evs.length) out[dk] = evs;
  });
  return out;
}

// 連携中の全カレンダー（自分のプライマリ＋他アカウントから共有された
// サブカレンダーすべて）を対象に events.list を並行実行し、1つの
// dateKey -> events[] マップへ統合する。1つのカレンダーの取得が失敗
// しても（例：共有が解除された等）残りのカレンダーの予定は表示できる
// よう、失敗はPromise.allSettledで個別に吸収する
async function gcalFetchAllCalendarsEventMap(params){
  const cals = gcalGoogleCalendars || [];
  const results = await Promise.allSettled(cals.map(async cal => {
    const data = await gcalGoogleApiFetch(`calendars/${encodeURIComponent(cal.id)}/events?${params.toString()}`);
    return gcalMapGoogleEventItems(data.items, cal);
  }));
  const maps = [];
  let hadError = false;
  results.forEach(r => { if(r.status === "fulfilled") maps.push(r.value); else hadError = true; });
  return { map: gcalMergeEventMaps(maps), hadError };
}

function gcalEventsCacheKey(y, m){ return `${y}-${m}`; }

// カレンダー画面（月表示）用：指定の年月ぶんのイベントを、連携中の
// 全カレンダー（共有カレンダーを含む）からまとめて取得する
async function gcalRefreshGoogleEvents(y, m){
  const key = gcalEventsCacheKey(y, m);
  try{
    const timeMin = new Date(y, m, 1).toISOString();
    const timeMax = new Date(y, m+1, 1).toISOString();
    const params = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", maxResults: "250", orderBy: "startTime" });
    const { map, hadError } = await gcalFetchAllCalendarsEventMap(params);
    gcalGoogleEventsCache[key] = map;
    if(hadError && !gcalGoogleError) gcalGoogleError = "一部のカレンダーの予定を取得できませんでした。";
  }catch(e){
    if(!gcalGoogleError) gcalGoogleError = "予定の取得に失敗しました。";
    gcalGoogleEventsCache[key] = {};
  }
  renderGcalMonthCard();
}

function gcalDayCacheKey(dateKey){ return dateKey; }

// ホーム画面（1日表示）用：指定の1日ぶんのイベントを、連携中の
// 全カレンダー（共有カレンダーを含む）からまとめて取得する
async function gcalRefreshGoogleDayEvents(y, m, d){
  const dateKey = newsDateKey(y, m, d);
  const cacheKey = gcalDayCacheKey(dateKey);
  try{
    const dayStart = new Date(y, m, d);
    const dayEnd = new Date(y, m, d + 1);
    const params = new URLSearchParams({ timeMin: dayStart.toISOString(), timeMax: dayEnd.toISOString(), singleEvents: "true", maxResults: "250", orderBy: "startTime" });
    const { map, hadError } = await gcalFetchAllCalendarsEventMap(params);
    gcalGoogleDayEventsCache[cacheKey] = map;
    if(hadError && !gcalGoogleError) gcalGoogleError = "一部のカレンダーの予定を取得できませんでした。";
  }catch(e){
    if(!gcalGoogleError) gcalGoogleError = "予定の取得に失敗しました。";
    gcalGoogleDayEventsCache[cacheKey] = {};
  }
  renderGcalDailyWidget();
}

// start/endは"HH:MM"（未入力なら終日予定として扱う）
async function gcalCreateGoogleEvent(calId, y, m, d, title, start, end){
  const pad = (n) => String(n).padStart(2, "0");
  const dateStr = `${y}-${pad(m+1)}-${pad(d)}`;
  const summary = title;
  let body;
  if(start){
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    body = {
      summary,
      start: { dateTime: `${dateStr}T${start}:00`, timeZone: tz },
      end: { dateTime: `${dateStr}T${end || start}:00`, timeZone: tz },
    };
  } else {
    const next = new Date(y, m, d+1);
    const nextStr = newsDateKey(next.getFullYear(), next.getMonth(), next.getDate());
    body = { summary, start: { date: dateStr }, end: { date: nextStr } };
  }
  await gcalGoogleApiFetch(`calendars/${encodeURIComponent(calId)}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function gcalDeleteGoogleEvent(calId, eventId){
  await gcalGoogleApiFetch(`calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
}

function gcalBindConnectBar(root){
  const connectBtn = root.querySelector("#gcal-google-connect");
  if(connectBtn) connectBtn.onclick = () => gcalConnectGoogle();
  const disconnectBtn = root.querySelector("#gcal-google-disconnect");
  if(disconnectBtn) disconnectBtn.onclick = () => gcalDisconnectGoogle();
}

function gcalConnectBarHTML(){
  if(gcalGoogleAccessToken){
    return `
      <div class="gcal-google-bar">
        <span class="gcal-google-badge">🔗 Googleカレンダーと連携中</span>
        <button type="button" class="gcal-google-disconnect" id="gcal-google-disconnect">連携解除</button>
      </div>`;
  }
  return `
    <div class="gcal-google-bar">
      <button type="button" class="gcal-google-connect" id="gcal-google-connect"${gcalGoogleConnecting?" disabled":""}>${gcalGoogleConnecting?"連携中…":"🔗 Googleカレンダーと連携"}</button>
    </div>`;
}

// 前月・翌月にはみ出す先頭・末尾のマスは完全な空白にせず、実際のGoogle
// カレンダーと同様に前後の月の日付を薄く添えることで、グリッドが1行分
// 欠けたような不自然な空白に見えないようにする（クリックはできない）
const JAPAN_HOLIDAY_CACHE = {};

function gcalPad2(n){ return String(n).padStart(2, "0"); }
function gcalYmd(y, m, d){ return `${y}-${gcalPad2(m+1)}-${gcalPad2(d)}`; }

// year年のmonth月（0始まり）における第n◯曜日（ここでは月曜固定）の日付を返す
function gcalNthMondayOfMonth(year, month, n){
  const first = new Date(year, month, 1);
  const firstMonday = 1 + ((8 - first.getDay()) % 7);
  return firstMonday + (n - 1) * 7;
}

// 春分の日・秋分の日は天文計算で年ごとに変わるため、1980〜2099年の範囲で
// 実用上ずれのない近似式（国立天文台の暦要項に基づく一般的な近似式）で算出する
function gcalEquinoxDay(year, isAutumn){
  const base = isAutumn
    ? 23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)
    : 20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4);
  return Math.floor(base);
}

// 日本の祝日一覧（"YYYY-MM-DD"のSet）をyear年ぶん計算する。祝日ボタンは
// 廃止しつつも「土曜は青・日曜と祝日は赤」の配色判定にはこの祝日データを
// 裏側で使う。固定日・ハッピーマンデー・春分秋分に加え、振替休日・
// 国民の休日（前後を祝日に挟まれた平日）も反映する。2020・2021年は東京
// オリンピック開催に伴う祝日移動（海の日・スポーツの日・山の日）を個別に反映する
function gcalComputeJapanHolidays(year){
  if(JAPAN_HOLIDAY_CACHE[year]) return JAPAN_HOLIDAY_CACHE[year];
  const base = new Map();
  const add = (m, d) => base.set(gcalYmd(year, m, d), true);

  add(0, 1); // 元日
  add(0, gcalNthMondayOfMonth(year, 0, 2)); // 成人の日
  add(1, 11); // 建国記念の日
  if(year >= 2020) add(1, 23); // 天皇誕生日
  add(2, gcalEquinoxDay(year, false)); // 春分の日
  add(3, 29); // 昭和の日
  add(4, 3); add(4, 4); add(4, 5); // 憲法記念日・みどりの日・こどもの日

  if(year === 2020){
    add(6, 23); add(6, 24); add(7, 10); // 海の日・スポーツの日・山の日（五輪特例）
  } else if(year === 2021){
    add(6, 22); add(6, 23); add(7, 8); // 海の日・スポーツの日・山の日（五輪特例）
  } else {
    add(6, gcalNthMondayOfMonth(year, 6, 3)); // 海の日
    add(9, gcalNthMondayOfMonth(year, 9, 2)); // スポーツの日
    if(year >= 2016) add(7, 11); // 山の日
  }

  add(8, gcalNthMondayOfMonth(year, 8, 3)); // 敬老の日
  add(8, gcalEquinoxDay(year, true)); // 秋分の日
  add(10, 3); // 文化の日
  add(10, 23); // 勤労感謝の日

  const has = (y2, m2, d2) => base.has(gcalYmd(y2, m2, d2));

  // 国民の休日：前後を祝日に挟まれた平日（日曜を除く）は休日になる
  const bridged = new Map(base);
  for(let m=0; m<12; m++){
    const days = new Date(year, m+1, 0).getDate();
    for(let d=1; d<=days; d++){
      const key = gcalYmd(year, m, d);
      if(base.has(key)) continue;
      if(new Date(year, m, d).getDay() === 0) continue;
      const prev = new Date(year, m, d - 1);
      const next = new Date(year, m, d + 1);
      if(has(prev.getFullYear(), prev.getMonth(), prev.getDate()) && has(next.getFullYear(), next.getMonth(), next.getDate())){
        bridged.set(key, true);
      }
    }
  }

  // 振替休日：祝日が日曜日の場合、その直後の「祝日でない最初の日」を休日にする
  const result = new Map(bridged);
  bridged.forEach((_, key) => {
    const [yy, mm, dd] = key.split("-").map(Number);
    if(new Date(yy, mm-1, dd).getDay() !== 0) return;
    let cursor = new Date(yy, mm-1, dd+1);
    while(result.has(gcalYmd(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()))){
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()+1);
    }
    result.set(gcalYmd(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()), true);
  });

  const set = new Set(result.keys());
  JAPAN_HOLIDAY_CACHE[year] = set;
  return set;
}

function gcalDayCellsHTML(y, m, evMap, todayKey, color, selectedDay){
  const first = new Date(y, m, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const prevDaysInMonth = new Date(y, m, 0).getDate();
  const holidays = gcalComputeJapanHolidays(y);
  const cells = [];
  for(let i=startWeekday-1; i>=0; i--){
    cells.push(`<span class="gcal-cell empty">${prevDaysInMonth - i}</span>`);
  }
  for(let d=1; d<=daysInMonth; d++){
    const key = newsDateKey(y, m, d);
    const cls = ["gcal-cell"];
    if(key===todayKey) cls.push("today");
    if(d===selectedDay) cls.push("selected");
    // 土曜は青、日曜・祝日は赤（「日本の祝日」タブは廃止したが、配色判定
    // には引き続き裏側で祝日データを使う）
    const dow = new Date(y, m, d).getDay();
    if(dow === 6) cls.push("sat");
    if(dow === 0 || holidays.has(key)) cls.push("holiday");
    const dayEvents = evMap[key] || [];
    // 予定が複数カレンダー由来のときは、その日にある予定のカレンダーの色を
    // 重複なく（最大4つまで）並べて表示し、どのカレンダーの予定があるかを
    // ひと目で分かるようにする。calColorを持たない予定（ローカルのデモ
    // カレンダー）はこれまで通り呼び出し元が渡した単一色にフォールバックする
    const dotColors = dayEvents.length ? [...new Set(dayEvents.map(ev => ev.calColor || color))].slice(0, 4) : [];
    const dotsHTML = dotColors.length ? `<span class="gcal-cell-dots">${dotColors.map(c => `<span class="gcal-cell-dot" style="background:${esc(c)}"></span>`).join("")}</span>` : "";
    cells.push(`<button type="button" class="${cls.join(" ")}" data-gday="${d}">${d}${dotsHTML}</button>`);
  }
  const trailing = (7 - ((startWeekday + daysInMonth) % 7)) % 7;
  for(let d=1; d<=trailing; d++){
    cells.push(`<span class="gcal-cell empty">${d}</span>`);
  }
  return cells.join("");
}

// ホーム画面（1日表示）で表示中の年月日。renderSelect()によるホーム画面
// 全体の再描画をまたいでも見ていた日を保持するため、モジュール変数として
// 保持する（初回のみ今日）
let gcalDailyY = null, gcalDailyM = null, gcalDailyD = null;

function gcalShiftDailyDate(deltaDays){
  const d = new Date(gcalDailyY, gcalDailyM, gcalDailyD + deltaDays);
  gcalDailyY = d.getFullYear(); gcalDailyM = d.getMonth(); gcalDailyD = d.getDate();
}

// 予定1件ぶんのタイムラインカードHTML。時間・本文はそれぞれ1行に収め、
// カード幅に収まらない場合はgcalApplyMarquee()が自動横スクロールを付与する
function gcalEventRowHTML(ev){
  const timeText = ev.start ? (ev.end ? `${ev.start} ~ ${ev.end}` : ev.start) : "終日";
  const calDotHTML = ev.calColor ? `<span class="gcal-day-event-caldot" style="background:${esc(ev.calColor)}" title="${esc(ev.calName||"")}"></span>` : "";
  return `
    <div class="gcal-day-event" data-start="${esc(ev.start||"")}" data-end="${esc(ev.end||"")}">
      <div class="gcal-day-event-time"><span class="gcal-marquee-track">${esc(timeText)}</span></div>
      <div class="gcal-day-event-main"><span class="gcal-marquee-track">${calDotHTML}<span class="gcal-day-event-title">${esc(ev.title)}</span></span></div>
      <button type="button" class="gcal-day-event-del" data-del="${esc(ev.id)}" data-cal="${esc(ev.calId||"")}" aria-label="この予定を削除">×</button>
    </div>`;
}

// 連携中のGoogleアカウント自身のメールアドレス（プライマリカレンダーの
// IDは常にそのアカウントのメールアドレスと一致する）。未連携・未取得なら null
function gcalOwnGoogleEmail(){
  const primary = (gcalGoogleCalendars || []).find(c => c.primary);
  return primary ? primary.id : null;
}

// その予定が「今アプリを使っている本人」自身の予定かどうかを判定する。
// ローカル（デモ）モードの予定にはGoogle本来の作成者情報が無いため常に
// 本人の予定として扱う。Google連携中は、予定のcreator.emailが自分の
// プライマリカレンダーのメールアドレスと一致する場合だけ本人の予定とする
// （共有カレンダー経由で見えている他アカウントの予定と区別するため）
function gcalIsOwnEvent(ev){
  if(!ev.creatorEmail) return true;
  const own = gcalOwnGoogleEmail();
  return !own || ev.creatorEmail === own;
}

// 「共有カレンダー経由で見えている他ユーザー」の表示名を、自分だけの見た目
// としてこの端末上で上書きする設定（Google連携メールアドレス→自分で付けた
// 呼び方）。ローカル（デモ）の登録者名やGoogle Calendar本体とは無関係の、
// 完全にこのアプリ内・この端末限定の表示上書きであり、Firestoreなど
// データベースへは一切書き込まない（syncGcalToCloud()を呼ばない）
const GCAL_OTHER_NAME_KEY = "gcal_other_name_overrides_v1"; // { [emailLower]: customName }

function gcalLoadOtherNameOverrides(){
  try{
    const data = JSON.parse(localStorage.getItem(gcalStorageKey(GCAL_OTHER_NAME_KEY)) || "{}");
    return (data && typeof data === "object" && !Array.isArray(data)) ? data : {};
  }catch(e){ return {}; }
}

function gcalSaveOtherNameOverride(email, name){
  const key = (email || "").trim().toLowerCase();
  if(!key) return;
  const overrides = gcalLoadOtherNameOverrides();
  overrides[key] = (name || "").trim();
  try{ localStorage.setItem(gcalStorageKey(GCAL_OTHER_NAME_KEY), JSON.stringify(overrides)); }catch(e){}
}

// 「共有カレンダー経由で見えている他ユーザー」がこのアプリ自身に登録した
// 名前を、Google連携メールアドレス→登録名の公開ディレクトリ（gcalNames
// コレクション）からキャッシュ付きで引く。一度取得（または「登録なし」と
// 判明）したメールアドレスは再問い合わせしない。取得中・未取得はnullを返し
// （その間は呼び出し元がcreatorName等へフォールバックする）、取得が完了した
// 時点でrenderGcalActiveView()により表示中の予定一覧を登録名へ更新する
const gcalNameDirectory = {};
const gcalNameDirectoryPending = new Set();
function gcalLookupRegisteredName(email){
  const key = (email || "").trim().toLowerCase();
  if(!key || !window.GcalNames) return null;
  if(Object.prototype.hasOwnProperty.call(gcalNameDirectory, key)) return gcalNameDirectory[key];
  if(!gcalNameDirectoryPending.has(key)){
    gcalNameDirectoryPending.add(key);
    window.GcalNames.lookup(key)
      .then(name => { gcalNameDirectory[key] = name || null; })
      .catch(() => { gcalNameDirectory[key] = null; })
      .finally(() => { gcalNameDirectoryPending.delete(key); renderGcalActiveView(); });
  }
  return null;
}

// 予定1件の「作成者ラベル」を決定する。手動入力の登録者名(author)を最優先、
// 次に本人自身の予定なら「アプリに登録したユーザー名」（呼び出し元が渡す
// fallback）を使う。それ以外（共有カレンダー経由の他ユーザーの予定）は、
// まずこちら側がこの端末だけで付けた呼び方（gcalLoadOtherNameOverrides、
// データベースには保存されないローカル専用の表示上書き）を最優先する。
// 次にその相手が自分自身でこのアプリに登録した名前（公開ディレクトリ）、
// 次点として「カレンダーの表示名を変更」（✎）でこちら側が登録した名前
// (calRenamed && calName)、それも無ければGoogleカレンダー本来の作成者情報
// (creatorName。多くの場合Gmailアドレスそのまま)、最後に取得元カレンダー名
// (calName)を使う
function gcalEventUserLabel(ev, fallback){
  const author = (ev.author || "").trim();
  if(author) return author;
  if(gcalIsOwnEvent(ev)) return fallback || "予定";
  const emailKey = (ev.creatorEmail || "").trim().toLowerCase();
  if(emailKey){
    const localOverride = gcalLoadOtherNameOverrides()[emailKey];
    if(localOverride) return localOverride;
  }
  const registered = ev.creatorEmail ? gcalLookupRegisteredName(ev.creatorEmail) : null;
  if(registered) return registered;
  if(ev.calRenamed && ev.calName) return ev.calName;
  if(ev.creatorName) return ev.creatorName;
  if(ev.calName) return ev.calName;
  return fallback || "予定";
}

// 予定一覧を作成者ラベルごとにグループ化する。グループ内は開始時刻の
// 昇順、グループ自体はラベル名の五十音/辞書順に並べる。
// editKind:"own" は本人自身の予定グループ（見出しタップで「アプリに登録した
// ユーザー名」を変更）、editKind:"other"（editEmailにその相手のメールアドレス
// を保持）は他ユーザーの予定グループ（見出しタップでこの端末だけの呼び方を
// 設定）。同じグループ内に異なるメールアドレスの予定が混在してしまった場合は
// どちらの表示名を編集すべきか特定できないため編集不可にする
function gcalGroupEventsByUser(events, fallback){
  const order = [];
  const groups = new Map();
  events.forEach(ev => {
    const label = gcalEventUserLabel(ev, fallback);
    if(!groups.has(label)){ groups.set(label, { label, color: null, editKind: null, editEmail: null, events: [] }); order.push(label); }
    const g = groups.get(label);
    const author = (ev.author || "").trim();
    if(!author && gcalIsOwnEvent(ev)){
      g.editKind = "own";
    } else if(!author && ev.creatorEmail && g.editKind !== "own"){
      const email = ev.creatorEmail.trim().toLowerCase();
      if(g.editKind === null){ g.editKind = "other"; g.editEmail = email; }
      else if(g.editKind === "other" && g.editEmail !== email){ g.editKind = null; g.editEmail = null; }
    }
    if(!g.color && ev.calColor) g.color = ev.calColor;
    g.events.push(ev);
  });
  return order.map(label => groups.get(label))
    .map(g => ({ ...g, events: g.events.slice().sort((a,b)=>(a.start||"").localeCompare(b.start||"")) }))
    .sort((a,b) => a.label.localeCompare(b.label, "ja"));
}

// 1日ぶんの予定を「ユーザーごと」にエリアを分けたタイムライン表示にする。
// どの予定がどのユーザー（アカウント）の登録かを一目で分別できるよう、
// gcalGroupEventsByUser()でグループ化してから、グループ見出し＋予定
// カードの順に描画する。fallbackは作成者を判別できない予定に使うラベル
// （通常はこのカレンダーの登録者名、または取得元カレンダー名）
function gcalDayEventsListHTML(events, fallback){
  if(!events.length) return `<div class="gcal-day-empty">この日の予定はまだありません。</div>`;
  const groups = gcalGroupEventsByUser(events, fallback);
  return groups.map(g => {
    const editable = g.editKind === "own" || g.editKind === "other";
    const editAttr = g.editKind === "own" ? ' data-gcal-name-edit="1"'
      : g.editKind === "other" ? ` data-gcal-other-name-edit="${esc(g.editEmail)}"` : "";
    return `
    <div class="gcal-user-group">
      <div class="gcal-user-group-title${editable?" gcal-user-group-title-edit":""}"${editable?editAttr+' role="button" tabindex="0" aria-label="表示名を編集"':""}>${g.color?`<span class="gcal-user-group-dot" style="background:${esc(g.color)}"></span>`:""}${esc(g.label)}${editable?'<span class="gcal-user-group-edit-icon" aria-hidden="true">✏️</span>':""}</div>
      <div class="gcal-user-group-events">${g.events.map(gcalEventRowHTML).join("")}</div>
    </div>`;
  }).join("");
}

// gcalDayEventsListHTML()が出力したグループ見出しをタップ／Enterで押すと、
// 表示名の変更モーダルを開く。「自分自身」（data-gcal-name-edit）なら
// カレンダーで使う名前（アプリに登録したユーザー名）を、「他ユーザー」
// （data-gcal-other-name-edit、値はそのメールアドレス）ならこの端末だけの
// 呼び方（データベースには保存しないローカル専用の表示上書き）を変更する。
// 保存後はonSavedで呼び出し元の画面を再描画させる
function gcalBindNameEditHeadings(root, onSaved){
  root.querySelectorAll("[data-gcal-name-edit]").forEach(el => {
    const open = () => openGcalAuthorNameModal(() => { if(onSaved) onSaved(); }, { allowCancel: true });
    el.onclick = open;
    el.onkeydown = (e) => { if(e.key === "Enter" || e.key === " "){ e.preventDefault(); open(); } };
  });
  root.querySelectorAll("[data-gcal-other-name-edit]").forEach(el => {
    const email = el.dataset.gcalOtherNameEdit;
    const open = () => openGcalOtherNameModal(email, () => { if(onSaved) onSaved(); });
    el.onclick = open;
    el.onkeydown = (e) => { if(e.key === "Enter" || e.key === " "){ e.preventDefault(); open(); } };
  });
}

// 「他ユーザー」の予定グループ見出しをタップしたときに開く、この端末だけの
// 呼び方を設定するモーダル。gcalSaveOtherNameOverride()はlocalStorageのみを
// 使い、Firestore等のデータベースには一切書き込まない（相手や他の閲覧者の
// 画面には影響しない、完全に自分の見た目だけの変更であることをsub文言で明示する）
function openGcalOtherNameModal(email, onSaved){
  const ov = document.createElement("div");
  ov.className = "modal-ov";
  const current = gcalLoadOtherNameOverrides()[(email || "").trim().toLowerCase()] || "";
  const close = () => { try{ ov.remove(); }catch(e){} };
  ov.innerHTML = `
    <div class="modal">
      <div class="modal-title" style="color:var(--text)">✎ 表示名を変更</div>
      <div class="gcal-modal-sub">${esc(email)}<br>この端末・このアカウントだけの表示です。相手や他の人の画面には影響しません。</div>
      <input type="text" class="gcal-ev-input gcal-newcal-input" id="gcal-other-name-input" placeholder="例：お母さん" maxlength="40" value="${esc(current)}">
      <button class="cta" id="gcal-other-name-save">保存する</button>
      <button class="ghost" id="gcal-other-name-cancel" style="margin-top:8px">キャンセル</button>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if(e.target === ov) close(); });
  ov.querySelector("#gcal-other-name-cancel").onclick = close;
  const input = ov.querySelector("#gcal-other-name-input");
  ov.querySelector("#gcal-other-name-save").onclick = () => {
    const name = (input.value || "").trim();
    if(!name){ input.focus(); return; }
    gcalSaveOtherNameOverride(email, name);
    close();
    if(onSaved) onSaved(name);
  };
  input.onkeydown = (e) => { if(e.key === "Enter") ov.querySelector("#gcal-other-name-save").click(); };
  input.focus();
}

// gcalDayEventsListHTML()が描画した各予定カードの時間・本文について、
// カード幅に収まりきらないものだけを自動検出し、右→左へループして流れる
// マーキー表示（CSSアニメーション）を付与する。DOM挿入直後に呼び出す想定
function gcalApplyMarquee(root){
  root.querySelectorAll(".gcal-day-event-time, .gcal-day-event-main").forEach(el => {
    el.classList.remove("gcal-marquee");
    el.style.removeProperty("--gcal-marquee-duration");
    const track = el.querySelector(".gcal-marquee-track");
    if(!track) return;
    if(track.scrollWidth - el.clientWidth > 2){
      const distance = el.clientWidth + track.scrollWidth;
      el.style.setProperty("--gcal-marquee-duration", `${Math.max(3, distance / 40)}s`);
      el.classList.add("gcal-marquee");
    }
  });
}

// 予定エリアの高さ固定・スクロール位置の制御を行う。DOM挿入直後に呼び出す想定
// ・予定が5件以上あるときは最初の4件ぶんの高さに固定し、5件目以降は
//   overflow-y:autoの手動スワイプで見えるようにする
// ・直前と同じ日付／カレンダーの再描画（ToDo操作や予定の追加削除など）
//   ならユーザーがスクロールした位置をそのまま保つ
// ・日付やカレンダーが変わった直後（初回表示・前後日への移動）は、
//   終了時刻（なければ開始時刻）がまだ過ぎていない最初の予定が先頭に
//   来るよう自動でスクロール位置を計算し直す（終日予定は「過ぎていない」
//   扱いとし、それより後ろへは自動スクロールしない）
function gcalSetupDayEventsScroll(root, scrollKey, y, m, d, now, prevKey, prevScrollTop){
  const container = root.querySelector(".gcal-day-events");
  if(!container) return;
  container.style.removeProperty("height");
  const cards = [...container.querySelectorAll(".gcal-day-event")];

  if(cards.length >= 5){
    const gap = parseFloat(getComputedStyle(container).rowGap) || 0;
    let h = 0;
    for(let i=0; i<4; i++){ h += cards[i].offsetHeight + (i>0 ? gap : 0); }
    container.style.height = `${h}px`;
  }

  if(scrollKey === prevKey && prevScrollTop !== null){
    container.scrollTop = prevScrollTop;
    return;
  }

  let targetIndex = cards.length ? cards.length - 1 : 0;
  for(let i=0; i<cards.length; i++){
    const ref = cards[i].dataset.end || cards[i].dataset.start;
    if(!ref || new Date(y, m, d, ...ref.split(":").map(Number)) > now){ targetIndex = i; break; }
  }
  const target = cards[targetIndex];
  if(target){
    const contRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    container.scrollTop += (targetRect.top - contRect.top);
  }
}

function gcalTodoListHTML(todos){
  if(!todos.length) return `<div class="gcal-todo-empty">タスクはありません</div>`;
  return todos.map(t => `
    <div class="gcal-todo-item${t.done?" done":""}">
      <input type="checkbox" class="gcal-todo-check" data-todo-toggle="${esc(t.id)}"${t.done?" checked":""} aria-label="完了にする">
      <span class="gcal-todo-text">${esc(t.text)}</span>
      <button type="button" class="gcal-todo-del" data-todo-del="${esc(t.id)}" aria-label="このタスクを削除">×</button>
    </div>`).join("");
}

// 「変更を反映」ボタン：ホーム画面の日ウィジェットが表示中の1日ぶんの
// 予定を、キャッシュを使わず裏から取り直して画面に反映する。Google連携
// 中のみ実際のAPI再取得を行い、未連携（ローカルのデモモード）のときは
// localStorageの最新状態を読み直すだけの軽い再描画になる
async function gcalReloadDay(){
  if(gcalDayReloading) return;
  gcalDayReloading = true;
  renderGcalDailyWidget();
  if(gcalGoogleAccessToken){
    await gcalRefreshGoogleDayEvents(gcalDailyY, gcalDailyM, gcalDailyD);
  }
  gcalDayReloading = false;
  renderGcalDailyWidget();
}

// ホーム画面：本日（表示中の1日）だけを表示するコンパクトなウィジェット。
// 左に時間帯つきの予定タイムライン、右にその日のToDoリストを並べる。
// 連携設定・カレンダー切替・追加カレンダー・共有はすべて「カレンダー」
// 画面（月表示）側に集約したため、ここでは選択中カレンダーの1日ぶんの
// 予定確認・追加・削除と、日付に紐づくToDoの管理のみを行う
function renderGcalDailyWidget(){
  const root = document.getElementById("gcal-day-card");
  if(!root) return;
  gcalMaybeAutoReconnect();

  const prevEventsEl = root.querySelector(".gcal-day-events");
  const prevScrollTop = prevEventsEl ? prevEventsEl.scrollTop : null;
  const prevScrollKey = root.dataset.dayScrollKey || null;

  const now = new Date();
  if(gcalDailyY === null){ gcalDailyY = now.getFullYear(); gcalDailyM = now.getMonth(); gcalDailyD = now.getDate(); }
  const todayKey = newsDateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const dateKey = newsDateKey(gcalDailyY, gcalDailyM, gcalDailyD);
  const isToday = dateKey === todayKey;
  const weekday = NEWS_WEEKDAYS[new Date(gcalDailyY, gcalDailyM, gcalDailyD).getDay()];
  const dateLabel = `${gcalDailyM+1}月${gcalDailyD}日(${weekday})${isToday?"・今日":""}`;

  const todoStore = loadGcalTodoStore();
  const todos = todoStore[dateKey] || [];

  const bindShared = (root, src) => {
    root.querySelector("#gcal-day-prev").onclick = () => { gcalShiftDailyDate(-1); renderGcalDailyWidget(); };
    root.querySelector("#gcal-day-next").onclick = () => { gcalShiftDailyDate(1); renderGcalDailyWidget(); };
    const reloadBtn = root.querySelector("#gcal-day-reload");
    if(reloadBtn && !gcalDayReloading) reloadBtn.onclick = () => gcalReloadDay();
    const addBtn = root.querySelector("#gcal-day-add");
    if(addBtn) addBtn.onclick = () => gcalEnsureAuthorName(() => openGcalEventModal(src, gcalDailyY, gcalDailyM, gcalDailyD, { showList: false }));

    root.querySelectorAll("[data-todo-toggle]").forEach(cb => cb.onchange = () => {
      const s2 = loadGcalTodoStore();
      const item = (s2[dateKey] || []).find(t => t.id === cb.dataset.todoToggle);
      if(item) item.done = cb.checked;
      saveGcalTodoStore(s2);
      renderGcalDailyWidget();
    });
    root.querySelectorAll("[data-todo-del]").forEach(btn => btn.onclick = () => {
      if(!confirm("このタスクを削除しますか？")) return;
      const s2 = loadGcalTodoStore();
      s2[dateKey] = (s2[dateKey] || []).filter(t => t.id !== btn.dataset.todoDel);
      saveGcalTodoStore(s2);
      renderGcalDailyWidget();
    });
    const todoInput = root.querySelector("#gcal-todo-input");
    const addTodo = () => {
      const text = (todoInput.value||"").trim();
      if(!text) return;
      const s2 = loadGcalTodoStore();
      if(!s2[dateKey]) s2[dateKey] = [];
      s2[dateKey].push({ id: gcalGenId("t"), text, done: false });
      saveGcalTodoStore(s2);
      renderGcalDailyWidget();
    };
    root.querySelector("#gcal-todo-add").onclick = addTodo;
    todoInput.onkeydown = (e) => { if(e.key === "Enter") addTodo(); };
  };

  const shellHTML = (eventsHTML) => `
    <div class="gcal-box gcal-day-box">
      <div class="gcal-day-head">
        <button type="button" class="gcal-nav-btn" id="gcal-day-prev" aria-label="前の日">‹</button>
        <div class="gcal-day-title">${esc(dateLabel)}</div>
        <div class="gcal-day-head-right">
          <button type="button" class="gcal-reload-btn${gcalDayReloading?" spinning":""}" id="gcal-day-reload" aria-label="変更を反映（最新の予定を再取得）" title="変更を反映"${gcalDayReloading?" disabled":""}>🔄</button>
          <button type="button" class="gcal-nav-btn" id="gcal-day-next" aria-label="次の日">›</button>
        </div>
      </div>
      <div class="gcal-day-body">
        <div class="gcal-day-timeline">
          <div class="gcal-day-events">${eventsHTML}</div>
          <button type="button" class="gcal-day-add-btn" id="gcal-day-add">＋ 予定を追加</button>
        </div>
        <div class="gcal-day-todo">
          <div class="gcal-day-todo-title">本日のタスク</div>
          <div class="gcal-day-todo-list">${gcalTodoListHTML(todos)}</div>
          <div class="gcal-day-todo-form">
            <input type="text" id="gcal-todo-input" class="gcal-todo-input" placeholder="タスク" maxlength="60">
            <button type="button" id="gcal-todo-add" class="gcal-todo-add-btn" aria-label="タスクを追加">＋</button>
          </div>
        </div>
      </div>
    </div>`;

  if(gcalGoogleAccessToken){
    if(gcalGoogleCalendars === null){
      root.innerHTML = `<div class="gcal-box gcal-day-box"><div class="gcal-google-loading">読み込み中…</div></div>`;
      gcalRefreshGoogleCalendars();
      return;
    }
    if(!gcalGoogleCalendars.length){
      root.innerHTML = `<div class="gcal-box gcal-day-box"><div class="gcal-google-loading">連携できるカレンダーが見つかりませんでした。</div></div>`;
      return;
    }
    let activeId = null;
    try{ activeId = localStorage.getItem(gcalStorageKey(GCAL_GOOGLE_ACTIVE_KEY)); }catch(e){}
    const active = gcalGoogleCalendars.find(c => c.id === activeId) || gcalGoogleCalendars[0];
    const cacheKey = gcalDayCacheKey(dateKey);
    const evMap = gcalGoogleDayEventsCache[cacheKey];

    // 予定の新規追加は「アクティブなカレンダー」（カレンダー画面のスイッチャー
    // で選んだ1つ）へ行うが、表示は連携中の全カレンダー（他アカウントから
    // 共有されたサブカレンダーを含む）ぶんの予定をまとめて出す
    const src = {
      mode: "google", calId: active.id, color: active.color, name: active.name,
      getEventsMap: () => gcalGoogleDayEventsCache[cacheKey] || {},
      refresh: () => gcalRefreshGoogleDayEvents(gcalDailyY, gcalDailyM, gcalDailyD),
    };

    root.innerHTML = shellHTML(evMap ? gcalDayEventsListHTML(evMap[dateKey] || [], gcalLoadAuthorName() || getProfileName() || active.name) : `<div class="gcal-google-loading">予定を読み込み中…</div>`);
    bindShared(root, src);
    gcalBindNameEditHeadings(root, renderGcalDailyWidget);
    gcalApplyMarquee(root);
    const googleScrollKey = `g|${dateKey}`;
    gcalSetupDayEventsScroll(root, googleScrollKey, gcalDailyY, gcalDailyM, gcalDailyD, now, prevScrollKey, prevScrollTop);
    root.dataset.dayScrollKey = googleScrollKey;
    if(!evMap){
      gcalRefreshGoogleDayEvents(gcalDailyY, gcalDailyM, gcalDailyD);
    } else {
      root.querySelectorAll("[data-del]").forEach(btn => btn.onclick = async () => {
        if(!confirm("この予定を削除しますか？")) return;
        try{
          await gcalDeleteGoogleEvent(btn.dataset.cal || active.id, btn.dataset.del);
          await src.refresh();
        }catch(e){
          gcalGoogleError = "削除に失敗しました。もう一度お試しください。";
          renderGcalDailyWidget();
        }
      });
    }
    return;
  }

  // ---------------- ローカル（デモ）モード ----------------
  const store = loadGcalStore();
  const active = store.calendars.find(c => c.id === store.activeId) || store.calendars[0];
  const events = (store.events[active.id] && store.events[active.id][dateKey]) || [];
  const src = {
    mode: "local", calId: active.id, color: active.color, name: active.name,
    getEventsMap: () => (loadGcalStore().events[active.id] || {}),
    refresh: () => renderGcalDailyWidget(),
  };

  root.innerHTML = shellHTML(gcalDayEventsListHTML(events, gcalLoadAuthorName() || getProfileName() || active.name));
  bindShared(root, src);
  gcalBindNameEditHeadings(root, renderGcalDailyWidget);
  gcalApplyMarquee(root);
  const localScrollKey = `l|${active.id}|${dateKey}`;
  gcalSetupDayEventsScroll(root, localScrollKey, gcalDailyY, gcalDailyM, gcalDailyD, now, prevScrollKey, prevScrollTop);
  root.dataset.dayScrollKey = localScrollKey;
  root.querySelectorAll("[data-del]").forEach(btn => btn.onclick = () => {
    if(!confirm("この予定を削除しますか？")) return;
    const s2 = loadGcalStore();
    if(s2.events[active.id] && s2.events[active.id][dateKey]){
      s2.events[active.id][dateKey] = s2.events[active.id][dateKey].filter(ev => ev.id !== btn.dataset.del);
      saveGcalStore(s2);
    }
    renderGcalDailyWidget();
  });
}

// 「カレンダー」画面：月グリッドの真下に置く、選択中の日の予定一覧＋
// 追加フォーム。予定の確認・追加・削除はここで完結し、モーダルは開かない
function gcalSelectedDaySectionHTML(y, m, d, events, fallback){
  const weekday = NEWS_WEEKDAYS[new Date(y, m, d).getDay()];
  const now = new Date();
  const isToday = newsDateKey(y, m, d) === newsDateKey(now.getFullYear(), now.getMonth(), now.getDate());
  return `
    <div class="gcal-selday-section">
      <div class="gcal-selday-title">${m+1}月${d}日(${weekday})${isToday?"・今日":""}の予定</div>
      ${gcalSelDayError ? `<div class="gcal-google-error">${esc(gcalSelDayError)}</div>` : ""}
      <div class="gcal-day-events gcal-selday-events">${gcalDayEventsListHTML(events, fallback)}</div>
      <div class="gcal-ev-form">
        <input type="text" class="gcal-ev-input" id="gcal-selday-input" placeholder="予定を入力（過去の予定から候補を検索）" autocomplete="off"${gcalSelDayBusy?" disabled":""}>
      </div>
      <div class="gcal-suggest" id="gcal-selday-suggest"></div>
      <div class="gcal-ev-time-row">
        <input type="time" class="gcal-ev-time-input" id="gcal-selday-start" aria-label="開始時刻"${gcalSelDayBusy?" disabled":""}>
        <span class="gcal-ev-time-sep">〜</span>
        <input type="time" class="gcal-ev-time-input" id="gcal-selday-end" aria-label="終了時刻"${gcalSelDayBusy?" disabled":""}>
        <button type="button" class="gcal-ev-add-btn" id="gcal-selday-add"${gcalSelDayBusy?" disabled":""}>追加</button>
      </div>
    </div>`;
}

// 予定入力欄の「過去の予定から引用」サジェスト用の候補プールを作る。
// 履歴全体をAPIへ毎回問い合わせるのは重いため、ローカル（デモ）カレンダー
// に保存済みの予定と、このセッション中に既に画面表示のため取得済みの
// Googleカレンダーの予定（キャッシュ済み分のみ）を対象にした軽量な実装。
// 共有カレンダー経由で見えている他ユーザーの予定が紛れ込まないよう、
// gcalIsOwnEvent()で「今この予定を登録しようとしている本人」自身の
// 過去の予定だけに絞り込む
function gcalSuggestPool(){
  const seen = new Map();
  const add = (title, start, end) => {
    const t = (title || "").trim();
    if(!t) return;
    const key = `${t}|${start||""}|${end||""}`;
    if(!seen.has(key)) seen.set(key, { title: t, start: start||"", end: end||"" });
  };
  const store = loadGcalStore();
  Object.values(store.events || {}).forEach(byDate => {
    Object.values(byDate || {}).forEach(list => (list||[]).forEach(ev => { if(gcalIsOwnEvent(ev)) add(ev.title, ev.start, ev.end); }));
  });
  [gcalGoogleEventsCache, gcalGoogleDayEventsCache].forEach(cache => {
    Object.values(cache).forEach(byDate => {
      Object.values(byDate || {}).forEach(list => (list||[]).forEach(ev => { if(gcalIsOwnEvent(ev)) add(ev.title, ev.start, ev.end); }));
    });
  });
  return [...seen.values()];
}

// タイトル入力欄(input)・開始/終了時刻入力欄(startInput/endInput)・候補を
// 表示するコンテナ(box)を受け取り、入力のたびに過去の予定タイトルを部分
// 一致（前方一致を含む）で絞り込んで表示する。候補をクリックするとタイトル
// ・開始・終了時刻を入力欄へ自動補完する。入力が空のときは何も表示しない
function gcalBindSuggest(input, box, startInput, endInput){
  if(!input || !box) return;
  const hide = () => { box.innerHTML = ""; box.classList.remove("open"); };
  input.oninput = () => {
    const q = input.value.trim();
    if(!q){ hide(); return; }
    const matches = gcalSuggestPool().filter(p => p.title.includes(q)).slice(0, 5);
    if(!matches.length){ hide(); return; }
    box.innerHTML = matches.map((m, i) => `
      <button type="button" class="gcal-suggest-item" data-si="${i}">
        <span class="gcal-suggest-title">${esc(m.title)}</span>
        <span class="gcal-suggest-time">${m.start ? (m.end ? `${esc(m.start)}〜${esc(m.end)}` : esc(m.start)) : "終日"}</span>
      </button>`).join("");
    box.classList.add("open");
    box.querySelectorAll("[data-si]").forEach(btn => btn.onclick = () => {
      const m = matches[parseInt(btn.dataset.si, 10)];
      input.value = m.title;
      if(startInput) startInput.value = m.start || "";
      if(endInput) endInput.value = m.end || "";
      hide();
      input.focus();
    });
  };
  // 候補クリック(mousedown→click)より先にblurでhide()してしまうと選択が
  // 反映されないため、クリック処理が先に走るよう一呼吸遅らせて閉じる
  input.onblur = () => { setTimeout(hide, 150); };
}

// src.mode==="google"なら本物のGoogle Calendar APIを、"local"ならlocalStorage
// のデモ用データを読み書きする。処理後は毎回renderGcalMonthCard()で画面
// 全体を再描画し直すことで、グリッドの●印・一覧の両方を最新状態に保つ
function gcalBindSelectedDaySection(root, src, y, m, d){
  const dateKey = newsDateKey(y, m, d);

  gcalBindNameEditHeadings(root, renderGcalMonthCard);

  root.querySelectorAll(".gcal-selday-events [data-del]").forEach(btn => btn.onclick = async () => {
    if(gcalSelDayBusy) return;
    const evId = btn.dataset.del;
    if(src.mode === "google"){
      gcalSelDayBusy = true; gcalSelDayError = null; renderGcalMonthCard();
      try{
        // 一覧には複数カレンダー（共有カレンダーを含む）の予定が混在するため、
        // 削除は各予定が実際に属するカレンダー（data-cal）を優先して使う
        await gcalDeleteGoogleEvent(btn.dataset.cal || src.calId, evId);
        await src.refresh();
      }catch(e){
        gcalSelDayError = "削除に失敗しました。もう一度お試しください。";
      }
      gcalSelDayBusy = false; renderGcalMonthCard();
      return;
    }
    const s2 = loadGcalStore();
    if(s2.events[src.calId] && s2.events[src.calId][dateKey]){
      s2.events[src.calId][dateKey] = s2.events[src.calId][dateKey].filter(ev => ev.id !== evId);
      saveGcalStore(s2);
    }
    src.refresh();
    renderGcalMonthCard();
  });

  const input = root.querySelector("#gcal-selday-input");
  const startInput = root.querySelector("#gcal-selday-start");
  const endInput = root.querySelector("#gcal-selday-end");
  gcalBindSuggest(input, root.querySelector("#gcal-selday-suggest"), startInput, endInput);
  const submit = async () => {
    if(gcalSelDayBusy) return;
    const title = (input.value||"").trim();
    if(!title){ input.focus(); return; }
    const start = startInput.value || "";
    const end = endInput.value || "";
    if(start && end && end <= start){ gcalSelDayError = "終了時刻は開始時刻より後にしてください。"; renderGcalMonthCard(); return; }
    if(src.mode === "google"){
      gcalSelDayBusy = true; gcalSelDayError = null; renderGcalMonthCard();
      try{
        await gcalCreateGoogleEvent(src.calId, y, m, d, title, start, end);
        await src.refresh();
        gcalSelDayBusy = false; renderGcalMonthCard();
      }catch(e){
        gcalSelDayBusy = false; gcalSelDayError = "追加に失敗しました。もう一度お試しください。"; renderGcalMonthCard();
      }
      return;
    }
    const author = gcalLoadAuthorName();
    const s2 = loadGcalStore();
    if(!s2.events[src.calId]) s2.events[src.calId] = {};
    if(!s2.events[src.calId][dateKey]) s2.events[src.calId][dateKey] = [];
    s2.events[src.calId][dateKey].push({ id: gcalGenId("e"), title, start, end, author });
    saveGcalStore(s2);
    gcalSelDayError = null;
    src.refresh();
    renderGcalMonthCard();
  };
  root.querySelector("#gcal-selday-add").onclick = submit;
  if(!gcalSelDayBusy){
    input.onkeydown = (e) => { if(e.key === "Enter") submit(); };
  }
}

// 「変更を反映」ボタン：カレンダー画面が表示中の月ぶんの予定を、
// キャッシュを使わず裏から取り直して画面に反映する。Google連携中のみ
// 実際のAPI再取得を行い、未連携（ローカルのデモモード）のときは
// localStorageの最新状態を読み直すだけの軽い再描画になる
async function gcalReloadMonth(){
  if(gcalMonthReloading) return;
  gcalMonthReloading = true;
  renderGcalMonthCard();
  if(gcalGoogleAccessToken){
    await gcalRefreshGoogleEvents(gcalViewY, gcalViewM);
  }
  gcalMonthReloading = false;
  renderGcalMonthCard();
}

// 「カレンダー」画面の中身を描画し直す（画面単体の更新用。カレンダー
// 切り替え・月移動・予定の増減・Google連携状態の変化のたびに呼ぶ）。
// Google連携済みなら本物のGoogleカレンダーのデータを表示し、未連携なら
// 従来通りローカル保存のデモ用カレンダーにフォールバックする
function renderGcalMonthCard(){
  const root = document.getElementById("gcal-month-card");
  if(!root) return;
  const now = new Date();
  if(gcalViewY === null){ gcalViewY = now.getFullYear(); gcalViewM = now.getMonth(); }
  const todayKey = newsDateKey(now.getFullYear(), now.getMonth(), now.getDate());
  if(gcalSelectedDay === null && gcalViewY === now.getFullYear() && gcalViewM === now.getMonth()){
    gcalSelectedDay = now.getDate();
  }
  if(gcalSelectedDay !== null){
    const daysInViewMonth = new Date(gcalViewY, gcalViewM+1, 0).getDate();
    if(gcalSelectedDay > daysInViewMonth) gcalSelectedDay = daysInViewMonth;
  }
  gcalMaybeAutoReconnect();

  const errorHTML = gcalGoogleError ? `<div class="gcal-google-error">${esc(gcalGoogleError)}</div>` : "";

  if(gcalGoogleAccessToken){
    // ---------------- Google連携モード ----------------
    if(gcalGoogleCalendars === null){
      root.innerHTML = `
        <div class="gcal-box">
          ${gcalConnectBarHTML()}
          ${errorHTML}
          <div class="gcal-google-loading">カレンダー一覧を読み込み中…</div>
        </div>`;
      gcalBindConnectBar(root);
      gcalRefreshGoogleCalendars();
      return;
    }
    if(!gcalGoogleCalendars.length){
      root.innerHTML = `
        <div class="gcal-box">
          ${gcalConnectBarHTML()}
          ${errorHTML}
          <div class="gcal-google-loading">書き込み可能なカレンダーが見つかりませんでした。</div>
        </div>`;
      gcalBindConnectBar(root);
      return;
    }

    let activeId = null;
    try{ activeId = localStorage.getItem(gcalStorageKey(GCAL_GOOGLE_ACTIVE_KEY)); }catch(e){}
    const active = gcalGoogleCalendars.find(c => c.id === activeId) || gcalGoogleCalendars[0];

    const switcherHTML = gcalGoogleCalendars.map(c => {
      const isActive = c.id === active.id;
      return `
        <div class="gcal-chip-wrap${isActive?" active":""}">
          <button type="button" class="gcal-chip${isActive?" active":""}" data-gcal="${esc(c.id)}" style="--chip-color:${esc(c.color)}">
            <span class="gcal-chip-dot"></span>${esc(c.name)}
          </button>
          <button type="button" class="gcal-rename-btn" data-rename="${esc(c.id)}" aria-label="${esc(c.name)}の表示名を変更" title="表示名を変更">✎</button>
        </div>`;
    }).join("");

    // スイッチャーで選んだカレンダーが「アクティブなカレンダー」となり、
    // 新しい予定の追加先になるだけでなく、グリッドの●印・下の予定一覧も
    // そのカレンダー単体の予定だけに絞り込む（＝カレンダーの切替）。
    // 取得自体は連携中の全カレンダー（共有カレンダーを含む）ぶんを一度に
    // まとめて行い、切替のたびに再取得しなくて済むようキャッシュ済みの
    // マージ済みマップからクライアント側でカレンダーIDによる絞り込みを行う
    const evKey = gcalEventsCacheKey(gcalViewY, gcalViewM);
    const evMerged = gcalGoogleEventsCache[evKey];
    const evActive = evMerged ? gcalFilterMapByCal(evMerged, active.id) : null;

    root.innerHTML = `
      <div class="gcal-box">
        ${gcalConnectBarHTML()}
        ${errorHTML}
        <div class="gcal-switcher">${switcherHTML}</div>
        <div class="gcal-cal-head">
          <button type="button" class="gcal-nav-btn" id="gcal-prev" aria-label="前の月">‹</button>
          <div class="gcal-cal-title">${gcalViewY}年${gcalViewM+1}月</div>
          <div class="gcal-cal-head-right">
            <button type="button" class="gcal-reload-btn${gcalMonthReloading?" spinning":""}" id="gcal-month-reload" aria-label="変更を反映（最新の予定を再取得）" title="変更を反映"${gcalMonthReloading?" disabled":""}>🔄</button>
            <button type="button" class="gcal-nav-btn" id="gcal-next" aria-label="次の月">›</button>
          </div>
        </div>
        <div class="gcal-grid-wrap">
          <div class="gcal-grid gcal-weekdays">${NEWS_WEEKDAYS.map(w=>`<span class="gcal-wd-cell">${w}</span>`).join("")}</div>
          <div class="gcal-grid">${evActive ? gcalDayCellsHTML(gcalViewY, gcalViewM, evActive, todayKey, active.color, gcalSelectedDay) : ""}</div>
        </div>
        ${evActive ? "" : `<div class="gcal-google-loading">予定を読み込み中…</div>`}
        ${evActive && gcalSelectedDay !== null ? gcalSelectedDaySectionHTML(gcalViewY, gcalViewM, gcalSelectedDay, evActive[newsDateKey(gcalViewY, gcalViewM, gcalSelectedDay)] || [], gcalLoadAuthorName() || getProfileName() || active.name) : ""}
        <div class="gcal-google-note">カレンダーの追加・共有設定は<a href="https://calendar.google.com/" target="_blank" rel="noopener noreferrer">Googleカレンダー</a>側で行ってください。</div>
      </div>`;

    gcalBindConnectBar(root);
    const monthReloadBtn = root.querySelector("#gcal-month-reload");
    if(monthReloadBtn && !gcalMonthReloading) monthReloadBtn.onclick = () => gcalReloadMonth();
    root.querySelectorAll("[data-gcal]").forEach(b => b.onclick = () => {
      try{ localStorage.setItem(gcalStorageKey(GCAL_GOOGLE_ACTIVE_KEY), b.dataset.gcal); }catch(e){}
      gcalSelDayError = null;
      renderGcalMonthCard();
    });
    root.querySelectorAll("[data-rename]").forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      openGcalRenameCalendarModal(b.dataset.rename);
    });
    root.querySelector("#gcal-prev").onclick = () => { gcalViewM--; if(gcalViewM<0){ gcalViewM=11; gcalViewY--; } gcalSelDayError = null; renderGcalMonthCard(); };
    root.querySelector("#gcal-next").onclick = () => { gcalViewM++; if(gcalViewM>11){ gcalViewM=0; gcalViewY++; } gcalSelDayError = null; renderGcalMonthCard(); };

    if(!evMerged){
      gcalRefreshGoogleEvents(gcalViewY, gcalViewM);
    } else {
      root.querySelectorAll("[data-gday]").forEach(b => b.onclick = () => {
        gcalEnsureAuthorName(() => {
          gcalSelectedDay = parseInt(b.dataset.gday, 10);
          gcalSelDayError = null;
          renderGcalMonthCard();
        });
      });
      if(gcalSelectedDay !== null){
        gcalBindSelectedDaySection(root, {
          mode: "google", calId: active.id, color: active.color, name: active.name,
          getEventsMap: () => gcalFilterMapByCal(gcalGoogleEventsCache[evKey] || {}, active.id),
          refresh: () => gcalRefreshGoogleEvents(gcalViewY, gcalViewM),
        }, gcalViewY, gcalViewM, gcalSelectedDay);
        gcalApplyMarquee(root);
      }
    }
    return;
  }

  // ---------------- ローカル（デモ）モード ----------------
  const store = loadGcalStore();
  const active = store.calendars.find(c => c.id === store.activeId) || store.calendars[0];
  const evOfActive = store.events[active.id] || {};

  const switcherHTML = store.calendars.map(c => {
    const isActive = c.id === store.activeId;
    return `
      <div class="gcal-chip-wrap${isActive?" active":""}">
        <button type="button" class="gcal-chip${isActive?" active":""}" data-cal="${esc(c.id)}" style="--chip-color:${esc(c.color)}">
          <span class="gcal-chip-dot"></span>${esc(c.name)}
        </button>
        <button type="button" class="gcal-share-btn" data-share="${esc(c.id)}" aria-label="${esc(c.name)}の共有ユーザー設定" title="共有ユーザー設定">👥</button>
      </div>`;
  }).join("") + `<button type="button" class="gcal-add-cal-btn" id="gcal-add-cal" aria-label="カレンダーを追加" title="カレンダーを追加">＋</button>`;

  root.innerHTML = `
    <div class="gcal-box">
      ${gcalConnectBarHTML()}
      ${errorHTML}
      <div class="gcal-switcher">${switcherHTML}</div>
      <div class="gcal-cal-head">
        <button type="button" class="gcal-nav-btn" id="gcal-prev" aria-label="前の月">‹</button>
        <div class="gcal-cal-title">${gcalViewY}年${gcalViewM+1}月</div>
        <div class="gcal-cal-head-right">
          <button type="button" class="gcal-reload-btn${gcalMonthReloading?" spinning":""}" id="gcal-month-reload" aria-label="変更を反映（最新の予定を再取得）" title="変更を反映"${gcalMonthReloading?" disabled":""}>🔄</button>
          <button type="button" class="gcal-nav-btn" id="gcal-next" aria-label="次の月">›</button>
        </div>
      </div>
      <div class="gcal-grid-wrap">
        <div class="gcal-grid gcal-weekdays">${NEWS_WEEKDAYS.map(w=>`<span class="gcal-wd-cell">${w}</span>`).join("")}</div>
        <div class="gcal-grid">${gcalDayCellsHTML(gcalViewY, gcalViewM, evOfActive, todayKey, active.color, gcalSelectedDay)}</div>
      </div>
      ${gcalSelectedDay !== null ? gcalSelectedDaySectionHTML(gcalViewY, gcalViewM, gcalSelectedDay, evOfActive[newsDateKey(gcalViewY, gcalViewM, gcalSelectedDay)] || [], gcalLoadAuthorName() || getProfileName() || active.name) : ""}
    </div>`;

  gcalBindConnectBar(root);
  const monthReloadBtnLocal = root.querySelector("#gcal-month-reload");
  if(monthReloadBtnLocal && !gcalMonthReloading) monthReloadBtnLocal.onclick = () => gcalReloadMonth();
  root.querySelectorAll("[data-cal]").forEach(b => b.onclick = () => {
    const s2 = loadGcalStore();
    s2.activeId = b.dataset.cal;
    saveGcalStore(s2);
    gcalSelDayError = null;
    renderGcalMonthCard();
  });
  root.querySelectorAll("[data-share]").forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    openGcalShareModal(b.dataset.share);
  });
  const addCalBtn = root.querySelector("#gcal-add-cal");
  if(addCalBtn) addCalBtn.onclick = () => openGcalAddCalendarModal();
  root.querySelector("#gcal-prev").onclick = () => {
    gcalViewM--; if(gcalViewM<0){ gcalViewM=11; gcalViewY--; }
    gcalSelDayError = null;
    renderGcalMonthCard();
  };
  root.querySelector("#gcal-next").onclick = () => {
    gcalViewM++; if(gcalViewM>11){ gcalViewM=0; gcalViewY++; }
    gcalSelDayError = null;
    renderGcalMonthCard();
  };
  root.querySelectorAll("[data-gday]").forEach(b => b.onclick = () => {
    gcalEnsureAuthorName(() => {
      gcalSelectedDay = parseInt(b.dataset.gday, 10);
      gcalSelDayError = null;
      renderGcalMonthCard();
    });
  });
  if(gcalSelectedDay !== null){
    gcalBindSelectedDaySection(root, {
      mode: "local", calId: active.id, color: active.color, name: active.name,
      getEventsMap: () => (loadGcalStore().events[active.id] || {}),
      refresh: () => renderGcalMonthCard(),
    }, gcalViewY, gcalViewM, gcalSelectedDay);
    gcalApplyMarquee(root);
  }
}

// 日付セルタップで開く、その日の予定の確認・追加・削除ポップアップ。
// src.mode==="google" なら本物のGoogle Calendar APIを、"local" なら
// 従来通りlocalStorageのデモ用データを読み書きする
// 日付セルタップで開く、その日の予定の確認・追加・削除ポップアップ。
// src.mode==="google" なら本物のGoogle Calendar APIを、"local" なら
// 従来通りlocalStorageのデモ用データを読み書きする。src.getEventsMap()は
// 呼び出し元（週ウィジェット／月カード）が持つ最新のイベントmapを返す
// 関数、src.refresh()は追加・削除後にそのmapを更新して呼び出し元の
// 表示を再描画する関数 —— この2つを差し替えるだけで、同じモーダルを
// 週表示・月表示のどちらからでも共通して使える
// 日付タップ・「＋予定を追加」で開く、その日の予定の確認・追加・削除
// ポップアップ。src.mode==="google"なら本物のGoogle Calendar APIを、
// "local"なら従来通りlocalStorageのデモ用データを読み書きする。
// opts.showList=falseの場合は既存の予定一覧を省略し、追加フォームのみの
// 軽量なポップアップになる（ホーム画面の「＋予定を追加」ボタン用。
// 一覧はホーム側に既にタイムライン表示されているため重複を避ける）
function openGcalEventModal(src, y, m, d, opts){
  const showList = !opts || opts.showList !== false;
  const dateKey = newsDateKey(y, m, d);
  const ov = document.createElement("div");
  ov.className = "modal-ov";
  const close = () => { try{ ov.remove(); }catch(e){} };
  let busy = false;

  const getEvents = () => src.getEventsMap()[dateKey] || [];

  const draw = (msg) => {
    const events = showList ? getEvents() : [];
    ov.innerHTML = `
      <div class="modal">
        <div class="modal-title" style="color:var(--text)">📅 ${m+1}月${d}日の予定</div>
        <div class="gcal-modal-sub">${esc(src.name)}</div>
        ${msg ? `<div class="gcal-google-error">${esc(msg)}</div>` : ""}
        ${showList ? `<div class="gcal-ev-list">
          ${events.length ? events.map(ev => `
            <div class="gcal-ev-item">
              <div class="gcal-ev-time">${ev.start ? `${esc(ev.start)}${ev.end?`〜${esc(ev.end)}`:""}` : "終日"}</div>
              <div class="gcal-ev-main">${ev.author?`<span class="gcal-ev-author">(${esc(ev.author)})</span> `:""}<span class="gcal-ev-title">${esc(ev.title)}</span></div>
              <button type="button" class="gcal-ev-del" data-del="${esc(ev.id)}" aria-label="この予定を削除"${busy?" disabled":""}>×</button>
            </div>`).join("") : `<div class="gcal-ev-empty">この日の予定はまだありません。</div>`}
        </div>` : ""}
        <div class="gcal-ev-form">
          <input type="text" class="gcal-ev-input" id="gcal-ev-input" placeholder="予定を入力（過去の予定から候補を検索）" autocomplete="off"${busy?" disabled":""}>
        </div>
        <div class="gcal-suggest" id="gcal-ev-suggest"></div>
        <div class="gcal-ev-time-row">
          <input type="time" class="gcal-ev-time-input" id="gcal-ev-start" aria-label="開始時刻"${busy?" disabled":""}>
          <span class="gcal-ev-time-sep">〜</span>
          <input type="time" class="gcal-ev-time-input" id="gcal-ev-end" aria-label="終了時刻"${busy?" disabled":""}>
          <button type="button" class="gcal-ev-add-btn" id="gcal-ev-add"${busy?" disabled":""}>追加</button>
        </div>
        <button class="ghost" id="gcal-ev-close" style="margin-top:12px">閉じる</button>
      </div>`;

    ov.querySelector("#gcal-ev-close").onclick = close;
    ov.querySelectorAll("[data-del]").forEach(btn => btn.onclick = async () => {
      if(busy) return;
      const evId = btn.dataset.del;
      if(src.mode === "google"){
        busy = true; draw();
        try{
          await gcalDeleteGoogleEvent(src.calId, evId);
          await src.refresh();
          busy = false; draw();
        }catch(e){
          busy = false; draw("削除に失敗しました。もう一度お試しください。");
        }
        return;
      }
      const s2 = loadGcalStore();
      if(s2.events[src.calId] && s2.events[src.calId][dateKey]){
        s2.events[src.calId][dateKey] = s2.events[src.calId][dateKey].filter(ev => ev.id !== evId);
        saveGcalStore(s2);
      }
      src.refresh();
      draw();
    });

    const input = ov.querySelector("#gcal-ev-input");
    const startInput = ov.querySelector("#gcal-ev-start");
    const endInput = ov.querySelector("#gcal-ev-end");
    gcalBindSuggest(input, ov.querySelector("#gcal-ev-suggest"), startInput, endInput);
    const submit = async () => {
      if(busy) return;
      const title = (input.value||"").trim();
      if(!title){ input.focus(); return; }
      const start = startInput.value || "";
      const end = endInput.value || "";
      if(start && end && end <= start){ draw("終了時刻は開始時刻より後にしてください。"); return; }
      if(src.mode === "google"){
        busy = true; draw();
        try{
          await gcalCreateGoogleEvent(src.calId, y, m, d, title, start, end);
          await src.refresh();
          close(); // 登録に成功したら手動で閉じなくても自動でモーダルを閉じる
        }catch(e){
          busy = false; draw("追加に失敗しました。もう一度お試しください。");
        }
        return;
      }
      const author = gcalLoadAuthorName();
      const s2 = loadGcalStore();
      if(!s2.events[src.calId]) s2.events[src.calId] = {};
      if(!s2.events[src.calId][dateKey]) s2.events[src.calId][dateKey] = [];
      s2.events[src.calId][dateKey].push({ id: gcalGenId("e"), title, start, end, author });
      saveGcalStore(s2);
      src.refresh();
      close(); // 登録に成功したら手動で閉じなくても自動でモーダルを閉じる
    };
    ov.querySelector("#gcal-ev-add").onclick = submit;
    if(!busy){
      input.onkeydown = (e) => { if(e.key === "Enter") submit(); };
      input.focus();
    }
  };

  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if(e.target === ov) close(); });
  draw();
}

// カレンダー横の👥ボタンから開く、共有ユーザー（メールアドレス）の設定
// ポップアップ。実際の通知・同期は行わない端末内限定の設定
function openGcalShareModal(calId){
  const ov = document.createElement("div");
  ov.className = "modal-ov";
  const close = () => { try{ ov.remove(); }catch(e){} };

  const draw = () => {
    const store = loadGcalStore();
    const cal = store.calendars.find(c => c.id === calId);
    if(!cal){ close(); return; }
    ov.innerHTML = `
      <div class="modal">
        <div class="modal-title" style="color:var(--text)">👥 共有ユーザー設定</div>
        <div class="gcal-modal-sub">${esc(cal.name)}</div>
        <div class="gcal-share-list">
          ${cal.shared.length ? cal.shared.map(email => `
            <span class="gcal-share-tag">${esc(email)}<button type="button" data-rm="${esc(email)}" aria-label="共有を解除">×</button></span>`).join("")
            : `<div class="gcal-share-empty">まだ共有相手はいません。</div>`}
        </div>
        <div class="gcal-ev-form">
          <input type="email" class="gcal-ev-input" id="gcal-share-input" placeholder="共有相手のメールアドレス">
          <button type="button" class="gcal-ev-add-btn" id="gcal-share-add">追加</button>
        </div>
        <div class="gcal-share-note">※このカレンダーの共有相手をこの端末に登録するだけの簡易設定です。相手への招待通知や実際のデータ同期は行われません。</div>
        <button class="ghost" id="gcal-share-close" style="margin-top:12px">閉じる</button>
      </div>`;

    ov.querySelector("#gcal-share-close").onclick = close;
    ov.querySelectorAll("[data-rm]").forEach(btn => btn.onclick = () => {
      const s2 = loadGcalStore();
      const c2 = s2.calendars.find(c => c.id === calId);
      if(c2) c2.shared = c2.shared.filter(e => e !== btn.dataset.rm);
      saveGcalStore(s2);
      draw();
    });
    const input = ov.querySelector("#gcal-share-input");
    const submit = () => {
      const email = (input.value||"").trim();
      if(!email){ input.focus(); return; }
      const s2 = loadGcalStore();
      const c2 = s2.calendars.find(c => c.id === calId);
      if(c2 && !c2.shared.includes(email)) c2.shared.push(email);
      saveGcalStore(s2);
      draw();
    };
    ov.querySelector("#gcal-share-add").onclick = submit;
    input.onkeydown = (e) => { if(e.key === "Enter") submit(); };
  };

  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if(e.target === ov) close(); });
  draw();
}

// スイッチャー右端の＋ボタンから開く、表示カレンダーの新規追加ポップアップ
function openGcalAddCalendarModal(){
  const ov = document.createElement("div");
  ov.className = "modal-ov";
  const close = () => { try{ ov.remove(); }catch(e){} };
  let selectedColor = GCAL_COLORS[0];
  let nameValue = "";

  const draw = () => {
    ov.innerHTML = `
      <div class="modal">
        <div class="modal-title" style="color:var(--text)">📅 カレンダーを追加</div>
        <input type="text" class="gcal-ev-input gcal-newcal-input" id="gcal-newcal-name" placeholder="カレンダー名（例：家族の予定）" value="${esc(nameValue)}">
        <div class="gcal-color-row">
          ${GCAL_COLORS.map(c => `<button type="button" class="gcal-color-dot${c===selectedColor?" selected":""}" data-color="${c}" style="background:${c}" aria-label="この色を選択"></button>`).join("")}
        </div>
        <button class="cta" id="gcal-newcal-save">追加する</button>
        <button class="ghost" id="gcal-newcal-cancel" style="margin-top:8px">キャンセル</button>
      </div>`;
    const nameInput = ov.querySelector("#gcal-newcal-name");
    nameInput.oninput = () => { nameValue = nameInput.value; };
    nameInput.focus();
    ov.querySelectorAll("[data-color]").forEach(btn => btn.onclick = () => { selectedColor = btn.dataset.color; draw(); });
    ov.querySelector("#gcal-newcal-cancel").onclick = close;
    ov.querySelector("#gcal-newcal-save").onclick = () => {
      const name = (nameInput.value||"").trim();
      if(!name){ nameInput.focus(); return; }
      const store = loadGcalStore();
      const id = gcalGenId("c");
      store.calendars.push({ id, name, color: selectedColor, shared: [] });
      store.activeId = id;
      saveGcalStore(store);
      close();
      renderGcalMonthCard();
    };
  };

  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if(e.target === ov) close(); });
  draw();
}

// スイッチャーの✎ボタンから開く、Googleカレンダーの表示名をこのアプリ内
// だけ好きな名前に変更するポップアップ。Google側の実際のカレンダー名
// （プライマリカレンダーならGmailアドレス）は変更せず、表示だけを上書きする
function openGcalRenameCalendarModal(calId){
  const cal = (gcalGoogleCalendars || []).find(c => c.id === calId);
  if(!cal) return;
  const ov = document.createElement("div");
  ov.className = "modal-ov";
  const close = () => { try{ ov.remove(); }catch(e){} };

  ov.innerHTML = `
    <div class="modal">
      <div class="modal-title" style="color:var(--text)">✎ 表示名を変更</div>
      <div class="gcal-modal-sub">${esc(cal.name)}</div>
      <input type="text" class="gcal-ev-input gcal-newcal-input" id="gcal-rename-input" placeholder="表示名（例：自分の予定）" maxlength="40" value="${esc(cal.name)}">
      <button class="cta" id="gcal-rename-save">保存する</button>
      <button class="ghost" id="gcal-rename-cancel" style="margin-top:8px">キャンセル</button>
    </div>`;

  const input = ov.querySelector("#gcal-rename-input");
  ov.querySelector("#gcal-rename-cancel").onclick = close;
  ov.querySelector("#gcal-rename-save").onclick = () => {
    const name = (input.value||"").trim();
    if(!name){ input.focus(); return; }
    gcalSaveCalNameOverride(calId, name);
    cal.name = name;
    cal.renamed = true;
    close();
    renderGcalMonthCard();
  };

  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if(e.target === ov) close(); });
  input.focus();
  input.select();
}

export function renderSelect(){
  app.innerHTML = `
    ${weatherCardHTML()}
    ${gcalDayWidgetHTML()}
    ${homeLauncherCardHTML()}
    ${msCertLauncherHTML()}
    ${state.currentUser
      ? `<div class="acct-bar">👤 ${esc(state.currentUser.email||"ログイン中")}<button class="link2" data-logout>ログアウト</button></div>`
      : (state.guestMode ? `<div class="acct-bar">ゲストモード（この端末のみ・同期なし）<button class="link2" data-login>ログイン / 新規登録</button></div>` : "")}
  `;
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  const lo=app.querySelector("[data-logout]"); if(lo)lo.onclick=()=>logout();
  const li=app.querySelector("[data-login]"); if(li)li.onclick=()=>{ state.guestMode=false; state.authMode="login"; render(); };
  loadWeatherCard();
  renderGcalDailyWidget();
  window.scrollTo(0,0);
}

// 「カレンダー」メニューボタンから遷移する専用画面。ニュース画面と同じ
// q-head（← ホーム＋タイトル）の構成に統一し、Google連携の設定と
// 1ヶ月フル表示のカレンダー管理をここに集約する
export function renderCalendarScreen(){
  app.innerHTML = `
    <div class="q-head"><button class="quit" data-go="select">← ホーム</button><span class="q-count">📅 カレンダー</span></div>
    ${gcalMonthCardHTML()}
  `;
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  renderGcalMonthCard();
  window.scrollTo(0,0);
}

// 予定管理カードから遷移するプレースホルダー画面（機能は未実装、今は空のまま）
export function renderSchedule(){
  app.innerHTML = `
    <div class="q-head"><button class="quit" data-go="select">← ホーム</button><span class="q-count">予定管理</span></div>
    <div class="sel-sub" style="margin-top:24px;text-align:center;">この機能は近日公開予定です。</div>
  `;
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  window.scrollTo(0,0);
}

/* =========================================================================
   ニュース画面（日本経済・世界経済）共通ロジック
   - 上部：今月のミニカレンダー。日付をタップすると選択日が切り替わる
   - 中央：選択中の日付に紐づくニュースをタイトルのみで縦並びに表示。
     URLが登録されている項目はカード（または右の矢印）をタップすると
     新しいタブへ安全に開く（target="_blank" + rel="noopener noreferrer"）
   - 管理者（isAdminAccount()）の場合のみ、各カード左側に削除選択用の
     チェックボックスと「選択したニュースを削除」ボタン、および
     「タイトル入力欄」「URL入力欄」「登録ボタン」の3点構成の登録フォーム
     を表示。タイトルとURLを別々のフィールドで受け取ることで、1件の
     登録操作でタイトルとURLが正しく1つのニュース項目として保存される
   日付ごとのニュースはこの端末のlocalStorageに保存する（他ユーザーへの
   共有は行わない、この端末限定の簡易実装）。日本経済・世界経済は同一の
   カレンダー／一覧／管理フォーム／削除ロジックをcreateNewsScreen()で共有し、
   保存先のキーと画面ラベルだけが異なる
   ========================================================================= */

const NEWS_WEEKDAYS = ["日","月","火","水","木","金","土"];

function newsDateKey(y, m, d){ return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }

// 一覧の各ニュースをチェックボックス選択・削除対象として区別するための
// 端末内限定の一意なID（サーバー同期はしないためシンプルな乱数で十分）
function newsGenId(){
  return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function newsCalendarHTML(y, m, selectedDay, hasNewsSet, todayKey){
  const first = new Date(y, m, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const cells = [];
  for(let i=0;i<startWeekday;i++) cells.push(`<span class="njp-cal-cell empty"></span>`);
  for(let d=1; d<=daysInMonth; d++){
    const key = newsDateKey(y, m, d);
    const cls = ["njp-cal-cell"];
    if(d===selectedDay) cls.push("selected");
    if(key===todayKey) cls.push("today");
    if(hasNewsSet.has(key)) cls.push("has-news");
    cells.push(`<button type="button" class="${cls.join(" ")}" data-day="${d}">${d}</button>`);
  }
  return `
    <div class="njp-cal">
      <div class="njp-cal-title">${y}年${m+1}月</div>
      <div class="njp-cal-grid njp-cal-weekdays">${NEWS_WEEKDAYS.map(w=>`<span>${w}</span>`).join("")}</div>
      <div class="njp-cal-grid">${cells.join("")}</div>
    </div>`;
}

// タイトルのみを表示し、URLが登録されている項目はカード全体がリンクになる
// （URL文字列そのものは画面に出さない）。管理者の場合のみ、削除選択用の
// チェックボックスをカード左側に添える（selectedIdsは選択中のnews.idの集合）
function newsListHTML(items, admin, selectedIds){
  if(!items || !items.length){
    return `<div class="njp-empty">この日のニュースはまだ登録されていません。</div>`;
  }
  return `<div class="njp-news-list">${items.map(n => {
    const hasUrl = /^https?:\/\//.test(n.url||"");
    const tag = hasUrl ? "a" : "div";
    const attrs = hasUrl ? `href="${esc(n.url)}" target="_blank" rel="noopener noreferrer"` : "";
    const link = `<${tag} class="njp-news-link"${attrs?" "+attrs:""}>
      <span class="njp-news-title">${esc(n.title)}</span>
      ${hasUrl?'<span class="njp-news-arrow">→</span>':""}
    </${tag}>`;
    const checkbox = admin
      ? `<input type="checkbox" class="njp-news-check" data-id="${esc(n.id)}" aria-label="削除対象として選択"${selectedIds&&selectedIds.has(n.id)?" checked":""}>`
      : "";
    return `<div class="njp-news-item${hasUrl?" has-link":""}">${checkbox}${link}</div>`;
  }).join("")}</div>`;
}

function newsAdminFormHTML(){
  return `
    <div class="njp-admin">
      <div class="njp-admin-title">🛠️ 管理者専用：ニュース登録</div>
      <input type="text" class="njp-admin-input" id="njp-admin-title" placeholder="ニュースのタイトルを入力">
      <input type="url" class="njp-admin-input" id="njp-admin-url" placeholder="リンク先のURLを入力">
      <button type="button" class="njp-admin-btn" id="njp-admin-submit">ニュースを登録</button>
    </div>`;
}

function newsBulkDeleteHTML(){
  return `
    <div class="njp-bulk-row">
      <button type="button" class="njp-bulk-btn" id="njp-bulk-delete" disabled>選択したニュースを削除</button>
    </div>`;
}

// 日本経済・世界経済の両画面が使う共通ロジックを1箇所にまとめたファクトリー。
// storeKeyとlabel/iconだけを差し替えれば同じ挙動の画面を量産できる
function createNewsScreen({ storeKey, label, icon, seedFn, marketWatch }){
  // 画面を離れても選択中の日付を覚えておく（再訪時は前回の続きから）。
  // 未選択（初回訪問）の場合のみ「今日」を初期値にする
  let selected = null;
  // 削除対象としてチェックボックスで選択中のnews.idの集合。日付を切り替えた
  // ときや削除実行後にはリセットする（別の日の選択が残らないように）
  let selectedIds = new Set();

  function loadStore(){
    let store = {};
    try{ store = JSON.parse(localStorage.getItem(storeKey) || "{}"); }catch(e){}
    if(seedFn){
      const seed = seedFn();
      if(!store[seed.key]) store[seed.key] = seed.items;
    }
    // 旧バージョンで保存された（idを持たない）ニュースにも削除機能が
    // 使えるよう、idが無い項目には初回読み込み時に一度だけ払い出す
    let migrated = false;
    Object.keys(store).forEach(k=>{
      (store[k]||[]).forEach(n=>{
        if(!n.id){ n.id = newsGenId(); migrated = true; }
      });
    });
    if(migrated) saveStore(store);
    return store;
  }

  function saveStore(store){
    try{ localStorage.setItem(storeKey, JSON.stringify(store)); }catch(e){}
  }

  function render(){
    const now = new Date();
    if(!selected) selected = { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
    const { y, m, d } = selected;
    const store = loadStore();
    const selKey = newsDateKey(y, m, d);
    const items = store[selKey] || [];
    const hasNewsSet = new Set(Object.keys(store).filter(k => (store[k]||[]).length));
    const todayKey = newsDateKey(now.getFullYear(), now.getMonth(), now.getDate());
    const admin = isAdminAccount();

    // その日のニュースに存在しないidの選択は持ち越さない（削除済み・日付
    // 切り替え後の残留選択を防ぐ）
    const validIds = new Set(items.map(n=>n.id));
    Array.from(selectedIds).forEach(id=>{ if(!validIds.has(id)) selectedIds.delete(id); });

    app.innerHTML = `
      ${marketWatch ? marketWatch.html() : ""}
      <div class="q-head"><button class="quit" data-go="select">← ホーム</button><span class="q-count">${icon} ${label}</span></div>
      ${newsCalendarHTML(y, m, d, hasNewsSet, todayKey)}
      <div class="section-lab" style="margin-top:16px">${m+1}月${d}日のニュース</div>
      <div id="njp-news-area">${newsListHTML(items, admin, selectedIds)}</div>
      ${admin ? newsBulkDeleteHTML() : ""}
      ${admin ? newsAdminFormHTML() : ""}
    `;
    app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
    app.querySelectorAll("[data-day]").forEach(b=>b.onclick=()=>{
      selected = { y, m, d: parseInt(b.dataset.day, 10) };
      selectedIds = new Set();
      render();
    });

    if(admin){
      const bulkBtn = document.getElementById("njp-bulk-delete");
      const syncBulkBtn = () => {
        if(bulkBtn) bulkBtn.disabled = !(items.length > 0 && selectedIds.size > 0);
      };
      syncBulkBtn();

      app.querySelectorAll(".njp-news-check").forEach(cb=>{
        cb.onchange = () => {
          const id = cb.dataset.id;
          if(cb.checked) selectedIds.add(id); else selectedIds.delete(id);
          syncBulkBtn();
        };
      });

      if(bulkBtn) bulkBtn.onclick = () => {
        if(bulkBtn.disabled || !selectedIds.size) return;
        const freshStore = loadStore();
        freshStore[selKey] = (freshStore[selKey] || []).filter(n => !selectedIds.has(n.id));
        saveStore(freshStore);
        selectedIds = new Set();
        render();
      };

      const submitBtn = document.getElementById("njp-admin-submit");
      if(submitBtn) submitBtn.onclick = () => {
        const titleInput = document.getElementById("njp-admin-title");
        const urlInput = document.getElementById("njp-admin-url");
        const title = (titleInput.value||"").trim();
        const url = (urlInput.value||"").trim();
        if(!title){ titleInput.focus(); return; }
        if(url && !/^https?:\/\//.test(url)){
          alert("URLは http:// または https:// から始まる形式で入力してください（省略も可）。");
          urlInput.focus();
          return;
        }
        const freshStore = loadStore();
        if(!freshStore[selKey]) freshStore[selKey] = [];
        freshStore[selKey].push({ id: newsGenId(), title, url });
        saveStore(freshStore);
        titleInput.value = "";
        urlInput.value = "";
        render();
      };
    }
    if(marketWatch) marketWatch.mount();
    window.scrollTo(0,0);
  }

  return render;
}

// 今日の日付にあらかじめ登録しておく日本経済のモックニュース3件
function newsJapanSeed(){
  const now = new Date();
  const key = newsDateKey(now.getFullYear(), now.getMonth(), now.getDate());
  return { key, items: [
    { id:"jp-seed-1", title:"【日本経済】日銀の追加利上げ観測でメガバンク株急騰、円高シフトへの警戒も", url:"https://newspicks.com/theme-news/1131/" },
    { id:"jp-seed-2", title:"【米国経済】米雇用統計が予想超えの堅調、FRBによる利下げ時期予測が後退か", url:"https://newspicks.com/theme-news/54/" },
    { id:"jp-seed-3", title:"【日本経済】東証のPBR1倍割れ是正勧告から2年、企業の「稼ぐ力」の現在地", url:"https://newspicks.com/news/10178940" },
  ]};
}

export const renderNewsJapan = createNewsScreen({
  storeKey: "news_japan_store_v1",
  label: "日本経済",
  icon: "🇯🇵",
  seedFn: newsJapanSeed,
  marketWatch: jpMarketWatch,
});

export const renderNewsWorld = createNewsScreen({
  storeKey: "news_world_store_v1",
  label: "世界経済",
  icon: "🌐",
  marketWatch: worldMarketWatch,
});

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
    // 管理者アカウントはpublishLeaderboard側で書き込み自体を止めているが、
    // それ以前に登録された古いデータが残っている場合に備えて表示側でも
    // 念のため除外する（表示名一致による二重防御）
    const rows = (await window.LB.top(50)).filter(r => (r.displayName||"").trim().toLowerCase() !== "admin");
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
