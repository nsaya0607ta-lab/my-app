/* =========================================================================
   📰 今日のニュース検定（毎日20:00〜23:59・1日1回）
   正解判定・AC加算は必ずサーバー（/api/news-quiz/*）側で行う。ここでは
   ・出題条件（時間帯／当日ニュースの有無／挑戦済みか）をサーバーに問い合わせ
   ・条件を満たす場合だけ #app の外（document.body直付け）にオーバーレイ表示
   ・回答/スキップをサーバーへ送り、返ってきた結果を表示するだけ
   ========================================================================= */
import { S, state } from './state.js';
import { esc, saveCoins } from './core.js';
import { renderStatusBar } from './render.js';

// 同一タブを開いている間、「今日はもう確認済み」を覚えておき、画面遷移の
// たびに毎回サーバーへ問い合わせるのを防ぐ（実際の1日1回判定はサーバー側の
// users/{uid}/newsQuizAttempts/{dateKey}が正）
let checkedDateKey = null;
let checking = false;

function localDateKeyGuess() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ホーム（資格選択＝ダッシュボード）画面を開いた瞬間・別タブから戻ってきた
// 瞬間に呼ぶ。ログイン済みアカウントのみ対象（ゲストモードはAC付与の
// サーバー判定ができないため対象外）。
export async function checkNewsQuizPopup() {
  if (state.guestMode || !state.currentUser) return;
  if (document.querySelector(".nq-ov")) return; // 既に表示中
  if (checking) return;

  const guessKey = localDateKeyGuess();
  if (checkedDateKey === guessKey) return; // このタブでは今日は確認済み

  // 明らかに時間外なら通信すらしない（サーバー側でも同じ条件を必ず再検証する）
  if (new Date().getHours() < 20) return;

  checking = true;
  try {
    const idToken = await state.currentUser.getIdToken();
    const res = await fetch("/api/news-quiz/today", { headers: { Authorization: `Bearer ${idToken}` } });
    if (!res.ok) return;
    const data = await res.json();
    checkedDateKey = guessKey;
    if (data && data.eligible) openNewsQuizStart(data.quiz);
  } catch (e) {
    // 通信エラー時は今回だけ諦める（次にホームへ戻ってきたときに再挑戦できる）
  } finally {
    checking = false;
  }
}

function closeOverlay(ov) {
  try { ov.remove(); } catch (e) {}
}

function openNewsQuizStart(quiz) {
  const ov = document.createElement("div");
  ov.className = "modal-ov nq-ov";
  ov.innerHTML = `
    <div class="modal nq-modal">
      <div class="nq-badge">📰 今日のニュース検定</div>
      <div class="modal-title nq-title">20時になりました！</div>
      <div class="modal-body">今日の主要ニュースから出題される3択クイズに挑戦しますか？<br>正解すると <b>+10 AC</b> を獲得できます。</div>
      <button type="button" class="cta" id="nq-start">挑戦する</button>
      <button type="button" class="ghost" id="nq-skip">スキップ</button>
    </div>`;
  document.body.appendChild(ov);
  ov.querySelector("#nq-start").onclick = () => renderNewsQuizQuestion(ov, quiz);
  ov.querySelector("#nq-skip").onclick = () => submitSkip(ov);
}

function renderNewsQuizQuestion(ov, quiz) {
  const modal = ov.querySelector(".modal");
  modal.innerHTML = `
    <div class="nq-badge">📰 今日のニュース検定</div>
    <p class="q-text nq-question">${esc(quiz.question)}</p>
    <div class="opts nq-opts">
      ${quiz.choices.map((c, i) => `
        <button type="button" class="opt" data-nq-pick="${i}">
          <span class="opt-key">${["A", "B", "C"][i]}</span><span class="opt-label">${esc(c)}</span>
        </button>`).join("")}
    </div>`;
  modal.querySelectorAll("[data-nq-pick]").forEach((b) => {
    b.onclick = () => submitAnswer(ov, quiz, +b.dataset.nqPick);
  });
}

async function submitAnswer(ov, quiz, choiceIndex) {
  const modal = ov.querySelector(".modal");
  modal.querySelectorAll("[data-nq-pick]").forEach((b) => (b.disabled = true));

  let data, ok;
  try {
    const idToken = await state.currentUser.getIdToken();
    const res = await fetch("/api/news-quiz/answer", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "answer", choiceIndex }),
    });
    ok = res.ok;
    data = await res.json();
  } catch (e) {
    ok = false;
  }
  if (!ok || !data) { renderNewsQuizError(ov); return; }

  // 選んだ肢と正解を色分け（既存の演習/試験クイズ画面と同じ.opt.correct/.opt.wrongを流用）
  modal.querySelectorAll("[data-nq-pick]").forEach((b) => {
    const i = +b.dataset.nqPick;
    if (i === data.correctIndex) b.classList.add("correct");
    else if (i === choiceIndex) b.classList.add("wrong");
  });

  // サーバーが返した最新残高だけを信用してこの端末のACに反映する
  // （加算の計算はクライアントでは一切行わない）
  if (typeof data.newBalance === "number") {
    S.coins = data.newBalance;
    saveCoins(S.coins);
    renderStatusBar();
  }

  setTimeout(() => renderNewsQuizResult(ov, quiz, data), 650);
}

async function submitSkip(ov) {
  try {
    const idToken = await state.currentUser.getIdToken();
    await fetch("/api/news-quiz/answer", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "skip" }),
    });
  } catch (e) {
    // スキップの送信に失敗しても画面は閉じる。翌日以降の判定に実害はない
    // （サーバー側に記録が残らなければ、その日はまだ挑戦権が有効なだけ）
  }
  closeOverlay(ov);
}

function renderNewsQuizResult(ov, quiz, data) {
  const modal = ov.querySelector(".modal");
  const correct = data.status === "correct";
  modal.innerHTML = `
    <div class="nq-result ${correct ? "nq-result-good" : "nq-result-bad"}">
      <div class="nq-result-emoji">${correct ? "🎉" : "😢"}</div>
      <div class="nq-result-title">${correct ? "正解！" : "残念！"}</div>
      ${correct
        ? `<div class="nq-result-coin">＋${data.coinGain} AC 獲得</div>`
        : `<div class="nq-result-answer">正解は「${esc(quiz.choices[data.correctIndex])}」でした</div>`}
      ${data.explanation ? `<div class="nq-result-exp">${esc(data.explanation)}</div>` : ""}
    </div>
    <button type="button" class="cta" id="nq-close">閉じる</button>`;
  modal.querySelector("#nq-close").onclick = () => closeOverlay(ov);
}

function renderNewsQuizError(ov) {
  const modal = ov.querySelector(".modal");
  modal.innerHTML = `
    <div class="modal-body">通信エラーが発生しました。時間をおいて再度お試しください。</div>
    <button type="button" class="cta" id="nq-close">閉じる</button>`;
  modal.querySelector("#nq-close").onclick = () => closeOverlay(ov);
}
