/* =========================================================================
   registrantsUI — 声紋登録機能の画面（設定 / 登録者一覧 / 新規登録 / 編集 /
   参加者選択）の描画だけを担当する。データの読み書きはVoiceprintManager・
   ParticipantManagerへ、録音はAudioRecorderへ、声紋抽出はSpeakerRecognition
   Serviceへそれぞれ委譲し、このモジュール自身はDOM組み立てとイベント配線
   だけを行う（音声認識ロジックとUIを密結合にしないための分離）。

   呼び出し側（js/introQuiz.js）が画面遷移（router）を持ち、各関数へは
   「今のカードを描き替える関数（renderCard）」と「戻る/次へ」のコールバックを
   ctx として渡す。ここではmyGen（画面世代）を保持しないため、非同期処理
   （録音・声紋抽出）の後にDOMを触ってよいかは呼び出し側から渡される
   ctx.isCurrent() で毎回確認する。
   ========================================================================= */
import { esc, fmt } from '../core.js';
import * as VoiceprintManager from './VoiceprintManager.js';
import * as ParticipantManager from './ParticipantManager.js';
import { AudioRecorder, isSupported as recorderSupported } from './AudioRecorder.js';
import { extractVoiceprint, isSupported as speakerIdSupported } from './SpeakerRecognitionService.js';

const MIN_RECORD_MS = 2000;
const MAX_RECORD_MS = 10000;

const AVATAR_COLORS = ["#0284c7", "#0ea5e9", "#7c3aed", "#db2777", "#16a34a", "#d97706"];

function avatarColor(seed) {
  let h = 0;
  for (const ch of String(seed || "")) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name) {
  const trimmed = (name || "").trim();
  return trimmed ? [...trimmed][0].toUpperCase() : "?";
}

function avatarHTML(registrant, size) {
  const px = size || 44;
  return `<span class="iq-vp-avatar" style="width:${px}px;height:${px}px;font-size:${Math.round(px * 0.42)}px;background:${avatarColor(registrant.id || registrant.name)}">${esc(initials(registrant.name))}</span>`;
}

// 録音中に画面をまたいで残らないよう、このモジュール内で今アクティブな録音を1つだけ追跡する
let activeRecorder = null;
export function cancelActiveRecording() {
  if (activeRecorder) { try { activeRecorder.cancel(); } catch (e) {} activeRecorder = null; }
}

// ------------------------------------------------------------------------
// 設定画面（登録者管理 / ゲーム設定 / 音声設定）
// ------------------------------------------------------------------------
export function renderSettingsScreen(ctx) {
  ctx.renderCard(`
    <div class="iq-headline">⚙️ 設定</div>
    <div class="iq-vp-menu">
      <button type="button" class="iq-vp-menu-row" id="iq-settings-registrants">
        <span class="iq-vp-menu-ico" aria-hidden="true">🎙️</span>
        <span class="iq-vp-menu-body">
          <span class="iq-vp-menu-label">登録者管理</span>
          <span class="iq-vp-menu-desc">声紋を登録・編集する</span>
        </span>
        <span class="iq-vp-menu-arrow" aria-hidden="true">›</span>
      </button>
      <button type="button" class="iq-vp-menu-row iq-vp-menu-row--soon" disabled>
        <span class="iq-vp-menu-ico" aria-hidden="true">🎮</span>
        <span class="iq-vp-menu-body">
          <span class="iq-vp-menu-label">ゲーム設定</span>
          <span class="iq-vp-menu-desc">準備中</span>
        </span>
      </button>
      <button type="button" class="iq-vp-menu-row iq-vp-menu-row--soon" disabled>
        <span class="iq-vp-menu-ico" aria-hidden="true">🔊</span>
        <span class="iq-vp-menu-body">
          <span class="iq-vp-menu-label">音声設定</span>
          <span class="iq-vp-menu-desc">準備中</span>
        </span>
      </button>
    </div>`, ctx.onBack);
  const btn = document.getElementById("iq-settings-registrants");
  if (btn) btn.onclick = () => ctx.onOpenRegistrants();
}

