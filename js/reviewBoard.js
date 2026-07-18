/* =========================================================================
   復習掲示板（LPIC-1ホーム画面）
   ・ユーザーが箇条書きで登録した「その日に復習したい内容」を1項目ずつ保存し、
     各項目に対する回答・解説はアプリ内のGemini（/api/gemini/review-answer、
     APIキーはサーバー側のみ）で自動生成する。
   ・登録項目と生成済みの回答は、ログインユーザーごと（未ログインはguest）に
     localStorageへ保存する。js/reviewAI.jsのcmdStatsStorageKey・
     js/render.jsのgcalStorageKeyと同じ「uidをキーに連結する」方式で、
     アカウントを跨いで他人のデータが混ざらないようにしている。
   ・実際の描画・自動切り替えUIはjs/render.js側が担当し、このファイルは
     データの読み書きとGemini呼び出しのみを受け持つ（reviewAI.jsと同じ役割分担）。
   ========================================================================= */

import { state } from './state.js';

const MAX_QUESTION_LEN = 300;
const MAX_ITEMS = 100;
// 行頭の箇条書き記号（半角ハイフン・全角中黒・アスタリスク・黒丸）だけを
// 取り除く。長音記号「ー」など本文の一部になりうる文字は対象に含めない
const BULLET_PREFIX_RE = /^[-*・•]+\s*/;

function currentUid(){
  return (state && state.currentUserId) ? state.currentUserId : "guest";
}

function storageKey(){
  return `revboard_items::${currentUid()}`;
}

function todayKey(){
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

let seq = 0;
function makeId(){
  return "rb" + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6);
}

function saveReviewItems(items){
  try{ localStorage.setItem(storageKey(), JSON.stringify(items || [])); }catch(e){}
}

// ページ再読み込み・通信断でstatus:"generating"のまま固まった項目は、
// 次に読み込んだ時点で"pending"に戻し、キューに戻して再生成させる
export function loadReviewItems(){
  let items;
  try{ items = JSON.parse(localStorage.getItem(storageKey())) || []; }
  catch(e){ items = []; }
  if(!Array.isArray(items)) items = [];
  let touched = false;
  items.forEach(it => {
    if(it && it.status === "generating"){ it.status = "pending"; touched = true; }
  });
  if(touched) saveReviewItems(items);
  return items;
}

// 変更を購読するリスナー一覧。登録・削除・編集・Gemini生成完了/失敗の
// たびに呼ばれ、render.js側はここでホーム画面のカードを再描画する
const listeners = [];
export function onReviewBoardChange(fn){
  if(typeof fn === "function") listeners.push(fn);
}
function notify(){
  listeners.forEach(fn => { try{ fn(); }catch(e){} });
}

/* ===== 箇条書きテキストの分割 =====
   1行＝1復習項目。「-」「・」「*」「•」の行頭記号は取り除き、空行は無視する */
export function parseReviewBulletLines(text){
  return (text || "")
    .split(/\r\n|\r|\n/)
    .map(line => line.trim().replace(BULLET_PREFIX_RE, "").trim())
    .filter(line => line.length > 0)
    .map(line => line.slice(0, MAX_QUESTION_LEN));
}

/* ===== 登録（追加） ===== */
export function addReviewItems(rawText){
  const lines = parseReviewBulletLines(rawText);
  if(!lines.length) return 0;
  const items = loadReviewItems();
  const now = new Date().toISOString();
  const today = todayKey();
  let added = 0;
  lines.forEach(question => {
    if(items.length >= MAX_ITEMS) return;
    items.push({ id: makeId(), question, answer: null, status: "pending", createdAt: now, updatedAt: now, dateKey: today });
    added++;
  });
  saveReviewItems(items);
  notify();
  processQueue();
  return added;
}

/* ===== 編集内容の一括反映 =====
   編集画面は既存の全項目を箇条書きテキストとして表示し、ユーザーが修正して
   保存すると1行ごとに再登録する。文言が完全一致する行は既存項目（と回答）を
   そのまま引き継ぎ、新規・変更された行だけを新しい項目として作り、
   Geminiでの回答生成をキューに積む */
export function reviewItemsAsBulletText(){
  return loadReviewItems().map(it => `- ${it.question}`).join("\n");
}

export function applyReviewBoardEdit(rawText){
  const lines = parseReviewBulletLines(rawText).slice(0, MAX_ITEMS);
  const oldItems = loadReviewItems();
  const pool = new Map(); // question文字列 -> 未使用の既存項目キュー
  oldItems.forEach(it => {
    const arr = pool.get(it.question) || [];
    arr.push(it);
    pool.set(it.question, arr);
  });
  const now = new Date().toISOString();
  const today = todayKey();
  const next = lines.map(question => {
    const arr = pool.get(question);
    if(arr && arr.length) return arr.shift(); // 未変更 → 既存項目（回答含む）を再利用
    return { id: makeId(), question, answer: null, status: "pending", createdAt: now, updatedAt: now, dateKey: today };
  });
  saveReviewItems(next);
  notify();
  processQueue();
}

/* ===== 削除 ===== */
export function deleteReviewItem(id){
  const items = loadReviewItems();
  const idx = items.findIndex(it => it.id === id);
  if(idx === -1) return;
  items.splice(idx, 1);
  saveReviewItems(items);
  notify();
}

export function clearAllReviewItems(){
  saveReviewItems([]);
  notify();
}

/* ===== 回答の再生成 ===== */
export function regenerateReviewAnswer(id){
  const items = loadReviewItems();
  const it = items.find(x => x.id === id);
  if(!it) return;
  it.status = "pending";
  it.answer = null;
  saveReviewItems(items);
  notify();
  processQueue();
}

/* ===== Gemini呼び出しキュー =====
   無料枠のクォータを早く使い切らないよう、同時に1件ずつ・順番に生成する。
   生成中にユーザーがログイン状態を切り替えた場合は、結果を書き戻す直前に
   uidを再確認し、別ユーザーのデータへ誤って保存しないようにする */
let queueRunning = false;
async function processQueue(){
  if(queueRunning) return;
  queueRunning = true;
  try{
    while(true){
      const items = loadReviewItems();
      const target = items.find(it => it.status === "pending");
      if(!target) break;
      const uidAtStart = currentUid();

      target.status = "generating";
      saveReviewItems(items);
      notify();

      let answer = null;
      try{ answer = await fetchReviewAnswer(target.question); }
      catch(e){ answer = null; }

      if(currentUid() !== uidAtStart) continue; // 別アカウントに切り替わっていたら書き戻さない

      const items2 = loadReviewItems();
      const cur = items2.find(it => it.id === target.id);
      if(cur){
        if(answer){ cur.status = "ready"; cur.answer = answer; cur.updatedAt = new Date().toISOString(); }
        else { cur.status = "error"; }
        saveReviewItems(items2);
        notify();
      }
    }
  } finally {
    queueRunning = false;
  }
}

async function fetchReviewAnswer(question){
  const res = await fetch("/api/gemini/review-answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if(!res.ok){
    const data = await res.json().catch(() => ({}));
    throw new Error((data && data.error) || ("request-failed-" + res.status));
  }
  const data = await res.json().catch(() => ({}));
  if(!data || typeof data.answer !== "string" || !data.answer.trim()) throw new Error("empty-answer");
  return data.answer.trim();
}

// ログイン直後など、前回中断した"pending"項目が残っていればすぐに再開する
export function resumeReviewBoardQueue(){
  processQueue();
}
