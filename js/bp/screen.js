/* =========================================================================
   🎖️ BPミッション画面（S.screen === "bp"）

   ステータスバーの「総合ランク」ゲージをタップすると開く詳細画面。
   ・現在の総合ランク／現在BP／次のランクまでに必要なBP／進捗バー
   ・今日獲得したBPと本日の獲得上限
   ・BP獲得履歴
   ・デイリーミッション／ウィークリーミッション／実績
   ・次に達成できそうなミッション

   render()から呼ばれるフルスクリーン画面。BPが増えたら（bp-changedイベント）
   この画面を開いている間だけ自分で描き直す。
   ========================================================================= */
import { app, go } from '../render.js';
import { bpForLevel, overallLevel, overallStat, totalBP } from '../core.js';
import {
  achievementState, bpDailyCap, bpLedger, bpLifetime, bpLoginStreak, bpStudyStreak,
  bpTodayEarned, dailyMissionState, nextMissions, weeklyMissionState,
} from './store.js';
import { MIN_SCHEDULES_FOR_BONUS, MIN_TASKS_FOR_BONUS, weeklyRates } from './weekly.js';
import { BP_AMOUNT } from './config.js';

function esc(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

let activeTab = "missions"; // "missions" | "history" | "guide"

/* ---- 部品 ---- */
function progressBarHTML(pct, variant){
  const w = Math.max(0, Math.min(100, Math.round(pct)));
  return `<span class="bp-bar"><span class="bp-bar-fill${variant ? " bp-bar-fill--" + variant : ""}" style="width:${w}%"></span></span>`;
}

/* ミッションの「その行動ができる画面」への行き先。
   未達成のミッションをタップすると、そこへ直接移動できる
   （「価値観ゲームを1回遊ぶ」と出ているのに行き方が分からない、を防ぐ） */
const MISSION_TARGET = {
  taskDone: "select",        // 本日のタスク（ホーム）
  scheduleAdd: "calendar",
  scheduleDone: "select",
  studyLog: "certs",         // 資格を選んで学習する
  newsRead: "news-japan",
  chappyCare: "chappy",
  gameFinish: "valuegame",
};

function missionRowHTML(m){
  const pct = Math.min(100, Math.round(m.cur / m.need * 100));
  const target = m.done ? "" : (MISSION_TARGET[m.reason] || "");
  const tag = target ? "button" : "div";
  const attrs = target ? ` type="button" data-bp-go="${esc(target)}"` : "";
  return `
    <${tag} class="bp-mission${m.done ? " done" : ""}${target ? " bp-mission--link" : ""}"${attrs}>
      <span class="bp-mission-icon" aria-hidden="true">${m.icon || "🎯"}</span>
      <span class="bp-mission-main">
        <span class="bp-mission-title">${esc(m.title)}</span>
        ${progressBarHTML(pct, m.done ? "done" : "")}
        <span class="bp-mission-count">${m.cur} / ${m.need}${m.bonus > 0 ? `　ボーナス +${m.bonus} BP` : ""}</span>
      </span>
      <span class="bp-mission-state">${m.done ? "達成" : `${Math.max(0, m.need - m.cur)}回`}</span>
      ${target ? `<span class="bp-mission-arrow" aria-hidden="true">›</span>` : ""}
    </${tag}>`;
}

function achievementRowHTML(a){
  const pct = Math.min(100, Math.round(a.cur / a.need * 100));
  return `
    <div class="bp-mission bp-ach${a.done ? " done" : ""}">
      <span class="bp-mission-icon" aria-hidden="true">${a.icon || "🏅"}</span>
      <span class="bp-mission-main">
        <span class="bp-mission-title">${esc(a.title)}</span>
        <span class="bp-mission-desc">${esc(a.desc)}</span>
        ${progressBarHTML(pct, a.done ? "done" : "")}
        <span class="bp-mission-count">${a.cur.toLocaleString()} / ${a.need.toLocaleString()}${a.bonus > 0 ? `　ボーナス +${a.bonus} BP` : ""}</span>
      </span>
      <span class="bp-mission-state">${a.done ? "解除" : ""}</span>
    </div>`;
}

function fmtTime(iso){
  try{
    const d = new Date(iso);
    const p = n => String(n).padStart(2, "0");
    return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }catch(e){ return ""; }
}

function historyHTML(){
  const rows = bpLedger();
  if(!rows.length){
    return `<div class="bp-empty">まだBPの獲得履歴がありません。<br>タスクを完了したり、ニュースを読んだりするとここに記録されます。</div>`;
  }
  return `
    <div class="bp-history">
      ${rows.map(r => `
        <div class="bp-history-row">
          <span class="bp-history-main">
            <span class="bp-history-label">${esc(r.label || r.reason)}</span>
            ${r.note ? `<span class="bp-history-note">${esc(r.note)}</span>` : ""}
            <span class="bp-history-time">${esc(fmtTime(r.at))}${r.gameId ? `　ゲームID ${esc(String(r.gameId).slice(0, 8))}` : ""}</span>
          </span>
          <span class="bp-history-amount">+${Number(r.amount).toLocaleString()}</span>
        </div>`).join("")}
    </div>`;
}

/* ---- BPの獲得方法いちらん（ガイドタブ） ---- */
const GUIDE_GROUPS = [
  {
    title: "毎日の基本行動",
    items: [
      ["アプリへの初回ログイン", BP_AMOUNT.dailyLogin],
      ["カレンダーへ予定を登録", BP_AMOUNT.scheduleAdd],
      ["登録した予定を完了", BP_AMOUNT.scheduleDone],
      ["タスクを1件完了", BP_AMOUNT.taskDone],
      ["その日のタスクをすべて完了", BP_AMOUNT.allTasksDone],
      ["学習記録を登録", BP_AMOUNT.studyLog],
      ["ニュースを1件確認", BP_AMOUNT.newsRead],
      ["チャッピーのお世話", BP_AMOUNT.chappyCare],
    ],
  },
  {
    title: "継続ボーナス",
    items: [
      ["3日連続ログイン", BP_AMOUNT.streak3],
      ["7日連続ログイン", BP_AMOUNT.streak7],
      ["14日連続ログイン", BP_AMOUNT.streak14],
      ["30日連続ログイン", BP_AMOUNT.streak30],
      ["7日連続学習", BP_AMOUNT.studyStreak7],
      ["1週間の予定達成率80%以上", BP_AMOUNT.weeklySchedule80],
      ["1週間のタスク達成率100%", BP_AMOUNT.weeklyTask100],
    ],
  },
  {
    title: "チャッピーハウス",
    items: [
      ["はじめてごはんをあげる", BP_AMOUNT.chappyFirstFeed],
      ["はじめて部屋を掃除する", BP_AMOUNT.chappyFirstClean],
      ["はじめて着せ替えをする", BP_AMOUNT.chappyFirstDressUp],
      ["はじめて家具を購入する", BP_AMOUNT.chappyFirstFurniture],
      ["なかよし度が一定値に到達", BP_AMOUNT.chappyBond],
      ["チャッピーのレベルアップ", BP_AMOUNT.chappyLevelUp],
      ["季節イベントへ参加", BP_AMOUNT.chappySeasonEvent],
    ],
  },
  {
    title: "チャッピーの価値観ゲーム",
    items: [
      ["ゲームへ参加", BP_AMOUNT.gameJoin],
      ["1ゲーム完了", BP_AMOUNT.gameFinish],
      ["協力モード成功", BP_AMOUNT.gameCoopWin],
      ["パーフェクト成功（追加）", BP_AMOUNT.gamePerfect],
      ["本日の初勝利（追加）", BP_AMOUNT.gameFirstWinToday],
      ["フレンドとプレイ（追加）", BP_AMOUNT.gameWithFriend],
    ],
  },
];

function guideHTML(){
  const rates = safeWeeklyRates();
  return `
    ${GUIDE_GROUPS.map(g => `
      <div class="bp-card">
        <div class="bp-card-title">${esc(g.title)}</div>
        <div class="bp-guide">
          ${g.items.map(([label, amount]) => `
            <div class="bp-guide-row">
              <span class="bp-guide-label">${esc(label)}</span>
              <span class="bp-guide-amount">+${amount} BP</span>
            </div>`).join("")}
        </div>
      </div>`).join("")}
    <div class="bp-card">
      <div class="bp-card-title">今週のようす</div>
      <div class="bp-guide">
        <div class="bp-guide-row">
          <span class="bp-guide-label">予定の達成率</span>
          <span class="bp-guide-amount">${rates.schedule === null ? "―" : `${Math.round(rates.schedule * 100)}%（${rates.scheduleCounts.done}/${rates.scheduleCounts.total}）`}</span>
        </div>
        <div class="bp-guide-row">
          <span class="bp-guide-label">タスクの達成率</span>
          <span class="bp-guide-amount">${rates.task === null ? "―" : `${Math.round(rates.task * 100)}%（${rates.taskCounts.done}/${rates.taskCounts.total}）`}</span>
        </div>
        <div class="bp-guide-row">
          <span class="bp-guide-label">週のボーナス対象</span>
          <span class="bp-guide-amount">予定${MIN_SCHEDULES_FOR_BONUS}件・タスク${MIN_TASKS_FOR_BONUS}件から</span>
        </div>
        <div class="bp-guide-row">
          <span class="bp-guide-label">連続ログイン</span>
          <span class="bp-guide-amount">${bpLoginStreak()}日</span>
        </div>
        <div class="bp-guide-row">
          <span class="bp-guide-label">連続学習</span>
          <span class="bp-guide-amount">${bpStudyStreak()}日</span>
        </div>
      </div>
      <div class="bp-note">連続記録が途切れても、これまでに獲得したBPが減ることはありません。またそこから積み上げていけば大丈夫です。</div>
    </div>`;
}

function safeWeeklyRates(){
  try{ return weeklyRates(); }
  catch(e){ return { schedule: null, task: null, scheduleCounts: { done: 0, total: 0 }, taskCounts: { done: 0, total: 0 } }; }
}

function missionsHTML(){
  const daily = dailyMissionState();
  const weekly = weeklyMissionState();
  const achs = achievementState();
  const next = nextMissions(3);
  const dailyDone = daily.filter(m => m.done).length;
  const weeklyDone = weekly.filter(m => m.done).length;
  const achDone = achs.filter(a => a.done).length;
  return `
    ${next.length ? `
      <div class="bp-card bp-card--next">
        <div class="bp-card-title">次に達成できそうなミッション</div>
        ${next.map(m => `
          <div class="bp-next">
            <span class="bp-next-icon" aria-hidden="true">${m.icon || "🎯"}</span>
            <span class="bp-next-main">
              <span class="bp-next-title">${esc(m.title)}</span>
              <span class="bp-next-sub">${esc(m.scope)}　あと ${Math.max(0, m.need - m.cur).toLocaleString()}${m.kind === "total" ? " BP" : "回"}</span>
            </span>
            ${m.bonus > 0 ? `<span class="bp-next-bonus">+${m.bonus} BP</span>` : ""}
          </div>`).join("")}
      </div>` : ""}

    <div class="bp-card">
      <div class="bp-card-title">デイリーミッション<span class="bp-card-count">${dailyDone}/${daily.length}</span></div>
      ${daily.map(missionRowHTML).join("")}
    </div>

    <div class="bp-card">
      <div class="bp-card-title">ウィークリーミッション<span class="bp-card-count">${weeklyDone}/${weekly.length}</span></div>
      ${weekly.map(missionRowHTML).join("")}
    </div>

    <div class="bp-card">
      <div class="bp-card-title">実績<span class="bp-card-count">${achDone}/${achs.length}</span></div>
      ${achs.map(achievementRowHTML).join("")}
    </div>`;
}

export function renderBpScreen(){
  const ov = overallStat();
  const tbp = totalBP();
  const lv = overallLevel(tbp);
  const start = bpForLevel(lv), next = bpForLevel(lv + 1);
  const pct = next > start ? Math.round((tbp - start) / (next - start) * 100) : 100;
  const today = bpTodayEarned();
  const cap = bpDailyCap();
  const capPct = Math.min(100, Math.round(today / cap * 100));

  app.innerHTML = `
    <div class="bp-root">
      <div class="bp-head">
        <button type="button" class="bp-back" id="bp-back">‹ 戻る</button>
        <h2 class="bp-title">BPミッション</h2>
      </div>

      <div class="bp-hero">
        <div class="bp-hero-rank">
          <span class="bp-hero-lv">総合ランク Lv.<b>${lv}</b></span>
          <span class="bp-hero-title">${esc(ov.title)}</span>
        </div>
        <div class="bp-hero-bp">現在：<b>${tbp.toLocaleString()}</b> BP</div>
        ${progressBarHTML(pct, "overall")}
        <div class="bp-hero-next">${ov.remain > 0
          ? `次のランクまで：<b>${ov.remain.toLocaleString()}</b> BP`
          : "まもなくレベルアップ！"}</div>

        <div class="bp-today">
          <div class="bp-today-head">
            <span>本日の獲得</span>
            <span><b>${today.toLocaleString()}</b> / ${cap.toLocaleString()} BP</span>
          </div>
          ${progressBarHTML(capPct, "today")}
          <div class="bp-today-note">${today >= cap
            ? "本日の上限に到達しました。日付が変わるとまた獲得できます。"
            : "1日にまとめて獲得できるBPには上限があります。"}</div>
        </div>

        <div class="bp-hero-stats">
          <div class="bp-stat"><span class="bp-stat-v">${bpLifetime().toLocaleString()}</span><span class="bp-stat-l">累計獲得BP</span></div>
          <div class="bp-stat"><span class="bp-stat-v">${bpLoginStreak()}</span><span class="bp-stat-l">連続ログイン</span></div>
          <div class="bp-stat"><span class="bp-stat-v">${bpStudyStreak()}</span><span class="bp-stat-l">連続学習</span></div>
        </div>
      </div>

      <div class="bp-tabs" role="tablist">
        <button type="button" class="bp-tab${activeTab === "missions" ? " active" : ""}" data-bp-tab="missions">ミッション</button>
        <button type="button" class="bp-tab${activeTab === "history" ? " active" : ""}" data-bp-tab="history">獲得履歴</button>
        <button type="button" class="bp-tab${activeTab === "guide" ? " active" : ""}" data-bp-tab="guide">もらい方</button>
      </div>

      <div class="bp-body" id="bp-body">
        ${activeTab === "history" ? historyHTML() : activeTab === "guide" ? guideHTML() : missionsHTML()}
      </div>
    </div>`;

  const back = document.getElementById("bp-back");
  if(back) back.onclick = () => go("select");
  app.querySelectorAll("[data-bp-tab]").forEach(b => b.onclick = () => {
    activeTab = b.dataset.bpTab;
    renderBpScreen();
  });
  // 未達成のミッションをタップしたら、その行動ができる画面へ移動する
  app.querySelectorAll("[data-bp-go]").forEach(b => b.onclick = () => go(b.dataset.bpGo));
}

// BPが増えたら、この画面を開いている間だけ静かに描き直す
window.addEventListener("bp-changed", () => {
  if(document.querySelector(".bp-root")) renderBpScreen();
});
