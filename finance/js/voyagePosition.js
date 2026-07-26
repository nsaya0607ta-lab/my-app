// Midnight Voyage: ホームの合計資産カードへ「現在地」を表示する。
// 既存の資産計算や画面描画には触れず、描画後のDOMへ視覚要素だけを追加する。

const formatCurrentDate = () => {
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date());
  } catch {
    return '';
  }
};

function decorateCurrentPosition() {
  const hero = document.querySelector('.fc-hero');
  if (!hero || hero.dataset.voyagePosition === '1') return;

  const heroRow = hero.querySelector('.fc-hero-row');
  const amount = hero.querySelector('.fc-hero-amount');
  if (!heroRow || !amount) return;

  const positionHead = document.createElement('div');
  positionHead.className = 'voyage-position-head';

  const badge = document.createElement('span');
  badge.className = 'voyage-position-badge';
  badge.textContent = '現在地';

  const date = document.createElement('span');
  date.className = 'voyage-position-date';
  date.textContent = formatCurrentDate();

  positionHead.append(badge, date);
  hero.insertBefore(positionHead, heroRow);

  const caption = document.createElement('div');
  caption.className = 'voyage-position-caption';
  caption.textContent = '未来への資産航路の出発点';
  amount.insertAdjacentElement('afterend', caption);

  hero.dataset.voyagePosition = '1';
}

export function initVoyagePosition() {
  decorateCurrentPosition();

  const root = document.querySelector('#fc-root');
  if (!root) return;

  const observer = new MutationObserver(() => decorateCurrentPosition());
  observer.observe(root, { childList: true, subtree: true });
}
