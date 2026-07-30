/* =========================================================================
   カレンダー画面の3つの表示（月／週／日）と、週間ルーティンの一覧。

   ・日表示はGoogleカレンダーと同じ「1時間＝1行のタイムライン」に予定を
     ブロックで置く方式。ブロックは動かせない固定表示で、タップすると
     編集画面が開く（時刻の変更は編集画面からだけ行う）。
   ・週表示は同じタイムラインを7日ぶん横に並べた縮小版。
   ・月表示は各日に「予定あり」の点と件数を出し、日付を押すとその日の
     日表示へ移動する。
   ・描画に必要なデータは表示中の範囲だけをオカレンス展開して作るので、
     予定が増えても月表示が重くならない。
   ========================================================================= */
import { assignLanes, occurrencesForDate, occurrencesForRange, routinesByWeekday } from './occurrences.js';
import { openScheduleEditor } from './editor.js';
import { recurrenceLabel } from './recurrence.js';
import { reminderLabel } from './reminders.js';
import {
  WEEKDAYS_JA, addDaysKey, dateKeyOf, esc, formatDateLabel,
  parseDateKey, startOfWeek, timePartOf, timeToMinutes, todayKey,
} from './util.js';

// タイムラインの1時間ぶんの高さ（px）。CSS側の --sched-hour-h と必ず揃える
const HOUR_H = 52;
const WEEK_HOUR_H = 40;
const MIN_DURATION_MIN = 15;

/* ================= 表示状態 ================= */
const viewState = {
  view: "day",           // "month" | "week" | "day" | "routine"
  dateKey: todayKey(),
};

export function getView(){ return viewState.view; }
export function getDateKey(){ return viewState.dateKey; }

// 表示モード／日付を切り替えたときだけ、新しい画面の初期位置を出し直す。
// （同期や予定の追加などの再描画では呼ばれないので、ユーザーが手で
//   スクロールした位置はそのまま残る）
export function setView(view, dateKey){
  viewState.view = view;
  if(dateKey) viewState.dateKey = dateKey;
  resetTimelineScroll();
}

export function shiftView(delta){
  if(viewState.view === "month"){
    const d = parseDateKey(viewState.dateKey);
    viewState.dateKey = dateKeyOf(new Date(d.getFullYear(), d.getMonth() + delta, 1));
  } else if(viewState.view === "week"){
    viewState.dateKey = addDaysKey(viewState.dateKey, delta * 7);
  } else {
    viewState.dateKey = addDaysKey(viewState.dateKey, delta);
  }
  resetTimelineScroll();
}

export function goToday(){
  viewState.dateKey = todayKey();
  resetTimelineScroll();
}

/* ================= 共通パーツ ================= */

export function viewTitle(){
  const d = parseDateKey(viewState.dateKey);
  if(viewState.view === "month") return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  if(viewState.view === "week"){
    const s = startOfWeek(d), e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
    return `${s.getMonth() + 1}/${s.getDate()} 〜 ${e.getMonth() + 1}/${e.getDate()}`;
  }
  if(viewState.view === "routine") return "週間ルーティン";
  return formatDateLabel(viewState.dateKey, { withYear: true });
}

function isToday(dateKey){ return dateKey === todayKey(); }

/* ================= 日表示 ================= */

export function dayViewHTML(dateKey){
  const key = dateKey || viewState.dateKey;
  const occs = occurrencesForDate(key);
  const allDay = occs.filter(o => o.allDay || !o.start);
  const timed = assignLanes(occs);
  const now = new Date();
  const nowTop = isToday(key) ? (now.getHours() * 60 + now.getMinutes()) / 60 * HOUR_H : null;

  const hourRows = [];
  for(let h = 0; h < 24; h++){
    hourRows.push(`
      <div class="sched-hour-row" style="height:${HOUR_H}px">
        <span class="sched-hour-label">${String(h).padStart(2, "0")}:00</span>
        <button type="button" class="sched-hour-slot" data-newhour="${h}" aria-label="${h}時に予定を追加"></button>
      </div>`);
  }

  return `
    <div class="sched-day">
      ${allDay.length ? `
        <div class="sched-allday-strip">
          <span class="sched-allday-label">終日</span>
          <div class="sched-allday-items">
            ${allDay.map(o => `<button type="button" class="sched-allday-item" data-occ="${esc(o.key)}" style="${o.color ? `--sched-ev-color:${esc(o.color)}` : ""}">${esc(o.title)}</button>`).join("")}
          </div>
        </div>` : ""}
      <div class="sched-timeline" id="sched-timeline">
        <!-- 予定ブロックの絶対配置の基準は、24時間ぶんの高さを持つこの内側の
             ラッパー。スクロールする外枠(.sched-timeline)を基準にしてしまうと、
             スクロールしたときにブロックだけが取り残されてしまう -->
        <div class="sched-timeline-inner" style="height:${24 * HOUR_H}px">
          <div class="sched-hours">${hourRows.join("")}</div>
          <div class="sched-blocks">
            ${timed.map(o => blockHTML(o, HOUR_H)).join("")}
            ${nowTop !== null ? `<div class="sched-nowline" style="top:${nowTop}px"><span class="sched-nowdot"></span></div>` : ""}
          </div>
        </div>
      </div>
      ${occs.length ? "" : `<div class="sched-empty">この日の予定はありません。時間帯をタップして追加できます。</div>`}
    </div>`;
}

