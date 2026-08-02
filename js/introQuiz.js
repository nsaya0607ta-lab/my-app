/* =========================================================================
   イントロドン（曲当てクイズ）－ 専用フルスクリーン画面
   =========================================================================
   ホーム画面の起動アイコンから go("introquiz") で遷移してくる、独立した
   1画面（ポップアップではない）。#app を丸ごとこの画面のマークアップに
   差し替え、他の画面（quiz/result/dict等）と同じ「画面遷移」の作法に揃える。

   デザインはホーム画面（css/home-dashboard-finished.css の --home-* 変数・
   白基調＋淡い水色グラデーション・Glassmorphism・大きめ角丸）をそのまま
   踏襲し、絵文字は使わずSVGの線画アイコンのみを使う。

   画面内の流れ（すべて同じ #app 内での状態遷移。screen自体は"introquiz"のまま）：
     ゲーム設定＋モード選択 → （アーティスト選択はモードカード内でインライン）
     → 出題（自動再生＋早押し「はい！」＋音声で曲名回答） → 結果

   テレビの早押しイントロドンを再現するため、出題画面はボタン操作をほぼ
   使わない音声主体のフローになっている：
     ①曲が読み込めたら自動再生（YouTube IFrame Player APIが再生を担う。
       hiddenPlayerは画面外・controls:0の非表示プレイヤー）
     ②SpeechRecognition（continuous）で「はい／ハイ／はい！」等の表記ゆれを
       常時待ち受け、検知した瞬間に即座に一時停止する
     ③停止後にのみ新しいSpeechRecognitionセッションを開始し、話した曲名を
       聞き取る。マイク非対応ブラウザや聞き取り失敗時はボタン＋
       テキスト入力にフォールバックする
     ④正解ならジャケット・曲名・アーティストを表示し、revealPlayerで
       そのままフル再生。不正解なら「もう一度回答する」／「正解を見る」を
       選べる
   revealPlayerは画面中央の専用エリアにフルサイズで表示し、controls:1・
   autoplay:1でそのままMVを最後まで観られるようにする。

   ゲーム設定（制限時間・再生秒数・音量）は端末ローカルに保存する見た目上・
   体験上の設定で、videoId・正解の曲名・挑戦回数・BP/AC加算は一切クライアント
   で持たず、/api/intro-quiz （action: start・answer・confirm・reveal、
   サーバー側）だけが正解を知っている状態を保つ。
   ========================================================================= */
import { esc, saveCoins } from './core.js';
import { S, state } from './state.js';
import { app, go, renderStatusBar } from './render.js';
import * as VoiceprintManager from './voiceprint/VoiceprintManager.js';
import * as registrantsUI from './voiceprint/registrantsUI.js';

// ---- 画面内の状態管理 ----
// このモジュールが管理するのは「イントロドン画面がマウントされている間」
// だけのローカル状態。renderGenerationは画面を出入りするたびにインクリメントし、
// 既に古くなった非同期処理（YouTube API読み込み・fetch応答）がDOMを触らないように
// するための世代番号。
let renderGeneration = 0;
let hiddenPlayer = null;
let revealPlayer = null;
let hiddenStarted = false;   // 「1回目の再生ボタン」で0秒から再生済みか
let fallbackPlayTimer = null;
let lastStartParams = { mode: "random" }; // 「別のモードで遊ぶ」等で使う直近のモード

const YT_API_LOAD_TIMEOUT_MS = 12000;
const YT_READY_TIMEOUT_MS = 10000;

/* =========================================================================
   アイコン（SF Symbols的な線画アイコン）
   絵文字は一切使わず、すべてstroke=currentColorのSVGで統一する。
   色（ネイビー・ブルー・グレー）は配置先のCSSのcolorプロパティで指定する。
   ========================================================================= */
