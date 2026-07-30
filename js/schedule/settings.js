/* =========================================================================
   カレンダー同期の設定モーダルと、初回の同期確認ダイアログ。

   ・Google同期のON/OFF
   ・同期対象カレンダーの選択（Googleカレンダー側の一覧から複数選択）
   ・同期方向（双方向／Google→アプリ／アプリ→Google）
   ・競合時の方針（最新更新日時を優先／その都度ユーザーに選ばせる）
   ・新規予定の書き込み先カレンダー、日表示の開始時刻、既定の通知
   ========================================================================= */
import { REMINDER_PRESETS, reminderLabel } from './reminders.js';
import { closeModalOverlay, createModalOverlay } from './modal.js';
import { googleCalendars, isGoogleConnected, resetSync, syncNow } from './gsync.js';
import { loadSettings, loadSyncState, saveSettings } from './store.js';
import { esc } from './util.js';

const DIRECTION_OPTIONS = [
  { key: "both", label: "双方向", sub: "アプリとGoogleの変更をお互いに反映します" },
  { key: "pull", label: "Google → アプリ", sub: "Googleの予定を取り込むだけ（アプリの変更は送りません）" },
  { key: "push", label: "アプリ → Google", sub: "アプリの予定を送るだけ（Googleの変更は取り込みません）" },
];

const CONFLICT_OPTIONS = [
  { key: "newest", label: "最新更新日時を優先", sub: "後から編集された方を自動で採用します" },
  { key: "ask", label: "そのつど選ぶ", sub: "競合した予定に印を付け、どちらを残すか選べるようにします" },
];

