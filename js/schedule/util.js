/* =========================================================================
   予定（Schedule）／タスク（Task）機能の共通ユーティリティ。
   日付キーは常にローカルタイムの "YYYY-MM-DD"、時刻は "HH:MM"、
   日時は "YYYY-MM-DDTHH:MM"（ローカルタイム・タイムゾーン情報なし）で
   統一して扱う。UTCへの変換はGoogleカレンダーとのやり取り
   （js/schedule/gsync.js）でのみ行う。
   ========================================================================= */

export const WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"];
export const WEEKDAY_RRULE = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// core.jsのesc()は文字列以外を渡すと例外になるため、この機能では
// null/undefined/数値も安全に扱える独自版を使う
export function esc(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

export function pad2(n){ return String(n).padStart(2, "0"); }

export function ymd(y, m, d){ return `${y}-${pad2(m + 1)}-${pad2(d)}`; }

export function dateKeyOf(date){ return ymd(date.getFullYear(), date.getMonth(), date.getDate()); }

export function todayKey(){ return dateKeyOf(new Date()); }

// "YYYY-MM-DD" → ローカルタイムのDate（0時0分）。new Date("2026-07-29")は
// UTC解釈になり日本時間では前日になってしまうため、必ずこちらを使う
export function parseDateKey(key){
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(key || "");
  if(!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function addDays(date, n){
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

export function addDaysKey(key, n){ return dateKeyOf(addDays(parseDateKey(key), n)); }

// 週の開始は日曜（アプリ内の月グリッド・曜日並びと揃える）
export function startOfWeek(date){ return addDays(date, -date.getDay()); }

// 2つの日付キーの差（日数）。同じなら0、bの方が後なら正
export function diffDaysKey(a, b){
  const da = parseDateKey(a), db = parseDateKey(b);
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

/* ---- ローカル日時文字列（"YYYY-MM-DDTHH:MM"）---- */

export function toLocalISO(date){
  return `${dateKeyOf(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function parseLocalISO(s){
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(s || "");
  if(!m) return parseDateKey(s);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
}

// 日時文字列から日付部分だけを取り出す（"2026-07-29T19:00" → "2026-07-29"）
export function datePartOf(s){ return String(s || "").slice(0, 10); }

// 日時文字列から "HH:MM" を取り出す。日付のみ（終日）なら空文字
export function timePartOf(s){
  const m = /[T ](\d{2}:\d{2})/.exec(s || "");
  return m ? m[1] : "";
}

export function joinLocalISO(dateKey, hhmm){ return `${dateKey}T${hhmm || "00:00"}`; }

/* ---- "HH:MM" と分の相互変換 ---- */

export function timeToMinutes(hhmm){
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  if(!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

// 分を "HH:MM" に。終了時刻として 1440分（24:00）もそのまま表現できる
export function minutesToTime(min){
  const v = Math.max(0, Math.min(24 * 60, Math.round(min)));
  return `${pad2(Math.floor(v / 60))}:${pad2(v % 60)}`;
}

// 開始時刻用。0〜23:59の範囲に丸める
export function clampTime(min){
  const v = Math.max(0, Math.min(23 * 60 + 59, Math.round(min)));
  return `${pad2(Math.floor(v / 60))}:${pad2(v % 60)}`;
}

export function genId(prefix){
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function nowISO(){ return new Date().toISOString(); }

// "2026-07-29" → "7月29日(水)"
export function formatDateLabel(key, opts){
  const d = parseDateKey(key);
  const withYear = opts && opts.withYear;
  return `${withYear ? `${d.getFullYear()}年` : ""}${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS_JA[d.getDay()]})`;
}

// 予定の時間帯ラベル。終日予定は「終日」
export function timeRangeLabel(occ){
  if(occ.allDay) return "終日";
  if(!occ.start) return "終日";
  return occ.end ? `${occ.start}〜${occ.end}` : occ.start;
}

// 30分刻みへスナップする（タイムラインのドラッグ操作用）
export function snapMinutes(min, step){
  const s = step || 15;
  return Math.round(min / s) * s;
}

export function debounce(fn, ms){
  let timer = null;
  return function(...args){
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}
