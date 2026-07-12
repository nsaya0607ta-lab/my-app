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
import s028 from './data/s028-perm-script-exec.js';
import s029 from './data/s029-perm-employee-file.js';
import s030 from './data/s030-perm-investigate-ls.js';
import s031 from './data/s031-perm-explain-755.js';
import s032 from './data/s032-perm-chown-owner.js';
import s033 from './data/s033-perm-chgrp-group.js';
import s034 from './data/s034-perm-chown-owner-group.js';
import s035 from './data/s035-perm-chown-denied.js';
import s036 from './data/s036-perm-su-exit.js';
import s037 from './data/s037-perm-backup-combo.js';
import s038 from './data/s038-job-endless-backup.js';
import s039 from './data/s039-job-safe-stop.js';
import s040 from './data/s040-job-long-task-bg.js';
import s041 from './data/s041-job-heavy-server.js';
import s042 from './data/s042-job-ctrlz-mistake.js';
import s043 from './data/s043-job-background-multitask.js';
import s044 from './data/s044-job-night-batch.js';
import s045 from './data/s045-job-prod-incident.js';
import s046 from './data/s046-lsdir-where-is-file.js';
import s047 from './data/s047-lsdir-hidden-config.js';
import s048 from './data/s048-lsdir-latest-version.js';
import s049 from './data/s049-lsdir-final-check.js';
import s050 from './data/s050-lsdir-newest-file.js';
import s051 from './data/s051-lsdir-disk-usage.js';
import s052 from './data/s052-lsdir-submission-check.js';

export const SCENARIOS = [
  s001, s002, s003, s004, s005, s006, s007, s008, s009, s010, s011, s012, s013, s014, s015,
  s016, s017, s018, s019, s020, s021, s022, s023, s024, s025, s026, s027,
  s028, s029, s030, s031, s032, s033, s034, s035, s036, s037,
  s038, s039, s040, s041, s042, s043, s044, s045,
  s046, s047, s048, s049, s050, s051, s052,
];

// 「権限管理編」のように、番号どおりの物語（ストーリー）として通しで遊ぶ
// ことを想定したシナリオ群。packを持つシナリオは、カテゴリ別の一覧からは
// 除外され、代わりにこの並び順（＝物語の進行順）で1つの章として表示される。
export const PACKS = [
  {
    id: "permissions-newbie",
    icon: "🔐",
    title: "権限管理編",
    subtitle: "新人インフラエンジニアとして入社したあなたへ、社内のあちこちから「困った」が届きます。依頼内容を読み、Linuxコマンドで一つずつ解決していきましょう。",
  },
  {
    id: "file-dir-newbie",
    icon: "📁",
    title: "ファイル・ディレクトリ操作編",
    subtitle: "新人エンジニアのあなたに、先輩や上司からファイル探しや整理整頓の依頼が舞い込みます。ls コマンドを使いこなして、日々のちょっとした「困った」を解決していきましょう。",
  },
];

export function getScenarioById(id){
  return SCENARIOS.find(s => s.id === id) || null;
}

export function nextScenarioId(id){
  const idx = SCENARIOS.findIndex(s => s.id === id);
  if(idx === -1 || idx === SCENARIOS.length - 1) return null;
  return SCENARIOS[idx + 1].id;
}

// カテゴリごとにグルーピングした一覧（シナリオ選択画面用。パックに属する
// シナリオはscenariosByPack()側に表示されるため、ここでは除外する）
export function scenariosByCategory(){
  const groups = [];
  const byCategory = new Map();
  SCENARIOS.filter(s => !s.pack).forEach(s => {
    if(!byCategory.has(s.category)){
      const group = { category: s.category, scenarios: [] };
      byCategory.set(s.category, group);
      groups.push(group);
    }
    byCategory.get(s.category).scenarios.push(s);
  });
  return groups;
}

// パックごとに、物語の進行順（SCENARIOS配列内の並び順）でまとめた一覧
export function scenariosByPack(){
  return PACKS
    .map(pack => ({ ...pack, scenarios: SCENARIOS.filter(s => s.pack === pack.id) }))
    .filter(p => p.scenarios.length);
}
