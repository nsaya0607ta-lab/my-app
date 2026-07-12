/* =========================================================================
   MissionProgress — ミッションの進捗（クリア済みID・選択中カテゴリ・
   最終学習日時）を保持する。個々のミッションの「今どこまで進んだか」は
   保存せず、クリア済みID集合から毎回導出する（missions/index.jsの
   currentMissionFor / categoryProgress を参照）ため、状態がずれる心配がない。
   ========================================================================= */
import { MISSION_CATEGORIES } from './missions/categories.js';

const DEFAULT_CATEGORY = MISSION_CATEGORIES[0].key;

export class MissionProgress {
  constructor(){ this.reset(); }

  reset(){
    this.clearedIds = new Set();
    this.activeCategory = DEFAULT_CATEGORY;
    this.lastStudiedAt = null;
  }

  markCleared(missionId){
    this.clearedIds.add(missionId);
    this.lastStudiedAt = new Date();
  }

  touch(){ this.lastStudiedAt = new Date(); }

  toJSON(){
    return {
      clearedIds: [...this.clearedIds],
      activeCategory: this.activeCategory,
      lastStudiedAt: this.lastStudiedAt ? this.lastStudiedAt.toISOString() : null,
    };
  }

  loadFromJSON(data){
    if(!data || typeof data !== "object") return;
    this.clearedIds = new Set(Array.isArray(data.clearedIds) ? data.clearedIds.filter(s => typeof s === "string") : []);
    this.activeCategory = MISSION_CATEGORIES.some(c => c.key === data.activeCategory) ? data.activeCategory : DEFAULT_CATEGORY;
    this.lastStudiedAt = data.lastStudiedAt ? new Date(data.lastStudiedAt) : null;
  }
}
