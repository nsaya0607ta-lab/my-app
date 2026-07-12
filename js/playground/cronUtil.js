/* =========================================================================
   cron行のパース・整形ユーティリティ。crontab コマンド（commands/crontab.js）と
   シナリオモードのゴール判定（scenarios/goalCheckers.js）の両方から使う。
   実際のcronほど厳密な構文チェックはせず、LPIC Level1の学習に必要な
   「分 時 日 月 曜日 コマンド」の5フィールド形式を認識できれば十分とする。
   ========================================================================= */

const FIELD_RE = /^[\d*/,\-]+$/;

// 1行をパースして {min,hour,dom,mon,dow,command,raw} を返す。
// 空行・コメント行は null、5フィールド未満や不正な文字を含む行は {error:true, raw} を返す。
export function parseCronLine(line){
  const raw = line.replace(/\s+$/, "");
  const trimmed = raw.trim();
  if(!trimmed || trimmed.startsWith("#")) return null;
  const parts = trimmed.split(/\s+/);
  if(parts.length < 6) return { error: true, raw: trimmed };
  const [min, hour, dom, mon, dow, ...cmdParts] = parts;
  if(![min, hour, dom, mon, dow].every(f => FIELD_RE.test(f))) return { error: true, raw: trimmed };
  return { min, hour, dom, mon, dow, command: cmdParts.join(" "), raw: trimmed };
}

// crontab -e / crontab FILE / crontab - の本文全体をパースする。
// 戻り値: { jobs:[...有効な行], errors:[...不正だった行の原文] }
export function parseCrontabText(text){
  const jobs = [];
  const errors = [];
  (text || "").split("\n").forEach(line => {
    const parsed = parseCronLine(line);
    if(parsed === null) return;
    if(parsed.error) errors.push(parsed.raw);
    else jobs.push(parsed);
  });
  return { jobs, errors };
}

export function formatCrontabText(jobs){
  if(!jobs || !jobs.length) return "";
  return jobs.map(j => `${j.min} ${j.hour} ${j.dom} ${j.mon} ${j.dow} ${j.command}`).join("\n") + "\n";
}

// シナリオのゴール判定用：登録済みジョブのどれかが spec の条件を満たすか。
// spec の各フィールドは省略可（省略したフィールドは判定しない＝ワイルドカード扱い）。
export function cronJobsMatch(jobs, spec){
  return (jobs || []).some(job => {
    if(spec.min !== undefined && job.min !== spec.min) return false;
    if(spec.hour !== undefined && job.hour !== spec.hour) return false;
    if(spec.dom !== undefined && job.dom !== spec.dom) return false;
    if(spec.mon !== undefined && job.mon !== spec.mon) return false;
    if(spec.dow !== undefined && job.dow !== spec.dow) return false;
    if(spec.commandIncludes && !job.command.includes(spec.commandIncludes)) return false;
    return true;
  });
}
