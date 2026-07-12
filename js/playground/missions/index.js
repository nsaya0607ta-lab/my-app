/* =========================================================================
   ミッションデータの集約ポイント。
   カテゴリを増やす場合は missions/data/*.js に1ファイル追加し、categories.js
   と、このファイルの import / MISSIONS_BY_CATEGORY へ追加するだけでよい。
   ========================================================================= */
import { MISSION_CATEGORIES, CATEGORY_KEYS } from './categories.js';
import { fileBasicMissions } from './data/fileBasic.js';
import { fileContentMissions } from './data/fileContent.js';
import { searchMissions } from './data/search.js';
import { textMissions } from './data/text.js';
import { permissionsMissions } from './data/permissions.js';
import { systemMissions } from './data/system.js';
import { diskMissions } from './data/disk.js';
import { datetimeMissions } from './data/datetime.js';
import { envMissions } from './data/env.js';
import { redirectMissions } from './data/redirect.js';
import { miscMissions } from './data/misc.js';

export { MISSION_CATEGORIES, CATEGORY_KEYS };

export const MISSIONS_BY_CATEGORY = {
  "file-basic": fileBasicMissions,
  "file-content": fileContentMissions,
  "search": searchMissions,
  "text": textMissions,
  "permissions": permissionsMissions,
  "system": systemMissions,
  "disk": diskMissions,
  "datetime": datetimeMissions,
  "env": envMissions,
  "redirect": redirectMissions,
  "misc": miscMissions,
};

export const MISSIONS = CATEGORY_KEYS.flatMap(key => MISSIONS_BY_CATEGORY[key] || []);

export const MISSIONS_BY_ID = new Map(MISSIONS.map(m => [m.id, m]));

// カテゴリ内で「まだクリアしていない最初のミッション」＝現在挑戦中のミッション
export function currentMissionFor(categoryKey, clearedIds){
  const list = MISSIONS_BY_CATEGORY[categoryKey] || [];
  return list.find(m => !clearedIds.has(m.id)) || null;
}

export function categoryProgress(categoryKey, clearedIds){
  const list = MISSIONS_BY_CATEGORY[categoryKey] || [];
  const done = list.filter(m => clearedIds.has(m.id)).length;
  return { done, total: list.length };
}