export function openSyncSettings(onChanged){
  // 開いている間は背景のカレンダーを操作できないようにする（js/schedule/modal.js）
  const ov = createModalOverlay({ label: "カレンダー同期の設定", onBackdrop: () => close() });
  const close = () => closeModalOverlay(ov);

  let busyMessage = "";

  const draw = () => {
    const s = loadSettings();
    const connected = isGoogleConnected();
    const cals = googleCalendars();
    const syncState = loadSyncState();
    const picked = s.syncCalendars || {};

    ov.innerHTML = `
      <div class="modal sched-editor">
        <div class="modal-title sched-editor-title">カレンダー同期の設定</div>
        ${busyMessage ? `<div class="sched-note">${esc(busyMessage)}</div>` : ""}
        ${connected ? "" : `<div class="sched-note">Googleカレンダーと連携すると、この設定が使えるようになります。カレンダー画面の「Googleカレンダーと連携」から連携してください。</div>`}

        <button type="button" class="sched-toggle-row" id="sched-sync-toggle"${connected ? "" : " disabled"}>
          <span class="sched-toggle-info">
            <span class="sched-label">Googleカレンダー同期</span>
            <span class="sched-hint">${s.syncEnabled ? "ONです。起動時・予定の追加／編集／削除時に自動で同期します。" : "OFFです。予定はこのアプリの中だけで管理されます。"}</span>
          </span>
          <span class="sched-switch${s.syncEnabled ? " on" : ""}"><span class="sched-switch-knob"></span></span>
        </button>

        <div class="sched-field">
          <span class="sched-label">同期方向</span>
          ${DIRECTION_OPTIONS.map(o => `
            <button type="button" class="sched-option${s.syncDirection === o.key ? " active" : ""}" data-dir="${o.key}">
              <span class="sched-option-main"><span class="sched-option-title">${esc(o.label)}</span><span class="sched-option-sub">${esc(o.sub)}</span></span>
              ${s.syncDirection === o.key ? `<span class="sched-check">✓</span>` : ""}
            </button>`).join("")}
        </div>

        <div class="sched-field">
          <span class="sched-label">同期対象のカレンダー</span>
          ${cals.length ? cals.map(c => {
            const on = picked[c.id] != null ? !!picked[c.id] : !!c.primary;
            return `
              <button type="button" class="sched-option${on ? " active" : ""}" data-cal="${esc(c.id)}">
                <span class="sched-option-main">
                  <span class="sched-option-title"><span class="sched-caldot" style="background:${esc(c.color || "#94a3b8")}"></span>${esc(c.name)}</span>
                  <span class="sched-option-sub">${c.primary ? "メインカレンダー" : esc(c.accessRole || "")}</span>
                </span>
                <span class="sched-switch${on ? " on" : ""}"><span class="sched-switch-knob"></span></span>
              </button>`;
          }).join("") : `<div class="sched-hint">連携後にカレンダー一覧が表示されます。</div>`}
        </div>

        ${cals.length ? `
        <div class="sched-field">
          <span class="sched-label">新しい予定の保存先</span>
          <select class="sched-input sched-select" id="sched-writecal">
            ${cals.map(c => `<option value="${esc(c.id)}"${s.writeCalendarId === c.id ? " selected" : ""}>${esc(c.name)}</option>`).join("")}
          </select>
        </div>` : ""}

        <div class="sched-field">
          <span class="sched-label">同じ予定が両方で変更されたとき</span>
          ${CONFLICT_OPTIONS.map(o => `
            <button type="button" class="sched-option${s.conflictPolicy === o.key ? " active" : ""}" data-conflict="${o.key}">
              <span class="sched-option-main"><span class="sched-option-title">${esc(o.label)}</span><span class="sched-option-sub">${esc(o.sub)}</span></span>
              ${s.conflictPolicy === o.key ? `<span class="sched-check">✓</span>` : ""}
            </button>`).join("")}
        </div>

        <div class="sched-field">
          <span class="sched-label">新しい予定に自動で付ける通知</span>
          <div class="sched-chip-row">
            ${(s.defaultReminders || []).length
              ? (s.defaultReminders || []).map((r, i) => `<button type="button" class="sched-chip on" data-defrm-del="${i}">${esc(reminderLabel(r))} ×</button>`).join("")
              : `<span class="sched-hint">なし</span>`}
          </div>
          <div class="sched-chip-row sched-chip-row-add">
            ${REMINDER_PRESETS.map((p, i) => `<button type="button" class="sched-chip" data-defrm-add="${i}">＋${esc(p.label)}</button>`).join("")}
          </div>
        </div>

        <div class="sched-field">
          <span class="sched-label">日表示を開いたときの時間</span>
          <select class="sched-input sched-select" id="sched-dayhour">
            ${Array.from({ length: 24 }, (_, h) => `<option value="${h}"${s.dayStartHour === h ? " selected" : ""}>${String(h).padStart(2, "0")}:00</option>`).join("")}
          </select>
        </div>

        <div class="sched-hint sched-syncinfo">
          ${syncState.lastSyncAt ? `最終同期：${esc(new Date(syncState.lastSyncAt).toLocaleString("ja-JP"))}` : "まだ同期していません。"}
          ${syncState.lastError ? `<br><span class="sched-error-text">前回のエラー：${esc(syncState.lastError)}</span>` : ""}
        </div>

        <button class="cta" id="sched-sync-now"${connected && loadSettings().syncEnabled ? "" : " disabled"}>今すぐ同期する</button>
        <button class="ghost" id="sched-sync-reset">同期をやり直す（全件を取り直す）</button>
        <button class="ghost" id="sched-settings-close">閉じる</button>
      </div>`;

    bind();
  };

  const notify = () => { if(onChanged) onChanged(); };

  const bind = () => {
    const q = (sel) => ov.querySelector(sel);

    q("#sched-sync-toggle").onclick = () => {
      if(!isGoogleConnected()) return;
      const next = !loadSettings().syncEnabled;
      saveSettings({ syncEnabled: next, syncPromptShown: true });
      if(next) syncNow({ quiet: true }).then(() => { draw(); notify(); });
      draw(); notify();
    };

    ov.querySelectorAll("[data-dir]").forEach(b => b.onclick = () => {
      saveSettings({ syncDirection: b.dataset.dir });
      resetSync();
      draw(); notify();
    });

    ov.querySelectorAll("[data-cal]").forEach(b => b.onclick = () => {
      const s = loadSettings();
      const cals = googleCalendars();
      const map = { ...(s.syncCalendars || {}) };
      const id = b.dataset.cal;
      const cal = cals.find(c => c.id === id);
      const current = map[id] != null ? !!map[id] : !!(cal && cal.primary);
      map[id] = !current;
      saveSettings({ syncCalendars: map });
      resetSync();
      draw(); notify();
    });

    ov.querySelectorAll("[data-conflict]").forEach(b => b.onclick = () => {
      saveSettings({ conflictPolicy: b.dataset.conflict });
      draw(); notify();
    });

    ov.querySelectorAll("[data-defrm-del]").forEach(b => b.onclick = () => {
      const s = loadSettings();
      const list = (s.defaultReminders || []).slice();
      list.splice(Number(b.dataset.defrmDel), 1);
      saveSettings({ defaultReminders: list });
      draw();
    });
    ov.querySelectorAll("[data-defrm-add]").forEach(b => b.onclick = () => {
      const p = REMINDER_PRESETS[Number(b.dataset.defrmAdd)];
      const s = loadSettings();
      const list = (s.defaultReminders || []).slice();
      const next = { unit: p.unit, value: p.value };
      if(p.atTime) next.atTime = p.atTime;
      if(!list.some(r => r.unit === next.unit && r.value === next.value && (r.atTime || "") === (next.atTime || ""))) list.push(next);
      saveSettings({ defaultReminders: list });
      draw();
    });

    const writeCal = q("#sched-writecal");
    if(writeCal) writeCal.onchange = (e) => { saveSettings({ writeCalendarId: e.target.value }); };
    const dayHour = q("#sched-dayhour");
    if(dayHour) dayHour.onchange = (e) => { saveSettings({ dayStartHour: Number(e.target.value) }); notify(); };

    q("#sched-sync-now").onclick = async () => {
      busyMessage = "同期しています…";
      draw();
      const result = await syncNow();
      busyMessage = result.error ? `同期に失敗しました：${result.error}`
        : result.skipped ? "同期はスキップされました（同期OFF／オフライン）。"
        : `同期しました（取り込み${result.pulled}件・送信${result.pushed}件）。`;
      draw();
      notify();
    };

    q("#sched-sync-reset").onclick = async () => {
      resetSync();
      busyMessage = "次回の同期で全件を取り直します。";
      draw();
      if(loadSettings().syncEnabled){
        await syncNow();
        busyMessage = "全件を取り直しました。";
        draw();
        notify();
      }
    };

    q("#sched-settings-close").onclick = close;
  };

  draw();
}

