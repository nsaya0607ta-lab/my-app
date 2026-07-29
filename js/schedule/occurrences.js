/* =========================================================================
   予定（Schedule）を「その日に実際に表示される1件」＝オカレンスへ展開する層。

   繰り返し予定は1レコードのまま保持し、表示のたびに必要な日付ぶんだけ
   展開する（＝毎週のルーティンを毎回コピーして保存したりしない）。
   これにより「削除するまで毎週表示される」「一時的な変更ができる」
   「月表示は必要な範囲だけ計算すればよい」の3つを同時に満たす。
   ========================================================================= */
import { occursOn } from './recurrence.js';
import { loadSchedules } from './store.js';
import { addDaysKey, datePartOf, diffDaysKey, timePartOf } from './util.js';

// 日付範囲の展開でスキャンする最大日数（月表示6週＝42日 + 前後の余白で十分）
const MAX_RANGE_DAYS = 400;

function occurrenceFrom(schedule, dateKey){
  const override = (schedule.overrides || {})[dateKey] || {};
  const start = schedule.allDay ? "" : (override.start || timePartOf(schedule.startDateTime));
  let end = schedule.allDay ? "" : (override.end || timePartOf(schedule.endDateTime));
  // 日をまたぐ予定は、その日の表示上は 23:59 までとして扱う
  if(end && start && end < start) end = "23:59";
  return {
    key: `${schedule.id}@${dateKey}`,
    scheduleId: schedule.id,
    dateKey,
    title: override.title || schedule.title,
    description: override.description != null ? override.description : schedule.description,
    location: override.location != null ? override.location : schedule.location,
    start,
    end,
    allDay: !!schedule.allDay,
    color: schedule.color || "",
    recurring: !!schedule.recurrenceRule,
    routine: !!schedule.routine,
    overridden: Object.keys(override).length > 0,
    syncStatus: schedule.syncStatus,
    googleEventId: schedule.googleEventId,
    reminders: schedule.reminders || [],
    schedule,
  };
}

// 1件の予定が、指定日に発生するかどうか
export function scheduleOccursOn(schedule, dateKey){
  if(schedule.deleted) return false;
  if((schedule.exdates || []).includes(dateKey)) return false;
  const startKey = datePartOf(schedule.startDateTime);
  if(schedule.recurrenceRule) return occursOn(schedule.recurrenceRule, startKey, dateKey);
  // 繰り返しなしの予定は、開始日〜終了日の各日に表示する（複数日にまたがる予定）
  const endKey = datePartOf(schedule.endDateTime) || startKey;
  return dateKey >= startKey && dateKey <= endKey;
}

// 指定日のオカレンス一覧（開始時刻の昇順。終日予定が先頭）
export function occurrencesForDate(dateKey, schedules){
  const list = schedules || loadSchedules();
  const out = [];
  list.forEach(s => { if(scheduleOccursOn(s, dateKey)) out.push(occurrenceFrom(s, dateKey)); });
  return sortOccurrences(out);
}

// 日付範囲（両端を含む）のオカレンスを { dateKey: [occ] } のマップで返す。
// 月表示はこのマップだけを使い、その月に必要なデータしか計算しない
export function occurrencesForRange(fromKey, toKey, schedules){
  const list = schedules || loadSchedules();
  const days = Math.min(MAX_RANGE_DAYS, Math.max(0, diffDaysKey(fromKey, toKey)));
  const map = {};
  for(let i = 0; i <= days; i++){
    const dk = addDaysKey(fromKey, i);
    const dayList = [];
    list.forEach(s => { if(scheduleOccursOn(s, dk)) dayList.push(occurrenceFrom(s, dk)); });
    if(dayList.length) map[dk] = sortOccurrences(dayList);
  }
  return map;
}

export function sortOccurrences(list){
  return list.slice().sort((a, b) => {
    if(a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    const sa = a.start || "00:00", sb = b.start || "00:00";
    if(sa !== sb) return sa.localeCompare(sb);
    return (a.title || "").localeCompare(b.title || "", "ja");
  });
}

// ホーム画面の「今日の予定」用の並び：
// ① 現在時刻以降（これから／進行中）の予定を開始時刻の早い順
// ② そのあとに終了済みの予定
export function sortForHome(list, now){
  const ref = now || new Date();
  const finished = [], upcoming = [];
  list.forEach(occ => {
    const endRef = occ.allDay ? "" : (occ.end || occ.start);
    if(endRef && endRef <= `${String(ref.getHours()).padStart(2, "0")}:${String(ref.getMinutes()).padStart(2, "0")}`) finished.push(occ);
    else upcoming.push(occ);
  });
  return [...sortOccurrences(upcoming), ...sortOccurrences(finished)];
}

// 曜日（0=日）ごとの週間ルーティン一覧。routine:true かつ毎週の繰り返しを持つ
// 予定を、BYDAY指定に従って各曜日へ振り分ける
export function routinesByWeekday(schedules){
  const list = (schedules || loadSchedules()).filter(s => s.routine && !s.deleted);
  const buckets = [[], [], [], [], [], [], []];
  const codes = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  list.forEach(s => {
    const rule = s.recurrenceRule || "";
    const m = /BYDAY=([A-Z,]+)/.exec(rule);
    const days = m ? m[1].split(",").map(c => codes.indexOf(c.slice(-2))).filter(i => i >= 0)
                   : [new Date(`${datePartOf(s.startDateTime)}T00:00`).getDay()];
    days.forEach(dow => buckets[dow].push(s));
  });
  return buckets.map(bucket => bucket.slice().sort((a, b) =>
    (timePartOf(a.startDateTime) || "00:00").localeCompare(timePartOf(b.startDateTime) || "00:00")));
}

// タイムライン（日／週表示）で、時間帯が重なる予定を横に並べるための
// レーン割り当て。重なるグループごとに列数を決め、各予定へ列番号を振る
export function assignLanes(occs){
  const timed = occs.filter(o => !o.allDay && o.start);
  const sorted = timed.slice().sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  const result = [];
  let group = [];
  let groupEnd = "";
  const flush = () => {
    if(!group.length) return;
    // グループ内で貪欲にレーンを詰める
    const lanes = [];
    group.forEach(occ => {
      let lane = lanes.findIndex(endTime => endTime <= (occ.start || ""));
      if(lane < 0){ lanes.push(""); lane = lanes.length - 1; }
      lanes[lane] = occ.end || occ.start;
      occ._lane = lane;
    });
    group.forEach(occ => { occ._laneCount = lanes.length; result.push(occ); });
    group = [];
    groupEnd = "";
  };
  sorted.forEach(occ => {
    const end = occ.end || occ.start;
    if(group.length && (occ.start || "") >= groupEnd) flush();
    group.push(occ);
    if(end > groupEnd) groupEnd = end;
  });
  flush();
  return result;
}
