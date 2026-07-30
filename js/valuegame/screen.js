/* =========================================================================
   🃏 チャッピーの価値観ゲーム：画面（S.screen === "valuegame"）

   ito形式の協力カードゲーム。1〜100の数字を直接言わず、お題に沿った
   言葉で表現して、全員で小さい順に並べる。

   このファイルの責務：画面の組み立てと操作の配線。
   ・ルール計算 … engine.js
   ・AIの回答   … ai.js
   ・進行状態   … solo.js（1人用）／ online.js（オンライン）
   ・戦績       … store.js
   ・BP付与     … reward.js（サーバー判定）

   render()はアプリ全体の状態が変わるたびに呼ばれるため、ゲーム中に
   毎回フルでDOMを作り直すと入力中の文字や並べ替え途中の状態が壊れる。
   そのため「現在マウント済みのビュー」を記憶し、同じビューへの再描画
   要求はスキップする（実際の更新はこのモジュール自身の操作から行う）。
   ========================================================================= */
import { app, go } from '../render.js';
import { state } from '../state.js';
import {
  VG_DIFFICULTIES, VG_MAX_PLAYERS, VG_MAX_ROUNDS, VG_MIN_PLAYERS,
  VG_REACTIONS, VG_RESULT_LINES, VG_RULES, VG_STAMPS, vgDifficulty,
} from './config.js';
import {
  vgClearSession, vgCurrentTopic, vgMoveCard, vgMyNumber, vgNextRound,
  vgRestoreSession, vgRevealRound, vgStartSolo, vgSubmitMyAnswer, vgTimeUp,
} from './solo.js';
import { vgGapComment } from './engine.js';
import {
  valueGameHandleIdentityChange as storeIdentityChange,
  vgFavoriteTopic, vgHistory, vgIsFirstWinToday, vgRecordGame, vgStats, vgTitleState,
} from './store.js';
import { vgClaimRewards } from './reward.js';
import { vgTopicById } from '../data/valuegame-topics.js';
import { bpTodayKey } from '../bp/store.js';
import {
  vgOnlineState, vgOnlineInit, vgOnlineCreateRoom, vgOnlineJoinByCode, vgOnlineJoinRoom,
  vgOnlineLeave, vgOnlineSetReady, vgOnlineStart, vgOnlineSubmitAnswer,
  vgOnlineVoteOrder, vgOnlineNextRound, vgOnlineSendChat, vgOnlineSendReaction,
  vgOnlineListPublicRooms, vgOnlineRestore, vgOnlineShareUrl, vgOnlineSubscribe,
  vgOnlineMyNumber, vgOnlineFetchMyNumber, vgOnlineReveal, vgOnlineTallyVotes,
  vgOnlinePendingInvite, vgOnlineClearInvite,
} from './online.js';

/* ---- 表示中のビュー（このモジュール内で保持する） ---- */
let view = "lobby";   // lobby | rules | solo-setup | game | result | records | online-*
let mountedKey = null;

let session = null;       // 1人用の進行状態（solo.js）
let finalResult = null;   // 結果画面に出す内容
let timerHandle = null;
let timeLeft = 0;