/* ---- 初回だけ出す「Googleカレンダーと同期しますか？」 ----
   Google連携済み（＝アカウントのログインが済んでいる）ときに、
   カレンダー機能を最初に開いたタイミングで一度だけ表示する */
// カレンダー画面は同期の完了などで何度も描き直されるため、開いている間に
// ダイアログが二重に積み上がらないようフラグで抑える
let firstRunPromptOpen = false;

export function maybeShowFirstRunPrompt(onChanged){
  const s = loadSettings();
  if(firstRunPromptOpen || s.syncPromptShown || !isGoogleConnected()) return false;
  firstRunPromptOpen = true;

  const ov = createModalOverlay({ label: "Googleカレンダーと同期しますか？" });
  ov.innerHTML = `
    <div class="modal sched-editor">
      <div class="modal-title sched-editor-title">Googleカレンダーと同期しますか？</div>
      <div class="sched-note">
        ログイン中のGoogleアカウントのカレンダーと、このアプリの予定を同期できます。<br>
        ONにすると、Googleカレンダーの予定がこのアプリに表示され、このアプリで登録した予定もGoogleカレンダーへ反映されます。<br>
        あとから「カレンダー画面の設定」でいつでも変更できます。
      </div>
      <button class="cta" id="sched-prompt-yes">同期する（おすすめ）</button>
      <button class="ghost" id="sched-prompt-no">今はしない</button>
    </div>`;
  const close = () => { firstRunPromptOpen = false; closeModalOverlay(ov); };

  ov.querySelector("#sched-prompt-yes").onclick = async () => {
    saveSettings({ syncEnabled: true, syncPromptShown: true });
    close();
    if(onChanged) onChanged();
    await syncNow({ quiet: true });
    if(onChanged) onChanged();
  };
  ov.querySelector("#sched-prompt-no").onclick = () => {
    saveSettings({ syncEnabled: false, syncPromptShown: true });
    close();
    if(onChanged) onChanged();
  };
  return true;
}
