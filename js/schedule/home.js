/* =========================================================================
   ホーム画面のカード。

   ・上段「今日の予定」……その日の予定だけを、現在時刻以降 → 終了済みの順で
     並べる。1件も無いときだけ「今日は予定がありません」を出す。見出しを
     押すとカレンダーの日表示へ移動する。
   ・下段「本日のタスク」……時間を持たないチェックリスト。予定とは別テーブル
     （Task）で管理し、完了チェックだけを行う。毎日／平日／毎週の繰り返しにも
     対応していて、繰り返しタスクの完了は日付ごとに記録される。
   ========================================================================= */
import { chappyOnAllSchedulesDone, chappyOnScheduleCompleted, chappyOnTaskCompleted } from '../chappy.js';
import { occurrencesForDate, sortForHome } from './occurrences.js';
import { occurrenceRowHTML } from './views.js';
import { openScheduleEditor } from './editor.js';
import { TASK_REPEAT_LABEL, TASK_REPEAT_SHORT, deleteTask, isTaskDoneOn, setTaskDone, tasksForDate, upsertTask } from './store.js';
import { esc, formatDateLabel, todayKey } from './util.js';
import { isScheduleDone, setScheduleDone } from './completion.js';
import { bpOnAllTasksCompleted, bpOnScheduleCompleted, bpOnTaskCompleted } from '../bp/store.js';
import { checkWeeklyBonuses } from '../bp/weekly.js';

export const HOME_CARD_ID = "sched-home-card";

export function homeCardHTML(){
  return `<div class="gcal-card" id="${HOME_CARD_ID}"></div>`;
}

// 新しいタスクの繰り返し種別（フォームで選択中）。再描画をまたいで保つ
let taskRepeatDraft = "none";

/* opts.onOpenDay(dateKey) … 「今日の予定」見出し／予定行から日表示へ移動する
   opts.onChange()        … データが変わったときの再描画コールバック */
export function renderHomeCard(opts){
  const root = document.getElementById(HOME_CARD_ID);
  if(!root) return;
  const options = opts || {};
  const dk = todayKey();
  const now = new Date();

  const occs = sortForHome(occurrencesForDate(dk), now);
  const finishedFrom = occs.findIndex(o => isFinishedNow(o, now));
  const tasks = tasksForDate(dk);
  const doneCount = tasks.filter(t => t.doneOnDate).length;

  root.innerHTML = `
    <div class="gcal-box sched-home">
      <button type="button" class="sched-home-head" id="sched-home-open">
        <span class="sched-home-title">今日の予定</span>
        <span class="sched-home-date">${esc(formatDateLabel(dk))}</span>
        <span class="sched-home-arrow">›</span>
      </button>

      <div class="sched-home-list">
        ${occs.length
          ? occs.map((o, i) => occLineHTML(o, dk, { finished: i >= 0 && finishedFrom >= 0 && i >= finishedFrom })).join("")
          : `<div class="sched-empty">今日は予定がありません</div>`}
      </div>
      <button type="button" class="sched-add-btn" id="sched-home-add">＋ 予定を追加</button>

      <div class="sched-home-tasks">
        <div class="sched-home-tasks-head">
          <span class="sched-home-tasks-title">本日のタスク</span>
          <span class="sched-home-tasks-count">${doneCount}/${tasks.length}</span>
        </div>
        <div class="sched-task-list">
          ${tasks.length
            ? tasks.map(t => taskRowHTML(t)).join("")
            : `<div class="sched-empty sched-empty-sm">タスクはありません</div>`}
        </div>
        <div class="sched-task-form">
          <input type="text" class="sched-input sched-task-input" id="sched-task-input" placeholder="タスクを追加" maxlength="80">
          <select class="sched-input sched-select sched-task-repeat" id="sched-task-repeat" aria-label="繰り返し">
            ${Object.keys(TASK_REPEAT_SHORT).map(k => `<option value="${k}"${taskRepeatDraft === k ? " selected" : ""}>${esc(TASK_REPEAT_SHORT[k])}</option>`).join("")}
          </select>
          <button type="button" class="sched-task-add" id="sched-task-add" aria-label="タスクを追加">＋</button>
        </div>
      </div>
    </div>`;

  bind(root, options, dk, now);
}

function isFinishedNow(occ, now){
  if(occ.allDay || !occ.start) return false;
  const ref = occ.end || occ.start;
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return ref <= hhmm;
}

/* 予定1件の行＋「完了」チェックボタン。
   予定の行自体は既存の occurrenceRowHTML（<button>）をそのまま使い、
   ボタンの入れ子にならないよう横に並べる形で完了ボタンを添える。
   完了状態はSchedule本体ではなく別テーブル（completion.js）に持つので、
   Googleカレンダーとの同期には一切影響しない */
function occLineHTML(occ, dateKey, opts){
  const done = isScheduleDone(occ.scheduleId, dateKey);
  const row = occurrenceRowHTML(occ, opts).replace(
    'class="sched-row',
    `class="sched-row${done ? " sched-row--done" : ""}`,
  );
  return `
    <div class="sched-occ-line">
      ${row}
      <button type="button" class="sched-done-btn" data-occ-done="${esc(occ.scheduleId)}"
              aria-pressed="${done ? "true" : "false"}"
              aria-label="${done ? "完了を取り消す" : "この予定を完了にする"}"
              title="${done ? "完了を取り消す" : "この予定を完了にする"}">✓</button>
    </div>`;
}