function esc(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

export function valueGameHandleIdentityChange(){
  const changed = storeIdentityChange();
  if(changed){
    // ユーザーが切り替わったら、前の人のゲームを引き継がない
    session = null;
    finalResult = null;
    view = "lobby";
    mountedKey = null;
    stopTimer();
  }
  return changed;
}

/* =========================================================================
   画面の入口
   ========================================================================= */
export function renderValueGameScreen(){
  const key = viewKey();
  if(mountedKey === key && app.querySelector(".vg-root")) return;  // 同じビューの再描画は無視
  mountedKey = key;
  paint();
}

function viewKey(){
  return `${view}:${session ? session.gameId + ":" + session.round + ":" + session.phase : "-"}:${vgOnlineState().roomId || "-"}`;
}

// 強制的に描き直す（このモジュール自身の操作から呼ぶ）
function repaint(){
  mountedKey = viewKey();
  paint();
}

function paint(){
  if(view === "rules") return paintRules();
  if(view === "solo-setup") return paintSoloSetup();
  if(view === "game") return paintGame();
  if(view === "result") return paintResult();
  if(view === "records") return paintRecords();
  if(view === "online-create") return paintOnlineCreate();
  if(view === "online-join") return paintOnlineJoin();
  if(view === "online-lobby") return paintOnlineLobby();
  if(view === "online-game") return paintOnlineGame();
  return paintLobby();
}

function switchView(next){
  view = next;
  repaint();
  window.scrollTo(0, 0);
}

/* =========================================================================
   共通パーツ
   ========================================================================= */
function headHTML(title, backTo){
  return `
    <div class="vg-head">
      <button type="button" class="vg-back" data-vg-back="${esc(backTo || "")}">‹ 戻る</button>
      <h2 class="vg-title">${esc(title)}</h2>
    </div>`;
}

function wireBack(){
  app.querySelectorAll("[data-vg-back]").forEach(b => b.onclick = () => {
    const to = b.dataset.vgBack;
    if(!to){ go("select"); return; }
    switchView(to);
  });
}

/* =========================================================================
   ロビー（入口）
   ========================================================================= */
function paintLobby(){
  const st = vgStats();
  const resume = vgRestoreSession();
  const onlineResume = vgOnlineRestore();
  app.innerHTML = `
    <div class="vg-root">
      <div class="vg-head">
        <button type="button" class="vg-back" data-vg-back="">‹ 戻る</button>
        <h2 class="vg-title">チャッピーの価値観ゲーム</h2>
      </div>
      <div class="vg-lead">
        <div class="vg-lead-badge">ito形式の協力カードゲーム</div>
        <p class="vg-lead-text">1〜100の数字が1枚ずつ配られます。数字は直接言わず、お題に沿った言葉で表現して、みんなで小さい順に並べましょう。</p>
      </div>

      ${resume ? `
        <button type="button" class="vg-resume" id="vg-resume">
          <span class="vg-resume-title">中断したゲームがあります</span>
          <span class="vg-resume-sub">1人用・ラウンド ${resume.round} / ${resume.rounds}　続きから遊ぶ ›</span>
        </button>` : ""}
      ${onlineResume ? `
        <button type="button" class="vg-resume" id="vg-online-resume">
          <span class="vg-resume-title">参加中のルームがあります</span>
          <span class="vg-resume-sub">ルームコード ${esc(onlineResume.code || "")}　復帰する ›</span>
        </button>` : ""}

      <div class="vg-menu">
        <button type="button" class="vg-menu-btn vg-menu-btn--primary" id="vg-go-solo">
          <span class="vg-menu-icon" aria-hidden="true">🐾</span>
          <span class="vg-menu-main">
            <span class="vg-menu-title">1人であそぶ（練習）</span>
            <span class="vg-menu-sub">チャッピーがAIプレイヤーとして参加します</span>
          </span>
          <span class="vg-menu-arrow">›</span>
        </button>
        <button type="button" class="vg-menu-btn" id="vg-go-create">
          <span class="vg-menu-icon" aria-hidden="true">🏠</span>
          <span class="vg-menu-main">
            <span class="vg-menu-title">ルームを作る</span>
            <span class="vg-menu-sub">2〜${VG_MAX_PLAYERS}人・合言葉や公開設定を選べます</span>
          </span>
          <span class="vg-menu-arrow">›</span>
        </button>
        <button type="button" class="vg-menu-btn" id="vg-go-join">
          <span class="vg-menu-icon" aria-hidden="true">🔑</span>
          <span class="vg-menu-main">
            <span class="vg-menu-title">ルームに参加する</span>
            <span class="vg-menu-sub">ルームコード・公開ルーム一覧から参加</span>
          </span>
          <span class="vg-menu-arrow">›</span>
        </button>
        <button type="button" class="vg-menu-btn" id="vg-go-rules">
          <span class="vg-menu-icon" aria-hidden="true">📋</span>
          <span class="vg-menu-main">
            <span class="vg-menu-title">あそび方とルール</span>
            <span class="vg-menu-sub">禁止表現もここで確認できます</span>
          </span>
          <span class="vg-menu-arrow">›</span>
        </button>
        <button type="button" class="vg-menu-btn" id="vg-go-records">
          <span class="vg-menu-icon" aria-hidden="true">🏅</span>
          <span class="vg-menu-main">
            <span class="vg-menu-title">戦績と称号</span>
            <span class="vg-menu-sub">${st.plays}回プレイ／${st.wins}回成功</span>
          </span>
          <span class="vg-menu-arrow">›</span>
        </button>
      </div>
    </div>`;

  wireBack();
  document.getElementById("vg-go-solo").onclick = () => switchView("solo-setup");
  document.getElementById("vg-go-create").onclick = () => switchView("online-create");
  document.getElementById("vg-go-join").onclick = () => switchView("online-join");
  document.getElementById("vg-go-rules").onclick = () => switchView("rules");
  document.getElementById("vg-go-records").onclick = () => switchView("records");
  const r = document.getElementById("vg-resume");
  if(r) r.onclick = () => { session = resume; switchView("game"); };
  const orz = document.getElementById("vg-online-resume");
  if(orz) orz.onclick = async () => {
    await vgOnlineSubscribe(onlineResume.roomId, onOnlineUpdate);
    switchView("online-lobby");
  };

  // 招待URL（?vgroom=CODE）から開かれた場合は、参加画面へコードを入れて進む
  const invite = vgOnlinePendingInvite();
  if(invite){
    vgOnlineClearInvite();
    joinCode = invite;
    switchView("online-join");
  }
}

/* =========================================================================
   ルール画面
   ========================================================================= */
function paintRules(){
  app.innerHTML = `
    <div class="vg-root">
      ${headHTML("あそび方とルール", "lobby")}
      <div class="vg-card">
        <div class="vg-card-title">ゲームの流れ</div>
        <ol class="vg-flow">
          ${VG_RULES.flow.map(t => `<li>${esc(t)}</li>`).join("")}
        </ol>
      </div>
      <div class="vg-card vg-card--warn">
        <div class="vg-card-title">言ってはいけない表現</div>
        <ul class="vg-forbidden">
          ${VG_RULES.forbidden.map(t => `<li>${esc(t)}</li>`).join("")}
        </ul>
        <p class="vg-note">${esc(VG_RULES.note)}</p>
      </div>
      <div class="vg-card">
        <div class="vg-card-title">難易度</div>
        ${VG_DIFFICULTIES.map(d => `
          <div class="vg-diff-row">
            <span class="vg-diff-icon" aria-hidden="true">${d.icon}</span>
            <span class="vg-diff-main">
              <span class="vg-diff-name">${esc(d.name)}</span>
              <span class="vg-diff-desc">${esc(d.desc)}</span>
            </span>
          </div>`).join("")}
      </div>
    </div>`;
  wireBack();
}

/* =========================================================================
   1人用モードの設定
   ========================================================================= */
let soloSetup = { aiCount: 2, difficulty: "easy", rounds: 3 };

function paintSoloSetup(){
  app.innerHTML = `
    <div class="vg-root">
      ${headHTML("1人であそぶ", "lobby")}
      <div class="vg-card">
        <div class="vg-card-title">チャッピーの人数</div>
        <div class="vg-chiprow">
          ${[1, 2, 3, 4].map(n => `
            <button type="button" class="vg-chip${soloSetup.aiCount === n ? " active" : ""}" data-ai="${n}">${n}人</button>`).join("")}
        </div>
        <p class="vg-note">あなたとチャッピーの合計人数ぶんのカードが配られます。</p>
      </div>
      <div class="vg-card">
        <div class="vg-card-title">難易度</div>
        ${VG_DIFFICULTIES.map(d => `
          <button type="button" class="vg-diff-pick${soloSetup.difficulty === d.key ? " active" : ""}" data-diff="${esc(d.key)}">
            <span class="vg-diff-icon" aria-hidden="true">${d.icon}</span>
            <span class="vg-diff-main">
              <span class="vg-diff-name">${esc(d.name)}</span>
              <span class="vg-diff-desc">${esc(d.desc)}</span>
            </span>
          </button>`).join("")}
      </div>
      <div class="vg-card">
        <div class="vg-card-title">ラウンド数</div>
        <div class="vg-chiprow">
          ${[1, 2, 3, 4, 5].slice(0, VG_MAX_ROUNDS).map(n => `
            <button type="button" class="vg-chip${soloSetup.rounds === n ? " active" : ""}" data-rounds="${n}">${n}</button>`).join("")}
        </div>
      </div>
      <button type="button" class="vg-primary" id="vg-solo-start">この設定ではじめる</button>
      <button type="button" class="vg-secondary" id="vg-solo-rules">先にルールを読む</button>
    </div>`;

  wireBack();
  app.querySelectorAll("[data-ai]").forEach(b => b.onclick = () => { soloSetup.aiCount = Number(b.dataset.ai); repaint(); });
  app.querySelectorAll("[data-diff]").forEach(b => b.onclick = () => { soloSetup.difficulty = b.dataset.diff; repaint(); });
  app.querySelectorAll("[data-rounds]").forEach(b => b.onclick = () => { soloSetup.rounds = Number(b.dataset.rounds); repaint(); });
  document.getElementById("vg-solo-rules").onclick = () => switchView("rules");
  document.getElementById("vg-solo-start").onclick = () => {
    session = vgStartSolo({ ...soloSetup, playerName: myName() });
    finalResult = null;
    switchView("game");
  };
}

function myName(){
  try{ return localStorage.getItem("profile_name") || "あなた"; }catch(e){ return "あなた"; }
}

/* =========================================================================
   ゲーム画面
   ========================================================================= */
function paintGame(){
  const s = session;
  if(!s){ switchView("lobby"); return; }
  if(s.phase === "gameover"){ finishGame(); return; }
  const topic = vgCurrentTopic(s);
  const diff = vgDifficulty(s.difficulty);

  app.innerHTML = `
    <div class="vg-root vg-game">
      <div class="vg-status">
        <span class="vg-status-item">R <b>${s.round}</b>/${s.rounds}</span>
        <span class="vg-status-item vg-lives" aria-label="残りライフ">${livesHTML(s)}</span>
        <span class="vg-status-item" id="vg-timer">${s.timeLimit ? "…" : "時間 なし"}</span>
        <span class="vg-status-item">👥 ${s.players.length}</span>
        <button type="button" class="vg-status-rules" id="vg-rules-btn" aria-label="ルールを確認">?</button>
      </div>

      <div class="vg-topic">
        <div class="vg-topic-title">${esc(topic ? topic.title : "")}</div>
        <div class="vg-topic-scale">
          <span class="vg-scale-low"><b>1</b>：${esc(topic ? topic.low : "")}</span>
          <span class="vg-scale-high"><b>100</b>：${esc(topic ? topic.high : "")}</span>
        </div>
        ${topic && topic.hint ? `<div class="vg-topic-hint">${esc(topic.hint)}</div>` : ""}
      </div>

      <div class="vg-center" id="vg-center">
        ${s.phase === "answer" ? answerPhaseHTML(s) : s.phase === "order" ? orderPhaseHTML(s) : revealPhaseHTML(s)}
      </div>

      ${s.phase === "reveal" ? "" : `
        <div class="vg-bottom">
          <div class="vg-bottom-row">
            <button type="button" class="vg-peek" id="vg-peek" aria-label="自分の数字を確認（押している間だけ表示）">
              <span class="vg-peek-label">長押しで数字を見る</span>
              <span class="vg-peek-value" id="vg-peek-value" aria-hidden="true">— —</span>
            </button>
          </div>
          ${s.phase === "answer" ? `
            <div class="vg-bottom-row">
              <input type="text" class="vg-answer-input" id="vg-answer" maxlength="40"
                     placeholder="お題に沿った言葉で表現する" autocomplete="off"
                     value="${esc(s.answers.me || "")}">
              <button type="button" class="vg-confirm" id="vg-submit">確定</button>
            </div>` : `
            <div class="vg-bottom-row">
              <button type="button" class="vg-confirm vg-confirm--wide" id="vg-reveal">この並びで数字を公開する</button>
            </div>`}
          <div class="vg-bottom-row vg-bottom-tools">
            <button type="button" class="vg-tool" id="vg-chat-btn">💬 チャット</button>
            <button type="button" class="vg-tool" id="vg-react-btn">😊 リアクション</button>
          </div>
        </div>`}
    </div>`;

  wireGame(s, diff);
}

function livesHTML(s){
  let out = "";
  for(let i = 0; i < s.maxLives; i++){
    out += `<span class="vg-life${i < s.lives ? "" : " lost"}" aria-hidden="true">♥</span>`;
  }
  return `${out}<span class="vg-life-count">${s.lives}</span>`;
}

function answerPhaseHTML(s){
  const answered = s.players.filter(p => s.answers[p.id]).length;
  return `
    <div class="vg-phase-label">回答フェーズ　${answered} / ${s.players.length} 人が確定</div>
    <div class="vg-answer-list">
      ${s.players.map(p => `
        <div class="vg-answer-card${s.answers[p.id] ? " done" : ""}">
          <span class="vg-avatar" aria-hidden="true">${esc(p.icon || "🙂")}</span>
          <span class="vg-answer-main">
            <span class="vg-answer-name">${esc(p.name)}${p.isAI ? `<span class="vg-tag">AI</span>` : ""}</span>
            <span class="vg-answer-text">${s.answers[p.id] ? esc(s.answers[p.id]) : "考え中…"}</span>
          </span>
          <span class="vg-answer-state">${s.answers[p.id] ? "確定" : "未確定"}</span>
        </div>`).join("")}
    </div>
    <p class="vg-note">自分の数字を直接言わず、その大きさが伝わる言葉で表現してください。数字・範囲・順位・数式・単位の置き換えはルール違反です。</p>`;
}

function orderPhaseHTML(s){
  return `
    <div class="vg-phase-label">並べ替えフェーズ　小さいと思う順に上から並べてください</div>
    ${s.reactions.length ? `
      <div class="vg-reaction">
        <span class="vg-reaction-face" aria-hidden="true">${esc(s.reactions[0].face)}</span>
        <span class="vg-reaction-text">${esc(s.reactions[0].name)}：${esc(s.reactions[0].text)}</span>
      </div>` : ""}
    <div class="vg-order" id="vg-order">
      ${s.order.map((pid, i) => {
        const p = s.players.find(x => x.id === pid) || {};
        return `
          <div class="vg-order-card" data-pid="${esc(pid)}" data-index="${i}">
            <span class="vg-order-rank">${i + 1}</span>
            <span class="vg-avatar" aria-hidden="true">${esc(p.icon || "🙂")}</span>
            <span class="vg-order-main">
              <span class="vg-order-name">${esc(p.name)}${p.isAI ? `<span class="vg-tag">AI</span>` : ""}</span>
              <span class="vg-order-answer">${esc(s.answers[pid] || "")}</span>
            </span>
            <span class="vg-order-moves">
              <button type="button" class="vg-move" data-move-up="${i}" aria-label="ひとつ上へ"${i === 0 ? " disabled" : ""}>▲</button>
              <button type="button" class="vg-move" data-move-down="${i}" aria-label="ひとつ下へ"${i === s.order.length - 1 ? " disabled" : ""}>▼</button>
            </span>
            <span class="vg-order-grip" data-grip aria-hidden="true">⋮⋮</span>
          </div>`;
      }).join("")}
    </div>
    <p class="vg-note">カードは右端をつまんで動かすか、▲▼ボタンでも並べ替えられます。上が小さい数字です。</p>`;
}

function revealPhaseHTML(s){
  const r = s.lastResult;
  if(!r) return "";
  if(r.timeUp){
    return `
      <div class="vg-reveal">
        <div class="vg-reveal-head vg-reveal-head--fail">
          <div class="vg-reveal-title">時間切れ！</div>
          <div class="vg-reveal-body">次のラウンドで取り返そう。</div>
        </div>
        <button type="button" class="vg-primary" id="vg-next">次へ</button>
      </div>`;
  }
  return `
    <div class="vg-reveal">
      <div class="vg-reveal-head${r.ok ? "" : " vg-reveal-head--fail"}">
        <div class="vg-reveal-title">${esc(r.ok ? VG_RESULT_LINES.successTitle : VG_RESULT_LINES.failTitle)}</div>
        <div class="vg-reveal-body">${esc(r.ok ? VG_RESULT_LINES.successBody : VG_RESULT_LINES.failBody)}</div>
      </div>
      <div class="vg-reveal-list">
        ${r.rows.map((row, i) => `
          <div class="vg-reveal-row" style="animation-delay:${i * 140}ms">
            <span class="vg-reveal-number">${row.number}</span>
            <span class="vg-reveal-main">
              <span class="vg-reveal-name">${esc(row.name)}${row.isAI ? `<span class="vg-tag">AI</span>` : ""}</span>
              <span class="vg-reveal-answer">${esc(row.answer)}</span>
            </span>
            <span class="vg-reveal-ranks">
              <span class="vg-rank-lab">予想 ${row.guessRank}</span>
              <span class="vg-rank-lab${row.guessRank === row.trueRank ? " hit" : ""}">正解 ${row.trueRank}</span>
            </span>
          </div>`).join("")}
      </div>
      <div class="vg-gap">
        <div class="vg-gap-head">今回の価値観のズレ　<b>${r.gap}</b></div>
        <span class="vg-gap-bar"><span class="vg-gap-fill" style="width:${Math.min(100, r.gap)}%"></span></span>
        <div class="vg-gap-note">${esc(vgGapComment(r.gap))}</div>
      </div>
      <div class="vg-reveal-lives">残りライフ ${livesHTML(s)}</div>
      <button type="button" class="vg-primary" id="vg-next">${s.lives <= 0 || s.round >= s.rounds ? "結果を見る" : "次のラウンドへ"}</button>
    </div>`;
}

function wireGame(s, diff){
  document.getElementById("vg-rules-btn").onclick = () => openRulesSheet();

  // ---- 自分の数字：押している間だけ表示する ----
  const peek = document.getElementById("vg-peek");
  if(peek){
    const valEl = document.getElementById("vg-peek-value");
    const show = (e) => {
      e.preventDefault();
      valEl.textContent = String(vgMyNumber(s));
      peek.classList.add("peeking");
    };
    const hide = () => {
      valEl.textContent = "— —";
      peek.classList.remove("peeking");
    };
    // 画面共有・のぞき見対策として、指を離す・画面が隠れる・別要素へ
    // フォーカスが移る、のいずれでも必ず隠す
    peek.addEventListener("pointerdown", show);
    ["pointerup", "pointerleave", "pointercancel", "blur"].forEach(ev => peek.addEventListener(ev, hide));
    peek.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("visibilitychange", hide);
  }

  if(s.phase === "answer"){
    const input = document.getElementById("vg-answer");
    const submit = document.getElementById("vg-submit");
    const doSubmit = () => {
      if(submit.disabled) return;
      const text = (input.value || "").trim();
      if(!text){ input.focus(); return; }
      submit.disabled = true;   // 二重タップ・通信遅延での重複確定を防ぐ
      vgSubmitMyAnswer(s, text);
      stopTimer();
      repaint();
    };
    submit.onclick = doSubmit;
    input.onkeydown = (e) => { if(e.key === "Enter") doSubmit(); };
  }

  if(s.phase === "order"){
    wireOrder(s);
    const rev = document.getElementById("vg-reveal");
    rev.onclick = () => {
      if(rev.disabled) return;
      rev.disabled = true;
      vgRevealRound(s);
      stopTimer();
      repaint();
    };
  }

  if(s.phase === "reveal"){
    const next = document.getElementById("vg-next");
    if(next) next.onclick = () => {
      if(next.disabled) return;
      next.disabled = true;
      vgNextRound(s);
      if(s.phase === "gameover") finishGame();
      else { repaint(); startTimer(s, diff); }
    };
  }

  const chatBtn = document.getElementById("vg-chat-btn");
  if(chatBtn) chatBtn.onclick = () => openChatSheet(s);
  const reactBtn = document.getElementById("vg-react-btn");
  if(reactBtn) reactBtn.onclick = () => openReactionSheet(s);

  if(s.phase !== "reveal") startTimer(s, diff);
}

/* ---- 並べ替え：ドラッグ＆ドロップ＋▲▼ボタン ----
   スマートフォンでの確実性を優先し、ポインタイベントでの入れ替えと
   ボタン操作の両方を用意する（片手でも操作できるように） */
function wireOrder(s){
  app.querySelectorAll("[data-move-up]").forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    const i = Number(b.dataset.moveUp);
    vgMoveCard(s, i, i - 1);
    repaint();
  });
  app.querySelectorAll("[data-move-down]").forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    const i = Number(b.dataset.moveDown);
    vgMoveCard(s, i, i + 1);
    repaint();
  });

  const list = document.getElementById("vg-order");
  if(!list) return;
  let dragEl = null, dragFrom = -1, startY = 0, cardH = 0;

  list.querySelectorAll("[data-grip]").forEach(grip => {
    grip.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      dragEl = grip.closest(".vg-order-card");
      if(!dragEl) return;
      dragFrom = Number(dragEl.dataset.index);
      startY = e.clientY;
      cardH = dragEl.getBoundingClientRect().height + 8;
      dragEl.classList.add("dragging");
      grip.setPointerCapture(e.pointerId);
    });
    grip.addEventListener("pointermove", (e) => {
      if(!dragEl) return;
      e.preventDefault();
      const dy = e.clientY - startY;
      dragEl.style.transform = `translateY(${dy}px)`;
    });
    const endDrag = (e) => {
      if(!dragEl) return;
      const dy = e.clientY - startY;
      const shift = Math.round(dy / (cardH || 1));
      dragEl.style.transform = "";
      dragEl.classList.remove("dragging");
      dragEl = null;
      if(shift !== 0){
        vgMoveCard(s, dragFrom, dragFrom + shift);
        repaint();
      }
    };
    grip.addEventListener("pointerup", endDrag);
    grip.addEventListener("pointercancel", endDrag);
  });
}

