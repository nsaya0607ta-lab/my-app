/* =========================================================================
   🏠 チャッピーハウス：ミッション（⑥）・チャッピー図鑑（⑪）・思い出アルバム（⑫）

   ・openChappyMissions() … その日のミッション一覧と報酬の受け取り。
     「現実で頑張ったこと」がそのまま進捗になる。
   ・openChappyBook()     … 図鑑。がんばりの記録／レベル履歴／家具／衣装／
     イベント／思い出／会話履歴／バッジをタブで見返せる。
   ========================================================================= */
import { playTapSound } from './audio.js';
import { chappySfx } from './chappyAudio.js';
import {
  getChappy, chappyMissions, chappyClaimMission, chappyLevelInfo, chappyStageForXp,
  chappyBadges, chappyAlbum, chappyTalkLog, chappyCollection, chappyRealLifeSummary,
  chappySeenActivities, chappySeenSecrets, chappyCurrentEvent,
} from './chappy.js';
import { CHAPPY_FURNITURE, CHAPPY_WEAR, CHAPPY_RARITY } from './data/chappy-items.js';
import {
  CHAPPY_ACTIVITIES, CHAPPY_SEASON_EVENTS, CHAPPY_SECRET_EVENTS,
} from './data/chappy-quests.js';
import { CHAPPY_STAGES } from './data/chappy-config.js';

