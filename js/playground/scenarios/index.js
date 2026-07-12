/* =========================================================================
   シナリオレジストリ — data/*.js に定義された個々のシナリオを集約する。
   新しいシナリオを追加する場合は data/ に1ファイル追加し、ここへ import・
   配列への追加を行うだけでよい（100件以上に増えても、この1ファイルだけを
   機械的に伸ばしていけば良い設計）。
   ========================================================================= */
import s001 from './data/s001-report-folder.js';
import s002 from './data/s002-config-backup.js';
import s003 from './data/s003-remove-old-icon.js';
import s004 from './data/s004-log-error-report.js';
import s005 from './data/s005-find-log-files.js';
import s006 from './data/s006-count-csv-rows.js';
import s007 from './data/s007-protect-secret-file.js';
import s008 from './data/s008-symlink-applog.js';
import s009 from './data/s009-set-deploy-env.js';
import s010 from './data/s010-readonly-cron-test.js';
import s011 from './data/s011-access-log-500.js';
import s012 from './data/s012-cleanup-tmp.js';
import s013 from './data/s013-app-backup.js';
import s014 from './data/s014-disk-usage-cleanup.js';
import s015 from './data/s015-kill-runaway-process.js';
import s016 from './data/s016-employee-id-list.js';
import s017 from './data/s017-employee-name-list.js';
import s018 from './data/s018-sales-department-list.js';
import s019 from './data/s019-high-salary-list.js';
import s020 from './data/s020-last-field-salary.js';
import s021 from './data/s021-report-title.js';
import s022 from './data/s022-report-summary-end.js';
import s023 from './data/s023-sales-headcount.js';
import s024 from './data/s024-average-salary.js';
import s025 from './data/s025-highest-salary.js';
import s026 from './data/s026-csv-employee-import.js';
import s027 from './data/s027-formatted-employee-report.js';

export const SCENARIOS = [
  s001, s002, s003, s004, s005, s006, s007, s008, s009, s010, s011, s012, s013, s014, s015,
  s016, s017, s018, s019, s020, s021, s022, s023, s024, s025, s026, s027,
];

export const DIFFICULTY_ORDER = ["初級", "初級〜中級", "中級", "LPIC Level1"];

export function getScenarioById(id){
  return SCENARIOS.find(s => s.id === id) || null;
}

export function nextScenarioId(id){
  const idx = SCENARIOS.findIndex(s => s.id === id);
  if(idx === -1 || idx === SCENARIOS.length - 1) return null;
  return SCENARIOS[idx + 1].id;
}

// 難易度→カテゴリごとにグルーピングした一覧（シナリオ選択画面用）
export function scenariosByDifficulty(){
  return DIFFICULTY_ORDER
    .map(diff => ({ difficulty: diff, scenarios: SCENARIOS.filter(s => s.difficulty === diff) }))
    .filter(g => g.scenarios.length);
}
