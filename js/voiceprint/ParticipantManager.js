/* =========================================================================
   ParticipantManager
   =========================================================================
   「今回のゲームに誰が参加するか」＝ VoiceprintManager に登録された
   メンバーのうち、ゲーム開始画面でチェックを付けた一部だけを扱う、
   1ゲームセッション分の軽い状態管理。

   登録者データそのもの（VoiceprintManager）や話者判定ロジック
   （SpeakerRecognitionService）とは責務を分離し、「今回選ばれているか」
   の状態だけをここで持つ。前回選んだ顔ぶれを次回起動時にも引き継げるよう
   端末ローカルへ保存する（毎回チェックし直す手間を減らすため）。
   ========================================================================= */
import { state } from '../state.js';
import * as VoiceprintManager from './VoiceprintManager.js';

const STORE_BASE_KEY = "iq_selected_participants";

function storageKey() {
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `${STORE_BASE_KEY}::${uid}`;
}

function readSelectedIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey()) || "null");
    return Array.isArray(raw) ? raw : [];
  } catch (e) { return []; }
}

function writeSelectedIds(ids) {
  try { localStorage.setItem(storageKey(), JSON.stringify(ids)); } catch (e) {}
}

// 登録者一覧に対して現在チェックが付いているIDだけを返す（削除済みの登録者は自動的に外れる）
export function getSelectedIds() {
  const validIds = new Set(VoiceprintManager.list().map((r) => r.id));
  return readSelectedIds().filter((id) => validIds.has(id));
}

export function setSelectedIds(ids) {
  const validIds = new Set(VoiceprintManager.list().map((r) => r.id));
  writeSelectedIds((ids || []).filter((id) => validIds.has(id)));
}

export function toggle(id) {
  const cur = new Set(getSelectedIds());
  if (cur.has(id)) cur.delete(id); else cur.add(id);
  setSelectedIds([...cur]);
  return cur.has(id);
}

// 実際にゲームへ参加する登録者のフルレコード（名前・声紋データ込み）
export function getSelectedParticipants() {
  const ids = new Set(getSelectedIds());
  return VoiceprintManager.list().filter((r) => ids.has(r.id));
}

export function selectedCount() {
  return getSelectedIds().length;
}