const ICON_CHEVRON_LEFT = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 5 8 12 14.5 19"></polyline></svg>`;
const ICON_SLIDERS = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="19" x2="5" y2="13"></line><line x1="5" y1="10" x2="5" y2="5"></line><circle cx="5" cy="11.5" r="2"></circle><line x1="12" y1="19" x2="12" y2="14.5"></line><line x1="12" y1="11.5" x2="12" y2="5"></line><circle cx="12" cy="13" r="2"></circle><line x1="19" y1="19" x2="19" y2="9.5"></line><line x1="19" y1="6.5" x2="19" y2="5"></line><circle cx="19" cy="8" r="2"></circle></svg>`;
const ICON_CLOCK = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3.2 2"></path></svg>`;
const ICON_WAVE = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="4" y1="14" x2="4" y2="10"></line><line x1="8.5" y1="17" x2="8.5" y2="7"></line><line x1="13" y1="19.5" x2="13" y2="4.5"></line><line x1="17.5" y1="16" x2="17.5" y2="8"></line><line x1="21" y1="13" x2="21" y2="11"></line></svg>`;
const ICON_SPEAKER = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.6L13 19V5L7.6 9.5H4Z"></path><path d="M17 9a4 4 0 0 1 0 6"></path><path d="M19.3 6.7a7.6 7.6 0 0 1 0 10.6"></path></svg>`;
const ICON_INFO = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"></circle><line x1="12" y1="11" x2="12" y2="16"></line><circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none"></circle></svg>`;
const ICON_SHUFFLE = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>`;
const ICON_MIC = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5.5 11a6.5 6.5 0 0 0 13 0"></path><line x1="12" y1="17.5" x2="12" y2="21"></line><line x1="8.5" y1="21" x2="15.5" y2="21"></line></svg>`;
const ICON_LIST = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6.5" x2="15" y2="6.5"></line><line x1="4" y1="12" x2="15" y2="12"></line><line x1="4" y1="17.5" x2="11" y2="17.5"></line><circle cx="19" cy="16" r="2.4"></circle><line x1="21.4" y1="16" x2="21.4" y2="7.5"></line><path d="M21.4 7.5 18 8.6"></path></svg>`;
const ICON_ERA = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.4"></rect><line x1="3.5" y1="9.5" x2="20.5" y2="9.5"></line><line x1="8" y1="3" x2="8" y2="6.5"></line><line x1="16" y1="3" x2="16" y2="6.5"></line></svg>`;
const ICON_TAG = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 3.5H6a2.5 2.5 0 0 0-2.5 2.5v5.5L13 21l7.5-7.5L11.5 3.5Z"></path><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none"></circle></svg>`;
const ICON_HAND = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12.5V5.2a1.4 1.4 0 0 1 2.8 0V11"></path><path d="M10.8 11V4a1.4 1.4 0 0 1 2.8 0v7"></path><path d="M13.6 11V5.4a1.4 1.4 0 0 1 2.8 0V13"></path><path d="M16.4 9.4a1.4 1.4 0 0 1 2.8 0v5.6c0 3.6-2.3 6.5-6.2 6.5-2.6 0-4-.9-5.4-2.8L4.6 14a1.5 1.5 0 0 1 2.3-1.9L8 13.3"></path></svg>`;
const ICON_SOUND = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v4h3.2L12 17.5v-11L7.2 10H4Z"></path><path d="M15.3 9.3a4 4 0 0 1 0 5.4"></path></svg>`;
const ICON_PAUSE = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="6" x2="9" y2="18"></line><line x1="15" y1="6" x2="15" y2="18"></line></svg>`;
const ICON_CHECK_CIRCLE = `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.2"></circle><polyline points="8 12.3 10.8 15 16 9"></polyline></svg>`;
const ICON_X_CIRCLE = `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.2"></circle><line x1="9" y1="9" x2="15" y2="15"></line><line x1="15" y1="9" x2="9" y2="15"></line></svg>`;
const ICON_WARNING = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 21.5 20h-19L12 3.5Z"></path><line x1="12" y1="10" x2="12" y2="14.2"></line><circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none"></circle></svg>`;
const ICON_LOCK = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="9.5" rx="2.2"></rect><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"></path></svg>`;
const ICON_EMPTY = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.2"></circle><line x1="8.3" y1="10.5" x2="10.5" y2="10.5"></line><line x1="13.5" y1="10.5" x2="15.7" y2="10.5"></line><path d="M8.5 15.5c1.1-1 2.3-1.5 3.5-1.5s2.4.5 3.5 1.5"></path></svg>`;
const ICON_MINUS = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
const ICON_PLUS = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
const ICON_PLAY_SMALL = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="none"><polygon points="6,4 20,12 6,20"></polygon></svg>`;
const ICON_SETTINGS_GEAR = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"></circle><path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V19.5a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.96 17.85a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 13.5 1.7 1.7 0 0 0 3.04 12.46H2.95a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 7.42 1.7 1.7 0 0 0 4.26 5.55l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 8.96 3.06 1.7 1.7 0 0 0 10 1.5V1.41a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.04 3.06a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 7.42 1.7 1.7 0 0 0 20.96 8.46h.09a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.04Z"></path></svg>`;

// 出題モードのカタログ。「available:false」は今後追加予定の枠（プレイリスト・
// 年代別・ジャンル）で、カード自体は表示するが選択不可（近日公開）にする。
// 新しいモードを増やす時はここに1要素足すだけで一覧に反映される。
const GAME_MODES = [
  { key: "random",   label: "ランダム",     desc: "全曲からランダム出題",                         icon: ICON_SHUFFLE, available: true },
  { key: "artist",   label: "アーティスト", desc: "好きなアーティストだけ出題",                   icon: ICON_MIC,     available: true },
  { key: "playlist", label: "プレイリスト", desc: "登録済みプレイリストから出題",                 icon: ICON_LIST,    available: false },
  { key: "era",      label: "年代別",       desc: "90年代・2000年代・2010年代・2020年代",         icon: ICON_ERA,     available: false },
  { key: "genre",    label: "ジャンル",     desc: "J-POP・アニソン・ボカロ・洋楽・K-POP",         icon: ICON_TAG,     available: false },
];

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
  registrantsUI.cancelActiveRecording();
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
  rec.maxAlternatives = 8;
  return rec;
}

let introSpeechPermission = "unknown"; // unknown | granted | denied | unsupported

// iPhoneでは非同期処理の後から初めてマイクを開くと拒否されることがあるため、
// 「ゲーム開始」という明確なユーザー操作の中で先に権限を確認しておく。
// 権限が取れなくても手動の「はい！」と文字入力でゲームは続行できる。
async function prepareIntroMicrophone() {
  if (!speechSupported()) {
    introSpeechPermission = "unsupported";
    return introSpeechPermission;
  }
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    return introSpeechPermission;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    introSpeechPermission = "granted";
  } catch (e) {
    introSpeechPermission = "denied";
  }
  return introSpeechPermission;
}

