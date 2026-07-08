/* =========================================================================
   Gemini AIチャット相談。
   APIキーはサーバー側（/api/gemini/chat）に置いたまま、フロントは
   メッセージ本文と直近の会話履歴だけをPOSTして返答を受け取る。
   会話履歴はこのタブを開いている間だけ保持する簡易実装（保存はしない）。
   ========================================================================= */

import { state } from './state.js';

const MAX_HISTORY_TURNS = 20;
const WEEKDAY_JA = ["日","月","火","水","木","金","土"];
const SCHEDULE_FUNCTION_NAMES = new Set(["register_schedule", "update_schedule", "delete_schedule"]);

export const geminiChat = {
  // {id, role:"user"|"model", text}[] のほか、register_scheduleの結果は
  // {id, role:"model", type:"schedule_confirm", status:"pending"|"confirmed"|"cancelled", preview}
  // という確認カード用メッセージとして積まれる（textは持たない）
  messages: [],
  busy: false,
  error: null,
};

// チャットに積むメッセージ全部に一意なidを振る。確認カードのボタンや
// 「OK」チャット入力から対象メッセージを引き直すために使う
let msgSeq = 0;
export function pushGeminiMessage(msg){
  geminiChat.messages.push({ id: ++msgSeq, ...msg });
}

// 「予定を入れて」「変更して」「消して」のような依頼をGeminiが
// register_schedule/update_schedule/delete_schedule関数呼び出しとして
// 返してきたとき、実際にカレンダーへ反映する処理はカレンダー機能を持つ
// render.js側に任せる。循環importを避けるため、起動時にrender.jsから
// このセッター経由でハンドラー（関数名, 引数）=>結果 を注入してもらう
let scheduleHandler = null;
export function setGeminiScheduleHandler(fn){
  scheduleHandler = fn;
}

function currentDateContext(){
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    weekday: WEEKDAY_JA[now.getDay()],
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}

export async function sendGeminiMessage(text){
  const trimmed = (text || "").trim();
  if(!trimmed || geminiChat.busy) return;

  pushGeminiMessage({ role: "user", text: trimmed });
  geminiChat.busy = true;
  geminiChat.error = null;

  const history = geminiChat.messages
    .slice(0, -1)
    .slice(-MAX_HISTORY_TURNS)
    .map(m => ({ role: m.role, text: m.text }));

  try{
    const res = await fetch("/api/gemini/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: trimmed, history, today: currentDateContext() }),
    });
    const data = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error((data && data.error) || ("request-failed-" + res.status));

    if(data.functionCall && SCHEDULE_FUNCTION_NAMES.has(data.functionCall.name) && scheduleHandler){
      const result = await scheduleHandler(data.functionCall.name, data.functionCall.args || {});
      if(result && result.preview){
        // register_scheduleは即登録せず、確認カードを出すだけに留める。
        // 実際の登録は、ユーザーがカードのボタン（または「OK」チャット）で
        // 確定操作をした時点でrender.js側が行う
        pushGeminiMessage({ role: "model", type: "schedule_confirm", status: "pending", preview: result.preview });
      } else {
        pushGeminiMessage({ role: "model", text: (result && result.text) || "予定の処理でエラーが発生しました。" });
      }
    } else {
      pushGeminiMessage({ role: "model", text: data.reply || "" });
    }
  }catch(e){
    geminiChat.error = "送信に失敗しました。通信環境を確認して、もう一度お試しください。";
  }finally{
    geminiChat.busy = false;
  }
}

export function resetGeminiChat(){
  geminiChat.messages = [];
  geminiChat.busy = false;
  geminiChat.error = null;
}

/* =========================================================================
   Geminiボタン（簡易）：管理者（admin@gmail.com）専用のニュース自動取得。
   /api/gemini/news はサーバー側でもFirebaseのIDトークンとemailクレームを
   検証しているため、ここで管理者判定を通っていないユーザーが直接叩いても
   403で拒否される（クライアント側の表示制御だけに頼らない）。
   ========================================================================= */
export const geminiNews = {
  busy: false,
  error: null,
};

// prompt: 「本日の日本のITニュースを5件持ってきて」等の依頼文
// category: "japan" | "world"
// 戻り値：{title, url}[]（取得失敗時はnull。geminiNews.errorに理由文言）
export async function fetchGeminiNewsItems(prompt, category){
  const trimmed = (prompt || "").trim();
  if(!trimmed || geminiNews.busy) return null;
  if(!state.currentUser){
    geminiNews.error = "ログインしてください。";
    return null;
  }

  geminiNews.busy = true;
  geminiNews.error = null;
  try{
    const idToken = await state.currentUser.getIdToken();
    const res = await fetch("/api/gemini/news", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
      body: JSON.stringify({ prompt: trimmed, category: category === "world" ? "world" : "japan" }),
    });
    const data = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error((data && data.error) || ("request-failed-" + res.status));
    return Array.isArray(data.items) ? data.items : [];
  }catch(e){
    geminiNews.error = "ニュースの取得に失敗しました。通信環境を確認して、もう一度お試しください。";
    return null;
  }finally{
    geminiNews.busy = false;
  }
}
