/* =========================================================================
   Gemini AIチャット相談。
   APIキーはサーバー側（/api/gemini/chat）に置いたまま、フロントは
   メッセージ本文と直近の会話履歴だけをPOSTして返答を受け取る。
   会話履歴はこのタブを開いている間だけ保持する簡易実装（保存はしない）。
   ========================================================================= */

const MAX_HISTORY_TURNS = 20;

export const geminiChat = {
  messages: [],   // {role:"user"|"model", text}[]
  busy: false,
  error: null,
};

export async function sendGeminiMessage(text){
  const trimmed = (text || "").trim();
  if(!trimmed || geminiChat.busy) return;

  geminiChat.messages.push({ role: "user", text: trimmed });
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
      body: JSON.stringify({ message: trimmed, history }),
    });
    const data = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error((data && data.error) || ("request-failed-" + res.status));
    geminiChat.messages.push({ role: "model", text: data.reply || "" });
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
