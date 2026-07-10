// 「イントロドンに挑戦」ポップアップ。
// ・YouTube IFrame Player APIを画面に見えない状態で読み込み、
//   「再生/一時停止」ボタンだけで手動再生する（自動再生・シークバー操作はさせない）。
// ・videoIdや正解の選択肢はフロントの変数として保持しない設計にできない
//   （YouTube IFrame APIで音を鳴らす以上、videoId自体はどうしても
//   ネットワークタブ等から見えてしまう）。そのため「正解がどれか」は最後まで
//   サーバー側だけが知っている状態を保つことに寄せている：
//     - /api/intro-quiz/start は「シャッフル済みの選択肢（曲名）」と
//       「再生用videoId」だけを返し、どれが正解かは含めない。
//     - 正誤判定・挑戦回数のカウント・BP/AC加算はすべて
//       /api/intro-quiz/answer （サーバー側）で行う。
//     - 曲のタイトル・サムネイルは、回答が確定するまで一切表示しない。
import { esc } from './core.js';
import { state } from './state.js';

let activeOverlay = null;   // 二重起動防止（同時に1つしか開かない）
let hiddenPlayer = null;    // 回答前：非表示で再生/一時停止する側のプレイヤー
let revealPlayer = null;    // 回答後：答え合わせのフルサイズMVプレイヤー
let hiddenStarted = false;  // 「1回目の再生ボタン」で0秒から再生済みか

// ---- YouTube IFrame API の遅延読み込み（アプリ全体で一度だけ読み込めばよい） ----
let ytApiPromise = null;
function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prevCb = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevCb === "function") { try { prevCb(); } catch (e) {} }
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

async function authFetch(path, options) {
  if (state.guestMode || !state.currentUser) { const e = new Error("no-user"); throw e; }
  const idToken = await state.currentUser.getIdToken();
  const opts = Object.assign({}, options);
  opts.headers = Object.assign({ Authorization: `Bearer ${idToken}` }, opts.headers || {});
  return fetch(path, opts);
}

function destroyPlayers() {
  if (hiddenPlayer) { try { hiddenPlayer.destroy(); } catch (e) {} hiddenPlayer = null; }
  if (revealPlayer) { try { revealPlayer.destroy(); } catch (e) {} revealPlayer = null; }
  hiddenStarted = false;
}

export function closeIntroQuiz() {
  destroyPlayers();
  if (activeOverlay) { try { activeOverlay.remove(); } catch (e) {} activeOverlay = null; }
}

export function openIntroQuiz() {
  if (activeOverlay) return; // 既に開いている
  if (state.guestMode || !state.currentUser) {
    window.alert("イントロドンで遊ぶにはログインが必要です（ゲストモードでは挑戦できません）。");
    return;
  }

  const ov = document.createElement("div");
  ov.className = "modal-ov iq-ov";
  ov.innerHTML = `
    <div class="modal iq-modal">
      <div class="modal-title">🎵 イントロドンに挑戦</div>
      <button type="button" class="iq-close" aria-label="閉じる">✕</button>
      <div id="iq-body"><div class="iq-loading">出題を準備しています…</div></div>
    </div>`;
  document.body.appendChild(ov);
  activeOverlay = ov;
  ov.querySelector(".iq-close").onclick = () => closeIntroQuiz();
  ov.addEventListener("click", (e) => { if (e.target === ov) closeIntroQuiz(); });

  startQuiz();
}

async function startQuiz() {
  const body = activeOverlay && activeOverlay.querySelector("#iq-body");
  if (!body) return;
  let data;
  try {
    const res = await authFetch("/api/intro-quiz/start", { method: "POST" });
    if (!res.ok) throw new Error("http-" + res.status);
    data = await res.json();
  } catch (e) {
    body.innerHTML = `<div class="iq-msg">通信に失敗しました。時間をおいて再度お試しください。</div>
      <button class="ghost iq-close-btn">閉じる</button>`;
    body.querySelector(".iq-close-btn").onclick = () => closeIntroQuiz();
    return;
  }

  if (!data || !data.ok) {
    body.innerHTML = `<div class="iq-msg">通信に失敗しました。時間をおいて再度お試しください。</div>
      <button class="ghost iq-close-btn">閉じる</button>`;
    body.querySelector(".iq-close-btn").onclick = () => closeIntroQuiz();
    return;
  }

  if (!data.available) {
    body.innerHTML = `<div class="iq-msg">本日出題できる曲がありません。またの機会にお試しください。</div>
      <button class="ghost iq-close-btn">閉じる</button>`;
    body.querySelector(".iq-close-btn").onclick = () => closeIntroQuiz();
    return;
  }

  renderQuizState(body, data.sessionId, data.videoId, data.choices);
}

