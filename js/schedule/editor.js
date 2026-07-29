/* =========================================================================
   予定の詳細・編集モーダル。

   ・タイトル／開始時間／終了時間／メモ／場所／Google同期状態／繰り返し設定／
     通知を1画面で編集できる。
   ・繰り返し予定の1回ぶんを開いた場合は「この回だけ」「すべての回」を
     選べるようにして、仕様の「一時的な変更も可能」を満たす。
   ・週間ルーティンの登録もこのモーダルを流用する（曜日を複数選べる
     「指定曜日」モードで開く）。
   ========================================================================= */
import {
  RECURRENCE_PRESETS, buildRRule, parseRRule, presetToSpec, recurrenceLabel, specToPreset,
} from './recurrence.js';
import { REMINDER_PRESETS, defaultReminders, reminderLabel } from './reminders.js';
import { resolveConflict } from './gsync.js';
import { SYNC_STATUS_LABEL, clearOccurrenceOverride, deleteOccurrence, deleteSchedule, getSchedule, loadSettings, setOccurrenceOverride, upsertSchedule } from './store.js';
import { WEEKDAYS_JA, addDaysKey, datePartOf, esc, formatDateLabel, genId, timePartOf, todayKey } from './util.js';

// 予定に付けられる色。既存アプリの淡いブルー基調を壊さないよう、
// 彩度を抑えたパステル寄りの並びにしてある
export const SCHEDULE_COLORS = [
  "", "#7986cb", "#039be5", "#33b679", "#f6bf26", "#f4511e", "#e67c73", "#8e24aa", "#616161",
];

let openOverlay = null;

function closeEditor(){
  if(openOverlay){ try{ openOverlay.remove(); }catch(e){} openOverlay = null; }
}

/* opts:
     scheduleId  … 既存の予定を編集するとき
     occDateKey  … 繰り返しの「その回」を開いたときの日付キー
     dateKey     … 新規作成時の初期日付
     routine     … 週間ルーティンとして作る／編集する
     defaults    … { start, end, title } 新規作成時の初期値
     onSaved     … 保存・削除後に呼ばれるコールバック                        */
