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
import { isPopupMenuOpen, openPopupMenu } from '../popupMenu.js';
import { bpOnAllTasksCompleted, bpOnScheduleCompleted, bpOnTaskCompleted } from '../bp/store.js';
import { checkWeeklyBonuses } from '../bp/weekly.js';

export const HOME_CARD_ID = "sched-home-card";

export function homeCardHTML(){
  return `<div class="gcal-card" id="${HOME_CARD_ID}"></div>`;
}

// 入力途中のフォームの状態（繰り返し種別・入力中のタスク名）。
// クラウド同期・Google同期・他カードの更新などで、このカードが描き直される
// ことがあるため、再描画をまたいで必ず持ち越す（打ちかけの文字や選んだ
// 繰り返し設定が勝手に消えないようにするため）
let taskRepeatDraft = "none";
let taskTitleDraft = "";

// 繰り返しメニュー（ポップアップ）を識別する名前
const REPEAT_MENU = "task-repeat";

// 直前に描いた内容と描画先。中身がまったく同じ再描画（自分の書き込みの
// echo・定期同期など）ではDOMを作り直さない。作り直すと開いているメニュー・
// 入力中のカーソル位置・チェック操作中の状態まで巻き添えで失われるため
let lastRoot = null;
let lastHTML = "";

/* opts.onOpenDay(dateKey) … 「今日の予定」見出し／予定行から日表示へ移動する
   opts.onChange()        … データが変わったときの再描画コールバック */
export function renderHomeCard(opts){
  const root = document.getElementById(HOME_CARD_ID);
  if(!root) return;
  // 繰り返しメニューを開いている間は、その操作が終わるまで描き直さない
  if(isPopupMenuOpen(REPEAT_MENU) && root === lastRoot && root.childElementCount) return;
  // タスク入力欄にフォーカスがある間も描き直さない。DOMを作り直すと
  // 入力欄ごと消えてしまい、JSからfocus()をやり直してもiOSでは
  // ソフトキーボードが再表示されない（＝入力中に勝手にキーボードが
  // 閉じたように見える）ため、裏の同期・通知チェックなどによる
  // 再描画では入力を邪魔しないようにする
  const taskInputFocused = document.activeElement && document.activeElement.id === "sched-task-input" && root.contains(document.activeElement);
  if(taskInputFocused && root === lastRoot && root.childElementCount) return;
  const options = opts || {};
  const dk = todayKey();
  const now = new Date();

  const occs = sortForHome(occurrencesForDate(dk), now);
  const finishedFrom = occs.findIndex(o => isFinishedNow(o, now));
  const tasks = tasksForDate(dk);
  const doneCount = tasks.filter(t => t.doneOnDate).length;

  const html = `
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
          <button type="button" class="sched-input sched-task-repeat" id="sched-task-repeat"
                  aria-label="繰り返し設定" aria-haspopup="listbox" aria-expanded="false"
                  title="繰り返し設定">${esc(TASK_REPEAT_SHORT[taskRepeatDraft] || TASK_REPEAT_SHORT.none)}</button>
          <button type="button" class="sched-task-add" id="sched-task-add" aria-label="タスクを追加">＋</button>
        </div>
      </div>
    </div>`;

  // 表示内容に変化がないときはDOMもイベント配線もそのまま使い回す
  if(root === lastRoot && root.childElementCount && html === lastHTML) return;

  // 作り直す場合でも、入力中のカーソル位置だけは元に戻す
  const activeInput = document.activeElement;
  const keepCaret = activeInput && activeInput.id === "sched-task-input" && root.contains(activeInput)
    ? { start: activeInput.selectionStart, end: activeInput.selectionEnd }
    : null;

  root.innerHTML = html;
  lastRoot = root;
  lastHTML = html;

  bind(root, options, dk, now);

  // 入力中の文字は毎回書き戻す（HTMLの比較対象には入れていないので、
  // 1文字打つたびにカードが作り直されることはない）
  const input = root.querySelector("#sched-task-input");
  if(input){
    input.value = taskTitleDraft;
    if(keepCaret){
      input.focus();
      try{ input.setSelectionRange(keepCaret.start, keepCaret.end); }catch(e){}
    }
  }
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
  const repeatBtn = root.querySelector("#sched-task-repeat");

  // 入力中の文字は、このカードが描き直されても消えないよう都度控えておく
  input.oninput = () => { taskTitleDraft = input.value; };

  /* 繰り返し設定メニュー。
     ・click で開く（pointerdown で開くと、その直後に来る click が
       「外側タップ」と解釈されて即座に閉じてしまうため）
     ・開くイベントはここで止め、背景の委譲リスナーへ伝えない
     ・実際の開閉・外側タップ判定は js/popupMenu.js が受け持つ */
  repeatBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if(isPopupMenuOpen(REPEAT_MENU)) return;
    repeatBtn.setAttribute("aria-expanded", "true");
    openPopupMenu({
      name: REPEAT_MENU,
      anchor: repeatBtn,
      label: "繰り返し",
      value: taskRepeatDraft,
      items: Object.keys(TASK_REPEAT_SHORT).map(k => ({
        value: k,
        label: esc(TASK_REPEAT_SHORT[k]),
        sub: TASK_REPEAT_LABEL[k] && TASK_REPEAT_LABEL[k] !== TASK_REPEAT_SHORT[k] ? esc(TASK_REPEAT_LABEL[k]) : "",
      })),
      // 項目を選んだときだけ設定を反映する。ボタンの表示だけを差し替え、
      // カード全体は描き直さない（入力中の内容・スクロール位置を保つため）
      onSelect: (value) => {
        taskRepeatDraft = value in TASK_REPEAT_SHORT ? value : "none";
        // メニューを開いている間にカードが作り直された場合に備えて、
        // 実際に画面に出ているボタンを取り直してから表示を更新する
        const live = document.getElementById("sched-task-repeat") || repeatBtn;
        live.textContent = TASK_REPEAT_SHORT[taskRepeatDraft];
      },
      onClose: () => {
        const live = document.getElementById("sched-task-repeat") || repeatBtn;
        live.setAttribute("aria-expanded", "false");
      },
    });
  };

  const addTask = () => {
    const title = (input.value || "").trim();
    if(!title){ input.focus(); return; }
    upsertTask({ title, dueDate: dk, repeatType: taskRepeatDraft || "none", completed: false });
    taskRepeatDraft = "none";
    taskTitleDraft = "";
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