function blockHTML(occ, hourH, opts){
  const startMin = timeToMinutes(occ.start || "00:00");
  const endMin = Math.max(startMin + MIN_DURATION_MIN, timeToMinutes(occ.end || occ.start || "00:00"));
  const top = startMin / 60 * hourH;
  const height = Math.max(20, (endMin - startMin) / 60 * hourH);
  const lane = occ._lane || 0;
  const laneCount = occ._laneCount || 1;
  const widthPct = 100 / laneCount;
  const compact = opts && opts.compact;
  // 30分などの短い予定は、時刻と本文を縦に積むと枠に収まらず文字が切れて
  // しまう。一定の高さを下回るときは1行（横並び）にする
  const short = height < 38;
  const veryShort = height < 24;
  // 予定ブロックは動かせない固定表示。タップすると編集画面が開くだけで、
  // ドラッグ／長押しでは時間を変えられない（時刻の変更は編集画面から）
  return `
    <div class="sched-block${occ.routine ? " routine" : ""}${occ.overridden ? " overridden" : ""}${compact ? " compact" : ""}${short ? " short" : ""}"
         role="button" data-occ="${esc(occ.key)}" data-schedule="${esc(occ.scheduleId)}" data-date="${esc(occ.dateKey)}"
         style="top:${top}px;height:${height}px;left:calc(${lane * widthPct}% + 2px);width:calc(${widthPct}% - 4px);${occ.color ? `--sched-ev-color:${esc(occ.color)}` : ""}">
      ${veryShort ? "" : `<span class="sched-block-time">${esc(occ.start || "")}${occ.end && !compact && !short ? `〜${esc(occ.end)}` : ""}</span>`}
      <span class="sched-block-title">${esc(occ.title)}</span>
    </div>`;
}

/* ================= 週表示 ================= */

