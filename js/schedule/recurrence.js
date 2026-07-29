/* =========================================================================
   繰り返し設定（RRULE）の組み立て・解析・展開。

   アプリ内では繰り返しを RFC 5545 の RRULE 文字列そのままで保持する
   （例: "RRULE:FREQ=WEEKLY;BYDAY=MO,WE"）。Googleカレンダーの
   recurrence フィールドがまさにこの形式なので、同期時に変換不要で
   そのまま往復できる。

   対応しているのは、アプリのUIから作れる範囲（毎日／毎週／毎月／毎年／
   平日のみ／土日のみ／指定曜日／カスタム）＋Google側から流れてくる
   一般的なパターン（INTERVAL / COUNT / UNTIL / BYDAY / BYMONTHDAY /
   BYMONTH）に限る。未対応の複雑なRRULE（BYSETPOSなど）は、
   「最初の1回だけの予定」として安全側に倒して扱う。
   ========================================================================= */
import { WEEKDAYS_JA, WEEKDAY_RRULE, dateKeyOf, diffDaysKey, parseDateKey, pad2 } from './util.js';

export const RECURRENCE_PRESETS = [
  { key: "none",    label: "繰り返さない" },
  { key: "daily",   label: "毎日" },
  { key: "weekly",  label: "毎週" },
  { key: "monthly", label: "毎月" },
  { key: "yearly",  label: "毎年" },
  { key: "weekday", label: "平日のみ（月〜金）" },
  { key: "weekend", label: "土日のみ" },
  { key: "bydays",  label: "指定曜日" },
  { key: "custom",  label: "カスタム" },
];

/* ---- 解析 ---- */

// "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;INTERVAL=2" →
// { freq:"WEEKLY", interval:2, byday:["MO","WE"], bymonthday:[], bymonth:[], count:0, until:"" }
export function parseRRule(rule){
  const spec = { freq: "", interval: 1, byday: [], bymonthday: [], bymonth: [], count: 0, until: "" };
  const body = String(rule || "").replace(/^RRULE:/i, "").trim();
  if(!body) return spec;
  body.split(";").forEach(part => {
    const [rawK, rawV] = part.split("=");
    if(!rawK || rawV == null) return;
    const k = rawK.trim().toUpperCase();
    const v = rawV.trim();
    if(k === "FREQ") spec.freq = v.toUpperCase();
    else if(k === "INTERVAL") spec.interval = Math.max(1, parseInt(v, 10) || 1);
    else if(k === "COUNT") spec.count = Math.max(0, parseInt(v, 10) || 0);
    else if(k === "UNTIL") spec.until = normalizeUntil(v);
    // BYDAYの "2MO"（第2月曜）のような序数付き指定には未対応なので曜日部分だけ拾う
    else if(k === "BYDAY") spec.byday = v.split(",").map(s => s.trim().toUpperCase().slice(-2)).filter(s => WEEKDAY_RRULE.includes(s));
    else if(k === "BYMONTHDAY") spec.bymonthday = v.split(",").map(s => parseInt(s, 10)).filter(n => n >= 1 && n <= 31);
    else if(k === "BYMONTH") spec.bymonth = v.split(",").map(s => parseInt(s, 10)).filter(n => n >= 1 && n <= 12);
  });
  return spec;
}