function esc(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function fmtDate(ts){
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
}

function sheet(title, ariaLabel){
  const ov = document.createElement("div");
  ov.className = "modal-ov chp-sheet-ov";
  ov.innerHTML = `<div class="chp-sheet" role="dialog" aria-label="${esc(ariaLabel)}">
    <div class="chp-sheet-grip" aria-hidden="true"></div>
    <div class="chp-sheet-head">
      <span class="chp-sheet-title">${title}</span>
      <button type="button" class="chp-sheet-x" aria-label="閉じる">✕</button>
    </div>
    <div class="chp-sheet-body"></div>
  </div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.querySelector(".chp-sheet").classList.add("chp-sheet-show"));
  return ov;
}

/* =========================================================================
   ⑥ ミッション
   ========================================================================= */
export function openChappyMissions(onChange){
  const ov = sheet("🎯 今日のミッション", "今日のミッション");
  const body = ov.querySelector(".chp-sheet-body");
  const close = () => { try{ ov.remove(); }catch(e){} if(onChange) onChange(); };
  ov.querySelector(".chp-sheet-x").onclick = () => { playTapSound(); close(); };

  const render = () => {
    const list = chappyMissions();
    const st = getChappy();
    const allDone = list.length > 0 && list.every(m => m.claimed);
    body.innerHTML = `
      <div class="chp-mission-head">
        <span>毎日0時に入れかわります</span>
        <span class="chp-mission-count">${list.filter(m => m.done).length} / ${list.length} 達成</span>
      </div>
      <div class="chp-mission-list">
        ${list.map(m => `
          <div class="chp-mission${m.claimed ? " chp-mission--claimed" : m.done ? " chp-mission--done" : ""}">
            <span class="chp-mission-ico">${m.icon}</span>
            <span class="chp-mission-main">
              <span class="chp-mission-label">${esc(m.label)}</span>
              <span class="chp-mission-bar"><span class="chp-mission-fill" style="width:${Math.round(m.progress / m.target * 100)}%"></span></span>
              <span class="chp-mission-prog">${m.progress} / ${m.target}</span>
            </span>
            <span class="chp-mission-right">
              <span class="chp-mission-reward">${rewardText(m.reward)}</span>
              <button type="button" class="chp-mission-btn" data-chp-claim="${esc(m.id)}"${(m.done && !m.claimed) ? "" : " disabled"}>
                ${m.claimed ? "受取済" : m.done ? "うけとる" : "みっしょん中"}
              </button>
            </span>
          </div>`).join("")}
      </div>
      <div class="chp-mission-bonus${allDone ? " chp-mission-bonus--on" : ""}">
        🎉 ぜんぶ達成ボーナス：🪙80 ・ 🌟30XP ・ 🎫かぐガチャ券1枚
        ${allDone ? "<b>（受け取りました！）</b>" : ""}
      </div>
      <div class="chp-mission-note">
        ミッションは「学習」「タスク完了」「カレンダー登録」「AIニュース」など、
        アプリで実際にやったことがそのまま進みます。<br>
        いまのコイン：🪙 ${st.coins.toLocaleString()} ／ ガチャ券：${ticketText(st)}
      </div>`;

    body.querySelectorAll("[data-chp-claim]").forEach(b => b.onclick = () => {
      playTapSound();
      const r = chappyClaimMission(b.dataset.chpClaim);
      if(!r.ok) return;
      chappySfx("reward");
      render();
      if(onChange) onChange();
    });
  };
  render();
  return ov;
}

function rewardText(r){
  const parts = [];
  if(r.coins) parts.push(`🪙${r.coins}`);
  if(r.xp) parts.push(`🌟${r.xp}`);
  if(r.ticket) parts.push(`🎫${r.ticket.n || 1}`);
  return parts.join(" ");
}

function ticketText(st){
  const names = { furniture: "かぐ", costume: "いしょう", background: "はいけい", event: "イベント" };
  const owned = Object.keys(st.tickets).filter(k => st.tickets[k] > 0);
  if(!owned.length) return "なし";
  return owned.map(k => `${names[k]}${st.tickets[k]}枚`).join("・");
}

/* =========================================================================
   ⑪⑫ チャッピー図鑑・思い出アルバム
   ========================================================================= */
const BOOK_TABS = [
  { key: "record",  label: "きろく",   icon: "📊" },
  { key: "album",   label: "思い出",   icon: "📷" },
  { key: "badge",   label: "バッジ",   icon: "🏅" },
  { key: "furni",   label: "家具",     icon: "🪑" },
  { key: "wear",    label: "衣装",     icon: "👗" },
  { key: "life",    label: "せいかつ", icon: "🌿" },
  { key: "event",   label: "イベント", icon: "🎪" },
  { key: "talk",    label: "会話",     icon: "💬" },
];

export function openChappyBook(onChange){
  const ov = sheet("📖 チャッピー図鑑", "チャッピー図鑑");
  const body = ov.querySelector(".chp-sheet-body");
  const close = () => { try{ ov.remove(); }catch(e){} if(onChange) onChange(); };
  ov.querySelector(".chp-sheet-x").onclick = () => { playTapSound(); close(); };

  let tab = "record";
  const render = () => {
    body.innerHTML = `
      <div class="chp-tabs chp-tabs--scroll" role="tablist">
        ${BOOK_TABS.map(t => `<button type="button" class="chp-tab${t.key === tab ? " chp-tab--on" : ""}" data-chp-booktab="${t.key}" role="tab" aria-selected="${t.key === tab}">
          <span>${t.icon}</span>${esc(t.label)}</button>`).join("")}
      </div>
      <div class="chp-tabpanel">${bookPanelHTML(tab)}</div>`;
    body.querySelectorAll("[data-chp-booktab]").forEach(b => b.onclick = () => {
      playTapSound(); tab = b.dataset.chpBooktab; render();
    });
  };
  render();
  return ov;
}

function bookPanelHTML(tab){
  if(tab === "record") return recordHTML();
  if(tab === "album") return albumHTML();
  if(tab === "badge") return badgeHTML();
  if(tab === "furni") return collectionHTML(CHAPPY_FURNITURE, "furniture");
  if(tab === "wear") return collectionHTML(CHAPPY_WEAR.filter(w => w.cute > 0), "wear");
  if(tab === "life") return lifeHTML();
  if(tab === "event") return eventHTML();
  return talkHTML();
}

function recordHTML(){
  const st = getChappy();
  const info = chappyLevelInfo(st.xp);
  const stage = chappyStageForXp(st.xp);
  const sum = chappyRealLifeSummary();
  const col = chappyCollection();
  const stageIdx = CHAPPY_STAGES.findIndex(s => s.key === stage.key);
  return `
    <div class="chp-book-hero">
      <div class="chp-book-hero-lv">Lv.<b>${info.level}</b></div>
      <div class="chp-book-hero-stage">${esc(stage.name)}・${esc(stage.note)}</div>
      <div class="chp-book-hero-xp">総経験値 ${st.xp.toLocaleString()} XP</div>
    </div>

    <div class="chp-book-sec">レベル履歴（成長のあゆみ）</div>
    <div class="chp-stage-track">
      ${CHAPPY_STAGES.map((s, i) => `
        <div class="chp-stage-step${i <= stageIdx ? " chp-stage-step--on" : ""}">
          <span class="chp-stage-dot">${i <= stageIdx ? "●" : "○"}</span>
          <span class="chp-stage-name">${esc(s.name)}</span>
          <span class="chp-stage-xp">${s.minXp.toLocaleString()} XP</span>
        </div>`).join("")}
    </div>

    <div class="chp-book-sec">現実のがんばり</div>
    <div class="chp-record-grid">
      <div class="chp-record"><span class="chp-record-n">${sum.totalDays}</span><span class="chp-record-l">いっしょの日数</span></div>
      <div class="chp-record"><span class="chp-record-n">${sum.streak}</span><span class="chp-record-l">連続日数</span></div>
      <div class="chp-record"><span class="chp-record-n">${sum.bestStreak}</span><span class="chp-record-l">最長連続</span></div>
      <div class="chp-record"><span class="chp-record-n">${sum.studyTotal}</span><span class="chp-record-l">学習回数</span></div>
      <div class="chp-record"><span class="chp-record-n">${sum.studyMinutes}</span><span class="chp-record-l">学習した分</span></div>
      <div class="chp-record"><span class="chp-record-n">${sum.taskTotal}</span><span class="chp-record-l">完了タスク</span></div>
      <div class="chp-record"><span class="chp-record-n">${sum.newsTotal}</span><span class="chp-record-l">読んだニュース</span></div>
      <div class="chp-record"><span class="chp-record-n">${sum.knowledge}</span><span class="chp-record-l">知識ポイント</span></div>
    </div>

    <div class="chp-book-sec">コレクション</div>
    <div class="chp-col-list">
      ${colRow("🪑 家具", col.furniture)}
      ${colRow("👗 衣装・小物", col.wear)}
      ${colRow("🧱 内装パーツ", col.decor)}
      ${colRow("🎨 テーマ", col.theme)}
      ${colRow("🌄 背景", col.background)}
      ${colRow("🏅 バッジ", col.badges)}
      ${colRow("🌿 生活のすがた", { owned: col.activities.owned, total: CHAPPY_ACTIVITIES.length })}
      ${colRow("🔮 隠しイベント", col.secrets)}
      ${colRow("🎪 季節イベント", col.events)}
    </div>`;
}

function colRow(label, c){
  const pct = c.total ? Math.round(c.owned / c.total * 100) : 0;
  return `
    <div class="chp-col-row">
      <span class="chp-col-lab">${label}</span>
      <span class="chp-col-track"><span class="chp-col-fill" style="width:${pct}%"></span></span>
      <span class="chp-col-num">${c.owned}/${c.total}</span>
    </div>`;
}

function albumHTML(){
  const list = chappyAlbum();
  if(!list.length) return `<div class="chp-empty">まだ思い出がありません。<br>いっしょに過ごすと自動でここに増えていきます。</div>`;
  return `<div class="chp-album">
    ${list.map(a => `
      <div class="chp-album-card">
        <span class="chp-album-ico">${a.icon}</span>
        <span class="chp-album-body">
          <span class="chp-album-title">${esc(a.title)}</span>
          <span class="chp-album-desc">${esc(a.desc || "")}</span>
        </span>
        <span class="chp-album-date">${fmtDate(a.ts)}</span>
      </div>`).join("")}
  </div>`;
}

function badgeHTML(){
  const list = chappyBadges();
  return `<div class="chp-badge-grid">
    ${list.map(b => `
      <div class="chp-badge${b.owned ? " chp-badge--on" : ""}">
        <span class="chp-badge-ico">${b.owned ? b.icon : "❔"}</span>
        <span class="chp-badge-name">${esc(b.owned ? b.name : "？？？")}</span>
        <span class="chp-badge-desc">${esc(b.desc)}</span>
      </div>`).join("")}
  </div>`;
}

function collectionHTML(list, kind){
  const st = getChappy();
  const map = st.owned[kind] || {};
  const owned = list.filter(i => map[i.id]).length;
  return `
    <div class="chp-book-sec">あつめた数 ${owned} / ${list.length}</div>
    <div class="chp-zukan-grid">
      ${list.map(i => {
        const has = !!map[i.id];
        const rar = CHAPPY_RARITY[i.rarity || "n"];
        return `<div class="chp-zukan${has ? " chp-zukan--on" : ""}">
          <span class="chp-zukan-ico">${has ? i.icon : "❔"}</span>
          <span class="chp-zukan-name">${esc(has ? i.name : "？？？")}</span>
          <span class="chp-rarity chp-rarity--${i.rarity || "n"}">${"★".repeat(rar.star)}</span>
          ${has && i.event ? `<span class="chp-zukan-tag">限定</span>` : ""}
        </div>`;
      }).join("")}
    </div>`;
}

function lifeHTML(){
  const seen = new Set(chappySeenActivities());
  const secrets = new Set(chappySeenSecrets());
  return `
    <div class="chp-book-sec">見たことのある生活のすがた ${seen.size} / ${CHAPPY_ACTIVITIES.length}</div>
    <div class="chp-zukan-grid">
      ${CHAPPY_ACTIVITIES.map(a => `
        <div class="chp-zukan${seen.has(a.id) ? " chp-zukan--on" : ""}">
          <span class="chp-zukan-ico">${seen.has(a.id) ? a.icon : "❔"}</span>
          <span class="chp-zukan-name">${esc(seen.has(a.id) ? a.label : "？？？")}</span>
        </div>`).join("")}
    </div>
    <div class="chp-book-sec">出会った隠しイベント ${secrets.size} / ${CHAPPY_SECRET_EVENTS.length}</div>
    <div class="chp-zukan-grid">
      ${CHAPPY_SECRET_EVENTS.map(s => `
        <div class="chp-zukan${secrets.has(s.id) ? " chp-zukan--on" : ""}">
          <span class="chp-zukan-ico">${secrets.has(s.id) ? s.icon : "❔"}</span>
          <span class="chp-zukan-name">${esc(secrets.has(s.id) ? s.name : "？？？")}</span>
        </div>`).join("")}
    </div>`;
}

function eventHTML(){
  const st = getChappy();
  const now = chappyCurrentEvent();
  return `
    ${now ? `<div class="chp-event-now">${now.icon} <b>${esc(now.name)}</b> 開催中！<br><span>${esc(now.line)}</span></div>` : `<div class="chp-empty">いまは季節イベントの期間外です。<br>つぎの開催をおたのしみに！</div>`}
    <div class="chp-book-sec">1年のイベント</div>
    <div class="chp-event-list">
      ${CHAPPY_SEASON_EVENTS.map(ev => {
        const joined = st.seenEvents.includes(ev.id);
        const on = now && now.id === ev.id;
        return `<div class="chp-event-row${on ? " chp-event-row--on" : ""}${joined ? " chp-event-row--joined" : ""}">
          <span class="chp-event-ico">${ev.icon}</span>
          <span class="chp-event-main">
            <span class="chp-event-name">${esc(ev.name)}</span>
            <span class="chp-event-date">${ev.from[0]}/${ev.from[1]} 〜 ${ev.to[0]}/${ev.to[1]}</span>
          </span>
          <span class="chp-event-state">${on ? "開催中" : joined ? "参加ずみ" : "—"}</span>
        </div>`;
      }).join("")}
    </div>
    <div class="chp-mission-note">イベント期間中は、お部屋に季節の飾りがつき、イベントガチャで限定の家具・衣装・背景が手に入ります。</div>`;
}

function talkHTML(){
  const list = chappyTalkLog();
  if(!list.length) return `<div class="chp-empty">まだ会話の記録がありません。<br>チャッピーハウスをひらくと少しずつたまります。</div>`;
  return `<div class="chp-talk-list">
    ${list.map(t => `
      <div class="chp-talk-row">
        <span class="chp-talk-bubble">${esc(t.text)}</span>
        <span class="chp-talk-date">${fmtDate(t.ts)}</span>
      </div>`).join("")}
  </div>`;
}
