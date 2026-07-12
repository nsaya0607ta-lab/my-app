/* =========================================================================
   🎵 イントロドン（曲当てクイズ）－ 専用フルスクリーン画面
   =========================================================================
   ホーム画面の起動アイコンから go("introquiz") で遷移してくる、独立した
   1画面（ポップアップではない）。#app を丸ごとこの画面のマークアップに
   差し替え、他の画面（quiz/result/dict等）と同じ「画面遷移」の作法に揃える。

   画面内の流れ（すべて同じ #app 内での状態遷移。screen自体は"introquiz"のまま）：
     モード選択 → （アーティスト選択） → 出題（自動再生＋早押し「はい！」＋
     音声で曲名回答） → 結果

   テレビの早押しイントロドンを再現するため、出題画面はボタン操作をほぼ
   使わない音声主体のフローになっている：
     ①曲が読み込めたら自動再生（②MusicKit相当の役割はYouTube IFrame
       Player APIが担う。hiddenPlayerは画面外・controls:0の非表示プレイヤー）
     ②SpeechRecognition（continuous）で「はい／ハイ／はい！」等の表記ゆれを
       常時待ち受け、検知した瞬間に即座に一時停止する（③④）
     ③停止後にのみ新しいSpeechRecognitionセッションを開始し、話した曲名を
       聞き取る（⑤⑥）。マイク非対応ブラウザや聞き取り失敗時はボタン＋
       テキスト入力にフォールバックする
     ④正解ならジャケット・曲名・アーティストを表示し、revealPlayerで
       そのままフル再生。不正解なら「もう一度回答する」／「正解を見る」を
       選べる
   revealPlayerは画面中央の専用エリアにフルサイズで表示し、controls:1・
   autoplay:1でそのままMVを最後まで観られるようにする。

   videoId・正解の曲名・挑戦回数・BP/AC加算は一切クライアントで持たず、
   /api/intro-quiz （action: start・answer・confirm・reveal、サーバー側）
   だけが正解を知っている状態を保つ。videoId自体はIFrame APIで再生する以上
   ネットワークタブから見えてしまうが、曲名・サムネイル・正解フラグは
   回答確定までレスポンスに一切含めない。

   回答判定は音声認識結果とサーバー側 api/_lib/textMatch.js のあいまい検索
   （レーベンシュタイン距離ベースの類似度＋タイトル文字列の部分一致）で行う。
   全角半角・スペース・大文字小文字・記号・「！」等の表記ゆれや、「YOASOBI
   夜に駆ける」のようにアーティスト名込みで話した場合も正解として扱う。
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
  stopActiveSpeech();
}

// ------------------------------------------------------------------------
// 音声認識（早押し「はい！」の検知 ＋ 曲名の音声回答）
// ブラウザのSpeechRecognition API（Chrome/Edge/Safari系。webkitプレフィックス
// 環境も含む）を使う。未対応ブラウザでは音声系のUIを出さず、画面内の
// 「はい！」ボタンやキーボード入力にフォールバックする。
// ------------------------------------------------------------------------
const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition || null;

function speechSupported() {
  return !!SpeechRecognitionCtor;
}

function createRecognition({ lang = "ja-JP", interim = false, continuous = false } = {}) {
  if (!SpeechRecognitionCtor) return null;
  const rec = new SpeechRecognitionCtor();
  rec.lang = lang;
  rec.interimResults = interim;
  rec.continuous = continuous;
  rec.maxAlternatives = 3;
  return rec;
}

// 同時に有効な音声認識セッションは常に1つだけ（「はい！」検知 → 曲名の聞き取り、
// と直列に切り替わるだけで並行はしない）なので、モジュールスコープの1変数で
// 追跡し、画面離脱・状態遷移のたびに確実に止められるようにする。
let activeSpeechRecognition = null;
function stopActiveSpeech() {
  if (!activeSpeechRecognition) return;
  const rec = activeSpeechRecognition;
  activeSpeechRecognition = null;
  rec.onresult = null; rec.onerror = null; rec.onend = null;
  try { rec.stop(); } catch (e) {}
  try { if (rec.abort) rec.abort(); } catch (e) {}
}

// 「はい」判定用の正規化：全角/半角・大文字小文字・カタカナ/ひらがな・記号や
// 空白のゆらぎを吸収する（api/_lib/textMatch.js の正規化ロジックと考え方は同じ
// だが、こちらはブラウザ側だけで完結させたいのでモジュールを共有せず複製する）
const VOICE_KATAKANA_START = 0x30a1, VOICE_KATAKANA_END = 0x30f6, VOICE_HIRA_OFFSET = 0x30a1 - 0x3041;
const VOICE_STRIP_RE = /[「」『』・･\-ー_\s!！?？.。,、'’"”()（）\[\]【】~〜:：]/g;
function normalizeVoiceText(str) {
  if (!str) return "";
  const nfkc = String(str).normalize("NFKC").toLowerCase();
  let hira = "";
  for (const ch of nfkc) {
    const code = ch.codePointAt(0);
    hira += (code >= VOICE_KATAKANA_START && code <= VOICE_KATAKANA_END)
      ? String.fromCodePoint(code - VOICE_HIRA_OFFSET) : ch;
  }
  return hira.replace(VOICE_STRIP_RE, "").trim();
}

// 「はい！」「ハイ！」「はい」などの表記ゆれをすべて拾う
function isBuzzWord(text) {
  const n = normalizeVoiceText(text);
  return !!n && (n === "はい" || n.startsWith("はい"));
}

// ヘッダー左上「← ホーム」。再生中の音を必ず止めてから画面を離れる
function leaveIntroQuiz() {
  renderGeneration++; // 進行中の非同期処理をすべて無効化
  destroyPlayers();
  go("select");
}

// ---- 音量調整（hiddenPlayer・revealPlayer共通。端末・ブラウザに保存して次回も維持） ----
const VOLUME_STORAGE_KEY = "introQuizVolume";
function loadVolume() {
  try {
    const v = parseInt(localStorage.getItem(VOLUME_STORAGE_KEY), 10);
    return isNaN(v) ? 70 : Math.min(100, Math.max(0, v));
  } catch (e) { return 70; }
}
function saveVolume(v) {
  try { localStorage.setItem(VOLUME_STORAGE_KEY, String(v)); } catch (e) {}
}
function applyVolume(v) {
  if (hiddenPlayer && typeof hiddenPlayer.setVolume === "function") { try { hiddenPlayer.setVolume(v); } catch (e) {} }
  if (revealPlayer && typeof revealPlayer.setVolume === "function") { try { revealPlayer.setVolume(v); } catch (e) {} }
}

function screenShellHTML(bodyHTML) {
  return `
    <div class="q-head" style="margin-bottom:14px">
      <button class="quit" id="iq-back">← ホーム</button>
      <span class="q-count">🎵 イントロドン</span>
    </div>
    <div class="iq-volume-row">
      <span class="iq-volume-icon" aria-hidden="true">🔊</span>
      <input type="range" id="iq-volume" class="iq-volume-slider" min="0" max="100" value="${loadVolume()}" aria-label="音量">
    </div>
    <div class="iq-card">${bodyHTML}</div>`;
}

function wireBackButton(onBack) {
  const back = app.querySelector("#iq-back");
  if (back) back.onclick = () => (onBack ? onBack() : leaveIntroQuiz());
}

function wireVolumeControl() {
  const slider = app.querySelector("#iq-volume");
  if (!slider) return;
  slider.value = String(loadVolume());
  slider.oninput = () => {
    const v = parseInt(slider.value, 10) || 0;
    saveVolume(v);
    applyVolume(v);
  };
}

function renderCard(bodyHTML, onBack) {
  const card = app.querySelector(".iq-card");
  if (card) card.innerHTML = bodyHTML;
  else app.innerHTML = screenShellHTML(bodyHTML); // 念のためのフォールバック（通常は既にシェルが存在する）
  wireBackButton(onBack);
  wireVolumeControl();
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
    wireVolumeControl();
    return;
  }

  app.innerHTML = screenShellHTML("");
  wireBackButton();
  wireVolumeControl();
  renderModeSelect(renderGeneration);
}

// ------------------------------------------------------------------------
// モード選択（ランダム全曲 / アーティストを選ぶ）
// ------------------------------------------------------------------------
function renderModeSelect(myGen) {
  renderCard(`
    <div class="iq-headline">🎧 遊び方を選んでね</div>
    <div class="iq-msg">イントロを聴いて、曲名を当てよう。日本語表記はもちろん、英語表記やローマ字読みでも正解になるよ！</div>
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
    data = await postJSON("/api/intro-quiz", { action: "artists" });
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
    data = await postJSON("/api/intro-quiz", Object.assign({ action: "start" }, params || { mode: "random" }));
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
// 出題中（音声による早押し「はい！」→ 音声で曲名回答。テキスト入力は
// 未対応ブラウザ・認識失敗時のフォールバックとしてのみ表示する）
// ------------------------------------------------------------------------
function renderQuizState(myGen, sessionId, videoId, startParams) {
  renderCard(`
    <div class="iq-headline">🎧 イントロを聴いて曲名を当てよう</div>
    <div class="iq-player-hidden"><div id="iq-yt-hidden"></div></div>
    <div id="iq-stage" class="iq-stage"><div class="iq-loading"><span class="iq-spinner"></span>読み込み中…</div></div>
    <div class="iq-giveup-link-wrap"><button type="button" class="iq-giveup-link" id="iq-giveup">諦めて正解を見る</button></div>`);

  const giveupBtn = app.querySelector("#iq-giveup");
  const stage = () => app.querySelector("#iq-stage");

  // phase: loading（起動中）→ playing（再生中・「はい！」待ち）→
  //        answering（音楽停止・曲名の聞き取り中）→ busy（サーバー通信中）
  let phase = "loading";
  let buzzed = false;
  let finished = false;
  let listenGen = 0; // 音声認識セッションごとに発番。古いセッションのコールバックを無効化する
  let fallbackPlayTimer2 = null;

  function setGiveupEnabled(enabled) {
    if (giveupBtn) giveupBtn.disabled = !enabled;
  }

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
          try { hiddenPlayer.setVolume(loadVolume()); } catch (e) {}
          startPlayback();
        },
        onStateChange: (ev) => {
          if (myGen !== renderGeneration) return;
          if (ev.data === window.YT.PlayerState.PLAYING) {
            if (fallbackPlayTimer2) { clearTimeout(fallbackPlayTimer2); fallbackPlayTimer2 = null; }
            if (phase === "loading") enterPlayingPhase();
          }
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

  // ②MusicKit相当の役割：曲が用意でき次第、ユーザー操作なしで自動再生する
  function startPlayback() {
    if (!hiddenPlayer) return;
    if (!hiddenStarted) { hiddenPlayer.seekTo(0, true); hiddenStarted = true; }
    try { hiddenPlayer.playVideo(); } catch (e) {}
    // モバイルSafari等で自動再生がブロックされた場合の保険（revealPlayer側と同じ手法）
    fallbackPlayTimer2 = setTimeout(() => {
      if (myGen !== renderGeneration || phase !== "loading") return;
      renderAutoplayBlocked();
    }, 1500);
  }

  function renderAutoplayBlocked() {
    const el = stage();
    if (!el) return;
    el.innerHTML = `
      <div class="iq-msg">タップして再生を開始してください</div>
      <button type="button" class="cta iq-buzz-btn" id="iq-manual-play">▶ 再生する</button>`;
    const btn = el.querySelector("#iq-manual-play");
    if (btn) btn.onclick = () => { try { hiddenPlayer.playVideo(); } catch (e) {} };
  }

  // ③曲の再生開始 → 🎵再生中… 表示にして「はい！」の検知を始める
  function enterPlayingPhase() {
    if (finished || phase === "answering" || phase === "busy") return;
    phase = "playing";
    buzzed = false;
    renderPlayingUI();
    startBuzzListening();
  }

  function renderPlayingUI() {
    const el = stage();
    if (!el) return;
    el.innerHTML = `
      <div class="iq-status iq-status--playing">
        <span class="iq-status-icon" aria-hidden="true">🎵</span>
        <span class="iq-status-text">再生中…</span>
      </div>
      <div class="iq-hint">曲がわかったら「はい！」と言ってね</div>
      <button type="button" class="cta iq-buzz-btn" id="iq-buzz-btn">🙋 はい！</button>`;
    const btn = el.querySelector("#iq-buzz-btn");
    if (btn) btn.onclick = () => triggerBuzz();
  }

  function startBuzzListening() {
    if (!speechSupported()) return;
    const myListenGen = ++listenGen;
    const rec = createRecognition({ lang: "ja-JP", interim: true, continuous: true });
    if (!rec) return;
    activeSpeechRecognition = rec;
    rec.onresult = (ev) => {
      if (myGen !== renderGeneration || myListenGen !== listenGen || buzzed) return;
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (isBuzzWord(ev.results[i][0].transcript)) { triggerBuzz(); return; }
      }
    };
    rec.onerror = (ev) => {
      if (myGen !== renderGeneration || myListenGen !== listenGen) return;
      // マイク権限が無い等、続行不能なエラーだけ認識を諦める（無音などはonendで再開する）
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        try { rec.stop(); } catch (e) {}
      }
    };
    rec.onend = () => {
      if (myGen !== renderGeneration || myListenGen !== listenGen || buzzed) return;
      // ブラウザが一定時間で認識を打ち切ることがあるため、再生中はずっと聞き続ける
      try { rec.start(); } catch (e) {}
    };
    try { rec.start(); } catch (e) {}
  }

  // ③「はい！」を検知（または手動ボタン）→ すぐに音楽を止めて回答受付状態へ
  function triggerBuzz() {
    if (buzzed || finished || phase !== "playing") return;
    buzzed = true;
    stopActiveSpeech();
    if (hiddenPlayer) { try { hiddenPlayer.pauseVideo(); } catch (e) {} }
    enterAnsweringPhase();
  }

  // ④音楽停止後にのみ、曲名の音声認識を開始する
  function enterAnsweringPhase() {
    phase = "answering";
    startAnswerListening();
  }

  function renderAnsweringUI() {
    const el = stage();
    if (!el) return;
    el.innerHTML = `
      <div class="iq-status iq-status--answering">
        <span class="iq-status-icon" aria-hidden="true">🎤</span>
        <span class="iq-status-text">曲名を話してください</span>
      </div>
      <div class="iq-mic-wrap">
        <div class="iq-mic-pulse"></div>
        <div class="iq-mic-pulse iq-mic-pulse--2"></div>
        <div class="iq-mic-core" aria-hidden="true">🎤</div>
      </div>
      <div class="iq-waveform" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
      <div class="iq-live-transcript" id="iq-live-transcript">&nbsp;</div>`;
  }

  function updateLiveTranscript(text) {
    const el = app.querySelector("#iq-live-transcript");
    if (el) el.textContent = text || "";
  }

  function startAnswerListening() {
    phase = "answering";
    renderAnsweringUI();
    if (!speechSupported()) { renderTextFallbackForm(); return; }
    const myListenGen = ++listenGen;
    const rec = createRecognition({ lang: "ja-JP", interim: true, continuous: false });
    if (!rec) { renderTextFallbackForm(); return; }
    activeSpeechRecognition = rec;
    let finalized = false;
    rec.onresult = (ev) => {
      if (myGen !== renderGeneration || myListenGen !== listenGen || finalized) return;
      let interimText = "", finalText = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalText += r[0].transcript; else interimText += r[0].transcript;
      }
      updateLiveTranscript(finalText || interimText);
      const text = finalText.trim();
      if (text) {
        finalized = true;
        try { rec.stop(); } catch (e) {}
        submitAnswer(text);
      }
    };
    rec.onerror = (ev) => {
      if (myGen !== renderGeneration || myListenGen !== listenGen || finalized) return;
      if (ev.error === "no-speech" || ev.error === "aborted") return; // onendでまとめて処理する
      finalized = true;
      renderAnswerRetry();
    };
    rec.onend = () => {
      if (myGen !== renderGeneration || myListenGen !== listenGen || finalized) return;
      finalized = true;
      renderAnswerRetry(); // ⑦音声が認識できなかった場合
    };
    try { rec.start(); } catch (e) { renderAnswerRetry(); }
  }

  function renderAnswerRetry() {
    if (phase !== "answering" || finished) return;
    const el = stage();
    if (!el) return;
    el.innerHTML = `
      <div class="iq-feedback">😥 もう一度お願いします</div>
      <button type="button" class="cta iq-buzz-btn" id="iq-retry-listen">🎤 もう一度話す</button>
      <button type="button" class="ghost iq-text-fallback-btn" id="iq-text-fallback">キーボードで入力する</button>`;
    const retryBtn = el.querySelector("#iq-retry-listen");
    const textBtn = el.querySelector("#iq-text-fallback");
    if (retryBtn) retryBtn.onclick = () => startAnswerListening();
    if (textBtn) textBtn.onclick = () => renderTextFallbackForm();
  }

  function renderTextFallbackForm(message) {
    listenGen++; // 進行中の音声認識コールバックを無効化する
    stopActiveSpeech();
    const el = stage();
    if (!el) return;
    el.innerHTML = `
      ${message ? `<div class="iq-feedback">${esc(message)}</div>` : ""}
      <form class="iq-answer-form" id="iq-answer-form" autocomplete="off">
        <input type="text" id="iq-answer-input" class="iq-answer-input" placeholder="曲名を入力" autocomplete="off" maxlength="100" />
        <button type="submit" class="cta iq-submit-btn" id="iq-submit-btn">回答する</button>
      </form>`;
    const form = el.querySelector("#iq-answer-form");
    const input = el.querySelector("#iq-answer-input");
    if (input) input.focus();
    if (form) form.onsubmit = (ev) => {
      ev.preventDefault();
      const text = input.value.trim();
      if (!text || phase === "busy") return;
      submitAnswer(text);
    };
  }

  function renderSuggestConfirm(suggestedTitle, suggestedArtist) {
    const el = stage();
    if (!el) return;
    el.innerHTML = `
      <div class="iq-suggest-card">
        <div class="iq-suggest-q">🤔 あなたが答えようとしているのはこれですか？</div>
        <div class="iq-suggest-title">「${esc(suggestedTitle)}」${suggestedArtist ? ` <span class="iq-opt-artist">／ ${esc(suggestedArtist)}</span>` : ""}</div>
        <div class="actions iq-actions">
          <button type="button" class="cta" id="iq-suggest-yes">はい、これで正解にする</button>
          <button type="button" class="ghost" id="iq-suggest-no">いいえ、入力し直す</button>
        </div>
      </div>`;
    const yesBtn = el.querySelector("#iq-suggest-yes");
    const noBtn = el.querySelector("#iq-suggest-no");
    if (yesBtn) yesBtn.onclick = () => resolveSuggestion(true);
    if (noBtn) noBtn.onclick = () => resolveSuggestion(false);
  }

  // ⑦不正解：もう一度回答する／正解を見る、のどちらかを選べるようにする
  function renderIncorrectChoice(message) {
    const el = stage();
    if (!el) return;
    el.innerHTML = `
      <div class="iq-feedback iq-feedback--bad">${esc(message)}</div>
      <div class="actions iq-actions">
        <button type="button" class="cta" id="iq-answer-again">🎤 もう一度回答する</button>
        <button type="button" class="ghost" id="iq-reveal-answer">🏳 正解を見る</button>
      </div>`;
    const againBtn = el.querySelector("#iq-answer-again");
    const revealBtn = el.querySelector("#iq-reveal-answer");
    if (againBtn) againBtn.onclick = () => startAnswerListening();
    if (revealBtn) revealBtn.onclick = () => doReveal();
  }

  function setBusy(busy) {
    phase = busy ? "busy" : "answering";
    setGiveupEnabled(!busy);
  }

  async function submitAnswer(text) {
    setBusy(true);
    let data;
    try {
      data = await postJSON("/api/intro-quiz", { action: "answer", sessionId, answerText: text });
    } catch (e) {
      if (myGen !== renderGeneration) return;
      renderErrorState(myGen, "回答の送信に失敗しました。時間をおいて再度お試しください。", () => startQuiz(myGen, startParams));
      return;
    }
    if (myGen !== renderGeneration) return;
    handleAnswerResult(data);
  }

  async function resolveSuggestion(accept) {
    setBusy(true);
    let data;
    try {
      data = await postJSON("/api/intro-quiz", { action: "confirm", sessionId, accept });
    } catch (e) {
      if (myGen !== renderGeneration) return;
      renderErrorState(myGen, "通信に失敗しました。時間をおいて再度お試しください。", () => startQuiz(myGen, startParams));
      return;
    }
    if (myGen !== renderGeneration) return;
    handleAnswerResult(data);
  }

  async function doReveal() {
    if (finished || phase === "busy") return;
    setBusy(true);
    let data;
    try {
      data = await postJSON("/api/intro-quiz", { action: "reveal", sessionId });
    } catch (e) {
      if (myGen !== renderGeneration) return;
      phase = "answering";
      setGiveupEnabled(true);
      return;
    }
    if (myGen !== renderGeneration) return;
    handleAnswerResult(data);
  }

  // ⑥⑦音声認識結果と正解を比較する（実際の判定はサーバー側 api/_lib/textMatch.js。
  // 全角半角・スペース・大文字小文字・記号・「！」・多少の表記ゆれを吸収する）
  function handleAnswerResult(data) {
    if (data.done) {
      finished = true;
      listenGen++;
      stopActiveSpeech();
      if (hiddenPlayer) { try { hiddenPlayer.pauseVideo(); } catch (e) {} }
      setGiveupEnabled(false);
      // サーバーが確定させた増分だけをこの端末のAC表示にも即時反映する
      // （計算はサーバー側のみで行い、ここでは加算結果を表示に使うだけ）
      if (data.ac > 0) {
        S.coins = (S.coins || 0) + data.ac;
        saveCoins(S.coins);
        renderStatusBar();
      }
      const el = stage();
      if (el) el.innerHTML = `<div class="iq-feedback ${data.correct ? "iq-feedback--good" : "iq-feedback--bad"}">${data.correct ? "🎉 正解！" : "😢 残念！"}</div>`;
      setTimeout(() => { if (myGen === renderGeneration) renderResultState(myGen, data, startParams); }, 500);
      return;
    }
    phase = "answering";
    setGiveupEnabled(true);
    if (data.status === "suggest") { renderSuggestConfirm(data.suggestedTitle, data.suggestedArtist); return; }
    if (data.status === "incorrect") { renderIncorrectChoice(`😢 不正解…もう一度チャレンジしてみよう（残り${data.attemptsLeft}回）`); return; }
  }

  if (giveupBtn) giveupBtn.onclick = () => doReveal();
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
    <img class="iq-jacket" src="https://i.ytimg.com/vi/${encodeURIComponent(data.videoId)}/hqdefault.jpg" alt="" aria-hidden="true" />
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
          try { ev.target.setVolume(loadVolume()); } catch (e) {}
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
