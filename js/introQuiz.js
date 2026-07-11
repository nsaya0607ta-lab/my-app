/* =========================================================================
   🎵 イントロドン（曲当てクイズ）－ 専用フルスクリーン画面
   =========================================================================
   ホーム画面の起動アイコンから go("introquiz") で遷移してくる、独立した
   1画面（ポップアップではない）。#app を丸ごとこの画面のマークアップに
   差し替え、他の画面（quiz/result/dict等）と同じ「画面遷移」の作法に揃える。

   画面内の流れ（すべて同じ #app 内での状態遷移。screen自体は"introquiz"のまま）：
     モード選択 → （アーティスト選択） → 出題（再生＋テキスト回答） → 結果

   YouTube IFrame Player APIは2つのプレイヤーを使い分ける：
     ・hiddenPlayer … 回答前。画面外（position:absolute; left:-9999px）に
       置き、「再生/一時停止」ボタンだけで手動操作する。controls:0で
       ネイティブのシークバー・タイトル表示は出さない。
     ・revealPlayer … 回答後。画面中央の専用エリアにフルサイズで表示し、
       controls:1・autoplay:1でそのままMVを最後まで観られるようにする。

   videoId・正解の曲名・挑戦回数・BP/AC加算は一切クライアントで持たず、
   /api/intro-quiz/start・answer・confirm・reveal （サーバー側）だけが
   正解を知っている状態を保つ。videoId自体はIFrame APIで再生する以上
   ネットワークタブから見えてしまうが、曲名・サムネイル・正解フラグは
   回答確定までレスポンスに一切含めない。

   回答方式は3択ボタンをやめ、テキスト入力＋あいまい検索（レーベンシュタイン
   距離ベースの類似度判定はサーバー側 api/_lib/textMatch.js で行う）にした。
   8割前後一致した場合はサジェスト確認ステップを挟み、日本語表記・英語表記・
   ローマ字表記のどれで答えても正解になる（判定用のカナ・ローマ字・英語表記は
   楽曲マスター側に持たせている）。
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
let lastStartParams = { mode: "random" }; // エラー再試行・「もう一度挑戦する」で使う直近のモード

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

async function postJSON(path, body) {
  const res = await authFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || ("http-" + res.status));
  }
  return res.json();
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

function wireBackButton(onBack) {
  const back = app.querySelector("#iq-back");
  if (back) back.onclick = () => (onBack ? onBack() : leaveIntroQuiz());
}

function renderCard(bodyHTML, onBack) {
  const card = app.querySelector(".iq-card");
  if (card) card.innerHTML = bodyHTML;
  else app.innerHTML = screenShellHTML(bodyHTML); // 念のためのフォールバック（通常は既にシェルが存在する）
  wireBackButton(onBack);
}

function renderErrorState(myGen, message, onRetry) {
  renderCard(`
    <div class="iq-headline iq-headline--error">⚠️ エラー</div>
    <div class="iq-msg">${esc(message)}</div>
    <button class="cta iq-retry-btn" id="iq-error-retry">もう一度試す</button>`);
  const btn = app.querySelector("#iq-error-retry");
  if (btn) btn.onclick = () => {
    if (myGen !== renderGeneration) return;
    onRetry();
  };
}

// ========================================================================
// 画面エントリポイント（render.jsのrender()ディスパッチから呼ばれる）
// ========================================================================
export function renderIntroQuizScreen() {
  renderGeneration++;
  destroyPlayers(); // 前回の画面表示分が残っていれば必ず片付けてから始める

  if (state.guestMode || !state.currentUser) {
    app.innerHTML = screenShellHTML(`
      <div class="iq-headline">🔒 ログインが必要です</div>
      <div class="iq-msg">イントロドンで遊ぶにはログインしてください（ゲストモードでは挑戦できません）。</div>`);
    wireBackButton();
    return;
  }

  app.innerHTML = screenShellHTML("");
  wireBackButton();
  renderModeSelect(renderGeneration);
}

// ------------------------------------------------------------------------
// モード選択（ランダム全曲 / アーティストを選ぶ）
// ------------------------------------------------------------------------
function renderModeSelect(myGen) {
  renderCard(`
    <div class="iq-headline">🎧 遊び方を選んでね</div>
    <div class="iq-msg">イントロを聴いて、曲名を当てよう。日本語・英語表記・ローマ字、どれで答えてもOK！</div>
    <div class="iq-mode-grid">
      <button type="button" class="iq-mode-btn" id="iq-mode-random">
        <span class="iq-mode-emoji" aria-hidden="true">🎲</span>
        <span class="iq-mode-label">ランダム</span>
        <span class="iq-mode-desc">全曲からランダム出題</span>
      </button>
      <button type="button" class="iq-mode-btn" id="iq-mode-artist">
        <span class="iq-mode-emoji" aria-hidden="true">🎤</span>
        <span class="iq-mode-label">アーティストを選ぶ</span>
        <span class="iq-mode-desc">好きな歌手の曲だけで挑戦</span>
      </button>
    </div>`);

  const randomBtn = app.querySelector("#iq-mode-random");
  const artistBtn = app.querySelector("#iq-mode-artist");
  if (randomBtn) randomBtn.onclick = () => {
    if (myGen !== renderGeneration) return;
    lastStartParams = { mode: "random" };
    renderCard(`<div class="iq-loading"><span class="iq-spinner"></span>出題を準備しています…</div>`);
    startQuiz(myGen, lastStartParams);
  };
  if (artistBtn) artistBtn.onclick = () => {
    if (myGen !== renderGeneration) return;
    renderArtistSelect(myGen);
  };
}

// ------------------------------------------------------------------------
// アーティスト選択
// ------------------------------------------------------------------------
async function renderArtistSelect(myGen) {
  renderCard(`<div class="iq-loading"><span class="iq-spinner"></span>アーティスト一覧を取得しています…</div>`, () => renderModeSelect(myGen));

  let data;
  try {
    data = await postJSON("/api/intro-quiz/artists", {});
  } catch (e) {
    if (myGen !== renderGeneration) return;
    renderErrorState(myGen, "アーティスト一覧の取得に失敗しました。時間をおいて再度お試しください。", () => renderArtistSelect(myGen));
    return;
  }
  if (myGen !== renderGeneration) return;

  const artists = (data && data.artists) || [];
  if (!artists.length) {
    renderCard(`
      <div class="iq-headline">😴 選べるアーティストがいません</div>
      <div class="iq-msg">またの機会にお試しください。</div>
      <button class="ghost iq-retry-btn" id="iq-mode-back">モード選択に戻る</button>`, () => renderModeSelect(myGen));
    const backBtn = app.querySelector("#iq-mode-back");
    if (backBtn) backBtn.onclick = () => renderModeSelect(myGen);
    return;
  }

  renderCard(`
    <div class="iq-headline">🎤 アーティストを選んでね</div>
    <div class="iq-artist-list">
      ${artists.map((a) => `
        <button type="button" class="iq-artist-btn" data-artist="${esc(a.artist)}">
          <span class="iq-artist-name">${esc(a.artist)}</span>
          <span class="iq-artist-count">${a.count}曲</span>
        </button>`).join("")}
    </div>`, () => renderModeSelect(myGen));

  app.querySelectorAll("[data-artist]").forEach((btn) => {
    btn.onclick = () => {
      if (myGen !== renderGeneration) return;
      lastStartParams = { mode: "artist", artist: btn.dataset.artist };
      renderCard(`<div class="iq-loading"><span class="iq-spinner"></span>出題を準備しています…</div>`);
      startQuiz(myGen, lastStartParams);
    };
  });
}

// ------------------------------------------------------------------------
// 出題開始
// ------------------------------------------------------------------------
async function startQuiz(myGen, params) {
  let data;
  try {
    data = await postJSON("/api/intro-quiz/start", params || { mode: "random" });
  } catch (e) {
    if (myGen !== renderGeneration) return;
    renderErrorState(myGen, "通信に失敗しました。時間をおいて再度お試しください。", () => startQuiz(myGen, params));
    return;
  }
  if (myGen !== renderGeneration) return;

  if (!data || !data.ok) {
    renderErrorState(myGen, "通信に失敗しました。時間をおいて再度お試しください。", () => startQuiz(myGen, params));
    return;
  }
  if (!data.available) {
    renderCard(`
      <div class="iq-headline">😴 本日出題できる曲がありません</div>
      <div class="iq-msg">またの機会にお試しください。</div>
      <button class="ghost iq-retry-btn" id="iq-mode-back">モード選択に戻る</button>`);
    const backBtn = app.querySelector("#iq-mode-back");
    if (backBtn) backBtn.onclick = () => renderModeSelect(myGen);
    return;
  }

  renderQuizState(myGen, data.sessionId, data.videoId, params);
}

// ------------------------------------------------------------------------
// 出題中（再生＋テキスト回答）
// ------------------------------------------------------------------------
function renderQuizState(myGen, sessionId, videoId, startParams) {
  renderCard(`
    <div class="iq-headline">🎧 イントロを聴いて曲名を当てよう</div>
    <div class="iq-player-hidden"><div id="iq-yt-hidden"></div></div>
    <button type="button" class="cta iq-playbtn" id="iq-playbtn" disabled>読み込み中…</button>
    <div class="iq-hint">何度でも一時停止して聞き直せます。曲名（読み方・英語表記でもOK）を入力してください。</div>
    <div id="iq-answer-area"></div>
    <button type="button" class="ghost iq-giveup-btn" id="iq-giveup">諦めて答えを見る</button>`);

  const playBtn = app.querySelector("#iq-playbtn");
  const giveupBtn = app.querySelector("#iq-giveup");
  let answering = false;
  let finished = false;

  loadYouTubeApi().then(() => {
    if (myGen !== renderGeneration) return; // 読み込み中に画面が切り替わっていたら何もしない
    const container = app.querySelector("#iq-yt-hidden");
    if (!container) return;

    let readyFired = false;
    const readyTimer = setTimeout(() => {
      if (myGen !== renderGeneration || readyFired) return;
      destroyPlayers();
      renderErrorState(myGen, "YouTubeプレーヤーの起動がタイムアウトしました。通信環境や広告ブロッカーの設定をご確認ください。", () => startQuiz(myGen, startParams));
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
          renderErrorState(myGen, ytErrorMessage(ev.data), () => startQuiz(myGen, startParams));
        },
      },
    });
  }).catch(() => {
    if (myGen !== renderGeneration) return;
    renderErrorState(myGen, "YouTubeプレーヤーの読み込みに失敗しました。ネットワーク接続や広告ブロッカーの設定をご確認の上、再度お試しください。", () => startQuiz(myGen, startParams));
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

  function renderAnswerForm(message) {
    const area = app.querySelector("#iq-answer-area");
    if (!area) return;
    area.innerHTML = `
      ${message ? `<div class="iq-feedback">${esc(message)}</div>` : ""}
      <form class="iq-answer-form" id="iq-answer-form" autocomplete="off">
        <input type="text" id="iq-answer-input" class="iq-answer-input" placeholder="曲名を入力" autocomplete="off" maxlength="100" />
        <button type="submit" class="cta iq-submit-btn" id="iq-submit-btn">回答する</button>
      </form>`;
    const form = area.querySelector("#iq-answer-form");
    const input = area.querySelector("#iq-answer-input");
    input.focus();
    form.onsubmit = (ev) => {
      ev.preventDefault();
      const text = input.value.trim();
      if (!text || answering) return;
      submitAnswer(text);
    };
  }

  function renderSuggestConfirm(suggestedTitle, suggestedArtist) {
    const area = app.querySelector("#iq-answer-area");
    if (!area) return;
    area.innerHTML = `
      <div class="iq-suggest-card">
        <div class="iq-suggest-q">🤔 あなたが答えようとしているのはこれですか？</div>
        <div class="iq-suggest-title">「${esc(suggestedTitle)}」${suggestedArtist ? ` <span class="iq-opt-artist">／ ${esc(suggestedArtist)}</span>` : ""}</div>
        <div class="actions iq-actions">
          <button type="button" class="cta" id="iq-suggest-yes">はい、これで正解にする</button>
          <button type="button" class="ghost" id="iq-suggest-no">いいえ、入力し直す</button>
        </div>
      </div>`;
    const yesBtn = area.querySelector("#iq-suggest-yes");
    const noBtn = area.querySelector("#iq-suggest-no");
    if (yesBtn) yesBtn.onclick = () => resolveSuggestion(true);
    if (noBtn) noBtn.onclick = () => resolveSuggestion(false);
  }

  function setBusy(busy) {
    answering = busy;
    if (giveupBtn) giveupBtn.disabled = busy;
    const area = app.querySelector("#iq-answer-area");
    if (area) area.querySelectorAll("button, input").forEach((el) => { el.disabled = busy; });
  }

  async function submitAnswer(text) {
    setBusy(true);
    let data;
    try {
      data = await postJSON("/api/intro-quiz/answer", { sessionId, answerText: text });
    } catch (e) {
      if (myGen !== renderGeneration) return;
      renderErrorState(myGen, "回答の送信に失敗しました。時間をおいて再度お試しください。", () => startQuiz(myGen, startParams));
      return;
    }
    if (myGen !== renderGeneration) return;
    setBusy(false);
    handleAnswerResult(data);
  }

  async function resolveSuggestion(accept) {
    setBusy(true);
    let data;
    try {
      data = await postJSON("/api/intro-quiz/confirm", { sessionId, accept });
    } catch (e) {
      if (myGen !== renderGeneration) return;
      renderErrorState(myGen, "通信に失敗しました。時間をおいて再度お試しください。", () => startQuiz(myGen, startParams));
      return;
    }
    if (myGen !== renderGeneration) return;
    setBusy(false);
    handleAnswerResult(data);
  }

  function handleAnswerResult(data) {
    if (data.done) {
      finished = true;
      if (hiddenPlayer) { try { hiddenPlayer.pauseVideo(); } catch (e) {} }
      playBtn.disabled = true;
      if (giveupBtn) giveupBtn.disabled = true;
      // サーバーが確定させた増分だけをこの端末のAC表示にも即時反映する
      // （計算はサーバー側のみで行い、ここでは加算結果を表示に使うだけ）
      if (data.ac > 0) {
        S.coins = (S.coins || 0) + data.ac;
        saveCoins(S.coins);
        renderStatusBar();
      }
      const area = app.querySelector("#iq-answer-area");
      if (area) area.innerHTML = `<div class="iq-feedback ${data.correct ? "iq-feedback--good" : "iq-feedback--bad"}">${data.correct ? "🎉 正解！" : "😢 残念！"}</div>`;
      setTimeout(() => { if (myGen === renderGeneration) renderResultState(myGen, data, startParams); }, 500);
      return;
    }
    if (data.status === "suggest") { renderSuggestConfirm(data.suggestedTitle, data.suggestedArtist); return; }
    if (data.status === "incorrect") { renderAnswerForm(`不正解…もう一度入力してください（残り${data.attemptsLeft}回）`); return; }
  }

  if (giveupBtn) giveupBtn.onclick = async () => {
    if (answering || finished) return;
    setBusy(true);
    let data;
    try {
      data = await postJSON("/api/intro-quiz/reveal", { sessionId });
    } catch (e) {
      if (myGen !== renderGeneration) return;
      setBusy(false);
      return;
    }
    if (myGen !== renderGeneration) return;
    handleAnswerResult(data);
  };

  renderAnswerForm();
}

// ------------------------------------------------------------------------
// 結果表示
// ------------------------------------------------------------------------
function renderResultState(myGen, data, startParams) {
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
      <button class="ghost" id="iq-change-mode">別のモードで遊ぶ</button>
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
    startQuiz(myGen, startParams);
  };
  const changeModeBtn = app.querySelector("#iq-change-mode");
  if (changeModeBtn) changeModeBtn.onclick = () => {
    destroyPlayers();
    renderModeSelect(myGen);
  };
}
