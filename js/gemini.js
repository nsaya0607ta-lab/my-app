/* =========================================================================
   Gemini AIチャット相談。
   APIキーはサーバー側（/api/gemini/chat）に置いたまま、フロントは
   メッセージ本文と直近の会話履歴だけをPOSTして返答を受け取る。
   会話履歴はこのタブを開いている間だけ保持する簡易実装（保存はしない）。
   ========================================================================= */

import { getWeather } from './weather.js';

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
  // ストリーミング中にサーバーから届いたテキストをここに逐次追加していく。
  // busy=trueかつこれが空でない間は、レンダー側が「考え中」の代わりに
  // この内容をそのまま吹き出しとして表示する
  streamingText: "",
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

// ホーム画面の「今日の予定・タスク」を、循環importを避けつつ取得するための
// 注入ポイント（render.js側から起動時にセットされる）。天気はweather.js
// （render.jsに依存しないモジュール）なので直接importできるが、予定・タスクは
// render.js側の状態に依存するため同じ注入方式を使う
let homeContextProvider = null;
export function setGeminiHomeContextProvider(fn){
  homeContextProvider = fn;
}

// 天気カード・ホームの予定/タスクウィジェットと同じ実データをGeminiに渡すための
// スナップショットを組み立てる。取得に失敗しても会話自体は止めたくないので、
// 個別にtry/catchし、取れなかった項目はnull/空のまま送る
async function buildAppContext(){
  let weather = null;
  try{
    const w = await getWeather();
    if(w){
      weather = { city: w.city, temp: w.temp, label: w.label, pop: w.pop, precip: w.precip };
    }
  }catch(e){ /* 天気が取れなくてもチャットは継続する */ }

  let home = null;
  try{
    if(homeContextProvider) home = homeContextProvider();
  }catch(e){ /* 予定/タスクが取れなくてもチャットは継続する */ }

  return {
    weather,
    todos: (home && home.todos) || [],
    events: (home && home.events) || [],
  };
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

// register_schedule等の関数呼び出し結果を確認カード／エラーメッセージとして
// チャットに積む。ストリーミングの functionCall イベント・非ストリーミング
// フォールバックの両方から共通で呼ばれる
async function applyFunctionCall(name, args){
  if(!scheduleHandler){
    pushGeminiMessage({ role: "model", text: "予定の処理でエラーが発生しました。" });
    return;
  }
  const result = await scheduleHandler(name, args || {});
  if(result && result.preview){
    // register_scheduleは即登録せず、確認カードを出すだけに留める。
    // 実際の登録は、ユーザーがカードのボタン（または「OK」チャット）で
    // 確定操作をした時点でrender.js側が行う
    pushGeminiMessage({ role: "model", type: "schedule_confirm", status: "pending", preview: result.preview });
  } else {
    pushGeminiMessage({ role: "model", text: (result && result.text) || "予定の処理でエラーが発生しました。" });
  }
}

// サーバー（/api/gemini/chat）は改行区切りJSON（NDJSON）でイベントを流す。
// {"type":"chunk","text":...} を都度onChunkに反映しつつ、"functionCall"/"done"/
// "error" のいずれかで会話を確定させる
export async function sendGeminiMessage(text, onChunk){
  const trimmed = (text || "").trim();
  if(!trimmed || geminiChat.busy) return;

  pushGeminiMessage({ role: "user", text: trimmed });
  geminiChat.busy = true;
  geminiChat.error = null;
  geminiChat.streamingText = "";

  const history = geminiChat.messages
    .slice(0, -1)
    .slice(-MAX_HISTORY_TURNS)
    .map(m => ({ role: m.role, text: m.text }));

  const appContext = await buildAppContext();
  const payload = JSON.stringify({ message: trimmed, history, today: currentDateContext(), appContext });
  const doFetch = () => fetch("/api/gemini/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
  });

  try{
    let res;
    try {
      res = await doFetch();
    } catch (networkErr) {
      // 接続確立自体に失敗した場合のみ、瞬断などを想定して一度だけ黙って
      // 再試行する（サーバー側の応答が始まった後の切断はここでは扱わない）。
      // ミリ秒単位で即座に再送するとサーバー側のリトライと重なって無駄な
      // Gemini APIリクエストを増やすため、必ず3秒以上待ってから再試行する
      await new Promise((resolve) => setTimeout(resolve, 3000));
      res = await doFetch();
    }

    if(!res.ok){
      const data = await res.json().catch(() => ({}));
      throw new Error((data && data.error) || ("request-failed-" + res.status));
    }

    if(!res.body){
      // ストリーミングが使えない環境向けのフォールバック（通常は到達しない）
      const data = await res.json().catch(() => ({}));
      if(data.functionCall && SCHEDULE_FUNCTION_NAMES.has(data.functionCall.name)){
        await applyFunctionCall(data.functionCall.name, data.functionCall.args || {});
      } else {
        pushGeminiMessage({ role: "model", text: data.reply || "" });
      }
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let settled = false;

    while(true){
      const { done, value } = await reader.read();
      if(done) break;
      buffer += decoder.decode(value, { stream: true });

      let nl;
      while((nl = buffer.indexOf("\n")) !== -1){
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if(!line) continue;

        let evt;
        try { evt = JSON.parse(line); } catch(_) { continue; }

        if(evt.type === "chunk"){
          geminiChat.streamingText += evt.text || "";
          if(onChunk) onChunk();
        } else if(evt.type === "functionCall"){
          settled = true;
          await applyFunctionCall(evt.name, evt.args || {});
        } else if(evt.type === "done"){
          settled = true;
          pushGeminiMessage({ role: "model", text: geminiChat.streamingText || evt.reply || "" });
        } else if(evt.type === "error"){
          if(geminiChat.streamingText){
            // 生成途中で切れただけなら、それまでのテキストは活かして
            // 「途中で終了した可能性」を添えるだけに留め、全体を失敗にしない
            pushGeminiMessage({ role: "model", text: `${geminiChat.streamingText}\n\n（通信が不安定なため、回答が途中で終了した可能性があります）` });
            settled = true;
          } else {
            throw new Error(evt.error || "stream-error");
          }
        }
      }
    }

    if(!settled){
      if(geminiChat.streamingText){
        pushGeminiMessage({ role: "model", text: geminiChat.streamingText });
      } else {
        throw new Error("stream-incomplete");
      }
    }
  }catch(e){
    geminiChat.error = "送信に失敗しました。通信環境を確認して、もう一度お試しください。";
  }finally{
    geminiChat.streamingText = "";
    geminiChat.busy = false;
  }
}

export function resetGeminiChat(){
  geminiChat.messages = [];
  geminiChat.busy = false;
  geminiChat.error = null;
  geminiChat.streamingText = "";
}
