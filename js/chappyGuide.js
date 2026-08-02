/* =========================================================================
   チャッピーハウス：遊び方・ルールガイド
   ========================================================================= */
import { playTapSound } from './audio.js';
import { getChappy, chappyMissionSummary, chappyStats } from './chappy.js';
import { iconHTML } from './icons.js';

function esc(value){
  return String(value == null ? "" : value).replace(/[&<>"']/g, char => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));
}

function recommendedAction(){
  const state = getChappy();
  const stats = chappyStats(state);
  const missions = chappyMissionSummary();
  if(missions.claimable > 0) return { title: "ミッション報酬を受け取ろう", detail: `${missions.claimable}件のごほうびを受け取れます。`, action: "mission" };
  if(stats.hunger <= 35) return { title: "ごはんをあげよう", detail: "おなかが減っています。ごはんで元気を回復できます。" };
  if(stats.clean <= 35) return { title: "お世話をしよう", detail: "せいけつが下がっています。おふろやブラッシングがおすすめです。" };
  if(stats.sleep <= 35) return { title: "ゆっくり休ませよう", detail: "睡眠が少なめです。時間をおくと生活リズムが進みます。" };
  if(state.coins >= 120) return { title: "所持品を増やそう", detail: "コインがたまっています。ショップやガチャを確認してみましょう。", action: "inventory" };
  return { title: "現実の活動を1つ進めよう", detail: "学習・タスク・ニュース閲覧が経験値とコインにつながります。" };
}

const STEPS = [
  { icon: "check", title: "現実の活動を進める", text: "学習、タスク完了、予定、ニュースなど、アプリ内で実際に行ったことが経験値やコインになります。" },
  { icon: "heart", title: "まるチャピをお世話する", text: "ごはん、なでる、お世話で状態を整えます。状態はゆっくり下がりますが、所持品や経験値は失われません。" },
  { icon: "target", title: "ミッション報酬を受け取る", text: "毎日のミッションを達成したら、報酬ボタンを押してコイン・経験値・ガチャ券を受け取ります。" },
  { icon: "folder", title: "集めて飾る", text: "ショップやガチャで手に入れた品は「所持品」で確認できます。衣装は着せ替え、家具や内装は模様がえで使います。" },
];

const STAT_RULES = [
  ["げんき", "活動しやすさの目安"], ["おなか", "ごはんで回復"], ["なかよし", "なでる・お世話で上昇"],
  ["せいけつ", "おふろなどで回復"], ["すいみん", "時間帯や休息の目安"], ["たのしさ", "遊び・模様がえで上昇"],
];

export function openChappyGuide({ onOpenInventory, onOpenMissions } = {}){
  const overlay = document.createElement("div");
  const next = recommendedAction();
  overlay.className = "modal-ov chp-sheet-ov";
  overlay.innerHTML = `<div class="chp-sheet" role="dialog" aria-modal="true" aria-label="チャッピーハウスの遊び方">
    <div class="chp-sheet-grip" aria-hidden="true"></div>
    <div class="chp-sheet-head">
      <span class="chp-sheet-title chp-sheet-title--icon">${iconHTML("help")} 遊び方・ルール</span>
      <button type="button" class="chp-sheet-x" aria-label="閉じる">×</button>
    </div>
    <div class="chp-sheet-body">
      <section class="chp-guide-hero">
        <span class="chp-guide-hero-icon" aria-hidden="true">${iconHTML("home")}</span>
        <span><b>現実でがんばるほど、まるチャピが育つ</b><small>毎日の活動 → 報酬 → お世話・コレクション、という流れです。</small></span>
      </section>

      <section class="chp-guide-next">
        <span class="chp-guide-next-label">いまのおすすめ</span>
        <b>${esc(next.title)}</b>
        <p>${esc(next.detail)}</p>
        ${next.action ? `<button type="button" class="chp-guide-next-btn" data-chp-guide-action="${next.action}">${next.action === "mission" ? "ミッションを見る" : "所持品を見る"}</button>` : ""}
      </section>

      <div class="chp-guide-section-title">基本の4ステップ</div>
      <ol class="chp-guide-steps">
        ${STEPS.map((step, index) => `<li>
          <span class="chp-guide-step-no">${index + 1}</span>
          <span class="chp-guide-step-icon" aria-hidden="true">${iconHTML(step.icon)}</span>
          <span><b>${esc(step.title)}</b><small>${esc(step.text)}</small></span>
        </li>`).join("")}
      </ol>

      <div class="chp-guide-section-title">状態の見方</div>
      <dl class="chp-guide-stats">
        ${STAT_RULES.map(([name, text]) => `<div><dt>${esc(name)}</dt><dd>${esc(text)}</dd></div>`).join("")}
      </dl>

      <section class="chp-guide-rules">
        <div>${iconHTML("coins")}<span><b>コイン</b><small>ショップ購入やガチャに使います。</small></span></div>
        <div>${iconHTML("ticket")}<span><b>ガチャ券</b><small>対応するガチャを1回まわせます。</small></span></div>
        <div>${iconHTML("clock")}<span><b>1日の上限</b><small>同じ行動の報酬には上限があります。翌日にリセットされます。</small></span></div>
        <div>${iconHTML("shield")}<span><b>失わないもの</b><small>経験値・レベル・コイン・所持品は放置しても減りません。</small></span></div>
      </section>

      <div class="chp-guide-actions">
        <button type="button" data-chp-guide-action="inventory">${iconHTML("folder")} 所持品を見る</button>
        <button type="button" data-chp-guide-action="mission">${iconHTML("target")} ミッションを見る</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.querySelector(".chp-sheet")?.classList.add("chp-sheet-show"));

  const close = () => { try{ overlay.remove(); }catch(e){} };
  overlay.querySelector(".chp-sheet-x").onclick = () => { playTapSound(); close(); };
  overlay.querySelectorAll("[data-chp-guide-action]").forEach(button => button.onclick = () => {
    playTapSound();
    const action = button.dataset.chpGuideAction;
    close();
    if(action === "inventory" && onOpenInventory) onOpenInventory();
    if(action === "mission" && onOpenMissions) onOpenMissions();
  });
}