function renderQuizState(body, sessionId, videoId, choices) {
  const LETTERS = ["A", "B", "C"];
  body.innerHTML = `
    <div class="iq-player-hidden"><div id="iq-yt-hidden"></div></div>
    <button type="button" class="cta iq-playbtn" id="iq-playbtn" disabled>読み込み中…</button>
    <div class="iq-hint">何度でも一時停止して聞き直せます。聞き終えたら曲名を選んでください。</div>
    <div class="opts iq-opts">
      ${choices.map((c, i) => `
        <button class="opt" data-choice="${esc(c.key)}">
          <span class="opt-key">${LETTERS[i] || i + 1}</span><span class="opt-label">${esc(c.title)}</span>
        </button>`).join("")}
    </div>`;

  const playBtn = body.querySelector("#iq-playbtn");
  const choiceBtns = Array.from(body.querySelectorAll("[data-choice]"));
  let answering = false;

  loadYouTubeApi().then(() => {
    if (!activeOverlay || !body.isConnected) return; // 読み込み中に閉じられた場合は何もしない
    hiddenPlayer = new window.YT.Player("iq-yt-hidden", {
      width: "1", height: "1",
      videoId,
      playerVars: {
        autoplay: 0, controls: 0, disablekb: 1, fs: 0,
        iv_load_policy: 3, modestbranding: 1, playsinline: 1, rel: 0,
      },
      events: {
        onReady: () => {
          playBtn.disabled = false;
          playBtn.textContent = "▶ 再生";
        },
        onStateChange: (ev) => {
          if (ev.data === window.YT.PlayerState.PLAYING) playBtn.textContent = "⏸ 一時停止";
          else if (ev.data === window.YT.PlayerState.PAUSED) playBtn.textContent = "▶ 再生";
        },
      },
    });
  });

  playBtn.onclick = () => {
    if (!hiddenPlayer || typeof hiddenPlayer.getPlayerState !== "function") return;
    const st = hiddenPlayer.getPlayerState();
    if (st === window.YT.PlayerState.PLAYING) {
      hiddenPlayer.pauseVideo();
    } else {
      if (!hiddenStarted) { hiddenPlayer.seekTo(0, true); hiddenStarted = true; }
      hiddenPlayer.playVideo();
    }
  };

  choiceBtns.forEach((btn) => {
    btn.onclick = async () => {
      if (answering) return;
      answering = true;
      choiceBtns.forEach((b) => { b.disabled = true; });
      playBtn.disabled = true;
      btn.classList.add("picked");
      if (hiddenPlayer) { try { hiddenPlayer.pauseVideo(); } catch (e) {} }

      let data;
      try {
        const res = await authFetch("/api/intro-quiz/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, choiceKey: btn.dataset.choice }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || ("http-" + res.status));
        }
        data = await res.json();
      } catch (e) {
        body.innerHTML = `<div class="iq-msg">回答の送信に失敗しました。時間をおいて再度お試しください。</div>
          <button class="ghost iq-close-btn">閉じる</button>`;
        body.querySelector(".iq-close-btn").onclick = () => closeIntroQuiz();
        return;
      }

      // 選んだ選択肢に正誤マークを付ける（この時点でchoiceBtnsはもう操作不能）
      choiceBtns.forEach((b) => {
        if (b.dataset.choice === data.correctKey) { b.classList.add("correct"); b.innerHTML += '<span class="opt-mark">✓</span>'; }
        else if (b === btn) { b.classList.add("wrong"); b.innerHTML += '<span class="opt-mark">✕</span>'; }
      });

      renderResultState(body, data);
    };
  });
}

function renderResultState(body, data) {
  if (hiddenPlayer) { try { hiddenPlayer.destroy(); } catch (e) {} hiddenPlayer = null; }

  let rewardHtml;
  if (data.correct && (data.bp > 0 || data.ac > 0)) {
    rewardHtml = `
      <div class="bp-card iq-reward">
        <div class="bp-row"><span>⚡ 獲得BP</span><span class="bp-gain">+${data.bp} BP</span></div>
      </div>
      ${data.ac > 0 ? `<div class="coin-card iq-reward"><div class="coin-row"><span class="coin-ic">💰</span><span class="coin-gain">+${data.ac} AC 獲得！</span></div></div>` : ""}`;
  } else if (data.correct && data.capReached) {
    rewardHtml = `<div class="iq-msg">正解！（本日の報酬上限に達しています）</div>`;
  } else {
    rewardHtml = "";
  }

  body.innerHTML = `
    <div class="iq-verdict ${data.correct ? "pass" : "fail"}">${data.correct ? "🎉 正解！" : "😢 残念！"}</div>
    ${!data.correct ? `<div class="iq-msg">正解は「${esc(data.title)}」でした。</div>` : ""}
    ${rewardHtml}
    <div class="iq-reveal-wrap"><div id="iq-yt-reveal"></div></div>
    <div class="actions iq-actions">
      <button class="ghost" id="iq-retry">もう一度挑戦する</button>
      <button class="cta" id="iq-done">閉じる</button>
    </div>`;

  loadYouTubeApi().then(() => {
    if (!activeOverlay || !body.isConnected) return;
    revealPlayer = new window.YT.Player("iq-yt-reveal", {
      width: "100%", height: "220",
      videoId: data.videoId,
      playerVars: { autoplay: 1, controls: 1, rel: 0, playsinline: 1 },
    });
  });

  body.querySelector("#iq-done").onclick = () => closeIntroQuiz();
  body.querySelector("#iq-retry").onclick = () => {
    destroyPlayers();
    body.innerHTML = `<div class="iq-loading">出題を準備しています…</div>`;
    startQuiz();
  };
}
