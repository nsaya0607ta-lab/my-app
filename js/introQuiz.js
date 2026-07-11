/* =========================================================================
   🎵 イントロドン（曲当て3択クイズ）－ 専用フルスクリーン画面
   =========================================================================
   ホーム画面の起動アイコンから go("introquiz") で遷移してくる、独立した
   1画面（ポップアップではない）。#app を丸ごとこの画面のマークアップに
   差し替え、他の画面（quiz/result/dict等）と同じ「画面遷移」の作法に揃える。

   YouTube IFrame Player APIは2つのプレイヤーを使い分ける：
     ・hiddenPlayer … 回答前。画面外（position:absolute; left:-9999px）に
       置き、「再生/一時停止」ボタンだけで手動操作する。controls:0で
       ネイティブのシークバー・タイトル表示は出さない。
     ・revealPlayer … 回答後。画面中央の専用エリアにフルサイズで表示し、
       controls:1・autoplay:1でそのままMVを最後まで観られるようにする。

   videoId・正解の選択肢・挑戦回数・BP/AC加算は一切クライアントで持たず、
   /api/intro-quiz/start と /api/intro-quiz/answer （サーバー側）だけが
   正解を知っている状態を保つ。videoId自体はIFrame APIで再生する以上
   ネットワークタブから見えてしまうが、曲名・サムネイル・正解フラグは
   回答確定までレスポンスに一切含めない。
   ========================================================================= */
import { esc, saveCoins } from './core.js';
import { S, state } from './state.js';
import { app, go, renderStatusBar } from './render.js';

// ---- 画面内の状態管理 ----
// このモジュールが管理するのは「イントロドン画面がマウントされている間」
// だけのローカル状態。renderGenerationは画面を出入りする（または画面内で
// 状態遷移する）たびにインクリメントし、既に古くなった非同期処理
// （YouTube API読み込み・fetch応答）がDOMを触らないようにするための世代番号。
let renderGeneration = 0;
let hiddenPlayer = null;
let revealPlayer = null;
let hiddenStarted = false;   // 「1回目の再生ボタン」で0秒から再生済みか
let fallbackPlayTimer = null;

const YT_API_LOAD_TIMEOUT_MS = 12000;
const YT_READY_TIMEOUT_MS = 10000;

// ---- YouTube IFrame API の遅延読み込み（アプリ全体で一度だけ読み込めばよい） ----
let ytApiPromise = null;
function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve, reject) => {
    const prevCb = window.onYouTubeIframeAPIReady;
    const timer = setTimeout(() => reject(new Error("yt-api-timeout")), YT_API_LOAD_TIMEOUT_MS);
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer);
      if (typeof prevCb === "function") { try { prevCb(); } catch (e) {} }
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.onerror = () => { clearTimeout(timer); reject(new Error("yt-api-script-error")); };
    document.head.appendChild(tag);
  }).catch((e) => {
    ytApiPromise = null; // 失敗時は次回また読み込みをやり直せるようにする
    throw e;
  });
  return ytApiPromise;
}

// YouTubeのonErrorイベントコード → 人間向けメッセージ
// https://developers.google.com/youtube/iframe_api_reference#onError
function ytErrorMessage(code) {
  if (code === 2) return "動画IDが正しくありません。";
  if (code === 5) return "この端末のプレーヤーでは再生できませんでした。";
  if (code === 100) return "動画が見つからないか、非公開に設定されています。";
  if (code === 101 || code === 150) return "この動画は他サイトでの再生が許可されていません。";
  return "動画の読み込みに失敗しました。";
}

async function authFetch(path, options) {
  if (state.guestMode || !state.currentUser) { const e = new Error("no-user"); throw e; }
  const idToken = await state.currentUser.getIdToken();
  const opts = Object.assign({}, options);
  opts.headers = Object.assign({ Authorization: `Bearer ${idToken}` }, opts.headers || {});
  return fetch(path, opts);
}

function destroyPlayers() {
  if (fallbackPlayTimer) { clearTimeout(fallbackPlayTimer); fallbackPlayTimer = null; }
  if (hiddenPlayer) { try { hiddenPlayer.destroy(); } catch (e) {} hiddenPlayer = null; }
  if (revealPlayer) { try { revealPlayer.destroy(); } catch (e) {} revealPlayer = null; }
  hiddenStarted = false;
}

// ヘッダー左上「← ホーム」。再生中の音を必ず止めてから画面を離れる
function leaveIntroQuiz() {
  renderGeneration++; // 進行中の非同期処理をすべて無効化
  destroyPlayers();
  go("select");
}

function screenShellHTML(bodyHTML) {
  return `
    <div class="q-head" style="margin-bottom:14px">
      <button class="quit" id="iq-back">← ホーム</button>
      <span class="q-count">🎵 イントロドン</span>
    </div>
    <div class="iq-card">${bodyHTML}</div>`;
}

function wireBackButton() {
  const back = app.querySelector("#iq-back");
  if (back) back.onclick = () => leaveIntroQuiz();
}

