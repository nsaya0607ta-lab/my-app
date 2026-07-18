/* =========================================================================
   復習掲示板（LPIC-1ホーム画面）
   ・ユーザーが番号付き箇条書きで「問題」と「解答」をそれぞれ一括登録し、
     先頭の番号が一致するもの同士を問題と解答として対応付けて表示する。
     文章の内容による自動判定や、アプリ内Geminiによる回答生成は一切行わない。
   ・問題と解答は別々のデータとして、ログインユーザーごと（未ログインは
     guest）にlocalStorageへ保存する。js/render.jsのgcalStorageKeyなどと
     同じ「uidをキーに連結する」方式で、アカウントを跨いで他人のデータが
     混ざらないようにしている。
   ・実際の描画・自動切り替えUIはjs/render.js側が担当し、このファイルは
     データの読み書きと番号の解析・対応付けのみを受け持つ。
   ========================================================================= */

import { state } from './state.js';

const MAX_TEXT_LEN = 300;
const MAX_ITEMS = 200;

// 行頭の番号＋区切り記号（「1.」「1」「1:」「1：」）を取り出す。
// 区切り記号が無い場合（「1 問題文」）でも、番号の直後の空白で区切る
const NUM_PREFIX_RE = /^\s*(\d+)\s*(?:[.:：])?\s*/;

function currentUid(){
  return (state && state.currentUserId) ? state.currentUserId : "guest";
}

function questionsKey(){
  return `revboard_questions::${currentUid()}`;
}
function answersKey(){
  return `revboard_answers::${currentUid()}`;
}

function loadRaw(key){
  let arr;
  try{ arr = JSON.parse(localStorage.getItem(key)) || []; }
  catch(e){ arr = []; }
  return Array.isArray(arr) ? arr : [];
}
function saveRaw(key, arr){
  try{ localStorage.setItem(key, JSON.stringify(arr || [])); }catch(e){}
}

export function loadReviewQuestions(){
  return loadRaw(questionsKey()).slice().sort((a, b) => a.number - b.number);
}
export function loadReviewAnswers(){
  return loadRaw(answersKey()).slice().sort((a, b) => a.number - b.number);
}
export function findReviewAnswer(number){
  return loadRaw(answersKey()).find(a => a.number === number) || null;
}

// 変更を購読するリスナー一覧。登録・削除・編集のたびに呼ばれ、
// render.js側はここでホーム画面のカードを再描画する
const listeners = [];
export function onReviewBoardChange(fn){
  if(typeof fn === "function") listeners.push(fn);
}
function notify(){
  listeners.forEach(fn => { try{ fn(); }catch(e){} });
}

/* ===== 番号付き箇条書きテキストの解析 =====
   1行＝1項目。先頭の番号を取り出して問題番号／解答番号とし、番号が
   見つからない行・番号の後ろが空文字になる行・空行は無視する */
export function parseNumberedBulletLines(text){
  return (text || "")
    .split(/\r\n|\r|\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const m = line.match(NUM_PREFIX_RE);
      if(!m) return null;
      const number = parseInt(m[1], 10);
      const body = line.slice(m[0].length).trim().slice(0, MAX_TEXT_LEN);
      if(!body) return null;
      return { number, text: body };
    })
    .filter(Boolean);
}

// 同じ番号が複数行に現れていないかを調べ、重複している番号の一覧を返す
// （文章の内容ではなく、番号だけで判定する）
function findDuplicateNumbers(parsed){
  const counts = new Map();
  parsed.forEach(it => counts.set(it.number, (counts.get(it.number) || 0) + 1));
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([number]) => number)
    .sort((a, b) => a - b);
}

function upsertItems(key, rawText){
  const parsed = parseNumberedBulletLines(rawText);
  if(!parsed.length) return { ok: true, duplicates: [] };
  const duplicates = findDuplicateNumbers(parsed);
  if(duplicates.length) return { ok: false, duplicates };

  const existing = loadRaw(key);
  const map = new Map(existing.map(it => [it.number, it]));
  const now = new Date().toISOString();
  parsed.forEach(p => map.set(p.number, { number: p.number, text: p.text, updatedAt: now }));
  const next = [...map.values()].slice(0, MAX_ITEMS);
  saveRaw(key, next);
  notify();
  return { ok: true, duplicates: [] };
}

function replaceItems(key, rawText){
  const parsed = parseNumberedBulletLines(rawText).slice(0, MAX_ITEMS);
  const duplicates = findDuplicateNumbers(parsed);
  if(duplicates.length) return { ok: false, duplicates };

  const now = new Date().toISOString();
  saveRaw(key, parsed.map(p => ({ number: p.number, text: p.text, updatedAt: now })));
  notify();
  return { ok: true, duplicates: [] };
}

/* ===== 登録（追加。既存の番号と衝突した場合はその番号の内容を上書きする） ===== */
export function addReviewQuestions(rawText){
  return upsertItems(questionsKey(), rawText);
}
export function addReviewAnswers(rawText){
  return upsertItems(answersKey(), rawText);
}

/* ===== 編集内容の一括反映（登録済み全件をテキストとして書き換え、丸ごと置き換える）=====
   番号を変更して保存した場合は、変更後の番号で問題と解答の対応付けが決まる */
export function applyReviewQuestionsEdit(rawText){
  return replaceItems(questionsKey(), rawText);
}
export function applyReviewAnswersEdit(rawText){
  return replaceItems(answersKey(), rawText);
}

export function questionsAsBulletText(){
  return loadReviewQuestions().map(it => `${it.number}. ${it.text}`).join("\n");
}
export function answersAsBulletText(){
  return loadReviewAnswers().map(it => `${it.number}. ${it.text}`).join("\n");
}

/* ===== 削除 ===== */
export function deleteReviewQuestion(number){
  const key = questionsKey();
  saveRaw(key, loadRaw(key).filter(it => it.number !== number));
  notify();
}
export function deleteReviewAnswer(number){
  const key = answersKey();
  saveRaw(key, loadRaw(key).filter(it => it.number !== number));
  notify();
}
export function clearAllReviewItems(){
  saveRaw(questionsKey(), []);
  saveRaw(answersKey(), []);
  notify();
}
