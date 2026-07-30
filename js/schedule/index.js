/* =========================================================================
   予定／タスク機能の入口。

   ・ホーム画面のカード（今日の予定＋本日のタスク）
   ・カレンダー画面（月／週／日／週間ルーティンの切り替え）
   ・起動時／オンライン復帰時／データ変更時のGoogleカレンダー同期
   ・通知エンジンの起動
   をまとめて受け持ち、既存の js/render.js からはこのモジュールの
   関数を呼ぶだけで済むようにしている。
   ========================================================================= */
import { ensureGoogleConnection, googleConnecting, googleError, isGoogleConnected, isSyncing, syncNow } from './gsync.js';
import { HOME_CARD_ID, homeCardHTML, renderHomeCard, todayOccurrences } from './home.js';
import { maybeShowFirstRunPrompt, openSyncSettings } from './settings.js';
import { openScheduleEditor } from './editor.js';
import { startReminderEngine } from './reminders.js';
import { applyCloudSchedule, handleIdentityChange, loadSettings, loadSyncState, migrateLegacyData, onStoreChange } from './store.js';
import {
  bindViewEvents, dayViewHTML, getDateKey, getView, goToday, monthViewHTML,
  resetTimelineScroll, routineViewHTML, setView, shiftView, timelineScrollPending, viewTitle, weekViewHTML,
} from './views.js';
import { debounce, esc, todayKey } from './util.js';

const CAL_CARD_ID = "sched-cal-card";

const VIEW_TABS = [
  { key: "month",   label: "月" },
  { key: "week",    label: "週" },
  { key: "day",     label: "日" },
  { key: "routine", label: "ルーティン" },
];

/* ================= ホーム画面 ================= */

export function scheduleHomeCardHTML(){ return homeCardHTML(); }

export function renderScheduleHome(){
  handleIdentityChange();
  // ログイン直後・再訪時に、保存済みのGoogle連携を復元する
  ensureGoogleConnection();
  renderHomeCard({
    onOpenDay: (dateKey) => {
      setView("day", dateKey);
      // 既存のルーター（render.jsのgo()）でカレンダー画面へ遷移する
      if(window.ScheduleNav && window.ScheduleNav.goCalendar) window.ScheduleNav.goCalendar();
    },
    onChange: () => renderScheduleHome(),
  });
}

/* ================= カレンダー画面 ================= */

export function scheduleCalendarCardHTML(){ return `<div class="gcal-card" id="${CAL_CARD_ID}"></div>`; }

// 直前に描いた内容と、その描画先の要素。中身がまったく同じ再描画（同期の完了通知など）では
// DOMを作り直さない。作り直すとタイムラインのスクロール枠まで新しくなり、
// 見ていた位置が飛んでしまうため
let lastCalRoot = null;
let lastCalHTML = "";

export function renderScheduleCalendar(){
  const root = document.getElementById(CAL_CARD_ID);
  if(!root) return;
  // カレンダー画面を開き直したときは、覚えていたスクロール位置は捨てて
  // 新しい画面の初期位置（日表示なら0:00）から見せる
  if(root !== lastCalRoot) resetTimelineScroll();
  handleIdentityChange();
  ensureGoogleConnection();

  const view = getView();
  const settings = loadSettings();
  const syncState = loadSyncState();
  const connected = isGoogleConnected();

  const body =
    view === "month"   ? monthViewHTML(getDateKey()) :
    view === "week"    ? weekViewHTML(getDateKey()) :
    view === "routine" ? routineViewHTML() :
                         dayViewHTML(getDateKey());

  const html = `
    <div class="gcal-box sched-cal">
      ${connectBarHTML(connected, settings)}
      <div class="sched-tabs">
        ${VIEW_TABS.map(t => `<button type="button" class="sched-tab${view === t.key ? " active" : ""}" data-view="${t.key}">${t.label}</button>`).join("")}
      </div>
      <div class="sched-toolbar">
        ${view === "routine"
          ? `<span class="sched-toolbar-title">${esc(viewTitle())}</span>`
          : `<button type="button" class="gcal-nav-btn" id="sched-prev" aria-label="前へ">‹</button>
             <span class="sched-toolbar-title">${esc(viewTitle())}</span>
             <button type="button" class="gcal-nav-btn" id="sched-next" aria-label="次へ">›</button>`}
        <span class="sched-toolbar-spacer"></span>
        ${view === "routine" ? "" : `<button type="button" class="sched-mini-btn" id="sched-today">今日</button>`}
        <button type="button" class="gcal-reload-btn${isSyncing() ? " spinning" : ""}" id="sched-refresh" aria-label="Googleカレンダーと同期" title="Googleカレンダーと同期"${isSyncing() ? " disabled" : ""}>⟲</button>
        <button type="button" class="sched-mini-btn" id="sched-settings" aria-label="同期の設定">設定</button>
      </div>
      ${googleError() ? `<div class="sched-error">${esc(googleError())}</div>` : ""}
      ${syncState.lastError ? `<div class="sched-error">同期エラー：${esc(syncState.lastError)}</div>` : ""}
      <div class="sched-view">${body}</div>
      <button type="button" class="sched-fab" id="sched-add-fab" aria-label="予定を追加">＋</button>
    </div>`;

  // 表示内容に変化がないときは、DOMもイベント配線もそのまま使い回す。
  // （スクロール位置の初期化待ちのときだけは、位置を出し直すために描き直す）
  if(root === lastCalRoot && root.childElementCount && html === lastCalHTML && !timelineScrollPending()) return;

  root.innerHTML = html;
  lastCalRoot = root;
  lastCalHTML = html;

  bindCalendar(root, view);
}

