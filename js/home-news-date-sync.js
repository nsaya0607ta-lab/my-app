/* =========================================================================
   ホーム画面の「予定」カードで選択した日付とニュースカードを同期する。

   既存の予定カードは前日／翌日ボタンで表示日を切り替えるが、ニュースカードは
   常に今日だけを参照していた。このモジュールでは同じボタン操作を検知し、
   選択日の日本・海外ニュースを表示する。render.js本体を大きく変更せず、
   ホーム画面の部分再描画にも追従できるようMutationObserverを利用する。
   ========================================================================= */

import { esc } from './core.js';
import { fetchNewsCategory, getNewsCategoryState, newsForCategoryOnDate } from './news.js';
import { S } from './state.js';
import { go } from './render.js';

const HOME_NEWS_CATEGORIES = [
  { category: "japan", screenKey: "news-japan", icon: "🇯🇵", tag: "日本", detailLabel: "日本経済", tagClass: "news-today-tag-jp" },
  { category: "world", screenKey: "news-world", icon: "🌐", tag: "海外", detailLabel: "世界経済", tagClass: "news-today-tag-world" },
];
const HOME_NEWS_LIMIT = 2;
const pendingFetches = new Set();

function startOfToday(){
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// render.js側のホーム予定カードも初回は今日から始まるため、同じ日付を初期値にする。
// 前日／翌日ボタンを押した回数だけ双方が同じ方向へ進むので、画面遷移を挟んでも同期する。
let selectedDate = startOfToday();
let renderQueued = false;

function dateKey(date){
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function utcDayNumber(date){
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

function selectedDateLabel(date){
  const diff = utcDayNumber(date) - utcDayNumber(startOfToday());
  if(diff === 0) return "今日のニュース";
  if(diff === -1) return "昨日のニュース";
  if(diff === -2) return "一昨日のニュース";
  if(diff === 1) return "明日のニュース";
  if(diff === 2) return "明後日のニュース";
  return `${date.getMonth() + 1}月${date.getDate()}日のニュース`;
}

function updatedLabel(){
  const times = HOME_NEWS_CATEGORIES
    .map(c => getNewsCategoryState(c.category).fetchedAt)
    .filter(t => t > 0);
  if(!times.length) return "";
  const latest = new Date(Math.max(...times));
  const pad = n => String(n).padStart(2, "0");
  return `更新：${pad(latest.getHours())}:${pad(latest.getMinutes())}`;
}

function categorySignature(category, key){
  const st = getNewsCategoryState(category);
  const ids = newsForCategoryOnDate(category, key, HOME_NEWS_LIMIT).map(n => n.id);
  return [category, st.items === null ? "none" : "loaded", st.loading ? "loading" : "idle", st.error ? "error" : "ok", st.fetchedAt || 0, ...ids].join(":");
}

function currentSignature(key){
  return HOME_NEWS_CATEGORIES.map(c => categorySignature(c.category, key)).join("|");
}

function requestMissingNews(){
  HOME_NEWS_CATEGORIES.forEach(cat => {
    if(getNewsCategoryState(cat.category).items !== null || pendingFetches.has(cat.category)) return;
    pendingFetches.add(cat.category);
    fetchNewsCategory(cat.category)
      .catch(() => null)
      .finally(() => {
        pendingFetches.delete(cat.category);
        scheduleRender();
      });
  });
}

function groupHTML(cat, key){
  const { items, error, loading } = getNewsCategoryState(cat.category);
  const tagHTML = `<button type="button" class="news-today-tag ${cat.tagClass}" data-news-date-go="${cat.screenKey}">${cat.icon} ${esc(cat.tag)}</button>`;

  let bodyHTML;
  if(items === null && loading){
    bodyHTML = `<div class="news-today-skeleton"><span></span><span></span></div>`;
  }else if(items === null && error){
    bodyHTML = `<div class="news-today-msg news-today-msg-error">ニュースを取得できませんでした</div>`;
  }else{
    const selected = newsForCategoryOnDate(cat.category, key, HOME_NEWS_LIMIT);
    bodyHTML = selected.length
      ? `<ul class="news-today-list">${selected.map(n => `
          <li><button type="button" class="news-today-item" data-news-date-id="${esc(n.id)}" data-news-date-cat="${esc(cat.category)}">
            <span class="news-today-title">${esc(n.title)}</span>
          </button></li>`).join("")}</ul>`
      : `<div class="news-today-msg">この日の登録はまだありません</div>`;
  }

  return `<div class="news-today-group">${tagHTML}${bodyHTML}</div>`;
}

function cardHTML(key, label){
  return `
    <div class="news-card-head" data-news-date-sync="1">
      <span class="news-today-head-title">${esc(label)}</span>
      <button type="button" class="news-today-seeall" data-news-date-go="news-japan">すべて見る ＞</button>
    </div>
    <div class="news-today-body">${HOME_NEWS_CATEGORIES.map(cat => groupHTML(cat, key)).join("")}</div>
    <div class="news-today-updated">${updatedLabel()}</div>
  `;
}

function bindCard(card, key){
  card.querySelectorAll("[data-news-date-go]").forEach(button => {
    button.onclick = () => go(button.dataset.newsDateGo);
  });

  card.querySelectorAll("[data-news-date-id]").forEach(button => {
    button.onclick = () => {
      const cat = HOME_NEWS_CATEGORIES.find(c => c.category === button.dataset.newsDateCat);
      if(!cat) return;
      const item = newsForCategoryOnDate(cat.category, key, HOME_NEWS_LIMIT)
        .find(n => n.id === button.dataset.newsDateId);
      if(!item) return;
      S.newsDetail = {
        title: item.title,
        content: item.content,
        dateKey: item.dateKey,
        label: cat.detailLabel,
        icon: cat.icon,
        returnScreen: "select",
      };
      go("news-detail");
    };
  });
}

function renderSelectedDateNews(){
  const card = document.getElementById("news-today-card");
  if(!card) return;

  requestMissingNews();
  const key = dateKey(selectedDate);
  const label = selectedDateLabel(selectedDate);
  const signature = currentSignature(key);
  const alreadySynced = !!card.querySelector('[data-news-date-sync="1"]')
    && card.dataset.newsDateKey === key
    && card.dataset.newsDateSignature === signature
    && (card.querySelector(".news-today-head-title") || {}).textContent === label;

  if(alreadySynced) return;

  card.innerHTML = cardHTML(key, label);
  card.dataset.newsDateKey = key;
  card.dataset.newsDateSignature = signature;
  bindCard(card, key);
}

function scheduleRender(){
  if(renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderSelectedDateNews();
  });
}

function shiftSelectedDate(delta){
  selectedDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + delta);
  scheduleRender();
}

// 予定カード側のonclickより前に選択日を更新し、実際の予定カード再描画が終わる
// 次のanimation frameでニュースカードを同じ日付へ差し替える。
document.addEventListener("click", event => {
  const target = event.target && event.target.closest ? event.target.closest("#gcal-day-prev, #gcal-day-next") : null;
  if(!target || target.disabled || !target.closest("#gcal-day-card")) return;
  shiftSelectedDate(target.id === "gcal-day-prev" ? -1 : 1);
}, true);

// ホーム画面全体やニュースカードだけが既存処理によって再描画された場合にも、
// 選択日の表示へ戻す。自分自身のinnerHTML更新も監視されるが、署名一致時は
// 書き換えないため無限ループにはならない。
const app = document.getElementById("app");
if(app){
  const observer = new MutationObserver(() => scheduleRender());
  observer.observe(app, { childList: true, subtree: true });
}

scheduleRender();