// 同時に有効な音声認識セッションは常に1つだけ（「はい！」検知 → 曲名の聞き取り、
// と直列に切り替わるだけで並行はしない）なので、モジュールスコープの1変数で
// 追跡し、画面離脱・状態遷移のたびに確実に止められるようにする。
let activeSpeechRecognition = null;
function stopActiveSpeech() {
  if (!activeSpeechRecognition) return;
  const rec = activeSpeechRecognition;
  activeSpeechRecognition = null;
  rec.onstart = null; rec.onresult = null; rec.onerror = null; rec.onend = null;
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

const BUZZ_WORD_VARIANTS = new Set(["はい", "はいはい", "はあい", "へい", "hey", "灰", "配", "肺", "牌"]);

// 「はい！」をカナ・漢字・英語に誤変換した候補も拾う一方、歌詞の長い文章に
// 「はい」が含まれただけでは反応しないよう短い発話だけに限定する。
function isBuzzWord(text) {
  const n = normalizeVoiceText(text);
  if (!n) return false;
  // Web Speechは「はい」を「灰」「配」「肺」「hey」等に変換することがある。
  // 曲中の歌詞による誤反応を避けるため、長い文章への部分一致は行わない。
  if (BUZZ_WORD_VARIANTS.has(n)) return true;
  const withoutFiller = n.replace(/^(?:あ|え|えっと|あの)+/, "");
  return withoutFiller.length <= 4 && /^(?:はい|へい)(?:はい)?$/.test(withoutFiller);
}

// SpeechRecognitionはlang="ja-JP"だと同音異義語をIMEのように漢字へ自動変換して
// しまい（例：「はい」→「配」「灰」、曲名の読みが違う漢字に変換される等）、
// 判定の妨げになることがある。この変換を無効化するAPIオプションは無いため、
// maxAlternativesで複数候補を取り、その中に漢字を含まない（読みのままの）
// 候補があればそちらを優先して使うことで実質的に回避する。
const KANJI_RE = /[一-鿿]/;
function pickNonKanjiTranscript(result) {
  let fallback = "";
  for (let j = 0; j < result.length; j++) {
    const t = result[j] && result[j].transcript;
    if (!t) continue;
    if (!fallback) fallback = t;
    if (!KANJI_RE.test(t)) return t;
  }
  return fallback;
}

function collectTranscripts(result) {
  const values = [];
  for (let j = 0; j < result.length; j++) {
    const text = result[j] && String(result[j].transcript || "").trim();
    if (text && !values.includes(text)) values.push(text);
  }
  return values;
}

function transcriptForDisplay(result) {
  const picked = pickNonKanjiTranscript(result);
  if (!picked || KANJI_RE.test(picked)) return "ことばを確認しています…";
  return normalizeVoiceText(picked) || "ことばを確認しています…";
}

// ヘッダー左上「← ホーム」。再生中の音を必ず止めてから画面を離れる
function leaveIntroQuiz() {
  renderGeneration++; // 進行中の非同期処理をすべて無効化
  destroyPlayers();
  go("select");
}

/* =========================================================================
   ゲーム設定（制限時間・再生秒数・音量）。端末・ブラウザに保存して次回も維持する。
   値0は「無制限／フル」を表す特別値で、両方とも配列の末尾に置く。
   ========================================================================= */
const TIME_LIMIT_OPTIONS = [10, 15, 20, 30, 0];
const PLAY_SECONDS_OPTIONS = [3, 5, 8, 12, 0];
const STEPPER_INFINITE_LABEL = { timeLimit: "無制限", playSeconds: "フル" };

const VOLUME_STORAGE_KEY = "introQuizVolume";
const TIME_LIMIT_STORAGE_KEY = "introQuizTimeLimit";
const PLAY_SECONDS_STORAGE_KEY = "introQuizPlaySeconds";

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

function loadTimeLimit() {
  try {
    const v = parseInt(localStorage.getItem(TIME_LIMIT_STORAGE_KEY), 10);
    return TIME_LIMIT_OPTIONS.includes(v) ? v : 15;
  } catch (e) { return 15; }
}
function saveTimeLimit(v) { try { localStorage.setItem(TIME_LIMIT_STORAGE_KEY, String(v)); } catch (e) {} }

function loadPlaySeconds() {
  try {
    const v = parseInt(localStorage.getItem(PLAY_SECONDS_STORAGE_KEY), 10);
    return PLAY_SECONDS_OPTIONS.includes(v) ? v : 8;
  } catch (e) { return 8; }
}
function savePlaySeconds(v) { try { localStorage.setItem(PLAY_SECONDS_STORAGE_KEY, String(v)); } catch (e) {} }

function stepOption(options, current, dir) {
  const idx = options.indexOf(current);
  const next = Math.min(options.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + dir));
  return options[next];
}

// ゲーム開始時にrenderQuizStateへ引き継ぐ、直近で選んだ設定値
let activePlaySeconds = loadPlaySeconds();
let activeTimeLimit = loadTimeLimit();

function screenShellHTML(bodyHTML) {
  return `
    <div class="iq-header">
      <button type="button" class="quit iq-back-btn" id="iq-back">${ICON_CHEVRON_LEFT}<span>ホーム</span></button>
      <button type="button" class="iq-settings-btn" id="iq-settings" aria-label="設定" title="設定">${ICON_SETTINGS_GEAR}</button>
    </div>
    <h1 class="iq-title">イントロドン</h1>
    <div class="iq-body" id="iq-body">${bodyHTML}</div>`;
}

function wireBackButton(onBack) {
  const back = app.querySelector("#iq-back");
  if (back) back.onclick = () => (onBack ? onBack() : leaveIntroQuiz());
}

// 設定ボタンはどの内部画面からでも常に同じ入口（設定トップ）へ遷移する。
// renderCard()経由で毎回配線し直すため、現在有効な世代（renderGeneration）を
// そのつど直接参照すればよく、呼び出し元からmyGenを渡し回す必要がない
function wireSettingsButton() {
  const btn = app.querySelector("#iq-settings");
  if (btn) btn.onclick = () => openSettingsRoot(renderGeneration);
}

function renderCard(bodyHTML, onBack) {
  const body = app.querySelector("#iq-body");
  if (body) body.innerHTML = bodyHTML;
  else app.innerHTML = screenShellHTML(bodyHTML); // 念のためのフォールバック（通常は既にシェルが存在する）
  wireBackButton(onBack);
  wireSettingsButton();
}

function loadingCardHTML(text) {
  return `<div class="iq-card"><div class="iq-loading"><span class="iq-spinner"></span>${esc(text)}</div></div>`;
}