export function openScheduleEditor(opts){
  const options = opts || {};
  const existing = options.scheduleId ? getSchedule(options.scheduleId) : null;
  const isNew = !existing;
  const settings = loadSettings();

  // 編集対象の作業用コピー
  const baseDate = options.occDateKey || (existing ? datePartOf(existing.startDateTime) : (options.dateKey || todayKey()));
  const initialSpec = existing && existing.recurrenceRule ? parseRRule(existing.recurrenceRule) : null;
  const draft = {
    id: existing ? existing.id : genId("s"),
    title: existing ? existing.title : ((options.defaults && options.defaults.title) || ""),
    description: existing ? existing.description : "",
    location: existing ? existing.location : "",
    dateKey: baseDate,
    start: existing ? (timePartOf(existing.startDateTime) || "09:00") : ((options.defaults && options.defaults.start) || "09:00"),
    end: existing ? (timePartOf(existing.endDateTime) || "10:00") : ((options.defaults && options.defaults.end) || "10:00"),
    allDay: existing ? !!existing.allDay : false,
    color: existing ? existing.color : "",
    reminders: existing ? (existing.reminders || []).slice() : defaultReminders().slice(),
    routine: existing ? !!existing.routine : !!options.routine,
    preset: existing && existing.recurrenceRule ? specToPreset(initialSpec) : (options.routine ? "bydays" : "none"),
    byday: initialSpec && initialSpec.byday.length
      ? initialSpec.byday.map(c => ["SU", "MO", "TU", "WE", "TH", "FR", "SA"].indexOf(c)).filter(i => i >= 0)
      : [new Date(`${baseDate}T00:00`).getDay()],
    interval: initialSpec ? initialSpec.interval : 1,
    until: initialSpec ? initialSpec.until : "",
    freq: initialSpec ? (initialSpec.freq || "WEEKLY") : "WEEKLY",
    // 繰り返しの1回ぶんを編集しているときの適用範囲 "one" | "all"
    scope: "one",
  };

  // 「この回だけ」の一時変更が既にある場合は、その内容を初期表示する
  if(existing && options.occDateKey && existing.overrides && existing.overrides[options.occDateKey]){
    const ov = existing.overrides[options.occDateKey];
    if(ov.title) draft.title = ov.title;
    if(ov.start) draft.start = ov.start;
    if(ov.end) draft.end = ov.end;
    if(ov.location != null) draft.location = ov.location;
    if(ov.description != null) draft.description = ov.description;
  }

  const isRecurringEdit = !!(existing && existing.recurrenceRule && options.occDateKey);

  closeEditor();
  const ov = document.createElement("div");
  ov.className = "modal-ov sched-modal-ov";
  openOverlay = ov;
  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if(e.target === ov) closeEditor(); });

  let error = "";

  const draw = () => {
    ov.innerHTML = `
      <div class="modal sched-editor">
        <div class="modal-title sched-editor-title">${isNew ? (draft.routine ? "ルーティンを追加" : "予定を追加") : (draft.routine ? "ルーティンの詳細" : "予定の詳細")}</div>
        ${error ? `<div class="sched-error">${esc(error)}</div>` : ""}
        ${!isNew ? syncBadgeHTML(existing) : ""}
        ${!isNew && existing.conflict ? conflictHTML(existing) : ""}
        ${isRecurringEdit ? scopeHTML(draft) : ""}

        <label class="sched-field">
          <span class="sched-label">タイトル</span>
          <input type="text" class="sched-input" id="sched-title" maxlength="80" placeholder="例：LPIC学習" value="${esc(draft.title)}">
        </label>

        ${draft.routine ? "" : `
        <label class="sched-field">
          <span class="sched-label">日付</span>
          <input type="date" class="sched-input" id="sched-date" value="${esc(draft.dateKey)}">
        </label>`}

        <button type="button" class="sched-toggle-row" id="sched-allday">
          <span class="sched-label">終日</span>
          <span class="sched-switch${draft.allDay ? " on" : ""}"><span class="sched-switch-knob"></span></span>
        </button>

        ${draft.allDay ? "" : `
        <div class="sched-field">
          <span class="sched-label">時間帯</span>
          <div class="sched-time-row">
            <input type="time" class="sched-input sched-time" id="sched-start" value="${esc(draft.start)}">
            <span class="sched-time-sep">〜</span>
            <input type="time" class="sched-input sched-time" id="sched-end" value="${esc(draft.end)}">
          </div>
        </div>`}

        <label class="sched-field">
          <span class="sched-label">場所</span>
          <input type="text" class="sched-input" id="sched-location" maxlength="80" placeholder="例：オフィス / オンライン" value="${esc(draft.location)}">
        </label>

        <label class="sched-field">
          <span class="sched-label">メモ</span>
          <textarea class="sched-input sched-textarea" id="sched-desc" maxlength="500" rows="2" placeholder="補足メモ">${esc(draft.description)}</textarea>
        </label>

        <div class="sched-field">
          <span class="sched-label">色</span>
          <div class="sched-color-row">
            ${SCHEDULE_COLORS.map(c => `
              <button type="button" class="sched-color-dot${draft.color === c ? " selected" : ""}${c ? "" : " none"}" data-color="${esc(c)}" style="${c ? `background:${esc(c)}` : ""}" aria-label="${c ? "色を選ぶ" : "色なし"}"></button>`).join("")}
          </div>
        </div>

        ${draft.scope === "one" && isRecurringEdit ? "" : recurrenceSectionHTML(draft)}

        <div class="sched-field">
          <span class="sched-label">通知</span>
          <div class="sched-chip-row">
            ${draft.reminders.length
              ? draft.reminders.map((r, i) => `<button type="button" class="sched-chip on" data-rm-del="${i}">${esc(reminderLabel(r))} ×</button>`).join("")
              : `<span class="sched-hint">通知なし</span>`}
          </div>
          <div class="sched-chip-row sched-chip-row-add">
            ${REMINDER_PRESETS.map((p, i) => `<button type="button" class="sched-chip" data-rm-add="${i}">＋${esc(p.label)}</button>`).join("")}
          </div>
          <div class="sched-custom-row">
            <input type="number" class="sched-input sched-num" id="sched-rm-value" min="1" max="240" placeholder="30">
            <select class="sched-input sched-select" id="sched-rm-unit">
              <option value="minutes">分前</option>
              <option value="hours">時間前</option>
              <option value="days">日前</option>
            </select>
            <input type="time" class="sched-input sched-time" id="sched-rm-at" value="21:00" title="「日前」を選んだときの通知時刻">
            <button type="button" class="sched-mini-btn" id="sched-rm-custom">追加</button>
          </div>
        </div>

        <button class="cta" id="sched-save">${isNew ? "登録する" : "保存する"}</button>
        ${isNew ? "" : `<button class="ghost sched-danger" id="sched-delete">削除する</button>`}
        ${!isNew && isRecurringEdit && hasOverride(existing, options.occDateKey) ? `<button class="ghost" id="sched-reset-occ">この回の変更を取り消す</button>` : ""}
        <button class="ghost" id="sched-cancel">閉じる</button>
      </div>`;

    bind();
  };

  const bind = () => {
    const q = (sel) => ov.querySelector(sel);

    q("#sched-title").oninput = (e) => { draft.title = e.target.value; };
    const dateInput = q("#sched-date");
    if(dateInput) dateInput.onchange = (e) => { draft.dateKey = e.target.value || draft.dateKey; };
    q("#sched-location").oninput = (e) => { draft.location = e.target.value; };
    q("#sched-desc").oninput = (e) => { draft.description = e.target.value; };
    q("#sched-allday").onclick = () => { draft.allDay = !draft.allDay; draw(); };
    const startInput = q("#sched-start");
    if(startInput) startInput.onchange = (e) => {
      const prevStart = draft.start;
      draft.start = e.target.value || draft.start;
      // 開始を動かしたら、所要時間を保ったまま終了もついてくる
      if(draft.end && prevStart){
        const delta = toMin(draft.start) - toMin(prevStart);
        draft.end = fromMin(Math.min(24 * 60, toMin(draft.end) + delta));
        const endInput = q("#sched-end");
        if(endInput) endInput.value = draft.end;
      }
    };
    const endInput = q("#sched-end");
    if(endInput) endInput.onchange = (e) => { draft.end = e.target.value || draft.end; };

    ov.querySelectorAll("[data-resolve]").forEach(b => b.onclick = () => {
      resolveConflict(existing.id, b.dataset.resolve);
      closeEditor();
      if(options.onSaved) options.onSaved();
    });

    ov.querySelectorAll("[data-color]").forEach(b => b.onclick = () => { draft.color = b.dataset.color; draw(); });
    ov.querySelectorAll("[data-scope]").forEach(b => b.onclick = () => { draft.scope = b.dataset.scope; draw(); });

    ov.querySelectorAll("[data-rm-del]").forEach(b => b.onclick = () => {
      draft.reminders.splice(Number(b.dataset.rmDel), 1); draw();
    });
    ov.querySelectorAll("[data-rm-add]").forEach(b => b.onclick = () => {
      const p = REMINDER_PRESETS[Number(b.dataset.rmAdd)];
      const next = { unit: p.unit, value: p.value };
      if(p.atTime) next.atTime = p.atTime;
      if(!draft.reminders.some(r => r.unit === next.unit && r.value === next.value && (r.atTime || "") === (next.atTime || ""))){
        draft.reminders.push(next);
      }
      draw();
    });
    q("#sched-rm-custom").onclick = () => {
      const value = parseInt(q("#sched-rm-value").value, 10);
      if(!value || value < 1){ q("#sched-rm-value").focus(); return; }
      const unit = q("#sched-rm-unit").value;
      const next = { unit, value };
      if(unit === "days") next.atTime = q("#sched-rm-at").value || "21:00";
      draft.reminders.push(next);
      draw();
    };

    bindRecurrence(ov, draft, draw);

    q("#sched-cancel").onclick = closeEditor;
    q("#sched-save").onclick = () => save();
    const delBtn = q("#sched-delete");
    if(delBtn) delBtn.onclick = () => remove();
    const resetBtn = q("#sched-reset-occ");
    if(resetBtn) resetBtn.onclick = () => {
      clearOccurrenceOverride(existing.id, options.occDateKey);
      closeEditor();
      if(options.onSaved) options.onSaved();
    };
  };

  const save = () => {
    const title = (draft.title || "").trim();
    if(!title){ error = "タイトルを入力してください。"; draw(); return; }
    if(!draft.allDay && draft.end && draft.start && draft.end <= draft.start){
      error = "終了時間は開始時間より後にしてください。"; draw(); return;
    }
    error = "";

    // 繰り返しの「この回だけ」の一時変更
    if(isRecurringEdit && draft.scope === "one"){
      setOccurrenceOverride(existing.id, options.occDateKey, {
        title,
        start: draft.allDay ? "" : draft.start,
        end: draft.allDay ? "" : draft.end,
        location: draft.location,
        description: draft.description,
      });
      closeEditor();
      if(options.onSaved) options.onSaved();
      return;
    }

    // 週間ルーティンの基準日：新規なら選んだ曜日で一番近い日、編集時は
    // 元の基準日をそのまま保つ（基準日を今日以降へ動かすと、過去の回が
    // 表示されなくなってしまうため）。毎週の繰り返しはBYDAYで決まるので、
    // 基準日の曜日が選択曜日に含まれていなくても表示はずれない
    const anchorKey = draft.routine
      ? (existing ? datePartOf(existing.startDateTime) : nextDateForWeekdays(draft.byday, todayKey()))
      : draft.dateKey;
    const recurrenceRule = buildRecurrenceFromDraft(draft, anchorKey);
    const startDateTime = draft.allDay ? `${anchorKey}T00:00` : `${anchorKey}T${draft.start}`;
    const endDateTime = draft.allDay ? `${anchorKey}T23:59` : `${anchorKey}T${draft.end || draft.start}`;

    upsertSchedule({
      ...(existing || {}),
      id: draft.id,
      title,
      description: draft.description,
      location: draft.location,
      startDateTime,
      endDateTime,
      allDay: draft.allDay,
      color: draft.color,
      reminders: draft.reminders,
      recurrenceRule,
      routine: draft.routine,
      // Google連携がONなら、次の同期でGoogleへ反映されるよう pending にする
      syncStatus: shouldSync() ? "pending" : (existing && existing.googleEventId ? "pending" : "local"),
      // 全体を編集したときは、この回だけの一時変更は残さない
      overrides: isRecurringEdit && draft.scope === "all" ? {} : (existing ? existing.overrides : {}),
    });

    closeEditor();
    if(options.onSaved) options.onSaved();
  };

  const remove = () => {
    if(isRecurringEdit){
      const onlyThis = confirm("この回だけ削除しますか？\n［OK］この回だけ　／　［キャンセル］すべての回を削除");
      if(onlyThis){
        deleteOccurrence(existing.id, options.occDateKey);
      } else {
        if(!confirm("すべての回を削除します。よろしいですか？")) return;
        deleteSchedule(existing.id);
      }
    } else {
      if(!confirm("この予定を削除しますか？")) return;
      deleteSchedule(existing.id);
    }
    closeEditor();
    if(options.onSaved) options.onSaved();
  };

  draw();
}