// ------------------------------------------------------------------------
// 登録者一覧
// ------------------------------------------------------------------------
export function renderRegistrantList(ctx) {
  const list = VoiceprintManager.list();
  const full = VoiceprintManager.isFull();

  const rowsHTML = list.length ? list.map((r, i) => `
    <div class="iq-vp-row" data-id="${esc(r.id)}">
      ${avatarHTML(r)}
      <div class="iq-vp-row-body">
        <div class="iq-vp-row-name">${i + 1}. ${esc(r.name)}</div>
        <div class="iq-vp-row-status">${r.voiceprint ? "✅ 登録済み" : "⚠️ 声紋未登録"}</div>
      </div>
      <div class="iq-vp-row-actions">
        <button type="button" class="iq-vp-mini-btn" data-edit="${esc(r.id)}">編集</button>
        <button type="button" class="iq-vp-mini-btn iq-vp-mini-btn--danger" data-del="${esc(r.id)}">削除</button>
      </div>
    </div>`).join("") : `<div class="iq-msg">まだ誰も登録されていません。</div>`;

  ctx.renderCard(`
    <div class="iq-headline">🎙️ 登録者一覧</div>
    <button type="button" class="cta iq-vp-add-btn" id="iq-vp-add" ${full ? "disabled" : ""}>＋ 新しく登録する</button>
    ${full ? `<div class="iq-hint">登録上限（${VoiceprintManager.MAX_REGISTRANTS}人）に達しています</div>` : ""}
    <div class="iq-vp-list">${rowsHTML}</div>`, ctx.onBack);

  const addBtn = document.getElementById("iq-vp-add");
  if (addBtn) addBtn.onclick = () => { if (!full) ctx.onAdd(); };
  document.querySelectorAll("[data-edit]").forEach((b) => {
    b.onclick = () => ctx.onEdit(b.dataset.edit);
  });
  document.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = () => {
      const target = VoiceprintManager.get(b.dataset.del);
      if (!target) return;
      if (!confirm(`「${target.name}」さんの登録を削除しますか？`)) return;
      VoiceprintManager.remove(b.dataset.del);
      renderRegistrantList(ctx); // 削除後の一覧を再描画
    };
  });
}

// ------------------------------------------------------------------------
// 新規登録 ① 名前入力
// ------------------------------------------------------------------------
export function renderRegisterStep1(ctx) {
  ctx.renderCard(`
    <div class="iq-headline">📝 名前を入力</div>
    <div class="iq-msg">ゲーム中に表示される名前を入力してください。</div>
    <form class="iq-answer-form" id="iq-vp-name-form" autocomplete="off">
      <input type="text" id="iq-vp-name-input" class="iq-answer-input" placeholder="名前" maxlength="20" autocomplete="off" />
      <button type="submit" class="cta">次へ</button>
    </form>`, ctx.onBack);
  const input = document.getElementById("iq-vp-name-input");
  const form = document.getElementById("iq-vp-name-form");
  if (input) input.focus();
  if (form) form.onsubmit = (ev) => {
    ev.preventDefault();
    const name = (input.value || "").trim();
    if (!name) return;
    ctx.onNext(name);
  };
}