/* ---- 制限時間 ---- */
function startTimer(s, diff){
  stopTimer();
  if(!s.timeLimit) return;
  const elapsed = Math.floor((Date.now() - (s.roundStartedAt || Date.now())) / 1000);
  timeLeft = Math.max(0, s.timeLimit - elapsed);
  const tick = () => {
    const el = document.getElementById("vg-timer");
    if(!el){ stopTimer(); return; }
    el.textContent = `⏱ ${timeLeft}s`;
    el.classList.toggle("vg-timer--warn", timeLeft <= 15);
    if(timeLeft <= 0){
      stopTimer();
      vgTimeUp(s);
      repaint();
      return;
    }
    timeLeft--;
  };
  tick();
  timerHandle = setInterval(tick, 1000);
}

function stopTimer(){
  if(timerHandle){ clearInterval(timerHandle); timerHandle = null; }
}

/* =========================================================================
   ゲーム終了 → 戦績の記録・BPの受け取り・結果画面
   ========================================================================= */
let finishing = false;

async function finishGame(){
  const s = session;
  if(!s || finishing) return;
  finishing = true;
  stopTimer();
  vgClearSession();

  const todayKey = bpTodayKey();
  const firstWinToday = s.success && vgIsFirstWinToday(todayKey);

  // BPの確定はサーバー側で行う（ゲームIDによる二重付与防止つき）。
  // 1ラウンドも回答していない＝開始直後に抜けた場合は参加報酬も付かない
  let rewards = { items: [], total: 0, source: "local" };
  try{
    rewards = await vgClaimRewards({
      gameId: s.gameId,
      mode: s.mode,
      difficulty: s.difficulty,
      rounds: s.rounds,
      clearedRounds: s.clearedRounds,
      answeredRounds: s.answeredRounds,
      success: s.success,
      perfect: s.success && s.perfect,
      livesLeft: s.lives,
      participated: s.answeredRounds > 0,
      finished: s.finished && s.answeredRounds > 0,
      firstWinToday,
      opponentIds: [],
    });
  }catch(e){ console.error("valuegame reward failed:", e); }

  const rec = vgRecordGame({
    gameId: s.gameId,
    mode: s.mode,
    difficulty: s.difficulty,
    rounds: s.rounds,
    clearedRounds: s.clearedRounds,
    success: s.success,
    perfect: s.success && s.perfect,
    livesLeft: s.lives,
    players: s.players,
    topics: s.usedTopicIds,
    myAnswers: s.myAnswers,
    bpGained: rewards.total,
    todayKey,
  });

  finalResult = {
    success: s.success,
    perfect: s.success && s.perfect,
    lives: s.lives,
    maxLives: s.maxLives,
    clearedRounds: s.clearedRounds,
    rounds: s.rounds,
    rewards,
    newTitles: rec.newTitles,
    lastRows: (s.lastResult && s.lastResult.rows) || [],
  };
  session = null;
  finishing = false;
  switchView("result");
}