// UNTILは "20261231T235959Z"（UTC）または "20261231" の形式で届く。
// アプリ内ではローカル日付キー "YYYY-MM-DD" に丸めて保持する
function normalizeUntil(v){
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v);
  if(!m) return "";
  if(m[7]){
    // UTC表記はローカルタイムの日付へ変換してから丸める
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
    return dateKeyOf(d);
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/* ---- 組み立て ---- */

export function buildRRule(spec){
  if(!spec || !spec.freq || spec.freq === "NONE") return "";
  const parts = [`FREQ=${spec.freq}`];
  if(spec.interval && spec.interval > 1) parts.push(`INTERVAL=${spec.interval}`);
  if(spec.byday && spec.byday.length) parts.push(`BYDAY=${spec.byday.join(",")}`);
  if(spec.bymonth && spec.bymonth.length) parts.push(`BYMONTH=${spec.bymonth.join(",")}`);
  if(spec.bymonthday && spec.bymonthday.length) parts.push(`BYMONTHDAY=${spec.bymonthday.join(",")}`);
  if(spec.count) parts.push(`COUNT=${spec.count}`);
  else if(spec.until) parts.push(`UNTIL=${spec.until.replace(/-/g, "")}T235959Z`);
  return `RRULE:${parts.join(";")}`;
}

// プリセット（UIの選択肢）＋基準日から仕様を作る。
// opts.byday は "bydays"（指定曜日）で選ばれた曜日番号の配列 [0..6]
export function presetToSpec(preset, dateKey, opts){
  const d = parseDateKey(dateKey);
  const o = opts || {};
  const base = { freq: "", interval: Math.max(1, o.interval || 1), byday: [], bymonthday: [], bymonth: [], count: o.count || 0, until: o.until || "" };
  switch(preset){
    case "daily":   return { ...base, freq: "DAILY" };
    case "weekly":  return { ...base, freq: "WEEKLY", byday: [WEEKDAY_RRULE[d.getDay()]] };
    case "monthly": return { ...base, freq: "MONTHLY", bymonthday: [d.getDate()] };
    case "yearly":  return { ...base, freq: "YEARLY", bymonth: [d.getMonth() + 1], bymonthday: [d.getDate()] };
    case "weekday": return { ...base, freq: "WEEKLY", byday: ["MO", "TU", "WE", "TH", "FR"] };
    case "weekend": return { ...base, freq: "WEEKLY", byday: ["SA", "SU"] };
    case "bydays": {
      const days = (o.byday && o.byday.length ? o.byday : [d.getDay()]).map(n => WEEKDAY_RRULE[n]);
      return { ...base, freq: "WEEKLY", byday: [...new Set(days)] };
    }
    case "custom":  return { ...base, freq: (o.freq || "WEEKLY").toUpperCase(), byday: (o.byday || []).map(n => WEEKDAY_RRULE[n]) };
    default:        return base;
  }
}

// 既存のRRULEがどのプリセットに当たるかを逆引きする（編集画面の初期選択用）
export function specToPreset(spec){
  if(!spec || !spec.freq) return "none";
  const days = (spec.byday || []).slice().sort().join(",");
  if(spec.interval > 1 || spec.count || spec.until) return "custom";
  if(spec.freq === "DAILY") return "daily";
  if(spec.freq === "MONTHLY") return "monthly";
  if(spec.freq === "YEARLY") return "yearly";
  if(spec.freq === "WEEKLY"){
    if(days === "FR,MO,TH,TU,WE") return "weekday";
    if(days === "SA,SU") return "weekend";
    if((spec.byday || []).length <= 1) return "weekly";
    return "bydays";
  }
  return "custom";
}

// 人が読める繰り返しラベル（「毎週 月・水」など）
export function recurrenceLabel(rule){
  if(!rule) return "繰り返しなし";
  const spec = parseRRule(rule);
  if(!spec.freq) return "繰り返しなし";
  const every = spec.interval > 1 ? `${spec.interval}` : "";
  const dayNames = (spec.byday || []).map(code => WEEKDAYS_JA[WEEKDAY_RRULE.indexOf(code)]).filter(Boolean).join("・");
  let label = "";
  if(spec.freq === "DAILY") label = every ? `${every}日ごと` : "毎日";
  else if(spec.freq === "WEEKLY") label = `${every ? `${every}週ごと` : "毎週"}${dayNames ? ` ${dayNames}` : ""}`;
  else if(spec.freq === "MONTHLY") label = `${every ? `${every}ヶ月ごと` : "毎月"}${spec.bymonthday.length ? ` ${spec.bymonthday.join("・")}日` : ""}`;
  else if(spec.freq === "YEARLY") label = every ? `${every}年ごと` : "毎年";
  else label = "繰り返し";
  if(spec.count) label += `（全${spec.count}回）`;
  else if(spec.until) label += `（${spec.until.replace(/-/g, "/")}まで）`;
  return label;
}

/* ---- 展開 ----
   繰り返し予定が「その日に発生するか」を判定する。COUNT指定がある場合だけ
   開始日から数え上げる必要があるため、countOccurrencesBefore()で数える
   （最大2000回で打ち切り、無限ループを防ぐ）*/

const MAX_COUNT_SCAN = 2000;

export function occursOn(rule, startKey, targetKey){
  if(targetKey < startKey) return false;
  if(!rule) return targetKey === startKey;
  const spec = parseRRule(rule);
  if(!spec.freq) return targetKey === startKey;
  if(spec.until && targetKey > spec.until) return false;
  if(!matchesPattern(spec, startKey, targetKey)) return false;
  if(spec.count){
    const index = occurrenceIndex(spec, startKey, targetKey);
    if(index < 0 || index >= spec.count) return false;
  }
  return true;
}

function matchesPattern(spec, startKey, targetKey){
  const start = parseDateKey(startKey);
  const target = parseDateKey(targetKey);
  const interval = Math.max(1, spec.interval || 1);
  if(spec.freq === "DAILY"){
    return diffDaysKey(startKey, targetKey) % interval === 0;
  }
  if(spec.freq === "WEEKLY"){
    const days = spec.byday && spec.byday.length ? spec.byday : [WEEKDAY_RRULE[start.getDay()]];
    if(!days.includes(WEEKDAY_RRULE[target.getDay()])) return false;
    // 週の区切りは日曜始まり。開始日を含む週から数えて interval 週ごと
    const startWeek = Math.floor((start.getTime() - start.getDay() * 86400000) / 86400000);
    const targetWeek = Math.floor((target.getTime() - target.getDay() * 86400000) / 86400000);
    return Math.round((targetWeek - startWeek) / 7) % interval === 0;
  }
  if(spec.freq === "MONTHLY"){
    const days = spec.bymonthday && spec.bymonthday.length ? spec.bymonthday : [start.getDate()];
    if(!days.includes(target.getDate())) return false;
    const months = (target.getFullYear() - start.getFullYear()) * 12 + (target.getMonth() - start.getMonth());
    return months >= 0 && months % interval === 0;
  }
  if(spec.freq === "YEARLY"){
    const months = spec.bymonth && spec.bymonth.length ? spec.bymonth : [start.getMonth() + 1];
    const days = spec.bymonthday && spec.bymonthday.length ? spec.bymonthday : [start.getDate()];
    if(!months.includes(target.getMonth() + 1) || !days.includes(target.getDate())) return false;
    const years = target.getFullYear() - start.getFullYear();
    return years >= 0 && years % interval === 0;
  }
  return targetKey === startKey;
}

// 開始日を0番目として、targetKeyが何番目の発生かを返す（該当しないなら-1）
function occurrenceIndex(spec, startKey, targetKey){
  let index = 0;
  let cursor = parseDateKey(startKey);
  const target = parseDateKey(targetKey);
  for(let i = 0; i < MAX_COUNT_SCAN && cursor <= target; i++){
    const key = dateKeyOf(cursor);
    if(matchesPattern(spec, startKey, key)){
      if(key === targetKey) return index;
      index++;
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }
  return -1;
}

// Google Calendar API へ送る UNTIL 用のUTC文字列（"YYYYMMDDT235959Z"）
export function untilToGoogle(untilKey){
  if(!untilKey) return "";
  return `${untilKey.replace(/-/g, "")}T235959Z`;
}

export function formatMonthDay(monthIndex, day){ return `${monthIndex + 1}/${pad2(day)}`; }
