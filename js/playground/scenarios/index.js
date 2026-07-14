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
import s053 from './data/s053-gpu-lspci.js';
import s054 from './data/s054-usb-mouse-lsusb.js';
import s055 from './data/s055-wifi-lsmod.js';
import s056 from './data/s056-wifi-modprobe.js';
import s057 from './data/s057-module-modinfo.js';
import s058 from './data/s058-memory-free.js';
import s059 from './data/s059-memory-free-h.js';
import s060 from './data/s060-network-down-combo.js';
import s061 from './data/s061-new-disk-fdisk.js';
import s062 from './data/s062-fhs-web-log.js';
import s063 from './data/s063-fhs-etc-config.js';
import s064 from './data/s064-fhs-home-user-files.js';
import s065 from './data/s065-fhs-root-files.js';
import s066 from './data/s066-fhs-var-disk-pressure.js';
import s067 from './data/s067-fhs-tmp-cleanup.js';
import s068 from './data/s068-fhs-boot-trouble.js';
import s069 from './data/s069-fhs-dev-devices.js';
import s070 from './data/s070-fhs-proc-system-info.js';
import s071 from './data/s071-fhs-sys-device-info.js';
import s072 from './data/s072-pkg-redhat-httpd-install.js';
import s073 from './data/s073-pkg-redhat-rpm-query.js';
import s074 from './data/s074-pkg-redhat-remove.js';
import s075 from './data/s075-pkg-redhat-yum-update.js';
import s076 from './data/s076-pkg-redhat-search.js';
import s077 from './data/s077-pkg-redhat-local-rpm.js';
import s078 from './data/s078-pkg-debian-apache-install.js';
import s079 from './data/s079-pkg-debian-query.js';
import s080 from './data/s080-pkg-debian-remove.js';
import s081 from './data/s081-pkg-debian-update-upgrade.js';
import s082 from './data/s082-pkg-debian-local-deb-fix.js';
import s083 from './data/s083-pkg-debian-search-install.js';
import s084 from './data/s084-disk-df-free-space.js';
import s085 from './data/s085-disk-df-high-usage.js';
import s086 from './data/s086-disk-du-var-total.js';
import s087 from './data/s087-disk-du-home-total.js';
import s088 from './data/s088-disk-du-log-summary.js';
import s089 from './data/s089-disk-du-largest-entry.js';
import s090 from './data/s090-disk-df-du-investigation.js';
import s091 from './data/s091-disk-du-directory-details.js';

export const SCENARIOS = [
  s001, s002, s003, s004, s005, s006, s007, s008, s009, s010, s011, s012, s013, s014, s015,
  s016, s017, s018, s019, s020, s021, s022, s023, s024, s025, s026, s027,
  s028, s029, s030, s031, s032, s033, s034, s035, s036, s037,
  s038, s039, s040, s041, s042, s043, s044, s045,
  s046, s047, s048, s049, s050, s051, s052,
  s053, s054, s055, s056, s057, s058, s059, s060,
  s061,
  s062, s063, s064, s065, s066, s067, s068, s069, s070, s071,
  s072, s073, s074, s075, s076, s077, s078, s079, s080, s081, s082, s083,
  s084, s085, s086, s087, s088, s089, s090, s091,
];

// 「権限管理編」のように、番号どおりの物語（ストーリー）として通しで遊ぶ
// ことを想定したシナリオ群。packを持つシナリオは、カテゴリ別の一覧からは
// 除外され、代わりにこの並び順（＝物語の進行順）で1つの章として表示される。
export const PACKS = [
  {
    id: "permissions-newbie",
    title: "権限管理編",
    subtitle: "新人インフラエンジニアとして入社したあなたへ、社内のあちこちから「困った」が届きます。依頼内容を読み、Linuxコマンドで一つずつ解決していきましょう。",
  },
  {
    id: "file-dir-newbie",
    title: "ファイル・ディレクトリ操作編",
    subtitle: "新人エンジニアのあなたに、先輩や上司からファイル探しや整理整頓の依頼が舞い込みます。ls コマンドを使いこなして、日々のちょっとした「困った」を解決していきましょう。",
  },
  {
    id: "fhs-operations",
    title: "FHS・ディレクトリ構成編",
    subtitle: "FHSはLinuxのディレクトリ構成を統一する標準規格です。障害対応や保守作業の依頼を読み、/etc・/home・/root・/var・/tmp・/boot・/dev・/proc・/sysのどこを確認するべきか判断しましょう。",
  },
  {
    id: "software-management",
    title: "ソフトウェア管理編",
    subtitle: "Red Hat系とDebian系の違いを見極め、rpm・yum・dnf・dpkg・aptを使い分けます。インストール、削除、更新、検索、確認、ローカルパッケージ、依存関係修復を実務形式で練習しましょう。",
  },
  {
    id: "disk-usage-basics",
    title: "ディスク容量確認編",
    subtitle: "dfでファイルシステム全体の空き容量を確認し、duでファイルやディレクトリごとの使用容量を調べます。全体を見るべきか、特定の場所へ絞るべきかを実務シナリオで判断しましょう。",
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

// 同じテーマなのにcategory表記のゆれで別カードになってしまうものを
// 1つのカードにまとめるための正規化。data/*.js側のcategory文字列自体は
// 変えず、一覧表示だけをまとめる。
const CATEGORY_ALIAS = {
  "ファイル管理": "ファイル操作",
  "権限・cron": "権限",
  "プロセス管理": "ジョブ管理・プロセス管理",
};

// カテゴリごとにグルーピングした一覧（シナリオ選択画面用。パックに属する
// シナリオはscenariosByPack()側に表示されるため、ここでは除外する）
export function scenariosByCategory(){
  const groups = [];
  const byCategory = new Map();
  SCENARIOS.filter(s => !s.pack).forEach(s => {
    const category = CATEGORY_ALIAS[s.category] || s.category;
    if(!byCategory.has(category)){
      const group = { category, scenarios: [] };
      byCategory.set(category, group);
      groups.push(group);
    }
    byCategory.get(category).scenarios.push(s);
  });
  return groups;
}

// パックごとに、物語の進行順（SCENARIOS配列内の並び順）でまとめた一覧
export function scenariosByPack(){
  return PACKS
    .map(pack => ({ ...pack, scenarios: SCENARIOS.filter(s => s.pack === pack.id) }))
    .filter(p => p.scenarios.length);
}
