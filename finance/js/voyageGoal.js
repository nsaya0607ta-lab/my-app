// Midnight Voyage: 「目的地」「航路達成率」「未来航路」を追加する。
// 既存の資産計算結果は変更せず、画面に描画済みの現在資産・将来予測を使って表示する。

const GOAL_KEY = 'finance_voyage_goal_v1';
let scheduled = false;
let lockedScrollY = 0;

const yen = (value) => `¥${Math.round(Number(value) || 0).toLocaleString('ja-JP')}`;

function parseFirstYen(text) {
  const match = String(text || '').match(/¥\s*([\d,]+)/);
  return match ? Number(match[1].replace(/,/g, '')) : null;
}

function readGoal() {
  try {
    const raw = localStorage.getItem(GOAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const amount = Math.round(Number(parsed.amount));
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return {
      name: String(parsed.name || '資産目標').trim() || '資産目標',
      amount,
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.date || '')) ? parsed.date : '',
    };
  } catch {
    return null;
  }
}

function saveGoal(goal) {
  localStorage.setItem(GOAL_KEY, JSON.stringify(goal));
}

function formatGoalDate(iso) {
  if (!iso) return '目標日は未設定';
  try {
    const date = new Date(`${iso}T00:00:00`);
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric', month: 'long', day: 'numeric',
    }).format(date);
  } catch {
    return iso;
  }
}