function shouldSync(){
  const settings = loadSettings();
  return settings.syncEnabled && settings.syncDirection !== "pull";
}

function hasOverride(schedule, occKey){
  return !!(schedule && occKey && schedule.overrides && schedule.overrides[occKey]);
}

function toMin(hhmm){ const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; }
function fromMin(min){ const v = Math.max(0, Math.min(24 * 60, min)); return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`; }

function syncBadgeHTML(schedule){
  const status = schedule.syncStatus || "local";
  const label = SYNC_STATUS_LABEL[status] || status;
  return `<div class="sched-sync-badge sched-sync-${esc(status)}">${esc(label)}${schedule.googleEventId ? "（Googleカレンダー）" : ""}</div>`;
}

/* 「同じ予定が両方で変更されたときは そのつど選ぶ」設定にしている場合に、
   競合した予定を開くと出る選択エリア。どちらを残すかを押すと確定し、
   すぐに再同期して相手側もその内容へ揃える */
function conflictHTML(schedule){
  const c = schedule.conflict || {};
  const line = (label, value) => `<div class="sched-conflict-line"><span>${esc(label)}</span><b>${esc(value || "—")}</b></div>`;
  return `
    <div class="sched-conflict">
      <div class="sched-conflict-title">Googleカレンダー側でも変更されています</div>
      <div class="sched-conflict-cols">
        <div class="sched-conflict-col">
          <div class="sched-conflict-head">このアプリ</div>
          ${line("タイトル", schedule.title)}
          ${line("開始", schedule.startDateTime)}
          ${line("終了", schedule.endDateTime)}
        </div>
        <div class="sched-conflict-col">
          <div class="sched-conflict-head">Google</div>
          ${line("タイトル", c.title)}
          ${line("開始", c.startDateTime)}
          ${line("終了", c.endDateTime)}
        </div>
      </div>
      <div class="sched-conflict-actions">
        <button type="button" class="sched-mini-btn" data-resolve="local">アプリ側を残す</button>
        <button type="button" class="sched-mini-btn" data-resolve="google">Google側を残す</button>
      </div>
    </div>`;
}

function scopeHTML(draft){
  return `
    <div class="sched-scope">
      <button type="button" class="sched-scope-btn${draft.scope === "one" ? " active" : ""}" data-scope="one">この回だけ</button>
      <button type="button" class="sched-scope-btn${draft.scope === "all" ? " active" : ""}" data-scope="all">すべての回</button>
    </div>`;
}

function recurrenceSectionHTML(draft){
  const showDays = draft.preset === "bydays" || (draft.preset === "custom" && draft.freq === "WEEKLY");
  const showCustom = draft.preset === "custom";
  return `
    <div class="sched-field">
      <span class="sched-label">繰り返し</span>
      <select class="sched-input sched-select" id="sched-preset">
        ${RECURRENCE_PRESETS.map(p => `<option value="${p.key}"${draft.preset === p.key ? " selected" : ""}>${esc(p.label)}</option>`).join("")}
      </select>
      ${showDays ? `
        <div class="sched-chip-row sched-weekday-row">
          ${WEEKDAYS_JA.map((w, i) => `<button type="button" class="sched-chip sched-wd${draft.byday.includes(i) ? " on" : ""}" data-wd="${i}">${w}</button>`).join("")}
        </div>` : ""}
      ${showCustom ? `
        <div class="sched-custom-row">
          <select class="sched-input sched-select" id="sched-freq">
            <option value="DAILY"${draft.freq === "DAILY" ? " selected" : ""}>日ごと</option>
            <option value="WEEKLY"${draft.freq === "WEEKLY" ? " selected" : ""}>週ごと</option>
            <option value="MONTHLY"${draft.freq === "MONTHLY" ? " selected" : ""}>月ごと</option>
            <option value="YEARLY"${draft.freq === "YEARLY" ? " selected" : ""}>年ごと</option>
          </select>
          <input type="number" class="sched-input sched-num" id="sched-interval" min="1" max="52" value="${draft.interval || 1}" title="間隔">
          <input type="date" class="sched-input" id="sched-until" value="${esc(draft.until)}" title="繰り返しの終了日（未指定なら無期限）">
        </div>` : ""}
      <div class="sched-hint">${esc(recurrenceLabel(buildRecurrenceFromDraft(draft, draft.dateKey)))}</div>
    </div>`;
}

function bindRecurrence(ov, draft, draw){
  const presetSel = ov.querySelector("#sched-preset");
  if(presetSel) presetSel.onchange = (e) => { draft.preset = e.target.value; draw(); };
  ov.querySelectorAll("[data-wd]").forEach(b => b.onclick = () => {
    const i = Number(b.dataset.wd);
    draft.byday = draft.byday.includes(i) ? draft.byday.filter(x => x !== i) : [...draft.byday, i].sort();
    if(!draft.byday.length) draft.byday = [i];
    draw();
  });
  const freqSel = ov.querySelector("#sched-freq");
  if(freqSel) freqSel.onchange = (e) => { draft.freq = e.target.value; draw(); };
  const intervalInput = ov.querySelector("#sched-interval");
  if(intervalInput) intervalInput.onchange = (e) => { draft.interval = Math.max(1, parseInt(e.target.value, 10) || 1); draw(); };
  const untilInput = ov.querySelector("#sched-until");
  if(untilInput) untilInput.onchange = (e) => { draft.until = e.target.value || ""; draw(); };
}

export function buildRecurrenceFromDraft(draft, anchorKey){
  if(draft.preset === "none") return "";
  const spec = presetToSpec(draft.preset, anchorKey || draft.dateKey, {
    byday: draft.byday,
    interval: draft.interval,
    until: draft.until,
    freq: draft.freq,
  });
  return buildRRule(spec);
}

// 週間ルーティンの基準日：選んだ曜日のうち、今日以降で一番近い日
export function nextDateForWeekdays(byday, fallbackKey){
  const days = (byday && byday.length) ? byday : [new Date().getDay()];
  const start = todayKey();
  for(let i = 0; i < 7; i++){
    const key = addDaysKey(start, i);
    if(days.includes(new Date(`${key}T00:00`).getDay())) return key;
  }
  return fallbackKey || start;
}

export { closeEditor, formatDateLabel };