function renderErrorState(myGen, message, onRetry) {
  renderCard(`
    <div class="iq-card">
      <div class="iq-headline iq-headline--error">${ICON_WARNING}<span>エラー</span></div>
      <div class="iq-msg">${esc(message)}</div>
      <button type="button" class="cta iq-retry-btn" id="iq-error-retry">もう一度試す</button>
    </div>`);
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
      <div class="iq-card">
        <div class="iq-headline">${ICON_LOCK}<span>ログインが必要です</span></div>
        <div class="iq-msg">イントロドンで遊ぶにはログインしてください（ゲストモードでは挑戦できません）。</div>
      </div>`);
    wireBackButton();
    wireSettingsButton();
    return;
  }

  app.innerHTML = screenShellHTML("");
  renderSetupScreen(renderGeneration);
}

// 設定ボタンの共通入口：どの内部画面にいてもここから設定トップへ入る。
// 再生中の音・音声認識・録音を確実に止めてから遷移する
function openSettingsRoot(myGen) {
  if (myGen !== renderGeneration) return;
  if (state.guestMode || !state.currentUser) return;
  destroyPlayers();
  renderSettingsScreen(myGen);
}

// ------------------------------------------------------------------------
// 設定（登録者管理・ゲーム設定・音声設定）
// ------------------------------------------------------------------------
function renderSettingsScreen(myGen) {
  registrantsUI.renderSettingsScreen({
    renderCard,
    onBack: () => renderSetupScreen(myGen),
    onOpenRegistrants: () => renderRegistrantListScreen(myGen),
  });
}

function renderRegistrantListScreen(myGen) {
  registrantsUI.renderRegistrantList({
    renderCard,
    onBack: () => renderSettingsScreen(myGen),
    onAdd: () => renderRegisterStep1Screen(myGen),
    onEdit: (id) => renderEditRegistrantScreen(myGen, id),
  });
}

function renderRegisterStep1Screen(myGen) {
  registrantsUI.renderRegisterStep1({
    renderCard,
    onBack: () => renderRegistrantListScreen(myGen),
    onNext: (name) => renderRegisterStep2Screen(myGen, name, null),
  });
}

// editId: nullなら新規登録（VoiceprintManager.add）、指定ありなら声紋の録り直し（updateVoiceprint）
function renderRegisterStep2Screen(myGen, name, editId) {
  registrantsUI.renderRegisterStep2({
    renderCard,
    isCurrent: () => myGen === renderGeneration,
    onBack: () => (editId ? renderEditRegistrantScreen(myGen, editId) : renderRegisterStep1Screen(myGen)),
    onSaved: (voiceprint) => {
      if (editId) VoiceprintManager.updateVoiceprint(editId, voiceprint);
      else VoiceprintManager.add({ name, voiceprint });
      renderRegistrantListScreen(myGen);
    },
  }, name);
}

function renderEditRegistrantScreen(myGen, id) {
  registrantsUI.renderEditRegistrant({
    renderCard,
    onBack: () => renderRegistrantListScreen(myGen),
    onNameSaved: () => renderRegistrantListScreen(myGen),
    onRerecord: (name) => renderRegisterStep2Screen(myGen, name, id),
  }, id);
}

// ------------------------------------------------------------------------
// ゲーム設定＋モード選択画面（ホーム画面から遷移して最初に表示するカード群）
//   ・ゲーム設定カード：制限時間／再生秒数／音量
//   ・遊び方カード
//   ・ゲームモード：カード＋ラジオボタン（アーティスト選択時はカード内で
//     インラインにアーティスト一覧を展開する）
//   ・下部の大きな「ゲーム開始」ボタン
// ------------------------------------------------------------------------
function renderSetupScreen(myGen) {
  let selectedMode = lastStartParams.mode === "artist" ? "artist" : "random";
  let selectedArtist = lastStartParams.mode === "artist" ? (lastStartParams.artist || null) : null;
  let artistsState = { status: "idle", list: [] }; // idle | loading | loaded | error
  let timeLimit = loadTimeLimit();
  let playSeconds = loadPlaySeconds();

  mount();
  if (selectedMode === "artist") loadArtists();

  function mount() {
    renderCard(setupBodyHTML());
    wireSteppers();
    wireVolume();
    wireModeList();
    wireStartButton();
  }

  function setupBodyHTML() {
    const v = loadVolume();
    return `
      <div class="iq-card">
        <div class="iq-card-title"><span class="iq-card-icon">${ICON_SLIDERS}</span>ゲーム設定</div>

        <div class="iq-setting-row">
          <div class="iq-setting-head">
            <span class="iq-setting-icon">${ICON_CLOCK}</span>
            <div class="iq-setting-text">
              <div class="iq-setting-label">制限時間</div>
              <div class="iq-setting-sub">曲が止まってから答えるまでの時間</div>
            </div>
          </div>
          ${stepperHTML("timeLimit", timeLimit, TIME_LIMIT_OPTIONS)}
        </div>

        <div class="iq-setting-row">
          <div class="iq-setting-head">
            <span class="iq-setting-icon">${ICON_WAVE}</span>
            <div class="iq-setting-text">
              <div class="iq-setting-label">再生秒数</div>
              <div class="iq-setting-sub">イントロを流す長さ</div>
            </div>
          </div>
          ${stepperHTML("playSeconds", playSeconds, PLAY_SECONDS_OPTIONS)}
        </div>

        <div class="iq-setting-row iq-setting-row--volume">
          <div class="iq-setting-head">
            <span class="iq-setting-icon">${ICON_SPEAKER}</span>
            <div class="iq-setting-text"><div class="iq-setting-label">音量</div></div>
            <span class="iq-volume-pct" id="iq-volume-pct">${v}%</span>
          </div>
          <input type="range" id="iq-volume" class="iq-ios-slider" min="0" max="100" value="${v}" style="--val:${v}%" aria-label="音量">
          <div class="iq-volume-warning" id="iq-volume-warning"${v === 0 ? "" : ' hidden'}>音量が0%です。曲を聴くには音量を上げてください。</div>
        </div>
      </div>

      <div class="iq-card">
        <div class="iq-card-title"><span class="iq-card-icon iq-card-icon--gray">${ICON_INFO}</span>遊び方</div>
        <ol class="iq-howto-list">
          <li>イントロを聴き、わかったら「はい！」と言います。</li>
          <li>曲が止まったら、曲名をそのまま話します。</li>
          <li>読みはひらがなに寄せ、少しの聞き違いも含めて判定します。</li>
        </ol>
        <p class="iq-voice-guide">最初の開始時にマイクの使用を「許可」してください。使えない場合も、画面のボタンと文字入力で遊べます。</p>
      </div>

      <div>
        <div class="iq-section-title">ゲームモード</div>
        <div class="iq-mode-list" id="iq-mode-list">${modeListHTML()}</div>
      </div>

      <button type="button" class="iq-start-btn" id="iq-start-btn" disabled>ゲーム開始</button>
    `;
  }

  function stepperHTML(key, value, options) {
    const idx = options.indexOf(value);
    const isInf = value === 0;
    return `
      <div class="iq-stepper" data-stepper="${key}">
        <button type="button" class="iq-stepper-btn" data-dir="-1" ${idx <= 0 ? "disabled" : ""} aria-label="減らす">${ICON_MINUS}</button>
        <div class="iq-stepper-value">
          <span class="iq-stepper-num" data-val="${key}">${isInf ? STEPPER_INFINITE_LABEL[key] : value}</span>
          <span class="iq-stepper-unit" data-unit="${key}"${isInf ? ' style="display:none"' : ""}>秒</span>
        </div>
        <button type="button" class="iq-stepper-btn" data-dir="1" ${idx >= options.length - 1 ? "disabled" : ""} aria-label="増やす">${ICON_PLUS}</button>
      </div>`;
  }

  function updateStepperUI(key, value, options) {
    const row = app.querySelector(`.iq-stepper[data-stepper="${key}"]`);
    if (!row) return;
    const idx = options.indexOf(value);
    const isInf = value === 0;
    const numEl = row.querySelector(".iq-stepper-num");
    const unitEl = row.querySelector(".iq-stepper-unit");
    numEl.textContent = isInf ? STEPPER_INFINITE_LABEL[key] : value;
    unitEl.style.display = isInf ? "none" : "";
    row.querySelector('[data-dir="-1"]').disabled = idx <= 0;
    row.querySelector('[data-dir="1"]').disabled = idx >= options.length - 1;
  }

  function wireSteppers() {
    app.querySelectorAll(".iq-stepper").forEach((row) => {
      const key = row.dataset.stepper;
      const options = key === "timeLimit" ? TIME_LIMIT_OPTIONS : PLAY_SECONDS_OPTIONS;
      row.querySelectorAll(".iq-stepper-btn").forEach((btn) => {
        btn.onclick = () => {
          const dir = parseInt(btn.dataset.dir, 10);
          if (key === "timeLimit") {
            timeLimit = stepOption(TIME_LIMIT_OPTIONS, timeLimit, dir);
            saveTimeLimit(timeLimit);
          } else {
            playSeconds = stepOption(PLAY_SECONDS_OPTIONS, playSeconds, dir);
            savePlaySeconds(playSeconds);
          }
          updateStepperUI(key, key === "timeLimit" ? timeLimit : playSeconds, options);
        };
      });
    });
  }

  function wireVolume() {
    const slider = app.querySelector("#iq-volume");
    const pct = app.querySelector("#iq-volume-pct");
    const warning = app.querySelector("#iq-volume-warning");
    if (!slider) return;
    slider.oninput = () => {
      const val = parseInt(slider.value, 10) || 0;
      saveVolume(val);
      applyVolume(val);
      slider.style.setProperty("--val", val + "%");
      if (pct) pct.textContent = val + "%";
      if (warning) warning.hidden = val !== 0;
    };
  }

  function modeListHTML() {
    return GAME_MODES.map((m) => modeCardHTML(m)).join("");
  }

  function modeCardHTML(m) {
    const selected = selectedMode === m.key;
    const disabled = !m.available;
    const cardCls = "iq-mode-card" + (selected ? " selected" : "") + (disabled ? " disabled" : "");
    const rightHTML = disabled
      ? `<span class="iq-soon-badge">近日公開</span>`
      : `<span class="iq-radio${selected ? " checked" : ""}" aria-hidden="true"></span>`;
    const panel = (m.key === "artist" && selected) ? artistPanelHTML() : "";
    return `
      <button type="button" class="${cardCls}" data-mode-card="${m.key}" ${disabled ? "disabled" : ""} aria-pressed="${selected}">
        <span class="iq-mode-card-icon">${m.icon}</span>
        <span class="iq-mode-card-body">
          <span class="iq-mode-card-label">${esc(m.label)}</span>
          <span class="iq-mode-card-desc">${esc(m.desc)}</span>
        </span>
        ${rightHTML}
      </button>
      ${panel}`;
  }

  function artistPanelHTML() {
    if (artistsState.status === "loading") {
      return `<div class="iq-artist-panel"><div class="iq-inline-loading"><span class="iq-spinner"></span>アーティストを取得しています…</div></div>`;
    }
    if (artistsState.status === "error") {
      return `<div class="iq-artist-panel"><div class="iq-inline-error"><span>取得に失敗しました。</span><button type="button" class="iq-inline-retry" data-artist-retry>再試行</button></div></div>`;
    }
    if (artistsState.status === "loaded" && !artistsState.list.length) {
      return `<div class="iq-artist-panel"><div class="iq-inline-empty">選べるアーティストがいません。</div></div>`;
    }
    if (!artistsState.list.length) return "";
    return `<div class="iq-artist-panel">
      ${artistsState.list.map((a) => `
        <button type="button" class="iq-artist-chip${selectedArtist === a.artist ? " selected" : ""}" data-artist-pick="${esc(a.artist)}">
          <span class="iq-artist-chip-name">${esc(a.artist)}</span>
          <span class="iq-artist-chip-count">${a.count}曲</span>
        </button>`).join("")}
    </div>`;
  }

  function refreshModeList() {
    const el = app.querySelector("#iq-mode-list");
    if (!el) return;
    el.innerHTML = modeListHTML();
    wireModeList();
    updateStartButtonState();
  }

  function wireModeList() {
    app.querySelectorAll("[data-mode-card]").forEach((btn) => {
      btn.onclick = () => {
        if (btn.disabled) return;
        const key = btn.dataset.modeCard;
        if (selectedMode === key) return;
        selectedMode = key;
        if (key === "artist" && artistsState.status === "idle") { loadArtists(); return; }
        refreshModeList();
      };
    });
    app.querySelectorAll("[data-artist-pick]").forEach((btn) => {
      btn.onclick = () => {
        selectedArtist = btn.dataset.artistPick;
        refreshModeList();
      };
    });
    const retryBtn = app.querySelector("[data-artist-retry]");
    if (retryBtn) retryBtn.onclick = () => loadArtists();
  }

  async function loadArtists() {
    artistsState = { status: "loading", list: [] };
    refreshModeList();
    let data;
    try {
      data = await postJSON("/api/intro-quiz", { action: "artists" });
    } catch (e) {
      if (myGen !== renderGeneration) return;
      artistsState = { status: "error", list: [] };
      refreshModeList();
      return;
    }
    if (myGen !== renderGeneration) return;
    artistsState = { status: "loaded", list: (data && data.artists) || [] };
    refreshModeList();
  }

  function updateStartButtonState() {
    const btn = app.querySelector("#iq-start-btn");
    if (!btn) return;
    const ready = selectedMode === "random" || (selectedMode === "artist" && !!selectedArtist);
    btn.disabled = !ready;
  }

  function wireStartButton() {
    updateStartButtonState();
    const btn = app.querySelector("#iq-start-btn");
    if (!btn) return;
    btn.onclick = async () => {
      if (btn.disabled) return;
      const params = selectedMode === "artist" ? { mode: "artist", artist: selectedArtist } : { mode: "random" };
      lastStartParams = params;
      activePlaySeconds = playSeconds;
      activeTimeLimit = timeLimit;
      btn.disabled = true;
      btn.textContent = speechSupported() ? "マイクを確認中…" : "準備中…";
      await prepareIntroMicrophone();
      if (myGen !== renderGeneration) return;
      renderCard(loadingCardHTML("出題を準備しています…"));
      startQuiz(myGen, params);
    };
  }
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
      <div class="iq-card">
        <div class="iq-headline">${ICON_EMPTY}<span>本日出題できる曲がありません</span></div>
        <div class="iq-msg">またの機会にお試しください。</div>
        <button type="button" class="ghost iq-retry-btn" id="iq-mode-back">モード選択に戻る</button>
      </div>`);
    const backBtn = app.querySelector("#iq-mode-back");
    if (backBtn) backBtn.onclick = () => renderSetupScreen(myGen);
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
    <div class="iq-card">
      <div class="iq-player-hidden"><div id="iq-yt-hidden"></div></div>
      <div id="iq-stage" class="iq-stage"><div class="iq-loading"><span class="iq-spinner"></span>読み込み中…</div></div>
      <div class="iq-giveup-link-wrap"><button type="button" class="iq-giveup-link" id="iq-giveup">諦めて正解を見る</button></div>
    </div>`);

  const giveupBtn = app.querySelector("#iq-giveup");
  const stage = () => app.querySelector("#iq-stage");

  // phase: loading（起動中）→ playing（再生中・「はい！」待ち）→
  //        answering（音楽停止・曲名の聞き取り中）→ busy（サーバー通信中）
  let phase = "loading";
  let buzzed = false;
  let finished = false;
  let listenGen = 0; // 音声認識セッションごとに発番。古いセッションのコールバックを無効化する
  let fallbackPlayTimer2 = null;
  let playClipTimer = null;   // 「再生秒数」設定に応じた自動一時停止
  let roundTimeoutTimer = null; // 「制限時間」設定に応じた自動タイムアップ
  let speechRestartTimer = null;
  let answerStartTimer = null;

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

  // 曲が用意でき次第、ユーザー操作なしで自動再生する
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
      <button type="button" class="iq-buzz-btn" id="iq-manual-play">${ICON_PLAY_SMALL}<span>再生する</span></button>`;
    const btn = el.querySelector("#iq-manual-play");
    if (btn) btn.onclick = () => { try { hiddenPlayer.playVideo(); } catch (e) {} };
  }

  // 曲の再生開始 → 「再生中…」表示にして「はい！」の検知を始める
  function enterPlayingPhase() {
    if (finished || phase === "answering" || phase === "busy") return;
    phase = "playing";
    buzzed = false;
    renderPlayingUI(false);
    startBuzzListening();
    scheduleGameplayTimers();
  }

  // ゲーム設定（再生秒数・制限時間）を再生開始のタイミングで仕込む。
  // どちらも「まだ再生中・まだ早押ししていない」場合にのみ発火するようガードする
  function scheduleGameplayTimers() {
    if (activePlaySeconds > 0) {
      playClipTimer = setTimeout(() => {
        if (myGen !== renderGeneration || phase !== "playing" || buzzed) return;
        if (hiddenPlayer) { try { hiddenPlayer.pauseVideo(); } catch (e) {} }
        renderPlayingUI(true);
      }, activePlaySeconds * 1000);
    }
    if (activeTimeLimit > 0) {
      roundTimeoutTimer = setTimeout(() => {
        if (myGen !== renderGeneration || phase !== "playing" || buzzed) return;
        doReveal();
      }, activeTimeLimit * 1000);
    }
  }

  function renderPlayingUI(paused) {
    const el = stage();
    if (!el) return;
    const bars = Array.from({ length: 22 }).map((_, i) => `<span style="animation-delay:${(i % 7) * 0.09}s"></span>`).join("");
    el.innerHTML = `
      <div class="iq-status iq-status--playing">
        ${paused ? ICON_PAUSE : ICON_SOUND}
        <span class="iq-status-text">${paused ? "再生終了" : "再生中…"}</span>
      </div>
      <div class="iq-live-waveform${paused ? " iq-live-waveform--idle" : ""}" aria-hidden="true">${bars}</div>
      <div class="iq-hint">曲がわかったら「はい！」と言ってね</div>
      <div class="iq-mic-status" id="iq-mic-status">${speechSupported() && introSpeechPermission !== "denied"
        ? "マイクで「はい！」を待っています"
        : "音声が使えません。下のボタンで早押しできます"}</div>
      <button type="button" class="iq-buzz-btn" id="iq-buzz-btn">${ICON_HAND}<span>はい！</span></button>`;
    const btn = el.querySelector("#iq-buzz-btn");
    if (btn) btn.onclick = () => triggerBuzz();
  }

  function updateMicStatus(message, isError) {
    const el = app.querySelector("#iq-mic-status");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("iq-mic-status--error", !!isError);
  }

  function startBuzzListening() {
    if (!speechSupported() || introSpeechPermission === "denied") return;
    if (speechRestartTimer) { clearTimeout(speechRestartTimer); speechRestartTimer = null; }
    const myListenGen = ++listenGen;
    const rec = createRecognition({ lang: "ja-JP", interim: true, continuous: true });
    if (!rec) return;
    activeSpeechRecognition = rec;
    let canRestart = true;
    rec.onstart = () => {
      if (myGen === renderGeneration && myListenGen === listenGen) {
        updateMicStatus("マイクで「はい！」を待っています", false);
      }
    };
    rec.onresult = (ev) => {
      if (myGen !== renderGeneration || myListenGen !== listenGen || buzzed) return;
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        // 1番目の候補が漢字変換されていて一致しなくても、他の候補（読みのまま）
        // で一致すれば拾う
        for (let j = 0; j < r.length; j++) {
          if (isBuzzWord(r[j].transcript)) { triggerBuzz(); return; }
        }
      }
    };
    rec.onerror = (ev) => {
      if (myGen !== renderGeneration || myListenGen !== listenGen) return;
      // マイク権限が無い等、続行不能なエラーだけ認識を諦める（無音などはonendで再開する）
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        canRestart = false;
        introSpeechPermission = "denied";
        updateMicStatus("マイクが許可されていません。下のボタンで早押しできます", true);
      } else if (ev.error === "audio-capture" || ev.error === "network") {
        canRestart = false;
        updateMicStatus("音声認識を開始できません。下のボタンをご利用ください", true);
      }
    };
    rec.onend = () => {
      if (myGen !== renderGeneration || myListenGen !== listenGen || buzzed) return;
      if (activeSpeechRecognition === rec) activeSpeechRecognition = null;
      if (!canRestart) return;
      // iPhone Safariは終了直後に同じRecognitionをstartすると失敗するため、
      // 少し待って新しいインスタンスで聞き直す。
      speechRestartTimer = setTimeout(() => {
        if (myGen === renderGeneration && phase === "playing" && !buzzed) startBuzzListening();
      }, 320);
    };
    try { rec.start(); } catch (e) {
      if (activeSpeechRecognition === rec) activeSpeechRecognition = null;
      updateMicStatus("音声認識を開始できません。下のボタンをご利用ください", true);
    }
  }

  // 「はい！」を検知（または手動ボタン）→ すぐに音楽を止めて回答受付状態へ
  function triggerBuzz() {
    if (buzzed || finished || phase !== "playing") return;
    buzzed = true;
    if (playClipTimer) { clearTimeout(playClipTimer); playClipTimer = null; }
    if (roundTimeoutTimer) { clearTimeout(roundTimeoutTimer); roundTimeoutTimer = null; }
    if (speechRestartTimer) { clearTimeout(speechRestartTimer); speechRestartTimer = null; }
    stopActiveSpeech();
    if (hiddenPlayer) { try { hiddenPlayer.pauseVideo(); } catch (e) {} }
    enterAnsweringPhase();
  }

  // 音楽停止後にのみ、曲名の音声認識を開始する
  function enterAnsweringPhase() {
    phase = "answering";
    const el = stage();
    if (el) el.innerHTML = `
      <div class="iq-feedback iq-feedback--good">「はい！」を認識しました</div>
      <div class="iq-hint">曲名を話す準備をしています…</div>`;
    // 早押し用Recognitionの終了を待ってから回答用を開始する。
    answerStartTimer = setTimeout(() => {
      answerStartTimer = null;
      if (myGen === renderGeneration && phase === "answering" && !finished) startAnswerListening();
    }, 360);
  }

  function renderAnsweringUI() {
    const el = stage();
    if (!el) return;
    el.innerHTML = `
      <div class="iq-mic-wrap">
        <div class="iq-mic-pulse"></div>
        <div class="iq-mic-pulse iq-mic-pulse--2"></div>
        <div class="iq-mic-core">${ICON_MIC}</div>
      </div>
      <div class="iq-status-text" style="text-align:center;margin-bottom:14px">曲名を話してください</div>
      <div class="iq-waveform" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
      <div class="iq-live-transcript" id="iq-live-transcript" aria-live="polite">ききとり中…</div>
      <button type="button" class="ghost iq-text-fallback-btn" id="iq-text-fallback">キーボードで入力する</button>`;
  }

  function updateLiveTranscript(text) {
    const el = app.querySelector("#iq-live-transcript");
    if (el) el.textContent = text || "";
  }

  function startAnswerListening() {
    phase = "answering";
    renderAnsweringUI();
    const textFallbackBtn = app.querySelector("#iq-text-fallback");
    if (textFallbackBtn) textFallbackBtn.onclick = () => renderTextFallbackForm();
    if (!speechSupported()) { renderTextFallbackForm("このブラウザは音声認識に対応していません。曲名を入力してください。"); return; }
    if (introSpeechPermission === "denied") { renderTextFallbackForm("マイクが許可されていません。曲名を入力してください。"); return; }
    const myListenGen = ++listenGen;
    const rec = createRecognition({ lang: "ja-JP", interim: true, continuous: false });
    if (!rec) { renderTextFallbackForm(); return; }
    activeSpeechRecognition = rec;
    let finalized = false;
    rec.onresult = (ev) => {
      if (myGen !== renderGeneration || myListenGen !== listenGen || finalized) return;
      const finalGroups = [];
      let interimResult = null;
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalGroups.push(collectTranscripts(r));
        else interimResult = r;
      }
      if (finalGroups.length) {
        const alternatives = [];
        for (let alternativeIndex = 0; alternativeIndex < 8; alternativeIndex++) {
          const phrase = finalGroups
            .map((group) => group[alternativeIndex] || group[0] || "")
            .join(" ").trim();
          if (phrase && !alternatives.includes(phrase)) alternatives.push(phrase);
        }
        const text = alternatives.find((value) => !KANJI_RE.test(value)) || alternatives[0] || "";
        updateLiveTranscript(text && !KANJI_RE.test(text) ? normalizeVoiceText(text) : "ことばを確認しています…");
        if (!text) return;
        finalized = true;
        try { rec.stop(); } catch (e) {}
        if (activeSpeechRecognition === rec) activeSpeechRecognition = null;
        submitAnswer(text, alternatives);
      } else if (interimResult) {
        updateLiveTranscript(transcriptForDisplay(interimResult));
      }
    };
    rec.onerror = (ev) => {
      if (myGen !== renderGeneration || myListenGen !== listenGen || finalized) return;
      if (ev.error === "no-speech" || ev.error === "aborted") return; // onendでまとめて処理する
      finalized = true;
      if (activeSpeechRecognition === rec) activeSpeechRecognition = null;
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        introSpeechPermission = "denied";
        renderTextFallbackForm("マイクが許可されていません。曲名を入力してください。");
      } else {
        renderAnswerRetry("音声をうまく聞き取れませんでした");
      }
    };
    rec.onend = () => {
      if (myGen !== renderGeneration || myListenGen !== listenGen || finalized) return;
      finalized = true;
      if (activeSpeechRecognition === rec) activeSpeechRecognition = null;
      renderAnswerRetry(); // 音声が認識できなかった場合
    };
    try { rec.start(); } catch (e) {
      if (activeSpeechRecognition === rec) activeSpeechRecognition = null;
      renderAnswerRetry("音声認識を開始できませんでした");
    }
  }

  function renderAnswerRetry(message) {
    if (phase !== "answering" || finished) return;
    const el = stage();
    if (!el) return;
    el.innerHTML = `
      <div class="iq-feedback">${esc(message || "もう一度お願いします")}</div>
      <button type="button" class="iq-buzz-btn" id="iq-retry-listen">${ICON_MIC}<span>もう一度話す</span></button>
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
        <div class="iq-suggest-q">あなたが答えようとしているのはこれですか？</div>
        <div class="iq-suggest-title">「${esc(suggestedTitle)}」${suggestedArtist ? ` <span class="iq-opt-artist">／ ${esc(suggestedArtist)}</span>` : ""}</div>
        <div class="iq-actions">
          <button type="button" class="cta" id="iq-suggest-yes">はい、これで正解にする</button>
          <button type="button" class="ghost" id="iq-suggest-no">いいえ、入力し直す</button>
        </div>
      </div>`;
    const yesBtn = el.querySelector("#iq-suggest-yes");
    const noBtn = el.querySelector("#iq-suggest-no");
    if (yesBtn) yesBtn.onclick = () => resolveSuggestion(true);
    if (noBtn) noBtn.onclick = () => resolveSuggestion(false);
  }

  // 不正解：もう一度回答する／正解を見る、のどちらかを選べるようにする
  function renderIncorrectChoice(message) {
    const el = stage();
    if (!el) return;
    el.innerHTML = `
      <div class="iq-feedback iq-feedback--bad">${esc(message)}</div>
      <div class="iq-actions">
        <button type="button" class="cta" id="iq-answer-again">もう一度回答する</button>
        <button type="button" class="ghost" id="iq-reveal-answer">正解を見る</button>
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

  async function submitAnswer(text, alternatives) {
    setBusy(true);
    let data;
    try {
      data = await postJSON("/api/intro-quiz", {
        action: "answer",
        sessionId,
        answerText: text,
        answerAlternatives: Array.isArray(alternatives) ? alternatives.slice(0, 8) : [],
      });
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
    if (playClipTimer) { clearTimeout(playClipTimer); playClipTimer = null; }
    if (roundTimeoutTimer) { clearTimeout(roundTimeoutTimer); roundTimeoutTimer = null; }
    if (speechRestartTimer) { clearTimeout(speechRestartTimer); speechRestartTimer = null; }
    if (answerStartTimer) { clearTimeout(answerStartTimer); answerStartTimer = null; }
    listenGen++;
    stopActiveSpeech();
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

  // 音声認識結果と正解を比較する（実際の判定はサーバー側 api/_lib/textMatch.js。
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
      if (el) el.innerHTML = `<div class="iq-feedback ${data.correct ? "iq-feedback--good" : "iq-feedback--bad"}">${data.correct ? "正解！" : "残念！"}</div>`;
      setTimeout(() => { if (myGen === renderGeneration) renderResultState(myGen, data, startParams); }, 500);
      return;
    }
    phase = "answering";
    setGiveupEnabled(true);
    if (data.status === "suggest") { renderSuggestConfirm(data.suggestedTitle, data.suggestedArtist); return; }
    if (data.status === "incorrect") { renderIncorrectChoice(`不正解…もう一度チャレンジしてみよう（残り${data.attemptsLeft}回）`); return; }
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
    <div class="iq-card">
      <div class="iq-verdict ${data.correct ? "pass" : "fail"}">${data.correct ? ICON_CHECK_CIRCLE : ICON_X_CIRCLE}<span>${data.correct ? "正解！" : "残念！"}</span></div>
      <img class="iq-jacket" src="https://i.ytimg.com/vi/${encodeURIComponent(data.videoId)}/hqdefault.jpg" alt="" aria-hidden="true" />
      <div class="iq-answer-line">正解は「${esc(data.title)}」${data.artist ? `／${esc(data.artist)}` : ""} でした</div>
      ${rewardHtml}
      <div class="iq-reveal-wrap" id="iq-reveal-wrap">
        <div id="iq-yt-reveal"></div>
        <button type="button" class="iq-fallback-play" id="iq-fallback-play" hidden>${ICON_PLAY_SMALL}<span>動画を再生する</span></button>
      </div>
      <div class="iq-actions">
        <button class="ghost" id="iq-retry">もう一度挑戦する</button>
        <button class="ghost" id="iq-change-mode">別のモードで遊ぶ</button>
        <button class="cta" id="iq-done">ホームに戻る</button>
      </div>
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
          fallbackBtn.innerHTML = `<span>動画を読み込めませんでした</span>`;
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
    renderCard(loadingCardHTML("出題を準備しています…"));
    startQuiz(myGen, startParams);
  };
  const changeModeBtn = app.querySelector("#iq-change-mode");
  if (changeModeBtn) changeModeBtn.onclick = () => {
    destroyPlayers();
    renderSetupScreen(myGen);
  };
}