function taskRowHTML(task){
  return `
    <div class="sched-task${task.doneOnDate ? " done" : ""}">
      <input type="checkbox" class="sched-task-check" data-task-toggle="${esc(task.id)}"${task.doneOnDate ? " checked" : ""} aria-label="完了にする">
      <span class="sched-task-text">${esc(task.title)}</span>
      ${task.repeatType !== "none" ? `<span class="sched-tag" title="${esc(TASK_REPEAT_LABEL[task.repeatType] || "")}">${esc(TASK_REPEAT_SHORT[task.repeatType] || "")}</span>` : ""}
      <button type="button" class="sched-task-del" data-task-del="${esc(task.id)}" aria-label="このタスクを削除">×</button>
    </div>`;
}

function bind(root, options, dk, now){
  const openDay = () => { if(options.onOpenDay) options.onOpenDay(dk); };
  root.querySelector("#sched-home-open").onclick = openDay;

  root.querySelector("#sched-home-add").onclick = () => openScheduleEditor({
    dateKey: dk,
    defaults: { start: nextRoundHour(now), end: nextRoundHour(now, 1) },
    onSaved: () => { if(options.onChange) options.onChange(); },
  });

  // 予定行タップ → 詳細モーダル（ホーム画面から直接編集できる）
  root.querySelectorAll("[data-occ]").forEach(el => el.onclick = () => {
    const [scheduleId, occDate] = String(el.dataset.occ).split("@");
    openScheduleEditor({ scheduleId, occDateKey: occDate, onSaved: () => { if(options.onChange) options.onChange(); } });
  });

  // ✅ 予定の完了ボタン。二重タップで報酬が重複しないよう、実際に
  // 「未完了→完了」へ変わったときだけBPを付与する（setScheduleDoneが判定）
  root.querySelectorAll("[data-occ-done]").forEach(btn => btn.onclick = (e) => {
    e.stopPropagation();
    const scheduleId = btn.dataset.occDone;
    const nowDone = btn.getAttribute("aria-pressed") !== "true";
    const changed = setScheduleDone(scheduleId, dk, nowDone);
    if(changed){
      const occ = occurrencesForDate(dk).find(o => o.scheduleId === scheduleId);
      bpOnScheduleCompleted(dk, scheduleId, occ ? occ.title : "");
      checkWeeklyBonuses();
      if(nowDone){
        // 🏠 予定の完了 → チャッピーの経験値・元気アップ（同じ回は1日1回だけ）
        chappyOnScheduleCompleted(dk, scheduleId);
        // その日の予定をぜんぶ終わらせたらボーナス
        const all = occurrencesForDate(dk);
        if(all.length > 0 && all.every(o => isScheduleDone(o.scheduleId, dk))) chappyOnAllSchedulesDone(dk);
      }
    }
    if(options.onChange) options.onChange();
  });

  root.querySelectorAll("[data-task-toggle]").forEach(cb => cb.onchange = () => {
    const id = cb.dataset.taskToggle;
    setTaskDone(id, dk, cb.checked);
    // ✅ 本日のタスク完了 → まるチャピにXP/コイン（同じタスクIDは1日1回だけ）
    if(cb.checked){
      chappyOnTaskCompleted(dk, id);
      // 🎖️ 活動BPも付与（同じタスクの同じ日は1回だけ。チェックを外して
      // 付け直しても再付与されない）
      const t = tasksForDate(dk).find(x => x.id === id);
      bpOnTaskCompleted(dk, id, t ? t.title : "");
      // 🎉 その日のタスクをすべて完了したら追加ボーナス（1日1回）
      const after = tasksForDate(dk);
      if(after.length > 0 && after.every(x => x.doneOnDate)) bpOnAllTasksCompleted(dk);
      checkWeeklyBonuses();
    }
    if(options.onChange) options.onChange();
  });

  root.querySelectorAll("[data-task-del]").forEach(btn => btn.onclick = () => {
    if(!confirm("このタスクを削除しますか？")) return;
    deleteTask(btn.dataset.taskDel);
    if(options.onChange) options.onChange();
  });

  const input = root.querySelector("#sched-task-input");
  const repeatSel = root.querySelector("#sched-task-repeat");
  repeatSel.onchange = () => { taskRepeatDraft = repeatSel.value; };
  const addTask = () => {
    const title = (input.value || "").trim();
    if(!title){ input.focus(); return; }
    upsertTask({ title, dueDate: dk, repeatType: repeatSel.value || "none", completed: false });
    taskRepeatDraft = "none";
    if(options.onChange) options.onChange();
  };
  root.querySelector("#sched-task-add").onclick = addTask;
  input.onkeydown = (e) => { if(e.key === "Enter") addTask(); };
}

// 「＋ 予定を追加」の初期時刻。今の時刻を1時間単位で切り上げる
function nextRoundHour(now, plus){
  const h = Math.min(23, now.getHours() + 1 + (plus || 0));
  return `${String(h).padStart(2, "0")}:00`;
}

// 通知（朝のサマリー）など、他のモジュールから「今日の予定」を参照するための入口
export function todayOccurrences(){
  return sortForHome(occurrencesForDate(todayKey()), new Date());
}

export { isTaskDoneOn };