// ------------------------------------------------------------------------
// 新規登録 ② 声紋登録（既存登録者の「声紋を録り直す」でも共用する）
// ctx: { renderCard, isCurrent, onBack, onSaved(voiceprint) }
// ------------------------------------------------------------------------
export function renderRegisterStep2(ctx, name) {
  cancelActiveRecording();

  function backAndCleanup() { cancelActiveRecording(); ctx.onBack(); }

  function renderIdle(message) {
    ctx.renderCard(`
      <div class="iq-headline">🎙️ 声紋登録</div>
      <div class="iq-vp-record-name">${esc(name)}</div>
      ${message ? `<div class="iq-feedback">${esc(message)}</div>` : ""}
      <div class="iq-vp-script">「はい！私は${esc(name)}です。」<br>と5〜10秒程度話してください。</div>
      <button type="button" class="cta iq-buzz-btn" id="iq-vp-record-start">🔴 録音開始</button>`, backAndCleanup);
    const btn = document.getElementById("iq-vp-record-start");
    if (btn) btn.onclick = () => startRecording();
  }

  function renderUnsupported() {
    ctx.renderCard(`
      <div class="iq-headline">⚠️ 録音に対応していません</div>
      <div class="iq-msg">このブラウザではマイク録音を利用できません。Chrome等の対応ブラウザでお試しください。</div>`, backAndCleanup);
  }

  function renderRecording() {
    const el = document.querySelector(".iq-card");
    if (!el) return;
    el.innerHTML = `
      <div class="iq-headline">🎙️ 声紋登録</div>
      <div class="iq-vp-record-name">${esc(name)}</div>
      <div class="iq-status iq-status--answering">
        <span class="iq-status-icon" aria-hidden="true">🔴</span>
        <span class="iq-status-text">録音中… <span id="iq-vp-timer">0</span>秒</span>
      </div>
      <div class="iq-mic-wrap">
        <div class="iq-mic-pulse"></div>
        <div class="iq-mic-pulse iq-mic-pulse--2"></div>
        <div class="iq-mic-core" aria-hidden="true">🎤</div>
      </div>
      <button type="button" class="cta iq-buzz-btn" id="iq-vp-record-stop">■ 録音終了</button>`;
    const stopBtn = document.getElementById("iq-vp-record-stop");
    if (stopBtn) stopBtn.onclick = () => stopRecording();
  }

  function renderProcessing() {
    ctx.renderCard(`
      <div class="iq-headline">🎙️ 声紋登録</div>
      <div class="iq-loading"><span class="iq-spinner"></span>声紋データを処理しています…</div>`);
  }

  function renderDone() {
    ctx.renderCard(`
      <div class="iq-headline">✅ 登録完了</div>
      <div class="iq-msg">${esc(name)}さんの声紋を登録しました。</div>`);
  }

  let startedAt = 0, timerInterval = null, autoStopTimer = null;

  async function startRecording() {
    if (!recorderSupported()) { renderUnsupported(); return; }
    const recorder = new AudioRecorder();
    try {
      await recorder.start();
    } catch (e) {
      renderIdle("マイクを使用できませんでした。権限設定をご確認の上、もう一度お試しください。");
      return;
    }
    if (!ctx.isCurrent()) { recorder.cancel(); return; }
    activeRecorder = recorder;
    startedAt = Date.now();
    renderRecording();
    timerInterval = setInterval(() => {
      const el = document.getElementById("iq-vp-timer");
      if (el) el.textContent = String(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
    autoStopTimer = setTimeout(() => stopRecording(), MAX_RECORD_MS);
  }

  async function stopRecording() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    if (autoStopTimer) { clearTimeout(autoStopTimer); autoStopTimer = null; }
    const recorder = activeRecorder;
    activeRecorder = null;
    if (!recorder) return;
    const elapsed = Date.now() - startedAt;
    const blob = await recorder.stop();
    if (!ctx.isCurrent()) return;
    if (!blob || elapsed < MIN_RECORD_MS) {
      renderIdle("録音が短すぎます。もう少し長く話してください。");
      return;
    }
    renderProcessing();
    let voiceprint;
    try {
      voiceprint = await extractVoiceprint(blob);
    } catch (e) {
      if (!ctx.isCurrent()) return;
      renderIdle("声紋データの作成に失敗しました。もう一度お試しください。");
      return;
    }
    if (!ctx.isCurrent()) return;
    renderDone();
    setTimeout(() => { if (ctx.isCurrent()) ctx.onSaved(voiceprint); }, 900);
  }

  if (!speakerIdSupported() || !recorderSupported()) { renderUnsupported(); return; }
  renderIdle();
}

// ------------------------------------------------------------------------
// 編集（名前変更・声紋の録り直し）
// ------------------------------------------------------------------------
export function renderEditRegistrant(ctx, id) {
  const registrant = VoiceprintManager.get(id);
  if (!registrant) { ctx.onBack(); return; }

  ctx.renderCard(`
    <div class="iq-headline">✏️ 登録内容の編集</div>
    <div class="iq-vp-edit-avatar-wrap">${avatarHTML(registrant, 64)}</div>
    <form class="iq-answer-form" id="iq-vp-edit-name-form" autocomplete="off">
      <input type="text" id="iq-vp-edit-name-input" class="iq-answer-input" value="${esc(registrant.name)}" maxlength="20" autocomplete="off" />
      <button type="submit" class="cta">名前を保存</button>
    </form>
    <div class="iq-hint">登録日時：${esc(fmt(registrant.createdAt))}</div>
    <button type="button" class="ghost" id="iq-vp-rerecord">🎙️ 声紋を録り直す</button>`, ctx.onBack);

  const form = document.getElementById("iq-vp-edit-name-form");
  const input = document.getElementById("iq-vp-edit-name-input");
  if (form) form.onsubmit = (ev) => {
    ev.preventDefault();
    const name = (input.value || "").trim();
    if (!name) return;
    VoiceprintManager.updateName(id, name);
    ctx.onNameSaved();
  };
  const rerecordBtn = document.getElementById("iq-vp-rerecord");
  if (rerecordBtn) rerecordBtn.onclick = () => ctx.onRerecord(registrant.name);
}

// ------------------------------------------------------------------------
// ゲーム開始前：参加者選択（「何人で遊ぶか」の代わりに「誰が遊ぶか」を選ぶ）
// ------------------------------------------------------------------------
export function renderParticipantSelect(ctx) {
  const list = VoiceprintManager.list();
  const selected = new Set(ParticipantManager.getSelectedIds());

  if (!list.length) {
    ctx.renderCard(`
      <div class="iq-headline">🙋 参加者を選ぶ</div>
      <div class="iq-msg">まだ登録者がいません。先に「登録者管理」から声紋を登録してください。</div>
      <button type="button" class="cta" id="iq-vp-goto-settings">🎙️ 登録者管理を開く</button>
      <button type="button" class="ghost" id="iq-vp-skip">登録せずに始める</button>`, ctx.onBack);
    const gotoBtn = document.getElementById("iq-vp-goto-settings");
    const skipBtn = document.getElementById("iq-vp-skip");
    if (gotoBtn) gotoBtn.onclick = () => ctx.onOpenRegistrants();
    if (skipBtn) skipBtn.onclick = () => ctx.onStart([]);
    return;
  }

  function renderList() {
    const rowsHTML = list.map((r) => `
      <label class="iq-vp-check-row" data-id="${esc(r.id)}">
        <input type="checkbox" class="iq-vp-checkbox" data-check="${esc(r.id)}" ${selected.has(r.id) ? "checked" : ""} />
        ${avatarHTML(r, 40)}
        <span class="iq-vp-check-name">${esc(r.name)}</span>
      </label>`).join("");

    ctx.renderCard(`
      <div class="iq-headline">🙋 参加者を選ぶ</div>
      <div class="iq-msg">今回参加する人にチェックを付けてください。</div>
      <div class="iq-vp-check-list">${rowsHTML}</div>
      <div class="iq-hint" id="iq-vp-count">${selected.size}人が参加します</div>
      <button type="button" class="cta" id="iq-vp-start">ゲーム開始</button>`, ctx.onBack);

    document.querySelectorAll("[data-check]").forEach((cb) => {
      cb.onchange = () => {
        ParticipantManager.toggle(cb.dataset.check);
        if (cb.checked) selected.add(cb.dataset.check); else selected.delete(cb.dataset.check);
        const countEl = document.getElementById("iq-vp-count");
        if (countEl) countEl.textContent = `${selected.size}人が参加します`;
      };
    });
    const startBtn = document.getElementById("iq-vp-start");
    if (startBtn) startBtn.onclick = () => ctx.onStart([...selected]);
  }

  renderList();
}