// ========================================================================
// 画面エントリポイント（render.jsのrender()ディスパッチから呼ばれる）
// ========================================================================
export function renderIntroQuizScreen() {
  renderGeneration++;
  destroyPlayers(); // 前回の画面表示分が残っていれば必ず片付けてから始める
  const myGen = renderGeneration;

  if (state.guestMode || !state.currentUser) {
    app.innerHTML = screenShellHTML(`
      <div class="iq-headline">🔒 ログインが必要です</div>
      <div class="iq-msg">イントロドンで遊ぶにはログインしてください（ゲストモードでは挑戦できません）。</div>`);
    wireBackButton();
    return;
  }

  app.innerHTML = screenShellHTML(`
    <div class="iq-loading"><span class="iq-spinner"></span>出題を準備しています…</div>`);
  wireBackButton();
  startQuiz(myGen);
}

async function startQuiz(myGen) {
  let data;
  try {
    const res = await authFetch("/api/intro-quiz/start", { method: "POST" });
    if (!res.ok) throw new Error("http-" + res.status);
    data = await res.json();
  } catch (e) {
    if (myGen !== renderGeneration) return;
    renderErrorState(myGen, "通信に失敗しました。時間をおいて再度お試しください。", () => startQuiz(myGen));
    return;
  }
  if (myGen !== renderGeneration) return;

  if (!data || !data.ok) {
    renderErrorState(myGen, "通信に失敗しました。時間をおいて再度お試しください。", () => startQuiz(myGen));
    return;
  }
  if (!data.available) {
    renderCard(`
      <div class="iq-headline">😴 本日出題できる曲がありません</div>
      <div class="iq-msg">またの機会にお試しください。</div>`);
    return;
  }

  renderQuizState(myGen, data.sessionId, data.videoId, data.choices);
}

function renderCard(bodyHTML) {
  const card = app.querySelector(".iq-card");
  if (card) card.innerHTML = bodyHTML;
  else app.innerHTML = screenShellHTML(bodyHTML); // 念のためのフォールバック（通常は既にシェルが存在する）
  wireBackButton();
}

function renderErrorState(myGen, message, onRetry) {
  renderCard(`
    <div class="iq-headline iq-headline--error">⚠️ エラー</div>
    <div class="iq-msg">${esc(message)}</div>
    <button class="cta iq-retry-btn" id="iq-error-retry">もう一度試す</button>`);
  const btn = app.querySelector("#iq-error-retry");
  if (btn) btn.onclick = () => {
    if (myGen !== renderGeneration) return;
    renderCard(`<div class="iq-loading"><span class="iq-spinner"></span>出題を準備しています…</div>`);
    onRetry();
  };
}

function renderQuizState(myGen, sessionId, videoId, choices) {
  const LETTERS = ["A", "B", "C"];
  renderCard(`
    <div class="iq-headline">🎧 イントロを聴いて曲を当てよう</div>
    <div class="iq-player-hidden"><div id="iq-yt-hidden"></div></div>
    <button type="button" class="cta iq-playbtn" id="iq-playbtn" disabled>読み込み中…</button>
    <div class="iq-hint">何度でも一時停止して聞き直せます。聞き終えたら曲名を選んでください。</div>
    <div class="opts iq-opts">
      ${choices.map((c, i) => `
        <button class="opt" data-choice="${esc(c.key)}">
          <span class="opt-key">${LETTERS[i] || i + 1}</span>
          <span class="opt-label">${esc(c.title)}${c.artist ? ` <span class="iq-opt-artist">／ ${esc(c.artist)}</span>` : ""}</span>
        </button>`).join("")}
    </div>`);

  const playBtn = app.querySelector("#iq-playbtn");
  const choiceBtns = Array.from(app.querySelectorAll("[data-choice]"));
  let answering = false;

  loadYouTubeApi().then(() => {
    if (myGen !== renderGeneration) return; // 読み込み中に画面が切り替わっていたら何もしない
    const container = app.querySelector("#iq-yt-hidden");
    if (!container) return;

    let readyFired = false;
    const readyTimer = setTimeout(() => {
      if (myGen !== renderGeneration || readyFired) return;
      destroyPlayers();
      renderErrorState(myGen, "YouTubeプレーヤーの起動がタイムアウトしました。通信環境や広告ブロッカーの設定をご確認ください。", () => startQuiz(myGen));
    }, YT_READY_TIMEOUT_MS);

    hiddenPlayer = new window.YT.Player(container, {
      width: "1", height: "1",
      videoId,
      playerVars: {
        autoplay: 0, controls: 0, disablekb: 1, fs: 0,
        iv_load_policy: 3, modestbranding: 1, playsinline: 1, rel: 0,
      },
      events: {
        onReady: () => {
          readyFired = true;
          clearTimeout(readyTimer);
          if (myGen !== renderGeneration) return;
          playBtn.disabled = false;
          playBtn.textContent = "🎧 イントロを聴く";
        },
        onStateChange: (ev) => {
          if (myGen !== renderGeneration) return;
          if (ev.data === window.YT.PlayerState.PLAYING) playBtn.textContent = "⏸ 一時停止";
          else if (ev.data === window.YT.PlayerState.PAUSED) playBtn.textContent = "▶ 続きを聴く";
          else if (ev.data === window.YT.PlayerState.BUFFERING) playBtn.textContent = "⏳ 読み込み中…";
        },
        onError: (ev) => {
          clearTimeout(readyTimer);
          if (myGen !== renderGeneration) return;
          destroyPlayers();
          renderErrorState(myGen, ytErrorMessage(ev.data), () => startQuiz(myGen));
        },
      },
    });
  }).catch(() => {
    if (myGen !== renderGeneration) return;
    renderErrorState(myGen, "YouTubeプレーヤーの読み込みに失敗しました。ネットワーク接続や広告ブロッカーの設定をご確認の上、再度お試しください。", () => startQuiz(myGen));
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
        if (myGen !== renderGeneration) return;
        renderErrorState(myGen, "回答の送信に失敗しました。時間をおいて再度お試しください。", () => startQuiz(myGen));
        return;
      }
      if (myGen !== renderGeneration) return;

      // 選んだ選択肢に正誤マークを付ける（この時点でchoiceBtnsはもう操作不能）
      choiceBtns.forEach((b) => {
        if (b.dataset.choice === data.correctKey) { b.classList.add("correct"); b.innerHTML += '<span class="opt-mark">✓</span>'; }
        else if (b === btn) { b.classList.add("wrong"); b.innerHTML += '<span class="opt-mark">✕</span>'; }
      });

      // サーバーが確定させた増分だけをこの端末のAC表示にも即時反映する
      // （計算はサーバー側のみで行い、ここでは加算結果を表示に使うだけ）
      if (data.ac > 0) {
        S.coins = (S.coins || 0) + data.ac;
        saveCoins(S.coins);
        renderStatusBar();
      }

      setTimeout(() => { if (myGen === renderGeneration) renderResultState(myGen, data); }, 550);
    };
  });
}