function paintResult(){
  const r = finalResult;
  if(!r){ switchView("lobby"); return; }
  app.innerHTML = `
    <div class="vg-root">
      <div class="vg-result-hero${r.success ? " win" : ""}">
        <div class="vg-result-face" aria-hidden="true">${r.success ? "＼(^o^)／" : "(´･ω･`)"}</div>
        <div class="vg-result-title">${esc(r.success ? VG_RESULT_LINES.clearTitle : VG_RESULT_LINES.overTitle)}</div>
        <div class="vg-result-body">${esc(r.success ? VG_RESULT_LINES.clearBody : VG_RESULT_LINES.overBody)}</div>
      </div>

      <div class="vg-card">
        <div class="vg-card-title">今回の成績</div>
        <div class="vg-result-grid">
          <div class="vg-result-stat"><span class="vg-result-v">${r.clearedRounds}/${r.rounds}</span><span class="vg-result-l">成功ラウンド</span></div>
          <div class="vg-result-stat"><span class="vg-result-v">${r.lives}/${r.maxLives}</span><span class="vg-result-l">残りライフ</span></div>
          <div class="vg-result-stat"><span class="vg-result-v">${r.perfect ? "達成" : "―"}</span><span class="vg-result-l">パーフェクト</span></div>
        </div>
      </div>

      <div class="vg-card">
        <div class="vg-card-title">獲得BP<span class="vg-card-count">+${r.rewards.total} BP</span></div>
        ${r.rewards.items.length ? r.rewards.items.map(i => `
          <div class="vg-reward-row">
            <span class="vg-reward-label">${esc(i.label || i.reason)}</span>
            <span class="vg-reward-amount">+${Number(i.amount) || 0} BP</span>
          </div>`).join("") : `<div class="vg-note">今回はBPの獲得はありませんでした。</div>`}
        ${r.rewards.source === "local" ? `<p class="vg-note">オフライン判定のため、一部のボーナスは次回オンラインで反映されます。</p>` : ""}
        ${r.rewards.capped ? `<p class="vg-note">本日のゲームBPの上限に達しています。日付が変わるとまた獲得できます。</p>` : ""}
      </div>

      ${r.newTitles.length ? `
        <div class="vg-card vg-card--title">
          <div class="vg-card-title">称号を獲得しました</div>
          ${r.newTitles.map(t => `
            <div class="vg-title-row">
              <span class="vg-title-icon" aria-hidden="true">${t.icon}</span>
              <span class="vg-title-main">
                <span class="vg-title-name">${esc(t.name)}</span>
                <span class="vg-title-desc">${esc(t.desc)}</span>
              </span>
            </div>`).join("")}
        </div>` : ""}

      <button type="button" class="vg-primary" id="vg-again">もう一度あそぶ</button>
      <button type="button" class="vg-secondary" id="vg-to-lobby">ロビーへ戻る</button>
    </div>`;

  document.getElementById("vg-again").onclick = () => {
    session = vgStartSolo({ ...soloSetup, playerName: myName() });
    finalResult = null;
    switchView("game");
  };
  document.getElementById("vg-to-lobby").onclick = () => { finalResult = null; switchView("lobby"); };
}

/* =========================================================================
   戦績・称号
   ========================================================================= */
function paintRecords(){
  const st = vgStats();
  const titles = vgTitleState();
  const fav = vgFavoriteTopic();
  const favTopic = fav ? vgTopicById(fav.topicId) : null;
  const hist = vgHistory().slice(0, 20);

  app.innerHTML = `
    <div class="vg-root">
      ${headHTML("戦績と称号", "lobby")}
      <div class="vg-card">
        <div class="vg-card-title">これまでの記録</div>
        <div class="vg-stat-grid">
          <div class="vg-stat"><span class="vg-stat-v">${st.plays}</span><span class="vg-stat-l">プレイ回数</span></div>
          <div class="vg-stat"><span class="vg-stat-v">${st.wins}</span><span class="vg-stat-l">成功回数</span></div>
          <div class="vg-stat"><span class="vg-stat-v">${st.bestWinStreak}</span><span class="vg-stat-l">最高連続成功</span></div>
          <div class="vg-stat"><span class="vg-stat-v">${st.perfects}</span><span class="vg-stat-l">パーフェクト</span></div>
          <div class="vg-stat"><span class="vg-stat-v">${st.metUids.length}</span><span class="vg-stat-l">交流した人数</span></div>
          <div class="vg-stat"><span class="vg-stat-v">${st.bpEarned}</span><span class="vg-stat-l">獲得BP</span></div>
        </div>
        ${favTopic ? `<p class="vg-note">最も遊んだお題：${esc(favTopic.title)}（${fav.count}回）</p>` : ""}
      </div>

      <div class="vg-card">
        <div class="vg-card-title">称号<span class="vg-card-count">${titles.filter(t => t.done).length}/${titles.length}</span></div>
        ${titles.map(t => `
          <div class="vg-title-row${t.done ? " done" : ""}">
            <span class="vg-title-icon" aria-hidden="true">${t.done ? t.icon : "🔒"}</span>
            <span class="vg-title-main">
              <span class="vg-title-name">${esc(t.name)}</span>
              <span class="vg-title-desc">${esc(t.desc)}</span>
              <span class="vg-title-prog">${t.cur} / ${t.need}</span>
            </span>
          </div>`).join("")}
      </div>

      <div class="vg-card">
        <div class="vg-card-title">最近のゲーム</div>
        ${hist.length ? hist.map(h => `
          <div class="vg-hist-row">
            <span class="vg-hist-badge${h.success ? " win" : ""}">${h.success ? "成功" : "失敗"}</span>
            <span class="vg-hist-main">
              <span class="vg-hist-title">${h.mode === "solo" ? "1人用" : "オンライン"}・${esc(vgDifficulty(h.difficulty).name)}</span>
              <span class="vg-hist-sub">${h.clearedRounds}/${h.rounds}ラウンド　${h.players}人${h.perfect ? "　パーフェクト" : ""}</span>
            </span>
            <span class="vg-hist-bp">+${h.bpGained}</span>
          </div>`).join("") : `<div class="vg-note">まだ記録がありません。</div>`}
      </div>
    </div>`;
  wireBack();
}

/* =========================================================================
   ボトムシート（ルール確認・チャット・リアクション）
   #app の外に置くので、ゲーム画面を再描画しても閉じない。
   背景のタップ貫通は overlay 自身が受け止めることで防ぐ。
   ========================================================================= */
function openSheet(title, bodyHTML, opts){
  const ov = document.createElement("div");
  ov.className = "vg-sheet-ov";
  ov.innerHTML = `
    <div class="vg-sheet">
      <div class="vg-sheet-head">
        <span class="vg-sheet-title">${esc(title)}</span>
        <button type="button" class="vg-sheet-close" aria-label="閉じる">✕</button>
      </div>
      <div class="vg-sheet-body">${bodyHTML}</div>
    </div>`;
  document.body.appendChild(ov);
  const close = () => { try{ ov.remove(); }catch(e){} if(opts && opts.onClose) opts.onClose(); };
  ov.querySelector(".vg-sheet-close").onclick = close;
  // 背景（オーバーレイ自身）のタップだけで閉じる。シート内のタップは
  // ここまで伝わらないので、背後の画面へ貫通することもない
  ov.addEventListener("click", (e) => { if(e.target === ov) close(); });
  ov.addEventListener("touchmove", (e) => { if(e.target === ov) e.preventDefault(); }, { passive: false });
  requestAnimationFrame(() => ov.classList.add("show"));
  return { ov, close };
}

function openRulesSheet(){
  openSheet("あそび方とルール", `
    <div class="vg-card-title">ゲームの流れ</div>
    <ol class="vg-flow">${VG_RULES.flow.map(t => `<li>${esc(t)}</li>`).join("")}</ol>
    <div class="vg-card-title">言ってはいけない表現</div>
    <ul class="vg-forbidden">${VG_RULES.forbidden.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
    <p class="vg-note">${esc(VG_RULES.note)}</p>`);
}

/* ---- チャット（1人用はメモ、オンラインは全員へ送信） ---- */
let soloChat = [];

function openChatSheet(s){
  const online = vgOnlineState();
  const isOnline = !!online.roomId;
  const msgs = isOnline ? online.chat : soloChat;
  const { ov, close } = openSheet("チャット", `
    <div class="vg-chat-list" id="vg-chat-list">
      ${msgs.length ? msgs.map(m => `
        <div class="vg-chat-msg${m.mine ? " mine" : ""}">
          <span class="vg-chat-name">${esc(m.name)}</span>
          <span class="vg-chat-text">${esc(m.text)}</span>
        </div>`).join("") : `<div class="vg-note">${isOnline ? "まだメッセージがありません。" : "1人用モードでは、思いついたことをメモとして残せます。"}</div>`}
    </div>
    <div class="vg-chat-form">
      <input type="text" class="vg-answer-input" id="vg-chat-input" maxlength="60" placeholder="メッセージを入力" autocomplete="off">
      <button type="button" class="vg-confirm" id="vg-chat-send">送信</button>
    </div>`);

  const input = ov.querySelector("#vg-chat-input");
  const send = () => {
    const text = (input.value || "").trim();
    if(!text) return;
    input.value = "";
    if(isOnline) vgOnlineSendChat(text);
    else soloChat.push({ name: myName(), text, mine: true });
    close();
    openChatSheet(s);
  };
  ov.querySelector("#vg-chat-send").onclick = send;
  input.onkeydown = (e) => { if(e.key === "Enter") send(); };
}

function openReactionSheet(s){
  const { ov, close } = openSheet("リアクション", `
    <div class="vg-react-grid">
      ${VG_REACTIONS.map(r => `
        <button type="button" class="vg-react-btn" data-react="${esc(r.key)}">
          <span class="vg-react-icon" aria-hidden="true">${r.icon}</span>
          <span class="vg-react-label">${esc(r.label)}</span>
        </button>`).join("")}
    </div>
    <div class="vg-card-title">チャッピーのスタンプ</div>
    <div class="vg-stamp-grid">
      ${VG_STAMPS.map(st => `
        <button type="button" class="vg-stamp-btn" data-stamp="${esc(st.key)}">
          <span class="vg-stamp-face" aria-hidden="true">${esc(st.face)}</span>
          <span class="vg-stamp-label">${esc(st.label)}</span>
        </button>`).join("")}
    </div>`);

  ov.querySelectorAll("[data-react]").forEach(b => b.onclick = () => {
    const r = VG_REACTIONS.find(x => x.key === b.dataset.react);
    sendReaction(s, `${r.icon} ${r.label}`);
    close();
  });
  ov.querySelectorAll("[data-stamp]").forEach(b => b.onclick = () => {
    const st2 = VG_STAMPS.find(x => x.key === b.dataset.stamp);
    sendReaction(s, st2.face);
    close();
  });
}

function sendReaction(s, text){
  if(vgOnlineState().roomId){ vgOnlineSendReaction(text); return; }
  if(!s) return;
  s.reactions = [{ name: myName(), face: "", text }, ...(s.reactions || [])].slice(0, 3);
  repaint();
}

/* =========================================================================
   オンライン画面（ルーム作成・参加・待機）
   実際の通信は online.js が担当する
   ========================================================================= */
let roomForm = {
  name: "", isPublic: true, password: "", maxPlayers: 4,
  difficulty: "normal", rounds: 3, useTimeLimit: false,
  useVoice: false, allowSpectator: true, allowLateJoin: true,
};

function paintOnlineCreate(){
  app.innerHTML = `
    <div class="vg-root">
      ${headHTML("ルームを作る", "lobby")}
      ${loginNoticeHTML()}
      <div class="vg-card">
        <div class="vg-field">
          <label class="vg-label" for="vg-room-name">ルーム名</label>
          <input type="text" class="vg-answer-input" id="vg-room-name" maxlength="24" placeholder="たとえば「よるの価値観ルーム」" value="${esc(roomForm.name)}">
        </div>
        <div class="vg-field">
          <span class="vg-label">公開設定</span>
          <div class="vg-chiprow">
            <button type="button" class="vg-chip${roomForm.isPublic ? " active" : ""}" data-public="1">公開</button>
            <button type="button" class="vg-chip${roomForm.isPublic ? "" : " active"}" data-public="0">非公開</button>
          </div>
        </div>
        <div class="vg-field">
          <label class="vg-label" for="vg-room-pw">合言葉（任意）</label>
          <input type="text" class="vg-answer-input" id="vg-room-pw" maxlength="20" placeholder="設定すると入室時に必要になります" value="${esc(roomForm.password)}">
        </div>
        <div class="vg-field">
          <span class="vg-label">最大人数</span>
          <div class="vg-chiprow">
            ${[2, 3, 4, 5, 6, 8, 10].filter(n => n >= VG_MIN_PLAYERS && n <= VG_MAX_PLAYERS).map(n => `
              <button type="button" class="vg-chip${roomForm.maxPlayers === n ? " active" : ""}" data-max="${n}">${n}</button>`).join("")}
          </div>
        </div>
        <div class="vg-field">
          <span class="vg-label">難易度</span>
          <div class="vg-chiprow">
            ${VG_DIFFICULTIES.map(d => `
              <button type="button" class="vg-chip${roomForm.difficulty === d.key ? " active" : ""}" data-rdiff="${esc(d.key)}">${d.icon} ${esc(d.name)}</button>`).join("")}
          </div>
        </div>
        <div class="vg-field">
          <span class="vg-label">ラウンド数</span>
          <div class="vg-chiprow">
            ${[1, 2, 3, 4, 5].map(n => `
              <button type="button" class="vg-chip${roomForm.rounds === n ? " active" : ""}" data-rrounds="${n}">${n}</button>`).join("")}
          </div>
        </div>
        ${toggleHTML("useTimeLimit", "制限時間を使う", roomForm.useTimeLimit)}
        ${toggleHTML("useVoice", "ボイスチャットを使う", roomForm.useVoice)}
        ${toggleHTML("allowSpectator", "観戦を許可する", roomForm.allowSpectator)}
        ${toggleHTML("allowLateJoin", "途中参加を許可する", roomForm.allowLateJoin)}
      </div>
      <button type="button" class="vg-primary" id="vg-create">ルームを作成する</button>
      <div class="vg-error" id="vg-create-error" hidden></div>
    </div>`;

  wireBack();
  const nameEl = document.getElementById("vg-room-name");
  const pwEl = document.getElementById("vg-room-pw");
  nameEl.oninput = () => { roomForm.name = nameEl.value; };
  pwEl.oninput = () => { roomForm.password = pwEl.value; };
  app.querySelectorAll("[data-public]").forEach(b => b.onclick = () => { roomForm.isPublic = b.dataset.public === "1"; repaint(); });
  app.querySelectorAll("[data-max]").forEach(b => b.onclick = () => { roomForm.maxPlayers = Number(b.dataset.max); repaint(); });
  app.querySelectorAll("[data-rdiff]").forEach(b => b.onclick = () => { roomForm.difficulty = b.dataset.rdiff; repaint(); });
  app.querySelectorAll("[data-rrounds]").forEach(b => b.onclick = () => { roomForm.rounds = Number(b.dataset.rrounds); repaint(); });
  app.querySelectorAll("[data-toggle]").forEach(b => b.onclick = () => {
    roomForm[b.dataset.toggle] = !roomForm[b.dataset.toggle];
    repaint();
  });

  const createBtn = document.getElementById("vg-create");
  createBtn.onclick = async () => {
    if(createBtn.disabled) return;
    createBtn.disabled = true;
    createBtn.textContent = "作成中…";
    const res = await vgOnlineCreateRoom({ ...roomForm, hostName: myName() });
    if(!res.ok){
      showError("vg-create-error", res.message || "ルームを作成できませんでした。もう一度お試しください。");
      createBtn.disabled = false;
      createBtn.textContent = "ルームを作成する";
      return;
    }
    await vgOnlineSubscribe(res.roomId, onOnlineUpdate);
    switchView("online-lobby");
  };
}

function toggleHTML(key, label, on){
  return `
    <button type="button" class="vg-toggle" data-toggle="${esc(key)}" aria-pressed="${on ? "true" : "false"}">
      <span class="vg-toggle-label">${esc(label)}</span>
      <span class="vg-switch${on ? " on" : ""}"><span class="vg-switch-knob"></span></span>
    </button>`;
}

function loginNoticeHTML(){
  if(state.currentUser) return "";
  return `<div class="vg-notice">オンラインで遊ぶにはログインが必要です。1人用モードはログインなしでも遊べます。</div>`;
}

function showError(id, msg){
  const el = document.getElementById(id);
  if(!el) return;
  el.textContent = msg;
  el.hidden = false;
}

let joinCode = "";
let publicRooms = null;

function paintOnlineJoin(){
  app.innerHTML = `
    <div class="vg-root">
      ${headHTML("ルームに参加する", "lobby")}
      ${loginNoticeHTML()}
      <div class="vg-card">
        <div class="vg-card-title">ルームコードで参加</div>
        <div class="vg-join-form">
          <input type="text" class="vg-answer-input vg-code-input" id="vg-join-code" maxlength="6"
                 inputmode="latin" autocapitalize="characters" autocomplete="off"
                 placeholder="6桁のコード" value="${esc(joinCode)}">
          <button type="button" class="vg-confirm" id="vg-join-btn">参加</button>
        </div>
        <div class="vg-error" id="vg-join-error" hidden></div>
      </div>
      <div class="vg-card">
        <div class="vg-card-title">公開ルーム<button type="button" class="vg-mini-btn" id="vg-refresh-rooms">更新</button></div>
        <div id="vg-public-rooms">
          ${publicRooms === null ? `<div class="vg-note">読み込み中…</div>`
            : publicRooms.length ? publicRooms.map(r => `
              <button type="button" class="vg-room-row" data-room="${esc(r.id)}">
                <span class="vg-room-main">
                  <span class="vg-room-name">${esc(r.name || "名前のないルーム")}</span>
                  <span class="vg-room-sub">${esc(vgDifficulty(r.difficulty).name)}・${r.rounds}ラウンド${r.hasPassword ? "・合言葉あり" : ""}</span>
                </span>
                <span class="vg-room-count">${r.playerCount}/${r.maxPlayers}</span>
              </button>`).join("")
            : `<div class="vg-note">いま参加できる公開ルームはありません。</div>`}
        </div>
      </div>
    </div>`;

  wireBack();
  const codeEl = document.getElementById("vg-join-code");
  codeEl.oninput = () => { joinCode = codeEl.value.toUpperCase(); codeEl.value = joinCode; };
  const joinBtn = document.getElementById("vg-join-btn");
  joinBtn.onclick = () => tryJoin(joinBtn, (pw) => vgOnlineJoinByCode(joinCode, myName(), pw));
  document.getElementById("vg-refresh-rooms").onclick = () => loadPublicRooms();
  app.querySelectorAll("[data-room]").forEach(b => b.onclick = () =>
    tryJoin(b, (pw) => vgOnlineJoinRoom(b.dataset.room, myName(), pw)));

  if(publicRooms === null) loadPublicRooms();
}

/* 参加処理の共通部分。合言葉つきのルームなら一度だけ入力を求めて再試行する。
   ボタンは処理中ずっと無効化して、二重タップでの多重参加を防ぐ */
async function tryJoin(btn, joinFn){
  if(btn.disabled) return;
  btn.disabled = true;
  let res = await joinFn("");
  if(!res.ok && res.needPassword){
    const pw = prompt("このルームには合言葉が設定されています。合言葉を入力してください。");
    if(pw !== null) res = await joinFn(pw);
  }
  btn.disabled = false;
  if(!res.ok){ showError("vg-join-error", res.message || "参加できませんでした。"); return; }
  await vgOnlineSubscribe(res.roomId, onOnlineUpdate);
  switchView("online-lobby");
}

async function loadPublicRooms(){
  publicRooms = await vgOnlineListPublicRooms();
  if(view === "online-join") repaint();
}

function paintOnlineLobby(){
  const o = vgOnlineState();
  if(!o.room){
    app.innerHTML = `
      <div class="vg-root">
        ${headHTML("待機中", "lobby")}
        <div class="vg-note">ルームに接続しています…</div>
      </div>`;
    wireBack();
    return;
  }
  const room = o.room;
  const players = room.players || [];
  const isHost = room.hostId === o.myId;
  const me = players.find(p => p.id === o.myId);
  const allReady = players.length >= VG_MIN_PLAYERS && players.every(p => p.ready || p.id === room.hostId);

  app.innerHTML = `
    <div class="vg-root">
      <div class="vg-head">
        <button type="button" class="vg-back" id="vg-leave">‹ 退出</button>
        <h2 class="vg-title">${esc(room.name || "ルーム")}</h2>
      </div>
      <div class="vg-card vg-card--code">
        <div class="vg-code-label">ルームコード</div>
        <div class="vg-code-value">${esc(room.code || "")}</div>
        <div class="vg-code-actions">
          <button type="button" class="vg-mini-btn" id="vg-copy-code">コードをコピー</button>
          <button type="button" class="vg-mini-btn" id="vg-share">URLで招待</button>
        </div>
      </div>
      <div class="vg-card">
        <div class="vg-card-title">参加者<span class="vg-card-count">${players.length}/${room.maxPlayers}</span></div>
        ${players.map(p => `
          <div class="vg-player-row">
            <span class="vg-avatar" aria-hidden="true">🙂</span>
            <span class="vg-player-main">
              <span class="vg-player-name">${esc(p.name)}${p.id === room.hostId ? `<span class="vg-tag vg-tag--host">ホスト</span>` : ""}</span>
              ${p.spectator ? `<span class="vg-player-sub">観戦</span>` : ""}
            </span>
            <span class="vg-player-ready${p.ready || p.id === room.hostId ? " on" : ""}">${p.ready || p.id === room.hostId ? "準備完了" : "準備中"}</span>
          </div>`).join("")}
      </div>
      <div class="vg-card">
        <div class="vg-card-title">この部屋の設定</div>
        <div class="vg-guide-row"><span>難易度</span><span>${esc(vgDifficulty(room.difficulty).name)}</span></div>
        <div class="vg-guide-row"><span>ラウンド数</span><span>${room.rounds}</span></div>
        <div class="vg-guide-row"><span>制限時間</span><span>${room.useTimeLimit ? "あり" : "なし"}</span></div>
        <div class="vg-guide-row"><span>ボイスチャット</span><span>${room.useVoice ? "使う" : "使わない"}</span></div>
        <div class="vg-guide-row"><span>観戦</span><span>${room.allowSpectator ? "許可" : "不可"}</span></div>
        <div class="vg-guide-row"><span>途中参加</span><span>${room.allowLateJoin ? "許可" : "不可"}</span></div>
      </div>
      <div class="vg-lobby-actions">
        ${isHost
          ? `<button type="button" class="vg-primary" id="vg-start"${allReady ? "" : " disabled"}>${allReady ? "ゲームを開始する" : "全員の準備完了を待っています"}</button>`
          : `<button type="button" class="vg-primary" id="vg-ready">${me && me.ready ? "準備完了を取り消す" : "準備完了"}</button>`}
        <button type="button" class="vg-secondary" id="vg-lobby-rules">ルールを確認する</button>
        <button type="button" class="vg-secondary" id="vg-lobby-chat">チャットを開く</button>
      </div>
      ${room.useVoice ? `<p class="vg-note">この部屋はボイスチャットを「使う」設定です。アプリ内の音声通話機能は未対応のため、通話アプリなどをご利用ください。</p>` : ""}
      <div class="vg-error" id="vg-lobby-error" hidden></div>
    </div>`;

  document.getElementById("vg-leave").onclick = async () => {
    await vgOnlineLeave();
    switchView("lobby");
  };
  document.getElementById("vg-copy-code").onclick = () => copyText(room.code || "");
  document.getElementById("vg-share").onclick = () => shareRoom(room);
  document.getElementById("vg-lobby-rules").onclick = () => openRulesSheet();
  document.getElementById("vg-lobby-chat").onclick = () => openChatSheet(null);
  const readyBtn = document.getElementById("vg-ready");
  if(readyBtn) readyBtn.onclick = () => vgOnlineSetReady(!(me && me.ready));
  const startBtn = document.getElementById("vg-start");
  if(startBtn) startBtn.onclick = async () => {
    if(startBtn.disabled) return;
    startBtn.disabled = true;
    const res = await vgOnlineStart();
    if(!res.ok){
      showError("vg-lobby-error", res.message || "ゲームを開始できませんでした。");
      startBtn.disabled = false;
    }
  };
}

/* ルームの状態が届くたびに呼ばれる。待機→対戦→終了の画面遷移もここで行う */
function onOnlineUpdate(){
  const o = vgOnlineState();
  const room = o.room;
  if(!room){
    if(view.startsWith("online-")) switchView("lobby");
    return;
  }
  if(room.status === "playing" && view !== "online-game"){
    // 自分の数字はサーバーから本人だけが受け取る（ルームには入っていない）
    if(vgOnlineMyNumber() === null || vgOnlineMyNumber() === undefined){
      vgOnlineFetchMyNumber().then(() => { if(view === "online-game") repaint(); });
    }
    switchView("online-game");
    return;
  }
  if(room.status === "finished" && view === "online-game"){
    finishOnlineGame();
    return;
  }
  if(view === "online-lobby" || view === "online-join" || view === "online-game") repaint();
}

/* =========================================================================
   オンラインのゲーム画面
   1人用と同じ画面構成だが、状態はルームドキュメント（全員で共有）から読む。
   自分の数字だけはサーバーから本人が直接受け取り、共有状態には含まれない。
   ========================================================================= */
let myOnlineOrder = [];   // 自分が作った予想順（投票前のローカル状態）

function paintOnlineGame(){
  const o = vgOnlineState();
  const room = o.room;
  if(!room){ switchView("lobby"); return; }
  const topic = vgTopicById(room.topicId);
  const players = (room.players || []).filter(p => !p.spectator);
  const me = players.find(p => p.id === o.myId);
  const spectating = !me;
  const answers = room.answers || {};
  const myAnswered = !!answers[o.myId];
  const allAnswered = players.every(p => answers[p.id]);
  const tally = vgOnlineTallyVotes(room);
  const myVoted = !!(room.votes || {})[o.myId];
  const isHost = room.hostId === o.myId;

  if(!myOnlineOrder.length || myOnlineOrder.length !== players.length){
    myOnlineOrder = players.map(p => p.id);
  }

  app.innerHTML = `
    <div class="vg-root vg-game">
      <div class="vg-status">
        <span class="vg-status-item">R <b>${room.round}</b>/${room.rounds}</span>
        <span class="vg-status-item vg-lives">${onlineLivesHTML(room)}</span>
        <span class="vg-status-item">${room.useTimeLimit ? "⏱ あり" : "時間 なし"}</span>
        <span class="vg-status-item">👥 ${players.length}</span>
        <button type="button" class="vg-status-rules" id="vg-rules-btn" aria-label="ルールを確認">?</button>
      </div>

      <div class="vg-topic">
        <div class="vg-topic-title">${esc(topic ? topic.title : "")}</div>
        <div class="vg-topic-scale">
          <span class="vg-scale-low"><b>1</b>：${esc(topic ? topic.low : "")}</span>
          <span class="vg-scale-high"><b>100</b>：${esc(topic ? topic.high : "")}</span>
        </div>
        ${topic && topic.hint ? `<div class="vg-topic-hint">${esc(topic.hint)}</div>` : ""}
      </div>

      <div class="vg-center">
        ${spectating ? `<div class="vg-notice">観戦中です。数字は配られていません。</div>` : ""}
        ${room.phase === "reveal"
          ? onlineRevealHTML(room)
          : !allAnswered
            ? onlineAnswerHTML(room, players, answers, o.myId)
            : onlineOrderHTML(room, players, answers, tally, myVoted)}
      </div>

      ${room.phase === "reveal" ? `
        <div class="vg-bottom">
          <div class="vg-bottom-row">
            ${isHost
              ? `<button type="button" class="vg-confirm vg-confirm--wide" id="vg-online-next">${(room.lives <= 0 || room.round >= room.rounds) ? "結果を見る" : "次のラウンドへ"}</button>`
              : `<div class="vg-note">ホストが次へ進めるのを待っています…</div>`}
          </div>
        </div>` : spectating ? "" : `
        <div class="vg-bottom">
          <div class="vg-bottom-row">
            <button type="button" class="vg-peek" id="vg-peek" aria-label="自分の数字を確認（押している間だけ表示）">
              <span class="vg-peek-label">長押しで数字を見る</span>
              <span class="vg-peek-value" id="vg-peek-value" aria-hidden="true">— —</span>
            </button>
          </div>
          ${!allAnswered ? `
            <div class="vg-bottom-row">
              <input type="text" class="vg-answer-input" id="vg-answer" maxlength="40"
                     placeholder="お題に沿った言葉で表現する" autocomplete="off"
                     value="${esc(answers[o.myId] || "")}"${myAnswered ? " disabled" : ""}>
              <button type="button" class="vg-confirm" id="vg-submit"${myAnswered ? " disabled" : ""}>${myAnswered ? "確定済" : "確定"}</button>
            </div>` : `
            <div class="vg-bottom-row">
              <button type="button" class="vg-confirm" id="vg-vote"${myVoted ? " disabled" : ""}>${myVoted ? "投票済み" : "この並びで投票"}</button>
              <button type="button" class="vg-confirm vg-confirm--alt" id="vg-online-reveal"${tally.total >= players.length ? "" : " disabled"}>決定</button>
            </div>`}
          <div class="vg-bottom-row vg-bottom-tools">
            <button type="button" class="vg-tool" id="vg-chat-btn">💬 チャット${o.chat.length ? `(${o.chat.length})` : ""}</button>
            <button type="button" class="vg-tool" id="vg-react-btn">😊 リアクション</button>
            <button type="button" class="vg-tool" id="vg-online-leave">退出</button>
          </div>
        </div>`}
      <div class="vg-error" id="vg-online-error" hidden></div>
    </div>`;

  wireOnlineGame(room, players);
}

function onlineLivesHTML(room){
  let out = "";
  for(let i = 0; i < (room.maxLives || 3); i++){
    out += `<span class="vg-life${i < (room.lives || 0) ? "" : " lost"}" aria-hidden="true">♥</span>`;
  }
  return `${out}<span class="vg-life-count">${room.lives || 0}</span>`;
}

function onlineAnswerHTML(room, players, answers, myId){
  const done = players.filter(p => answers[p.id]).length;
  return `
    <div class="vg-phase-label">回答フェーズ　${done} / ${players.length} 人が確定</div>
    <div class="vg-answer-list">
      ${players.map(p => `
        <div class="vg-answer-card${answers[p.id] ? " done" : ""}">
          <span class="vg-avatar" aria-hidden="true">🙂</span>
          <span class="vg-answer-main">
            <span class="vg-answer-name">${esc(p.name)}${p.id === myId ? `<span class="vg-tag">あなた</span>` : ""}</span>
            <span class="vg-answer-text">${answers[p.id] ? esc(answers[p.id]) : "考え中…"}</span>
          </span>
          <span class="vg-answer-state">${answers[p.id] ? "確定" : "未確定"}</span>
        </div>`).join("")}
    </div>
    <p class="vg-note">自分の数字を直接言わず、その大きさが伝わる言葉で表現してください。数字・範囲・順位・数式・単位の置き換えはルール違反です。</p>`;
}

function onlineOrderHTML(room, players, answers, tally, myVoted){
  return `
    <div class="vg-phase-label">並べ替えフェーズ　自分の予想順を作って投票してください</div>
    <div class="vg-vote-state">投票 ${tally.total} / ${players.length} 人${tally.count > 1 ? `　最多の並びに ${tally.count} 票` : ""}</div>
    <div class="vg-order" id="vg-order">
      ${myOnlineOrder.map((pid, i) => {
        const p = players.find(x => x.id === pid) || {};
        return `
          <div class="vg-order-card${myVoted ? " locked" : ""}" data-pid="${esc(pid)}" data-index="${i}">
            <span class="vg-order-rank">${i + 1}</span>
            <span class="vg-avatar" aria-hidden="true">🙂</span>
            <span class="vg-order-main">
              <span class="vg-order-name">${esc(p.name || "")}</span>
              <span class="vg-order-answer">${esc(answers[pid] || "")}</span>
            </span>
            <span class="vg-order-moves">
              <button type="button" class="vg-move" data-move-up="${i}" aria-label="ひとつ上へ"${i === 0 || myVoted ? " disabled" : ""}>▲</button>
              <button type="button" class="vg-move" data-move-down="${i}" aria-label="ひとつ下へ"${i === myOnlineOrder.length - 1 || myVoted ? " disabled" : ""}>▼</button>
            </span>
          </div>`;
      }).join("")}
    </div>
    <p class="vg-note">各自が予想順を作って投票し、最も多く選ばれた並びが最終候補になります。全員の投票がそろったら「決定」で数字を公開します。</p>`;
}

function onlineRevealHTML(room){
  const r = room.revealed;
  if(!r) return `<div class="vg-note">結果を読み込んでいます…</div>`;
  return `
    <div class="vg-reveal">
      <div class="vg-reveal-head${r.ok ? "" : " vg-reveal-head--fail"}">
        <div class="vg-reveal-title">${esc(r.ok ? VG_RESULT_LINES.successTitle : VG_RESULT_LINES.failTitle)}</div>
        <div class="vg-reveal-body">${esc(r.ok ? VG_RESULT_LINES.successBody : VG_RESULT_LINES.failBody)}</div>
      </div>
      <div class="vg-reveal-list">
        ${(r.rows || []).map((row, i) => `
          <div class="vg-reveal-row" style="animation-delay:${i * 140}ms">
            <span class="vg-reveal-number">${row.number}</span>
            <span class="vg-reveal-main">
              <span class="vg-reveal-name">${esc(row.name)}</span>
              <span class="vg-reveal-answer">${esc(row.answer)}</span>
            </span>
            <span class="vg-reveal-ranks">
              <span class="vg-rank-lab">予想 ${row.guessRank}</span>
              <span class="vg-rank-lab${row.guessRank === row.trueRank ? " hit" : ""}">正解 ${row.trueRank}</span>
            </span>
          </div>`).join("")}
      </div>
      <div class="vg-gap">
        <div class="vg-gap-head">今回の価値観のズレ　<b>${r.gap}</b></div>
        <span class="vg-gap-bar"><span class="vg-gap-fill" style="width:${Math.min(100, r.gap)}%"></span></span>
        <div class="vg-gap-note">${esc(vgGapComment(r.gap))}</div>
      </div>
      <div class="vg-reveal-lives">残りライフ ${onlineLivesHTML(room)}</div>
    </div>`;
}

function wireOnlineGame(room, players){
  const o = vgOnlineState();
  document.getElementById("vg-rules-btn").onclick = () => openRulesSheet();

  const peek = document.getElementById("vg-peek");
  if(peek){
    const valEl = document.getElementById("vg-peek-value");
    const show = async (e) => {
      e.preventDefault();
      let n = vgOnlineMyNumber();
      if(n === null || n === undefined) n = await vgOnlineFetchMyNumber();
      valEl.textContent = (n === null || n === undefined) ? "…" : String(n);
      peek.classList.add("peeking");
    };
    const hide = () => { valEl.textContent = "— —"; peek.classList.remove("peeking"); };
    peek.addEventListener("pointerdown", show);
    ["pointerup", "pointerleave", "pointercancel", "blur"].forEach(ev => peek.addEventListener(ev, hide));
    peek.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("visibilitychange", hide);
  }

  const submit = document.getElementById("vg-submit");
  if(submit) submit.onclick = async () => {
    if(submit.disabled) return;
    const input = document.getElementById("vg-answer");
    const text = (input.value || "").trim();
    if(!text){ input.focus(); return; }
    submit.disabled = true;   // 通信遅延中の二重送信を防ぐ
    await vgOnlineSubmitAnswer(text);
  };

  app.querySelectorAll("[data-move-up]").forEach(b => b.onclick = () => {
    const i = Number(b.dataset.moveUp);
    if(i <= 0) return;
    const l = myOnlineOrder.slice();
    [l[i - 1], l[i]] = [l[i], l[i - 1]];
    myOnlineOrder = l;
    repaint();
  });
  app.querySelectorAll("[data-move-down]").forEach(b => b.onclick = () => {
    const i = Number(b.dataset.moveDown);
    if(i >= myOnlineOrder.length - 1) return;
    const l = myOnlineOrder.slice();
    [l[i], l[i + 1]] = [l[i + 1], l[i]];
    myOnlineOrder = l;
    repaint();
  });

  const vote = document.getElementById("vg-vote");
  if(vote) vote.onclick = async () => {
    if(vote.disabled) return;
    vote.disabled = true;
    await vgOnlineVoteOrder(myOnlineOrder);
  };

  const reveal = document.getElementById("vg-online-reveal");
  if(reveal) reveal.onclick = async () => {
    if(reveal.disabled) return;
    reveal.disabled = true;
    const tally = vgOnlineTallyVotes(room);
    const res = await vgOnlineReveal(tally.order.length ? tally.order : myOnlineOrder);
    if(!res.ok){
      showError("vg-online-error", res.message || "公開できませんでした。");
      reveal.disabled = false;
    }
  };

  const next = document.getElementById("vg-online-next");
  if(next) next.onclick = async () => {
    if(next.disabled) return;
    next.disabled = true;
    myOnlineOrder = [];
    const res = await vgOnlineNextRound();
    if(!res.ok){
      showError("vg-online-error", res.message || "次へ進めませんでした。");
      next.disabled = false;
    }
  };

  const chatBtn = document.getElementById("vg-chat-btn");
  if(chatBtn) chatBtn.onclick = () => openChatSheet(null);
  const reactBtn = document.getElementById("vg-react-btn");
  if(reactBtn) reactBtn.onclick = () => openReactionSheet(null);
  const leave = document.getElementById("vg-online-leave");
  if(leave) leave.onclick = async () => {
    if(!confirm("ルームから退出しますか？")) return;
    await vgOnlineLeave();
    switchView("lobby");
  };
}

/* オンラインのゲーム終了：戦績の記録とBPの受け取り（サーバー判定） */
let onlineFinishing = false;

async function finishOnlineGame(){
  const o = vgOnlineState();
  const room = o.room;
  if(!room || onlineFinishing) return;
  onlineFinishing = true;

  const players = (room.players || []).filter(p => !p.spectator);
  // 成功の判定基準はサーバー（api/valuegame/reward.js）と同じ：
  // ライフが0になる前に規定ラウンドを最後までやり切ったらクリア
  const success = (room.lives || 0) > 0 && (room.round || 0) >= (room.rounds || 0);
  const todayKey = bpTodayKey();

  let rewards = { items: [], total: 0, source: "server" };
  try{
    rewards = await vgClaimRewards({
      gameId: room.gameId,
      mode: "online",
      difficulty: room.difficulty,
      rounds: room.rounds,
      clearedRounds: room.clearedRounds,
      answeredRounds: room.clearedRounds,
      success,
      perfect: success && room.perfect !== false,
      livesLeft: room.lives,
      participated: true,
      finished: true,
      firstWinToday: success && vgIsFirstWinToday(todayKey),
      roomId: o.roomId,
      opponentIds: players.filter(p => p.id !== o.myId).map(p => p.id),
    });
  }catch(e){ console.error("valuegame online reward failed:", e); }

  const rec = vgRecordGame({
    gameId: room.gameId,
    mode: "online",
    difficulty: room.difficulty,
    rounds: room.rounds,
    clearedRounds: room.clearedRounds,
    success,
    perfect: success && room.perfect !== false,
    livesLeft: room.lives,
    players: players.map(p => ({ uid: p.id, name: p.name, isAI: false })),
    topics: room.usedTopicIds || [],
    myAnswers: [],
    bpGained: rewards.total,
    todayKey,
  });

  finalResult = {
    success,
    perfect: success && room.perfect !== false,
    lives: room.lives || 0,
    maxLives: room.maxLives || 3,
    clearedRounds: room.clearedRounds || 0,
    rounds: room.rounds || 0,
    rewards,
    newTitles: rec.newTitles,
    lastRows: (room.revealed && room.revealed.rows) || [],
  };
  await vgOnlineLeave();
  onlineFinishing = false;
  switchView("result");
}

function copyText(text){
  try{
    if(navigator.clipboard) navigator.clipboard.writeText(text);
    else {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); ta.remove();
    }
  }catch(e){}
}

function shareRoom(room){
  const url = vgOnlineShareUrl(room);
  if(navigator.share){
    navigator.share({ title: "チャッピーの価値観ゲーム", text: `ルームコード ${room.code} で参加できます`, url }).catch(() => {});
    return;
  }
  copyText(url);
}

/* 起動時に一度だけ、オンライン機能の初期化（URLのルームコード取り込みなど）を行う */
vgOnlineInit();
