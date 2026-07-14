/* =========================================================================
   株価詳細オーバーレイ
   既存のポートフォリオ／ウォッチリスト画面を壊さず、銘柄行をタップしたときだけ
   iPhone向けのダーク・ネオン・ガラス調詳細画面をbody直下へ重ねて表示する。
   ========================================================================= */

const STOCK_DETAIL_FAVORITES_KEY = "stock_detail_favorites_v1";
const PERIODS = [
  { key:"1d", label:"今日", points:24, volatility:0.010 },
  { key:"1w", label:"1週間", points:28, volatility:0.018 },
  { key:"1m", label:"1か月", points:30, volatility:0.028 },
  { key:"3m", label:"3か月", points:34, volatility:0.045 },
  { key:"1y", label:"1年", points:40, volatility:0.090 },
  { key:"5y", label:"5年", points:44, volatility:0.180 },
];

let activeOverlay = null;
let previousBodyOverflow = "";

function esc(value){
  return String(value == null ? "" : value)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function hashText(text){
  let h = 2166136261;
  for(const ch of String(text || "")){
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rngFactory(seed){
  let x = seed || 123456789;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return ((x >>> 0) % 1000000) / 1000000;
  };
}

function formatPrice(price){
  return Number(price || 0).toLocaleString("en-US", { minimumFractionDigits:2, maximumFractionDigits:2 });
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

function parseRowData(row){
  const ticker = row.dataset.ticker || row.dataset.holdingTicker || "AAPL";
  const name = (row.querySelector(".pf-name") || {}).textContent || ticker;
  const priceText = (row.querySelector(".pf-watch-price") || {}).textContent || "";
  const changeText = (row.querySelector(".pf-watch-chg") || {}).textContent || "";
  const price = numberFromText(priceText) || 100 + (hashText(ticker) % 9000) / 100;
  const changePct = numberFromText(changeText);
  const prevClose = changePct == null ? price * 0.992 : price / (1 + changePct / 100);
  return { ticker, name: name.trim() || ticker, price, prevClose };
}

async function fetchQuote(ticker, fallback){
  try{
    const res = await fetch(`/api/stocks/quote?symbols=${encodeURIComponent(ticker)}`);
    if(!res.ok) throw new Error("quote-http-" + res.status);
    const data = await res.json();
    const q = data && data.quotes && data.quotes[ticker];
    if(q && Number(q.price) > 0){
      return { price:Number(q.price), prevClose:Number(q.prevClose) || Number(q.price), live:true };
    }
  }catch(e){}
  return Object.assign({}, fallback, { live:false });
}

function captureWatchlist(){
  return [...document.querySelectorAll(".pf-watch-row[data-ticker]")].map(row => {
    const parsed = parseRowData(row);
    const changeEl = row.querySelector(".pf-watch-chg");
    return Object.assign(parsed, { up: !changeEl || changeEl.classList.contains("up") });
  });
}

function capturePortfolio(){
  const total = (document.querySelector("#pf-hero-total") || {}).textContent || "0 AC";
  const sub = (document.querySelector("#pf-hero-sub-text") || {}).textContent || "ゲーム内ポートフォリオ";
  return { total: total.trim(), sub: sub.trim() };
}

function generateSeries(ticker, periodKey, lastPrice){
  const period = PERIODS.find(p => p.key === periodKey) || PERIODS[0];
  const rand = rngFactory(hashText(`${ticker}:${periodKey}`));
  const count = period.points;
  let close = Math.max(1, lastPrice * (0.92 + rand() * 0.10));
  const rows = [];
  for(let i=0;i<count;i++){
    const drift = ((i / Math.max(1, count - 1)) - 0.42) * period.volatility * 0.55;
    const move = (rand() - 0.46) * period.volatility + drift;
    const open = close;
    close = Math.max(0.5, open * (1 + move));
    const spread = Math.max(0.002, period.volatility * (0.28 + rand() * 0.55));
    const high = Math.max(open, close) * (1 + rand() * spread);
    const low = Math.min(open, close) * (1 - rand() * spread);
    const volume = 30 + Math.round(rand() * 70);
    rows.push({ open, high, low, close, volume });
  }
  const scale = lastPrice / rows[rows.length - 1].close;
  return rows.map(r => ({
    open:r.open*scale, high:r.high*scale, low:r.low*scale, close:r.close*scale, volume:r.volume,
  }));
}

function chartSVG(ticker, periodKey, price){
  const series = generateSeries(ticker, periodKey, price);
  const W = 680, H = 310, top = 18, bottom = 70, left = 10, right = 56;
  const chartH = H - top - bottom;
  const plotW = W - left - right;
  const values = series.flatMap(r => [r.high, r.low]);
  const min = Math.min(...values), max = Math.max(...values);
  const span = Math.max(0.01, max - min);
  const y = v => top + (max - v) / span * chartH;
  const step = plotW / series.length;
  const candleW = Math.max(3, Math.min(10, step * 0.48));
  const maxVol = Math.max(...series.map(r => r.volume));
  const grid = [0,1,2,3].map(i => {
    const yy = top + chartH * i / 3;
    const value = max - span * i / 3;
    return `<g><line x1="${left}" y1="${yy.toFixed(1)}" x2="${W-right}" y2="${yy.toFixed(1)}" class="sd-chart-grid"/><text x="${W-4}" y="${(yy+4).toFixed(1)}" class="sd-chart-y">${formatPrice(value)}</text></g>`;
  }).join("");
  const candles = series.map((r,i) => {
    const x = left + i * step + step / 2;
    const up = r.close >= r.open;
    const bodyY = Math.min(y(r.open), y(r.close));
    const bodyH = Math.max(2, Math.abs(y(r.close)-y(r.open)));
    const volH = r.volume / maxVol * 46;
    return `<g class="${up?"up":"down"}">
      <line x1="${x.toFixed(1)}" y1="${y(r.high).toFixed(1)}" x2="${x.toFixed(1)}" y2="${y(r.low).toFixed(1)}" class="sd-wick"/>
      <rect x="${(x-candleW/2).toFixed(1)}" y="${bodyY.toFixed(1)}" width="${candleW.toFixed(1)}" height="${bodyH.toFixed(1)}" rx="1.4" class="sd-candle"/>
      <rect x="${(x-candleW/2).toFixed(1)}" y="${(H-bottom+14+46-volH).toFixed(1)}" width="${candleW.toFixed(1)}" height="${volH.toFixed(1)}" rx="1" class="sd-volume"/>
    </g>`;
  }).join("");
  const closePoints = series.map((r,i) => `${(left+i*step+step/2).toFixed(1)},${y(r.close).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ticker)}のローソク足チャート">
    <defs><filter id="sdGlow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    ${grid}
    <polyline points="${closePoints}" class="sd-chart-line-shadow"/>
    ${candles}
    <line x1="${left}" y1="${y(price).toFixed(1)}" x2="${W-right}" y2="${y(price).toFixed(1)}" class="sd-price-guide"/>
    <rect x="${W-right+3}" y="${(y(price)-12).toFixed(1)}" width="51" height="24" rx="8" class="sd-price-pill"/>
    <text x="${W-27}" y="${(y(price)+4).toFixed(1)}" text-anchor="middle" class="sd-price-pill-text">${formatPrice(price)}</text>
  </svg>`;
}

function sparklineSVG(seedText, up=true){
  const rand = rngFactory(hashText(seedText));
  let v = 50;
  const pts = [];
  for(let i=0;i<18;i++){
    v += (rand()-.46) * 10 + (up ? .8 : -.8);
    pts.push(`${(i/17*100).toFixed(1)},${(42-Math.max(4,Math.min(38,v/2))).toFixed(1)}`);
  }
  return `<svg viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.join(" ")}"/></svg>`;
}

function metricData(price, prevClose, ticker){
  const rand = rngFactory(hashText(ticker));
  const open = prevClose * (0.992 + rand() * .016);
  const high = Math.max(price, open) * (1.006 + rand() * .015);
  const low = Math.min(price, open) * (0.982 + rand() * .012);
  const volume = 900000 + Math.round(rand() * 8900000);
  const turnover = price * volume;
  const per = 14 + rand() * 34;
  const pbr = 1.2 + rand() * 8.5;
  return [
    ["始値", `$${formatPrice(open)}`, ""], ["高値", `$${formatPrice(high)}`, "up"],
    ["安値", `$${formatPrice(low)}`, "down"], ["出来高", volume.toLocaleString(), ""],
    ["前日終値", `$${formatPrice(prevClose)}`, ""], ["売買代金", `${Math.round(turnover/1000).toLocaleString()}千$`, ""],
    ["PER", per.toFixed(2), ""], ["PBR", pbr.toFixed(2), ""],
  ];
}

function watchRowsHTML(items, activeTicker){
  const list = items.length ? items : [
    {ticker:"NVDA",name:"NVIDIA",price:135.60,prevClose:132.10},
    {ticker:"MSFT",name:"Microsoft",price:435.12,prevClose:439.20},
    {ticker:"IONQ",name:"IonQ",price:41.25,prevClose:40.72},
  ];
  return list.slice(0,5).map(item => {
    const change = item.prevClose ? (item.price-item.prevClose)/item.prevClose*100 : 0;
    const up = change >= 0;
    return `<button type="button" class="sd-watch-row${item.ticker===activeTicker?" active":""}" data-sd-open-ticker="${esc(item.ticker)}" data-sd-open-name="${esc(item.name)}" data-sd-open-price="${item.price}" data-sd-open-prev="${item.prevClose}">
      <span class="sd-watch-ident"><b>${esc(item.name)}</b><small>${esc(item.ticker)}</small></span>
      <span class="sd-watch-spark ${up?"up":"down"}">${sparklineSVG(item.ticker, up)}</span>
      <span class="sd-watch-quote"><b>$${formatPrice(item.price)}</b><small class="${up?"up":"down"}">${up?"+":""}${change.toFixed(2)}%</small></span>
    </button>`;
  }).join("");
}

function indexesHTML(){
  const indexes = [["S&P 500","5,486.12",1.23],["NASDAQ","17,862.23",.89],["DOW","39,150.33",-.42],["SOX","5,538.21",1.45]];
  return indexes.map(([name,value,change]) => `<div class="sd-index-card"><b>${name}</b><span>${value}</span><small class="${change>=0?"up":"down"}">${change>=0?"+":""}${change.toFixed(2)}%</small><i class="${change>=0?"up":"down"}">${sparklineSVG(name, change>=0)}</i></div>`).join("");
}

function relativePeriodLabel(periodKey){
  return ({"1d":"今日","1w":"直近1週間","1m":"直近1か月","3m":"直近3か月","1y":"直近1年","5y":"直近5年"})[periodKey] || "今日";
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
  const watchlist = captureWatchlist();
  const portfolio = capturePortfolio();
  const favorites = loadFavorites();
  let data = Object.assign({}, initial);
  let periodKey = "1d";

  const overlay = document.createElement("div");
  overlay.className = "stock-detail-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", `${data.name}の株価詳細`);
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  document.body.appendChild(overlay);
  activeOverlay = overlay;

  function render(){
    const price = Number(data.price) || 0;
    const prev = Number(data.prevClose) || price || 1;
    const delta = price - prev;
    const pct = prev ? delta / prev * 100 : 0;
    const up = delta >= 0;
    const isFavorite = favorites.has(data.ticker);
    const metrics = metricData(price, prev, data.ticker);
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;

    overlay.innerHTML = `<div class="stock-detail-shell">
      <div class="sd-ambient sd-ambient-a"></div><div class="sd-ambient sd-ambient-b"></div>
      <header class="sd-header"><button type="button" class="sd-icon-btn" data-sd-close aria-label="戻る">‹</button><div class="sd-header-actions"><button type="button" class="sd-icon-btn sd-favorite${isFavorite?" active":""}" data-sd-favorite aria-label="お気に入り">★</button><button type="button" class="sd-icon-btn" data-sd-menu aria-label="メニュー">•••</button></div></header>
      <main class="sd-scroll">
        <section class="sd-price-section"><div class="sd-company-line"><span>${esc(data.name)}</span><span class="sd-market-badge">米国株 / NASDAQ</span></div><div class="sd-symbol-line"><strong>${esc(data.ticker)}</strong><span>更新 ${time}${data.live===false?"・参考値":""}</span></div><div class="sd-price">$${formatPrice(price)}</div><div class="sd-change ${up?"up":"down"}">${up?"+":""}${formatPrice(delta)} (${up?"+":""}${pct.toFixed(2)}%) <span>${relativePeriodLabel(periodKey)}</span></div></section>
        <section class="sd-glass sd-chart-card"><div class="sd-period-tabs">${PERIODS.map(p => `<button type="button" class="${periodKey===p.key?"active":""}" data-sd-period="${p.key}">${p.label}</button>`).join("")}</div><div class="sd-chart-wrap">${chartSVG(data.ticker, periodKey, price)}</div><div class="sd-chart-caption"><span>ローソク足</span><span>出来高</span><span class="sd-live-dot">${data.live===false?"参考データ":"リアルタイム価格"}</span></div><div class="sd-metrics">${metrics.map(([label,value,cls]) => `<div><small>${label}</small><strong class="${cls}">${value}</strong></div>`).join("")}</div></section>
        <section class="sd-glass sd-portfolio-card"><div><span class="sd-card-eyebrow">マイポートフォリオ</span><small>評価額合計</small><strong>${esc(portfolio.total)}</strong><p>${esc(portfolio.sub)}</p></div><div class="sd-portfolio-graph">${sparklineSVG("portfolio", true)}</div><span class="sd-chevron">›</span></section>
        <section class="sd-section"><div class="sd-section-head"><h2>マーケット</h2><span>主要指数</span></div><div class="sd-index-scroll">${indexesHTML()}</div></section>
        <section class="sd-glass sd-watch-card"><div class="sd-section-head"><h2>ウォッチリスト</h2><button type="button" data-sd-seeall>すべて見る ›</button></div><div class="sd-watch-list">${watchRowsHTML(watchlist, data.ticker)}</div></section>
        <p class="sd-disclaimer">※ゲーム内通貨ACを使ったデモ取引画面です。チャートと指標の一部はUI確認用の参考データです。</p><div class="sd-action-spacer"></div>
      </main>
      <div class="sd-actions"><button type="button" class="sd-trade-btn sell" data-sd-sell>売却</button><button type="button" class="sd-trade-btn buy" data-sd-buy>購入</button></div>
      <div class="sd-menu-sheet" data-sd-menu-sheet hidden><button type="button" data-sd-menu-refresh>株価を更新</button><button type="button" data-sd-menu-close>閉じる</button></div>
    </div>`;

    overlay.querySelector("[data-sd-close]").onclick = closeOverlay;
    overlay.querySelector("[data-sd-favorite]").onclick = () => { if(favorites.has(data.ticker)) favorites.delete(data.ticker); else favorites.add(data.ticker); saveFavorites(favorites); render(); };
    overlay.querySelector("[data-sd-menu]").onclick = () => { const sheet = overlay.querySelector("[data-sd-menu-sheet]"); sheet.hidden = !sheet.hidden; };
    overlay.querySelector("[data-sd-menu-close]").onclick = () => { overlay.querySelector("[data-sd-menu-sheet]").hidden = true; };
    overlay.querySelector("[data-sd-menu-refresh]").onclick = async () => { const btn = overlay.querySelector("[data-sd-menu-refresh]"); btn.disabled = true; btn.textContent = "更新中…"; data = Object.assign(data, await fetchQuote(data.ticker, data)); render(); };
    overlay.querySelectorAll("[data-sd-period]").forEach(btn => btn.onclick = () => { periodKey = btn.dataset.sdPeriod; render(); });
    overlay.querySelectorAll("[data-sd-open-ticker]").forEach(btn => btn.onclick = async () => { data = { ticker:btn.dataset.sdOpenTicker, name:btn.dataset.sdOpenName, price:Number(btn.dataset.sdOpenPrice), prevClose:Number(btn.dataset.sdOpenPrev) }; periodKey = "1d"; render(); data = Object.assign(data, await fetchQuote(data.ticker, data)); if(activeOverlay === overlay) render(); });
    overlay.querySelector("[data-sd-seeall]").onclick = closeOverlay;
    overlay.querySelector("[data-sd-buy]").onclick = () => openTradeFromDetail("buy");
    overlay.querySelector("[data-sd-sell]").onclick = () => openTradeFromDetail("sell");
  }

  render();
  requestAnimationFrame(() => overlay.classList.add("show"));
  data = Object.assign(data, await fetchQuote(data.ticker, data));
  if(activeOverlay === overlay) render();
}

export function initStockDetailUI(){
  document.addEventListener("click", (event) => {
    const row = event.target && event.target.closest ? event.target.closest(".pf-watch-row[data-ticker], .pf-row[data-holding-ticker]") : null;
    if(!row || event.target.closest("button, a, input, [data-rm-ticker], [data-sell-ticker]")) return;
    event.preventDefault();
    openDetail(parseRowData(row));
  });
  document.addEventListener("keydown", (event) => { if(event.key === "Escape" && activeOverlay) closeOverlay(); });
}
