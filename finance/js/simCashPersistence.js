// simCashPersistence.js — 投資シミュレーションの初期証券口座現金を明示保存するUI補助
//
// app.js の既存画面へ「保存して反映」ボタンを追加し、保存した値を localStorage 上の
// futureSim.simPlan に保持する。証券口座そのものを編集しても、ユーザーがこの画面で
// 明示保存した初期値は上書きされない。

import * as S from './store.js?v=20260725b';

const FIELD_LABEL = '初期証券口座現金（円）';
const MANUAL_VALUE_KEY = 'initialSecCashManual';
let restoring = false;

function parseYen(value) {
  return Number(String(value ?? '').replace(/[^\d]/g, '')) || 0;
}

function hasManualValue(plan) {
  return !!plan && Object.prototype.hasOwnProperty.call(plan, MANUAL_VALUE_KEY);
}

// 口座編集側で初期値が自動同期された場合でも、明示保存済みの値を優先する。
function restoreManualValue(state) {
  const plan = state?.futureSim?.simPlan;
  if (!hasManualValue(plan) || restoring) return;

  const manual = Number(plan[MANUAL_VALUE_KEY]) || 0;
  if ((Number(plan.initialSecCash) || 0) === manual) return;

  restoring = true;
  S.update((s) => {
    s.futureSim.simPlan.initialSecCash = manual;
  }, { silent: true });
  restoring = false;
}

function showSavedToast(value) {
  const toast = document.createElement('div');
  toast.className = 'fc-toast';

  const icon = document.createElement('span');
  icon.className = 'fc-toast-ic';
  icon.textContent = '✓';

  const text = document.createElement('span');
  text.textContent = `${value.toLocaleString('ja-JP')}円を保存し、シミュレーションへ反映しました`;

  toast.append(icon, text);
  document.body.append(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2600);
}

function saveInitialCash(input) {
  const value = parseYen(input.value);

  // 先に「明示保存値」を保持する。続けて既存の change ハンドラを呼び、
  // app.js 側の再計算・再描画も同じ値で実行させる。
  S.update((s) => {
    const plan = s.futureSim.simPlan;
    plan.initialSecCash = value;
    plan[MANUAL_VALUE_KEY] = value;
    plan.initialSecCashSavedAt = new Date().toISOString();
  }, { silent: true });

  input.value = value.toLocaleString('ja-JP');
  input.dispatchEvent(new Event('change', { bubbles: true }));
  showSavedToast(value);
}

function enhanceInitialCashField() {
  const fields = document.querySelectorAll('.fc-field');
  for (const field of fields) {
    const label = field.querySelector('.fc-field-lab');
    if (label?.textContent?.trim() !== FIELD_LABEL) continue;
    if (field.dataset.simCashSaveReady === '1') return;

    const input = field.querySelector('input');
    if (!input) return;
    field.dataset.simCashSaveReady = '1';

    const action = document.createElement('div');
    action.style.margin = '-6px 0 18px';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fc-btn primary block';
    button.textContent = '初期証券口座現金を保存して反映';

    const hint = document.createElement('p');
    hint.className = 'fc-field-hint';
    hint.style.marginTop = '8px';
    hint.textContent = '入力後にこのボタンを押すと、次回起動後も保存した金額をシミュレーションの開始現金として使用します。';

    let saving = false;
    const save = () => {
      if (saving) return;
      saving = true;
      saveInitialCash(input);
      setTimeout(() => { saving = false; }, 0);
    };

    // iPhoneではボタンをタップした際、先に入力欄の change が発生して画面が
    // 再描画されると click が失われることがある。pointerdown で先に保存する。
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      save();
    });
    // キーボード操作では pointerdown が発生しないため click でも保存する。
    button.addEventListener('click', save);
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      save();
    });

    action.append(button, hint);
    field.after(action);
    return;
  }
}

export function initSimCashPersistence() {
  restoreManualValue(S.getState());
  S.subscribe(restoreManualValue);

  const observer = new MutationObserver(enhanceInitialCashField);
  observer.observe(document.body, { childList: true, subtree: true });
  enhanceInitialCashField();
}