function renderResultState(myGen, data) {
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

  renderCard(`
    <div class="iq-verdict ${data.correct ? "pass" : "fail"}">${data.correct ? "🎉 正解！" : "😢 残念！"}</div>
    <div class="iq-answer-line">正解は「${esc(data.title)}」${data.artist ? `／${esc(data.artist)}` : ""} でした</div>
    ${rewardHtml}
    <div class="iq-reveal-wrap" id="iq-reveal-wrap">
      <div id="iq-yt-reveal"></div>
      <button type="button" class="iq-fallback-play" id="iq-fallback-play" hidden>▶ 動画を再生する</button>
    </div>
    <div class="actions iq-actions">
      <button class="ghost" id="iq-retry">もう一度挑戦する</button>
      <button class="cta" id="iq-done">ホームに戻る</button>
    </div>`);

  loadYouTubeApi().then(() => {
    if (myGen !== renderGeneration) return;
    const container = app.querySelector("#iq-yt-reveal");
    if (!container) return;
    const fallbackBtn = app.querySelector("#iq-fallback-play");

    revealPlayer = new window.YT.Player(container, {
      width: "100%", height: "100%",
      videoId: data.videoId,
      playerVars: { autoplay: 1, controls: 1, rel: 0, playsinline: 1 },
      events: {
        onReady: (ev) => {
          if (myGen !== renderGeneration) return;
          try { ev.target.playVideo(); } catch (e) {}
          // モバイルSafari等で自動再生がブロックされた場合の保険：
          // 1.5秒後もまだ再生されていなければ、手動再生ボタンを表示する
          // （この手動クリックなら確実にユーザー操作起点になり再生できる）
          fallbackPlayTimer = setTimeout(() => {
            if (myGen !== renderGeneration || !revealPlayer) return;
            const st = revealPlayer.getPlayerState ? revealPlayer.getPlayerState() : -1;
            if (st !== window.YT.PlayerState.PLAYING && fallbackBtn) fallbackBtn.hidden = false;
          }, 1500);
        },
        onStateChange: (ev) => {
          if (ev.data === window.YT.PlayerState.PLAYING && fallbackBtn) fallbackBtn.hidden = true;
        },
        onError: () => {
          if (myGen !== renderGeneration || !fallbackBtn) return;
          fallbackBtn.hidden = false;
          fallbackBtn.textContent = "⚠️ 動画を読み込めませんでした";
          fallbackBtn.disabled = true;
        },
      },
    });

    if (fallbackBtn) fallbackBtn.onclick = () => { try { revealPlayer.playVideo(); } catch (e) {} };
  }).catch(() => {
    const wrap = app.querySelector("#iq-reveal-wrap");
    if (wrap && myGen === renderGeneration) wrap.innerHTML = `<div class="iq-msg">動画の読み込みに失敗しました。</div>`;
  });

  const doneBtn = app.querySelector("#iq-done");
  if (doneBtn) doneBtn.onclick = () => leaveIntroQuiz();
  const retryBtn = app.querySelector("#iq-retry");
  if (retryBtn) retryBtn.onclick = () => {
    destroyPlayers();
    renderCard(`<div class="iq-loading"><span class="iq-spinner"></span>出題を準備しています…</div>`);
    startQuiz(myGen);
  };
}
