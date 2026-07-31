/* =========================================================================
   🎖️ 週次の達成率ボーナスの判定

   ・1週間の予定達成率80%以上 → 50BP
   ・1週間のタスク達成率100%   → 100BP

   「今週」の途中でも条件を満たした時点で付与し、その週の分は once キーで
   一度きりにする（週が変われば改めて対象になる）。まだ来ていない日の
   予定・タスクを「未達成」として数えると永久に達成できないので、
   集計対象は「週のはじめ〜今日」までとする。

   達成できなかった週について、警告・減点・催促は一切行わない。
   ========================================================================= */
import { bpOnWeeklyScheduleRate, bpOnWeeklyTaskRate, bpWeekKey, bpTodayKey } from './store.js';
import { isScheduleDone } from '../schedule/completion.js';
import { occurrencesForDate } from '../schedule/occurrences.js';
import { tasksForDate } from '../schedule/store.js';
import { addDaysKey } from '../schedule/util.js';

// 週のはじめ（日曜）から今日までの日付キー
function daysThisWeek(){
  const start = bpWeekKey();
  const today = bpTodayKey();
  const out = [];
  let k = start;
  while(k <= today){
    out.push(k);
    k = addDaysKey(k, 1);
    if(out.length > 7) break;
  }
  return out;
}

/* ボーナスの対象とみなすのに必要な最低件数。
   「予定（タスク）を1件だけ登録して完了する」だけで達成率100%になり、
   毎週まとまったBPを取れてしまうのを防ぐための下限。表示上の達成率は
   件数に関わらず出すが、ボーナスの付与はこの件数を満たした週だけ。 */
const MIN_SCHEDULES_FOR_BONUS = 5;
const MIN_TASKS_FOR_BONUS = 5;

// 今週の予定・タスクの達成率を集計して { schedule, task } を返す。
// 対象が0件の場合は判定不能として null を返す（0件で100%扱いにすると、
// 何も登録していない週に自動でボーナスが入ってしまうため）
export function weeklyRates(){
  const days = daysThisWeek();
  let schedTotal = 0, schedDone = 0, taskTotal = 0, taskDone = 0;
  days.forEach(dk => {
    try{
      occurrencesForDate(dk).forEach(o => {
        schedTotal++;
        if(isScheduleDone(o.scheduleId || o.id, dk)) schedDone++;
      });
    }catch(e){}
    try{
      tasksForDate(dk).forEach(t => {
        taskTotal++;
        if(t.doneOnDate) taskDone++;
      });
    }catch(e){}
  });
  return {
    schedule: schedTotal ? schedDone / schedTotal : null,
    scheduleCounts: { done: schedDone, total: schedTotal },
    task: taskTotal ? taskDone / taskTotal : null,
    taskCounts: { done: taskDone, total: taskTotal },
  };
}

// 週次ボーナスの判定・付与。アプリ起動時と、予定／タスクの完了操作のたびに
// 呼ぶ。付与済みの週は store 側の once キーで弾かれるので何度呼んでもよい
export function checkWeeklyBonuses(){
  let rates;
  try{ rates = weeklyRates(); }catch(e){ return; }
  const week = bpWeekKey();
  if(rates.schedule !== null && rates.scheduleCounts.total >= MIN_SCHEDULES_FOR_BONUS){
    bpOnWeeklyScheduleRate(week, rates.schedule);
  }
  if(rates.task !== null && rates.taskCounts.total >= MIN_TASKS_FOR_BONUS){
    bpOnWeeklyTaskRate(week, rates.task);
  }
}

// 画面側で「あと何件でボーナスの対象になるか」を出すための下限
export { MIN_SCHEDULES_FOR_BONUS, MIN_TASKS_FOR_BONUS };