export function weekViewHTML(dateKey){
  const start = startOfWeek(parseDateKey(dateKey || viewState.dateKey));
  const days = [];
  for(let i = 0; i < 7; i++) days.push(dateKeyOf(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
  const map = occurrencesForRange(days[0], days[6]);
  const now = new Date();
  const nowTop = days.includes(todayKey()) ? (now.getHours() * 60 + now.getMinutes()) / 60 * WEEK_HOUR_H : null;

  const hourLabels = [];
  for(let h = 0; h < 24; h++){
    hourLabels.push(`<div class="sched-week-hour" style="height:${WEEK_HOUR_H}px"><span>${String(h).padStart(2, "0")}</span></div>`);
  }

  return `
    <div class="sched-week">
      <div class="sched-week-head">
        <span class="sched-week-gutter"></span>
        ${days.map(dk => {
          const d = parseDateKey(dk);
          const cls = ["sched-week-daybtn"];
          if(isToday(dk)) cls.push("today");
          if(d.getDay() === 0) cls.push("holiday");
          if(d.getDay() === 6) cls.push("sat");
          return `<button type="button" class="${cls.join(" ")}" data-goday="${esc(dk)}">
            <span class="sched-week-dow">${WEEKDAYS_JA[d.getDay()]}</span>
            <span class="sched-week-num">${d.getDate()}</span>
          </button>`;
        }).join("")}
      </div>
      ${days.some(dk => (map[dk] || []).some(o => o.allDay || !o.start)) ? `
        <div class="sched-week-allday-row">
          <span class="sched-week-gutter"></span>
          ${days.map(dk => `
            <div class="sched-week-allday-cell">
              ${(map[dk] || []).filter(o => o.allDay || !o.start).map(o => `
                <button type="button" class="sched-week-allday" data-occ="${esc(o.key)}" style="${o.color ? `--sched-ev-color:${esc(o.color)}` : ""}">${esc(o.title)}</button>`).join("")}
            </div>`).join("")}
        </div>` : ""}
      <div class="sched-week-body" id="sched-week-body">
        <div class="sched-week-gutter-col">${hourLabels.join("")}</div>
        ${days.map(dk => {
          const timed = assignLanes(map[dk] || []);
          return `
            <div class="sched-week-col${isToday(dk) ? " today" : ""}" data-col="${esc(dk)}">
              <div class="sched-week-grid" style="height:${24 * WEEK_HOUR_H}px">
                ${Array.from({ length: 24 }, (_, h) => `<div class="sched-week-line" style="top:${h * WEEK_HOUR_H}px"></div>`).join("")}
                ${timed.map(o => blockHTML(o, WEEK_HOUR_H, { compact: true })).join("")}
                ${nowTop !== null && dk === todayKey() ? `<div class="sched-nowline" style="top:${nowTop}px"><span class="sched-nowdot"></span></div>` : ""}
              </div>
            </div>`;
        }).join("")}
      </div>
    </div>`;
}

/* ================= 月表示 ================= */

export function monthViewHTML(dateKey, opts){
  const base = parseDateKey(dateKey || viewState.dateKey);
  const y = base.getFullYear(), m = base.getMonth();
  const first = new Date(y, m, 1);
  const gridStart = new Date(y, m, 1 - first.getDay());
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const totalCells = Math.ceil((first.getDay() + daysInMonth) / 7) * 7;
  const lastCell = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + totalCells - 1);
  // 月グリッドに実際に写る範囲（前後の月のはみ出し分を含む）だけを展開する
  const map = occurrencesForRange(dateKeyOf(gridStart), dateKeyOf(lastCell));
  const showCount = !opts || opts.mode !== "dot";

  const cells = [];
  for(let i = 0; i < totalCells; i++){
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const dk = dateKeyOf(d);
    const occs = map[dk] || [];
    const outside = d.getMonth() !== m;
    const cls = ["sched-mcell"];
    if(outside) cls.push("outside");
    if(isToday(dk)) cls.push("today");
    if(dk === viewState.dateKey) cls.push("selected");
    if(d.getDay() === 0) cls.push("holiday");
    if(d.getDay() === 6) cls.push("sat");
    const dots = [...new Set(occs.map(o => o.color).filter(Boolean))].slice(0, 3);
    cells.push(`
      <button type="button" class="${cls.join(" ")}" data-goday="${esc(dk)}">
        <span class="sched-mcell-num">${d.getDate()}</span>
        ${occs.length ? `
          <span class="sched-mcell-marks">
            ${showCount
              ? `<span class="sched-mcell-count">${occs.length}</span>`
              : `<span class="sched-mcell-dot"></span>`}
            ${dots.map(c => `<span class="sched-mcell-dot" style="background:${esc(c)}"></span>`).join("")}
          </span>` : ""}
      </button>`);
  }

  const selected = map[viewState.dateKey] || [];
  return `
    <div class="sched-month">
      <div class="sched-mgrid sched-mgrid-head">${WEEKDAYS_JA.map((w, i) => `<span class="sched-mwd${i === 0 ? " holiday" : ""}${i === 6 ? " sat" : ""}">${w}</span>`).join("")}</div>
      <div class="sched-mgrid">${cells.join("")}</div>
      <div class="sched-month-list">
        <div class="sched-month-list-title">${esc(formatDateLabel(viewState.dateKey))}の予定（${selected.length}件）</div>
        ${selected.length
          ? selected.map(o => occurrenceRowHTML(o)).join("")
          : `<div class="sched-empty">予定はありません。</div>`}
        <button type="button" class="sched-mini-btn sched-block-btn" data-goday-open="${esc(viewState.dateKey)}">この日の日表示を開く ›</button>
      </div>
    </div>`;
}

/* ================= 予定1件の行（一覧用） ================= */

export function occurrenceRowHTML(occ, opts){
  const showDate = opts && opts.showDate;
  const finished = opts && opts.finished;
  const time = occ.allDay || !occ.start ? "終日" : (occ.end ? `${occ.start}〜${occ.end}` : occ.start);
  return `
    <button type="button" class="sched-row${finished ? " finished" : ""}" data-occ="${esc(occ.key)}" style="${occ.color ? `--sched-ev-color:${esc(occ.color)}` : ""}">
      <span class="sched-row-bar"></span>
      <span class="sched-row-time">${showDate ? `${esc(formatDateLabel(occ.dateKey))} ` : ""}${esc(time)}</span>
      <span class="sched-row-main">
        <span class="sched-row-title">${esc(occ.title)}</span>
        ${occ.location ? `<span class="sched-row-sub">${esc(occ.location)}</span>` : ""}
      </span>
      <span class="sched-row-marks">
        ${occ.routine ? `<span class="sched-tag routine">ルーティン</span>` : ""}
        ${occ.overridden ? `<span class="sched-tag">変更あり</span>` : ""}
        ${occ.googleEventId ? `<span class="sched-tag google">G</span>` : ""}
      </span>
    </button>`;
}

/* ================= 週間ルーティン一覧 ================= */

export function routineViewHTML(){
  const buckets = routinesByWeekday();
  const total = buckets.reduce((n, b) => n + b.length, 0);
  return `
    <div class="sched-routine">
      <div class="sched-routine-intro">曜日ごとに登録した予定は、削除するまで毎週自動で表示されます。特定の日だけ変えたいときは、その日の予定を開いて「この回だけ」を選んでください。</div>
      ${buckets.map((list, dow) => `
        <div class="sched-routine-day">
          <div class="sched-routine-head">
            <span class="sched-routine-dow${dow === 0 ? " holiday" : ""}${dow === 6 ? " sat" : ""}">${WEEKDAYS_JA[dow]}曜日</span>
            <button type="button" class="sched-mini-btn" data-routine-add="${dow}">＋ 追加</button>
          </div>
          ${list.length ? list.map(s => {
            const start = timePartOf(s.startDateTime);
            const end = timePartOf(s.endDateTime);
            return `
              <button type="button" class="sched-row" data-routine="${esc(s.id)}" style="${s.color ? `--sched-ev-color:${esc(s.color)}` : ""}">
                <span class="sched-row-bar"></span>
                <span class="sched-row-time">${s.allDay ? "終日" : esc(end ? `${start}〜${end}` : start)}</span>
                <span class="sched-row-main">
                  <span class="sched-row-title">${esc(s.title)}</span>
                  <span class="sched-row-sub">${esc(recurrenceLabel(s.recurrenceRule))}${(s.reminders || []).length ? ` ・ 通知 ${esc((s.reminders || []).map(reminderLabel).join("、"))}` : ""}</span>
                </span>
                <span class="sched-row-marks">${s.googleEventId ? `<span class="sched-tag google">G</span>` : ""}</span>
              </button>`;
          }).join("") : `<div class="sched-empty sched-empty-sm">予定なし</div>`}
        </div>`).join("")}
      ${total ? "" : `<div class="sched-empty">まだ週間ルーティンがありません。曜日の「＋ 追加」から登録してください。</div>`}
    </div>`;
}

/* ================= イベント配線 ================= */

// 描画後のDOMへ、共通のタップ操作とスクロール位置の復元を配線する。
// onChange は保存が発生したときに呼ばれる再描画コールバック
export function bindViewEvents(root, onChange){
  const rerender = () => { if(onChange) onChange(); };

  // 予定ブロック／行のタップ → 詳細（編集）モーダル。
  // スクロール中に指が離れたときは開かないよう、押した位置から大きく
  // 動いていたらタップとして扱わない
  root.querySelectorAll("[data-occ]").forEach(el => {
    let downY = null, downX = null;
    el.addEventListener("pointerdown", (e) => { downY = e.clientY; downX = e.clientX; }, { passive: true });
    el.addEventListener("click", (e) => {
      if(downY !== null && (Math.abs(e.clientY - downY) > 10 || Math.abs(e.clientX - downX) > 10)){
        downY = downX = null;
        return;
      }
      downY = downX = null;
      e.preventDefault();
      const [scheduleId, occDate] = String(el.dataset.occ).split("@");
      openScheduleEditor({ scheduleId, occDateKey: occDate, onSaved: rerender });
    });
  });

  // 週間ルーティンの行タップ → そのルーティン自体の編集
  root.querySelectorAll("[data-routine]").forEach(el => el.onclick = () => {
    openScheduleEditor({ scheduleId: el.dataset.routine, routine: true, onSaved: rerender });
  });
  root.querySelectorAll("[data-routine-add]").forEach(el => el.onclick = () => {
    openScheduleEditor({ routine: true, byday: [Number(el.dataset.routineAdd)], defaults: {}, onSaved: rerender,
      dateKey: nextKeyForWeekday(Number(el.dataset.routineAdd)) });
  });

  // 空き時間のタップ → その時刻を初期値にして新規作成
  root.querySelectorAll("[data-newhour]").forEach(el => el.onclick = () => {
    const h = Number(el.dataset.newhour);
    openScheduleEditor({
      dateKey: viewState.dateKey,
      defaults: { start: `${String(h).padStart(2, "0")}:00`, end: `${String(Math.min(23, h + 1)).padStart(2, "0")}:00` },
      onSaved: rerender,
    });
  });

  // 日付タップ → その日へ移動
  root.querySelectorAll("[data-goday]").forEach(el => el.onclick = () => {
    const dk = el.dataset.goday;
    if(viewState.view === "month" && viewState.dateKey !== dk){
      // 月表示では1タップ目でその日を選択（下の一覧が切り替わる）
      viewState.dateKey = dk;
      rerender();
      return;
    }
    setView("day", dk);
    rerender();
  });
  root.querySelectorAll("[data-goday-open]").forEach(el => el.onclick = () => {
    setView("day", el.dataset.godayOpen);
    rerender();
  });

  setupTimelineScroll(root);
}

function nextKeyForWeekday(dow){
  for(let i = 0; i < 7; i++){
    const key = addDaysKey(todayKey(), i);
    if(parseDateKey(key).getDay() === dow) return key;
  }
  return todayKey();
}

/* ---- タイムラインのスクロール位置 ----
   予定の追加・Googleカレンダー同期・状態更新などで画面を描き直しても、
   ユーザーが見ていた位置をそのまま保つ。位置を初期状態へ戻すのは
   「日付を変えた」「表示モードを変えた」「今日ボタンを押した」ときだけ
   （＝setView / shiftView / goToday から resetTimelineScroll を呼ぶ）。 */

// null = 次の描画で初期位置を出し直す。数値 = その位置を復元する
let timelineScrollTop = null;

// 日表示は必ず0:00（＝0px）から。現在時刻へ自動でスクロールはしない。
// 週表示は従来どおり、朝または現在時刻の少し手前から見せる
function initialScrollTop(isWeek){
  if(!isWeek) return 0;
  const now = new Date();
  const targetHour = viewState.dateKey === todayKey() ? Math.max(0, now.getHours() - 1) : 7;
  return targetHour * WEEK_HOUR_H;
}

export function resetTimelineScroll(){ timelineScrollTop = null; }

// 初期位置の出し直し待ちかどうか。待ちのあいだは、内容が同じ再描画でも
// 画面を作り直して初期位置を適用する必要がある（同じ日で「今日」を押した
// ときなど、表示内容がまったく変わらないケースのため）
export function timelineScrollPending(){ return timelineScrollTop === null; }

function setupTimelineScroll(root){
  const timeline = root.querySelector("#sched-timeline") || root.querySelector("#sched-week-body");
  // 月表示・ルーティン表示にはタイムラインがない
  if(!timeline){ timelineScrollTop = 0; return; }
  const isWeek = timeline.id === "sched-week-body";
  if(timelineScrollTop === null) timelineScrollTop = initialScrollTop(isWeek);
  // 再描画でDOMが作り直された直後は 0 から始まるので、覚えていた位置へ戻す。
  // 高さはpxで指定済みなのでこの時点で確定していて、ガクつきは起きない
  if(timeline.scrollTop !== timelineScrollTop) timeline.scrollTop = timelineScrollTop;
  timeline.addEventListener("scroll", () => {
    // 作り直されて外れた古い枠のイベントは無視する
    if(timeline.isConnected) timelineScrollTop = timeline.scrollTop;
  }, { passive: true });
}

export { HOUR_H, WEEK_HOUR_H, viewState };
