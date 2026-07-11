/* =========================================================================
   通知機能（予定登録／削除のリアルタイム通知・開始5分前リマインダー・
   朝7時のデイリーサマリー）の共通基盤。

   このアプリはサーバー側のプッシュ通知基盤（FCM等）を持たないため、
   「アプリ内トースト」を必ず表示しつつ、対応ブラウザかつユーザーが許可
   した場合のみブラウザのローカル通知（Notification API）も重ねて出す
   構成にしている。トリガー自体（予定の登録・削除・5分前判定・7時判定）は
   js/render.js のカレンダー機能側から呼び出す。
   ========================================================================= */
import { esc } from './core.js';

const TOAST_ROOT_ID = "app-toast-root";
const TOAST_DURATION_MS = 6000;
const CIRCLED_NUMS = ["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩","⑪","⑫","⑬","⑭","⑮","⑯","⑰","⑱","⑲","⑳"];

function circledNum(n){ return CIRCLED_NUMS[n-1] || `(${n})`; }

function ensureToastRoot(){
  let root = document.getElementById(TOAST_ROOT_ID);
  if(!root){
    root = document.createElement("div");
    root.id = TOAST_ROOT_ID;
    root.className = "app-toast-root";
    document.body.appendChild(root);
  }
  return root;
}

// kind: "create" | "delete" | "reminder" | "summary"（トーストの帯色に反映）
function showToast(kind, message, opts){
  const root = ensureToastRoot();
  const el = document.createElement("div");
  el.className = `app-toast app-toast-${kind}`;
  el.innerHTML = `
    <div class="app-toast-msg">${esc(message)}</div>
    <button type="button" class="app-toast-close" aria-label="閉じる">×</button>`;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));

  let timer;
  const remove = () => {
    clearTimeout(timer);
    el.classList.remove("show");
    el.classList.add("hide");
    setTimeout(() => { try{ el.remove(); }catch(e){} }, 260);
  };
  timer = setTimeout(remove, (opts && opts.duration) || TOAST_DURATION_MS);
  el.querySelector(".app-toast-close").onclick = remove;
  // ホバー中は自動で消えないよう一時停止し、離れたら短い猶予の後に消す
  el.addEventListener("mouseenter", () => clearTimeout(timer));
  el.addEventListener("mouseleave", () => { timer = setTimeout(remove, 2000); });
}

// ブラウザのローカル通知（Notification API）。対応環境かつユーザーが許可
// 済みの場合のみOS通知も重ねて出す。初回呼び出し時に一度だけ許可を尋ね、
// 未対応・拒否・保留中はすべて静かに諦める（アプリ内トーストは常に出る）
let permissionAsked = false;
function ensureBrowserPermission(){
  if(typeof window === "undefined" || !("Notification" in window)) return;
  if(permissionAsked) return;
  permissionAsked = true;
  if(Notification.permission === "default"){
    try{ Notification.requestPermission(); }catch(e){}
  }
}

function notifyBrowser(title, body){
  ensureBrowserPermission();
  if(typeof window === "undefined" || !("Notification" in window)) return;
  if(Notification.permission !== "granted") return;
  try{ new Notification(title, { body, icon: "assets/icon/app-icon-192.png" }); }catch(e){}
}

/* ---- 1) 予定登録時の通知（リアルタイム） ---- */
export function notifyScheduleCreated(author, title, whenLabel){
  const who = (author || "").trim() || "ゲスト";
  const t = (title || "").trim() || "無題の予定";
  showToast("create", `📢 ${who}さんが新しい予定『${t}』を登録しました。`);
  notifyBrowser("📢 新しい予定が登録されました", `${who}さんが『${t}』を登録しました。${whenLabel ? `（${whenLabel}）` : ""}`);
}

/* ---- 2) 予定削除時の通知（リアルタイム） ---- */
export function notifyScheduleDeleted(author, title){
  const who = (author || "").trim() || "ゲスト";
  const t = (title || "").trim() || "無題の予定";
  showToast("delete", `🗑️ ${who}さんが予定『${t}』を削除しました。`);
  notifyBrowser("🗑️ 予定が削除されました", `${who}さんが『${t}』を削除しました。`);
}

/* ---- 3) 予定開始の5分前通知（リマインダー） ---- */
export function notifyReminder(title, startLabel){
  const t = (title || "").trim() || "予定";
  showToast("reminder", `⏰ まもなく5分後に『${t}』が始まります！`, { duration: 8000 });
  notifyBrowser("⏰ まもなく予定が始まります", `『${t}』が${startLabel ? `${startLabel}〜` : ""}始まります。`);
}

/* ---- 4) 朝7時の「今日の予定」一括通知（デイリーサマリー） ----
   events: [{title, start}] を開始時刻の昇順で渡す */
export function notifyDailySummary(events){
  const now = new Date();
  const title = `${now.getMonth() + 1}月${now.getDate()}日の予定`;
  const list = (events || []).filter(ev => ev && ev.title);
  if(!list.length){
    const msg = "☀️ おはようございます！今日の予定はありません。今日も良い一日を！";
    showToast("summary", msg, { duration: 10000 });
    notifyBrowser(title, "今日の予定はありません。今日も良い一日を！");
    return;
  }
  const items = list.map((ev, i) => `${circledNum(i + 1)}${ev.start ? `${ev.start}〜` : "終日"} ${ev.title}`).join("、");
  const msg = `☀️ おはようございます！今日の予定は ${list.length} 件あります：${items}`;
  showToast("summary", msg, { duration: 12000 });
  notifyBrowser(title, `本日は${list.length}件の予定があります。`);
}