function lockPage() {
  lockedScrollY = window.scrollY || 0;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${lockedScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
  document.documentElement.classList.add('voyage-goal-open');
}

function unlockPage() {
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  document.documentElement.classList.remove('voyage-goal-open');
  window.scrollTo(0, lockedScrollY);
}

function refreshDecorations() {
  document.querySelectorAll('.voyage-destination-card, .voyage-forecast-route').forEach((node) => node.remove());
  scheduleDecorate();
}

function openGoalSheet() {
  if (document.querySelector('.voyage-goal-back')) return;
  const goal = readGoal();

  const back = document.createElement('div');
  back.className = 'voyage-goal-back';

  const sheet = document.createElement('section');
  sheet.className = 'voyage-goal-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', 'voyage-goal-title');

  sheet.innerHTML = `
    <div class="voyage-goal-grip" aria-hidden="true"></div>
    <div class="voyage-goal-head">
      <div>
        <span class="voyage-goal-kicker">DESTINATION</span>
        <h2 id="voyage-goal-title">目的地を設定</h2>
      </div>
      <button class="voyage-goal-close" type="button" aria-label="閉じる">×</button>
    </div>
    <p class="voyage-goal-intro">目標資産を登録すると、現在地から目的地までの進捗と将来予測を航路として表示します。</p>
    <label class="voyage-goal-field">
      <span>目的地の名前</span>
      <input class="voyage-goal-name" type="text" maxlength="30" placeholder="例）資産300万円" value="${escapeHtml(goal?.name || '')}">
    </label>
    <label class="voyage-goal-field">
      <span>目標資産額</span>
      <div class="voyage-goal-money-wrap"><span>¥</span><input class="voyage-goal-amount" type="text" inputmode="numeric" autocomplete="off" placeholder="3,000,000" value="${goal ? goal.amount.toLocaleString('ja-JP') : ''}"></div>
    </label>
    <label class="voyage-goal-field">
      <span>目標日（任意）</span>
      <div class="voyage-goal-date-wrap"><input class="voyage-goal-date" type="date" value="${goal?.date || ''}"></div>
    </label>
    <p class="voyage-goal-error" aria-live="polite"></p>
    <div class="voyage-goal-actions">
      ${goal ? '<button class="voyage-goal-delete" type="button">目的地を解除</button>' : '<span></span>'}
      <button class="voyage-goal-save" type="button">目的地を保存</button>
    </div>
  `;

  const close = () => {
    back.classList.remove('show');
    setTimeout(() => { back.remove(); unlockPage(); }, 220);
  };

  back.append(sheet);
  document.body.append(back);
  lockPage();
  requestAnimationFrame(() => back.classList.add('show'));

  const amountInput = sheet.querySelector('.voyage-goal-amount');
  const error = sheet.querySelector('.voyage-goal-error');

  amountInput.addEventListener('input', () => {
    const digits = amountInput.value.replace(/[^\d]/g, '');
    amountInput.value = digits ? Number(digits).toLocaleString('ja-JP') : '';
    error.textContent = '';
  });

  sheet.querySelector('.voyage-goal-close').addEventListener('click', close);
  back.addEventListener('click', (event) => { if (event.target === back) close(); });

  sheet.querySelector('.voyage-goal-save').addEventListener('click', () => {
    const amount = Number(amountInput.value.replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) {
      error.textContent = '目標資産額を入力してください。';
      amountInput.focus();
      return;
    }
    saveGoal({
      name: sheet.querySelector('.voyage-goal-name').value.trim() || '資産目標',
      amount: Math.round(amount),
      date: sheet.querySelector('.voyage-goal-date').value || '',
    });
    close();
    setTimeout(refreshDecorations, 240);
  });

  sheet.querySelector('.voyage-goal-delete')?.addEventListener('click', () => {
    localStorage.removeItem(GOAL_KEY);
    close();
    setTimeout(refreshDecorations, 240);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function openSimulation() {
  const navButton = document.querySelector('.fc-nav-btn[data-route="simulate"]');
  if (navButton) return navButton.click();
  const futureButton = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === '将来');
  if (futureButton) return futureButton.click();
  document.querySelector('.fc-hero')?.click();
}

function routeMarkup({ currentPct, forecastPct = null, goalSet = true }) {
  const safeCurrent = Math.max(0, Math.min(100, currentPct || 0));
  const safeForecast = forecastPct == null ? null : Math.max(0, Math.min(100, forecastPct));
  return `
    <div class="voyage-route-map ${goalSet ? '' : 'unset'}" aria-hidden="true">
      <div class="voyage-route-line">
        <span class="voyage-route-complete" style="width:${safeCurrent}%"></span>
        ${safeForecast != null ? `<span class="voyage-route-forecast" style="left:${Math.min(safeCurrent, safeForecast)}%;width:${Math.max(0, safeForecast - safeCurrent)}%"></span>` : ''}
      </div>
      <span class="voyage-route-point current" style="left:${safeCurrent}%"></span>
      ${safeForecast != null ? `<span class="voyage-route-point forecast" style="left:${safeForecast}%"></span>` : ''}
      <span class="voyage-route-point destination"></span>
      <div class="voyage-route-labels"><span>現在地</span>${safeForecast != null ? '<span>予測地点</span>' : '<span></span>'}<span>目的地</span></div>
    </div>
  `;
}

function decorateDashboard() {
  const hero = document.querySelector('.fc-hero');
  if (!hero || document.querySelector('.voyage-destination-card')) return;

  const amountNode = hero.querySelector('.fc-hero-amount');
  const current = parseFirstYen(amountNode?.textContent);
  const goal = readGoal();
  const card = document.createElement('section');
  card.className = 'voyage-destination-card';

  if (!goal) {
    card.innerHTML = `
      <div class="voyage-destination-head">
        <div><span class="voyage-destination-kicker">DESTINATION</span><h2>目的地</h2></div>
        <button class="voyage-destination-edit" type="button">設定</button>
      </div>
      <div class="voyage-destination-empty">
        <span class="voyage-destination-symbol" aria-hidden="true"></span>
        <div><b>目標資産を設定</b><p>目的地を登録すると、目標までの航路達成率を確認できます。</p></div>
      </div>
      ${routeMarkup({ currentPct: 0, goalSet: false })}
      <button class="voyage-route-cta" type="button">目的地を設定する</button>
    `;
    card.querySelectorAll('button').forEach((button) => button.addEventListener('click', openGoalSheet));
  } else {
    const progress = current == null ? 0 : (current / goal.amount) * 100;
    const displayProgress = Math.max(0, Math.min(100, progress));
    const remaining = current == null ? null : Math.max(0, goal.amount - current);
    const reached = current != null && current >= goal.amount;

    card.innerHTML = `
      <div class="voyage-destination-head">
        <div><span class="voyage-destination-kicker">DESTINATION</span><h2>目的地</h2></div>
        <button class="voyage-destination-edit" type="button">編集</button>
      </div>
      <div class="voyage-destination-summary">
        <div class="voyage-destination-main"><span>${escapeHtml(goal.name)}</span><b>${yen(goal.amount)}</b><small>${formatGoalDate(goal.date)}</small></div>
        <div class="voyage-progress-ring" style="--voyage-progress:${displayProgress * 3.6}deg"><div><b>${current == null ? '—' : `${displayProgress.toFixed(1)}%`}</b><span>航路達成率</span></div></div>
      </div>
      ${routeMarkup({ currentPct: displayProgress })}
      <div class="voyage-destination-foot">
        <div><span>${reached ? '到達状況' : '目的地まで'}</span><b>${current == null ? 'シークレットモード中' : reached ? '目的地に到達' : yen(remaining)}</b></div>
        <button class="voyage-route-cta compact" type="button">未来航路を見る</button>
      </div>
    `;
    card.querySelector('.voyage-destination-edit').addEventListener('click', openGoalSheet);
    card.querySelector('.voyage-route-cta').addEventListener('click', openSimulation);
  }

  hero.insertAdjacentElement('afterend', card);
}

function decorateSimulation() {
  const simHero = document.querySelector('.fc-simhero');
  if (!simHero || document.querySelector('.voyage-forecast-route')) return;

  const goal = readGoal();
  const route = document.createElement('section');
  route.className = 'voyage-forecast-route';

  if (!goal) {
    route.innerHTML = `
      <div class="voyage-forecast-head"><div><span>FUTURE ROUTE</span><h2>未来航路</h2></div><button type="button">目的地を設定</button></div>
      <p class="voyage-forecast-note">目的地を設定すると、現在資産と将来予測を同じ航路上で比較できます。</p>
    `;
    route.querySelector('button').addEventListener('click', openGoalSheet);
    simHero.parentNode.insertBefore(route, simHero);
    return;
  }

  const current = parseFirstYen(simHero.querySelector('.fc-simhero-amt')?.textContent);
  const future = parseFirstYen(simHero.querySelector('.fc-simhero-foot b')?.textContent);
  const period = simHero.querySelector('.fc-simhero-foot span')?.textContent?.trim() || '将来予測';

  const currentPct = current == null ? 0 : (current / goal.amount) * 100;
  const futurePct = future == null ? null : (future / goal.amount) * 100;
  const forecastRemaining = future == null ? null : Math.max(0, goal.amount - future);
  const reaches = future != null && future >= goal.amount;

  route.innerHTML = `
    <div class="voyage-forecast-head">
      <div><span>FUTURE ROUTE</span><h2>未来航路</h2></div>
      <button type="button">目的地を編集</button>
    </div>
    <div class="voyage-forecast-values">
      <div><span>現在地</span><b>${current == null ? '非表示' : yen(current)}</b></div>
      <div><span>${escapeHtml(period)}</span><b>${future == null ? '非表示' : yen(future)}</b></div>
      <div><span>目的地</span><b>${yen(goal.amount)}</b></div>
    </div>
    ${routeMarkup({ currentPct, forecastPct: futurePct })}
    <div class="voyage-forecast-result ${reaches ? 'reached' : ''}">
      <span>${future == null ? 'シークレットモードを解除すると予測地点を表示します' : reaches ? `${period}には目的地へ到達する予測です` : `${period}の予測地点から目的地まで`}</span>
      ${future != null ? `<b>${reaches ? '到達見込み' : yen(forecastRemaining)}</b>` : ''}
    </div>
  `;

  route.querySelector('.voyage-forecast-head button').addEventListener('click', openGoalSheet);
  simHero.parentNode.insertBefore(route, simHero);
}

function decorate() {
  decorateDashboard();
  decorateSimulation();
}

function scheduleDecorate() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    decorate();
  });
}

export function initVoyageGoal() {
  scheduleDecorate();
  const root = document.querySelector('#fc-root');
  if (!root) return;
  const observer = new MutationObserver(scheduleDecorate);
  observer.observe(root, { childList: true, subtree: true });
}
