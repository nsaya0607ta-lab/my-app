/* =========================================================================
   株価詳細オーバーレイ
   既存のポートフォリオ／ウォッチリスト画面を壊さず、銘柄行をタップしたときだけ
   iPhone向けのダーク・ネオン・ガラス調詳細画面をbody直下へ重ねて表示する。

   表示するのはAPI（Finnhub）またはローカルの保有株データから実際に取得できた
   値だけ。取得できない項目は0や仮の数値で埋めず、非表示にするか
   「取得できません」と明記する。固定配列やMath.random等による
   チャート・指標の自動生成は一切行わない。
   ========================================================================= */

import { loadPortfolio, isUSMarketHoursJST } from "./render.js";

const STOCK_DETAIL_FAVORITES_KEY = "stock_detail_favorites_v1";
const PERIOD_LABELS = [
  { key:"1d", label:"今日" },
  { key:"1w", label:"1週間" },
  { key:"1m", label:"1か月" },
  { key:"3m", label:"3か月" },
  { key:"1y", label:"1年" },
  { key:"5y", label:"5年" },
];

let activeOverlay = null;
let previousBodyOverflow = "";
let requestSeq = 0; // 銘柄切替・再読み込み時のレース対策（古い応答で上書きしない）

function esc(value){
  return String(value == null ? "" : value)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function isFiniteNumber(v){ return typeof v === "number" && Number.isFinite(v); }
function isValidPrice(v){ return isFiniteNumber(v) && v > 0; }

function formatPrice(price){
  return Number(price).toLocaleString("en-US", { minimumFractionDigits:2, maximumFractionDigits:2 });
}

function numberFromText(text){
  const m = String(text || "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function loadFavorites(){
  try{
    const list = JSON.parse(localStorage.getItem(STOCK_DETAIL_FAVORITES_KEY) || "[]");
    return new Set(Array.isArray(list) ? list : []);
  }catch(e){ return new Set(); }
}

function saveFavorites(set){
  try{ localStorage.setItem(STOCK_DETAIL_FAVORITES_KEY, JSON.stringify([...set])); }catch(e){}
}

// クリックされた行から、実際にDOMへ描画済みのティッカー・銘柄名だけを読む。
// 価格はここでは取り出さない（「取得中…」の行から仮の価格を作らないため）。
// 正しい現在値は必ずfetchQuote()経由でAPIから取得する
function parseRowData(row){
  const ticker = row.dataset.ticker || row.dataset.holdingTicker || "";
  const nameEl = row.querySelector(".pf-name");
  const name = (nameEl && nameEl.textContent.trim()) || ticker;
  return { ticker, name };
}

// 実際にAPIから取得できた場合だけ { status:"ok", ... } を返す。
// 失敗時はダミー値へフォールバックせず、エラー種別だけを返す
async function fetchQuote(ticker){
  let res;
  try{
    res = await fetch(`/api/stocks?action=quote&symbols=${encodeURIComponent(ticker)}`);
  }catch(e){
    return { status:"error", code:"network" };
  }
  if(!res.ok){
    if(res.status === 500) return { status:"error", code:"server-misconfigured" };
    if(res.status === 429) return { status:"error", code:"rate-limited" };
    return { status:"error", code:"http-" + res.status };
  }
  let data;
  try{ data = await res.json(); }catch(e){ return { status:"error", code:"invalid-response" }; }
  const q = data && data.quotes && data.quotes[ticker];
  if(!q || !isValidPrice(q.price)) return { status:"error", code:"no-data" };
  return {
    status: "ok",
    ticker,
    price: q.price,
    prevClose: isValidPrice(q.prevClose) ? q.prevClose : null,
    open: isValidPrice(q.open) ? q.open : null,
    high: isValidPrice(q.high) ? q.high : null,
    low: isValidPrice(q.low) ? q.low : null,
    ts: (isFiniteNumber(q.ts) && q.ts > 0) ? q.ts : null,
  };
}

// PER・PBR・時価総額は別エンドポイント（別のFinnhubエンドポイント）から取得。
// 取得できなかった項目はnullのまま返し、呼び出し側で非表示にする
async function fetchMetrics(ticker){
  let res;
  try{
    res = await fetch(`/api/stocks?action=metrics&symbol=${encodeURIComponent(ticker)}`);
  }catch(e){
    return null;
  }
  if(!res.ok) return null;
  let data;
  try{ data = await res.json(); }catch(e){ return null; }
  return {
    per: (isFiniteNumber(data.per) && data.per > 0) ? data.per : null,
    pbr: (isFiniteNumber(data.pbr) && data.pbr > 0) ? data.pbr : null,
    marketCap: (isFiniteNumber(data.marketCap) && data.marketCap > 0) ? data.marketCap : null,
    currency: (typeof data.currency === "string" && data.currency) ? data.currency : null,
    fetchedAt: isFiniteNumber(data.fetchedAt) ? data.fetchedAt : null,
  };
}

// メイン画面（ポートフォリオ／ウォッチリスト画面）に既に描画されている
// ウォッチリスト行から、数値として読み取れた実データだけを取り出す。
// 「取得中…」でまだ数値になっていない行は、仮の値を作らず除外する
function captureWatchlist(){
  return [...document.querySelectorAll(".pf-watch-row[data-ticker]")]
    .map(row => {
      const ticker = row.dataset.ticker || "";
      const name = ((row.querySelector(".pf-name") || {}).textContent || ticker).trim();
      const priceEl = row.querySelector(".pf-watch-price");
      const chgEl = row.querySelector(".pf-watch-chg");
      const price = priceEl ? numberFromText(priceEl.textContent) : null;
      const changePct = chgEl ? numberFromText(chgEl.textContent) : null;
      return { ticker, name, price, changePct };
    })
    .filter(item => item.ticker && isValidPrice(item.price) && isFiniteNumber(item.changePct));
}

// 保有中の銘柄データ（実際の取得数量・平均取得単価）をローカル保存された
// ポートフォリオから読む。保有していなければnullを返す（仮の保有数は作らない）
function currentHolding(ticker){
  const pf = loadPortfolio();
  const h = pf[ticker];
  if(!h || !(h.shares > 0)) return null;
  const avgCost = h.shares > 0 ? h.cost / h.shares : null;
  return { shares: h.shares, avgCost: isValidPrice(avgCost) ? avgCost : null };
}

// Finnhubのタイムスタンプ（UNIX秒）を日本時間の時刻表示に変換する。
// 当日なら時刻のみ、それ以外は日付も付ける。取得できない場合はnullを返す
function formatTradeTime(tsSeconds){
  if(!isFiniteNumber(tsSeconds) || tsSeconds <= 0) return null;
  const d = new Date(tsSeconds * 1000);
  if(Number.isNaN(d.getTime())) return null;
  const fmt = new Intl.DateTimeFormat("ja-JP", { timeZone:"Asia/Tokyo", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hour12:false });
  const parts = fmt.formatToParts(d).reduce((o,p) => { o[p.type] = p.value; return o; }, {});
  const nowParts = fmt.formatToParts(new Date()).reduce((o,p) => { o[p.type] = p.value; return o; }, {});
  const sameDay = parts.year === nowParts.year && parts.month === nowParts.month && parts.day === nowParts.day;
  return sameDay ? `${parts.hour}:${parts.minute}` : `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

function priceSectionHTML(ticker, name, quote, marketOpen){
  const price = quote.price;
  const hasChange = isValidPrice(quote.prevClose);
  const delta = hasChange ? price - quote.prevClose : null;
  const pct = hasChange ? delta / quote.prevClose * 100 : null;
  const up = delta != null ? delta >= 0 : null;
  const tradeTime = formatTradeTime(quote.ts);
  const changeHTML = delta != null
    ? `<div class="sd-change ${up?"up":"down"}">${up?"+":""}${formatPrice(delta)} (${up?"+":""}${pct.toFixed(2)}%)</div>`
    : `<p class="sd-empty-note">前日終値を取得できないため前日比は表示できません</p>`;
  return `<section class="sd-price-section">
    <div class="sd-company-line"><span>${esc(name)}</span><span class="sd-market-badge">米国株・USD</span></div>
    <div class="sd-symbol-line"><strong>${esc(ticker)}</strong><span class="sd-market-status ${marketOpen?"open":"closed"}">${marketOpen?"● 取引時間中":"○ 取引時間外"}</span></div>
    <div class="sd-price">$${formatPrice(price)}</div>
    ${changeHTML}
    <div class="sd-time-note">${marketOpen ? "現在値" : "最終取引価格"}${tradeTime ? ` ・ 最終取引時刻 ${tradeTime}` : " ・ 取引時刻は取得できません"}</div>
  </section>`;
}

// 出来高・売買代金はFinnhubの現在値エンドポイントに含まれないため表示しない。
// 始値・高値・安値・前日終値はAPIから実際に取得できた項目だけを並べる。
// PER・PBR・時価総額は別エンドポイントから取得できた場合のみ、取得日時と共に表示する
function metricsSectionHTML(quote, metrics){
  const rows = [];
  if(quote.open != null) rows.push(["始値", `$${formatPrice(quote.open)}`, ""]);
  if(quote.high != null) rows.push(["高値", `$${formatPrice(quote.high)}`, "up"]);
  if(quote.low != null) rows.push(["安値", `$${formatPrice(quote.low)}`, "down"]);
  if(quote.prevClose != null) rows.push(["前日終値", `$${formatPrice(quote.prevClose)}`, ""]);
  let fundamentalsNote = "";
  if(metrics){
    if(metrics.per != null) rows.push(["PER", metrics.per.toFixed(2), ""]);
    if(metrics.pbr != null) rows.push(["PBR", metrics.pbr.toFixed(2), ""]);
    if(metrics.marketCap != null) rows.push(["時価総額", `${Math.round(metrics.marketCap).toLocaleString()}百万${esc(metrics.currency || "")}`, ""]);
    if((metrics.per != null || metrics.pbr != null || metrics.marketCap != null) && metrics.fetchedAt != null){
      const t = formatTradeTime(Math.floor(metrics.fetchedAt / 1000));
      if(t) fundamentalsNote = `<p class="sd-fundamentals-note">PER・PBR・時価総額はリアルタイム株価とは別に取得（取得日時 ${t}）</p>`;
    }
  }
  if(!rows.length) return "";
  return `<div class="sd-metrics">${rows.map(([label,value,cls]) => `<div><small>${label}</small><strong class="${cls}">${value}</strong></div>`).join("")}</div>${fundamentalsNote}`;
}

function chartCardHTML(quote, metrics){
  return `<section class="sd-glass sd-chart-card">
    <div class="sd-period-tabs">${PERIOD_LABELS.map(p => `<button type="button" disabled>${p.label}</button>`).join("")}</div>
    <p class="sd-chart-unavailable">この期間のチャートデータは取得できません<br><small>現在のAPIプランでは過去の株価（ローソク足）・出来高データを取得できません</small></p>
    ${metricsSectionHTML(quote, metrics)}
  </section>`;
}

function portfolioCardHTML(ticker, quote){
  const holding = currentHolding(ticker);
  if(!holding){
    return `<section class="sd-glass sd-portfolio-card sd-portfolio-empty">
      <span class="sd-card-eyebrow">マイポートフォリオ</span>
      <p class="sd-empty-note">この銘柄はまだ保有していません</p>
    </section>`;
  }
  const hasPrice = quote && quote.status === "ok";
  const value = hasPrice ? holding.shares * quote.price : null;
  const cost = holding.avgCost != null ? holding.avgCost * holding.shares : null;
  const pnl = (value != null && cost != null) ? value - cost : null;
  const pnlPct = (pnl != null && cost > 0) ? pnl / cost * 100 : null;
  return `<section class="sd-glass sd-portfolio-card">
    <span class="sd-card-eyebrow">マイポートフォリオ</span>
    <small>保有数量</small><strong>${holding.shares}株</strong>
    <p>平均取得単価 ${holding.avgCost != null ? "$" + formatPrice(holding.avgCost) : "取得できません"}</p>
    ${value != null
      ? `<p>評価額 ${Math.round(value).toLocaleString()} AC</p>`
      : `<p class="sd-empty-note">現在価格を取得できないため評価額は計算できません</p>`}
    ${pnl != null ? `<p class="${pnl>=0?"up":"down"}">評価損益 ${pnl>=0?"+":""}${Math.round(pnl).toLocaleString()} AC（${pnlPct>=0?"+":""}${pnlPct.toFixed(2)}%）</p>` : ""}
  </section>`;
}

function watchRowsHTML(items, activeTicker){
  if(!items.length) return `<p class="sd-empty-note">ウォッチリストに表示できる銘柄がありません</p>`;
  return items.slice(0,5).map(item => {
    const up = item.changePct >= 0;
    return `<button type="button" class="sd-watch-row sd-watch-row-nospark${item.ticker===activeTicker?" active":""}" data-sd-open-ticker="${esc(item.ticker)}" data-sd-open-name="${esc(item.name)}">
      <span class="sd-watch-ident"><b>${esc(item.name)}</b><small>${esc(item.ticker)}</small></span>
      <span class="sd-watch-quote"><b>$${formatPrice(item.price)}</b><small class="${up?"up":"down"}">${up?"+":""}${item.changePct.toFixed(2)}%</small></span>
    </button>`;
  }).join("");
}

function loadingSectionHTML(name, ticker){
  return `<section class="sd-price-section">
    <div class="sd-company-line"><span>${esc(name)}</span></div>
    <div class="sd-symbol-line"><strong>${esc(ticker)}</strong></div>
    <p class="sd-loading">株価データを読み込み中…</p>
  </section>`;
}

const ERROR_MESSAGES = {
  "no-data": "この銘柄の株価データは現在取得できません。",
};
function errorSectionHTML(name, ticker, code){
  const message = ERROR_MESSAGES[code] || "株価データを取得できませんでした。時間をおいて再度お試しください。";
  return `<section class="sd-price-section">
    <div class="sd-company-line"><span>${esc(name)}</span></div>
    <div class="sd-symbol-line"><strong>${esc(ticker)}</strong></div>
  </section>
  <section class="sd-glass sd-error-card">
    <p>${esc(message)}</p>
    <button type="button" class="sd-retry-btn" data-sd-retry>再読み込み</button>
  </section>`;
}

function closeOverlay(){
  if(!activeOverlay) return;
  activeOverlay.classList.remove("show");
  const target = activeOverlay;
  activeOverlay = null;
  document.body.style.overflow = previousBodyOverflow;
  setTimeout(() => { try{ target.remove(); }catch(e){} }, 220);
}

function openTradeFromDetail(side){
  const button = document.getElementById(side === "buy" ? "pf-buy-btn" : "pf-sell-btn");
  closeOverlay();
  setTimeout(() => { if(button) button.click(); }, 230);
}

async function openDetail(initial){
  closeOverlay();
  const favorites = loadFavorites();
  let ticker = initial.ticker;
  let name = initial.name || ticker;
  let quote = null;
  let metrics = null;
  let loadState = "loading"; // loading | ok | error
  let errorCode = null;

  const overlay = document.createElement("div");
  overlay.className = "stock-detail-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", `${name}の株価詳細`);
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  document.body.appendChild(overlay);
  activeOverlay = overlay;

  function render(){
    if(activeOverlay !== overlay) return;
    const isFavorite = favorites.has(ticker);
    const marketOpen = isUSMarketHoursJST();

    let bodyHTML;
    if(loadState === "loading"){
      bodyHTML = loadingSectionHTML(name, ticker);
    } else if(loadState === "error"){
      bodyHTML = errorSectionHTML(name, ticker, errorCode);
    } else {
      const watchlist = captureWatchlist();
      bodyHTML = `
        ${priceSectionHTML(ticker, name, quote, marketOpen)}
        ${chartCardHTML(quote, metrics)}
        ${portfolioCardHTML(ticker, quote)}
        <section class="sd-glass sd-watch-card">
          <div class="sd-section-head"><h2>ウォッチリスト</h2><button type="button" data-sd-seeall>すべて見る ›</button></div>
          <div class="sd-watch-list">${watchRowsHTML(watchlist, ticker)}</div>
        </section>`;
    }

    const tradeEnabled = loadState === "ok";
    overlay.innerHTML = `<div class="stock-detail-shell">
      <div class="sd-ambient sd-ambient-a"></div><div class="sd-ambient sd-ambient-b"></div>
      <header class="sd-header"><button type="button" class="sd-icon-btn" data-sd-close aria-label="戻る">‹</button><div class="sd-header-actions"><button type="button" class="sd-icon-btn sd-favorite${isFavorite?" active":""}" data-sd-favorite aria-label="お気に入り">★</button><button type="button" class="sd-icon-btn" data-sd-menu aria-label="メニュー">•••</button></div></header>
      <main class="sd-scroll">
        ${bodyHTML}
        <p class="sd-disclaimer">アプリ内の保有記録機能です。実際の証券口座とは連携していません。取引はゲーム内通貨（AC）を使ったシミュレーションです。</p>
        <div class="sd-action-spacer"></div>
      </main>
      <div class="sd-actions"><button type="button" class="sd-trade-btn sell" data-sd-sell${tradeEnabled?"":" disabled"}>売却</button><button type="button" class="sd-trade-btn buy" data-sd-buy${tradeEnabled?"":" disabled"}>購入</button></div>
      <div class="sd-menu-sheet" data-sd-menu-sheet hidden><button type="button" data-sd-menu-refresh>株価を更新</button><button type="button" data-sd-menu-close>閉じる</button></div>
    </div>`;

    overlay.querySelector("[data-sd-close]").onclick = closeOverlay;
    overlay.querySelector("[data-sd-favorite]").onclick = () => { if(favorites.has(ticker)) favorites.delete(ticker); else favorites.add(ticker); saveFavorites(favorites); render(); };
    overlay.querySelector("[data-sd-menu]").onclick = () => { const sheet = overlay.querySelector("[data-sd-menu-sheet]"); sheet.hidden = !sheet.hidden; };
    overlay.querySelector("[data-sd-menu-close]").onclick = () => { overlay.querySelector("[data-sd-menu-sheet]").hidden = true; };
    overlay.querySelector("[data-sd-menu-refresh]").onclick = () => { overlay.querySelector("[data-sd-menu-sheet]").hidden = true; load(); };
    const retryBtn = overlay.querySelector("[data-sd-retry]");
    if(retryBtn) retryBtn.onclick = load;
    overlay.querySelectorAll("[data-sd-open-ticker]").forEach(btn => btn.onclick = () => {
      const newTicker = btn.dataset.sdOpenTicker;
      const newName = btn.dataset.sdOpenName || newTicker;
      if(newTicker === ticker) return;
      ticker = newTicker; name = newName; quote = null; metrics = null;
      load();
    });
    const seeAllBtn = overlay.querySelector("[data-sd-seeall]");
    if(seeAllBtn) seeAllBtn.onclick = closeOverlay;
    if(tradeEnabled){
      overlay.querySelector("[data-sd-buy]").onclick = () => openTradeFromDetail("buy");
      overlay.querySelector("[data-sd-sell]").onclick = () => openTradeFromDetail("sell");
    }
  }

  // 現在値・PER/PBR/時価総額をまとめて取得し直す。銘柄切替・再読み込み・
  // 初回表示のすべてでこの関数を通す。切替中に古い応答が遅れて届いても
  // requestSeqで世代を確認し、現在表示中の銘柄でなければ結果を捨てる
  async function load(){
    loadState = "loading";
    errorCode = null;
    render();
    const seq = ++requestSeq;
    const [q, m] = await Promise.all([fetchQuote(ticker), fetchMetrics(ticker)]);
    if(seq !== requestSeq || activeOverlay !== overlay) return;
    quote = q;
    metrics = m;
    if(q.status === "ok"){
      loadState = "ok";
    } else {
      loadState = "error";
      errorCode = q.code;
    }
    render();
  }

  render();
  requestAnimationFrame(() => overlay.classList.add("show"));
  load();
}

export function initStockDetailUI(){
  document.addEventListener("click", (event) => {
    const row = event.target && event.target.closest ? event.target.closest(".pf-watch-row[data-ticker], .pf-row[data-holding-ticker]") : null;
    if(!row || event.target.closest("button, a, input, [data-rm-ticker], [data-sell-ticker]")) return;
    event.preventDefault();
    const meta = parseRowData(row);
    if(!meta.ticker) return;
    openDetail(meta);
  });
  document.addEventListener("keydown", (event) => { if(event.key === "Escape" && activeOverlay) closeOverlay(); });
}