function connectBarHTML(connected, settings){
  if(!connected){
    const busy = googleConnecting();
    return `
      <div class="gcal-google-bar">
        <button type="button" class="gcal-google-connect" id="sched-connect"${busy ? " disabled" : ""}>${busy ? "連携中…" : "Googleカレンダーと連携"}</button>
      </div>`;
  }
  return `
    <div class="gcal-google-bar">
      <span class="gcal-google-badge">Google連携中${settings.syncEnabled ? "・同期ON" : "・同期OFF"}</span>
      <button type="button" class="gcal-google-disconnect" id="sched-disconnect">連携解除</button>
    </div>`;
}

function bindCalendar(root, view){
  const rerender = () => renderScheduleCalendar();

  root.querySelectorAll("[data-view]").forEach(b => b.onclick = () => { setView(b.dataset.view); rerender(); });

  const prev = root.querySelector("#sched-prev");
  if(prev) prev.onclick = () => { shiftView(-1); rerender(); };
  const next = root.querySelector("#sched-next");
  if(next) next.onclick = () => { shiftView(1); rerender(); };
  const today = root.querySelector("#sched-today");
  if(today) today.onclick = () => { goToday(); rerender(); };

  root.querySelector("#sched-settings").onclick = () => openSyncSettings(rerender);

  const refresh = root.querySelector("#sched-refresh");
  if(refresh && !isSyncing()) refresh.onclick = async () => {
    rerender();
    await syncNow();
    rerender();
  };

  const connect = root.querySelector("#sched-connect");
  if(connect) connect.onclick = () => {
    if(window.GcalGoogleBridge && window.GcalGoogleBridge.connect) window.GcalGoogleBridge.connect();
  };
  const disconnect = root.querySelector("#sched-disconnect");
  if(disconnect) disconnect.onclick = () => {
    if(window.GcalGoogleBridge && window.GcalGoogleBridge.disconnect) window.GcalGoogleBridge.disconnect();
  };

  root.querySelector("#sched-add-fab").onclick = () => openScheduleEditor({
    dateKey: view === "routine" ? todayKey() : getDateKey(),
    routine: view === "routine",
    onSaved: rerender,
  });

  bindViewEvents(root, rerender);

  // 初回だけ「Googleカレンダーと同期しますか？」を出す
  maybeShowFirstRunPrompt(rerender);
}

/* ================= 表示中の画面の再描画 ================= */

// ホーム／カレンダーのうち、いま画面に出ている方だけを描き直す
export function refreshScheduleViews(){
  if(document.getElementById(HOME_CARD_ID)) renderScheduleHome();
  if(document.getElementById(CAL_CARD_ID)) renderScheduleCalendar();
}

/* ================= 起動処理 ================= */

// データが変わったら、少し待ってからGoogleへ反映する（連続編集で
// 何度もAPIを叩かないようまとめる）
const syncAfterChange = debounce(() => {
  const settings = loadSettings();
  if(settings.syncEnabled && settings.syncDirection !== "pull") syncNow({ quiet: true }).then(refreshScheduleViews);
}, 2500);

let initialized = false;

export function initSchedule(){
  if(initialized) return;
  initialized = true;

  migrateLegacyData();
  startReminderEngine();

  onStoreChange((reason) => {
    refreshScheduleViews();
    if(reason === "schedules") syncAfterChange();
  });

  // 起動時同期（Google連携の復元を待つため少し遅らせる）
  setTimeout(() => { syncNow({ quiet: true }).then(refreshScheduleViews); }, 4000);

  // オフライン中の変更は溜めておき、オンラインへ戻った時点でまとめて反映する
  window.addEventListener("online", () => { syncNow({ quiet: true }).then(refreshScheduleViews); });

  // 他アプリから戻ってきたときにも最新へ追いつく（1分以上空いた場合のみ）
  document.addEventListener("visibilitychange", () => {
    if(document.visibilityState !== "visible") return;
    const last = loadSyncState().lastSyncAt;
    if(!last || Date.now() - new Date(last).getTime() > 60000){
      syncNow({ quiet: true }).then(refreshScheduleViews);
    }
  });
}

/* ================= 既存コードから使う補助 ================= */

export { applyCloudSchedule, todayOccurrences, syncNow, openScheduleEditor, setView };
