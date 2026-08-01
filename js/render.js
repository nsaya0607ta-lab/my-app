import { CERTS } from './data/certs.js';
import { DC_PHASES, L, REGIONS } from './data/constants.js';
import { CONCEPTS, DRAW, PASS, Q, TIERS, applySkin, certById, certStat, commit, correctSet, dcCount, dcPhase, dcTitle, esc, exportCode, fmt, getBP, getProfileName, grade, importCode, isAdminAccount, isMarked, isMulti, loadHist, loadMarked, loadReviewStats, loadTapSound, loadUiTheme, loadWrong, overallLevel, overallStat, pick, pts, publishLeaderboard, purchaseSkin, questionsForCommand, saveCoins, saveGeminiPlainText, saveTapSound, saveToCloud, saveUiTheme, selectCert, setBP, setProfileName, skinHandleIdentityChange, stars, start, startCommandPractice, startMarkedPractice, startReview, toggleMarked, totalBP } from './core.js';
import { LPIC1_COMMANDS } from './data/lpic1-commands.js';
import { LPIC1_DIR_FS } from './data/lpic1-directory-explorer.js';
import { DIRX_SEVERITY_META } from './data/dirx-events.js';
import { DIRX_SCENARIOS } from './data/dirx-scenarios.js';
import {
  dirxActiveIncident, dirxActiveMission,
  dirxAdvanceTime, dirxChooseCause, dirxChooseFix, dirxEndIncident,
  dirxEndMission, dirxEventHistory, dirxExplorationExp, dirxFindTargetForPath,
  dirxGetClock, dirxGetSettings, dirxGetSystemStatus, dirxHandleIdentityChange,
  dirxIncidentElapsedMinutes, dirxIncidentSummary, dirxIncidentTerminalLog, dirxIsInvestigated,
  dirxListMissions, dirxListScenarios,
  dirxMarkAllEventsRead, dirxMarkEventRead, dirxMarkEventResolved, dirxMarkInvestigated,
  dirxOnEvent, dirxRevealIncidentHint, dirxRevealMissionHint, dirxRunIncidentCommand,
  dirxSetSettings, dirxStartIncident, dirxStartMission, dirxSubmitMissionAnswer,
  dirxUnreadCount, startAutoTimerIfNeeded, stopAutoTimer,
} from './dirxStore.js';
import { aiDailyUpdateCheck, aiOverallComment, aiShortComment, getAiRecommendations } from './reviewAI.js';
import { addReviewAnswers, addReviewQuestions, answersAsBulletText, applyReviewAnswersEdit, applyReviewQuestionsEdit, clearAllReviewItems, deleteReviewAnswer, deleteReviewQuestion, findReviewAnswer, loadActiveReviewQuestions, loadMasteredReviewQuestions, onReviewBoardChange, questionsAsBulletText, setReviewQuestionMastered } from './reviewBoard.js';
import { getWeather } from './weather.js';
import { geminiChat, sendGeminiMessage, setGeminiScheduleHandler, setGeminiHomeContextProvider, setGeminiStockContextProvider, pushGeminiMessage } from './gemini.js';
import { SKIN_DATA } from './data/skins.js';
import { UI_THEME_DATA } from './data/uithemes.js';
import { TAP_SOUND_DATA } from './data/tapsounds.js';
import { playTapSound } from './audio.js';
import { notifyDailySummary, notifyDirxEvent, notifyScheduleCreated, notifyScheduleDeleted } from './notifications.js';
import { S, state } from './state.js';
import { chappyHandleIdentityChange, chappyOnNewsOpened, chappyOnStocksViewed, chappyOnTaskCompleted, isChappyHomeWidgetVisible } from './chappy.js';
import { chappyMiniWidgetHTML, chappyMiniWeatherHint, renderChappyScreen } from './chappyScreen.js';
import { mpActiveBoardId, mpAddLink, mpAddNote, mpApplyCloud, mpBoardChain, mpBoardMeta, mpClearAll, mpCreateBoard, mpDeleteBoard, mpDeleteNote, mpGetState, mpGroupNotes, mpHandleIdentityChange, mpListBoards, mpRandomColor, mpRemoveLink, mpRenameBoard, mpSuggestKeywords, mpSwitchBoard, mpTotalBoardCount, mpUpdateNote } from './mindpalette.js';
import { renderIntroQuizScreen } from './introQuiz.js';
import * as VoiceprintManager from './voiceprint/VoiceprintManager.js';
import { checkNewsQuizPopup } from './newsQuiz.js';
import { pgOnCloudRestored, renderPlaygroundScreen } from './playground/screen.js';
import { pgApplyCloud, pgHandleIdentityChange } from './playground/cloudSync.js';
import { renderScenarioScreen } from './playground/scenarios/scenarioScreen.js';
import { scenarioModeApplyCloud, scenarioModeHandleIdentityChange } from './playground/scenarios/progressStore.js';
import { applyCustomButtonColors, isLongPressSuppressed, wireButtonColorLongPress } from './buttonColors.js';
import {
  refreshScheduleViews, renderScheduleCalendar, renderScheduleHome,
  scheduleCalendarCardHTML, scheduleHomeCardHTML,
  syncNow as scheduleSyncNow, todayOccurrences,
} from './schedule/index.js';
import {
  deleteOccurrence as scheduleDeleteOccurrence, deleteSchedule as scheduleDeleteSchedule,
  getSchedule as scheduleGetSchedule, setOccurrenceOverride as scheduleSetOccurrenceOverride,
  tasksForDate as scheduleTasksForDate, upsertSchedule as scheduleUpsert,
} from './schedule/store.js';
import { occurrencesForDate as scheduleOccurrencesForDate } from './schedule/occurrences.js';
import { buildRRule as scheduleBuildRRule, presetToSpec as schedulePresetToSpec } from './schedule/recurrence.js';
import { fetchNewsCategory, getNewsCategoryState, todaysNewsForCategory } from './news.js';
import { renderLightPuzzleScreen } from './lightpuzzle/screen.js';
import { lightPuzzleHandleIdentityChange } from './lightpuzzle/store.js';
import { renderBpScreen } from './bp/screen.js';
import { bpHandleIdentityChange, bpOnNewsRead } from './bp/store.js';
import { bpDailyCheck, bpDailyResetToken } from './bp/daily.js';
import './bp/toast.js';
import { renderValueGameScreen, valueGameHandleIdentityChange, valueGameOnScreenLeft } from './valuegame/screen.js';
import { abortScreenTransition, captureScreenTransition, playScreenTransition } from './screenTransition.js';
import { closePopupMenu } from './popupMenu.js';

export const app = document.getElementById("app");

// 「総合ランク」バーは、タップするとBPの詳細（BPミッション）画面へ移動する。
// 以前はここで「次のレベルまであと◯BP」の吹き出しを出していたが、同じ情報は
// 遷移先の画面にもっと詳しく載るため、吹き出しは廃止した。

// 「資格を選ぶ」画面・ホーム（select）画面はどちらも特定の資格に紐づかない
// 全体ビューのため、遷移するたびに選択中の資格をクリアする。これにより、
// 個別資格の画面（AZ-900など）から資格一覧へ「戻る」際に、前の資格の
// ランク表示が残ってしまうバグを防ぐ（ステータスバーの再描画は
// S.cert の値を見て個別資格行の要否を判断しているため）。
// 探索ミッション／時間経過・イベント／障害対応モードの画面一覧。
// この一覧に含まれる画面を表示している間だけ、疑似Linuxの時間の自動進行
// タイマーを動かす（無関係な資格の画面を見ている間はイベント通知を出さない）。
const DIRX_SCREENS = ["lpic-dir-explorer", "lpic-dirx-missions", "lpic-dirx-incidents", "lpic-dirx-events"];
const DIRX_SCENARIOS_ORDER = DIRX_SCENARIOS.map(s=>s.id);

export function go(s){
  // 画面を離れるときは、開きっぱなしのポップアップメニューを必ず閉じる
  // （次の画面の上に前の画面のメニューが残らないようにする）
  closePopupMenu();
  // 🃏 価値観ゲームから別の画面へ移るときは、ボイスチャットのマイクを必ず解放する
  if(S.screen === "valuegame" && s !== "valuegame") valueGameOnScreenLeft();
  if(s === "certs" || s === "lpic-certs" || s === "select") S.cert = null;
  // ホームへ戻ったら、Gemini相談画面の「戻る」先の記憶もリセットする
  // （次にGeminiへ入るのがFABなど別の入口であれば、通常どおりホームへ戻せるように）
  if(s === "select") S.geminiReturnScreen = null;
  S.screen = s;
  if(DIRX_SCREENS.includes(s)) startAutoTimerIfNeeded(); else stopAutoTimer();
  render();
}

// 個別資格の画面（home/quiz/result等）から「← 資格選択」で戻る先。
// 選択中の資格がLPIC系ならLPICの資格一覧へ、それ以外はMicrosoftの資格一覧へ戻す。
function certsBackTarget(){
  const c = S.cert ? certById(S.cert) : null;
  return (c && c.vendor === "lpic") ? "lpic-certs" : "certs";
}

// 認証前・ユーザー名未設定などプレイヤーが確定していない「ゲート画面」の判定。
// ステータスバー・下部ナビ・画面遷移アニメーションの要否をこれ1つで揃える
function isGatedScreen(){
  return (!state.guestMode && !state.authReady)
      || (!state.guestMode && !state.currentUser)
      || (!state.guestMode && state.currentUser && (!state.profileChecked || !getProfileName()));
}

// 最上段の共通ステータスバー：render()のたびに最新化。表示する画面ごとに
// レイアウトが変わる（左に縦積みのランク行、右にAC。.statusbarがalign-items:
// centerのflexコンテナのため、AC表示は左側の行数（1行/2行）の高さに応じて
// 自動的に縦中央へ揃う）。
//   ・ホーム（select）／資格一覧（certs）画面 … 総合ランクのみ1行＋AC
//   ・AZ-900などの個別資格の画面（home/quiz/result等） … 総合ランク＋個別
//     資格ランクの2段＋AC（右側は2行分の高さに揃って縦中央）
//   ・ランキング／プロフィール／設定などその他の画面 … 完全に非表示
// go()側でselect/certsへ遷移するたびにS.certをクリアしているため、
// 個別資格の画面から資格一覧に戻った直後は自動的に1行表示へ切り替わる。
export function renderStatusBar(){
  const el=document.getElementById("statusbar"); if(!el) return;
  // 認証前・ユーザー名未設定などプレイヤーが確定していない画面では非表示
  const gated = isGatedScreen();
  const screen = resolveScreen();
  // BP詳細（bp）と価値観ゲーム（valuegame）は、画面内に総合ランク・BPや
  // ゲーム専用のヘッダーを持つため、共通ステータスバーは重ねて出さない
  const otherScreens = ["ranking","profile","settings","skins","analytics","portfolio","holdings","news-japan","news-world","news-detail","calendar","gemini","gemini-edit-event","mind-palette","mind-palette-folders","playground","scenario","chappy","bp","valuegame"];
  if(gated || otherScreens.includes(screen)){ el.classList.remove("show"); el.innerHTML=""; return; }
  const ov = overallStat();          // 総合Lvと次Lvまでの進捗(%)
  const coins = (S.coins||0);

  // 個別資格の画面（select/certs以外）でのみ、総合ランクの下に個別資格ランクを追加する
  let certRow = "";
  if(screen !== "select" && screen !== "certs" && screen !== "lpic-certs" && S.cert){
    const c = certById(S.cert) || {};
    const bp = getBP();
    const lvl = dcCount(bp);
    const next = TIERS.find(t=>t.bp>bp);
    let cpct;
    if(next){ const prevBp = lvl>0 ? TIERS[lvl-1].bp : 0; cpct = Math.max(0, Math.min(100, Math.round((bp-prevBp)/(next.bp-prevBp)*100))); }
    else cpct = 100;
    const curName = lvl>0 ? (TIERS[lvl-1].icon+" "+TIERS[lvl-1].name) : "スタート";
    const certTitle = next ? `${curName} → ${next.icon} ${next.name}（あと ${(next.bp-bp).toLocaleString()} BP）` : "全リソース稼働";
    certRow = `
      <div class="sb-line">
        <span class="sb-lab sb-lab-cert">${esc(c.code||"選択資格")} Lv.<b>${lvl}</b></span>
        <span class="sb-prog" title="${esc(certTitle)}"><span class="sb-prog-f cert" style="width:${cpct}%"></span></span>
      </div>`;
  }

  el.innerHTML = `
    <div class="sb-levels">
      <div class="sb-line sb-line-overall" role="button" tabindex="0" aria-label="BPミッションを開く" title="タップでBPミッションを開く">
        <span class="sb-lab">総合ランク Lv.<b>${ov.lv}</b></span>
        <span class="sb-prog"><span class="sb-prog-f overall" style="width:${ov.pct}%"></span></span>
      </div>
      ${certRow}
    </div>
    <span class="sb-div"></span>
    <span class="sb-coin">💰 <b>${coins.toLocaleString()}</b> AC</span>
  `;
  el.classList.add("show");

  // 総合ランクのバーをタップ（クリック）すると、BPの詳細（BPミッション）画面へ移動する。
  // 以前はここで「次のレベルまで」の吹き出しを出していたが、同じ情報は
  // 遷移先の画面にもっと詳しく載るため、遷移だけを行う
  const overallLine = el.querySelector(".sb-line-overall");
  if(overallLine){
    const open = (e) => { e.stopPropagation(); go("bp"); };
    overallLine.onclick = open;
    overallLine.onkeydown = (e) => { if(e.key === "Enter" || e.key === " ") open(e); };
  }
}

// S.screen の値だけでは実際に描画される画面と食い違うことがある
// （例：資格未選択だと screen="home" でも実際は renderSelect が表示される。
// render()末尾の分岐と同じ優先順位で判定する）ため、ヘッダー周りの表示制御は
// この「実際に描画される画面名」を使って判断する。
function resolveScreen(){
  const noCertScreens = ["ranking","profile","settings","skins","analytics","certs","lpic-certs","portfolio","news-japan","news-world","news-detail","calendar","gemini","gemini-edit-event","mind-palette","mind-palette-folders","introquiz","playground","scenario","chappy","bp","valuegame"];
  if(noCertScreens.includes(S.screen)) return S.screen;
  if(S.screen==="select" || !S.cert) return "select";
  return S.screen; // home/quiz/result/review/dict/transfer/history
}

// ヘッダーのランキング／プロフィール丸型ボタンは「資格を選ぶ」画面と
// 資格ごとのホーム画面でのみ表示する。各画面側で明示的に表示・非表示を指定する。
function updateHeaderNav(show){
  const nav = document.querySelector(".top-nav");
  if(nav) nav.style.display = show ? "" : "none";
}

// ヘッダーのメインタイトル・見出しブロックを状態に応じて切り替える：
// ホーム（select）画面では見出し自体を非表示にし、ステータスバーが最上段に
// ピタッと収まるミニマルなレイアウトにする。資格選択中はその資格コード
// （AZ-900 など）、それ以外の画面（ランキング等）では「ホーム」を表示する。
function updateHeaderTitle(){
  const topEl = document.querySelector(".top");
  const titleEl = document.querySelector("h1.title");
  if(!topEl || !titleEl) return;
  const screen = resolveScreen();
  // 🃏 価値観ゲームは画面内に専用のヘッダー（戻る・ラウンド・ライフ）を持つ
  // フルスクリーンのゲーム画面なので、共通の見出しは出さず縦幅を譲る
  if(screen === "select" || screen === "certs" || screen === "lpic-certs" || screen === "valuegame"){
    topEl.style.display = "none";
    return;
  }
  topEl.style.display = "";
  const c = S.cert ? certById(S.cert) : null;
  // 資格選択中は、隠していた見出し枠にバッジを出す（ランキング/プロフアイコン
  // 横の空白を埋める）。資格未選択の画面では従来通り「ホーム」を表示。
  titleEl.style.display = "";
  titleEl.classList.toggle("title--badge", !!c);
  if(c) titleEl.innerHTML = `<span class="cert-badge">${esc(c.code)}</span>`;
  else titleEl.textContent = "ホーム";
  topEl.classList.toggle("top--notitle", !!c);
}

// 画面下部の固定ナビゲーション：ログイン前後のゲート画面（読み込み中／認証／
// ユーザー名未設定）では非表示にし、それ以外では現在の画面に対応するタブへ
// .active を付け替える。個々の資格の各画面（home/quiz/result等）はまとめて
// 「ホーム」タブ扱いにし、それ以外の画面（ランキング／プロフィール等）は
// 「その他」タブへフォールバックさせる。カレンダー画面は各種機能シートと
// カレンダータブのどちらから開いても同じ「カレンダー」タブをアクティブにする。
const BNAV_TAB_BY_SCREEN = {
  select:"select",
  home:"select", "lpic-commands":"select", quiz:"select", result:"select", review:"select", dict:"select", transfer:"select", history:"select", "lpic-dir-explorer":"select", "review-list":"select",
  "lpic-dirx-missions":"select", "lpic-dirx-incidents":"select", "lpic-dirx-events":"select",
  certs:"study-menu", "lpic-certs":"study-menu", playground:"study-menu", scenario:"study-menu",
  "news-japan":"quick-menu", "news-world":"quick-menu", "news-detail":"quick-menu", portfolio:"quick-menu", holdings:"quick-menu", introquiz:"quick-menu", lightpuzzle:"quick-menu",
  valuegame:"quick-menu",
  chappy:"select",
  bp:"select",
  calendar:"calendar",
};
function updateBottomNav(){
  const nav = document.getElementById("bottom-nav");
  if(!nav) return;
  const gated = isGatedScreen();
  nav.classList.toggle("show", !gated);
  if(gated) return;
  const active = BNAV_TAB_BY_SCREEN[resolveScreen()] || "profile";
  nav.querySelectorAll(".bnav-btn").forEach(b => b.classList.toggle("active", b.dataset.nav === active));
}

// ⚙️ 設定モーダルの「スキン設定」で選んだUIテーマ（配色）を <body data-theme="..."> へ
// 反映する。購入制のスキン（sb-theme-*クラス）とは独立した仕組みで、render()の
// たびに呼ぶほか、モーダル内でテーマを選んだ直後にも即時反映のため呼び出す
function applyUiTheme(){
  document.body.setAttribute("data-theme", S.uiTheme || "default");
}

/* 画面遷移アニメーションの単位となる「今どの画面を描いているか」のキー。
   同じ画面の再描画（選択肢のタップ・クラウド同期など）ではキーが変わらないため
   演出は起きず、実際に画面が切り替わったときだけモーフィング遷移が走る */
function transitionKey(){
  if(isGatedScreen()) return "gate";
  return resolveScreen() + "|" + (S.cert || "");
}

/* 画面描画の入口。
   描画の直前に旧画面を凍結レイヤーへ退避し（captureScreenTransition）、
   描画の直後にスクロール位置の確定とモーフィング演出を行う（playScreenTransition）。
   renderScreen() 自体は従来どおり同期的に #app を作り直す。

   スクロール位置の扱いは、この関数と js/screenTransition.js の2か所だけに
   集約してある（各画面のrender関数はスクロールに一切触らない）。
   ・画面が実際に切り替わったとき … 進む＝先頭／戻る＝元の位置（screenTransition）
   ・同じ画面の描き直し（クラウド同期・株価更新・BP加算などのデータ更新）
     … 直前の位置をそのまま保つ。#appを作り直す際に内容が一瞬短くなって
       ブラウザ側でスクロールが詰められることがあるため、ここで元へ戻す */
export function render(){
  const stx = captureScreenTransition(transitionKey());
  // 画面が切り替わらない再描画のときだけ、いまのスクロール位置を控えておく
  const keepY = stx ? null : (window.scrollY || window.pageYOffset || 0);
  try{
    renderScreen();
  }catch(e){
    abortScreenTransition(stx);   // 描画に失敗しても画面が空のままにならないよう旧画面を戻す
    throw e;
  }
  playScreenTransition(stx);
  if(keepY){
    const nowY = window.scrollY || window.pageYOffset || 0;
    if(Math.abs(nowY - keepY) > 1){
      try{ window.scrollTo(0, keepY); }catch(e){}
    }
  }
}

function renderScreen(){
  gcalHandleIdentityChange(); // ログインユーザーの切替を検知し、前の人のGoogle連携状態を破棄
  skinHandleIdentityChange(); // ログインユーザーの切替を検知し、前の人のスキン状態を読み直す
  chappyHandleIdentityChange(); // ログインユーザーの切替を検知し、チャッピーハウスの育成データを読み直す
  mpHandleIdentityChange();   // ログインユーザーの切替を検知し、マインド・パレットのキャンバスを読み直す
  scenarioModeHandleIdentityChange(); // ログインユーザーの切替を検知し、シナリオモードの進捗を読み直す
  pgHandleIdentityChange();   // ログインユーザーの切替を検知し、Linuxプレイグラウンドの状態を読み直す
  dirxHandleIdentityChange(); // ログインユーザーの切替を検知し、探索ミッション/障害対応の進捗を読み直す
  lightPuzzleHandleIdentityChange(); // ログインユーザーの切替を検知し、ライト消しパズルの進捗を読み直す
  // ログインユーザーの切替を検知し、活動BPの台帳を読み直す。実際に
  // 切り替わったときだけ、日次ボーナスの判定済みフラグもリセットする
  if(bpHandleIdentityChange()) bpDailyResetToken();
  valueGameHandleIdentityChange(); // ログインユーザーの切替を検知し、価値観ゲームの戦績を読み直す
  renderStatusBar();   // 画面が変わっても常に最新の Lv/BP/AC を反映
  updateHeaderNav(false); // デフォルトは非表示。表示すべき画面側で個別に true にする
  updateHeaderTitle();
  updateBottomNav();
  // 🎨 アプリ全体の背景スキンを body に適用（default のときは元の背景のまま）
  const sk = S.currentSkin || "default";
  document.body.className = (sk && sk!=="default") ? ("sb-theme-"+sk) : "";
  // ⚙️ 設定＞スキン設定のUIテーマ（配色）を body に適用
  applyUiTheme();
  // アカウントの認証ゲート（ゲストモードならスキップ）
  if(!state.guestMode && !state.authReady) return renderLoading();
  if(!state.guestMode && !state.currentUser) return renderAuth();
  // ログイン済みでユーザー名が未設定なら、必ずユーザー名設定画面へ
  if(!state.guestMode && state.currentUser){
    if(!state.profileChecked) return renderLoading();
    if(!getProfileName()) return renderUsername();
  }
  // 🎖️ ここまで来た＝どのユーザーとしてアプリを使うかが確定した時点。
  // 当日のログインボーナス・週次の達成率ボーナスをここで判定する
  // （内部で1日1回・60秒間隔にスロットリングされている）
  bpDailyCheck();
  // 資格選択なしでも開ける画面
  if(S.screen==="ranking") return renderRanking();
  if(S.screen==="profile") return renderProfile();
  if(S.screen==="settings") return renderSettings();
  if(S.screen==="skins") return renderSkinShop();
  if(S.screen==="analytics") return renderAnalytics();
  if(S.screen==="certs") return renderCertList();
  if(S.screen==="lpic-certs") return renderLpicList();
  if(S.screen==="portfolio") return renderPortfolio();
  if(S.screen==="holdings") return renderHoldings();
  if(S.screen==="news-japan") return renderNewsJapan();
  if(S.screen==="news-world") return renderNewsWorld();
  if(S.screen==="news-detail") return renderNewsDetail();
  if(S.screen==="calendar") return renderCalendarScreen();
  if(S.screen==="mind-palette") return renderMindPalette();
  if(S.screen==="mind-palette-folders") return renderMindPaletteFolders();
  if(S.screen==="gemini") return renderGeminiChat();
  if(S.screen==="gemini-edit-event") return renderGeminiEditEvent();
  if(S.screen==="introquiz") return renderIntroQuizScreen();
  if(S.screen==="playground") return renderPlaygroundScreen();
  if(S.screen==="scenario") return renderScenarioScreen();
  if(S.screen==="chappy") return renderChappyScreen();
  if(S.screen==="lightpuzzle") return renderLightPuzzleScreen();
  if(S.screen==="bp") return renderBpScreen();
  if(S.screen==="valuegame") return renderValueGameScreen();
  // 大元：資格選択画面
  if(S.screen==="select" || !S.cert) return renderSelect();
  if(S.screen==="home") return renderHome();
  if(S.screen==="review-list") return renderReviewList();
  if(S.screen==="lpic-commands") return renderLpicCommands();
  if(S.screen==="lpic-dir-explorer") return renderDirExplorer();
  if(S.screen==="lpic-dirx-missions") return renderDirxMissions();
  if(S.screen==="lpic-dirx-incidents") return renderDirxIncidents();
  if(S.screen==="lpic-dirx-events") return renderDirxEvents();
  if(S.screen==="quiz") return renderQuiz();
  if(S.screen==="result") return renderResult();
  if(S.screen==="review") return renderReview();
  if(S.screen==="dict") return renderDict();
  if(S.screen==="transfer") return renderTransfer();
  if(S.screen==="history") return renderHistory();
}

export function renderLoading(){
  app.innerHTML = `<div class="loading">読み込み中…<br>
    <button class="link" id="ld-guest" style="margin-top:16px">アカウントなしで使う（この端末のみ）</button></div>`;
  const g=document.getElementById("ld-guest"); if(g)g.onclick=()=>{ state.guestMode=true; S.screen="home"; render(); };
}

export function authErrorMsg(e){
  const c=(e&&(e.code||e.message))||"";
  if(c.indexOf("email-already-in-use")>=0) return "このメールアドレスは既に登録されています。「ログイン」に切り替えてください。";
  if(c.indexOf("invalid-email")>=0) return "メールアドレスの形式が正しくありません。";
  if(c.indexOf("weak-password")>=0) return "パスワードは6文字以上にしてください。";
  if(c.indexOf("wrong-password")>=0 || c.indexOf("invalid-credential")>=0) return "メールアドレスまたはパスワードが違います。";
  if(c.indexOf("user-not-found")>=0) return "アカウントが見つかりません。新規登録してください。";
  if(c.indexOf("too-many-requests")>=0) return "試行回数が多すぎます。少し時間をおいて再度お試しください。";
  if(c.indexOf("operation-not-allowed")>=0) return "メール認証が有効化されていません（Firebaseの設定が必要です）。";
  if(c.indexOf("network")>=0) return "通信エラーです。ネット接続を確認してください。";
  return "エラー: " + ((e&&e.message)||c||"不明");
}

export function renderAuth(){
  const signup = state.authMode==="signup";
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-title">${signup?"アカウント作成":"ログイン"}</div>
      <div class="auth-sub">${signup
        ? "メールとパスワードでアカウントを作成すると、スコア・BP・復習データがアカウントに保存され、機種変更やアプリの更新後もログインすれば引き継げます。"
        : "登録済みのメールアドレスとパスワードでログインしてください。"}</div>
      <input id="auth-email" class="auth-input" type="email" placeholder="メールアドレス" autocomplete="email" inputmode="email">
      <input id="auth-pw" class="auth-input" type="password" placeholder="パスワード（6文字以上）" autocomplete="${signup?"new-password":"current-password"}">
      <div id="auth-msg" class="auth-msg"></div>
      <button class="cta" id="auth-go" style="margin-top:4px">${signup?"アカウントを作成":"ログイン"}</button>
      <button class="ghost" id="auth-switch">${signup?"すでにアカウントをお持ちの方はログイン":"新規登録はこちら"}</button>
      <button class="link" id="auth-guest">アカウントなしで使う（この端末のみ・同期なし）</button>
    </div>
  `;
  const emailEl=document.getElementById("auth-email");
  const pwEl=document.getElementById("auth-pw");
  const msg=document.getElementById("auth-msg");
  document.getElementById("auth-switch").onclick=()=>{ state.authMode = signup?"login":"signup"; render(); };
  document.getElementById("auth-guest").onclick=()=>{ state.guestMode=true; S.screen="home"; render(); };
  document.getElementById("auth-go").onclick=async ()=>{
    if(state.authBusy) return;
    const email=(emailEl.value||"").trim(), pw=pwEl.value||"";
    if(!email || !pw){ msg.style.color="var(--gold)"; msg.textContent="メールアドレスとパスワードを入力してください。"; return; }
    if(!window.Auth){ msg.style.color="var(--bad)"; msg.textContent="認証の準備中です。少し待って再度お試しください。"; return; }
    state.authBusy=true; msg.style.color="var(--muted)"; msg.textContent="処理中…";
    try{
      if(signup) await window.Auth.signup(email,pw);
      else await window.Auth.login(email,pw);
      // 成功すると onAuthStateChanged が発火し、自動でホームへ切り替わります
    }catch(e){
      msg.style.color="var(--bad)"; msg.textContent=authErrorMsg(e);
    }finally{ state.authBusy=false; }
  };
}

export async function logout(){
  try{ if(window.Auth) await window.Auth.logout(); }catch(e){}
  // 別の人のデータが残らないよう、全資格のローカルデータを消去（クラウドには残っています）
  try{
    CERTS.forEach(c=>{
      localStorage.removeItem("cert_"+c.id+"_bp");
      localStorage.removeItem("cert_"+c.id+"_wrong");
      localStorage.removeItem("cert_"+c.id+"_marked");
      localStorage.removeItem("cert_"+c.id+"_history");
    });
    localStorage.removeItem("profile_name");
    localStorage.removeItem("coins");
  }catch(e){}
  state.cloudData=null; state.currentUser=null; state.currentUserId=null; state.profileChecked=false; S.coins=0;
  S.cert=null; S.screen="select"; state.authMode="login"; render();
}

// 退会：認証アカウントと個人データを削除し、ローカルを消去してログイン画面へ

export async function deleteAccount(password){
  if(!window.Account) { const e=new Error("not-ready"); e.code="not-ready"; throw e; }
  await window.Account.delete(password);   // 再認証→個人データ削除→認証削除（失敗時は例外）
  // この端末のローカルデータを消去（集計qstatsはサーバー側で保持）
  try{
    CERTS.forEach(c=>{
      localStorage.removeItem("cert_"+c.id+"_bp");
      localStorage.removeItem("cert_"+c.id+"_wrong");
      localStorage.removeItem("cert_"+c.id+"_marked");
      localStorage.removeItem("cert_"+c.id+"_history");
    });
    localStorage.removeItem("profile_name");
    localStorage.removeItem("coins");
  }catch(e){}
  // 認証削除で onAuthStateChanged(null) が発火しログイン画面へ遷移するが、保険で状態も初期化
  state.cloudData=null; state.currentUser=null; state.currentUserId=null; state.profileChecked=false; state.guestMode=false; S.coins=0;
  S.cert=null; S.screen="select"; state.authMode="login"; render();
}

// 退会の確認モーダル（パスワード再入力＋最終確認）

export function openDeleteModal(){
  if(state.guestMode || !state.currentUser) return;
  const ov=document.createElement("div");
  ov.className="modal-ov";
  ov.innerHTML=`
    <div class="modal">
      <div class="modal-title">⚠️ アカウントを削除（退会）</div>
      <div class="modal-body">本当に削除しますか？<b>この操作は取り消せません。</b><br>アカウント情報・スコア・履歴・ランキング登録がすべて削除されます。<br><br>確認のため、パスワードを入力してください。</div>
      <input type="password" id="del-pw" class="auth-input" placeholder="パスワード" autocomplete="current-password">
      <div id="del-msg" class="auth-msg"></div>
      <button class="cta danger-solid" id="del-go">削除を実行する</button>
      <button class="ghost" id="del-cancel" style="margin-top:8px">キャンセル</button>
    </div>`;
  document.body.appendChild(ov);
  const close=()=>{ try{ ov.remove(); }catch(e){} };
  const msg=ov.querySelector("#del-msg");
  ov.querySelector("#del-cancel").onclick=close;
  ov.addEventListener("click",(e)=>{ if(e.target===ov) close(); });
  ov.querySelector("#del-go").onclick=async ()=>{
    const pw=(ov.querySelector("#del-pw").value||"");
    if(!pw){ msg.style.color="var(--gold)"; msg.textContent="パスワードを入力してください。"; return; }
    msg.style.color="var(--muted)"; msg.textContent="削除処理中…";
    ov.querySelector("#del-go").disabled=true;
    try{
      await deleteAccount(pw);
      close();   // 成功後はログイン画面へ遷移済み
    }catch(e){
      const code=(e&&e.code)||"";
      let t="削除に失敗しました。時間をおいて再度お試しください。";
      if(code.indexOf("wrong-password")>=0 || code.indexOf("invalid-credential")>=0) t="パスワードが正しくありません。";
      else if(code.indexOf("too-many-requests")>=0) t="試行回数が多すぎます。しばらくしてから再度お試しください。";
      else if(code.indexOf("network")>=0) t="通信エラーです。接続を確認してください。";
      else if(code==="no-user") t="ログイン状態を確認できません。再ログインしてからお試しください。";
      msg.style.color="var(--bad)"; msg.textContent=t;
      ov.querySelector("#del-go").disabled=false;
    }
  };
}

// アカウント作成直後など、ユーザー名が未設定のときに表示（空欄不可・重複不可）

export function renderUsername(){
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-title">ユーザー名を設定</div>
      <div class="auth-sub">ランキングに表示される名前です。他の人と重複しない名前を入力してください（後からプロフィールで変更できます）。</div>
      <input id="un-name" class="auth-input" maxlength="16" placeholder="例：くらうど太郎" autocomplete="off">
      <div id="un-msg" class="auth-msg"></div>
      <button class="cta" id="un-go">この名前で決定</button>
    </div>
  `;
  const nameEl=document.getElementById("un-name");
  const msg=document.getElementById("un-msg");
  document.getElementById("un-go").onclick=async ()=>{
    const v=(nameEl.value||"").trim();
    if(!v){ msg.style.color="var(--gold)"; msg.textContent="ユーザー名を入力してください（空にはできません）。"; return; }
    if(!window.LB){ msg.style.color="var(--bad)"; msg.textContent="準備中です。少し待って再度お試しください。"; return; }
    msg.style.color="var(--muted)"; msg.textContent="重複を確認中…";
    try{
      const taken = await window.LB.nameTaken(v);
      if(taken){ msg.style.color="var(--bad)"; msg.textContent="その名前はすでに使われています。別の名前にしてください。"; return; }
      setProfileName(v);
      publishLeaderboard();        // ユーザー名でランキングへ登録
      S.screen="select"; render(); // ユーザー名設定後、資格選択へ
    }catch(e){
      msg.style.color="var(--bad)"; msg.textContent="確認に失敗しました。通信環境を確認して再度お試しください。";
    }
  };
}

// ホーム画面下部の4モードボタン用アイコン（洗練されたラインアート）
const MENU_ICON_PRACTICE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="11" height="16" rx="2.2"></rect><path d="M8.3 3.4h4.4a1 1 0 0 1 1 1V5h-6.4v-.6a1 1 0 0 1 1-1Z"></path><path d="M8 10h5M8 13h3.3"></path><path d="M14.6 14.4 18.9 10l1.6 1.6-4.3 4.3h-1.6v-1.5Z"></path></svg>`;
const MENU_ICON_EXAM = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2h5"></path><path d="M12 2v3"></path><circle cx="12" cy="13.5" r="8"></circle><circle cx="12" cy="13.5" r="4"></circle><circle cx="12" cy="13.5" r="1"></circle><path d="m18.2 7.3 1.4-1.4"></path></svg>`;
const MENU_ICON_REVIEW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path stroke-width="1.4" opacity=".55" d="M12 5.6C10.3 4.3 7.9 3.8 5.5 4.2a1 1 0 0 0-.8 1v13.2a1 1 0 0 0 1.2 1c2-.4 4-.1 5.5 1a.7.7 0 0 0 1.2 0c1.5-1.1 3.5-1.4 5.5-1a1 1 0 0 0 1.2-1V5.2a1 1 0 0 0-.8-1c-2.4-.4-4.8.1-6.5 1.4Z"></path><path stroke-width="1.4" opacity=".55" d="M12 5.6v14"></path><path stroke-width="2.1" d="M15.6 10.3a4 4 0 1 0 1 4.4"></path><path stroke-width="2.1" d="m16.3 8.7.3 2.2-2.2-.3"></path></svg>`;
const MENU_ICON_DICT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5.6C10.3 4.3 7.9 3.8 5.5 4.2a1 1 0 0 0-.8 1v13.2a1 1 0 0 0 1.2 1c2-.4 4-.1 5.5 1a.7.7 0 0 0 1.2 0c1.5-1.1 3.5-1.4 5.5-1a1 1 0 0 0 1.2-1V5.2a1 1 0 0 0-.8-1c-2.4-.4-4.8.1-6.5 1.4Z"></path><path d="M12 5.6v14"></path><text x="6.8" y="13.2" font-size="5.2" font-weight="800" stroke="none" fill="currentColor">A</text><text x="14" y="13.2" font-size="5.2" font-weight="800" stroke="none" fill="currentColor">Z</text></svg>`;
const MENU_ICON_MARKED = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3.5h10a1 1 0 0 1 1 1V20l-6-3.7L6 20V4.5a1 1 0 0 1 1-1Z"></path><path d="M9.3 9h5.4"></path><path d="M12 6.3v5.4"></path></svg>`;
// 「ディレクトリを触って学ぶ」ボタン用アイコン（フォルダ＋展開の階層を表現）
const MENU_ICON_DIRX = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 6.2a1 1 0 0 1 1-1h4.4l1.6 1.9h8a1 1 0 0 1 1 1V17a1 1 0 0 1-1 1h-14a1 1 0 0 1-1-1V6.2Z"></path><path d="M7.5 12.3h4.4M7.5 15h6.6" opacity=".7"></path></svg>`;
// 「探索ミッション」ボタン用アイコン（コンパス）
const MENU_ICON_MISSION = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.3"></circle><path d="m14.6 9.4-1.7 4.8-4.8 1.7 1.7-4.8Z"></path></svg>`;
// 「復習掲示板」見出し用アイコン（ピン留めされた掲示板）。絵文字を使わない
// 指定のため、他の見出しアイコンと同じ線画SVGで統一する
const REVBOARD_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5.5" width="16" height="14" rx="2"></rect><path d="M8 9.3h8M8 12.6h8M8 15.9h5"></path><circle cx="17.3" cy="6.7" r="1.6" fill="currentColor" stroke="none"></circle></svg>`;
// 「障害対応」ボタン用アイコン（レンチ）
const MENU_ICON_INCIDENT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M15.3 4.5a4 4 0 0 0-5.2 4.9L4.6 14.9a1.7 1.7 0 0 0 2.4 2.4l5.5-5.5a4 4 0 0 0 4.9-5.2l-2.6 2.6-2-.6-.6-2Z"></path></svg>`;

/* ===== 🧠 AIおすすめ復習：ホーム画面に表示するコンパクトカード =====
   スコア計算・データ保存は js/reviewAI.js（アプリ内計算。生成AIは使わない）。
   コマンド別の問題プール（cmd付きExtraQ）がある資格＝LPIC-1でのみ表示する。
   ホームには「短い一言＋星別の件数バッジ＋開くボタン」だけを置き、
   コマンド一覧・理由などの詳細はボトムシート（openAiReviewSheet）で表示する */
function aiReviewSectionHTML(){
  if(S.cert!=="lpic1") return "";
  aiDailyUpdateCheck(S.cert);                    // 日付が変わっていたらスコアを自動再計算
  const recs = getAiRecommendations(S.cert);     // 表示のたびに最新スコアへ自動更新
  const comment = aiShortComment(recs);
  // 星別の件数バッジ（★5〜★3のみ。それ未満はまとめて「その他」）
  const levels = [5,4,3].map(n=>({n, count:recs.filter(r=>r.starsN===n).length})).filter(x=>x.count>0);
  const others = recs.length - levels.reduce((s,x)=>s+x.count,0);
  const badges = levels.map(x=>`<span class="airec-badge"><span class="airec-badge-stars">${"★".repeat(x.n)}</span>${x.count}件</span>`).join("")
    + (others>0 ? `<span class="airec-badge airec-badge--other">その他 ${others}件</span>` : "");
  return `
    <div class="airec-wrap airec-wrap--compact">
      <div class="airec-compact-head">
        <span class="airec-head-ico">🧠</span>
        <span class="airec-ttl">AIおすすめ復習</span>
      </div>
      <div class="airec-compact-comment">${esc(comment)}</div>
      ${recs.length ? `
      <div class="airec-badges">${badges}</div>
      <button class="airec-open-btn" data-airec-open>おすすめ復習を見る <span class="airec-open-arw">▶</span></button>` : ``}
    </div>`;
}

/* ============ 📋 復習掲示板 ============
   LPIC-1ホーム画面（学習メニューより上）に置く、ユーザー自身が番号付き
   箇条書きで登録した「問題」と「解答」を、先頭の番号だけで対応付けて
   1件ずつ表示するカード。文章の内容による判定やアプリ内Geminiによる
   回答生成は一切行わない。登録内容はjs/reviewBoard.js経由でログイン
   ユーザーごとにlocalStorageへ保存されるので再読み込みしても消えない。
   ・自動切り替え（自動スクロール）は行わない。前へ／次への手動操作のみ
   ・rb：現在の表示位置（idx）・回答表示中かを保持するモジュール変数。
     renderHome()が何度呼ばれてもこの状態自体はリセットされない
   ・問題にチェックを付けると「覚えた」扱いとなり、掲示板の出題対象から
     外れて下の復習リストカードに移る（js/reviewBoard.jsのmasteredフラグ） */
const rb = { idx: 0, answerShown: false };

function rbClampIdx(items){
  if(!items.length){ rb.idx = 0; return; }
  if(rb.idx > items.length - 1) rb.idx = items.length - 1;
  if(rb.idx < 0) rb.idx = 0;
}

function rbAnswerAreaHTML(question){
  if(!rb.answerShown){
    return `<button type="button" class="revboard-reveal-btn" data-rb-reveal>回答を見る</button>`;
  }
  const ans = findReviewAnswer(question.number);
  if(ans && ans.text){
    return `
      <div class="revboard-a-lab">回答：</div>
      <div class="revboard-a-text">${esc(ans.text)}</div>
      <button type="button" class="revboard-reveal-btn revboard-hide-btn" data-rb-hide>回答を隠す</button>`;
  }
  return `
    <div class="revboard-a-missing">この問題の解答はまだ登録されていません</div>
    <button type="button" class="revboard-reveal-btn revboard-hide-btn" data-rb-hide>回答を隠す</button>`;
}

function rbToolbarHTML(){
  return `
    <div class="revboard-toolbar">
      <button type="button" class="revboard-reg-btn" data-rb-add-q>問題を登録</button>
      <button type="button" class="revboard-reg-btn revboard-reg-btn--a" data-rb-add-a>解答を登録</button>
    </div>`;
}

function rbManageControlsHTML(hasCurrent){
  return `
    <div class="revboard-controls2">
      <button type="button" class="revboard-link-btn" data-rb-edit-q>問題を編集</button>
      <button type="button" class="revboard-link-btn" data-rb-edit-a>解答を編集</button>
      ${hasCurrent ? `
      <button type="button" class="revboard-link-btn" data-rb-delete-q>この問題を削除</button>
      <button type="button" class="revboard-link-btn" data-rb-delete-a>この解答を削除</button>` : ``}
      <button type="button" class="revboard-link-btn revboard-link-btn--danger" data-rb-clear-all>すべて削除</button>
    </div>`;
}

function rbCardInnerHTML(){
  const items = loadActiveReviewQuestions();
  rbClampIdx(items);

  if(!items.length){
    return `
      <div class="revboard-head">
        <span class="revboard-head-ico">${REVBOARD_ICON}</span>
        <span class="revboard-ttl">復習掲示板</span>
      </div>
      ${rbToolbarHTML()}
      <div class="revboard-empty">
        <div class="revboard-empty-msg">まだ問題が登録されていません</div>
      </div>
      ${rbManageControlsHTML(false)}`;
  }

  const it = items[rb.idx];
  return `
    <div class="revboard-head">
      <span class="revboard-head-ico">${REVBOARD_ICON}</span>
      <span class="revboard-ttl">復習掲示板</span>
    </div>
    ${rbToolbarHTML()}
    <div class="revboard-counter">${rb.idx+1} / ${items.length}</div>
    <div class="revboard-qnum">問題番号：${it.number}</div>
    <div class="revboard-slide-outer">
      <div class="revboard-slide-inner">
        <label class="revboard-q-row">
          <input type="checkbox" data-rb-mastered>
          <span class="revboard-q-text">${esc(it.text)}</span>
        </label>
        <div class="revboard-answer-area">${rbAnswerAreaHTML(it)}</div>
      </div>
    </div>
    <div class="revboard-controls">
      <button type="button" class="revboard-ctrl-btn" data-rb-prev>‹ 前へ</button>
      <button type="button" class="revboard-ctrl-btn" data-rb-next>次へ ›</button>
    </div>
    ${rbManageControlsHTML(true)}`;
}

function reviewBoardSectionHTML(){
  if(S.cert !== "lpic1") return "";
  return `<div class="revboard-wrap" id="revboard-card">${rbCardInnerHTML()}</div>`;
}

// カード部分だけを再描画する（ホーム画面全体は作り直さない）。
// data-rb-*の配線もこの中でやり直す
function refreshReviewBoardCard(){
  const root = document.getElementById("revboard-card");
  if(!root) return;
  root.innerHTML = rbCardInnerHTML();
  wireReviewBoardCard();
}

function rbNavigate(delta){
  const items = loadActiveReviewQuestions();
  if(!items.length) return;
  rb.idx = (rb.idx + delta + items.length) % items.length;
  rb.answerShown = false;
  refreshReviewBoardCard();
}

function wireReviewBoardCard(){
  const root = document.getElementById("revboard-card");
  if(!root) return;

  const addQBtn = root.querySelector("[data-rb-add-q]");
  if(addQBtn) addQBtn.onclick = () => openReviewBoardSheet("add-question");
  const addABtn = root.querySelector("[data-rb-add-a]");
  if(addABtn) addABtn.onclick = () => openReviewBoardSheet("add-answer");
  const editQBtn = root.querySelector("[data-rb-edit-q]");
  if(editQBtn) editQBtn.onclick = () => openReviewBoardSheet("edit-question");
  const editABtn = root.querySelector("[data-rb-edit-a]");
  if(editABtn) editABtn.onclick = () => openReviewBoardSheet("edit-answer");

  const prevBtn = root.querySelector("[data-rb-prev]");
  if(prevBtn) prevBtn.onclick = () => rbNavigate(-1);
  const nextBtn = root.querySelector("[data-rb-next]");
  if(nextBtn) nextBtn.onclick = () => rbNavigate(1);

  const masteredChk = root.querySelector("[data-rb-mastered]");
  if(masteredChk) masteredChk.onchange = () => {
    const items = loadActiveReviewQuestions();
    const it = items[rb.idx];
    if(!it) return;
    setReviewQuestionMastered(it.number, true);
    rb.answerShown = false;
  };

  const revealBtn = root.querySelector("[data-rb-reveal]");
  if(revealBtn) revealBtn.onclick = () => { rb.answerShown = true; refreshReviewBoardCard(); };
  const hideBtn = root.querySelector("[data-rb-hide]");
  if(hideBtn) hideBtn.onclick = () => { rb.answerShown = false; refreshReviewBoardCard(); };

  const delQBtn = root.querySelector("[data-rb-delete-q]");
  if(delQBtn) delQBtn.onclick = () => {
    const items = loadActiveReviewQuestions();
    const it = items[rb.idx];
    if(!it) return;
    if(!confirm(`問題番号${it.number}を削除しますか？`)) return;
    deleteReviewQuestion(it.number);
    rb.answerShown = false;
  };

  const delABtn = root.querySelector("[data-rb-delete-a]");
  if(delABtn) delABtn.onclick = () => {
    const items = loadActiveReviewQuestions();
    const it = items[rb.idx];
    if(!it) return;
    if(!findReviewAnswer(it.number)){ alert("この問題の解答はまだ登録されていません"); return; }
    if(!confirm(`問題番号${it.number}の解答を削除しますか？`)) return;
    deleteReviewAnswer(it.number);
  };

  const clearBtn = root.querySelector("[data-rb-clear-all]");
  if(clearBtn) clearBtn.onclick = () => {
    if(!confirm("復習掲示板の問題と解答をすべて削除しますか？この操作は取り消せません。")) return;
    clearAllReviewItems();
    rb.idx = 0; rb.answerShown = false;
  };
}

/* ============ ✅ 復習リスト ============
   復習掲示板でチェックを付けた（覚えた）問題の一覧。掲示板の出題対象
   からは外れるが、専用画面（review-list）でここのチェックを外せば
   また掲示板に出るようになる。ホーム画面には遷移用ボタンのみを置く */
function revListCardInnerHTML(){
  const items = loadMasteredReviewQuestions();
  return `
    <div class="revlist-head">
      <span class="revlist-ttl">復習リスト</span>
      ${items.length ? `<span class="revlist-badge">${items.length}</span>` : ``}
    </div>
    <div class="revlist-sub">${items.length ? `チェック済み ${items.length} 問` : "チェック済みの問題はまだありません"}</div>
    <span class="revlist-chevron">›</span>`;
}

function reviewListSectionHTML(){
  if(S.cert !== "lpic1") return "";
  return `<button type="button" class="revlist-wrap" id="revlist-card" data-go="review-list">${revListCardInnerHTML()}</button>`;
}

function refreshReviewListCard(){
  const root = document.getElementById("revlist-card");
  if(!root) return;
  root.innerHTML = revListCardInnerHTML();
}

// 「復習リスト」ボタンから遷移する専用画面：チェック済み（覚えた）問題の一覧
export function renderReviewList(){
  updateHeaderNav(false);
  const items = loadMasteredReviewQuestions();
  app.innerHTML = `
    <div class="q-head"><button class="quit" data-go="home">← ホームへ戻る</button><span class="q-count">復習リスト</span></div>
    ${items.length ? `
      <div class="revlist-items">
        ${items.map(it => `
          <label class="revlist-item">
            <input type="checkbox" checked data-rl-uncheck="${it.number}">
            <span class="revlist-item-num">${it.number}</span>
            <span class="revlist-item-text">${esc(it.text)}</span>
          </label>`).join("")}
      </div>` : `<div class="revlist-empty">チェック済みの問題はまだありません</div>`}
  `;
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  app.querySelectorAll("[data-rl-uncheck]").forEach(chk => {
    chk.onchange = () => {
      const number = parseInt(chk.getAttribute("data-rl-uncheck"), 10);
      setReviewQuestionMastered(number, false);
      renderReviewList();
    };
  });
}

// js/reviewBoard.js側での追加/削除/編集/チェックのたびに呼ばれ、表示中で
// あればカードだけを再描画する（他画面表示中は#revboard-card等が存在
// しないため何もしない）
onReviewBoardChange(refreshReviewBoardCard);
onReviewBoardChange(refreshReviewListCard);

// 問題・解答それぞれの登録／一括編集用の設定。既存のairec/各種メニューと
// 同じ.sheet-ov/.bottom-sheet基盤（下スワイプで閉じる・背景タップで閉じる）
// を使い、登録は追加（既存の番号は上書き）・編集は全件差し替えとして扱う
const RB_SHEET_CONFIG = {
  "add-question": {
    title: "問題を登録",
    hint: "1行につき1問です。先頭に番号を付けてください（例：「1.」「1」「1:」「1：」）。空行は無視されます。",
    placeholder: "例：\n1. Ctrl＋Zは何をする操作か\n2. bgコマンドは何をするか\n3. dfとduの違いは何か\n4. rpm -qlは何を表示するか",
    getInitial: () => "",
    save: addReviewQuestions,
    saveLabel: "登録",
  },
  "add-answer": {
    title: "解答を登録",
    hint: "1行につき1つの解答です。対応する問題と同じ番号を先頭に付けてください。空行は無視されます。",
    placeholder: "例：\n1. Ctrl＋Zは、実行中のジョブを一時停止します。\n2. bgは、停止中のジョブをバックグラウンドで再開します。\n3. dfはファイルシステム全体、duはファイルやディレクトリ単位の使用量を確認します。\n4. rpm -qlは、パッケージに含まれるファイル一覧を表示します。",
    getInitial: () => "",
    save: addReviewAnswers,
    saveLabel: "登録",
  },
  "edit-question": {
    title: "問題を編集",
    hint: "登録済みの問題です。番号や内容を書き換えて保存してください。番号を変更すると、変更後の番号で解答と対応付けられます。",
    placeholder: "",
    getInitial: questionsAsBulletText,
    save: applyReviewQuestionsEdit,
    saveLabel: "保存",
  },
  "edit-answer": {
    title: "解答を編集",
    hint: "登録済みの解答です。番号や内容を書き換えて保存してください。番号を変更すると、変更後の番号で問題と対応付けられます。",
    placeholder: "",
    getInitial: answersAsBulletText,
    save: applyReviewAnswersEdit,
    saveLabel: "保存",
  },
};

function openReviewBoardSheet(mode){
  const cfg = RB_SHEET_CONFIG[mode];
  const initialText = cfg.getInitial();

  lockBodyScrollForSheet();
  const ov = document.createElement("div");
  ov.className = "sheet-ov";
  ov.innerHTML = `
    <div class="bottom-sheet revboard-sheet">
      <div class="bottom-sheet-drag-handle">
        <div class="bottom-sheet-handle"></div>
        <div class="bottom-sheet-title">${cfg.title}</div>
      </div>
      <div class="bottom-sheet-list revboard-sheet-body">
        <div class="revboard-sheet-hint">${cfg.hint}</div>
        <div class="revboard-sheet-error" id="revboard-sheet-error" hidden></div>
        <textarea class="revboard-textarea" id="revboard-textarea" placeholder="${cfg.placeholder}">${esc(initialText)}</textarea>
        <div class="revboard-sheet-actions">
          <button type="button" class="revboard-sheet-cancel" data-rb-sheet-cancel>キャンセル</button>
          <button type="button" class="revboard-sheet-save" data-rb-sheet-save>${cfg.saveLabel}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if(e.target === ov) closeSheet(ov); });
  const touchGuard = createSheetTouchGuard(ov);
  ov.addEventListener("touchstart", touchGuard.onTouchStart, { passive: true });
  ov.addEventListener("touchmove", touchGuard.onTouchMove, { passive: false });
  const sheet = ov.querySelector(".bottom-sheet");
  attachSheetDragHandlers(ov, sheet);
  requestAnimationFrame(() => {
    ov.classList.add("sheet-ov-show");
    sheet.classList.add("bottom-sheet-show");
  });

  ov.querySelector("[data-rb-sheet-cancel]").onclick = () => closeSheet(ov);
  ov.querySelector("[data-rb-sheet-save]").onclick = () => {
    const text = ov.querySelector("#revboard-textarea").value;
    const result = cfg.save(text);
    if(result && result.ok === false && result.duplicates && result.duplicates.length){
      const errBox = ov.querySelector("#revboard-sheet-error");
      errBox.textContent = `番号が重複しています（${result.duplicates.join("、")}）。番号を修正してから保存してください。`;
      errBox.hidden = false;
      return;
    }
    rb.answerShown = false;
    closeSheet(ov);
    render();
  };

  setTimeout(() => { const ta = ov.querySelector("#revboard-textarea"); if(ta) ta.focus(); }, 60);
}

export function renderHome(){
  updateHeaderNav(true);
  const h=loadHist();
  const ov=overallStat();

  // 統計データの集計
  const examHistory = h.filter(x => x.mode === "exam");
  const examPlays = examHistory.length;
  const examBest = examPlays > 0 ? examHistory.reduce((m, x) => Math.max(m, x.score), 0) : 0;
  const examAvg = examPlays > 0 ? Math.round(examHistory.reduce((s, x) => s + x.score, 0) / examPlays) : 0;

  const practiceHistory = h.filter(x => x.mode === "practice");
  const practiceQuestions = practiceHistory.reduce((s, x) => s + (x.total || 0), 0);
  const practiceCorrect = practiceHistory.reduce((s, x) => s + (x.correct || 0), 0);
  const practiceAccuracy = practiceQuestions > 0 ? Math.round(practiceCorrect / practiceQuestions * 100) : 0;

  // ダッシュボード用の視覚化パラメータ
  const MILESTONES = [10,25,50,100,200,300,500,1000,2000,5000];
  const nextGoal = MILESTONES.find(m => m > practiceQuestions) ?? (Math.ceil((practiceQuestions+1)/5000)*5000);
  const prevGoal = MILESTONES[MILESTONES.indexOf(nextGoal)-1] || 0;
  const goalPct = practiceQuestions > 0 ? Math.min(100, Math.round((practiceQuestions-prevGoal)/(nextGoal-prevGoal)*100)) : 0;

  const RING_R = 38, RING_C = 2*Math.PI*RING_R;
  const ringRatio = practiceQuestions > 0 ? practiceAccuracy/100 : 0;
  const ringOffset = RING_C * (1-ringRatio);
  const accClass = practiceAccuracy>=80 ? "good" : (practiceAccuracy>=60 ? "warn" : "bad");

  const examDots = Math.min(examPlays, 6);
  const examOverflow = examPlays > 6 ? examPlays-6 : 0;

  const bestPct = Math.min(100, examBest/1000*100);
  const avgPct = Math.min(100, examAvg/1000*100);
  const passPct = PASS/1000*100;

  app.innerHTML = `
    <div class="q-head" style="margin-bottom:10px">
      <button class="quit" data-go="${certsBackTarget()}">← 資格選択</button>
    </div>

    ${reviewBoardSectionHTML()}
    ${reviewListSectionHTML()}

    <div class="stats-dash">
      <div class="stats-dash-head">
        <span class="stats-dash-ico">📊</span>
        <div>
          <div class="stats-dash-ttl">学習統計ダッシュボード</div>
          <div class="stats-dash-sub">これまでの学習の積み重ね</div>
        </div>
      </div>
      <div class="stats-grid">

        <div class="stat-tile stat-tile--practice">
          <div class="stat-tile-top"><span class="stat-tile-ico">📚</span><span class="stat-tile-lab">演習した問題数</span></div>
          <div class="stat-tile-num">${practiceQuestions}<small>問</small></div>
          <div class="stat-tile-meter"><div class="stat-tile-meter-fill" data-final-width="${goalPct}"></div></div>
          <div class="stat-tile-sub">${practiceQuestions>0 ? `次の目標 ${nextGoal}問まで あと${nextGoal-practiceQuestions}問` : "演習を始めて記録をつけよう！"}</div>
        </div>

        <div class="stat-tile stat-tile--accuracy">
          <div class="stat-tile-top"><span class="stat-tile-ico">🎯</span><span class="stat-tile-lab">演習の正答率</span></div>
          <div class="ring-wrap">
            <svg viewBox="0 0 100 100" class="ring">
              <circle cx="50" cy="50" r="${RING_R}" class="ring-bg"></circle>
              <circle cx="50" cy="50" r="${RING_R}" class="ring-fg ${accClass}" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}" data-final-offset="${ringOffset}" transform="rotate(-90 50 50)"></circle>
            </svg>
            <div class="ring-mid">${practiceQuestions>0 ? `${practiceAccuracy}<small>%</small>` : "―"}</div>
          </div>
        </div>

        <div class="stat-tile stat-tile--exam">
          <div class="stat-tile-top"><span class="stat-tile-ico">🏆</span><span class="stat-tile-lab">試験実施回数</span></div>
          <div class="stat-tile-num">${examPlays}<small>回</small></div>
          <div class="stat-tile-dots">
            ${Array.from({length:6}, (_,i)=>`<span class="stat-dot${i<examDots?" on":""}"></span>`).join("")}${examOverflow>0?`<span class="stat-dot-more">+${examOverflow}</span>`:""}
          </div>
          <div class="stat-tile-sub">${examPlays>0 ? "挑戦を重ねてスコアを伸ばそう" : "初挑戦でスコアを記録しよう！"}</div>
        </div>

        <div class="stat-tile stat-tile--score">
          <div class="stat-tile-top"><span class="stat-tile-ico">📈</span><span class="stat-tile-lab">最高点 / 平均点</span></div>
          ${examPlays>0 ? `
          <div class="score-bars">
            <div class="score-bar-row">
              <span class="score-bar-tag best">BEST</span>
              <div class="score-bar-track"><div class="score-bar-fill best" data-final-width="${bestPct}"></div><div class="score-passline" style="left:${passPct}%"></div></div>
              <span class="score-bar-val">${examBest}</span>
            </div>
            <div class="score-bar-row">
              <span class="score-bar-tag avg">AVG</span>
              <div class="score-bar-track"><div class="score-bar-fill avg" data-final-width="${avgPct}"></div><div class="score-passline" style="left:${passPct}%"></div></div>
              <span class="score-bar-val">${examAvg}</span>
            </div>
            <div class="score-bar-passlab">合格ライン ${PASS}点</div>
          </div>` : `<div class="stat-tile-empty">まだ受験記録がありません</div>`}
        </div>

      </div>
    </div>

    ${aiReviewSectionHTML()}

    ${state.practicePick ? `
    <div class="pcount-wrap" style="margin-top:16px">
      <div class="pcount-lab">📝 演習モード・問題数を選択</div>
      <div class="pcount">
        <button class="pcount-btn" data-pc="5">5問</button>
        <button class="pcount-btn" data-pc="10">10問</button>
        <button class="pcount-btn" data-pc="15">15問</button>
      </div>
      <button class="link" data-pcancel>キャンセル</button>
    </div>` : ``}

    <div class="menu-stack" style="margin-top:${state.practicePick ? "12" : "18"}px">
      ${!state.practicePick ? `
      <button class="menu-btn menu-btn--practice" data-practice>
        <span class="menu-btn-icon">${MENU_ICON_PRACTICE}</span>
        <span class="menu-btn-text"><span class="menu-btn-label">演習モード</span></span>
        <span class="menu-btn-chevron">›</span>
      </button>` : ``}

      <button class="menu-btn menu-btn--exam" data-mode="exam">
        <span class="menu-btn-icon">${MENU_ICON_EXAM}</span>
        <span class="menu-btn-text"><span class="menu-btn-label">試験モード</span></span>
        <span class="menu-btn-chevron">›</span>
      </button>

      ${(loadWrong().length)?`
      <button class="menu-btn menu-btn--review" data-review>
        <span class="menu-btn-icon-wrap">
          <span class="menu-btn-icon">${MENU_ICON_REVIEW}</span>
          <span class="menu-btn-badge">${loadWrong().length}</span>
        </span>
        <span class="menu-btn-text"><span class="menu-btn-label">復習モード（間違えた ${loadWrong().length} 問）</span></span>
        <span class="menu-btn-chevron">›</span>
      </button>`:`<div class="x-hint" style="margin:0;text-align:center">復習モード：間違えた問題がここに溜まり、再挑戦できます</div>`}

      ${(loadMarked().length)?`
      <button class="menu-btn menu-btn--marked" data-marked>
        <span class="menu-btn-icon-wrap">
          <span class="menu-btn-icon">${MENU_ICON_MARKED}</span>
          <span class="menu-btn-badge">${loadMarked().length}</span>
        </span>
        <span class="menu-btn-text"><span class="menu-btn-label">後で見直す（🔖 ${loadMarked().length} 問）</span></span>
        <span class="menu-btn-chevron">›</span>
      </button>`:``}

      <button class="menu-btn menu-btn--dict" data-go="dict">
        <span class="menu-btn-icon">${MENU_ICON_DICT}</span>
        <span class="menu-btn-text"><span class="menu-btn-label">用語辞典</span></span>
        <span class="menu-btn-chevron">›</span>
      </button>

      ${S.cert==="lpic1" ? `
      <button class="menu-btn menu-btn--dirx" data-go="lpic-dir-explorer">
        <span class="menu-btn-icon">${MENU_ICON_DIRX}</span>
        <span class="menu-btn-text"><span class="menu-btn-label">ディレクトリを触って学ぶ</span></span>
        <span class="menu-btn-chevron">›</span>
      </button>
      <button class="menu-btn menu-btn--mission" data-go="lpic-dirx-missions">
        <span class="menu-btn-icon">${MENU_ICON_MISSION}</span>
        <span class="menu-btn-text"><span class="menu-btn-label">探索ミッション</span><span class="menu-btn-sub">${dirxListMissions().filter(x=>x.completed).length} / ${dirxListMissions().length} クリア</span></span>
        <span class="menu-btn-chevron">›</span>
      </button>
      <button class="menu-btn menu-btn--incident" data-go="lpic-dirx-incidents">
        <span class="menu-btn-icon">${MENU_ICON_INCIDENT}</span>
        <span class="menu-btn-text"><span class="menu-btn-label">障害対応</span><span class="menu-btn-sub">${dirxListScenarios().filter(x=>x.completed).length} / ${dirxListScenarios().length} クリア</span></span>
        <span class="menu-btn-chevron">›</span>
      </button>` : ``}
    </div>
    ${h.length?`<button class="link" data-go="history">スコア履歴を見る（${h.length}件）</button>`:
      `<div class="install">ヒント：ブラウザの共有メニューから「ホーム画面に追加」すると、アプリのように起動できます。</div>`}
    ${state.currentUser
      ? `<div class="acct-bar"> ${esc(state.currentUser.email||"ログイン中")}<button class="link2" data-logout>ログアウト</button></div>`
      : (state.guestMode ? `<div class="acct-bar">ゲストモード（この端末のみ・同期なし）<button class="link2" data-login>ログイン / 新規登録</button></div>` : "")}
  `;
  requestAnimationFrame(()=>{
    app.querySelectorAll(".ring-fg[data-final-offset]").forEach(el=>{ el.style.strokeDashoffset = el.dataset.finalOffset; });
    app.querySelectorAll("[data-final-width]").forEach(el=>{ el.style.width = el.dataset.finalWidth+"%"; });
  });
  app.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>start(b.dataset.mode));
  const prn=app.querySelector("[data-practice]"); if(prn)prn.onclick=()=>{
    if(S.cert==="lpic1"){ go("lpic-commands"); } else { state.practicePick=true; render(); }
  };
  const pcn=app.querySelector("[data-pcancel]"); if(pcn)pcn.onclick=()=>{ state.practicePick=false; render(); };
  app.querySelectorAll("[data-pc]").forEach(b=>b.onclick=()=>start("practice", +b.dataset.pc));
  const rv=app.querySelector("[data-review]"); if(rv)rv.onclick=()=>startReview();
  const mkd=app.querySelector("[data-marked]"); if(mkd)mkd.onclick=()=>startMarkedPractice();
  // 🧠 AIおすすめ復習：「おすすめ復習を見る」でボトムシートを開く
  const ao=app.querySelector("[data-airec-open]"); if(ao)ao.onclick=()=>openAiReviewSheet();
  // 📋 復習掲示板：ホームカードのボタン配線（✅ 復習リストは専用画面へのボタンのみ）
  if(S.cert==="lpic1"){ wireReviewBoardCard(); }
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  const lo=app.querySelector("[data-logout]"); if(lo)lo.onclick=()=>logout();
  const li=app.querySelector("[data-login]"); if(li)li.onclick=()=>{ state.guestMode=false; state.authMode="login"; render(); };
}

/* ======================= LPIC：コマンド別学習画面 ======================= */
// 「演習」ボタンから遷移する、Linuxコマンドを選んで学習できる画面。
// カードを選ぶとそのコマンドにタグ付けされた問題だけで演習（practiceモード）を開始する。

export function renderLpicCommands(){
  updateHeaderNav(true);
  const wrongSet = new Set(loadWrong());
  const categories = [];
  LPIC1_COMMANDS.forEach(c=>{
    let group = categories.find(g=>g.name===c.category);
    if(!group){ group = {name:c.category, cmds:[]}; categories.push(group); }
    group.cmds.push(c);
  });
  const sections = categories.map(g=>`
    <div class="cmd-cat">${esc(g.name)}</div>
    <div class="cmd-grid">
      ${g.cmds.map(c=>{
        const pool = questionsForCommand(c.key);
        const weak = pool.some(q=>wrongSet.has(q.id));
        return `<button class="cmd-card${weak?" weak":""}" data-cmd="${esc(c.key)}">
          <span class="cmd-card-name">${esc(c.label)}</span>
          <span class="cmd-card-desc">${esc(c.desc)}</span>
          <span class="cmd-card-count">${pool.length}問${weak?" ・ 復習あり":""}</span>
        </button>`;
      }).join("")}
    </div>`).join("");
  app.innerHTML = `
    <div class="q-head" style="margin-bottom:14px">
      <button class="quit" data-go="home">← ホームへ戻る</button>
    </div>
    <div class="sel-head">
      <span class="eyebrow">LPIC-1 演習モード</span>
    </div>

    <div class="pcount-wrap" style="margin-top:0">
      <div class="pcount-lab">ランダム演習</div>
      <div class="pcount">
        <button class="pcount-btn" data-pc="5">5問</button>
        <button class="pcount-btn" data-pc="10">10問</button>
        <button class="pcount-btn" data-pc="15">15問</button>
      </div>
    </div>
　　　<h2 class="sel-title">コマンドを選んで演習</h2>
    <div class="x-hint" style="margin:14px 0">またはコマンドを選ぶと、そのコマンドに関する問題だけで演習を開始します。正解した問題の配点分だけがスコア・EXPに加算されます。</div>
    ${sections}
  `;
  app.querySelectorAll("[data-cmd]").forEach(b=>b.onclick=()=>startCommandPractice(b.dataset.cmd));
  app.querySelectorAll("[data-pc]").forEach(b=>b.onclick=()=>start("practice", +b.dataset.pc));
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
}

/* ======================= 🗂 ディレクトリを触って学ぶ（LPIC-1 FHS探検） =======================
   実際のパソコンのフォルダ画面のような操作感で、Linuxのディレクトリ構造
   （FHS）を学べる学習用サンドボックス画面。データはすべて
   data/lpic1-directory-explorer.js の疑似ファイルシステム（LPIC1_DIR_FS）
   から読み取るだけで、実OSのファイルには一切アクセスしない。

   状態はプレイグラウンド（playgroundState.js）と同様にモジュールスコープで
   保持し、他の画面へ移動して戻ってきても続きから再開できるようにする。 */
let dirxPath = [];                 // 現在地（ルートからのセグメント配列。例：["etc","ssh"]）
let dirxBackStack = [];            // 戻る履歴
let dirxForwardStack = [];         // 進む履歴
let dirxSelected = null;           // 中央一覧で選択中の子要素名
let dirxExpanded = new Set([""]);  // ツリーで展開中のパス（""はルート直下）
let dirxTreeOpen = false;          // 狭い画面でのツリー（左ペイン）ドロワー開閉
let dirxSheetEl = null;            // 現在開いている詳細ボトムシートのDOM
let dirxSelectTimer = null;        // デスクトップ：クリック直後に詳細シートを開くまでの遅延タイマー（dblclickとの衝突回避用）
let dirxMissionCardCollapsed = false;   // 「探索中」固定カードの折りたたみ状態
let dirxIncidentCardCollapsed = false;  // 「障害対応中」固定カードの折りたたみ状態

/* ---- ⏱ 疑似Linux内時間・イベント：バックグラウンドで発生した通知をトーストで表示する ----
   dirxStore.js側は状態管理のみでDOMに一切触れないため、通知の見た目（トースト）と
   「調査する」タップ時の画面遷移はここ（render.js）で購読して行う。 */
dirxOnEvent((ev) => {
  notifyDirxEvent(ev.message, ev.severity, ev.relatedPath ? () => {
    dirxMarkEventRead(ev.id);
    go("lpic-dir-explorer");
    dirxNavigateTo(ev.relatedPath);
  } : () => { dirxMarkEventRead(ev.id); });
  dirxPatchTimebar();
});

// 現在画面に表示中のコンパクト時計/状態バーだけを、画面全体を再描画せずに更新する
// （バックグラウンドの自動イベントで、探索中の画面がいきなり作り直されて操作の
// 邪魔にならないようにするため）
function dirxPatchTimebar(){
  const clockEl = document.getElementById("dirx-clock-label");
  if(!clockEl) return; // 現在dirx系の画面が表示されていない
  clockEl.textContent = dirxGetClock().label;
  const status = dirxGetSystemStatus();
  const statusEl = document.getElementById("dirx-status-pill");
  if(statusEl){
    statusEl.textContent = status.label;
    statusEl.className = `dirx-timebar-status dirx-sev-${status.key}`;
  }
  const unread = dirxUnreadCount();
  const badgeWrap = document.getElementById("dirx-bell-badge-wrap");
  if(badgeWrap) badgeWrap.innerHTML = unread>0 ? `<span class="dirx-timebar-badge">${unread>99?"99+":unread}</span>` : "";
}

function dirxNodeAt(segs){
  let node = LPIC1_DIR_FS;
  for(const seg of segs){
    if(!node || node.type !== "dir" || !node.children[seg]) return null;
    node = node.children[seg];
  }
  return node;
}
function dirxPathStr(segs){ return segs.length ? "/"+segs.join("/") : "/"; }
function dirxIsCoarsePointer(){
  try{ return !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches); }
  catch(e){ return false; }
}
function dirxEnsureExpanded(segs){
  let cur = [];
  dirxExpanded.add("");
  segs.forEach(seg => { cur = cur.concat(seg); dirxExpanded.add(cur.join("/")); });
}
function dirxNavigateTo(segs){
  const key = segs.join("/");
  if(key !== dirxPath.join("/")){
    dirxBackStack.push(dirxPath.slice());
    dirxForwardStack = [];
    dirxPath = segs.slice();
  }
  dirxSelected = null;
  dirxEnsureExpanded(dirxPath);
  renderDirExplorer();
}
function dirxBackNav(){
  if(!dirxBackStack.length) return;
  dirxForwardStack.push(dirxPath.slice());
  dirxPath = dirxBackStack.pop();
  dirxSelected = null;
  dirxEnsureExpanded(dirxPath);
  renderDirExplorer();
}
function dirxForwardNav(){
  if(!dirxForwardStack.length) return;
  dirxBackStack.push(dirxPath.slice());
  dirxPath = dirxForwardStack.pop();
  dirxSelected = null;
  dirxEnsureExpanded(dirxPath);
  renderDirExplorer();
}
function dirxUpNav(){ if(dirxPath.length) dirxNavigateTo(dirxPath.slice(0,-1)); }
function dirxRootNav(){ dirxNavigateTo([]); }

function dirxBreadcrumbHTML(){
  const crumbs = [{ label:"/", segs:[] }];
  let cur = [];
  dirxPath.forEach(seg => { cur = cur.concat(seg); crumbs.push({ label:seg, segs:cur.slice() }); });
  return crumbs.map((c,i)=>`<button type="button" class="dirx-crumb${i===crumbs.length-1?" dirx-crumb--current":""}" data-dirx-crumb="${esc(c.segs.join("/"))}">${esc(c.label)}</button>`)
    .join(`<span class="dirx-crumb-sep">›</span>`);
}

function dirxTreeRowHTML(name, node, segs, depth){
  const key = segs.join("/");
  const isDir = node.type === "dir";
  const hasChildren = isDir && Object.keys(node.children).length>0;
  const expanded = dirxExpanded.has(key);
  const isCurrent = key === dirxPath.join("/");
  const childrenHTML = (isDir && expanded)
    ? Object.keys(node.children).sort().map(cn=>dirxTreeRowHTML(cn, node.children[cn], segs.concat(cn), depth+1)).join("")
    : "";
  return `
    <div class="dirx-tree-item">
      <div class="dirx-tree-row${isCurrent?" dirx-tree-row--active":""}" style="padding-left:${10+depth*16}px" data-dirx-tree="${esc(key)}">
        ${hasChildren
          ? `<button type="button" class="dirx-tree-caret${expanded?" dirx-tree-caret--open":""}" data-dirx-caret="${esc(key)}" aria-label="${expanded?"折りたたむ":"展開する"}">›</button>`
          : `<span class="dirx-tree-caret dirx-tree-caret--empty"></span>`}
        <span class="dirx-tree-ico">${isDir?"📁":"📄"}</span>
        <span class="dirx-tree-name">${esc(name)}</span>
        ${node.examHot?`<span class="dirx-tree-star" title="試験で特に重要">★</span>`:""}
      </div>
      ${childrenHTML}
    </div>`;
}
function dirxTreeHTML(){
  const rootExpanded = dirxExpanded.has("");
  const rootCurrent = dirxPath.length===0;
  const childrenHTML = rootExpanded
    ? Object.keys(LPIC1_DIR_FS.children).sort().map(n=>dirxTreeRowHTML(n, LPIC1_DIR_FS.children[n], [n], 1)).join("")
    : "";
  return `
    <div class="dirx-tree-item">
      <div class="dirx-tree-row${rootCurrent?" dirx-tree-row--active":""}" style="padding-left:10px" data-dirx-tree="">
        <button type="button" class="dirx-tree-caret${rootExpanded?" dirx-tree-caret--open":""}" data-dirx-caret="" aria-label="${rootExpanded?"折りたたむ":"展開する"}">›</button>
        <span class="dirx-tree-ico">🐧</span>
        <span class="dirx-tree-name">/（ルート）</span>
      </div>
      ${childrenHTML}
    </div>`;
}

function dirxListHTML(node){
  if(!node || node.type !== "dir") return `<div class="dirx-empty">このパスは学習データに存在しません。</div>`;
  const names = Object.keys(node.children).sort();
  if(!names.length) return `<div class="dirx-empty">📭 このフォルダの中身は学習データに含まれていません。<br><span class="dirx-empty-sub">（実際のLinuxにはさらに多くのファイルがあります）</span></div>`;
  return names.map(name=>{
    const child = node.children[name];
    const isDir = child.type === "dir";
    const selected = dirxSelected === name;
    return `
      <button type="button" class="dirx-row${selected?" dirx-row--selected":""}" data-dirx-row="${esc(name)}">
        <span class="dirx-row-icon">${isDir?"📁":"📄"}</span>
        <span class="dirx-row-main">
          <span class="dirx-row-top">
            <span class="dirx-row-name">${esc(name)}</span>
            ${child.examHot?`<span class="dirx-badge dirx-badge--hot">★試験頻出</span>`:(child.lpicImportant?`<span class="dirx-badge">重要</span>`:"")}
          </span>
          <span class="dirx-row-kind">${esc(child.kind||"")}</span>
          <span class="dirx-row-desc">${esc(child.desc||"")}</span>
        </span>
        ${isDir?`<span class="dirx-row-chevron" data-dirx-open="${esc(name)}" aria-label="開く">›</span>`:""}
      </button>`;
  }).join("");
}

function dirxDetailBodyHTML(name, node, segs){
  const d = node.detail || {};
  const isDir = node.type === "dir";
  return `
    <div class="dirx-detail-head">
      <span class="dirx-detail-ico">${isDir?"📁":"📄"}</span>
      <div>
        <div class="dirx-detail-path">${esc(dirxPathStr(segs))}</div>
        <div class="dirx-detail-kind">${esc(node.kind||"")}</div>
      </div>
    </div>
    <div class="dirx-detail-badges">
      ${node.examHot?`<span class="dirx-badge dirx-badge--hot">★ 試験で特に重要</span>`:""}
      ${node.lpicImportant?`<span class="dirx-badge">LPIC-1で重要</span>`:`<span class="dirx-badge dirx-badge--muted">参考程度</span>`}
      ${node.isVirtual?`<span class="dirx-badge dirx-badge--virtual">⚙ 仮想ファイルシステム</span>`:""}
    </div>
    ${node.isVirtual?`<div class="dirx-detail-virtual-note">💡 ここはディスク上に実体を持たず、カーネルが情報をその場で生成して見せている「仮想ファイルシステム」の一部です。</div>`:""}
    ${d.beginnerNote?`<div class="dirx-detail-tip">🔰 <b>初学者向け一言：</b>${esc(d.beginnerNote)}</div>`:""}
    ${d.role?`<div class="dirx-detail-section"><div class="dirx-detail-lab">役割</div><div class="dirx-detail-body">${esc(d.role)}</div></div>`:""}
    ${d.stores?`<div class="dirx-detail-section"><div class="dirx-detail-lab">何を保存する場所か</div><div class="dirx-detail-body">${esc(d.stores)}</div></div>`:""}
    ${(d.examples&&d.examples.length)?`<div class="dirx-detail-section"><div class="dirx-detail-lab">代表例</div><div class="dirx-chip-row">${d.examples.map(x=>`<code class="dirx-chip">${esc(x)}</code>`).join("")}</div></div>`:""}
    ${(d.commands&&d.commands.length)?`<div class="dirx-detail-section"><div class="dirx-detail-lab">関連コマンド</div><div class="dirx-chip-row">${d.commands.map(x=>`<code class="dirx-chip dirx-chip--cmd">${esc(x)}</code>`).join("")}</div></div>`:""}
    ${d.examPoint?`<div class="dirx-detail-section dirx-detail-section--exam"><div class="dirx-detail-lab">🏆 試験でのポイント</div><div class="dirx-detail-body">${esc(d.examPoint)}</div></div>`:""}
  `;
}

// 探索ミッション／障害対応モードが進行中のときだけ、詳細シートの下部に追加操作
// ボタンを表示する。通常のディレクトリ学習中（何も進行中でない）は何も表示しない
function dirxDetailActionsHTML(segs, node){
  const parts = [];
  const am = dirxActiveMission();
  if(am){
    parts.push(`
      <div class="dirx-detail-action-block dirx-detail-action-block--mission">
        <div class="dirx-detail-action-lab">🧭 探索中：${esc(am.mission.title)}</div>
        <button type="button" class="cta" data-dirx-mission-answer style="margin-top:8px">この場所をミッションの回答にする</button>
      </div>`);
  }
  const ai = dirxActiveIncident();
  if(ai){
    const target = dirxFindTargetForPath(segs);
    if(target){
      const investigated = dirxIsInvestigated(target.id);
      parts.push(`
        <div class="dirx-detail-action-block dirx-detail-action-block--incident">
          <div class="dirx-detail-action-lab">🛠 対応中：${esc(ai.scenario.title)}</div>
          ${investigated
            ? `<div class="dirx-detail-action-done">✓ 調査済みです</div>`
            : `<button type="button" class="cta" data-dirx-mark-investigated="${esc(target.id)}" style="margin-top:8px">調査済みに追加する</button>`}
          ${target.command ? `<button type="button" class="ghost" data-dirx-run-target-cmd="${esc(target.command)}" style="margin-top:8px">関連する疑似コマンドを実行する（${esc(target.command)}）</button>` : ""}
        </div>`);
    }
  }
  if(!parts.length) return "";
  return `<div class="dirx-detail-actions">${parts.join("")}</div>`;
}

function dirxOpenDetailSheet(name, node, segs){
  if(dirxSheetEl){ closeSheet(dirxSheetEl); dirxSheetEl = null; }
  lockBodyScrollForSheet();
  const ov = document.createElement("div");
  ov.className = "sheet-ov";
  ov.innerHTML = `
    <div class="bottom-sheet dirx-detail-sheet">
      <button type="button" class="dirx-detail-close" data-dirx-sheet-close aria-label="閉じる">✕</button>
      <div class="bottom-sheet-drag-handle">
        <div class="bottom-sheet-handle"></div>
        <div class="bottom-sheet-title">${esc(name===""?"/（ルート）":name)}</div>
      </div>
      <div class="dirx-detail-scroll bottom-sheet-list">${dirxDetailBodyHTML(name, node, segs)}</div>
      ${dirxDetailActionsHTML(segs, node)}
    </div>`;
  document.body.appendChild(ov);
  dirxSheetEl = ov;
  ov.addEventListener("click", (e)=>{ if(e.target===ov){ closeSheet(ov); if(dirxSheetEl===ov) dirxSheetEl=null; } });
  const closeBtn = ov.querySelector("[data-dirx-sheet-close]");
  if(closeBtn) closeBtn.onclick = () => { closeSheet(ov); if(dirxSheetEl===ov) dirxSheetEl=null; };
  const ansBtn = ov.querySelector("[data-dirx-mission-answer]");
  if(ansBtn) ansBtn.onclick = () => { dirxCloseSheetImmediate(); dirxSubmitAsMissionAnswer(segs); };
  const invBtn = ov.querySelector("[data-dirx-mark-investigated]");
  if(invBtn) invBtn.onclick = () => {
    dirxMarkInvestigated(invBtn.dataset.dirxMarkInvestigated);
    closeSheet(ov); if(dirxSheetEl===ov) dirxSheetEl=null;
    render();
  };
  const cmdBtn = ov.querySelector("[data-dirx-run-target-cmd]");
  if(cmdBtn) cmdBtn.onclick = () => {
    dirxRunIncidentCommand(cmdBtn.dataset.dirxRunTargetCmd);
    dirxCloseSheetImmediate();
    render();
    dirxOpenTerminalSheet();
  };
  const touchGuard = createSheetTouchGuard(ov);
  ov.addEventListener("touchstart", touchGuard.onTouchStart, { passive:true });
  ov.addEventListener("touchmove", touchGuard.onTouchMove, { passive:false });
  const sheet = ov.querySelector(".bottom-sheet");
  attachSheetDragHandlers(ov, sheet);
  requestAnimationFrame(()=>{ ov.classList.add("sheet-ov-show"); sheet.classList.add("bottom-sheet-show"); });
}

export function renderDirExplorer(){
  updateHeaderNav(true);
  const node = dirxNodeAt(dirxPath) || LPIC1_DIR_FS;
  app.innerHTML = `
    <div class="q-head" style="margin-bottom:14px">
      <button class="quit" data-go="home">← ホームへ戻る</button>
    </div>
    <div class="sel-head">
      <span class="eyebrow">LPIC-1 ・ FHS学習</span>
      <h2 class="sel-title">ディレクトリを触って学ぶ</h2>
    </div>
    <div class="x-hint" style="margin:10px 0 14px">実際のパソコンのフォルダ画面のように、クリック（タップ）しながらLinuxのディレクトリ構造を確認できます。実際のOSには一切アクセスしない、学習用の疑似ファイルシステムです。</div>

    ${dirxTimebarHTML()}
    ${dirxMissionCardHTML()}
    ${dirxIncidentCardHTML()}

    <div class="dirx-shell">
      <div class="dirx-toolbar">
        <button type="button" class="dirx-tbtn" data-dirx-back aria-label="戻る" title="戻る" ${dirxBackStack.length?"":"disabled"}>‹</button>
        <button type="button" class="dirx-tbtn" data-dirx-forward aria-label="進む" title="進む" ${dirxForwardStack.length?"":"disabled"}>›</button>
        <button type="button" class="dirx-tbtn" data-dirx-up aria-label="上の階層へ" title="上の階層へ" ${dirxPath.length?"":"disabled"}>⬆</button>
        <button type="button" class="dirx-tbtn" data-dirx-root aria-label="ルートへ戻る" title="ルートへ戻る">🏠</button>
        <button type="button" class="dirx-tbtn dirx-tbtn--tree" data-dirx-tree-toggle aria-label="ディレクトリツリーを開く" title="ディレクトリツリー">🗂 ツリー</button>
      </div>
      <div class="dirx-breadcrumb">${dirxBreadcrumbHTML()}</div>

      <div class="dirx-body">
        <div class="dirx-tree-panel${dirxTreeOpen?" dirx-tree-panel--open":""}">
          <div class="dirx-tree-backdrop" data-dirx-tree-toggle></div>
          <div class="dirx-tree-card">
            <div class="dirx-tree-card-head">
              <span>📁 ディレクトリツリー</span>
              <button type="button" class="dirx-tree-close" data-dirx-tree-toggle aria-label="閉じる">✕</button>
            </div>
            <div class="dirx-tree-scroll">${dirxTreeHTML()}</div>
          </div>
        </div>

        <div class="dirx-main-panel">
          <div class="dirx-main-head">
            <span class="dirx-main-path">${esc(dirxPathStr(dirxPath))}</span>
            <span class="dirx-main-count">${node.type==="dir" ? Object.keys(node.children).length+" 件" : ""}</span>
          </div>
          <div class="dirx-list">${dirxListHTML(node)}</div>
        </div>
      </div>
    </div>
  `;

  const backBtn = app.querySelector("[data-dirx-back]"); if(backBtn) backBtn.onclick = dirxBackNav;
  const fwdBtn = app.querySelector("[data-dirx-forward]"); if(fwdBtn) fwdBtn.onclick = dirxForwardNav;
  const upBtn = app.querySelector("[data-dirx-up]"); if(upBtn) upBtn.onclick = dirxUpNav;
  const rootBtn = app.querySelector("[data-dirx-root]"); if(rootBtn) rootBtn.onclick = dirxRootNav;
  app.querySelectorAll("[data-dirx-tree-toggle]").forEach(b=>b.onclick=()=>{ dirxTreeOpen = !dirxTreeOpen; renderDirExplorer(); });

  app.querySelectorAll("[data-dirx-crumb]").forEach(b=>b.onclick=()=>{
    const v = b.dataset.dirxCrumb;
    dirxNavigateTo(v ? v.split("/") : []);
  });

  app.querySelectorAll("[data-dirx-caret]").forEach(b=>b.onclick=(e)=>{
    e.stopPropagation();
    const key = b.dataset.dirxCaret;
    if(dirxExpanded.has(key)) dirxExpanded.delete(key); else dirxExpanded.add(key);
    renderDirExplorer();
  });
  app.querySelectorAll("[data-dirx-tree]").forEach(row=>row.addEventListener("click", (e)=>{
    if(e.target.closest("[data-dirx-caret]")) return;
    const key = row.dataset.dirxTree;
    dirxTreeOpen = false;
    dirxNavigateTo(key ? key.split("/") : []);
  }));

  // 選択状態の見た目は（renderDirExplorer()を丸ごと呼び直すと、直後のクリックが
  // 別のDOM要素に当たってしまいネイティブのdblclickが発火しなくなるため）
  // classListの付け替えだけで反映し、行要素自体は再生成しない
  const selectRowEl = (row) => {
    app.querySelectorAll(".dirx-row--selected").forEach(r=>r.classList.remove("dirx-row--selected"));
    row.classList.add("dirx-row--selected");
  };
  app.querySelectorAll("[data-dirx-row]").forEach(row=>{
    const name = row.dataset.dirxRow;
    const child = node.children[name];
    if(!child) return;
    const openNow = () => {
      dirxSelected = name;
      dirxOpenDetailSheet(name, child, dirxPath.concat(name));
      if(child.type === "dir") dirxNavigateTo(dirxPath.concat(name));
      else selectRowEl(row);
    };
    row.addEventListener("click", (e)=>{
      if(e.target.closest("[data-dirx-open]")) return;
      if(child.type === "dir" && !dirxIsCoarsePointer()){
        // デスクトップ（マウス）のフォルダ行は「クリック＝選択」「ダブルクリック＝開く」
        // という感覚に近づけたいが、選択直後に詳細シート（画面全体を覆う
        // オーバーレイ）をその場で開いてしまうと、2回目のクリックがオーバーレイに
        // 当たってしまいネイティブのdblclickイベントが発火しなくなる。そのため
        // シートを開く処理だけを少し遅らせ、その間にdblclickが来たらキャンセルする
        dirxSelected = name;
        selectRowEl(row);
        clearTimeout(dirxSelectTimer);
        dirxSelectTimer = setTimeout(()=>{ dirxOpenDetailSheet(name, child, dirxPath.concat(name)); }, 260);
        return;
      }
      openNow();
    });
    row.addEventListener("dblclick", ()=>{
      clearTimeout(dirxSelectTimer);
      if(child.type === "dir") dirxNavigateTo(dirxPath.concat(name));
    });
  });
  app.querySelectorAll("[data-dirx-open]").forEach(btn=>btn.addEventListener("click", (e)=>{
    e.stopPropagation();
    dirxNavigateTo(dirxPath.concat(btn.dataset.dirxOpen));
  }));

  wireDirxTimebar();
  wireDirxMissionCard();
  wireDirxIncidentCard();
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
}

/* =========================================================================
   🧭 探索ミッション／⏱ 時間経過・イベント／🛠 障害対応モード
   共通UI部品：js/dirxStore.js の状態を読み、renderDirExplorer()・
   renderDirxMissions()・renderDirxIncidents()・renderDirxEvents() の
   4画面から使い回す。実際のOS・実際のコマンドには一切アクセスしない。
   ========================================================================= */

function fmtDirxMinutes(mins){
  const m = Math.max(0, Math.round(mins||0));
  if(m < 60) return `${m}分`;
  const h = Math.floor(m/60), r = m%60;
  return r ? `${h}時間${r}分` : `${h}時間`;
}
function dirxDifficultyClass(diff){
  if(diff==="初級") return "dirx-diff--basic";
  if(diff==="中級") return "dirx-diff--mid";
  return "dirx-diff--lpic1";
}

/* ---- コンパクト時計/状態バー（4画面共通のヘッダー） ---- */
function dirxTimebarHTML(){
  const clock = dirxGetClock();
  const status = dirxGetSystemStatus();
  const unread = dirxUnreadCount();
  return `
    <div class="dirx-timebar" id="dirx-timebar">
      <div class="dirx-timebar-row">
        <span class="dirx-timebar-clock">🕒 <b id="dirx-clock-label">${esc(clock.label)}</b><span class="dirx-timebar-day">${clock.day}日目</span></span>
        <span class="dirx-timebar-status dirx-sev-${status.key}" id="dirx-status-pill">${esc(status.label)}</span>
        <button type="button" class="dirx-timebar-iconbtn" data-dirx-open-events aria-label="通知一覧を開く">🔔<span id="dirx-bell-badge-wrap">${unread>0?`<span class="dirx-timebar-badge">${unread>99?"99+":unread}</span>`:""}</span></button>
        <button type="button" class="dirx-timebar-iconbtn" data-dirx-open-settings aria-label="時間の進み方の設定">⚙️</button>
      </div>
      <button type="button" class="dirx-tbtn dirx-timebar-advance" data-dirx-advance-time>⏩ 時間を進める（+30分）</button>
    </div>`;
}
function wireDirxTimebar(){
  app.querySelectorAll("[data-dirx-open-events]").forEach(b=>b.onclick=()=>go("lpic-dirx-events"));
  app.querySelectorAll("[data-dirx-open-settings]").forEach(b=>b.onclick=()=>dirxOpenTimeSettingsSheet());
  app.querySelectorAll("[data-dirx-advance-time]").forEach(b=>b.onclick=()=>{ dirxAdvanceTime(); render(); });
}

function dirxTimeSettingsBodyHTML(cur){
  return `
    <div class="dirx-settings-block">
      <div class="dirx-settings-lab">自動進行</div>
      <div class="dirx-settings-row">
        <button type="button" class="dirx-toggle-btn${cur.autoAdvance?" dirx-toggle-btn--on":""}" data-dirx-set-auto="true">自動進行 ON</button>
        <button type="button" class="dirx-toggle-btn${!cur.autoAdvance?" dirx-toggle-btn--on":""}" data-dirx-set-auto="false">自動進行 OFF</button>
      </div>
      <div class="dirx-settings-hint">ONの間、この画面を開いている間だけ疑似Linuxの時間が少しずつ自動で進みます。</div>
    </div>
    <div class="dirx-settings-block">
      <div class="dirx-settings-lab">イベント頻度</div>
      <div class="dirx-settings-row">
        <button type="button" class="dirx-toggle-btn${cur.frequency==='low'?" dirx-toggle-btn--on":""}" data-dirx-set-freq="low">少ない</button>
        <button type="button" class="dirx-toggle-btn${cur.frequency==='normal'?" dirx-toggle-btn--on":""}" data-dirx-set-freq="normal">普通</button>
        <button type="button" class="dirx-toggle-btn${cur.frequency==='high'?" dirx-toggle-btn--on":""}" data-dirx-set-freq="high">多い</button>
      </div>
    </div>`;
}
function dirxOpenTimeSettingsSheet(){
  const ov = dirxOpenSheet("⏱ 時間の進み方の設定", dirxTimeSettingsBodyHTML(dirxGetSettings()));
  const rewire = () => {
    ov.querySelectorAll("[data-dirx-set-auto]").forEach(b=>b.onclick=()=>{ dirxSetSettings({ autoAdvance: b.dataset.dirxSetAuto==="true" }); refresh(); });
    ov.querySelectorAll("[data-dirx-set-freq]").forEach(b=>b.onclick=()=>{ dirxSetSettings({ frequency: b.dataset.dirxSetFreq }); refresh(); });
  };
  const refresh = () => {
    ov.querySelector(".dirx-generic-sheet-body").innerHTML = dirxTimeSettingsBodyHTML(dirxGetSettings());
    rewire();
  };
  rewire();
}

/* ---- 探索ミッション：挑戦中カード ---- */
function dirxMissionCardHTML(){
  const am = dirxActiveMission();
  if(!am) return "";
  const { mission, hintsRevealed } = am;
  const hintsHTML = mission.hints.slice(0, hintsRevealed).map((h,i)=>`<div class="dirx-hint-line">💡 ヒント${i+1}：${esc(h)}</div>`).join("");
  const canMoreHints = hintsRevealed < mission.hints.length;
  return `
    <div class="dirx-active-card dirx-active-card--mission${dirxMissionCardCollapsed?" dirx-active-card--collapsed":""}">
      <button type="button" class="dirx-active-card-head" data-dirx-toggle-mission-card>
        <span class="dirx-active-card-tag">🧭 探索中</span>
        <span class="dirx-active-card-title">${esc(mission.title)}</span>
        <span class="dirx-active-card-caret">${dirxMissionCardCollapsed?"▾":"▴"}</span>
      </button>
      <div class="dirx-active-card-body">
        <div class="dirx-active-card-prompt">${esc(mission.prompt)}</div>
        ${hintsHTML}
        <div class="dirx-active-card-actions">
          <button type="button" class="dirx-tbtn" data-dirx-mission-hint ${canMoreHints?"":"disabled"}>💡 ヒント（${hintsRevealed}/${mission.hints.length}）</button>
          <button type="button" class="dirx-tbtn dirx-tbtn--end" data-dirx-mission-end>ミッションを終了</button>
        </div>
      </div>
    </div>`;
}
function wireDirxMissionCard(){
  app.querySelectorAll("[data-dirx-toggle-mission-card]").forEach(b=>b.onclick=()=>{ dirxMissionCardCollapsed = !dirxMissionCardCollapsed; render(); });
  app.querySelectorAll("[data-dirx-mission-hint]").forEach(b=>b.onclick=()=>{ dirxRevealMissionHint(); render(); });
  app.querySelectorAll("[data-dirx-mission-end]").forEach(b=>b.onclick=()=>{ dirxEndMission(); go("lpic-dirx-missions"); });
}

/* ---- 障害対応モード：対応中カード ---- */
function dirxIncidentCardHTML(){
  const ai = dirxActiveIncident();
  if(!ai) return "";
  const { scenario, runtime } = ai;
  const total = scenario.investigateTargets.length;
  const doneCount = scenario.investigateTargets.filter(t=>dirxIsInvestigated(t.id)).length;
  const elapsed = dirxIncidentElapsedMinutes();
  const canChooseCause = doneCount >= total;
  const cause = scenario.causeOptions.find(o=>o.id===runtime.causeId) || null;
  return `
    <div class="dirx-active-card dirx-active-card--incident${dirxIncidentCardCollapsed?" dirx-active-card--collapsed":""}">
      <button type="button" class="dirx-active-card-head" data-dirx-toggle-incident-card>
        <span class="dirx-active-card-tag">🛠 障害対応中</span>
        <span class="dirx-active-card-title">${esc(scenario.title)}</span>
        <span class="dirx-active-card-caret">${dirxIncidentCardCollapsed?"▾":"▴"}</span>
      </button>
      <div class="dirx-active-card-body">
        <div class="dirx-active-card-prompt">${esc(scenario.symptom)}</div>
        <div class="dirx-active-card-meta">経過時間：${fmtDirxMinutes(elapsed)}　調査済み：${doneCount}/${total}</div>
        ${cause ? `<div class="dirx-cause-note ${cause.correct?'dirx-cause-note--ok':'dirx-cause-note--ng'}">原因候補：${esc(cause.label)}</div>` : ""}
        ${(!canChooseCause && !runtime.completed) ? `<div class="dirx-active-card-hintline">あと${total-doneCount}件、調査対象を確認すると原因を回答できます。</div>` : ""}
        <div class="dirx-active-card-actions">
          <button type="button" class="dirx-tbtn" data-dirx-open-terminal>💻 疑似ターミナル</button>
          <button type="button" class="dirx-tbtn" data-dirx-incident-hint>💡 ヒント</button>
          ${runtime.completed
            ? `<button type="button" class="dirx-tbtn dirx-tbtn--accent" data-dirx-incident-summary>結果を見る</button>`
            : `<button type="button" class="dirx-tbtn dirx-tbtn--accent" data-dirx-choose-cause ${canChooseCause?"":"disabled"}>${cause?"原因を選び直す":"原因を回答する"}</button>
               ${cause ? `<button type="button" class="dirx-tbtn dirx-tbtn--accent" data-dirx-choose-fix>対応方法を選ぶ</button>` : ""}`}
          <button type="button" class="dirx-tbtn dirx-tbtn--end" data-dirx-incident-end>対応を終了する</button>
        </div>
      </div>
    </div>`;
}
function wireDirxIncidentCard(){
  app.querySelectorAll("[data-dirx-toggle-incident-card]").forEach(b=>b.onclick=()=>{ dirxIncidentCardCollapsed = !dirxIncidentCardCollapsed; render(); });
  app.querySelectorAll("[data-dirx-open-terminal]").forEach(b=>b.onclick=()=>dirxOpenTerminalSheet());
  app.querySelectorAll("[data-dirx-incident-hint]").forEach(b=>b.onclick=()=>dirxOpenIncidentHintSheet());
  app.querySelectorAll("[data-dirx-choose-cause]").forEach(b=>{ if(!b.disabled) b.onclick=()=>dirxOpenCauseSheet(); });
  app.querySelectorAll("[data-dirx-choose-fix]").forEach(b=>b.onclick=()=>dirxOpenFixSheet());
  app.querySelectorAll("[data-dirx-incident-summary]").forEach(b=>b.onclick=()=>dirxOpenIncidentClearSheet());
  app.querySelectorAll("[data-dirx-incident-end]").forEach(b=>b.onclick=()=>{ dirxEndIncident(); go("lpic-dirx-incidents"); });
}

/* ---- 汎用ボトムシート（ミッション回答結果／原因・対応の選択／疑似ターミナル／
   通知詳細／設定など、dirx系のあらゆる補助画面をこの1つで組み立てる） ---- */
function dirxOpenSheet(title, bodyHTML){
  if(dirxSheetEl){ closeSheet(dirxSheetEl); dirxSheetEl = null; }
  lockBodyScrollForSheet();
  const ov = document.createElement("div");
  ov.className = "sheet-ov";
  ov.innerHTML = `
    <div class="bottom-sheet dirx-generic-sheet">
      <div class="bottom-sheet-drag-handle">
        <div class="bottom-sheet-handle"></div>
        <div class="bottom-sheet-title">${esc(title)}</div>
      </div>
      <div class="bottom-sheet-list dirx-generic-sheet-body">${bodyHTML}</div>
    </div>`;
  document.body.appendChild(ov);
  dirxSheetEl = ov;
  ov.addEventListener("click", (e)=>{ if(e.target===ov){ closeSheet(ov); if(dirxSheetEl===ov) dirxSheetEl=null; } });
  const touchGuard = createSheetTouchGuard(ov);
  ov.addEventListener("touchstart", touchGuard.onTouchStart, { passive:true });
  ov.addEventListener("touchmove", touchGuard.onTouchMove, { passive:false });
  const sheet = ov.querySelector(".bottom-sheet");
  attachSheetDragHandlers(ov, sheet);
  requestAnimationFrame(()=>{ ov.classList.add("sheet-ov-show"); sheet.classList.add("bottom-sheet-show"); });
  return ov;
}
function dirxCloseSheet(){ if(dirxSheetEl){ closeSheet(dirxSheetEl); dirxSheetEl = null; } }
// アニメーション付きのcloseSheet()はunlockBodyScrollForSheet()の呼び出しが220ms遅延するため、
// 「閉じてすぐ別のシートを開く」場面でそのまま使うと、後から開いた新しいシートの背景ロックまで
// 巻き込んで解除してしまう（＝背景が意図せずスクロールできてしまう）。次のシートへ即座に
// つなげる場合は、アニメーションなしでDOMだけ取り除くこちらを使う（背景ロックは新しいシート側の
// lockBodyScrollForSheet()にそのまま引き継がれるので解除しない）
function dirxCloseSheetImmediate(){
  if(dirxSheetEl){ try{ dirxSheetEl.remove(); }catch(e){} dirxSheetEl = null; }
}

/* ---- 探索ミッション：回答の正誤結果 ---- */
function dirxShowMissionResult(res){
  const { mission, correct, node, path, alreadyCompleted, rewardAC, rewardExp, hintsUsed } = res;
  let body;
  if(correct){
    const rewardLine = alreadyCompleted
      ? `<div class="dirx-result-note">このミッションはクリア済みです（報酬はすでに受け取っています）。</div>`
      : `<div class="dirx-reward-row"><span class="dirx-reward-pop">+${rewardAC} AC</span><span class="dirx-reward-pop dirx-reward-pop--exp">+${rewardExp} EXP</span></div>${hintsUsed>0?`<div class="dirx-result-note">ヒントを${hintsUsed}回使用したため、獲得ACは満額より少なめです。</div>`:""}`;
    body = `
      <div class="dirx-confetti" aria-hidden="true">${"🎉🎊✨🎉🎊".split("").map((c,i)=>`<span style="--i:${i}">${c}</span>`).join("")}</div>
      <div class="dirx-result-title dirx-result-title--ok">正解！</div>
      <div class="dirx-result-path">${esc(dirxPathStr(path))}</div>
      ${rewardLine}
      <div class="dirx-result-section"><div class="dirx-detail-lab">この場所について</div><div class="dirx-detail-body">${esc(mission.correctNote)}</div></div>
      <div class="dirx-result-section"><div class="dirx-detail-lab">関連コマンド</div><div class="dirx-chip-row">${mission.relatedCommands.map(c=>`<code class="dirx-chip dirx-chip--cmd">${esc(c)}</code>`).join("")}</div></div>
      <button type="button" class="cta" data-dirx-result-close style="margin-top:16px">探索を続ける</button>`;
  } else {
    const role = (node && node.detail && node.detail.role) ? node.detail.role : "この学習データには詳しい説明が登録されていません。";
    body = `
      <div class="dirx-result-title dirx-result-title--ng">不正解</div>
      <div class="dirx-result-note">選択した場所：</div>
      <div class="dirx-result-path">${esc(dirxPathStr(path))}</div>
      <div class="dirx-result-section"><div class="dirx-detail-body">${esc(role)}<br>「${esc(mission.title)}」の答えではありません。</div></div>
      <div class="dirx-result-note">ACや経験値は減りません。もう一度探してみましょう。</div>
      <button type="button" class="ghost" data-dirx-result-hint style="margin-top:10px">💡 ヒントを見る</button>
      <button type="button" class="cta" data-dirx-result-close style="margin-top:10px">探索を続ける</button>`;
  }
  const ov = dirxOpenSheet(correct ? "🎉 正解" : "🤔 不正解", body);
  ov.querySelectorAll("[data-dirx-result-close]").forEach(b=>b.onclick=()=>{ dirxCloseSheet(); render(); });
  const hintBtn = ov.querySelector("[data-dirx-result-hint]");
  if(hintBtn) hintBtn.onclick = () => { dirxRevealMissionHint(); dirxCloseSheet(); render(); };
}

// 探索ミッション中に、選ばれたファイル／ディレクトリをミッションの回答として判定する
function dirxSubmitAsMissionAnswer(segs){
  const res = dirxSubmitMissionAnswer(segs);
  if(!res.ok) return;
  if(res.correct && !res.alreadyCompleted) renderStatusBar(); // AC/経験値をヘッダーへ即時反映
  dirxShowMissionResult(res);
}

/* ---- 障害対応モード：疑似ターミナル ---- */
function dirxTerminalLogHTML(){
  const log = dirxIncidentTerminalLog();
  if(!log.length) return `<div class="dirx-term-empty">まだコマンドを実行していません。下の入力欄から実行してみましょう。</div>`;
  return log.map(l=>`<div class="dirx-term-line"><span class="dirx-term-prompt">$</span> ${esc(l.cmd)}<pre class="dirx-term-output">${esc(l.output)}</pre></div>`).join("");
}
function dirxOpenTerminalSheet(){
  const ai = dirxActiveIncident();
  if(!ai) return;
  const chips = ai.scenario.relatedCommands.map(c=>`<button type="button" class="dirx-chip dirx-chip--cmd dirx-chip--btn" data-dirx-term-chip="${esc(c)}">${esc(c)}</button>`).join("");
  const body = `
    <div class="dirx-term-hint">この学習環境専用の疑似ターミナルです。実際のOSやサーバーには一切アクセスしません。</div>
    <div class="dirx-chip-row" style="margin-bottom:10px">${chips}</div>
    <div class="dirx-term-log" id="dirx-term-log">${dirxTerminalLogHTML()}</div>
    <form id="dirx-term-form" class="dirx-term-form">
      <input type="text" id="dirx-term-input" class="dirx-term-input" placeholder="例：systemctl status sshd" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
      <button type="submit" class="dirx-term-run">実行</button>
    </form>`;
  const ov = dirxOpenSheet("💻 疑似ターミナル", body);
  const scrollLogToEnd = () => { const log = ov.querySelector("#dirx-term-log"); if(log) log.scrollTop = log.scrollHeight; };
  scrollLogToEnd();
  const runCmd = (cmd) => {
    if(!cmd) return;
    dirxRunIncidentCommand(cmd);
    const log = ov.querySelector("#dirx-term-log");
    if(log) log.innerHTML = dirxTerminalLogHTML();
    scrollLogToEnd();
    // app.innerHTMLを丸ごと作り直しても、このシートはdocument.body直下にあるため残る。
    // 対応中カードの調査済み件数などは裏側で最新化しておく
    render();
  };
  const form = ov.querySelector("#dirx-term-form");
  const input = ov.querySelector("#dirx-term-input");
  form.addEventListener("submit", (e)=>{ e.preventDefault(); const v = input.value; input.value = ""; runCmd(v); });
  ov.querySelectorAll("[data-dirx-term-chip]").forEach(b=>b.onclick=()=>runCmd(b.dataset.dirxTermChip));
}

/* ---- 障害対応モード：ヒント（調査状況から動的に生成） ---- */
function dirxOpenIncidentHintSheet(){
  const ai = dirxActiveIncident();
  if(!ai) return;
  const { scenario, runtime } = ai;
  const pending = scenario.investigateTargets.filter(t=>!dirxIsInvestigated(t.id));
  let lines = [];
  if(pending.length){
    lines.push(`まずは「${pending[0].label}」を確認してみましょう。`);
    if(pending[0].command) lines.push(`疑似ターミナルで「${pending[0].command}」を実行すると手がかりが得られます。`);
  } else if(!runtime.causeId){
    lines.push("調査対象はすべて確認済みです。「原因を回答する」から怪しいものを選んでみましょう。");
  } else if(!runtime.causeCorrect){
    lines.push("選んだ原因は少し違うようです。調査結果を見直して、もう一度「原因を選び直す」から選んでみましょう。");
  } else if(!runtime.completed){
    lines.push("原因の見立ては良さそうです。「対応方法を選ぶ」から適切な対応を選びましょう。");
  } else {
    lines.push("このシナリオはすでにクリアしています。");
  }
  dirxRevealIncidentHint();
  const body = lines.map(l=>`<div class="dirx-hint-line">💡 ${esc(l)}</div>`).join("") +
    `<button type="button" class="cta" data-dirx-hint-close style="margin-top:14px">閉じる</button>`;
  const ov = dirxOpenSheet("💡 ヒント", body);
  ov.querySelector("[data-dirx-hint-close]").onclick = () => dirxCloseSheet();
}

/* ---- 障害対応モード：原因の選択 ---- */
function dirxCauseSheetBody(){
  const ai = dirxActiveIncident();
  const { scenario, runtime } = ai;
  return scenario.causeOptions.map(o=>{
    const chosen = runtime.causeId === o.id;
    return `
      <button type="button" class="dirx-choice-btn${chosen?(o.correct?" dirx-choice-btn--ok":" dirx-choice-btn--ng"):""}" data-dirx-cause-opt="${esc(o.id)}">
        <span class="dirx-choice-label">${esc(o.label)}</span>
        ${chosen?`<span class="dirx-choice-explain">${esc(o.explain)}</span>`:""}
      </button>`;
  }).join("");
}
function dirxCauseSheetHTML(title){
  return `<div class="dirx-choice-q">${esc(title)}の原因はどれですか？</div>` + dirxCauseSheetBody() +
    `<button type="button" class="ghost" data-dirx-cause-close style="margin-top:14px">閉じる</button>`;
}
function dirxOpenCauseSheet(){
  const ai = dirxActiveIncident();
  if(!ai) return;
  const title = ai.scenario.title;
  const ov = dirxOpenSheet("🔍 原因を回答する", dirxCauseSheetHTML(title));
  const wire = () => {
    const bodyEl = ov.querySelector(".dirx-generic-sheet-body");
    bodyEl.querySelectorAll("[data-dirx-cause-opt]").forEach(b=>b.onclick=()=>{
      dirxChooseCause(b.dataset.dirxCauseOpt);
      bodyEl.innerHTML = dirxCauseSheetHTML(title);
      wire();
      render();
    });
    const c = bodyEl.querySelector("[data-dirx-cause-close]");
    if(c) c.onclick = () => { dirxCloseSheet(); render(); };
  };
  wire();
}

/* ---- 障害対応モード：対応（修正操作）の選択 ---- */
function dirxFixSheetBody(){
  const ai = dirxActiveIncident();
  const { scenario, runtime } = ai;
  return scenario.fixOptions.map(o=>{
    const chosen = runtime.fixId === o.id;
    return `
      <button type="button" class="dirx-choice-btn${chosen?(o.correct?" dirx-choice-btn--ok":" dirx-choice-btn--ng"):""}" data-dirx-fix-opt="${esc(o.id)}">
        <span class="dirx-choice-label">${esc(o.label)}</span>
        ${chosen?`<span class="dirx-choice-explain">${esc(o.explain)}</span>`:""}
      </button>`;
  }).join("");
}
function dirxFixSheetHTML(){
  return `<div class="dirx-choice-q">どの対応を行いますか？</div>` + dirxFixSheetBody() +
    `<button type="button" class="ghost" data-dirx-fix-close style="margin-top:14px">閉じる</button>`;
}
function dirxOpenFixSheet(){
  const ai = dirxActiveIncident();
  if(!ai) return;
  if(!ai.runtime.causeId){ dirxOpenCauseSheet(); return; }
  const ov = dirxOpenSheet("🔧 対応方法を選ぶ", dirxFixSheetHTML());
  const wire = () => {
    const bodyEl = ov.querySelector(".dirx-generic-sheet-body");
    bodyEl.querySelectorAll("[data-dirx-fix-opt]").forEach(b=>b.onclick=onPick);
    const c = bodyEl.querySelector("[data-dirx-fix-close]"); if(c) c.onclick = () => { dirxCloseSheet(); render(); };
  };
  function onPick(e){
    const id = e.currentTarget.dataset.dirxFixOpt;
    const result = dirxChooseFix(id);
    ov.querySelector(".dirx-generic-sheet-body").innerHTML = dirxFixSheetHTML();
    wire();
    render();
    if(result && result.cleared){
      setTimeout(()=>{ dirxCloseSheetImmediate(); dirxOpenIncidentClearSheet(); }, 700);
    }
  }
  wire();
}

/* ---- 障害対応モード：クリア画面 ---- */
function dirxOpenIncidentClearSheet(){
  const summary = dirxIncidentSummary();
  if(!summary) return;
  const { scenario, cause, fix, elapsedMinutes, hintsUsed, usedCommands, rewardAC, rewardExp } = summary;
  const idx = DIRX_SCENARIOS_ORDER.indexOf(scenario.id);
  const next = idx>=0 ? DIRX_SCENARIOS_ORDER[idx+1] : null;
  const body = `
    <div class="dirx-confetti" aria-hidden="true">${"🎉🎊✨🎉🎊".split("").map((c,i)=>`<span style="--i:${i}">${c}</span>`).join("")}</div>
    <div class="dirx-result-title dirx-result-title--ok">クリア！</div>
    <div class="dirx-result-path">${esc(scenario.title)}</div>
    <div class="dirx-reward-row"><span class="dirx-reward-pop">+${rewardAC} AC</span><span class="dirx-reward-pop dirx-reward-pop--exp">+${rewardExp} EXP</span></div>
    <div class="dirx-result-section"><div class="dirx-detail-lab">原因</div><div class="dirx-detail-body">${cause?esc(cause.label):"-"}</div></div>
    <div class="dirx-result-section"><div class="dirx-detail-lab">実施した対応</div><div class="dirx-detail-body">${fix?esc(fix.label):"-"}</div></div>
    <div class="dirx-result-section"><div class="dirx-detail-lab">調査にかかった時間</div><div class="dirx-detail-body">${fmtDirxMinutes(elapsedMinutes)}（使用したヒント：${hintsUsed}回）</div></div>
    ${usedCommands.length?`<div class="dirx-result-section"><div class="dirx-detail-lab">使用したコマンド</div><div class="dirx-chip-row">${usedCommands.map(c=>`<code class="dirx-chip dirx-chip--cmd">${esc(c)}</code>`).join("")}</div></div>`:""}
    <div class="dirx-result-section dirx-detail-section--exam"><div class="dirx-detail-lab">🏆 LPIC-1で覚えるポイント</div><div class="dirx-detail-body">${esc(scenario.lpicPoint)}</div></div>
    <div class="dirx-active-card-actions" style="margin-top:14px">
      <button type="button" class="dirx-tbtn" data-dirx-retry>もう一度挑戦</button>
      ${next?`<button type="button" class="dirx-tbtn dirx-tbtn--accent" data-dirx-next-scenario="${esc(next)}">次のシナリオへ</button>`:""}
      <button type="button" class="dirx-tbtn dirx-tbtn--end" data-dirx-finish>一覧へ戻る</button>
    </div>`;
  const ov = dirxOpenSheet("🎉 障害対応クリア", body);
  ov.querySelectorAll("[data-dirx-retry]").forEach(b=>b.onclick=()=>{ dirxCloseSheet(); dirxStartIncident(scenario.id); render(); });
  ov.querySelectorAll("[data-dirx-next-scenario]").forEach(b=>b.onclick=()=>{ dirxCloseSheet(); dirxStartIncident(b.dataset.dirxNextScenario); go("lpic-dir-explorer"); });
  ov.querySelectorAll("[data-dirx-finish]").forEach(b=>b.onclick=()=>{ dirxCloseSheet(); dirxEndIncident(); go("lpic-dirx-incidents"); });
}

/* ======================= 🧭 探索ミッション：一覧画面 ======================= */
export function renderDirxMissions(){
  updateHeaderNav(true);
  const list = dirxListMissions();
  const cards = list.map(({ mission, completed, active })=>`
    <div class="dirx-card dirx-card--mission${completed?" dirx-card--cleared":""}${active?" dirx-card--active":""}">
      <div class="dirx-card-top">
        <span class="dirx-diff-badge ${dirxDifficultyClass(mission.difficulty)}">${esc(mission.difficulty)}</span>
        ${completed?`<span class="dirx-cleared-badge">✓ クリア済み</span>`:(active?`<span class="dirx-active-badge">挑戦中</span>`:"")}
      </div>
      <div class="dirx-card-title">${esc(mission.title)}</div>
      <div class="dirx-card-prompt">${esc(mission.prompt)}</div>
      <div class="dirx-card-reward">獲得AC：<b>${mission.rewardAC}</b>　獲得経験値：<b>${mission.rewardExp}</b></div>
      <button type="button" class="cta dirx-card-btn" data-dirx-mission-start="${esc(mission.id)}">${active?"再開する":(completed?"もう一度挑戦する":"挑戦する")}</button>
    </div>`).join("");
  app.innerHTML = `
    <div class="q-head" style="margin-bottom:14px">
      <button class="quit" data-go="home">← ホームへ戻る</button>
    </div>
    <div class="sel-head">
      <span class="eyebrow">LPIC-1 ・ 探索ミッション</span>
      <h2 class="sel-title">探索ミッション</h2>
    </div>
    <div class="x-hint" style="margin:10px 0 14px">お題に合うファイルやディレクトリを、実際に触って探し出そう。獲得した探索EXP：<b>${dirxExplorationExp()}</b></div>
    ${dirxTimebarHTML()}
    <div class="dirx-card-list">${cards}</div>
  `;
  wireDirxTimebar();
  app.querySelectorAll("[data-dirx-mission-start]").forEach(b=>b.onclick=()=>{
    dirxStartMission(b.dataset.dirxMissionStart);
    go("lpic-dir-explorer");
  });
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
}

/* ======================= 🛠 障害対応モード：一覧画面 ======================= */
export function renderDirxIncidents(){
  updateHeaderNav(true);
  const list = dirxListScenarios();
  const cards = list.map(({ scenario, completed, active })=>`
    <div class="dirx-card dirx-card--incident${completed?" dirx-card--cleared":""}${active?" dirx-card--active":""}">
      <div class="dirx-card-top">
        <span class="dirx-diff-badge ${dirxDifficultyClass(scenario.difficulty)}">${esc(scenario.difficulty)}</span>
        ${completed?`<span class="dirx-cleared-badge">✓ クリア済み</span>`:(active?`<span class="dirx-active-badge">対応中</span>`:"")}
      </div>
      <div class="dirx-card-title">${esc(scenario.title)}</div>
      <div class="dirx-card-prompt">${esc(scenario.symptom)}</div>
      <div class="dirx-card-reward">想定調査時間：約${scenario.estMinutes}分　獲得AC：<b>${scenario.rewardAC}</b>　獲得経験値：<b>${scenario.rewardExp}</b></div>
      <button type="button" class="cta dirx-card-btn" data-dirx-incident-start="${esc(scenario.id)}">${active?"再開する":(completed?"もう一度挑戦する":"挑戦する")}</button>
    </div>`).join("");
  app.innerHTML = `
    <div class="q-head" style="margin-bottom:14px">
      <button class="quit" data-go="home">← ホームへ戻る</button>
    </div>
    <div class="sel-head">
      <span class="eyebrow">LPIC-1 ・ 障害対応モード</span>
      <h2 class="sel-title">障害対応</h2>
    </div>
    <div class="x-hint" style="margin:10px 0 14px">発生した障害の原因をディレクトリ探索と疑似コマンドで調べ、適切な対応を選んで解決しよう。獲得した対応EXP：<b>${dirxExplorationExp()}</b></div>
    ${dirxTimebarHTML()}
    <div class="dirx-card-list">${cards}</div>
  `;
  wireDirxTimebar();
  app.querySelectorAll("[data-dirx-incident-start]").forEach(b=>b.onclick=()=>{
    dirxStartIncident(b.dataset.dirxIncidentStart);
    go("lpic-dir-explorer");
  });
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
}

/* ======================= 🔔 疑似Linuxイベント：通知一覧画面 ======================= */
export function renderDirxEvents(){
  updateHeaderNav(true);
  const history = dirxEventHistory();
  const rows = history.length ? history.map(ev=>{
    const meta = DIRX_SEVERITY_META[ev.severity] || { label: ev.severity, cssClass: "dirx-sev-info" };
    return `
      <button type="button" class="dirx-event-row ${meta.cssClass}${ev.read?"":" dirx-event-row--unread"}" data-dirx-event-open="${esc(ev.id)}">
        <div class="dirx-event-row-top">
          <span class="dirx-event-sev">${esc(meta.label)}</span>
          <span class="dirx-event-time">${esc(ev.atLabel)}</span>
          ${!ev.read?`<span class="dirx-event-dot" aria-label="未読"></span>`:""}
        </div>
        <div class="dirx-event-msg">${esc(ev.message)}</div>
        <div class="dirx-event-state">${ev.resolved?"解決済み":"未解決"}</div>
      </button>`;
  }).join("") : `<div class="dirx-empty">まだイベントは発生していません。時間を進めると、疑似Linux内で何かが起こるかもしれません。</div>`;
  app.innerHTML = `
    <div class="q-head" style="margin-bottom:14px">
      <button class="quit" data-go="lpic-dir-explorer">← ディレクトリ探索へ戻る</button>
    </div>
    <div class="sel-head">
      <span class="eyebrow">LPIC-1 ・ 疑似Linuxイベント</span>
      <h2 class="sel-title">通知一覧</h2>
    </div>
    ${dirxTimebarHTML()}
    ${history.length ? `<button type="button" class="ghost" data-dirx-mark-all-read style="margin:10px 0">すべて既読にする</button>` : ""}
    <div class="dirx-event-list">${rows}</div>
  `;
  wireDirxTimebar();
  app.querySelectorAll("[data-dirx-mark-all-read]").forEach(b=>b.onclick=()=>{ dirxMarkAllEventsRead(); renderDirxEvents(); });
  app.querySelectorAll("[data-dirx-event-open]").forEach(b=>b.onclick=()=>dirxOpenEventDetailSheet(b.dataset.dirxEventOpen));
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
}

function dirxOpenEventDetailSheet(id){
  const ev = dirxEventHistory().find(e=>e.id===id);
  if(!ev) return;
  const meta = DIRX_SEVERITY_META[ev.severity] || { label: ev.severity, cssClass: "dirx-sev-info" };
  const body = `
    <div class="dirx-event-detail-row"><div class="dirx-detail-lab">発生時刻</div><div class="dirx-detail-body">${esc(ev.atLabel)}（${ev.atTotalMinutes>=1440?Math.floor(ev.atTotalMinutes/1440)+1:1}日目）</div></div>
    <div class="dirx-event-detail-row"><div class="dirx-detail-lab">イベント内容</div><div class="dirx-detail-body">${esc(ev.message)}</div></div>
    <div class="dirx-event-detail-row"><div class="dirx-detail-lab">重要度</div><div class="dirx-detail-body"><span class="dirx-timebar-status ${meta.cssClass}">${esc(meta.label)}</span></div></div>
    ${ev.relatedPath?`<div class="dirx-event-detail-row"><div class="dirx-detail-lab">関連するディレクトリ</div><div class="dirx-detail-body"><code class="dirx-chip">${esc(dirxPathStr(ev.relatedPath))}</code></div></div>`:""}
    <div class="dirx-event-detail-row"><div class="dirx-detail-lab">状態</div><div class="dirx-detail-body">${ev.resolved?"解決済み":"未解決"}</div></div>
    <div class="dirx-active-card-actions" style="margin-top:14px">
      ${ev.relatedPath?`<button type="button" class="dirx-tbtn dirx-tbtn--accent" data-dirx-event-investigate>調査する</button>`:""}
      ${!ev.read?`<button type="button" class="dirx-tbtn" data-dirx-event-read>既読にする</button>`:""}
      ${!ev.resolved?`<button type="button" class="dirx-tbtn" data-dirx-event-resolve>解決済みにする</button>`:""}
    </div>`;
  const ov = dirxOpenSheet("🔔 イベント詳細", body);
  const investBtn = ov.querySelector("[data-dirx-event-investigate]");
  if(investBtn) investBtn.onclick = () => {
    dirxMarkEventRead(ev.id);
    dirxCloseSheet();
    go("lpic-dir-explorer");
    dirxNavigateTo(ev.relatedPath);
  };
  const readBtn = ov.querySelector("[data-dirx-event-read]");
  if(readBtn) readBtn.onclick = () => { dirxMarkEventRead(ev.id); dirxCloseSheet(); renderDirxEvents(); };
  const resolveBtn = ov.querySelector("[data-dirx-event-resolve]");
  if(resolveBtn) resolveBtn.onclick = () => { dirxMarkEventResolved(ev.id); dirxCloseSheet(); renderDirxEvents(); };
}

export function renderQuiz(){
  const q=S.deck[S.idx], pct=(S.idx/S.deck.length)*100, multi=isMulti(q);
  // 「後で見直す」ブックマークは演習モード（コマンド別・ブックマーク演習を含む）でのみ表示
  const canMark = S.mode==="practice" && !S.review;
  const marked = canMark && isMarked(q.id);

  app.innerHTML = `
    <div class="q-head">
      <button class="quit" data-go="home">✕ 中断</button>
      <span class="q-count">${S.review?'<span class="rev-tag-q">🔁 復習</span> ':(S.mode==="practice"?`<span class="mode-tag practice">📝 ${S.commandCmd?esc(S.commandCmd)+" 演習":(S.markedRun?"後で見直す 演習":"演習")}</span> `:'<span class="mode-tag exam">🎯 試験</span> ')}${S.idx+1} <em>/ ${S.deck.length}</em></span>
    </div>
    <div class="progress"><div class="progress-fill" style="width:${pct}%"></div></div>
    <div class="q-badge-row">
      <div class="q-badge"><span class="stars">${stars(q.imp)}</span><span>重要度 ${q.imp}</span><span class="pts">${pts(q)} 点</span>${multi?`<span class="multi">複数選択（${q.c.length}つ）</span>`:""}</div>
      ${canMark?`<button class="mark-btn${marked?" on":""}" data-mark aria-pressed="${marked}">🔖 ${marked?"登録済み":"後で見直す"}</button>`:""}
    </div>
    <p class="q-text">${esc(q.q)}</p>
    
    <div class="opts">
      ${q.o.map((opt,i)=>{
        const picked=S.sel.indexOf(i)>=0;
        return `<button class="opt${picked?" picked":""}" data-pick="${i}">
          <span class="opt-key${multi?" box":""}">${L[i]}</span><span class="opt-label">${esc(opt)}</span></button>`;
      }).join("")}
    </div>

    <div style="display:flex; gap:10px; margin-top:20px;">
      ${S.idx > 0 ? `
        <button class="ghost" id="quiz-prev" style="flex:1; margin-top:0; padding:16px;">← 戻る</button>
      ` : ""}
      <button class="cta" data-commit ${S.sel.length===0?"disabled":""} style="flex:2; margin-top:0;">
        ${S.idx+1<S.deck.length?"次の問題へ ➔":"採点する 🎉"}
      </button>
    </div>
  `;

  // 選択肢をタップした時の処理（元のロジックを完全維持）
  app.querySelectorAll("[data-pick]").forEach(b=>b.onclick=()=>pick(+b.dataset.pick));
  
  // 中断ボタンなどの遷移処理
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  
  // 次へ進む（コミット）処理
  const cm=app.querySelector("[data-commit]"); if(cm) cm.onclick=commit;

  // 🔖 後で見直すブックマークの付け外し（選択状態S.selはrender()で維持される）
  const mk=app.querySelector("[data-mark]"); if(mk) mk.onclick=()=>{ toggleMarked(q.id); render(); };

  // 💡 【新設】戻るボタンが画面にある場合のみ、クリックイベントを紐付ける
  const prevBtn = document.getElementById("quiz-prev");
  if(prevBtn) {
    prevBtn.onclick = () => {
      // core.js から prevQuestion を動的に読み込んで実行
      import('./core.js').then(core => {
        core.prevQuestion();
      });
    };
  }
}


export function renderResult(){
  const e=S.last;
  const max = e.scoreMax || 1000;
  const ratio = max ? Math.min(1, e.score/max) : 0;
  const R=80, C=2*Math.PI*R, off=C*(1-ratio);
  const isExam = (e.mode==="exam");
  const isPractice = (e.mode==="practice");
  const passed = isExam ? (e.score>=PASS) : (ratio>=0.7);
  const t={high:[0,0],mid:[0,0],low:[0,0]};
  S.deck.forEach((q,i)=>{ const k=q.imp>=4?"high":(q.imp===3?"mid":"low"); t[k][1]++; if(grade(q,S.picks[i]).full)t[k][0]++; });
  const TLAB={high:"重要度 高 (4-5)", mid:"重要度 中 (3)", low:"重要度 低 (1-2)"};
  const gain = (e.bpGain!=null) ? e.bpGain : e.score;
  let expLine, verdictTxt, verdictPass, subLine;
  if(isPractice){
    expLine = S.commandCmd ? `${S.commandCmd} コマンド演習：獲得した配点合計がそのまま EXP` : "演習モード：獲得した配点合計がそのまま EXP";
    verdictTxt = S.commandCmd ? `${S.commandCmd} コマンド演習 完了` : "演習完了"; verdictPass = ratio>=0.7;
    subLine = `獲得 ${e.score} / ${max} 点（実際の配点合計・部分点込み・小数切り上げ）`;
  } else if(e.mode==="review"){
    expLine = "復習：獲得した配点合計がそのまま EXP";
    verdictTxt = "復習完了"; verdictPass = ratio>=0.7;
    subLine = `獲得 ${e.score} / ${max} 点（実際の配点合計・部分点込み・小数切り上げ）`;
  } else { // 試験モード（1000点満点換算・従来どおり）
    expLine = gain>0 ? `試験モード：${e.score}点 × ${e.mult} = ${gain} EXP` : "試験モード：700点未満のため EXP 獲得なし";
    verdictPass = passed; verdictTxt = passed ? "合格！ボーナス EXP 獲得" : "不合格（700点未満）・EXP なし";
    subLine = `獲得 ${e.earned} / ${e.totalPts} 点（重み付け・部分点込み）→ 1000点換算で ${e.score} 点`;
  }
  app.innerHTML = `
    <div class="gauge-wrap">
      <svg viewBox="0 0 200 200" class="gauge">
        <circle cx="100" cy="100" r="${R}" class="gauge-bg"></circle>
        <circle cx="100" cy="100" r="${R}" class="gauge-fg ${verdictPass?"pass":"fail"}"
          stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 100 100)"></circle>
      </svg>
      <div class="gauge-mid"><div class="gauge-score">${e.score}</div><div class="gauge-max">/ ${max}</div></div>
    </div>
    <div class="verdict ${verdictPass?"pass":"fail"}">${verdictTxt}</div>
    <div class="result-meta">完全正解 ${e.correct} / ${e.total} 問</div>
    <div class="result-sub">${subLine}</div>
    <div class="breakdown">
      ${Object.keys(t).filter(k=>t[k][1]>0).map(k=>`
        <div class="bd-row"><span class="bd-lab" style="width:96px">${TLAB[k]}</span>
        <div class="bd-bar"><div class="bd-fill" style="width:${t[k][0]/t[k][1]*100}%"></div></div>
        <span class="bd-num">${t[k][0]}/${t[k][1]}</span></div>`).join("")}
    </div>
    <div class="bp-card">
      <div class="bp-row"><span>⚡ 獲得EXP</span><span class="bp-gain">+${gain} EXP</span></div>
      <div class="bp-exp-line">${esc(expLine)}</div>
      <div class="bp-total">資格内＆全体レベルに加算 ・ 累計 ${(e.bpTotal||getBP()).toLocaleString()} BP</div>
      ${(e.unlocked&&e.unlocked.length)?`<div class="bp-unlock">🎉 新たに稼働：${e.unlocked.map(esc).join("、")}</div>`:""}
      <button class="bp-link" data-go="analytics">📊 全ユーザーの統計を見る →</button>
    </div>
    <div class="coin-card">
      <div class="coin-row"><span class="coin-ic">💰</span><span class="coin-gain">+${(e.coinGain!=null?e.coinGain:0)} AC 獲得！</span></div>
      <div class="coin-total">現在の総所持：${(e.coinTotal!=null?e.coinTotal:(S.coins||0)).toLocaleString()} AC</div>
    </div>
    <div class="actions">
      <button class="cta" data-go="review">解答・解説を確認</button>
      <button class="ghost" data-retry>もう一度挑戦</button>
      <button class="ghost" data-go="home">🏠 ホームへ戻る</button>
    </div>
  `;
  requestAnimationFrame(()=>{ const c=app.querySelector(".gauge-fg"); if(c)c.style.strokeDashoffset=off; });
  app.querySelector("[data-retry]").onclick=()=>{ if(S.review){ if(loadWrong().length) startReview(); else go("home"); } else if(S.commandCmd){ startCommandPractice(S.commandCmd); } else if(S.markedRun){ if(loadMarked().length) startMarkedPractice(); else go("home"); } else start(S.mode); };
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
}

export function renderReview(){
  // 演習モードの解説確認中も「後で見直す」を付け外しできる（試験・復習の解説では非表示）
  const canMark = S.mode==="practice" && !S.review;
  const rows = S.deck.map((q,i)=>{
    const sel=S.picks[i]||[], cor=correctSet(q), g=grade(q,sel), W=pts(q), multi=isMulti(q);
    let kind,label;
    if(g.full){ kind="ok"; label="正解"; }
    else if(g.earned>0){ kind="partial"; label="一部正解"; }
    else { kind="ng"; label="不正解"; }
    const opts = q.o.map((opt,j)=>{
      const isCor=cor.indexOf(j)>=0, picked=sel.indexOf(j)>=0;
      let cls="opt"; let mark="";
      if(isCor){ cls+=" correct"; mark='<span class="opt-mark">✓</span>'; }
      else if(picked){ cls+=" wrong"; mark='<span class="opt-mark">✕</span>'; }
      else cls+=" dim";
      return `<div class="${cls}"><span class="opt-key${multi?" box":""}">${L[j]}</span><span class="opt-label">${esc(opt)}</span>${mark}</div>`;
    }).join("");
    const earnTxt = `獲得 ${Math.round(g.earned*10)/10} / ${W} 点`;
    const markedNow = canMark && isMarked(q.id);
    return `<div class="review-q">
      <div class="review-num"><span>第 ${i+1} 問 ・ 重要度 ${q.imp}${multi?" ・ 複数選択":""}</span><span class="rv-tag ${kind}">${label}・${earnTxt}</span></div>
      <p class="q-text">${esc(q.q)}</p>
      <div class="opts">${opts}</div>
      <div class="expl ${kind}"><strong>解説</strong><span>${esc(q.e)}</span></div>
      ${canMark?`<button class="mark-btn mark-btn--review${markedNow?" on":""}" data-mark-i="${i}" aria-pressed="${markedNow}">🔖 ${markedNow?"登録済み":"後で見直す"}</button>`:""}
      <div class="qstat" id="qstat-${q.id}">📊 全体正答率：<span class="qstat-v">—</span></div>
    </div>`;
  }).join("");
  app.innerHTML = `
    <div class="q-head"><button class="quit" data-go="result">← 結果へ</button><span class="q-count">解答・解説</span></div>
    ${rows}
    <button class="ghost" data-go="home">🏠 ホームへ戻る</button>
  `;
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  // 🔖 各問のブックマーク付け外し（再描画せずボタンだけ更新し、スクロール位置を保つ）
  app.querySelectorAll("[data-mark-i]").forEach(b=>b.onclick=()=>{
    const q=S.deck[+b.dataset.markI]; if(!q) return;
    const on=toggleMarked(q.id);
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on);
    b.textContent=`🔖 ${on?"登録済み":"後で見直す"}`;
  });
  loadReviewStats();
}

// 正答率（%）：correct/attempts×100 を小数第1位（第2位四捨五入）で。データ無しはnull

const HIST_TABS = [
  {key:"all", label:"すべて"},
  {key:"practice", label:"演習モード"},
  {key:"exam", label:"試験モード"},
  {key:"review", label:"復習モード"},
];

export function renderHistory(){
  const h=loadHist();
  if(!h.length){
    app.innerHTML=`<div class="q-head"><button class="quit" data-go="home">🏠 ホーム</button><span class="q-count">履歴</span></div>
      <div class="empty">まだ記録がありません。<br>問題を解くとここにスコアが残ります。</div>`;
    app.querySelector("[data-go]").onclick=()=>go("home"); return;
  }
  const activeTab = state.historyTab || "all";
  const filtered = activeTab==="all" ? h : h.filter(x=>x.mode===activeTab);
  const recent=filtered.slice(0,12).reverse();
  const rOf = x => { const mx=x.scoreMax||1000; return mx? Math.min(1, x.score/mx) : 0; };
  app.innerHTML = `
    <div class="q-head"><button class="quit" data-go="home">🏠 ホーム</button><span class="q-count">履歴</span></div>
    <div class="hist-tabs">
      ${HIST_TABS.map(t=>`<button class="hist-tab${activeTab===t.key?" active":""}" data-htab="${t.key}">${t.label}</button>`).join("")}
    </div>
    ${filtered.length ? `
    <div class="chart">
      ${recent.map(x=>`<div class="chart-col">
        <div class="chart-bar-track"><div class="chart-bar ${rOf(x)>=0.7?"pass":"fail"}" style="height:${rOf(x)*100}%"></div></div>
        <span class="chart-val">${x.score}</span></div>`).join("")}
      <div class="chart-passline" style="bottom:70%"><span>70%</span></div>
    </div>
    <div class="hist-list">
      ${filtered.map(x=>`<div class="hist-row">
        <div class="hist-left"><span class="hist-mode">${x.modeLabel||"ランダム"}</span><span class="hist-date">${fmt(x.date)}</span></div>
        <div class="hist-right"><span class="hist-score ${rOf(x)>=0.7?"pass":"fail"}">${x.score}<small>/${x.scoreMax||1000}</small></span><span class="hist-correct">${x.correct}/${x.total}</span></div>
      </div>`).join("")}
    </div>` : `<div class="empty">このモードの履歴はまだありません。</div>`}
  `;
  app.querySelector('[data-go="home"]').onclick=()=>go("home");
  app.querySelectorAll("[data-htab]").forEach(b=>b.onclick=()=>{ state.historyTab=b.dataset.htab; renderHistory(); });
}


/* ======================= 用語辞典のデータ ======================= */
/* 各用語: t=用語, m=説明（定義）, k=重要ポイント */

export let dictSort = "theme"; // theme | aiueo
// 用語辞典の検索キーワード。並び替えやバックグラウンド更新による再描画で
// 入力中の内容が消えないよう、画面の外（モジュール変数）に持たせる
let dictQuery = "";

export function renderDict(){
  const items = CONCEPTS.map((c,i)=>({c,i}));
  if(dictSort==="aiueo") items.sort((a,b)=>a.c.t.localeCompare(b.c.t,"ja"));
  app.innerHTML = `
    <div class="q-head"><button class="quit" data-go="home">🏠 ホーム</button><span class="q-count">用語辞典</span></div>
    <input id="dict-search" class="dict-search" placeholder="用語を検索（例：RBAC、冗長、ゼロトラスト）" autocomplete="off">
    <div class="dict-bar">
      <span id="dict-count">${CONCEPTS.length} 語</span>
      <button id="dict-sort" class="dict-sortbtn">${dictSort==="theme"?"並び：テーマ順":"並び：あいうえお順"}</button>
    </div>
    <div id="dict-list">
      ${items.map(({c})=>`
        <div class="dict-card" data-text="${esc((c.t+' '+c.m+' '+c.k.map(k=>k.l).join(' ')).toLowerCase())}">
          <div class="dict-term">${esc(c.t)}</div>
          <div class="dict-def">${esc(c.m)}</div>
          ${c.k.length?`<div class="dict-points">${c.k.map(k=>`<span class="dict-pt">${esc(k.l)}</span>`).join("")}</div>`:""}
        </div>`).join("")}
    </div>
  `;
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  const sb=document.getElementById("dict-search");
  const list=document.getElementById("dict-list");
  const cnt=document.getElementById("dict-count");
  // 絞り込みの実行。並び替えやバックグラウンドの再描画が入っても
  // 検索キーワードと絞り込み結果がそのまま残るよう、同じ処理を初期表示にも使う
  const applyDictFilter=()=>{
    const q=(dictQuery||"").trim().toLowerCase(); let n=0;
    list.querySelectorAll(".dict-card").forEach(card=>{
      const show=!q || card.dataset.text.indexOf(q)>=0;
      card.style.display=show?"":"none"; if(show)n++;
    });
    cnt.textContent = q ? (n+" 語 ヒット") : (CONCEPTS.length+" 語");
  };
  if(sb){
    sb.value = dictQuery;
    sb.oninput=()=>{ dictQuery = sb.value; applyDictFilter(); };
  }
  applyDictFilter();
  const srt=document.getElementById("dict-sort");
  if(srt) srt.onclick=()=>{ dictSort = dictSort==="theme"?"aiueo":"theme"; render(); };
}

/* ======================= データセンター育成 ======================= */

export function worldMapSVG(n){
  const dots = REGIONS.map(r=>{
    const on = n>=r.lv;
    return `<g class="rg ${on?'on':'off'}">
      ${on?`<circle class="rg-glow" cx="${r.x}" cy="${r.y}" r="7"/>`:''}
      <circle class="rg-dot" cx="${r.x}" cy="${r.y}" r="${on?3:2}"/>
      ${on?`<text class="rg-nm" x="${r.x}" y="${r.y-8}">${esc(r.name)}</text>`:''}
    </g>`;
  }).join("");
  const grat = [26,52,78,104].map(y=>`<line x1="0" y1="${y}" x2="320" y2="${y}"/>`).join("")
             + [64,128,192,256].map(x=>`<line x1="${x}" y1="0" x2="${x}" y2="130"/>`).join("");
  return `<svg class="scene-map" viewBox="0 0 320 130" preserveAspectRatio="xMidYMid slice">
    <g class="grat">${grat}</g>
    <g class="land">
      <path d="M30,30 L70,26 L88,46 L80,72 L96,96 L86,116 L66,112 L58,84 L40,66 L34,46 Z"/>
      <path d="M150,26 L182,30 L188,52 L172,74 L176,96 L160,104 L150,82 L156,58 L146,42 Z"/>
      <path d="M205,28 L280,24 L300,44 L282,58 L250,62 L232,52 L210,50 Z"/>
      <path d="M276,96 L302,98 L300,114 L280,112 Z"/>
    </g>
    ${dots}
  </svg>`;
}

export function homeScene(){
  const bp=getBP(), n=dcCount(bp), ph=dcPhase(n);
  
  // 🔥 【追加】デフォルト背景（b1〜b4）の代わりに購入したスキン背景のクラスを適用
  const currentSkin = S.currentSkin || "default";
  const skinClass = "sb-theme-" + currentSkin;

  const band=ph.band;
  const starN = band==="b4"?16:(band==="b3"?9:0);
  let stars="";
  for(let i=0;i<starN;i++){ stars+=`<span class="scene-star" style="left:${(i*37%92)+3}%;top:${(i*29%48)+6}%;animation-delay:${(i%5)*0.4}s"></span>`; }
  let body;
  if(ph.worldmap){
    body = worldMapSVG(n);
  } else {
    const ons=TIERS.filter(t=>bp>=t.bp);
    const sizes=[26,31,24,33,28,35,25,30,23,34,27,32];
    const builds = ons.map((t,i)=>`<span class="scene-b" style="font-size:${sizes[i%sizes.length]}px">${t.icon}</span>`).join("");
    const next=TIERS.find(t=>t.bp>bp);
    const tail = next?`<span class="scene-ghost">🏗️</span>`:"";
    body = `<div class="scene-ground">${builds}${tail}</div>`;
  }
  
  // 🔥 【修正】クラス名に ${skinClass} を上書き合体
  return `<div class="home-scene ${skinClass}">
    ${stars}
    <div class="scene-info"><span class="scene-lvl">Lv.${n}</span><span class="scene-bp">${bp.toLocaleString()} BP</span></div>
    ${body}
  </div>`;
}


export function renderAnalytics(){
  // 匿名化された試験モードのスコア分布（モック集計データ：0-99 … 900-1000 の10区間）
  const bins   = [2,5,9,16,28,44,63,52,30,14];
  const labels = ["0","100","200","300","400","500","600","700","800","900"];
  const total = bins.reduce((a,b)=>a+b,0);
  const maxv  = Math.max(...bins);
  const avg   = Math.round(bins.reduce((s,c,i)=>s + c*(i*100+50), 0) / total);
  const passCount = bins.slice(7).reduce((a,b)=>a+b,0);   // 700点以上
  const passRate  = Math.round(passCount/total*100);

  const barsHTML = bins.map((c,i)=>{
    const h = Math.max(4, Math.round(c/maxv*100));
    const isPass = i>=7;
    return `<div class="an-bar-wrap">
      <div class="an-bar ${isPass?'an-pass':''}" style="height:${h}%"><span class="an-bar-v">${c}</span></div>
      <div class="an-bar-x">${labels[i]}</div>
    </div>`;
  }).join("");

  // 直近クリアした匿名エンジニア5名（モック・毎回更新でシャッフル）
  const hex = ()=>Math.floor(Math.random()*0xffff).toString(16).toUpperCase().padStart(4,"0");
  const logHTML = Array.from({length:5}).map((_,i)=>{
    const sc = 480 + Math.floor(Math.random()*520);   // 480〜999点
    const ok = sc>=700;
    return `<div class="an-log-row ${ok?'ok':'ng'}" style="animation-delay:${i*0.06}s">
      <span class="an-log-id">エンジニア${hex()}</span>
      <span class="an-log-arrow">➔</span>
      <span class="an-log-score">${sc}点</span>
      <span class="an-log-judge">${ok?'合格！':'不合格'}</span>
    </div>`;
  }).join("");

  app.innerHTML = `
    <div class="q-head"><button class="quit" data-go="${S.cert?'home':'select'}">← 戻る</button><span class="q-count">統計パネル</span></div>
    <div class="an-card">
      <div class="an-ttl">全ユーザーの試験モード結果</div>
      <div class="an-sub">匿名化されたスコア分布（0〜1000点）</div>
      <div class="an-chart">
        <div class="an-passline"><span>合格 700</span></div>
        ${barsHTML}
      </div>
      <div class="an-aggro">
        <div class="an-ag"><div class="an-ag-num">${avg}</div><div class="an-ag-lab">全ユーザー平均点</div></div>
        <div class="an-ag"><div class="an-ag-num">${passRate}<small>%</small></div><div class="an-ag-lab">合格率（700点以上）</div></div>
        <div class="an-ag"><div class="an-ag-num">${total.toLocaleString()}</div><div class="an-ag-lab">集計サンプル数</div></div>
      </div>
    </div>
    <div class="an-card">
      <div class="an-ttl">📡 直近クリアした匿名エンジニア</div>
      <div class="an-log">${logHTML}</div>
      <button class="ghost" id="an-refresh" style="margin-top:10px">⟲ 最新を取得</button>
    </div>
  `;
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  const rf=document.getElementById("an-refresh"); if(rf) rf.onclick=()=>renderAnalytics();
}

/* ======================= データ引き継ぎ（保存・復元） ======================= */

export function renderTransfer(){
  const code=exportCode();
  const h=loadHist();
  app.innerHTML = `
    <div class="q-head"><button class="quit" data-go="home">🏠 ホーム</button><span class="q-count">データ引き継ぎ</span></div>
    <p class="x-hint" style="margin-top:0;margin-bottom:14px">スコア履歴・ビルドポイント・復習リストを1本のコードにまとめて保存／復元できます。アカウント登録は不要です。</p>

    <div class="x-sub" style="margin-top:0">① 引き継ぎコードを書き出す</div>
    <p class="x-hint" style="margin-top:0;margin-bottom:8px">下のコードをメモ帳などにコピーして保管してください（履歴 ${h.length}件・${getBP().toLocaleString()} BP）。</p>
    <textarea id="tf-out" class="x-area" readonly style="min-height:96px;font-size:12px">${esc(code)}</textarea>
    <button class="cta" id="tf-copy" style="margin-top:10px">コードをコピー</button>

    <div class="dc-sub">② コードから復元する</div>
    <p class="x-hint" style="margin-top:0;margin-bottom:8px">控えておいたコードを貼り付けて復元します。<b style="color:var(--gold)">この端末の現在のデータは上書き</b>されます。</p>
    <textarea id="tf-in" class="x-area" placeholder="AZ9-... を貼り付け" style="min-height:96px;font-size:12px"></textarea>
    <button class="ghost" id="tf-load" style="margin-top:10px">このコードで復元する</button>
    <div id="tf-msg" class="x-hint" style="margin-top:12px"></div>
  `;
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  const msg=document.getElementById("tf-msg");
  const setMsg=(t,c)=>{ msg.innerHTML=t; msg.style.color=c||"var(--muted)"; };

  document.getElementById("tf-copy").onclick=()=>{
    const ta=document.getElementById("tf-out");
    ta.focus(); ta.select(); ta.setSelectionRange(0,99999);
    let ok=false;
    try{ ok=document.execCommand("copy"); }catch(e){}
    if(navigator.clipboard){ navigator.clipboard.writeText(ta.value).then(()=>{},()=>{}); ok=true; }
    setMsg(ok?"✓ コピーしました。メモ帳やメールに貼り付けて保管してください。":"自動コピーできませんでした。コードを長押しで選択してコピーしてください。", ok?"var(--good)":"var(--gold)");
  };

  document.getElementById("tf-load").onclick=()=>{
    const v=document.getElementById("tf-in").value;
    if(!v.trim()){ setMsg("コードを貼り付けてください。","var(--gold)"); return; }
    if(!confirm("この端末の現在のデータ（履歴・BP・復習リスト）を、入力したコードの内容で上書きします。よろしいですか？")) return;
    try{
      const obj=importCode(v);
      setMsg("✓ 復元しました（履歴 "+( (obj.hist||[]).length )+"件・"+(obj.bp||0).toLocaleString()+" BP）。ホームに戻ります。","var(--good)");
      setTimeout(()=>go("home"), 900);
    }catch(e){
      setMsg("⚠ "+esc(String(e.message||e))+"。コードをもう一度確認してください。","var(--bad)");
    }
  };
}

/* ======================= 複数資格対応 ======================= */
/* 資格レジストリ。資格を増やすときはここに1要素足すだけ。
   status:"ready" … 学習可能 / "coming" … 近日公開（ロック表示）          */
/* ======================= SC-300 のデータ ======================= */
/* SC-300: Microsoft Identity and Access Administrator（IDとアクセスの管理）*/

/* お天気カード：資格一覧画面の上部。左から「日付＋デジタル時計」
   「天気（地名・気温・降水確率）」「Gemini相談への導線」の構成。
   位置情報が取得できない場合はデフォルト地点（東京）にフォールバックし、
   取得できないことを隠さずラベルで示す。天気データ自体が取得できない
   場合は「取得できませんでした」の案内を表示し、実データのように見える
   ダミー値は表示しない。 */

let clockTimer = null;
let weatherRefreshTimer = null;
const WEATHER_REFRESH_MS = 20 * 60 * 1000; // 20分ごとに天気を自動で再フェッチする

const temperatureColors = [
  { min: 35, color: "#D32F2F" },
  { min: 30, color: "#F4511E" },
  { min: 25, color: "#FB8C00" },
  { min: 20, color: "#FDD835" },
  { min: 15, color: "#66BB6A" },
  { min: 10, color: "#26A69A" },
  { min: 5,  color: "#42A5F5" },
  { min: 0,  color: "#5C6BC0" },
  { min: -Infinity, color: "#3949AB" }
];

function getTemperatureColor(temp){
  const found = temperatureColors.find(t => temp >= t.min);
  return found ? found.color : temperatureColors[temperatureColors.length - 1].color;
}

// 1時間降水量(mm)の気象庁階級区分に沿った配色。降水量が増えるほど
// 薄い水色→青→濃い青→紫と変化させ、強さが直感的にわかるようにする
const precipitationColors = [
  { min: 25,   color: "#7E57C2" }, // 非常に激しい雨
  { min: 15,   color: "#3949AB" }, // 激しい雨
  { min: 10,   color: "#1565C0" }, // 強い雨
  { min: 6,    color: "#1E88E5" }, // やや強い雨
  { min: 3,    color: "#42A5F5" }, // 雨
  { min: 0.1,  color: "#90CAF9" }, // 弱い雨
  { min: -Infinity, color: "#B0BEC5" } // 降水なし
];

function getPrecipitationColor(mm){
  const found = precipitationColors.find(p => mm >= p.min);
  return found ? found.color : precipitationColors[precipitationColors.length - 1].color;
}

// カードは左（比率2.4）＝「日付＋デジタル時計｜天気（地名・アイコン・気温）」
// ＋その下の降水確率の推移を示す滑らかな曲線グラフ、
// 右（比率1）＝ミニまるチャピ（タップでチャッピーハウスへ遷移）の2エリア構成。
// Gemini相談への導線はホーム画面右下の常設フローティングボタン（geminiFabHTML）に集約した。
function weatherCardHTML(){
  // お天気カード右端のスロット（旧デジタル盆栽の位置）にミニまるチャピを表示する。
  // 設定でホーム表示OFFのときはスロットごと省き、3カラムのグリッドへ詰める
  const chappyOn = isChappyHomeWidgetVisible();
  return `
    <div class="news-card weather-card" id="weather-card">
      <div class="weather-body">
        <div class="weather-top${chappyOn ? "" : " weather-top--nochappy"}">
          <div class="weather-col weather-datetime">
            <div class="weather-date" id="weather-clock-date"></div>
            <div class="weather-time">
              <span id="weather-clock-time"></span><span class="weather-time-sec" id="weather-clock-sec"></span>
            </div>
          </div>
          <div class="weather-col weather-info" id="weather-info">
            <div class="weather-city-row">
              <span class="weather-city" id="weather-city">取得中…</span>
              <button type="button" class="weather-retry-btn" id="weather-retry-loc" title="現在地を再取得" aria-label="現在地を再取得" hidden>⟳</button>
            </div>
            <div class="weather-asof" id="weather-asof"></div>
            <div class="weather-main">
              <span class="weather-icon" id="weather-icon">🌡️</span>
              <span class="weather-temp" id="weather-temp"></span>
            </div>
          </div>
          <div class="weather-col weather-precip-alert" id="weather-precip-alert">
            <div class="weather-precip-label">降水量</div>
            <div class="weather-precip-now" id="weather-precip-now"><span class="weather-precip-now-value" id="weather-precip-now-value"></span>mm/h</div>
            <div class="weather-precip-comment" id="weather-precip-comment">
              <span class="weather-precip-comment-track" id="weather-precip-comment-track"></span>
            </div>
          </div>
          ${chappyOn ? `<div class="weather-col weather-chappy">${chappyMiniWidgetHTML()}</div>` : ""}
        </div>
        <div class="weather-pop-chart" id="weather-pop-chart"></div>
      </div>
    </div>`;
}

const WEEKDAY_JA = ["日","月","火","水","木","金","土"];

function updateClock(){
  const dateEl = document.getElementById("weather-clock-date");
  const timeEl = document.getElementById("weather-clock-time");
  if(!dateEl && !timeEl){
    if(clockTimer){ clearInterval(clockTimer); clockTimer = null; }
    return;
  }
  const now = new Date();
  const pad = (n) => String(n).padStart(2,"0");
  if(dateEl) dateEl.textContent = `${now.getMonth()+1}/${now.getDate()}(${WEEKDAY_JA[now.getDay()]})`;
  if(timeEl) timeEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const secEl = document.getElementById("weather-clock-sec");
  if(secEl) secEl.textContent = `:${pad(now.getSeconds())}`;
}

function startClock(){
  if(clockTimer){ clearInterval(clockTimer); clockTimer = null; }
  updateClock();
  clockTimer = setInterval(updateClock, 1000);
}

// 予報時刻(ISO文字列)を軸ラベル用の「時」の数字だけに整形する（単位の「時」は
// 軸全体で右端に1回だけ表示するため、ラベル自体には付けない）
function formatPopChartHour(isoTime){
  return `${new Date(isoTime).getHours()}`;
}

// 点列を通る滑らかな曲線（Catmull-Rom→3次ベジェ変換）のSVGパスを組み立てる。
// 折れ線をそのまま描くとカクカクするため、各区間を前後の点も考慮した
// ベジェ曲線に変換し、視覚的に滑らかな推移として見せる
function catmullRomSmoothPath(points){
  if(points.length < 2) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for(let i=0; i<points.length-1; i++){
    const p0 = points[i-1] || points[i];
    const p1 = points[i];
    const p2 = points[i+1];
    const p3 = points[i+2] || p2;
    const cp1x = p1.x + (p2.x - p0.x)/6;
    const cp1y = p1.y + (p2.y - p0.y)/6;
    const cp2x = p2.x - (p3.x - p1.x)/6;
    const cp2y = p2.y - (p3.y - p1.y)/6;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

const POP_CHART_W = 220, POP_CHART_H = 126, POP_CHART_PAD = 4;
const POP_CHART_Y_TICKS = [100, 80, 60, 40, 20, 0]; // 縦軸目盛り・％（左軸、上→下）
// 縦軸目盛り・降水量mm（右軸、上→下）。天気アプリでよく使われる区切り
// （弱い雨〜激しい雨の目安）に合わせているため値の間隔は不均等だが、
// 目盛り線自体はPOP_CHART_Y_TICKSと同じ6段に均等割りして共有する
const PRECIP_Y_TICKS = [15, 10, 5, 3, 1, 0];
const PRECIP_DANGER_MM = 20; // これを超えたら棒を警告色にする
const POP_CHART_LABEL_EVERY = 3; // 横軸の数字は3時間ごとにのみ表示する

// 直近1時間の降水量(mm)に応じた注意喚起の文言（気象庁の階級区分・
// 体感の目安を参考にした簡易的な区分）
function precipCautionText(mm){
  if(mm < 1) return "傘がなくてもなんとか歩けるレベル";
  if(mm < 2) return "シトシト降る雨。少し歩くなら傘が欲しくなります";
  if(mm < 3) return "ほとんどの人が「傘が必要」と感じる強さです";
  if(mm < 10) return "本降りの雨。傘は絶対に必要です";
  if(mm < 20) return "気象庁の「やや強い雨」。地面一面に水たまりができます";
  if(mm < 30) return "気象庁の「強い雨」。傘をさしていても濡れます";
  return "気象庁の「激しい雨」。道路が川のようになるおそれがあります";
}

// 直近1時間の降水量が0mmの場合は雨が降っていない旨を表示する
function precipCommentText(mm){
  if(!(mm > 0)) return "雨は降っていません";
  return precipCautionText(mm);
}

function precipMmLabel(mm){
  const v = Math.max(0, mm);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

// コメント欄のテキストが表示枠に収まりきらない場合のみ、右→左へ流れる
// マーキー表示にする。収まる場合は静止表示のままにして、無用なアニメーションを避ける
function updatePrecipAlertMarquee(){
  const container = document.getElementById("weather-precip-comment");
  const track = document.getElementById("weather-precip-comment-track");
  if(!container || !track) return;
  track.classList.remove("weather-precip-marquee");
  track.style.removeProperty("--weather-precip-marquee-distance");
  track.style.animationDuration = "";
  const containerW = container.clientWidth;
  const trackW = track.scrollWidth;
  if(trackW > containerW){
    const distance = containerW + trackW;
    const duration = Math.max(6, distance / 45); // 45px/秒の速さでスクロールする
    track.style.setProperty("--weather-precip-marquee-distance", `${distance}px`);
    track.style.animationDuration = `${duration}s`;
    track.classList.add("weather-precip-marquee");
  }
}

// 目盛りのインデックス位置（0=一番上、tickCount-1=一番下）をSVGのY座標に変換する。
// 端（インデックス0・最後）ではストローク幅の半分がSVG表示範囲の外に出て
// 消えてしまうため、半径0.5分だけ内側にクランプする
function axisTickY(index, tickCount){
  const raw = (index / (tickCount - 1)) * POP_CHART_H;
  return Math.min(POP_CHART_H - 0.5, Math.max(0.5, raw));
}

// 降水量(mm)を、PRECIP_Y_TICKS の目盛り間隔（不等間隔）に沿って0(下端)〜
// 1(上端)の比率に変換する。目盛りの間は線形補間するため、棒グラフの高さが
// 対応する目盛り線の位置にちょうど揃う
function precipValueToFrac(mm){
  const ticksAsc = [...PRECIP_Y_TICKS].reverse(); // [0,3,6,10,15,25]
  const bands = ticksAsc.length - 1;
  const max = ticksAsc[bands];
  const v = Math.max(0, Math.min(max, mm));
  for(let i=0; i<bands; i++){
    const lo = ticksAsc[i], hi = ticksAsc[i+1];
    if(v <= hi || i === bands - 1){
      const frac = hi > lo ? (v - lo) / (hi - lo) : 0;
      return (i + frac) / bands;
    }
  }
  return 0;
}

// 降水確率の推移（今＋1時間おき24点）を、数値の縦並びリストではなく
// 滑らかな曲線グラフとして描画する。1時間ごとの点をそのままドットとして
// 打ち、横軸の数字ラベルは3時間ごとにのみ間引いて表示する。縦軸には
// 0〜100%の目盛りを添え、単位（%）は縦軸の一番上、単位（時）は横軸の
// 一番右端にそれぞれ1回だけ表示する
function renderWeatherPopChart(w){
  const el = document.getElementById("weather-pop-chart");
  if(!el) return;
  const points = (w && typeof w.pop === "number")
    ? [{ label:"今", pop:w.pop, precip:w.precip }, ...(w.hourly||[]).map(h => ({ label: formatPopChartHour(h.time), pop:h.pop, precip:h.precip }))]
    : [];
  if(points.length < 2){ el.innerHTML = ""; return; }
  const n = points.length;
  const innerW = POP_CHART_W - POP_CHART_PAD*2;
  const innerH = POP_CHART_H - POP_CHART_PAD*2;
  const coords = points.map((p,i) => ({
    x: POP_CHART_PAD + (i/(n-1))*innerW,
    y: POP_CHART_PAD + innerH - (Math.max(0,Math.min(100,p.pop))/100)*innerH,
  }));
  const pathD = catmullRomSmoothPath(coords);
  const dots = coords.map(c => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="1.7" fill="var(--accent)"></circle>`).join("");

  // 降水量(mm)のヒストグラム。折れ線と同じx座標(coords)に、点の間隔の半分の
  // 太さの棒を中心にして立てる。棒は折れ線より奥（背面）に描く
  const barW = Math.max(1.2, (innerW / (n - 1)) * 0.5);
  const bars = points.map((p, i) => {
    const mm = Math.max(0, typeof p.precip === "number" ? p.precip : 0);
    const barH = precipValueToFrac(mm) * POP_CHART_H;
    const x = coords[i].x;
    const fill = mm > PRECIP_DANGER_MM ? "var(--bad)" : "var(--precip)";
    return `<rect x="${(x - barW/2).toFixed(1)}" y="${(POP_CHART_H - barH).toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" fill="${fill}" opacity=".85" rx=".6"></rect>`;
  }).join("");

  // 目盛り線とラベルを同じY座標式で位置決めする（別々のflex配置に頼らない）。
  // ％軸（左）とmm軸（右）は目盛りの本数が同じ(6本)なので、線そのものは
  // 共有し、ラベルの数字だけ左右で意味（％ / mm）を変える
  const gridlines = POP_CHART_Y_TICKS.map((_, i) => {
    const y = axisTickY(i, POP_CHART_Y_TICKS.length);
    return `<line x1="0" y1="${y.toFixed(1)}" x2="${POP_CHART_W}" y2="${y.toFixed(1)}" stroke="var(--line)" stroke-width="1" opacity=".5"></line>`;
  }).join("");
  const yTicks = POP_CHART_Y_TICKS.map((v, i) => `<span style="top:${(axisTickY(i, POP_CHART_Y_TICKS.length)/POP_CHART_H*100).toFixed(2)}%">${v}</span>`).join("");
  const mmTicks = PRECIP_Y_TICKS.map((v, i) => `<span style="top:${(axisTickY(i, PRECIP_Y_TICKS.length)/POP_CHART_H*100).toFixed(2)}%">${v}</span>`).join("");

  // 横軸の数字ラベルは3時間ごと（今＝0時間後を含む）にのみ間引く。
  // 折れ線・棒グラフと同じx座標(coords)を使って絶対配置することで、
  // 数字の真下にその時刻の点・棒がくるようにする（flexの均等割りに頼らない）
  const labels = points
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i % POP_CHART_LABEL_EVERY === 0)
    .map(({ p, i }) => `<span style="left:${(coords[i].x / POP_CHART_W * 100).toFixed(2)}%">${esc(p.label)}</span>`)
    .join("");
  el.innerHTML = `
    <div class="weather-pop-chart-units">
      <div class="pop-axis-yunit">%</div>
      <div class="pop-axis-yunit-right">mm</div>
    </div>
    <div class="weather-pop-chart-row">
      <div class="pop-axis-ycol pop-axis-yticks">${yTicks}</div>
      <div class="weather-pop-chart-plot">
        <svg class="weather-pop-chart-svg" viewBox="0 0 ${POP_CHART_W} ${POP_CHART_H}" preserveAspectRatio="none">
          ${bars}
          ${gridlines}
          <path d="${pathD}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
          ${dots}
        </svg>
      </div>
      <div class="pop-axis-ycol pop-axis-yticks-right">${mmTicks}</div>
    </div>
    <div class="weather-pop-chart-xrow">
      <div class="pop-axis-ycol pop-axis-yspacer"></div>
      <div class="weather-pop-chart-labels">${labels}</div>
      <div class="pop-axis-ycol pop-axis-xunit">時</div>
    </div>`;
}

// 天気情報を取得してカードを再描画する。ホーム画面から離れて weather-card が
// DOM上から消えている場合は、取得結果を無駄に描画せず自動更新タイマーも止める
// （画面遷移時のクリーンアップ）。
async function refreshWeatherCard(force){
  if(!document.getElementById("weather-card")){
    if(weatherRefreshTimer){ clearInterval(weatherRefreshTimer); weatherRefreshTimer = null; }
    return;
  }
  const cityEl = document.getElementById("weather-city");
  const asofEl = document.getElementById("weather-asof");
  const iconEl = document.getElementById("weather-icon");
  const tempEl = document.getElementById("weather-temp");
  const precipNowValueEl = document.getElementById("weather-precip-now-value");
  const precipCommentTrackEl = document.getElementById("weather-precip-comment-track");
  const retryBtnEl = document.getElementById("weather-retry-loc");
  const w = await getWeather(force);
  if(!document.getElementById("weather-card")) return; // フェッチ中に画面遷移した場合は描画しない
  if(!w){
    if(cityEl) cityEl.textContent = "天気を取得できませんでした";
    if(asofEl) asofEl.textContent = "";
    if(iconEl) iconEl.textContent = "🌡️";
    if(tempEl){ tempEl.textContent = ""; tempEl.style.color = ""; }
    if(precipNowValueEl){ precipNowValueEl.textContent = "-"; precipNowValueEl.style.color = ""; }
    if(precipCommentTrackEl) precipCommentTrackEl.textContent = "";
    if(retryBtnEl) retryBtnEl.hidden = true;
    updatePrecipAlertMarquee();
    renderWeatherPopChart(null);
    return;
  }
  if(cityEl) cityEl.textContent = w.isDefaultLocation ? `${w.city}（現在地未取得）` : w.city;
  if(retryBtnEl) retryBtnEl.hidden = !w.isDefaultLocation;
  // この天気がいつ時点の観測かをアイコンのすぐ上に明記する
  if(asofEl){
    if(w.currentTime){
      const d = new Date(w.currentTime);
      asofEl.textContent = `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}時点`;
    } else {
      asofEl.textContent = "現在";
    }
  }
  if(iconEl) iconEl.textContent = w.icon;
  if(tempEl){
    tempEl.textContent = `${w.temp}℃`;
    tempEl.style.color = getTemperatureColor(w.temp);
  }
  const precipMm = typeof w.precip === "number" ? w.precip : 0;
  if(precipNowValueEl){
    precipNowValueEl.textContent = precipMmLabel(precipMm);
    precipNowValueEl.style.color = getPrecipitationColor(precipMm);
  }
  if(precipCommentTrackEl) precipCommentTrackEl.textContent = precipCommentText(precipMm);
  updatePrecipAlertMarquee();
  renderWeatherPopChart(w);
  chappyMiniWeatherHint(w);   // 🏠 雨の日は傘・晴れの日はうれしそうにする
}

function startWeatherRefresh(){
  if(weatherRefreshTimer){ clearInterval(weatherRefreshTimer); weatherRefreshTimer = null; }
  weatherRefreshTimer = setInterval(() => {
    if(!document.getElementById("weather-card")){ clearInterval(weatherRefreshTimer); weatherRefreshTimer = null; return; }
    refreshWeatherCard();
  }, WEATHER_REFRESH_MS);
}

// 「現在地未取得」時の再試行ボタン：クリックのたびにキャッシュを無視して
// 位置情報の取得からやり直す（権限設定を変えた直後などに使う想定）
function bindWeatherRetryButton(){
  const btn = document.getElementById("weather-retry-loc");
  if(!btn) return;
  btn.onclick = async () => {
    if(btn.disabled) return;
    btn.disabled = true;
    btn.classList.add("weather-retry-spin");
    try{ await refreshWeatherCard(true); }
    finally{
      btn.disabled = false;
      btn.classList.remove("weather-retry-spin");
    }
  };
}

async function loadWeatherCard(){
  const card = document.getElementById("weather-card");
  if(!card) return;
  startClock();
  bindWeatherRetryButton();
  await refreshWeatherCard(); // 画面を開いた瞬間の即時フェッチ
  startWeatherRefresh();      // 以後20分間隔でバックグラウンド自動更新
}

// ポートフォリオ画面の「株式を検索して追加」ウォッチリストや売買モーダルの
// クイック候補として最初から出しておく主要銘柄（priceは基準値＝前日終値扱いの
// モックデータ）。これ以外の銘柄は /api/stocks?action=search 経由でティッカー・企業名
// を幅広く検索して見つけられる（stockSearchResultsHTML/openTradeModal参照）
const WATCH_STOCKS = [
  { ticker:"AAPL", name:"Apple", price:213.40, sector:"テクノロジー" },
  { ticker:"TSLA", name:"Tesla", price:248.50, sector:"自動車" },
  { ticker:"NVDA", name:"NVIDIA", price:135.60, sector:"半導体 / AI" },
  { ticker:"MSFT", name:"Microsoft", price:435.12, sector:"テクノロジー" },
  { ticker:"AMZN", name:"Amazon", price:189.50, sector:"Eコマース" },
  { ticker:"GOOGL", name:"Alphabet", price:199.80, sector:"テクノロジー" },
  { ticker:"META", name:"Meta", price:512.30, sector:"テクノロジー" },
  { ticker:"NFLX", name:"Netflix", price:685.20, sector:"エンタメ" },
  { ticker:"AMD", name:"AMD", price:118.90, sector:"半導体 / AI" },
  { ticker:"DIS", name:"Disney", price:112.30, sector:"エンタメ" },
  { ticker:"KO", name:"Coca-Cola", price:63.10, sector:"生活必需品" },
  { ticker:"NKE", name:"NIKE", price:75.40, sector:"アパレル" },
  { ticker:"PYPL", name:"PayPal", price:71.20, sector:"金融" },
  { ticker:"INTC", name:"Intel", price:22.80, sector:"半導体 / AI" },
];

// セクターごとの絵文字とバッジの配色キー（css/style.css の
// .pf-sector-badge[data-sector="..."] と対応させる）
const SECTOR_META = {
  "テクノロジー":  { emoji:"💻", key:"tech" },
  "自動車":        { emoji:"🚗", key:"auto" },
  "半導体 / AI":   { emoji:"🧠", key:"semi" },
  "Eコマース":     { emoji:"🛒", key:"ecom" },
  "エンタメ":      { emoji:"🎬", key:"media" },
  "生活必需品":    { emoji:"🥤", key:"staple" },
  "アパレル":      { emoji:"👟", key:"apparel" },
  "金融":          { emoji:"💳", key:"finance" },
};

function sectorBadgeHTML(sector){
  if(!sector) return "";
  const meta = SECTOR_META[sector] || { emoji:"🏷️", key:"other" };
  return `<span class="pf-sector-badge" data-sector="${meta.key}">${meta.emoji} ${esc(sector)}</span>`;
}

// 銘柄検索（/api/stocks?action=search）で見つけた、WATCH_STOCKSに無い銘柄の企業名を
// 端末に覚えておくための簡易キャッシュ。財務情報ではなく単なる表示名なので
// ユーザーごとに分けず端末共通の1キーで保存する
const STOCK_NAME_CACHE_KEY = "stock_name_cache_v1";
function loadStockNameCache(){
  try{
    const c = JSON.parse(localStorage.getItem(STOCK_NAME_CACHE_KEY) || "{}");
    return (c && typeof c === "object" && !Array.isArray(c)) ? c : {};
  }catch(e){ return {}; }
}
function cacheStockName(ticker, name){
  if(!ticker || !name) return;
  try{
    const cache = loadStockNameCache();
    if(cache[ticker] === name) return;
    cache[ticker] = name;
    localStorage.setItem(STOCK_NAME_CACHE_KEY, JSON.stringify(cache));
  }catch(e){}
}
// 表示名の解決順：WATCH_STOCKSの銘柄マスタ → 検索で得た名前キャッシュ →
// 最後の手段としてティッカーそのもの
function stockDisplayName(ticker){
  const meta = WATCH_STOCKS.find(s => s.ticker === ticker);
  if(meta) return meta.name;
  return loadStockNameCache()[ticker] || ticker;
}

/* ---- 保有株（デモ取引のポートフォリオ）。端末ローカルに保存する ----
   保存キーは「現在ログインしているユーザー」ごとに独立させる。ベースキーに
   ログイン中のFirebase UID（未ログイン＝ゲスト利用中は"guest"固定）を連結
   することで、同じ端末・同じブラウザを複数人が使い回しても、他人の売買
   履歴や保有株が絶対に混入しないようにする（gcalStorageKeyと同じ方式） */
const PORTFOLIO_KEY = "stock_portfolio_v1";

function portfolioStorageKey(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `${PORTFOLIO_KEY}::${uid}`;
}

export function loadPortfolio(){
  try{
    const p = JSON.parse(localStorage.getItem(portfolioStorageKey()) || "{}");
    return (p && typeof p === "object" && !Array.isArray(p)) ? p : {};
  }catch(e){ return {}; }
}
function savePortfolio(p){
  try{ localStorage.setItem(portfolioStorageKey(), JSON.stringify(p)); }catch(e){}
}

// クラウド（Firestoreの users/{uid}.portfolio）から届いた保有株データを
// この端末のローカル保存へ反映する。db.jsのonSnapshotから、ログイン中の
// 本人のドキュメントが更新されるたびに呼ばれる（他人のデータは購読して
// いないため混入しない）。ポートフォリオ画面を表示中なら即座に描画し直す
export function applyCloudPortfolio(pf){
  if(!pf || typeof pf !== "object" || Array.isArray(pf)) return;
  savePortfolio(pf);
  if(S.screen === "portfolio") renderPortfolio();
  else if(S.screen === "holdings") renderHoldings();
}

// クラウド（Firestoreの users/{uid}.pendingOrders/.stockTrades）から届いた
// 時間外の予約注文・取引履歴を端末へ反映する。保有株と同じくonSnapshot経由
export function applyCloudPendingOrders(list){
  if(!Array.isArray(list)) return;
  savePendingOrders(list);
  if(S.screen === "portfolio") renderPortfolio();
}
export function applyCloudTradeLog(list){
  if(!Array.isArray(list)) return;
  saveTradeLog(list);
}

/* ---- ウォッチリスト（検索して追加した銘柄の一覧）。保有株とは別物で、
   売買は行わず値動きの確認のみを目的とする。保存キーは保有株と同じ方式で
   ログイン中のユーザーごとに独立させる ---- */
const WATCHLIST_KEY = "stock_watchlist_v1";

function watchlistStorageKey(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `${WATCHLIST_KEY}::${uid}`;
}
function loadWatchlist(){
  try{
    const arr = JSON.parse(localStorage.getItem(watchlistStorageKey()) || "[]");
    return Array.isArray(arr) ? arr.filter(t => typeof t === "string") : [];
  }catch(e){ return []; }
}
function saveWatchlist(list){
  try{ localStorage.setItem(watchlistStorageKey(), JSON.stringify(list)); }catch(e){}
}
function addToWatchlist(ticker, name){
  const list = loadWatchlist();
  if(!list.includes(ticker)) list.push(ticker);
  saveWatchlist(list);
  if(name) cacheStockName(ticker, name);
}
function removeFromWatchlist(ticker){
  saveWatchlist(loadWatchlist().filter(t => t !== ticker));
}

/* ---- ハイブリッドテープ（自動ループ＋手動スワイプ）の共通制御 ----
   株価ティッカーとIT/AIニュースの両方で使う汎用の仕組み。
   CSSアニメーションではなく、実際にスクロールできるコンテナ（overflow-x:auto）の
   scrollLeftをrequestAnimationFrameで少しずつ進めて「流れる」動きを作る。
   こうすることで、ユーザーはいつでも指でタッチして左右に自由にスワイプでき
   （タッチ中は自動送りを一時停止）、指を離すと少しのディレイの後に
   その位置から自動スクロールが滑らかに再開する。
   同じ列を2周分並べてあるため、scrollLeftが1周分を超えたら1周分だけ
   巻き戻す（左端まで巻き戻したら1周分進める）ことで、前後どちらの方向にも
   境目なく無限にループしているように見せる */

const TAPE_RESUME_DELAY_MS = 2500;  // 指を離してから自動送りを再開するまでの待ち時間
const tapeControllers = {};        // 要素ID -> テープごとの状態
let tapeRafId = null;
let tapeDragId = null;             // マウスドラッグ中のテープの要素ID（PC向け）
let tapeDragStartX = 0;
let tapeDragStartScroll = 0;
let tapeDragMoved = 0;             // ドラッグ移動量（直後のクリック抑止の判定用）

function tapeHalfWidth(tapeEl){
  const track = tapeEl.firstElementChild;
  return track ? track.scrollWidth / 2 : 0;
}

// すべてのテープを1つのrAFループでまとめて進める。要素がDOMから消えた
// テープは登録を外し、テープが1つも無くなったらループ自体を止める
function tapeLoop(ts){
  let anyAlive = false;
  Object.keys(tapeControllers).forEach(id => {
    const st = tapeControllers[id];
    const tapeEl = document.getElementById(id);
    if(!tapeEl){ clearTimeout(st.resumeTimer); delete tapeControllers[id]; return; }
    anyAlive = true;
    if(st.lastTs && !st.paused){
      st.pos += st.speed * (ts - st.lastTs) / 1000;
      const half = tapeHalfWidth(tapeEl);
      if(half > 0 && st.pos >= half) st.pos -= half;
      tapeEl.scrollLeft = st.pos;
    }
    st.lastTs = ts;
  });
  tapeRafId = anyAlive ? requestAnimationFrame(tapeLoop) : null;
}

function ensureTapeLoop(){
  if(!tapeRafId) tapeRafId = requestAnimationFrame(tapeLoop);
}

function pauseTape(id){
  const st = tapeControllers[id];
  if(!st) return;
  st.paused = true;
  clearTimeout(st.resumeTimer);
}

// 指を離してから一定時間後に、ユーザーが動かした位置を引き継いで自動送りを再開する
function scheduleTapeResume(id){
  const st = tapeControllers[id];
  if(!st) return;
  clearTimeout(st.resumeTimer);
  st.resumeTimer = setTimeout(() => {
    const tapeEl = document.getElementById(id);
    if(tapeEl) st.pos = tapeEl.scrollLeft;
    st.paused = false;
  }, TAPE_RESUME_DELAY_MS);
}

// 手動スクロール中のシームレスなループ処理（1周分を超えたら巻き戻す）
function onTapeManualScroll(id){
  const st = tapeControllers[id];
  const tapeEl = document.getElementById(id);
  if(!st || !tapeEl || !st.paused) return; // 自動送り中の巻き戻しはtapeLoop側で行う
  const half = tapeHalfWidth(tapeEl);
  if(half <= 0) return;
  if(tapeEl.scrollLeft >= half) tapeEl.scrollLeft -= half;
  // 左端まで巻き戻したら1周先の同じ見た目の位置へ（half丁度に置くと直後に
  // 上の巻き戻し条件と往復してしまうため、1px内側に着地させる）
  else if(tapeEl.scrollLeft < 1) tapeEl.scrollLeft += half - 1;
}

// PCのマウスドラッグでもスワイプできるようにする（moveとupは画面全体で拾う
// 必要があるためwindowに一度だけ登録し、対象要素は都度探す）
window.addEventListener("mousemove", (e) => {
  if(!tapeDragId) return;
  const tapeEl = document.getElementById(tapeDragId);
  if(!tapeEl) return;
  const dx = e.clientX - tapeDragStartX;
  tapeDragMoved = Math.max(tapeDragMoved, Math.abs(dx));
  tapeEl.scrollLeft = tapeDragStartScroll - dx;
});
window.addEventListener("mouseup", () => {
  if(!tapeDragId) return;
  const tapeEl = document.getElementById(tapeDragId);
  if(tapeEl) tapeEl.classList.remove("dragging");
  scheduleTapeResume(tapeDragId);
  tapeDragId = null;
});

// テープ1本分の登録解除（前回は流れていた行が静止表示に切り替わった場合など）
function removeHybridTape(id){
  const st = tapeControllers[id];
  if(!st) return;
  clearTimeout(st.resumeTimer);
  delete tapeControllers[id];
}

// テープ1本分の初期化。再レンダー時に呼び直しても多重にならない
// （イベントはon〇〇プロパティへの代入、状態はIDで上書き）
function initHybridTape(id, speedPxS){
  const tapeEl = document.getElementById(id);
  if(!tapeEl) return;
  const prev = tapeControllers[id];
  if(prev) clearTimeout(prev.resumeTimer);
  const st = { speed: speedPxS, pos: Math.max(1, tapeEl.scrollLeft), paused: false, lastTs: 0, resumeTimer: null };
  tapeControllers[id] = st;
  tapeEl.scrollLeft = st.pos;
  // タッチ中は自動送りを止め、指の動き（ネイティブスクロール）に任せる。
  // on〇〇プロパティはタッチ非対応環境だとイベント登録にならないため、
  // addEventListenerで確実に登録する（要素は再レンダーごとに作り直される
  // ので多重登録にはならない）
  tapeEl.addEventListener("touchstart", () => pauseTape(id), { passive: true });
  tapeEl.addEventListener("touchend", () => scheduleTapeResume(id), { passive: true });
  tapeEl.addEventListener("touchcancel", () => scheduleTapeResume(id), { passive: true });
  // トラックパッド等の横スクロールでも同様に一時停止→自動再開
  tapeEl.addEventListener("wheel", () => { pauseTape(id); scheduleTapeResume(id); }, { passive: true });
  tapeEl.onscroll = () => onTapeManualScroll(id);
  tapeEl.onmousedown = (e) => {
    tapeDragId = id;
    tapeDragStartX = e.clientX;
    tapeDragStartScroll = tapeEl.scrollLeft;
    tapeDragMoved = 0;
    tapeEl.classList.add("dragging");
    pauseTape(id);
    e.preventDefault();
  };
  // ドラッグ操作の直後に発生するclickでリンクへ飛んでしまわないようにする
  // （ニュースのテープは中身がリンクのため。単純なタップ・クリックは通す）
  tapeEl.onclick = (e) => {
    if(tapeDragMoved > 5){ e.preventDefault(); e.stopPropagation(); }
  };
  ensureTapeLoop();
}

// 売買金額の換算レート：1ドル＝1ACとして四捨五入する（デモ取引用）
function tradeAmount(price, qty){ return Math.max(1, Math.round(price * qty)); }

/* ---- ウォッチリスト銘柄のリアルタイム株価 ----
   実際の株価はサーバー側の /api/stocks?action=quote（Finnhubの現在値を取得する
   プロキシ。APIキーはVercelの環境変数FINNHUB_API_KEYにのみ保持し、
   フロントには渡さない）から取得する。
   日本時間22:30〜翌5:30（米国市場の取引時間帯）の間だけ、1分ごとに
   バックグラウンドで再取得する。それ以外の時間帯は直近の値のまま静止させ、
   「取引時間外」であることが分かるバッジを表示する */
const watchLive = {}; // ticker -> { prevClose, price, loaded:boolean }

// 現在時刻を日本時間（分）に変換する（環境のタイムゾーンに依存しない）
function jstMinutesNow(){
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone:"Asia/Tokyo", hour:"2-digit", minute:"2-digit", hour12:false
  }).formatToParts(new Date());
  const h = Number(parts.find(p => p.type === "hour").value);
  const m = Number(parts.find(p => p.type === "minute").value);
  return h * 60 + m;
}
export function isUSMarketHoursJST(){
  const mins = jstMinutesNow();
  return mins >= (22*60+30) || mins < (5*60+30); // 日をまたぐため両端で判定
}

// ウォッチリストに追加された銘柄の値動き状態を初期化する（初回のみ）。
// 実際のAPI取得が終わるまでの間だけ、銘柄マスタの基準値を仮の値として
// 表示しておく（loaded:falseの間は「取得中」の見た目にする）
const WATCH_REFRESH_INTERVAL_MS = 60000;

function ensureWatchLive(ticker, fallbackBase){
  if(watchLive[ticker]) return watchLive[ticker];
  const meta = WATCH_STOCKS.find(s => s.ticker === ticker);
  const base = meta ? meta.price : ((fallbackBase > 0) ? fallbackBase : 100);
  const st = { prevClose: base, price: base, loaded: false, lastFetchTs: 0 };
  watchLive[ticker] = st;
  return st;
}

// サーバー経由でFinnhubの現在値をまとめて取得する。ネットワーク不調時は
// 例外を投げず、取得できた銘柄分だけ反映して静かに諦める
async function fetchStockQuotes(tickers){
  const symbols = [...new Set(tickers)].filter(Boolean);
  if(!symbols.length) return { quotes:{}, errors:[] };
  try{
    const res = await fetch(`/api/stocks?action=quote&symbols=${encodeURIComponent(symbols.join(","))}`);
    if(!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    return { quotes: data.quotes || {}, errors: data.errors || [] };
  }catch(e){
    return { quotes:{}, errors: symbols };
  }
}

// 取得できた実際の現在値をウォッチリストの状態へ反映する。
// dataは fetchStockQuotes() が返す quotes オブジェクト
function applyWatchQuotes(quotes){
  Object.keys(quotes).forEach(ticker => {
    const q = quotes[ticker];
    const st = ensureWatchLive(ticker);
    st.prevClose = q.prevClose;
    st.price = q.price;
    st.loaded = true;
    st.lastFetchTs = Date.now();
  });
}

function watchRowHTML(ticker){
  const meta = WATCH_STOCKS.find(s => s.ticker === ticker);
  const name = meta ? meta.name : stockDisplayName(ticker);
  const live = ensureWatchLive(ticker);
  // Finnhubが前日終値を返さなかった銘柄ではprevCloseがnullになりうるため、
  // その場合はNaN%を表示せず前日比自体を省略する（0%や推測値で埋めない）
  const hasChg = live.loaded && typeof live.prevClose === "number" && live.prevClose > 0;
  const chg = hasChg ? ((live.price - live.prevClose)/live.prevClose) * 100 : null;
  const up = chg !== null && chg >= 0;
  const priceHTML = live.loaded
    ? `<span class="pf-watch-price">$${live.price.toFixed(2)}</span>
       ${chg !== null ? `<span class="pf-watch-chg ${up?"up":"down"}">${up?"+":""}${chg.toFixed(2)}%</span>` : ""}`
    : `<span class="pf-watch-price pf-watch-loading">取得中…</span>`;
  return `<div class="pf-watch-row" data-ticker="${esc(ticker)}">
    <div class="pf-watch-left">
      <span class="pf-ticker">${esc(ticker)}</span>
      <span class="pf-name">${esc(name)}</span>
      ${meta ? sectorBadgeHTML(meta.sector) : ""}
    </div>
    <div class="pf-watch-right">
      ${priceHTML}
    </div>
    <button type="button" class="pf-watch-rm" data-rm-ticker="${esc(ticker)}" aria-label="ウォッチリストから削除">×</button>
  </div>`;
}

function watchListInnerHTML(){
  const list = loadWatchlist();
  if(!list.length) return "";
  return `<div class="pf-watch-list">${list.map(watchRowHTML).join("")}</div>`;
}

function watchLiveBadgeHTML(fetchFailed){
  if(fetchFailed) return `<span class="pf-watch-badge off">⚠️ 株価の取得に失敗しました（時間をおいて自動再試行します）</span>`;
  return isUSMarketHoursJST()
    ? `<span class="pf-watch-badge on">🟢 米国市場 取引時間中・1分ごとに自動更新中</span>`
    : `<span class="pf-watch-badge off">⚪ 米国市場 取引時間外（22:30〜翌5:30に自動更新）</span>`;
}

function bindWatchListRowEvents(){
  app.querySelectorAll("[data-rm-ticker]").forEach(btn => btn.onclick = () => {
    removeFromWatchlist(btn.dataset.rmTicker);
    renderPortfolio();
  });
}

// 現在ウォッチリストに登録されている銘柄のうち、まだ一度も取得していない
// 銘柄・前回の取得から1分以上経っている銘柄だけをサーバー経由で取得する。
// ポートフォリオ画面を開き直すたびに毎回叩いてしまうと、まだ1分経って
// いなくてもミニチャートが動いて見えてしまうため、ここで絞り込む
function staleWatchTickers(list){
  const now = Date.now();
  return list.filter(t => {
    const st = ensureWatchLive(t);
    return !st.loaded || (now - st.lastFetchTs) >= WATCH_REFRESH_INTERVAL_MS;
  });
}

/* ===== 売買（購入・売却）のルールとロジック =====
   実際の株式市場を破綻させない最低限のルールをここに集約する：
     ・整数株のみ（単元未満の端株は扱わない。MIN_LOT）
     ・売買手数料：約定金額の0.1%・最低1AC（TRADE_FEE_RATE/TRADE_FEE_MIN）
     ・購入：現金（AC）残高を超える注文は不可（残高不足エラー）
     ・売却：保有株数を超える注文は不可（空売り不可）
     ・米国市場の取引時間外（isUSMarketHoursJST()がfalseの時間帯）は
       即時約定させず「予約注文」としてキューに積み、次に市場が開いた
       タイミングでその時点の最新株価により自動約定させる（成行の
       寄り付き注文と同じ考え方。processPendingOrders参照） */
const TRADE_FEE_RATE = 0.001;  // 約定金額の0.1%
const TRADE_FEE_MIN = 1;       // 最低手数料（AC）
const MIN_LOT = 1;             // 最低売買単位（整数株のみ）

function feeAmount(amount){ return Math.max(TRADE_FEE_MIN, Math.round(amount * TRADE_FEE_RATE)); }
function tradeId(){ return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

// ---- 時間外の予約注文キュー・約定履歴。保有株・ウォッチリストと同じく
// ログイン中のユーザーごとに端末保存する ----
const PENDING_ORDERS_KEY = "stock_pending_orders_v1";
const TRADE_LOG_KEY = "stock_trade_log_v1";
const TRADE_LOG_MAX = 200; // 際限なく増え続けないよう直近200件のみ保持する

function pendingOrdersStorageKey(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `${PENDING_ORDERS_KEY}::${uid}`;
}
function tradeLogStorageKey(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `${TRADE_LOG_KEY}::${uid}`;
}
export function loadPendingOrders(){
  try{
    const arr = JSON.parse(localStorage.getItem(pendingOrdersStorageKey()) || "[]");
    return Array.isArray(arr) ? arr : [];
  }catch(e){ return []; }
}
function savePendingOrders(list){ try{ localStorage.setItem(pendingOrdersStorageKey(), JSON.stringify(list)); }catch(e){} }

export function loadTradeLog(){
  try{
    const arr = JSON.parse(localStorage.getItem(tradeLogStorageKey()) || "[]");
    return Array.isArray(arr) ? arr : [];
  }catch(e){ return []; }
}
function saveTradeLog(list){ try{ localStorage.setItem(tradeLogStorageKey(), JSON.stringify(list.slice(-TRADE_LOG_MAX))); }catch(e){} }
function appendTradeLog(entry){ const list = loadTradeLog(); list.push(entry); saveTradeLog(list); }

// クラウド（Firestoreの users/{uid}）へ保有株・現金・予約注文・取引履歴を
// まとめて同期する。既存のsaveToCloud/purchaseSkinと同じ「まず端末で確定させ、
// 直後にfire-and-forgetでクラウドへmergeする」方式に合わせている
async function syncTradeStateToCloud(){
  if(!state.db || !state.currentUserId || !window.FirebaseSync) return;
  try{
    await window.FirebaseSync.setDoc(window.FirebaseSync.doc(state.db, "users", state.currentUserId), {
      portfolio: loadPortfolio(),
      coins: (S.coins || 0),
      pendingOrders: loadPendingOrders(),
      stockTrades: loadTradeLog(),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  }catch(e){ console.error("stock trade cloud sync failed:", e); }
}

// 現在のpriceで即時約定させる実処理（市場時間中の注文・予約注文の約定の
// どちらからも呼ばれる）。バリデーション済みの前提だが、予約注文が約定する
// 時点では発注後に状況が変わっている可能性があるため、ここでも念のため
// 残高・保有数を再検証する
function executeBuyNow(ticker, name, qty, price){
  const amount = tradeAmount(price, qty);
  const fee = feeAmount(amount);
  const total = amount + fee;
  if(total > (S.coins || 0)) return { ok:false, msg:"現金（AC）残高が不足しています。" };
  S.coins -= total;
  const pf = loadPortfolio();
  const holding = pf[ticker] || { shares:0, cost:0, name };
  holding.shares += qty;
  holding.cost += total;
  holding.name = name || holding.name || ticker;
  pf[ticker] = holding;
  savePortfolio(pf);
  saveCoins(S.coins);
  return { ok:true, amount, fee, total, msg:`${ticker}を${qty}株購入しました（${total.toLocaleString()} AC）。` };
}

function executeSellNow(ticker, qty, price){
  const pf = loadPortfolio();
  const holding = pf[ticker];
  if(!holding || qty > holding.shares) return { ok:false, msg:"保有数を超える数量のため売却できません。" };
  const amount = tradeAmount(price, qty);
  const fee = feeAmount(amount);
  const proceeds = Math.max(0, amount - fee);
  const costPerShare = holding.shares > 0 ? holding.cost / holding.shares : 0;
  holding.shares -= qty;
  holding.cost = Math.max(0, holding.cost - costPerShare * qty);
  if(holding.shares <= 0) delete pf[ticker]; else pf[ticker] = holding;
  savePortfolio(pf);
  S.coins += proceeds;
  saveCoins(S.coins);
  return { ok:true, amount, fee, proceeds, msg:`${ticker}を${qty}株売却しました（受取 ${proceeds.toLocaleString()} AC）。` };
}

function queuePendingOrder(order){
  const list = loadPendingOrders();
  list.push(Object.assign({ id: tradeId(), createdAt: Date.now() }, order));
  savePendingOrders(list);
  const amount = tradeAmount(order.price, order.qty);
  appendTradeLog({
    id: tradeId(), side: order.side, ticker: order.ticker, name: order.name,
    qty: order.qty, price: order.price, amount, fee: feeAmount(amount),
    ts: Date.now(), status: "pending"
  });
  syncTradeStateToCloud();
}

// 購入：数量バリデーション→残高チェック→市場時間中かどうかの順で判定する。
// 時間外なら即時約定させず予約注文としてキューへ積む
export function buyStock(ticker, name, qty, price){
  qty = Math.floor(Number(qty));
  if(!ticker || !(price > 0)) return { ok:false, msg:"銘柄の株価情報を取得できませんでした。" };
  if(!Number.isFinite(qty) || qty < MIN_LOT) return { ok:false, msg:`購入数量は${MIN_LOT}株以上の整数で入力してください。` };
  const amount = tradeAmount(price, qty);
  const fee = feeAmount(amount);
  if((amount + fee) > (S.coins || 0)) return { ok:false, msg:"現金（AC）残高が不足しています。" };
  if(!isUSMarketHoursJST()){
    queuePendingOrder({ side:"buy", ticker, name, qty, price });
    return { ok:true, queued:true, msg:"米国市場の取引時間外のため、予約注文として受け付けました。次の取引開始時に、その時点の株価で自動約定します。" };
  }
  const r = executeBuyNow(ticker, name, qty, price);
  if(r.ok){
    cacheStockName(ticker, name);
    appendTradeLog({ id:tradeId(), side:"buy", ticker, name, qty, price, amount:r.amount, fee:r.fee, ts:Date.now(), status:"executed" });
    syncTradeStateToCloud();
  }
  return Object.assign({ queued:false }, r);
}

// 売却：保有しているか→数量バリデーション→保有数を超えていないか→
// 市場時間中かどうかの順で判定する（空売り不可）
export function sellStock(ticker, qty, price){
  qty = Math.floor(Number(qty));
  const pf = loadPortfolio();
  const holding = pf[ticker];
  if(!holding || holding.shares <= 0) return { ok:false, msg:"保有していない銘柄は売却できません。" };
  if(!(price > 0)) return { ok:false, msg:"銘柄の株価情報を取得できませんでした。" };
  if(!Number.isFinite(qty) || qty < MIN_LOT) return { ok:false, msg:`売却数量は${MIN_LOT}株以上の整数で入力してください。` };
  if(qty > holding.shares) return { ok:false, msg:`保有数（${holding.shares}株）を超える数量は売却できません。` };
  if(!isUSMarketHoursJST()){
    queuePendingOrder({ side:"sell", ticker, name: holding.name, qty, price });
    return { ok:true, queued:true, msg:"米国市場の取引時間外のため、予約注文として受け付けました。次の取引開始時に、その時点の株価で自動約定します。" };
  }
  const r = executeSellNow(ticker, qty, price);
  if(r.ok){
    appendTradeLog({ id:tradeId(), side:"sell", ticker, name: holding.name, qty, price, amount:r.amount, fee:r.fee, ts:Date.now(), status:"executed" });
    syncTradeStateToCloud();
  }
  return Object.assign({ queued:false }, r);
}

// 米国市場が開いたタイミングで、保留中の時間外注文をまとめて自動約定させる。
// 発注時点の参考株価ではなく、約定処理を実行する「今」の最新株価で成行約定
// させる（現実の寄り付き注文と同じ考え方）。発注後に残高・保有数が変わって
// 条件を満たせなくなった注文は約定させずキャンセル扱いにする
export async function processPendingOrders(){
  if(!isUSMarketHoursJST()) return { processed:0 };
  const pending = loadPendingOrders();
  if(!pending.length) return { processed:0 };
  const tickers = [...new Set(pending.map(o => o.ticker))];
  const { quotes } = await fetchStockQuotes(tickers);
  pending.forEach(order => {
    const q = quotes[order.ticker];
    const execPrice = q ? q.price : order.price;
    const r = order.side === "buy"
      ? executeBuyNow(order.ticker, order.name, order.qty, execPrice)
      : executeSellNow(order.ticker, order.qty, execPrice);
    appendTradeLog({
      id: tradeId(), side: order.side, ticker: order.ticker, name: order.name,
      qty: order.qty, price: execPrice, amount: r.amount || 0, fee: r.fee || 0,
      ts: Date.now(), status: r.ok ? "executed" : "cancelled", note: r.ok ? "" : r.msg
    });
  });
  savePendingOrders([]); // 全件処理済み（約定 or キャンセル）になったのでキューを空にする
  syncTradeStateToCloud();
  return { processed: pending.length };
}

// 保有株一覧を「リアルタイム株価 × 保有株数」で評価する。まだ現在値を
// 取得できていない銘柄は、平均取得単価を仮の評価額として表示する
// （取得中である旨はloaded:falseで呼び出し側が判断する）
function computeHoldingsSummary(){
  const pf = loadPortfolio();
  const tickers = Object.keys(pf);
  let totalValue = 0;
  const rows = tickers.map(t => {
    const h = pf[t];
    const avgCost = h.shares > 0 ? h.cost / h.shares : 0;
    const live = ensureWatchLive(t, avgCost);
    const price = live.loaded ? live.price : avgCost;
    const value = tradeAmount(price, h.shares);
    totalValue += value;
    const chg = (live.loaded && live.prevClose) ? ((live.price - live.prevClose) / live.prevClose) * 100 : null;
    return { ticker:t, name: h.name || stockDisplayName(t), shares:h.shares, price, value, loaded:live.loaded, chg, avgCost };
  });
  return { pf, tickers, rows, totalValue };
}

async function refreshLiveQuotes(){
  const watchlist = loadWatchlist();
  const heldTickers = Object.keys(loadPortfolio());
  const allTickers = [...new Set([...watchlist, ...heldTickers])];
  if(!allTickers.length) return;
  const targets = staleWatchTickers(allTickers);
  if(!targets.length) return; // 全銘柄まだ1分未満なら何もしない（表示も据え置き）
  const { quotes, errors } = await fetchStockQuotes(targets);
  applyWatchQuotes(quotes);
  patchLiveStockUI(targets, errors);
}

// 画面を離脱・再構築せずに、開いている画面に応じて必要な部分だけを
// 差し替える（scrollTo(0,0)を伴うフル再描画をバックグラウンド更新のたびに
// 走らせるとスクロール位置が飛んでしまうため）
function patchLiveStockUI(targets, errors){
  const watchWrap = document.getElementById("pf-watch-list-wrap");
  if(watchWrap){
    watchWrap.innerHTML = watchListInnerHTML();
    bindWatchListRowEvents();
  }
  const badge = document.getElementById("pf-watch-badge-wrap");
  if(badge){
    const watchlist = loadWatchlist();
    const watchTargets = (targets||[]).filter(t => watchlist.includes(t));
    const watchFailed = watchTargets.length > 0 && watchTargets.every(t => (errors||[]).includes(t));
    badge.innerHTML = watchListInnerHTML() ? watchLiveBadgeHTML(watchFailed) : "";
  }
  const heroTotal = document.getElementById("pf-hero-total");
  if(heroTotal){
    const { totalValue } = computeHoldingsSummary();
    const cash = S.coins || 0;
    heroTotal.innerHTML = `${(cash + totalValue).toLocaleString()} <small>AC</small>`;
    const sub = document.getElementById("pf-hero-sub-text");
    if(sub) sub.textContent = `💰 現金 ${cash.toLocaleString()} AC ・ 📈 株式 ${totalValue.toLocaleString()} AC`;
  }
  const holdWrap = document.getElementById("pf-holdings-list-wrap");
  if(holdWrap) holdWrap.innerHTML = holdingsListInnerHTML();
}

function holdingsRowHTML(row){
  const chgHTML = (row.loaded && row.chg !== null)
    ? `<span class="pf-watch-chg ${row.chg>=0?"up":"down"}">${row.chg>=0?"+":""}${row.chg.toFixed(2)}%</span>`
    : `<span class="pf-watch-loading">取得中…</span>`;
  return `<div class="pf-row" data-holding-ticker="${esc(row.ticker)}">
    <div class="pf-row-left">
      <span class="pf-ticker">${esc(row.ticker)}</span>
      <span class="pf-name">${esc(row.name)}</span>
    </div>
    <div class="pf-row-right">
      <span class="pf-shares">${row.shares}株 ・ 平均取得 $${row.avgCost.toFixed(2)}</span>
      <span class="pf-val">${row.value.toLocaleString()} AC</span>
      ${chgHTML}
    </div>
    <button type="button" class="pf-row-sellbtn" data-sell-ticker="${esc(row.ticker)}">売却</button>
  </div>`;
}

function holdingsListInnerHTML(){
  const { rows } = computeHoldingsSummary();
  if(!rows.length) return "";
  return `<div class="pf-list">${rows.map(holdingsRowHTML).join("")}</div>`;
}

function bindHoldingsRowEvents(){
  app.querySelectorAll("[data-sell-ticker]").forEach(btn => btn.onclick = () => openTradeModal("sell", btn.dataset.sellTicker));
}

// 保有株・ウォッチリストのいずれかの画面（株価/保有株）が現在表示中かどうか。
// バックグラウンドの1分ごとの再取得タイマーが「まだ見ている画面か」を
// 判定するのに使う（両画面ともDOMから外れたらタイマー自体を止める）
function stockScreenMounted(){
  return !!(document.getElementById("pf-hero-total") || document.getElementById("pf-holdings-list-wrap"));
}

let watchLiveTimer = null;
// 1分ごとに（米国市場時間中のみ）実際の株価を再取得し、あわせて時間外に
// 積まれた予約注文の自動約定も試みる。株価/保有株画面のどちらかを離れて
// 対象の要素がDOMから消えたら自動的に止まる。
// renderPortfolio()/renderHoldings()はFirestoreのonSnapshot経由（保有株・
// コイン更新等）でも呼ばれることがあり、その都度タイマーを作り直すと1分
// 経つ前に何度もリセットされ、いつまで経っても発火しない不具合になる。
// そのため既に動いている場合は何もしない（作り直さない）
function startWatchLiveRefresh(){
  if(watchLiveTimer) return;
  watchLiveTimer = setInterval(() => {
    if(!stockScreenMounted()){ clearInterval(watchLiveTimer); watchLiveTimer = null; return; }
    const badge = document.getElementById("pf-watch-badge-wrap");
    if(badge && watchListInnerHTML()) badge.innerHTML = watchLiveBadgeHTML();
    if(!isUSMarketHoursJST()) return;
    processPendingOrders().then(({ processed }) => {
      if(processed > 0){
        if(S.screen === "portfolio") renderPortfolio();
        else if(S.screen === "holdings") renderHoldings();
      } else {
        refreshLiveQuotes();
      }
    });
  }, 60000);
}

// スマホでアプリをバックグラウンドに回す（画面ロック・アプリ切り替え等）と
// setIntervalが止まる/大きく遅延することがあるため、フォアグラウンドに
// 戻った瞬間にも取得し直し、市場が開いていれば予約注文の約定も試みる。
// 前回取得から実際に1分以上経っていた銘柄だけがrefreshLiveQuotes()内の
// 判定で更新されるので、二重更新にはならない
document.addEventListener("visibilitychange", () => {
  if(document.visibilityState !== "visible") return;
  if(!stockScreenMounted()) return;
  refreshLiveQuotes();
  if(isUSMarketHoursJST()){
    processPendingOrders().then(({ processed }) => {
      if(processed > 0){
        if(S.screen === "portfolio") renderPortfolio();
        else if(S.screen === "holdings") renderHoldings();
      }
    });
  }
});

// サーバー経由でFinnhubの銘柄検索（/api/stocks?action=search）を叩き、ティッカー・
// 企業名の両方から幅広く候補を引く。ネットワーク不調時は例外を投げず
// 空配列を返して静かに諦める
async function searchStockSymbols(q){
  if(!q) return [];
  try{
    const res = await fetch(`/api/stocks?action=search&q=${encodeURIComponent(q)}`);
    if(!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];
    return results.map(r => ({ ticker: r.symbol, name: r.name }));
  }catch(e){ return []; }
}

// 検索結果1件ぶんの行。quotesにその銘柄の実際の現在値があればそれを、
// 無ければ「取得中」の目安として表示する。追加済みの銘柄はボタンを
// 無効化して「追加済み」と表示する
function stockSearchResultsHTML(list, watchlist, quotes, busy, query){
  if(busy) return `<div class="pf-search-empty">検索中…</div>`;
  if(!list.length) return `<div class="pf-search-empty">${(query||"").trim() ? "該当する銘柄が見つかりません。" : "銘柄を検索してください。"}</div>`;
  return list.map(s => {
    const added = watchlist.includes(s.ticker);
    const live = quotes && quotes[s.ticker];
    const priceHTML = live
      ? `$${live.price.toFixed(2)}`
      : `<span class="pf-watch-loading">取得中…</span>`;
    return `<div class="pf-search-row">
      <div class="pf-search-left">
        <span class="pf-ticker">${esc(s.ticker)}</span>
        <span class="pf-name">${esc(s.name)}</span>
      </div>
      <span class="pf-search-price">${priceHTML}</span>
      <button type="button" class="pf-search-addbtn${added?" added":""}" data-add-ticker="${esc(s.ticker)}" data-add-name="${esc(s.name)}"${added?" disabled":""}>${added?"追加済み":"＋ 追加"}</button>
    </div>`;
  }).join("");
}

// 「🔍 株式を検索して追加」ボタンから開く、幅広い米国株ティッカー・企業名の
// 検索・追加ポップアップ。入力が空の間はWATCH_STOCKSの主要銘柄を候補として
// 出し、文字を打つと/api/stocks?action=search（Finnhub）で実際に検索する。
// 入力のたびにAPIを叩くとレート制限をすぐ消費するため300msデバウンスし、
// 結果一覧だけを再描画して入力欄自体は作り直さない（フォーカス・カーソル
// 位置を保つため。gcal-selday-inputの候補表示と同じ考え方）
function openStockSearchModal(){
  const ov = document.createElement("div");
  ov.className = "modal-ov";
  const close = () => { try{ ov.remove(); }catch(e){} renderPortfolio(); };
  let query = "";
  let results = WATCH_STOCKS.map(s => ({ ticker:s.ticker, name:s.name }));
  let quotes = {};
  let busy = false;
  let searchDebounce = null;

  const renderResults = () => {
    const box = ov.querySelector("#pf-search-list");
    if(!box) return;
    box.innerHTML = stockSearchResultsHTML(results, loadWatchlist(), quotes, busy, query);
    box.querySelectorAll("[data-add-ticker]").forEach(btn => btn.onclick = () => {
      addToWatchlist(btn.dataset.addTicker, btn.dataset.addName);
      renderResults();
    });
  };

  const loadQuotesFor = (list) => {
    if(!list.length) return;
    fetchStockQuotes(list.map(r => r.ticker)).then(({ quotes: qs }) => {
      quotes = qs;
      if(document.body.contains(ov)) renderResults();
    });
  };

  ov.innerHTML = `
    <div class="modal pf-search-modal">
      <div class="modal-title" style="color:var(--text)">🔍 株式を検索して追加</div>
      <input type="text" class="gcal-ev-input" id="pf-search-input" placeholder="ティッカー or 銘柄名で検索（例: AAPL, IONQ, テスラ）" autocomplete="off">
      <div class="pf-search-list" id="pf-search-list"></div>
      <button class="ghost" id="pf-search-close" style="margin-top:12px">閉じる</button>
    </div>`;
  const input = ov.querySelector("#pf-search-input");
  input.oninput = () => {
    query = input.value;
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(async () => {
      const q = query.trim();
      if(!q){
        results = WATCH_STOCKS.map(s => ({ ticker:s.ticker, name:s.name }));
        quotes = {};
        renderResults();
        loadQuotesFor(results);
        return;
      }
      busy = true; renderResults();
      results = await searchStockSymbols(q);
      busy = false; renderResults();
      loadQuotesFor(results);
    }, 300);
  };
  ov.querySelector("#pf-search-close").onclick = close;
  renderResults();

  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if(e.target === ov) close(); });
  input.focus();

  loadQuotesFor(results);
}

// 「購入」「売却」共通の売買モーダル。数量入力のためだけに画面遷移させる
// のは操作コストが高く、逆に確認なく即実行すると誤タップで事故りやすいため、
// 「その場でシミュレーション結果（約定金額・手数料・残高への影響）を
// 見ながら確定する」ポップアップ形式にしている。
// prefillTickerは保有株一覧の「売却」ボタンから開いた場合に指定され、
// 銘柄選択ステップを飛ばして数量入力から始める
function openTradeModal(side, prefillTicker){
  const ov = document.createElement("div");
  ov.className = "modal-ov";
  const close = () => {
    try{ ov.remove(); }catch(e){}
    if(S.screen === "portfolio") renderPortfolio();
    else if(S.screen === "holdings") renderHoldings();
  };

  let ticker = prefillTicker || null;
  let name = ticker ? ((loadPortfolio()[ticker] || {}).name || ticker) : "";
  let price = null;
  let qty = 1;
  let query = "";
  let searchResults = [];
  let searchBusy = false;
  let searchDebounce = null;
  let errorMsg = "";
  let successMsg = "";

  const holding = () => loadPortfolio()[ticker];

  function tickerPickListHTML(){
    if(side === "sell"){
      const pf = loadPortfolio();
      const tickers = Object.keys(pf);
      if(!tickers.length) return `<div class="pf-search-empty">保有している株がありません。</div>`;
      return `<div class="pf-search-list">${tickers.map(t => `
        <div class="pf-search-row">
          <div class="pf-search-left">
            <span class="pf-ticker">${esc(t)}</span>
            <span class="pf-name">${esc(pf[t].name || t)}</span>
          </div>
          <span class="pf-search-price">${pf[t].shares}株</span>
          <button type="button" class="pf-search-addbtn" data-pick-ticker="${esc(t)}" data-pick-name="${esc(pf[t].name || t)}">選択</button>
        </div>`).join("")}</div>`;
    }
    return `
      <input type="text" class="gcal-ev-input" id="trade-search-input" placeholder="ティッカー or 銘柄名で検索（例: AAPL, IONQ, テスラ）" autocomplete="off">
      <div class="pf-search-list" id="trade-search-list">${tradeSearchResultsHTML()}</div>`;
  }

  function tradeSearchResultsHTML(){
    const list = query.trim() ? searchResults : WATCH_STOCKS.map(s => ({ ticker:s.ticker, name:s.name }));
    if(searchBusy) return `<div class="pf-search-empty">検索中…</div>`;
    if(!list.length) return `<div class="pf-search-empty">該当する銘柄が見つかりません。</div>`;
    return list.map(s => `
      <div class="pf-search-row">
        <div class="pf-search-left">
          <span class="pf-ticker">${esc(s.ticker)}</span>
          <span class="pf-name">${esc(s.name)}</span>
        </div>
        <button type="button" class="pf-search-addbtn" data-pick-ticker="${esc(s.ticker)}" data-pick-name="${esc(s.name)}">選択</button>
      </div>`).join("");
  }

  function qtyStepHTML(){
    const marketOpen = isUSMarketHoursJST();
    const h = holding();
    const maxQty = side === "sell" ? (h ? h.shares : 0) : null;
    const curPrice = price;
    const amount = curPrice ? tradeAmount(curPrice, qty) : 0;
    const fee = curPrice ? feeAmount(amount) : 0;
    const totalOrProceeds = side === "buy" ? (amount + fee) : Math.max(0, amount - fee);
    const cash = S.coins || 0;
    return `
      <div class="pf-trade-ticker-row">
        <div>
          <span class="pf-ticker">${esc(ticker)}</span>
          <span class="pf-name">${esc(name || ticker)}</span>
        </div>
        ${!prefillTicker ? `<button type="button" class="ghost" id="trade-change-ticker" style="padding:4px 10px;font-size:11px;">変更</button>` : ""}
      </div>
      <div class="pf-trade-price">${curPrice ? "現在値 $" + curPrice.toFixed(2) : "株価を取得中…"}</div>
      ${!marketOpen ? `<div class="pf-trade-note-off">⚪ 米国市場 取引時間外：確定すると予約注文となり、次の取引開始時の株価で自動約定します。</div>` : ""}
      <label class="pf-trade-qty-lab">数量（株）${side==="sell" ? `<span class="pf-trade-max">保有 ${maxQty}株</span>` : ""}</label>
      <input type="number" inputmode="numeric" min="1" step="1" ${maxQty!==null ? `max="${maxQty}"` : ""} class="gcal-ev-input" id="trade-qty-input" value="${qty}">
      <div class="pf-trade-summary">
        <div class="pf-trade-summary-row"><span>約定金額</span><span id="trade-amount-val">${curPrice ? amount.toLocaleString()+" AC" : "—"}</span></div>
        <div class="pf-trade-summary-row"><span>手数料（0.1%・最低1AC）</span><span id="trade-fee-val">${curPrice ? fee.toLocaleString()+" AC" : "—"}</span></div>
        <div class="pf-trade-summary-row total"><span>${side==="buy" ? "支払い合計" : "受取金額"}</span><span id="trade-total-val">${curPrice ? totalOrProceeds.toLocaleString()+" AC" : "—"}</span></div>
        <div class="pf-trade-summary-row muted"><span>${side==="buy" ? "購入後の現金残高（概算）" : "売却後の保有株数"}</span><span id="trade-after-val">${
          side==="buy"
            ? (curPrice ? Math.max(0, cash - totalOrProceeds).toLocaleString()+" AC" : "—")
            : (maxQty!==null ? Math.max(0, maxQty - qty)+"株" : "—")
        }</span></div>
      </div>
      ${errorMsg ? `<div class="pf-trade-error">⚠️ ${esc(errorMsg)}</div>` : ""}
      ${successMsg ? `<div class="pf-trade-success">✅ ${esc(successMsg)}</div>` : ""}
      <button type="button" class="pf-trade-confirm ${side}" id="trade-confirm-btn">${side==="buy" ? "この内容で購入する" : "この内容で売却する"}</button>
    `;
  }

  function bodyHTML(){ return ticker ? qtyStepHTML() : tickerPickListHTML(); }

  function repaintSearchList(){
    const list = ov.querySelector("#trade-search-list");
    if(!list) return;
    list.innerHTML = tradeSearchResultsHTML();
    bindPickButtons(list);
  }

  function bindPickButtons(scope){
    (scope || ov).querySelectorAll("[data-pick-ticker]").forEach(el => el.onclick = () => {
      selectTicker(el.dataset.pickTicker, el.dataset.pickName || el.dataset.pickTicker);
    });
  }

  async function selectTicker(sym, nm){
    ticker = sym;
    name = nm || sym;
    price = null;
    errorMsg = ""; successMsg = "";
    paint();
    const { quotes } = await fetchStockQuotes([sym]);
    const q = quotes[sym];
    if(q){ price = q.price; applyWatchQuotes(quotes); }
    paint();
  }

  function updateQtySummary(){
    const curPrice = price;
    const amount = curPrice ? tradeAmount(curPrice, qty) : 0;
    const fee = curPrice ? feeAmount(amount) : 0;
    const totalOrProceeds = side === "buy" ? (amount + fee) : Math.max(0, amount - fee);
    const cash = S.coins || 0;
    const h = holding();
    const maxQty = side === "sell" ? (h ? h.shares : 0) : null;
    const set = (id, val) => { const el = ov.querySelector("#" + id); if(el) el.textContent = val; };
    set("trade-amount-val", curPrice ? amount.toLocaleString() + " AC" : "—");
    set("trade-fee-val", curPrice ? fee.toLocaleString() + " AC" : "—");
    set("trade-total-val", curPrice ? totalOrProceeds.toLocaleString() + " AC" : "—");
    set("trade-after-val", side === "buy"
      ? (curPrice ? Math.max(0, cash - totalOrProceeds).toLocaleString() + " AC" : "—")
      : (maxQty !== null ? Math.max(0, maxQty - qty) + "株" : "—"));
  }

  function wireBody(){
    const box = ov.querySelector(".pf-trade-body");
    if(!box) return;
    if(!ticker){
      if(side === "buy"){
        const input = box.querySelector("#trade-search-input");
        if(input) input.oninput = () => {
          query = input.value;
          clearTimeout(searchDebounce);
          searchDebounce = setTimeout(async () => {
            const q = query.trim();
            if(!q){ searchResults = []; repaintSearchList(); return; }
            searchBusy = true; repaintSearchList();
            searchResults = await searchStockSymbols(q);
            searchBusy = false; repaintSearchList();
          }, 300);
        };
      }
      bindPickButtons(box);
      return;
    }
    const changeBtn = box.querySelector("#trade-change-ticker");
    if(changeBtn) changeBtn.onclick = () => { ticker = null; price = null; errorMsg = ""; successMsg = ""; paint(); };
    const qtyInput = box.querySelector("#trade-qty-input");
    if(qtyInput) qtyInput.oninput = () => {
      const v = parseInt(qtyInput.value, 10);
      qty = (Number.isFinite(v) && v > 0) ? v : 0;
      updateQtySummary();
    };
    const confirmBtn = box.querySelector("#trade-confirm-btn");
    if(confirmBtn) confirmBtn.onclick = () => {
      confirmBtn.disabled = true;
      errorMsg = ""; successMsg = "";
      if(!price){
        errorMsg = "株価を取得できていません。少し待ってから再度お試しください。";
        confirmBtn.disabled = false; paint(); return;
      }
      const q = Math.floor(qty);
      const result = side === "buy" ? buyStock(ticker, name, q, price) : sellStock(ticker, q, price);
      if(!result.ok){ errorMsg = result.msg; confirmBtn.disabled = false; paint(); return; }
      successMsg = result.msg;
      paint();
      setTimeout(close, 1400); // 結果を一瞬見せてから閉じる
    };
  }

  function paint(){
    const box = ov.querySelector(".pf-trade-body");
    if(!box) return;
    box.innerHTML = bodyHTML();
    wireBody();
  }

  ov.innerHTML = `
    <div class="modal pf-trade-modal">
      <div class="modal-title" style="color:var(--text)">${side === "buy" ? "🛒 株を購入" : "💴 株を売却"}</div>
      <div class="pf-trade-body"></div>
      <button class="ghost" id="pf-trade-close" style="margin-top:12px">閉じる</button>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if(e.target === ov) close(); });
  ov.querySelector("#pf-trade-close").onclick = close;
  paint();

  if(ticker) selectTicker(ticker, name);
}

// 市場が開いていれば予約注文の自動約定を試み、約定があれば表示中の画面を
// 再描画する。renderPortfolio()/renderHoldings()の末尾から共通で呼ばれる
function checkPendingOrdersOnMount(){
  if(!isUSMarketHoursJST()) return;
  processPendingOrders().then(({ processed }) => {
    if(processed <= 0) return;
    if(S.screen === "portfolio") renderPortfolio();
    else if(S.screen === "holdings") renderHoldings();
  });
}

/* ポートフォリオ（株価）画面：現金AC＋保有株の評価額（リアルタイム株価×
   保有株数）を合算した総資産をヒーローカードで見せることに専念させる。
   保有明細はヒーローカード右上の「保有株」ボタンから別画面（renderHoldings）
   へ遷移して確認する。加えて、検索して自由に登録できるウォッチリスト
   （値動き確認専用・売買なし）をヒーローカードの下に表示し、画面最下部には
   売買を始めるための固定の購入／売却ボタンを常設する */
export function renderPortfolio(){
  const { rows, totalValue } = computeHoldingsSummary();
  const cash = S.coins || 0;
  const watchHTML = watchListInnerHTML();
  const pendingCount = loadPendingOrders().length;
  app.innerHTML = `
    <div class="q-head"><button class="quit" data-go="select">← ホーム</button><span class="q-count">株価</span></div>
    <div class="pf-hero">
      <button type="button" class="pf-hero-holdings-btn" data-go="holdings" aria-label="保有株を見る" title="保有株を見る">
        📃 保有株<span class="pf-hero-holdings-count">${rows.length}</span>
      </button>
      <div class="pf-hero-lab">総資産（評価額）</div>
      <div class="pf-hero-total" id="pf-hero-total">${(cash + totalValue).toLocaleString()} <small>AC</small></div>
      <div class="pf-hero-sub" id="pf-hero-sub-text">💰 現金 ${cash.toLocaleString()} AC ・ 📈 株式 ${totalValue.toLocaleString()} AC</div>
    </div>
    ${pendingCount ? `<div class="pf-pending-badge">⏳ 予約注文 ${pendingCount}件（取引時間開始時にその時点の株価で自動約定します）</div>` : ""}
    <div class="section-lab">ウォッチリスト</div>
    <button type="button" class="pf-watch-addbtn" id="pf-watch-add-btn">🔍 株式を検索して追加</button>
    <div id="pf-watch-badge-wrap">${watchHTML ? watchLiveBadgeHTML() : ""}</div>
    <div id="pf-watch-list-wrap">${watchHTML}</div>
    ${(!watchHTML && !rows.length) ? `<div class="sel-sub" style="margin-top:24px;text-align:center;">保有している株はまだありません。下の「購入」から取引を始めましょう。</div>` : ""}
    <div class="trade-note" style="text-align:center;margin-top:18px;">※ゲーム内通貨ACを使ったデモ取引です。売買手数料（約定金額の0.1%・最低1AC）がかかります。ウォッチリストは値動き確認のみで売買は行われません。</div>
    <div class="pf-tradebar-spacer"></div>
    <div class="pf-tradebar">
      <button type="button" class="pf-tradebar-btn buy" id="pf-buy-btn">🛒 購入</button>
      <button type="button" class="pf-tradebar-btn sell" id="pf-sell-btn">💴 売却</button>
    </div>
  `;
  app.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
  const addBtn = document.getElementById("pf-watch-add-btn");
  if(addBtn) addBtn.onclick = openStockSearchModal;
  document.getElementById("pf-buy-btn").onclick = () => openTradeModal("buy");
  document.getElementById("pf-sell-btn").onclick = () => openTradeModal("sell");
  bindWatchListRowEvents();
  refreshLiveQuotes(); // 未取得の銘柄と、前回取得から1分以上経った銘柄だけを更新する（画面を開き直しただけでは動かない）
  startWatchLiveRefresh(); // 以後は市場時間中のみ1分ごとにバックグラウンド更新
  checkPendingOrdersOnMount();
  chappyOnStocksViewed();   // 🏠 株価・経済の活動ポイント（1日上限あり・XPは付かない）
}

/* 保有株一覧画面：株価画面のヒーローカード右上「保有株」ボタンから遷移する
   専用画面。各銘柄をリアルタイム株価×保有株数で評価し、行ごとに「売却」
   ショートカットを置く。売買ボタンは株価画面と同じものをここにも常設する */
export function renderHoldings(){
  const { rows, totalValue } = computeHoldingsSummary();
  const cash = S.coins || 0;
  app.innerHTML = `
    <div class="q-head"><button class="quit" data-go="portfolio">← 株価</button><span class="q-count">保有株</span></div>
    <div class="pf-hero pf-hero-compact">
      <div class="pf-hero-lab">株式評価額</div>
      <div class="pf-hero-total">${totalValue.toLocaleString()} <small>AC</small></div>
      <div class="pf-hero-sub">💰 現金 ${cash.toLocaleString()} AC ・ 保有 ${rows.length}銘柄</div>
    </div>
    <div id="pf-holdings-list-wrap">${holdingsListInnerHTML()}</div>
    ${!rows.length ? `<div class="sel-sub" style="margin-top:24px;text-align:center;">保有している株はまだありません。</div>` : ""}
    <div class="pf-tradebar-spacer"></div>
    <div class="pf-tradebar">
      <button type="button" class="pf-tradebar-btn buy" id="pf-buy-btn">🛒 購入</button>
      <button type="button" class="pf-tradebar-btn sell" id="pf-sell-btn">💴 売却</button>
    </div>
  `;
  app.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
  document.getElementById("pf-buy-btn").onclick = () => openTradeModal("buy");
  document.getElementById("pf-sell-btn").onclick = () => openTradeModal("sell");
  bindHoldingsRowEvents();
  refreshLiveQuotes();
  startWatchLiveRefresh();
  checkPendingOrdersOnMount();
}

// Gemini AIチャット相談画面。会話履歴はgeminiChat（js/gemini.js）が保持し、
// この画面はその内容を描画するだけ。送信はサーバー側の /api/gemini/chat
// 経由（APIキーはサーバーのみが保持）で行う。
function geminiMessageBubbleHTML(m){
  if(m.type === "schedule_confirm") return geminiScheduleConfirmCardHTML(m);
  // Geminiの回答（role==="model"）だけ、```コマンド実行例```を黒いターミナル風
  // カードに整形する。ユーザー発言はそのまま通常の吹き出し表示にする
  const hasCode = m.role === "model" && GEMINI_CODE_FENCE_HAS_RE.test(m.text || "");
  const cls = "gemini-bubble " + (m.role === "user" ? "gemini-bubble-user" : "gemini-bubble-model") + (hasCode ? " gemini-bubble-has-code" : "");
  const body = m.role === "model" ? geminiFormatModelText(m.text) : esc(m.text).replace(/\n/g, "<br>");
  return `<div class="${cls}">${body}</div>`;
}

// LPICコマンドの実行例など、Geminiが```で囲んで返してきたコードブロックを
// 検出し、通常のテキスト部分（エスケープ＋改行→<br>のまま）と、黒い
// ターミナル風カード（コピー用ボタン付き）に振り分けて組み立てる
const GEMINI_CODE_FENCE_RE = /```[a-zA-Z0-9]*\n?([\s\S]*?)```/g;
// hasCode判定専用（gフラグ無し）。GEMINI_CODE_FENCE_REはexecループでlastIndexを
// 使い回すため、同じ正規表現をtest()にも使うとlastIndexが混線して次のメッセージの
// 判定を取りこぼす。判定用だけ別インスタンスに分けて事故を防ぐ
const GEMINI_CODE_FENCE_HAS_RE = /```[a-zA-Z0-9]*\n?[\s\S]*?```/;

function geminiFormatModelText(text){
  const src = text || "";
  let html = "";
  let lastIndex = 0;
  let match;
  GEMINI_CODE_FENCE_RE.lastIndex = 0;
  while((match = GEMINI_CODE_FENCE_RE.exec(src))){
    const before = src.slice(lastIndex, match.index);
    if(before) html += esc(before).replace(/\n/g, "<br>");
    html += geminiTerminalCardHTML(match[1]);
    lastIndex = GEMINI_CODE_FENCE_RE.lastIndex;
  }
  const rest = src.slice(lastIndex);
  if(rest) html += esc(rest).replace(/\n/g, "<br>");
  return html;
}

// コードブロックの中身を1行ずつ見て、「$ 」「# 」で始まる行はコマンド行
// （緑のプロンプト記号＋コピー対象としてマークするgemini-term-cmdクラス）、
// それ以外は結果の出力行として薄い色で表示する
function geminiTerminalCardHTML(raw){
  const body = (raw || "").replace(/^\n/, "").replace(/\n$/, "");
  const lines = body.split("\n");
  const rowsHTML = lines.map(line => {
    const m = line.match(/^([$#])\s(.*)$/);
    if(m){
      return `<div class="gemini-term-line"><span class="gemini-term-prompt">${esc(m[1])}</span> <span class="gemini-term-cmd">${esc(m[2])}</span></div>`;
    }
    return `<div class="gemini-term-line gemini-term-out">${line ? esc(line) : "&nbsp;"}</div>`;
  }).join("");
  return `
    <div class="gemini-code-card">
      <div class="gemini-code-head">
        <span class="gemini-code-dots"><span></span><span></span><span></span></span>
        <span class="gemini-code-title">Terminal</span>
        <button type="button" class="gemini-code-copy">📋 コピー</button>
      </div>
      <div class="gemini-code-body">${rowsHTML}</div>
    </div>`;
}

// コピー対象は「$ 」「# 」で始まっていたコマンド行だけ（.gemini-term-cmd）。
// 結果の出力例まで一緒にコピーしてしまうと、そのまま端末に貼り付けられない
// ため、コマンド行が見つからない場合のみブロック全文にフォールバックする
function geminiCopyCodeCard(card){
  const cmdEls = card.querySelectorAll(".gemini-term-cmd");
  const text = cmdEls.length
    ? Array.from(cmdEls).map(el => el.textContent).join("\n")
    : (card.querySelector(".gemini-code-body") || {}).textContent || "";
  if(!text) return Promise.reject(new Error("no-text"));
  if(navigator.clipboard && navigator.clipboard.writeText){
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    try{
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      resolve();
    }catch(e){ reject(e); }
  });
}

// register_scheduleの結果を出す確認カード。ステータスに応じて、ボタン付きの
// 未確定表示／確定済み表示／キャンセル済み表示のいずれかを描画する。
// 「修正する」は専用の予定修正画面（renderGeminiEditEvent）へ画面遷移するため、
// このカード自体は常にpending/confirmed/cancelledのいずれかの表示のみを持つ
function geminiScheduleConfirmCardHTML(m){
  const p = m.preview;
  const warningHTML = p.warning ? `<div class="gemini-schedule-warning">⚠️ ${esc(p.warning)}</div>` : "";
  const relativeNoteHTML = p.relativeNote ? `<div class="gemini-schedule-row">・${esc(p.relativeNote)}</div>` : "";
  const recurrenceHTML = p.recurrenceLabel ? `<div class="gemini-schedule-row">・🔁 ${esc(p.recurrenceLabel)}</div>` : "";
  const statusLabel = m.status === "confirmed" ? "（登録済み）" : m.status === "cancelled" ? "（キャンセル済み）" : "";
  const actionsHTML = m.status === "pending"
    ? `<div class="gemini-schedule-actions">
        <button type="button" class="gemini-schedule-btn gemini-schedule-btn-confirm" data-schedule-confirm="${m.id}">この内容で登録する</button>
        <div class="gemini-schedule-actions-row">
          <button type="button" class="gemini-schedule-btn gemini-schedule-btn-edit" data-schedule-edit="${m.id}">修正する</button>
          <button type="button" class="gemini-schedule-btn gemini-schedule-btn-cancel" data-schedule-cancel="${m.id}">キャンセル</button>
        </div>
      </div>`
    : "";
  return `
    <div class="gemini-bubble gemini-bubble-model gemini-schedule-card${m.status !== "pending" ? " gemini-schedule-card-done" : ""}">
      <div class="gemini-schedule-title">📅 予定の確認${statusLabel}</div>
      <div class="gemini-schedule-row">・タイトル：${esc(p.title)}</div>
      <div class="gemini-schedule-row">・日時：${esc(p.dateLabel)} ${esc(p.timeLabel)}</div>
      ${relativeNoteHTML}
      ${recurrenceHTML}
      ${warningHTML}
      ${actionsHTML}
    </div>`;
}

// 「修正する」ボタンで開くGUI編集フォーム。現在のプレビュー値（AIが抽出した
// タイトル・日付・開始/終了時刻）を初期値として各入力欄にそのまま入れておき、
// ユーザーは手直ししたい項目だけ書き換えられるようにする
function geminiScheduleEditFormHTML(m){
  const a = m.preview.args;
  const dateStr = `${a.y}-${String(a.m + 1).padStart(2, "0")}-${String(a.d).padStart(2, "0")}`;
  return `
    <div class="gemini-bubble gemini-bubble-model gemini-schedule-card gemini-schedule-form">
      <label class="gemini-schedule-field">
        <span class="gemini-schedule-field-label">タイトル</span>
        <input type="text" class="gemini-schedule-input" data-field="title" maxlength="200" value="${esc(m.preview.title)}">
      </label>
      <div class="gemini-schedule-field-row">
        <label class="gemini-schedule-field">
          <span class="gemini-schedule-field-label">日付</span>
          <input type="date" class="gemini-schedule-input" data-field="date" value="${esc(dateStr)}">
        </label>
      </div>
      <div class="gemini-schedule-field-row">
        <label class="gemini-schedule-field">
          <span class="gemini-schedule-field-label">開始</span>
          <input type="time" class="gemini-schedule-input" data-field="start" value="${esc(a.start)}">
        </label>
        <label class="gemini-schedule-field">
          <span class="gemini-schedule-field-label">終了</span>
          <input type="time" class="gemini-schedule-input" data-field="end" value="${esc(a.end)}">
        </label>
      </div>
      <div class="gemini-schedule-form-error" data-form-error hidden></div>
      <div class="gemini-schedule-actions-row">
        <button type="button" class="gemini-schedule-btn gemini-schedule-btn-confirm" data-schedule-save="${m.id}">この内容で保存（登録）</button>
        <button type="button" class="gemini-schedule-btn gemini-schedule-btn-cancel" data-schedule-edit-cancel="${m.id}">キャンセル</button>
      </div>
    </div>`;
}

// 直前のメッセージが未確定の確認カードのとき、ユーザーがボタンではなく
// 「OK」「キャンセル」等をチャットで直接打ち込んでも確定・取消できるようにする
const GEMINI_CONFIRM_TEXT_RE = /^(ok|okay|オーケー|おっけー|はい|うん|了解|りょうかい|お願いします?|よろしく(お願いします?)?|登録(して(ください)?|する)?|それで(お願いします?)?)[!!。、\s]*$/i;
const GEMINI_CANCEL_TEXT_RE = /^(キャンセル(します?)?|やめ(る|て|ます)?|中止(します?)?|いいえ|いや|やっぱ(り)?(やめ(ます)?)?)[!!。、\s]*$/;

// 入力欄（.gemini-input）はrows="1"のまま、内容に応じてscrollHeightから
// 高さを算出して伸び縮みさせる（CSS側のmax-height:124pxで4行相当に頭打ち）。
// 一度高さをautoに戻してから測るのは、縮んだ場合（改行削除等）に
// scrollHeightが古い高さのまま縮まなくなるのを防ぐため
function autoResizeGeminiInput(el){
  if(!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 124) + "px";
}

// ストリーミング中のテキスト断片が届くたび毎回render()すると無駄が多いため、
// アニメーションフレームごとに最大1回だけrender()するよう間引く
let geminiStreamRenderScheduled = false;
function scheduleGeminiStreamRender(){
  if(geminiStreamRenderScheduled) return;
  geminiStreamRenderScheduled = true;
  requestAnimationFrame(() => {
    geminiStreamRenderScheduled = false;
    render();
  });
}

// Gemini相談の入力欄に書きかけの文章。再描画で消えないよう画面の外に持つ
let geminiInputDraft = "";

export function renderGeminiChat(){
  // 再描画（ストリーミング更新・クラウド同期など）の前に、いま会話ログを
  // どこまで読んでいたかを控える。ユーザーが過去の発言までさかのぼって
  // 読んでいる最中に、勝手に最下部へ引き戻さないため
  const prevScrollEl = document.getElementById("gemini-scroll");
  const prevScrollTop = prevScrollEl ? prevScrollEl.scrollTop : null;
  const wasAtBottom = !prevScrollEl
    || (prevScrollEl.scrollHeight - prevScrollEl.scrollTop - prevScrollEl.clientHeight) < 60;
  // 入力中だった場合のカーソル位置（再描画後に同じ場所へ戻す）
  const prevInputEl = document.getElementById("gemini-input");
  const keepCaret = prevInputEl && document.activeElement === prevInputEl
    ? { start: prevInputEl.selectionStart, end: prevInputEl.selectionEnd }
    : null;
  const messages = geminiChat.messages;
  const msgsHTML = messages.length
    ? messages.map(geminiMessageBubbleHTML).join("")
    : `<div class="gemini-empty">✨ Azureやこのアプリの資格勉強について、Geminiに気軽に質問してみましょう。<br>「7月9日16時から17時で面接を入れて」のように話しかけると、確認カードが表示され、内容を確定すると予定を登録できます。</div>`;
  // ストリーミングで既に届いているテキストがあれば「考え中」の代わりに
  // それをそのまま吹き出しとして表示し、生成中でも進捗が見えるようにする
  const busyHTML = geminiChat.busy
    ? (geminiChat.streamingText
        ? `<div class="gemini-bubble gemini-bubble-model">${esc(geminiChat.streamingText).replace(/\n/g, "<br>")}</div>`
        : `<div class="gemini-bubble gemini-bubble-model gemini-bubble-busy">…考え中</div>`)
    : "";
  const errorHTML = geminiChat.error ? `<div class="gemini-error">${esc(geminiChat.error)}</div>` : "";
  // 他画面から「Geminiに質問する」で遷移してきた場合の下書きテキスト。
  // 一度読み取ったら使い切り、次回の再描画で二重に入らないようクリアする。
  // 入力途中の文章（geminiInputDraft）は、ストリーミング更新やクラウド同期に
  // よる再描画をまたいでも消えないよう、そのまま書き戻す
  if(geminiChat.draft) geminiInputDraft = geminiChat.draft;
  geminiChat.draft = "";
  const draftText = geminiInputDraft;
  // 問題の解答・解説から「Geminiに質問する」で来た場合は、そのままチャットを
  // 終えたときに元の解説画面へ戻れるようにする（通常はホームへ戻る）
  const backTarget = S.geminiReturnScreen || "select";
  const backLabel = backTarget === "review" ? "← 解説へ戻る" : "← ホーム";

  app.innerHTML = `
    <div class="q-head"><button class="quit" data-gemini-back>${backLabel}</button><span class="q-count">✨ Gemini相談</span></div>
    <div class="gemini-chat-wrap">
      <div class="gemini-chat-scroll" id="gemini-scroll">${msgsHTML}${busyHTML}</div>
      ${errorHTML}
      <div class="gemini-input-row">
        <textarea id="gemini-input" class="gemini-input" rows="1" placeholder="Azureやこのアプリについて質問できます…" ${geminiChat.busy ? "disabled" : ""}>${esc(draftText)}</textarea>
        <button type="button" class="gemini-send" id="gemini-send" ${geminiChat.busy ? "disabled" : ""}>送信</button>
      </div>
    </div>
  `;
  app.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
  const backBtn = app.querySelector("[data-gemini-back]");
  if(backBtn) backBtn.onclick = () => { S.geminiReturnScreen = null; go(backTarget); };

  // 最下部を見ていた（＝最新の返信を追っている）ときだけ末尾へ追従し、
  // 上の方を読んでいたときは元の位置のまま据え置く
  const scrollEl = document.getElementById("gemini-scroll");
  if(scrollEl){
    if(wasAtBottom) scrollEl.scrollTop = scrollEl.scrollHeight;
    else if(prevScrollTop !== null) scrollEl.scrollTop = prevScrollTop;
  }

  app.querySelectorAll(".gemini-code-copy").forEach(btn => {
    btn.onclick = () => {
      const card = btn.closest(".gemini-code-card");
      if(!card) return;
      const original = btn.textContent;
      geminiCopyCodeCard(card).then(() => {
        btn.textContent = "✅ コピーしました";
        btn.disabled = true;
        setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1500);
      }).catch(() => {});
    };
  });

  app.querySelectorAll("[data-schedule-confirm]").forEach(btn => {
    btn.onclick = () => {
      const id = Number(btn.dataset.scheduleConfirm);
      const msg = geminiChat.messages.find(mm => mm.id === id);
      if(!msg || msg.status !== "pending") return;
      btn.disabled = true;
      geminiConfirmSchedule(msg).then(() => render());
    };
  });
  app.querySelectorAll("[data-schedule-cancel]").forEach(btn => {
    btn.onclick = () => {
      const id = Number(btn.dataset.scheduleCancel);
      const msg = geminiChat.messages.find(mm => mm.id === id);
      if(!msg || msg.status !== "pending") return;
      geminiCancelSchedule(msg);
      render();
    };
  });
  app.querySelectorAll("[data-schedule-edit]").forEach(btn => {
    btn.onclick = () => {
      const id = Number(btn.dataset.scheduleEdit);
      const msg = geminiChat.messages.find(mm => mm.id === id);
      if(!msg || msg.status !== "pending") return;
      // チャット内のカード切替ではなく、専用の予定修正画面へ遷移する
      geminiEditingMessageId = id;
      go("gemini-edit-event");
    };
  });

  const inputEl = document.getElementById("gemini-input");
  const sendBtn = document.getElementById("gemini-send");
  // 下書き復元時など初期表示の時点で複数行入っている場合にも、最初から
  // 正しい高さで表示されるようにしておく
  autoResizeGeminiInput(inputEl);
  // 入力中に再描画が入った場合だけ、フォーカスとカーソル位置を戻す
  // （初期表示では自動フォーカスしない＝勝手にキーボードを出さない）
  if(inputEl && keepCaret && !inputEl.disabled){
    inputEl.focus();
    try{ inputEl.setSelectionRange(keepCaret.start, keepCaret.end); }catch(e){}
  }
  const submit = () => {
    if(!inputEl || geminiChat.busy) return;
    const text = inputEl.value;
    const trimmed = text.trim();
    if(!trimmed) return;
    // 送信したら書きかけの控えは使い切る（次の再描画で復活させない）
    geminiInputDraft = "";
    inputEl.value = "";

    // 直前のメッセージが未確定の予定確認カードなら、「OK」「キャンセル」等の
    // 短い返答はGeminiへ送らずここで直接確定／取消として処理する
    const lastMsg = geminiChat.messages[geminiChat.messages.length - 1];
    if(lastMsg && lastMsg.type === "schedule_confirm" && lastMsg.status === "pending"){
      if(GEMINI_CONFIRM_TEXT_RE.test(trimmed)){
        pushGeminiMessage({ role: "user", text: trimmed });
        render();
        geminiConfirmSchedule(lastMsg).then(() => render());
        return;
      }
      if(GEMINI_CANCEL_TEXT_RE.test(trimmed)){
        pushGeminiMessage({ role: "user", text: trimmed });
        geminiCancelSchedule(lastMsg);
        render();
        return;
      }
    }

    // ここでボタン/入力欄を即座に無効化してから送信する。geminiChat.busyは
    // sendGeminiMessage内で最初のawaitに達するまでに同期的にtrueへ変わり
    // render()でも disabled が反映されるが、それより前に二重クリックや
    // Enter連打が割り込む余地を残さないよう明示的にも無効化しておく
    if(sendBtn) sendBtn.disabled = true;
    if(inputEl) inputEl.disabled = true;

    // sendGeminiMessageは最初のawait（fetch）に達するまで同期的に実行される
    // ため、この呼び出し直後にrender()すれば「送信したメッセージ＋考え中」を
    // 即座に画面へ反映できる（完了を待ってからのrenderは応答受信後）。
    // ストリーミング中はテキストの断片が届くたびにonChunkが呼ばれるが、
    // 断片ごとに毎回フルre-renderすると無駄が多いため、アニメーションフレーム
    // ごとに最大1回だけrender()するよう間引く
    const p = sendGeminiMessage(text, scheduleGeminiStreamRender);
    render();
    p.then(() => render());
  };
  if(sendBtn) sendBtn.onclick = submit;
  if(inputEl){
    // 入力するたびに高さを再計算し、改行や折り返しで複数行になった分だけ
    // 入力欄を（下部ナビに被らないよう上方向に）伸ばす
    inputEl.addEventListener("input", () => {
      geminiInputDraft = inputEl.value;   // 再描画をまたいでも消えないよう控える
      autoResizeGeminiInput(inputEl);
    });
    // 画面表示のたびに自動でフォーカスすると、Gemini相談ボタンを押した
    // だけでスマホの仮想キーボードが勝手に立ち上がってしまうため、
    // ユーザーが入力欄自体をタップするまでフォーカスは当てない
    inputEl.addEventListener("keydown", (e) => {
      if(e.key !== "Enter" || e.shiftKey) return;
      // 日本語IME等で変換確定のためにEnterを押した場合（isComposing）は
      // 送信せず、確定後に改めて押されたEnterだけを送信として扱う。
      // ここを見ずに送信すると「変換確定のEnter」と「送信のEnter」の
      // 2回分が両方送信されてしまい、1メッセージのつもりが二重送信になる
      if(e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      submit();
    });
  }
}

// renderGeminiEditEvent（予定修正画面）が対象とするメッセージIDを保持する。
// 画面遷移をまたいで参照できるよう、Gemini相談チャットの内部状態
// （geminiChat.messages）とは別にモジュールスコープの変数として持たせる
let geminiEditingMessageId = null;

// 「修正する」ボタン押下で遷移する専用の予定修正画面。チャット内のカード
// 切替ではなく画面全体を遷移させ、保存・キャンセルどちらの操作でも
// 完了後は自動的に元のGeminiチャット画面へ戻す
export function renderGeminiEditEvent(){
  const msg = geminiChat.messages.find(mm => mm.id === geminiEditingMessageId);
  if(!msg || msg.status !== "pending"){
    // 対象の確認カードがすでに確定・取消済み等で存在しない場合はチャットへ戻す
    geminiEditingMessageId = null;
    go("gemini");
    return;
  }

  const backToChat = () => {
    geminiEditingMessageId = null;
    go("gemini");
  };

  app.innerHTML = `
    <div class="q-head"><button class="quit" data-schedule-edit-back>← チャットに戻る</button><span class="q-count">✏️ 予定を修正</span></div>
    <div class="gemini-edit-wrap">
      ${geminiScheduleEditFormHTML(msg)}
    </div>
  `;

  const backBtn = app.querySelector("[data-schedule-edit-back]");
  if(backBtn) backBtn.onclick = backToChat;

  const cancelBtn = app.querySelector("[data-schedule-edit-cancel]");
  if(cancelBtn) cancelBtn.onclick = backToChat;

  const saveBtn = app.querySelector("[data-schedule-save]");
  if(saveBtn){
    saveBtn.onclick = async () => {
      const card = saveBtn.closest(".gemini-schedule-form");
      if(!card) return;
      const field = (name) => (card.querySelector(`[data-field="${name}"]`) || {}).value || "";
      const errorEl = card.querySelector("[data-form-error]");
      if(errorEl){ errorEl.hidden = true; errorEl.textContent = ""; }

      saveBtn.disabled = true;
      const result = await geminiApplyScheduleEdits(msg, {
        title: field("title"),
        date: field("date"),
        start: field("start"),
        end: field("end"),
      });
      if(result.error){
        saveBtn.disabled = false;
        // バリデーションエラー時は画面遷移せず、入力途中の値を保持したまま
        // フォーム内にエラーだけ表示する
        if(errorEl){ errorEl.hidden = false; errorEl.textContent = result.error; }
        return;
      }
      // 保存＝修正後の内容でそのまま実際の登録を実行し、完了後にチャットへ戻る
      await geminiConfirmSchedule(msg);
      geminiEditingMessageId = null;
      go("gemini");
    };
  }

}

// Microsoftロゴ（4色の田の字）をイメージした角丸スクエアアイコン。学習シートのMicrosoft項目で使う
const MS_LOGO_ICON_HTML = `<span class="ms-logo-grid">
      <span class="ms-logo-sq r"></span>
      <span class="ms-logo-sq g"></span>
      <span class="ms-logo-sq b"></span>
      <span class="ms-logo-sq y"></span>
    </span>`;

// LPIC（Linux技術者認定）をイメージしたペンギン（Linuxの象徴）アイコン。プレースホルダー的な絵文字表現。
const LPIC_LOGO_ICON_HTML = `<span class="launcher-emoji" aria-hidden="true">🐧</span>`;

// Linuxプレイグラウンド（既存のターミナル風サンドボックス画面）用アイコン。
// 旧「プレイグラウンド」タブのSVGをそのまま踏襲する
const PLAYGROUND_LAUNCHER_ICON_SVG = `
  <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4.5" width="18" height="15" rx="2.4"></rect><path d="m7 9.5 3 2.7-3 2.7"></path><path d="M12.5 15h4.5"></path>
  </svg>`;

// シナリオモード（実務の依頼を読んで自分でコマンドを組み立てる学習モード）用アイコン
const SCENARIO_LAUNCHER_ICON_HTML = `<span class="launcher-emoji" aria-hidden="true">🧑‍💼</span>`;

// J-NEWS/F-NEWS/株価/カレンダー/イントロドン/設定/ルールで使うアイコン群
const STOCK_LAUNCHER_ICON_SVG = `
  <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 17 9.5 10.5 13.5 14.5 21 6"></polyline>
    <polyline points="14.5 6 21 6 21 12.5"></polyline>
  </svg>`;
// Googleカレンダーのアプリアイコンを思わせる「今日の日付を表示する
// カレンダー」デザイン（青いヘッダーバー＋今日の日付の数字）。予定管理
// アイコン（線画のみ）とは見た目を分け、単独の「カレンダー」画面への
// 入口だと一目でわかるようにする
const CALENDAR_APP_LAUNCHER_ICON_SVG = `
  <svg viewBox="0 0 24 24" width="21" height="21">
    <rect x="2.5" y="4" width="19" height="17" rx="3" fill="#ffffff" stroke="var(--line)" stroke-width="1.2"></rect>
    <path d="M2.5 7a3 3 0 0 1 3-3h13a3 3 0 0 1 3 3v2H2.5V7z" fill="#4285f4"></path>
    <line x1="7.5" y1="2" x2="7.5" y2="6.5" stroke="#1a56c4" stroke-width="1.7" stroke-linecap="round"></line>
    <line x1="16.5" y1="2" x2="16.5" y2="6.5" stroke="#1a56c4" stroke-width="1.7" stroke-linecap="round"></line>
    <text x="12" y="18" text-anchor="middle" font-size="9" font-weight="700" fill="#3c4043" font-family="Arial, sans-serif">${new Date().getDate()}</text>
  </svg>`;

// 設定（ギア）専用アイコン
const SETTINGS_GEAR_ICON_SVG = `
  <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3.2"></circle>
    <path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V19.5a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.96 17.85a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 13.5 1.7 1.7 0 0 0 3.04 12.46H2.95a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 7.42 1.7 1.7 0 0 0 4.26 5.55l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 8.96 3.06 1.7 1.7 0 0 0 10 1.5V1.41a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.04 3.06a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 7.42 1.7 1.7 0 0 0 20.96 8.46h.09a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.04Z"></path>
  </svg>`;

// ルール専用アイコン（規約・一覧を表す書類アイコン）
const RULES_LIST_ICON_SVG = `
  <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 2.8h9.2L19 6.6V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.8a1 1 0 0 1 1-1Z"></path>
    <path d="M15 2.8V6.6h3.8"></path>
    <line x1="7.6" y1="11" x2="15.6" y2="11"></line>
    <line x1="7.6" y1="14.4" x2="15.6" y2="14.4"></line>
    <line x1="7.6" y1="17.8" x2="13" y2="17.8"></line>
  </svg>`;

// イントロドン専用アイコン（音符の線画。絵文字は使わない）
const INTROQUIZ_LAUNCHER_ICON_SVG = `
  <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 18V6l10-2v12"></path>
    <circle cx="6.5" cy="18" r="2.5"></circle>
    <circle cx="16.5" cy="16" r="2.5"></circle>
  </svg>`;

/* =========================================================================
   📱 「各種機能」「学習」タブ用ボトムシート
   BottomNavigationの2タブから開く、画面下からスライドインするiOS風の
   メニュー。中身はiPhoneのホーム画面のような丸型アイコンのグリッド表示。
   タップ後は既存の go()／openSettingsModal()／openRulesModal()
   をそのまま呼び出すだけで、遷移先の画面・モーダル自体はこれまでと同じ。
   ========================================================================= */
// ボトムシート表示中は、iOS Safari／PWAでも背後のホーム画面が一切スクロール
// しないよう、bodyをposition:fixedで開いた瞬間のスクロール位置に固定する。
// `overflow:hidden`だけだとiOSではラバーバンドスクロールで背景が動いてしまう
// ため、position:fixed＋座標保持で完全に固定し、閉じたら元の位置へ戻す。
let sheetScrollY = 0;

function lockBodyScrollForSheet(){
  sheetScrollY = window.scrollY || window.pageYOffset || 0;
  document.body.style.position = "fixed";
  document.body.style.top = `-${sheetScrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
}

function unlockBodyScrollForSheet(){
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  window.scrollTo(0, sheetScrollY);
}

// シート外（暗い背景・ハンドル・タイトル）でのtouchmoveはpassive:falseで
// 確実にpreventDefaultし、背後の画面へスクロールが伝わらないようにする。
// .bottom-sheet-list内は、収まりきらない項目がある場合のみ内部スクロールを
// 許可する。さらにスクロールが上端／下端に到達した状態で同方向へさらに
// スワイプされた分（ラバーバンド分）もpreventDefaultし、そこから先の
// スクロールが背後のホーム画面へ伝播しないようにする。
function createSheetTouchGuard(ov){
  let lastY = 0;
  return {
    onTouchStart(e){
      if(e.touches.length === 1) lastY = e.touches[0].clientY;
    },
    onTouchMove(e){
      // textarea内（復習掲示板の登録・編集シートなど）で入力文字が多く、
      // textarea自身が内部スクロール可能な場合は、この関数のpreventDefaultで
      // ブロックせずネイティブのスクロールに任せる
      const ta = e.target.closest && e.target.closest("textarea");
      if(ta && ta.scrollHeight > ta.clientHeight) return;
      const list = ov.querySelector(".bottom-sheet-list");
      if(!list || !list.contains(e.target) || list.scrollHeight <= list.clientHeight){
        e.preventDefault();
        return;
      }
      const y = e.touches[0].clientY;
      const movingDown = y > lastY;
      const atTop = list.scrollTop <= 0;
      const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
      if((movingDown && atTop) || (!movingDown && atBottom)){
        e.preventDefault();
      }
      lastY = y;
    },
  };
}

// 上部の.bottom-sheet-drag-handle（グレーのハンドル＋タイトル）を下方向へ
// スワイプすると、シート全体をtranslateYで指の動きに追従させる。指を離した
// 時点で「移動距離がシート高さの約20%以上」または「一定速度以上の素早い
// スワイプ」だった場合はそのまま閉じ、それ以外は.bottom-sheet-showのCSS
// トランジションで元の位置へ滑らかに戻す。
const SHEET_CLOSE_DISTANCE_RATIO = 0.2;
const SHEET_CLOSE_VELOCITY = 0.5; // px/ms（フリック判定用のしきい値）

function attachSheetDragHandlers(ov, sheet){
  const dragHandle = sheet.querySelector(".bottom-sheet-drag-handle");
  if(!dragHandle) return;

  let dragging = false;
  let startY = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;
  let sheetHeight = 0;

  function onTouchStart(e){
    if(e.touches.length !== 1) return;
    dragging = true;
    startY = lastY = e.touches[0].clientY;
    lastT = e.timeStamp;
    velocity = 0;
    sheetHeight = sheet.getBoundingClientRect().height;
    sheet.style.transition = "none";
  }

  function onTouchMove(e){
    if(!dragging) return;
    const y = e.touches[0].clientY;
    const dt = e.timeStamp - lastT || 1;
    velocity = (y - lastY) / dt;
    lastY = y;
    lastT = e.timeStamp;
    const dy = Math.max(0, y - startY);
    sheet.style.transform = `translateY(${dy}px)`;
    e.preventDefault();
  }

  function onTouchEnd(){
    if(!dragging) return;
    dragging = false;
    const dy = Math.max(0, lastY - startY);
    sheet.style.transition = "";
    sheet.style.transform = "";
    if(dy > sheetHeight * SHEET_CLOSE_DISTANCE_RATIO || velocity > SHEET_CLOSE_VELOCITY){
      closeSheet(ov);
    }
  }

  dragHandle.addEventListener("touchstart", onTouchStart, { passive: true });
  dragHandle.addEventListener("touchmove", onTouchMove, { passive: false });
  dragHandle.addEventListener("touchend", onTouchEnd, { passive: true });
  dragHandle.addEventListener("touchcancel", onTouchEnd, { passive: true });
}

function closeSheet(ov){
  ov.classList.remove("sheet-ov-show");
  const sheet = ov.querySelector(".bottom-sheet");
  if(sheet) sheet.classList.remove("bottom-sheet-show");
  setTimeout(() => {
    try{ ov.remove(); }catch(e){}
    unlockBodyScrollForSheet();
  }, 220);
}

function openSheet(title, itemsHTML){
  lockBodyScrollForSheet();
  const ov = document.createElement("div");
  ov.className = "sheet-ov";
  ov.innerHTML = `
    <div class="bottom-sheet">
      <div class="bottom-sheet-drag-handle">
        <div class="bottom-sheet-handle"></div>
        <div class="bottom-sheet-title">${esc(title)}</div>
      </div>
      <div class="bottom-sheet-list">${itemsHTML}</div>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if(e.target === ov) closeSheet(ov); });
  const touchGuard = createSheetTouchGuard(ov);
  ov.addEventListener("touchstart", touchGuard.onTouchStart, { passive: true });
  ov.addEventListener("touchmove", touchGuard.onTouchMove, { passive: false });
  const sheet = ov.querySelector(".bottom-sheet");
  attachSheetDragHandlers(ov, sheet);
  requestAnimationFrame(() => {
    ov.classList.add("sheet-ov-show");
    sheet.classList.add("bottom-sheet-show");
  });
  return ov;
}

/* iPhoneのホーム画面のような、丸型アイコン＋下に中央揃えのラベルで1マスを
   構成するグリッドセル。セル全体（<button>）がタップ領域で、押している間は
   中の.sheet-grid-innerだけを0.97倍に縮めてiOS風の手応えを出す。
   --iは表示時に1つずつ遅らせてフェードインさせるための並び順 */
function sheetGridItemHTML({ icon, label, key, variant }, i){
  return `
    <button type="button" class="sheet-grid-item" data-sheet-item="${esc(key)}" style="--i:${i}">
      <span class="sheet-grid-inner">
        <span class="sheet-grid-icon launcher-icon-${variant}">${icon}</span>
        <span class="sheet-grid-label">${esc(label)}</span>
      </span>
    </button>`;
}

// 5列が基本だが、項目が5個未満のシート（学習＝4項目）で右側だけ空いて
// 偏って見えないよう、項目数が5未満のときは列数をその数に合わせる
function sheetGridHTML(items){
  const cols = Math.min(5, items.length);
  return `<div class="sheet-grid" style="--cols:${cols}">${items.map(sheetGridItemHTML).join("")}</div>`;
}

// タップ時の軽いHaptic Feedback。非対応ブラウザ（iOS Safari等）では
// navigator.vibrateが無いだけで何も起きないため、機能には影響しない
function sheetTapHaptic(){
  try{ navigator.vibrate && navigator.vibrate(10); }catch(e){}
}

const LIGHTPUZZLE_LAUNCHER_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="6" height="6" rx="1.2"></rect><rect x="14.5" y="3.5" width="6" height="6" rx="1.2"></rect><rect x="3.5" y="14.5" width="6" height="6" rx="1.2"></rect><rect x="14.5" y="14.5" width="6" height="6" rx="1.2" fill="currentColor"></rect></svg>`;

// 🃏 チャッピーの価値観ゲーム（ito形式の協力カードゲーム）のランチャーアイコン。
// 重ねた2枚のカードを線画で表した、このアプリのオリジナル図案
const VALUEGAME_LAUNCHER_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6.5" width="10" height="14" rx="2.2" transform="rotate(-9 8 13.5)"></rect><rect x="11" y="3.5" width="10" height="14" rx="2.2" transform="rotate(9 16 10.5)"></rect><circle cx="16" cy="10.5" r="1.6" fill="currentColor" stroke="none"></circle></svg>`;

const QUICK_MENU_ITEMS = [
  { key: "news-japan", icon: `<span class="launcher-emoji" aria-hidden="true">🇯🇵</span>`, label: "J-NEWS", variant: "news-jp" },
  { key: "news-world", icon: `<span class="launcher-emoji" aria-hidden="true">🌐</span>`, label: "F-NEWS", variant: "news-world" },
  { key: "portfolio", icon: STOCK_LAUNCHER_ICON_SVG, label: "株価", variant: "stock" },
  { key: "calendar", icon: CALENDAR_APP_LAUNCHER_ICON_SVG, label: "カレンダー", variant: "calendar" },
  { key: "introquiz", icon: INTROQUIZ_LAUNCHER_ICON_SVG, label: "イントロドン", variant: "introquiz" },
  { key: "lightpuzzle", icon: LIGHTPUZZLE_LAUNCHER_ICON_SVG, label: "ライト消しパズル", variant: "lightpuzzle" },
  { key: "valuegame", icon: VALUEGAME_LAUNCHER_ICON_SVG, label: "カードゲーム", variant: "valuegame" },
  { key: "chappy", icon: `<span class="launcher-emoji" aria-hidden="true">🏠</span>`, label: "チャッピーハウス", variant: "chappy" },
  { key: "settings", icon: SETTINGS_GEAR_ICON_SVG, label: "設定", variant: "settings" },
  { key: "rules", icon: RULES_LIST_ICON_SVG, label: "ルール", variant: "rules" },
];

export function openQuickMenuSheet(){
  const ov = openSheet("各種機能", sheetGridHTML(QUICK_MENU_ITEMS));
  ov.querySelectorAll("[data-sheet-item]").forEach(b => b.onclick = () => {
    const key = b.dataset.sheetItem;
    sheetTapHaptic();
    closeSheet(ov);
    if(key === "settings") openSettingsModal();
    else if(key === "rules") openRulesModal();
    else go(key);
  });
}

const STUDY_MENU_ITEMS = [
  { key: "certs", icon: MS_LOGO_ICON_HTML, label: "Microsoft", variant: "ms" },
  { key: "lpic-certs", icon: LPIC_LOGO_ICON_HTML, label: "Linux(LPIC)", variant: "lpic" },
  { key: "playground", icon: PLAYGROUND_LAUNCHER_ICON_SVG, label: "Linuxプレイグラウンド", variant: "playground" },
  { key: "scenario", icon: SCENARIO_LAUNCHER_ICON_HTML, label: "シナリオモード", variant: "scenario" },
];

export function openStudyMenuSheet(){
  const ov = openSheet("学習", sheetGridHTML(STUDY_MENU_ITEMS));
  ov.querySelectorAll("[data-sheet-item]").forEach(b => b.onclick = () => {
    const key = b.dataset.sheetItem;
    sheetTapHaptic();
    closeSheet(ov);
    go(key);
  });
}

/* ===== 🧠 AIおすすめ復習ボトムシート =====
   ホームのコンパクトカードの「おすすめ復習を見る」から開く。
   AIコメント・フィルター（星の数）・並び替え・コマンド一覧（推奨度・理由・
   「このコマンドだけ復習する」）をすべてこのシート内に表示する。
   既存の.sheet-ov/.bottom-sheet基盤（下スワイプで閉じる・背景暗転）を
   使いつつ、上へドラッグするとシートが広がる（airec-sheet-tall） */
const AIREC_FILTERS = [
  { key:"all", label:"すべて" },
  { key:"5",   label:"★★★★★" },
  { key:"4",   label:"★★★★" },
  { key:"3",   label:"★★★" },
];
const AIREC_SORTS = [
  { key:"score",  label:"優先度順" },
  { key:"forget", label:"最近忘れそう順" },
  { key:"acc",    label:"正答率順" },
];

function airecCardHTML(r){
  return `
    <button class="airec-card" data-airec="${esc(r.cmd)}">
      <div class="airec-card-head">
        <span class="airec-stars">${"★".repeat(r.starsN)}</span>
        <span class="airec-cmd">${esc(r.label)}</span>
        <span class="airec-score">復習推奨度：<em>${r.score}%</em></span>
      </div>
      <div class="airec-reasons">
        <span class="airec-reasons-lab">理由</span>
        ${r.reasons.map(t=>`<span class="airec-reason">・${esc(t)}</span>`).join("")}
      </div>
      <span class="airec-go">このコマンドだけ復習する ›</span>
    </button>`;
}

// 通常のattachSheetDragHandlers（下スワイプで閉じるだけ）に加えて、
// 上方向へのドラッグ（またはフリック）でシートを拡大表示に切り替える。
// 上方向は軽い抵抗をつけて指に少しだけ追従させ、iOSのシート操作感に寄せる
function attachAirecSheetDragHandlers(ov, sheet){
  const dragHandle = sheet.querySelector(".bottom-sheet-drag-handle");
  if(!dragHandle) return;

  let dragging = false;
  let startY = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;
  let sheetHeight = 0;

  function onTouchStart(e){
    if(e.touches.length !== 1) return;
    dragging = true;
    startY = lastY = e.touches[0].clientY;
    lastT = e.timeStamp;
    velocity = 0;
    sheetHeight = sheet.getBoundingClientRect().height;
    sheet.style.transition = "none";
  }

  function onTouchMove(e){
    if(!dragging) return;
    const y = e.touches[0].clientY;
    const dt = e.timeStamp - lastT || 1;
    velocity = (y - lastY) / dt;
    lastY = y;
    lastT = e.timeStamp;
    const dy = y - startY;
    // 下方向は指にそのまま追従、上方向は1/3の抵抗つき（最大-48px）
    sheet.style.transform = `translateY(${dy >= 0 ? dy : Math.max(dy/3, -48)}px)`;
    e.preventDefault();
  }

  function onTouchEnd(){
    if(!dragging) return;
    dragging = false;
    const dy = lastY - startY;
    sheet.style.transition = "";
    sheet.style.transform = "";
    if(dy > sheetHeight * SHEET_CLOSE_DISTANCE_RATIO || velocity > SHEET_CLOSE_VELOCITY){
      closeSheet(ov);                                   // 下へスワイプ → 閉じる
    }else if(dy < -30 || velocity < -SHEET_CLOSE_VELOCITY){
      sheet.classList.add("airec-sheet-tall");          // 上へドラッグ → 広げる
    }
  }

  dragHandle.addEventListener("touchstart", onTouchStart, { passive: true });
  dragHandle.addEventListener("touchmove", onTouchMove, { passive: false });
  dragHandle.addEventListener("touchend", onTouchEnd, { passive: true });
  dragHandle.addEventListener("touchcancel", onTouchEnd, { passive: true });
}

export function openAiReviewSheet(){
  aiDailyUpdateCheck(S.cert);
  const recs = getAiRecommendations(S.cert);
  let filter = "all";     // すべて / 星5 / 星4 / 星3
  let sortKey = "score";  // score:優先度順 / forget:最近忘れそう順 / acc:正答率順

  lockBodyScrollForSheet();
  const ov = document.createElement("div");
  ov.className = "sheet-ov";
  ov.innerHTML = `
    <div class="bottom-sheet airec-sheet">
      <div class="bottom-sheet-drag-handle">
        <div class="bottom-sheet-handle"></div>
        <div class="bottom-sheet-title">🧠 AIおすすめ復習</div>
      </div>
      <div class="airec-sheet-tools">
        <div class="airec-sheet-comment">${esc(aiOverallComment(recs))}</div>
        <div class="airec-chip-row">
          ${AIREC_FILTERS.map(f=>`<button class="airec-chip${f.key==="all"?" on":""}" data-airec-filter="${f.key}">${f.label}</button>`).join("")}
        </div>
        <div class="airec-chip-row airec-chip-row--sort">
          ${AIREC_SORTS.map(s=>`<button class="airec-chip airec-chip--sort${s.key==="score"?" on":""}" data-airec-sort="${s.key}">${s.label}</button>`).join("")}
        </div>
      </div>
      <div class="bottom-sheet-list airec-sheet-list"></div>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if(e.target === ov) closeSheet(ov); });
  const touchGuard = createSheetTouchGuard(ov);
  ov.addEventListener("touchstart", touchGuard.onTouchStart, { passive: true });
  ov.addEventListener("touchmove", touchGuard.onTouchMove, { passive: false });
  const sheet = ov.querySelector(".bottom-sheet");
  attachAirecSheetDragHandlers(ov, sheet);

  const listEl = ov.querySelector(".airec-sheet-list");
  function renderList(){
    let rows = recs.slice();
    if(filter !== "all") rows = rows.filter(r=>r.starsN === +filter);
    if(sortKey === "forget")   rows.sort((a,b)=>a.retention-b.retention || b.score-a.score);
    else if(sortKey === "acc") rows.sort((a,b)=>a.accPct-b.accPct || b.score-a.score);
    else                       rows.sort((a,b)=>b.score-a.score);
    listEl.innerHTML = rows.length
      ? rows.map(airecCardHTML).join("")
      : `<div class="airec-empty">${recs.length ? "この条件に当てはまるコマンドはありません。" : "まだ学習データがありません。演習モードでコマンド問題を解くと、ここにAIの復習提案が表示されます。"}</div>`;
    listEl.querySelectorAll("[data-airec]").forEach(b=>b.onclick=()=>{
      closeSheet(ov);
      startCommandPractice(b.dataset.airec);
    });
    listEl.scrollTop = 0;
  }
  ov.querySelectorAll("[data-airec-filter]").forEach(b=>b.onclick=()=>{
    filter = b.dataset.airecFilter;
    ov.querySelectorAll("[data-airec-filter]").forEach(x=>x.classList.toggle("on", x===b));
    renderList();
  });
  ov.querySelectorAll("[data-airec-sort]").forEach(b=>b.onclick=()=>{
    sortKey = b.dataset.airecSort;
    ov.querySelectorAll("[data-airec-sort]").forEach(x=>x.classList.toggle("on", x===b));
    renderList();
  });
  renderList();

  requestAnimationFrame(() => {
    ov.classList.add("sheet-ov-show");
    sheet.classList.add("bottom-sheet-show");
  });
}

/* お天気カードと統合起動カードの間に置く、1ヶ月表示のカレンダーカード。
   タイトル文言は持たず、カレンダーUIそのものだけを表示する。
   ・上段：表示するカレンダー（自分／共有相手のカレンダーなど）をワンタップ
     で切り替えるスイッチャー。各カレンダーの横に共有ユーザー設定ボタンを
     配置し、＋ボタンでカレンダーを追加できる
   ・下段：月表示グリッド。日付セルをタップすると、その日の予定を確認・
     追加・削除できるポップアップを開く
   データはこの端末のlocalStorageに保存する簡易実装（他ユーザーへの実際の
   共有・同期は行わない） */
const GCAL_STORE_KEY = "gcal_store_v1";
const GCAL_COLORS = ["#0284c7","#16a34a","#d97706","#dc2626","#7c3aed","#0d9488","#db2777","#65a30d"];

// カレンダー機能が使うlocalStorageキーは、すべて「現在アプリにログイン
// しているユーザー」ごとに独立させる。ベースキーにログイン中のFirebase
// UID（未ログイン＝ゲスト利用中は"guest"固定）を連結することで、同じ
// 端末・同じブラウザを複数人が使い回しても、他人が連携したGoogleカレン
// ダーのトークンやデモ用データが絶対に見えないようにする
function gcalStorageKey(base){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `${base}::${uid}`;
}

// ログイン中のユーザーが切り替わった（ログイン／ログアウト／別アカウント
// への切替）ことを検知し、前のユーザーのGoogle連携状態（アクセストークン・
// カレンダー一覧・イベントキャッシュ）をメモリ上から完全に破棄する。
// render()の先頭から毎回呼ばれる軽量なチェックで、localStorageのキー
// 空間の切替と、メモリ上キャッシュの破棄を必ずセットで行う
let gcalIdentityToken;
function gcalHandleIdentityChange(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  if(gcalIdentityToken === uid) return;
  const isFirstRun = gcalIdentityToken === undefined;
  gcalIdentityToken = uid;
  if(isFirstRun) return; // 初回描画は「切替」ではないので何もしない
  gcalGoogleAccessToken = null;
  gcalGoogleCalendars = null;
  gcalGoogleEventsCache = {};
  gcalGoogleDayEventsCache = {};
  gcalGoogleError = null;
  gcalGoogleConnecting = false;
  gcalGoogleAutoTried = false;
}

// カレンダー機能のうち「デモカレンダーの予定」「ToDo」「登録者名」の3つを
// Firestoreの users/{uid}.gcal へ同期し、別端末でも引き継げるようにする。
// GoogleのOAuthアクセストークンと選択中カレンダーIDは、各端末でのGoogle
// 連携そのものに紐づく情報のため、あえて同期対象に含めずローカル限定
// のままにする（同期しても他端末では改めて連携が必要になり、トークンの
// ようなセンシティブな情報をクラウドへ置くリスクだけが増えるため）
function syncGcalToCloud(){
  if(!state.db || !state.currentUserId || !window.FirebaseSync) return;
  try{
    window.FirebaseSync.setDoc(window.FirebaseSync.doc(state.db, "users", state.currentUserId), {
      gcal: {
        store: loadGcalStore(),
        todos: loadGcalTodoStore(),
        authorName: gcalLoadAuthorName(),
        calNameOverrides: gcalLoadCalNameOverrides()
      },
      updatedAt: new Date().toISOString()
    }, { merge: true });
  }catch(e){ console.error("gcal cloud sync failed:", e); }
}

// クラウド（Firestoreの users/{uid}.gcal）から届いたデータをこの端末の
// localStorageへ反映する。db.jsのonSnapshotから呼ばれる。ここではsave〇〇()
// ではなく直接localStorageへ書き込む（save〇〇()はsyncGcalToCloud()を
// 呼び出すため、そちらを使うと反映のたびにクラウドへ書き戻してしまい、
// onSnapshotとの間で無限ループになってしまう）
export function applyCloudGcal(gcal){
  if(!gcal || typeof gcal !== "object") return;
  let changed = false;
  if(gcal.store && typeof gcal.store === "object" && !Array.isArray(gcal.store) && Array.isArray(gcal.store.calendars) && gcal.store.calendars.length){
    try{ localStorage.setItem(gcalStorageKey(GCAL_STORE_KEY), JSON.stringify(gcal.store)); changed = true; }catch(e){}
  }
  if(gcal.todos && typeof gcal.todos === "object" && !Array.isArray(gcal.todos)){
    try{ localStorage.setItem(gcalStorageKey(GCAL_TODO_STORE_KEY), JSON.stringify(gcal.todos)); changed = true; }catch(e){}
  }
  if(typeof gcal.authorName === "string" && gcal.authorName.trim()){
    try{ localStorage.setItem(gcalStorageKey(GCAL_AUTHOR_NAME_KEY), gcal.authorName.trim()); changed = true; }catch(e){}
  }
  if(gcal.calNameOverrides && typeof gcal.calNameOverrides === "object" && !Array.isArray(gcal.calNameOverrides)){
    try{
      localStorage.setItem(gcalStorageKey(GCAL_CAL_NAME_OVERRIDE_KEY), JSON.stringify(gcal.calNameOverrides));
      changed = true;
      // 取得済みのGoogleカレンダー一覧が既にメモリ上にあるなら、再取得を
      // 待たずに表示名だけその場で反映する
      if(gcalGoogleCalendars) gcalGoogleCalendars.forEach(c => { if(gcal.calNameOverrides[c.id]){ c.name = gcal.calNameOverrides[c.id]; c.renamed = true; } });
    }catch(e){}
  }
  if(changed) renderGcalActiveView();
}

export function loadGcalStore(){
  let store = null;
  try{ store = JSON.parse(localStorage.getItem(gcalStorageKey(GCAL_STORE_KEY)) || "null"); }catch(e){}
  if(!store || !Array.isArray(store.calendars) || !store.calendars.length){
    store = {
      calendars: [{ id: "self", name: "自分のカレンダー", color: GCAL_COLORS[0], shared: [] }],
      activeId: "self",
      events: {},
    };
  }
  if(!store.events) store.events = {};
  store.calendars.forEach(c => { if(!Array.isArray(c.shared)) c.shared = []; });
  if(!store.activeId || !store.calendars.some(c => c.id === store.activeId)){
    store.activeId = store.calendars[0].id;
  }
  return store;
}

function saveGcalStore(store){
  try{ localStorage.setItem(gcalStorageKey(GCAL_STORE_KEY), JSON.stringify(store)); }catch(e){}
  syncGcalToCloud();
}

function gcalGenId(prefix){
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// 表示中の年月。renderSelect()によるホーム画面全体の再描画をまたいでも
// 見ていた月を保持するため、モジュール変数として保持する（初回のみ今月）
let gcalViewY = null, gcalViewM = null;

// 「カレンダー」画面の月グリッドでタップして選んでいる日（グリッド真下の
// 予定一覧エリアに表示する対象日）。初回は今日を初期値にする
let gcalSelectedDay = null;
let gcalSelDayBusy = false;
let gcalSelDayError = null;

/* ---- 予定の「登録者名」（このカレンダー機能専用のプロフィール名） ----
   アプリのログインアカウントのユーザー名（getProfileName()）とは完全に
   別物として、カレンダー機能に初めて触れた時に一度だけ設定してもらい、
   以後は予定の登録者表示に使う。localStorageで独立管理する */
const GCAL_AUTHOR_NAME_KEY = "gcal_author_name";

export function gcalLoadAuthorName(){
  try{ return (localStorage.getItem(gcalStorageKey(GCAL_AUTHOR_NAME_KEY)) || "").trim(); }catch(e){ return ""; }
}

function gcalSaveAuthorName(name){
  try{ localStorage.setItem(gcalStorageKey(GCAL_AUTHOR_NAME_KEY), (name||"").trim()); }catch(e){}
  syncGcalToCloud();
  gcalPublishOwnName();
}

// 「今アプリを使っている本人」が登録した表示名（カレンダー専用の登録者名、
// 無ければアプリのユーザー名）を、Google連携メールアドレスをキーにした公開
// ディレクトリへ発行する。共有カレンダーの相手側が、自分の予定一覧の見出し
// にGmailアドレスではなくこの登録名を表示できるようにするため。Google連携
// 済みで名前が決まっているときだけ発行し、ローカル（デモ）モードや連携前は
// 発行しようがないため何もしない
function gcalPublishOwnName(){
  const email = gcalOwnGoogleEmail();
  const name = gcalLoadAuthorName() || getProfileName();
  if(email && name && window.GcalNames) window.GcalNames.publish(email, name).catch(() => {});
}

// 登録者名が未設定なら設定用モーダルを開いてから、設定済みならすぐに
// callback(name)を呼ぶ。予定を追加・閲覧する画面を開く直前に必ず通す
// ことで「カレンダーに最初に触れた時に名前を決める」動線にしている
function gcalEnsureAuthorName(cb){
  const name = gcalLoadAuthorName();
  if(name){ cb(name); return; }
  openGcalAuthorNameModal(cb);
}

function openGcalAuthorNameModal(onSaved, opts){
  const ov = document.createElement("div");
  ov.className = "modal-ov";
  const current = gcalLoadAuthorName();
  // 未保存（初回）の場合は「アプリに登録したユーザー名」をそのままの
  // デフォルト値として入力欄に表示する（見出しタップでの編集時も同様）
  const prefill = current || getProfileName() || "";
  const allowCancel = opts && typeof opts.allowCancel === "boolean" ? opts.allowCancel : !!current;
  ov.innerHTML = `
    <div class="modal">
      <div class="modal-title" style="color:var(--text)">✏️ カレンダーで使う名前</div>
      <div class="gcal-modal-sub">予定の登録者として表示される名前です。アプリのログイン名とは別に、カレンダー専用の名前として保存されます。</div>
      <input type="text" class="gcal-ev-input gcal-newcal-input" id="gcal-author-input" placeholder="例：山田太郎" maxlength="20" value="${esc(prefill)}">
      <button class="cta" id="gcal-author-save">保存する</button>
      ${allowCancel ? `<button class="ghost" id="gcal-author-cancel" style="margin-top:8px">キャンセル</button>` : ""}
    </div>`;
  document.body.appendChild(ov);
  const close = () => { try{ ov.remove(); }catch(e){} };
  if(allowCancel) ov.addEventListener("click", (e) => { if(e.target === ov) close(); });
  const cancelBtn = ov.querySelector("#gcal-author-cancel");
  if(cancelBtn) cancelBtn.onclick = close;
  const input = ov.querySelector("#gcal-author-input");
  const submit = () => {
    const name = (input.value||"").trim();
    if(!name){ input.focus(); return; }
    gcalSaveAuthorName(name);
    close();
    if(onSaved) onSaved(name);
  };
  ov.querySelector("#gcal-author-save").onclick = submit;
  input.onkeydown = (e) => { if(e.key === "Enter") submit(); };
  input.focus();
}

/* ---- Googleカレンダーの表示名の上書き ----
   Google側のカレンダー名（プライマリカレンダーならGmailアドレスがそのまま
   表示される）を、この端末（ログイン中ユーザー）専用の好きな表示名に
   置き換えるための上書き設定。Google側の実際のカレンダー名は変更しない、
   あくまでこのアプリ内の表示だけを差し替える簡易実装 */
const GCAL_CAL_NAME_OVERRIDE_KEY = "gcal_cal_name_override_v1"; // { [calId]: customName }

export function gcalLoadCalNameOverrides(){
  try{
    const data = JSON.parse(localStorage.getItem(gcalStorageKey(GCAL_CAL_NAME_OVERRIDE_KEY)) || "{}");
    return (data && typeof data === "object" && !Array.isArray(data)) ? data : {};
  }catch(e){ return {}; }
}

function gcalSaveCalNameOverride(calId, name){
  const overrides = gcalLoadCalNameOverrides();
  const trimmed = (name||"").trim();
  if(trimmed) overrides[calId] = trimmed; else delete overrides[calId];
  try{ localStorage.setItem(gcalStorageKey(GCAL_CAL_NAME_OVERRIDE_KEY), JSON.stringify(overrides)); }catch(e){}
  syncGcalToCloud();
}

/* ---- 本日のタスク（ToDo）。Googleカレンダー連携の有無に関わらず、常に
   この端末のlocalStorageで日付ごとに独立管理する簡易ToDoリスト ---- */
const GCAL_TODO_STORE_KEY = "gcal_todo_store_v1"; // { dateKey: [{id,text,done}] }

export function loadGcalTodoStore(){
  try{ return JSON.parse(localStorage.getItem(gcalStorageKey(GCAL_TODO_STORE_KEY)) || "{}"); }catch(e){ return {}; }
}

function saveGcalTodoStore(store){
  try{ localStorage.setItem(gcalStorageKey(GCAL_TODO_STORE_KEY), JSON.stringify(store)); }catch(e){}
  syncGcalToCloud();
}

// ホーム画面：本日（表示中の1日）だけのコンパクトな確認用ウィジェット
function gcalDayWidgetHTML(){
  return `<div class="gcal-card" id="gcal-day-card"></div>`;
}

// 「カレンダー」画面：連携設定・カレンダー切替・1ヶ月フル表示をまとめて行う
function gcalMonthCardHTML(){
  return `<div class="gcal-card" id="gcal-month-card"></div>`;
}

// Google連携済み・未連携どちらの状態変化でも、現在画面に出ている方（日
// ウィジェット／月カード）だけを再描画する共通ディスパッチャ。ホーム画面
// とカレンダー画面のどちらから呼ばれたかをGoogle連携系の関数側が意識
// しなくて済むようにするための薄いラッパー
function renderGcalActiveView(){
  if(document.getElementById("gcal-day-card")) renderGcalDailyWidget();
  if(document.getElementById("gcal-month-card")) renderGcalMonthCard();
  // Gemini経由の予定登録・変更・削除はGoogle Calendar APIを直接叩くため、
  // 新しい予定機能（js/schedule/）側のローカルデータにはまだ反映されていない。
  // Googleと同期し直したうえで、表示中のホーム／カレンダーを描き直す
  refreshScheduleViews();
  scheduleSyncAfterExternalChange();
}

// Gemini等がGoogleカレンダーを直接書き換えた直後に呼ぶ、遅延つきの同期。
// 連続した操作で何度もAPIを叩かないよう、最後の呼び出しから少し待つ
let scheduleExternalSyncTimer = null;
function scheduleSyncAfterExternalChange(){
  clearTimeout(scheduleExternalSyncTimer);
  scheduleExternalSyncTimer = setTimeout(() => {
    scheduleSyncNow({ quiet: true }).then(refreshScheduleViews);
  }, 1500);
}

/* ================= Google カレンダー本体との連携 =================
   Googleの「認可コードフロー」（Authorization Code Flow）でrefresh_token
   を取得し、Firestore（google_tokensコレクション、Firebase UIDをドキュ
   メントIDとする）にサーバー側（Vercel Serverless Functions + Firebase
   Admin SDK）だけが読み書きできる形で保存する。ブラウザ側はrefresh_token
   に一切触れず、Firebase Authのログイン状態（IDトークン）を鍵にして
   /api/google/* エンドポイントへ問い合わせるだけで完結させる：
   　1) 連携時（gcalConnectGoogle）: /api/google/authorize がGoogleの同意
   　   画面URLを発行 → ブラウザがそこへ遷移 → 同意後 /api/google/callback
   　   が受け取ったcodeをrefresh_tokenと交換し、Firestoreに保存してアプリ
   　   へ戻す
   　2) 通常利用時（gcalBackendTokenRefresh）: /api/google/token にFirebase
   　   のIDトークンを送るだけで、保存済みrefresh_tokenから新しいアクセス
   　   トークン（有効期限1時間）を発行してもらえる。API呼び出し直前
   　   （gcalEnsureFreshGoogleToken）と、開いている間の1分おきのバック
   　   グラウンドタイマー（gcalStartGoogleAutoRefreshTimer）の両方から
   　   使うことで、一度連携すればブラウザ・端末を変えてもGoogleの同意
   　   画面を再度出さずに使い続けられる
   　3) 連携解除（gcalDisconnectGoogle）: /api/google/disconnect がGoogle
   　   側のトークンを失効させ、Firestoreの保存分も削除する
   取得したアクセストークン自体はこれまで通りCalendar REST APIへブラウザ
   から直接fetchする（Calendar APIはCORSに対応しているため）。ゲスト利用
   （Firebaseログインなし）では紐づけるUIDが無いため、Google連携は
   ログイン中のみ利用可能とする。未連携時は既存のローカル保存
   （localStorage）のデモ用カレンダーにフォールバックする */
const GCAL_GOOGLE_TOKEN_KEY = "gcal_google_token_v1";
const GCAL_GOOGLE_ACTIVE_KEY = "gcal_google_active_id";
// アクセストークンの有効期限のこのぶん手前から「期限切れ間近」とみなし、
// 使う前にバックエンド経由のリフレッシュへ回す（期限ぎりぎりでAPIが401を返すのを防ぐ）
const GCAL_GOOGLE_EXPIRY_BUFFER_MS = 5 * 60 * 1000;
// バックグラウンドで有効期限をチェックする間隔（この間隔ごとに、期限切れ
// 間近なら気付かれないうちに自動リフレッシュする）
const GCAL_GOOGLE_REFRESH_CHECK_INTERVAL_MS = 60 * 1000;

let gcalGoogleAccessToken = null;
let gcalGoogleConnecting = false;
let gcalGoogleAutoTried = false;
let gcalGoogleError = null;
let gcalGoogleCalendars = null;       // [{id,name,color,primary}] / 未取得ならnull
let gcalGoogleEventsCache = {};       // "<calId>|<y>-<m>" -> { dateKey: [{id,title,start,end,author}] }（カレンダー画面の月表示用）
let gcalGoogleDayEventsCache = {};    // "<calId>|day|<dateKey>" -> { dateKey: [{id,title,start,end,author}] }（ホームの日表示用）
let gcalGoogleSilentRefreshPromise = null; // バックエンド経由リフレッシュの多重実行を防ぐための進行中Promise
let gcalGoogleAutoRefreshTimerStarted = false;

// 「変更を反映」ボタン（手動リロード）の進行中フラグ。trueの間はボタンを
// 無効化しつつ回転アイコンでローディング状態を示す。ホーム画面の日
// ウィジェットとカレンダー画面の月カードはそれぞれ別画面なので別々に持つ
let gcalDayReloading = false;
let gcalMonthReloading = false;

// Googleの同意画面から /api/google/callback を経て戻ってきた直後の後処理。
// URLの ?gcal=connected|error を読み取ってすぐにURLから消し（リロード時の
// 誤動作・履歴汚染を防ぐ）、失敗時のみメッセージを用意する。成功時は何も
// しなくてよく、この直後に呼ばれる gcalMaybeAutoReconnect() がバックエンド
// 経由で新しいアクセストークンを自動的に取得しにいく
(function gcalConsumeOAuthRedirectParam(){
  try{
    const url = new URL(window.location.href);
    if(!url.searchParams.has("gcal")) return;
    const status = url.searchParams.get("gcal");
    url.searchParams.delete("gcal");
    const qs = url.searchParams.toString();
    history.replaceState(null, "", url.pathname + (qs ? `?${qs}` : "") + url.hash);
    if(status === "error") gcalGoogleError = "Google連携に失敗しました。もう一度お試しください。";
  }catch(e){}
})();

/* ---- アクセストークンの一時キャッシュ ----
   refresh_tokenはサーバー側にしかないが、発行済みのアクセストークン
   （最長1時間）自体は通信を減らすためlocalStorageへ短期キャッシュする。
   期限切れ・未キャッシュのときだけ /api/google/token を叩く */
function gcalSaveGoogleToken(accessToken, expiresInSec){
  const expiresAt = Date.now() + (Number(expiresInSec || 0) * 1000);
  try{ localStorage.setItem(gcalStorageKey(GCAL_GOOGLE_TOKEN_KEY), JSON.stringify({ access_token: accessToken, expires_at: expiresAt })); }catch(e){}
}

function gcalLoadGoogleToken(){
  try{
    const data = JSON.parse(localStorage.getItem(gcalStorageKey(GCAL_GOOGLE_TOKEN_KEY)) || "null");
    if(!data || !data.access_token || !data.expires_at) return null;
    return data;
  }catch(e){ return null; }
}

function gcalClearGoogleToken(){
  try{ localStorage.removeItem(gcalStorageKey(GCAL_GOOGLE_TOKEN_KEY)); }catch(e){}
}

// ページ読み込み時に一度だけ実行する自動ログイン復元。ホーム画面の週
// ウィジェット／カレンダー画面の月カード、どちらが先にマウントされても
// 一度しか実行されないよう gcalGoogleAutoTried で guard する
function gcalMaybeAutoReconnect(){
  gcalStartGoogleAutoRefreshTimer();
  if(gcalGoogleAccessToken || gcalGoogleConnecting || gcalGoogleAutoTried) return;
  // Firebaseのログイン状態（state.currentUser）はonAuthStateChangedの解決を
  // 待つ非同期処理のため、まだ確定していない間はここで確定を待つ（一度きり
  // のgcalGoogleAutoTriedを消費しない）。authReadyが立った直後にdb.js側の
  // onAuthStateChangedがrender()を呼び直すため、この関数も再度呼ばれる
  if(!state.authReady) return;
  gcalGoogleAutoTried = true;
  if(state.guestMode || !state.currentUser) return; // ゲスト利用中はGoogle連携なし
  const token = gcalLoadGoogleToken();
  if(token && token.expires_at - Date.now() > GCAL_GOOGLE_EXPIRY_BUFFER_MS){
    // まだ有効期限内：通信なしで即座にログイン状態を復元する。
    // カレンダー一覧の取得は、この直後に呼び出し元（週ウィジェット／月
    // カード）がgcalGoogleCalendars===nullを検知して自動的に行う
    gcalGoogleAccessToken = token.access_token;
    return;
  }
  // キャッシュが無い・期限切れ：バックエンド経由でrefresh_tokenからアクセス
  // トークンを取り直す（このアカウントで一度もGoogle連携していなければ
  // 404が返るだけで、静かに何もしない）
  gcalBackendTokenRefresh();
}

// カレンダー画面／ホームウィジェットが開いている間、有効期限が切れる前に
// バックグラウンドで自動的にアクセストークンをリフレッシュし続けるための
// タイマー。ページ内で一度だけ起動する
function gcalStartGoogleAutoRefreshTimer(){
  if(gcalGoogleAutoRefreshTimerStarted) return;
  gcalGoogleAutoRefreshTimerStarted = true;
  setInterval(() => {
    if(!gcalGoogleAccessToken) return;
    const token = gcalLoadGoogleToken();
    if(!token) return;
    if(token.expires_at - Date.now() <= GCAL_GOOGLE_EXPIRY_BUFFER_MS){
      gcalBackendTokenRefresh();
    }
  }, GCAL_GOOGLE_REFRESH_CHECK_INTERVAL_MS);
}

// /api/google/token にFirebaseのIDトークンを送り、保存済みrefresh_token
// から新しいアクセストークンを発行してもらう。同時に複数箇所（起動時の
// 自動復元、定期タイマー、401からの自動復旧、API呼び出し直前のチェック）
// から呼ばれ得るため、進行中のリフレッシュがあればそれを使い回して多重
// リクエストを防ぐ
function gcalBackendTokenRefresh(){
  if(gcalGoogleSilentRefreshPromise) return gcalGoogleSilentRefreshPromise;
  gcalGoogleSilentRefreshPromise = (async () => {
    if(state.guestMode || !state.currentUser) return false;
    try{
      const idToken = await state.currentUser.getIdToken();
      const res = await fetch("/api/google/token", { headers: { Authorization: `Bearer ${idToken}` } });
      if(res.status === 404) return false; // このアカウントではまだ連携していない
      if(res.status === 401){
        // 保存済みのrefresh_token自体が失効・取り消し済み → 再連携が必要
        gcalGoogleAccessToken = null;
        gcalClearGoogleToken();
        gcalGoogleError = "Google連携の有効期限が切れました。もう一度連携してください。";
        renderGcalActiveView();
        return false;
      }
      if(!res.ok) throw new Error(`gcal-token-http-${res.status}`);
      const data = await res.json();
      gcalGoogleAccessToken = data.access_token;
      gcalGoogleError = null;
      gcalSaveGoogleToken(data.access_token, data.expires_in);
      if(gcalGoogleCalendars){
        // 既にカレンダー一覧を表示中：アクセストークンだけを気付かれない
        // ように差し替える
        renderGcalActiveView();
      } else {
        gcalRefreshGoogleCalendars();
      }
      return true;
    }catch(e){
      if(!gcalGoogleError) gcalGoogleError = "Googleとの接続確認に失敗しました。時間をおいて再度お試しください。";
      renderGcalActiveView();
      return false;
    }
  })();
  gcalGoogleSilentRefreshPromise = gcalGoogleSilentRefreshPromise.finally(() => { gcalGoogleSilentRefreshPromise = null; });
  return gcalGoogleSilentRefreshPromise;
}

// ユーザー操作で明示的に連携する（「連携」ボタン）唯一の入口。
// /api/google/authorize からGoogleの同意画面URLを受け取り、そこへ遷移する
// （同意後は/api/google/callbackがcodeをrefresh_tokenと交換してアプリへ
// リダイレクトで戻す）
async function gcalConnectGoogle(){
  if(state.guestMode || !state.currentUser){
    gcalGoogleError = "Google連携を使うにはログインしてください（ゲスト利用では連携できません）。";
    renderGcalActiveView();
    return;
  }
  gcalGoogleConnecting = true;
  gcalGoogleError = null;
  renderGcalActiveView();
  try{
    const idToken = await state.currentUser.getIdToken();
    const res = await fetch("/api/google/authorize", { headers: { Authorization: `Bearer ${idToken}` } });
    if(!res.ok) throw new Error(`gcal-authorize-http-${res.status}`);
    const data = await res.json();
    if(!data.authUrl) throw new Error("gcal-no-auth-url");
    window.location.href = data.authUrl; // ここでページ遷移するため、この関数は実質ここで終了する
  }catch(e){
    gcalGoogleConnecting = false;
    gcalGoogleError = "Google連携の開始に失敗しました。時間をおいて再度お試しください。";
    renderGcalActiveView();
  }
}

// 連携解除：ローカルの状態は即座に消し、バックエンドへは念のため通知する
// （失敗してもローカルの解除自体は既に完了しているため致命的ではない）
async function gcalDisconnectGoogle(){
  gcalGoogleAccessToken = null;
  gcalGoogleCalendars = null;
  gcalGoogleEventsCache = {};
  gcalGoogleDayEventsCache = {};
  gcalGoogleError = null;
  gcalClearGoogleToken();
  try{ localStorage.removeItem(gcalStorageKey(GCAL_GOOGLE_ACTIVE_KEY)); }catch(e){}
  renderGcalActiveView();
  if(!state.currentUser) return;
  try{
    const idToken = await state.currentUser.getIdToken();
    await fetch("/api/google/disconnect", { method: "POST", headers: { Authorization: `Bearer ${idToken}` } });
  }catch(e){}
}

// 401（認証切れ）を検知したときの共通処理：保存済みトークンを破棄した上で、
// バックエンド経由の自動リフレッシュをバックグラウンドで試みる。それでも
// 復帰できない場合にだけ「連携」ボタンでの再認証が必要になる（ユーザーには
// 一旦エラーメッセージを表示しつつ、裏では自動復旧を試みる「スマートな
// 再認証」の形）
function gcalHandleUnauthorized(){
  gcalGoogleAccessToken = null;
  gcalClearGoogleToken();
  gcalGoogleError = "Googleとの接続が切れました。自動で再接続を試みています…";
  renderGcalActiveView();
  gcalBackendTokenRefresh();
}

// カレンダーAPIを叩く直前に必ず有効期限をチェックし、切れている／切れ
// かけている場合はここで一旦バックグラウンドリフレッシュを待ち合わせて
// から実際のリクエストを送る（期限ぎりぎりで401を受けてから復旧する
// 「事後対応」ではなく、そもそも401を発生させない「予防」を優先する）
async function gcalEnsureFreshGoogleToken(){
  if(!gcalGoogleAccessToken) return;
  const token = gcalLoadGoogleToken();
  if(token && token.expires_at - Date.now() > GCAL_GOOGLE_EXPIRY_BUFFER_MS) return;
  await gcalBackendTokenRefresh();
}

async function gcalGoogleApiFetch(path, options){
  await gcalEnsureFreshGoogleToken();
  const res = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, Object.assign({}, options, {
    headers: Object.assign({ "Authorization": `Bearer ${gcalGoogleAccessToken}` }, (options && options.headers) || {}),
  }));
  if(res.status === 401){
    gcalHandleUnauthorized();
    throw new Error("gcal-unauthorized");
  }
  if(!res.ok) throw new Error(`gcal-api-error-${res.status}`);
  if(res.status === 204) return null;
  return res.json();
}

/* ---- 予定機能（js/schedule/）へのGoogle Calendar APIの橋渡し ----
   OAuthの同意フロー・アクセストークンの自動更新・カレンダー一覧の取得は
   この既存カレンダー機能がすでに実装しているため、新しい予定／同期機能は
   トークン管理を持たず、このブリッジ経由でAPIを呼ぶだけにする。
   window経由にしているのは、js/db.js の window.FirebaseSync など、この
   アプリで既に使われているモジュール間連携のやり方に合わせるため
   （render.js ⇄ schedule/ の相互import（循環参照）も避けられる） */
if(typeof window !== "undefined"){
  window.GcalGoogleBridge = {
    isConnected: () => !!gcalGoogleAccessToken,
    calendars: () => gcalGoogleCalendars || [],
    ensureCalendars: () => (gcalGoogleCalendars === null ? gcalRefreshGoogleCalendars() : Promise.resolve()),
    apiFetch: (path, options) => gcalGoogleApiFetch(path, options),
    ownEmail: () => gcalOwnGoogleEmail(),
    connect: () => gcalConnectGoogle(),
    disconnect: () => gcalDisconnectGoogle(),
    // 保存済みトークンからの自動復元。以前はホームの日ウィジェット／月カードの
    // 描画時にだけ呼ばれていたが、その2つを新しい画面へ置き換えたため、
    // 新しいホームカード／カレンダー画面の描画時に必ずここを通す
    // （通さないと「連携済みなのに未連携扱い」になってしまう）
    maybeAutoReconnect: () => gcalMaybeAutoReconnect(),
    error: () => gcalGoogleError,
    connecting: () => gcalGoogleConnecting,
  };
  // 「今日の予定」カードからカレンダー画面（日表示）へ移動するための入口
  window.ScheduleNav = { goCalendar: () => go("calendar") };
}

// Googleカレンダーの「日本の祝日」購読カレンダー（ja.japanese#holiday@…）を
// 判定する。このカレンダーはタブ／予定一覧には出さず、祝日判定は
// gcalComputeJapanHolidays()側の計算結果を使う（Google側の購読解除有無に
// 左右されず、ローカル（未連携）モードでも同じ祝日色を出せるようにするため）
function gcalIsJapanHolidayCalendar(c){
  const id = c.id || "";
  const name = c.summaryOverride || c.summary || "";
  return id.endsWith("#holiday@group.v.calendar.google.com") && (id.startsWith("ja.") || name.includes("祝日"));
}

async function gcalRefreshGoogleCalendars(){
  try{
    // minAccessRole="reader"：閲覧のみ許可された共有カレンダー（他アカウントから
    // 共有してもらったサブカレンダーなど）も一覧に含める。以前は"writer"指定で
    // 書き込み権限があるものだけに絞っていたため、閲覧権限のみで共有されたカレン
    // ダーが一覧にすら出ず、予定も取得できていなかった。freeBusyReader（予定の
    // 有無しか分からない権限）はタイトル等を取得できないためこれまで通り除外する
    const data = await gcalGoogleApiFetch("users/me/calendarList?minAccessRole=reader");
    const nameOverrides = gcalLoadCalNameOverrides();
    gcalGoogleCalendars = (data.items || []).filter(c => !gcalIsJapanHolidayCalendar(c)).map((c, i) => ({
      id: c.id,
      name: nameOverrides[c.id] || c.summaryOverride || c.summary || c.id,
      color: c.backgroundColor || GCAL_COLORS[i % GCAL_COLORS.length],
      primary: !!c.primary,
      accessRole: c.accessRole || "reader",
      renamed: !!nameOverrides[c.id],
    }));
    let activeId = null;
    try{ activeId = localStorage.getItem(gcalStorageKey(GCAL_GOOGLE_ACTIVE_KEY)); }catch(e){}
    if(!activeId || !gcalGoogleCalendars.some(c => c.id === activeId)){
      const primary = gcalGoogleCalendars.find(c => c.primary);
      activeId = (primary || gcalGoogleCalendars[0] || {}).id || null;
    }
    if(activeId){ try{ localStorage.setItem(gcalStorageKey(GCAL_GOOGLE_ACTIVE_KEY), activeId); }catch(e){} }
    // カレンダー連携が確認できたタイミングで、既存ユーザーが名前を編集して
    // いなくても自分の登録名を公開ディレクトリへ発行しておく（相手側が
    // 開くたびに毎回発行されるだけで、内容が同じなら実質的に無害な上書き）
    gcalPublishOwnName();
  }catch(e){
    if(!gcalGoogleError) gcalGoogleError = "カレンダー一覧の取得に失敗しました。";
    gcalGoogleCalendars = [];
  }
  renderGcalActiveView();
}

// Google Calendarのイベントタイトルは"(登録者名) 本来のタイトル"という
// 形式で保存する（登録者名はこのアプリ独自の概念で、Calendar APIに専用
// フィールドが無いためタイトルへ埋め込む）。表示のたびにこの形式を
// 分解して登録者名とタイトルを取り出す
function gcalParseAuthorTitle(summary){
  const m = /^\(([^)]{1,20})\)\s*(.*)$/.exec(summary || "");
  if(m) return { author: m[1], title: m[2] || "(タイトルなし)" };
  return { author: "", title: summary || "(タイトルなし)" };
}

function gcalFormatHHMM(date){
  return `${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}`;
}

// Google Calendar APIのevents.listレスポンスを
// dateKey -> [{id,title,start,end,author,calId,calColor,calName,calPrimary}] の
// マップに変換する共通処理（月表示・日表示の両方から使う）。終日予定は
// start/endを空文字にする。calMetaには取得元カレンダー（{id,color,name,primary}）
// を渡し、複数カレンダーの予定をまとめて表示したときにどのカレンダーの予定かを
// 判別できるようにする
function gcalMapGoogleEventItems(items, calMeta){
  const map = {};
  (items || []).forEach(ev => {
    if(ev.status === "cancelled") return;
    const startInfo = ev.start || {};
    const endInfo = ev.end || {};
    const startStr = startInfo.dateTime || startInfo.date || null;
    if(!startStr) return;
    const startDate = new Date(startStr);
    const dk = newsDateKey(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const isTimed = !!startInfo.dateTime;
    const start = isTimed ? gcalFormatHHMM(startDate) : "";
    const end = (isTimed && endInfo.dateTime) ? gcalFormatHHMM(new Date(endInfo.dateTime)) : "";
    const { author, title } = gcalParseAuthorTitle(ev.summary);
    // 「ユーザーごとの分別表示」用：手動入力の登録者名(author)が無い予定でも、
    // Googleカレンダー本来の作成者情報（creator.email/displayName）があれば
    // それを使って作成者を判別できるようにする
    const creatorEmail = ev.creator ? ev.creator.email : undefined;
    const creatorName = ev.creator ? (ev.creator.displayName || ev.creator.email) : undefined;
    if(!map[dk]) map[dk] = [];
    map[dk].push({
      id: ev.id, iCalUID: ev.iCalUID, title, start, end, author, creatorEmail, creatorName,
      calId: calMeta ? calMeta.id : undefined,
      calColor: calMeta ? calMeta.color : undefined,
      calName: calMeta ? calMeta.name : undefined,
      calPrimary: calMeta ? !!calMeta.primary : undefined,
      calRenamed: calMeta ? !!calMeta.renamed : undefined,
    });
  });
  return map;
}

// 同じ予定が複数カレンダーから重複して届いた場合の判定キー。
// カレンダー共有と招待（ゲスト追加）を両方行うと、同一の予定が
// 共有カレンダー側と自分のプライマリカレンダー側の両方から取得され、
// 画面に2件ずつ表示されてしまう。iCalUIDは同一予定なら参加者全員の
// カレンダーで共通なので、これを優先キーにし、無ければidで、
// それも無ければタイトル・開始・終了時刻の組み合わせで判定する
function gcalEventDedupeKey(ev){
  if(ev.iCalUID) return `uid:${ev.iCalUID}`;
  if(ev.id) return `id:${ev.id}`;
  return `t:${ev.title}|${ev.start}|${ev.end}`;
}

function gcalMergeEventMaps(maps){
  const merged = {};
  maps.forEach(m => {
    Object.keys(m).forEach(dk => {
      if(!merged[dk]) merged[dk] = [];
      merged[dk].push(...m[dk]);
    });
  });
  Object.keys(merged).forEach(dk => {
    const seen = new Map();
    merged[dk].forEach(ev => {
      const key = gcalEventDedupeKey(ev);
      const existing = seen.get(key);
      // 同じ予定の重複コピーが複数あるときは、プライマリカレンダー側の
      // コピーを優先して残す（編集権限や表示上の整合性のため）
      if(!existing || (!existing.calPrimary && ev.calPrimary)) seen.set(key, ev);
    });
    merged[dk] = Array.from(seen.values());
  });
  return merged;
}

// 連携中の全カレンダーぶんをまとめて保持しているイベントmapから、指定
// カレンダーID（スイッチャーで選択中のカレンダー）の予定だけを取り出す。
// これによりカレンダーの切替（タブ）が「新しい予定の追加先」だけでなく
// 「グリッドの●印・下の予定一覧に表示する対象」も切り替える仕様になる
function gcalFilterMapByCal(map, calId){
  const out = {};
  Object.keys(map).forEach(dk => {
    const evs = map[dk].filter(ev => ev.calId === calId);
    if(evs.length) out[dk] = evs;
  });
  return out;
}

// 連携中の全カレンダー（自分のプライマリ＋他アカウントから共有された
// サブカレンダーすべて）を対象に events.list を並行実行し、1つの
// dateKey -> events[] マップへ統合する。1つのカレンダーの取得が失敗
// しても（例：共有が解除された等）残りのカレンダーの予定は表示できる
// よう、失敗はPromise.allSettledで個別に吸収する
async function gcalFetchAllCalendarsEventMap(params){
  const cals = gcalGoogleCalendars || [];
  const results = await Promise.allSettled(cals.map(async cal => {
    const data = await gcalGoogleApiFetch(`calendars/${encodeURIComponent(cal.id)}/events?${params.toString()}`);
    return gcalMapGoogleEventItems(data.items, cal);
  }));
  const maps = [];
  let hadError = false;
  results.forEach(r => { if(r.status === "fulfilled") maps.push(r.value); else hadError = true; });
  return { map: gcalMergeEventMaps(maps), hadError };
}

function gcalEventsCacheKey(y, m){ return `${y}-${m}`; }

// カレンダー画面（月表示）用：指定の年月ぶんのイベントを、連携中の
// 全カレンダー（共有カレンダーを含む）からまとめて取得する
async function gcalRefreshGoogleEvents(y, m){
  const key = gcalEventsCacheKey(y, m);
  try{
    const timeMin = new Date(y, m, 1).toISOString();
    const timeMax = new Date(y, m+1, 1).toISOString();
    const params = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", maxResults: "250", orderBy: "startTime" });
    const { map, hadError } = await gcalFetchAllCalendarsEventMap(params);
    gcalGoogleEventsCache[key] = map;
    if(hadError && !gcalGoogleError) gcalGoogleError = "一部のカレンダーの予定を取得できませんでした。";
  }catch(e){
    if(!gcalGoogleError) gcalGoogleError = "予定の取得に失敗しました。";
    gcalGoogleEventsCache[key] = {};
  }
  renderGcalMonthCard();
}

function gcalDayCacheKey(dateKey){ return dateKey; }

// ホーム画面（1日表示）用：指定の1日ぶんのイベントを、連携中の
// 全カレンダー（共有カレンダーを含む）からまとめて取得する
async function gcalRefreshGoogleDayEvents(y, m, d){
  const dateKey = newsDateKey(y, m, d);
  const cacheKey = gcalDayCacheKey(dateKey);
  try{
    const dayStart = new Date(y, m, d);
    const dayEnd = new Date(y, m, d + 1);
    const params = new URLSearchParams({ timeMin: dayStart.toISOString(), timeMax: dayEnd.toISOString(), singleEvents: "true", maxResults: "250", orderBy: "startTime" });
    const { map, hadError } = await gcalFetchAllCalendarsEventMap(params);
    gcalGoogleDayEventsCache[cacheKey] = map;
    if(hadError && !gcalGoogleError) gcalGoogleError = "一部のカレンダーの予定を取得できませんでした。";
  }catch(e){
    if(!gcalGoogleError) gcalGoogleError = "予定の取得に失敗しました。";
    gcalGoogleDayEventsCache[cacheKey] = {};
  }
  renderGcalDailyWidget();
}

// start/endは"HH:MM"（未入力なら終日予定として扱う）。recurrenceは
// "none"/"daily"/"weekly"/"monthly"で、none以外ならGoogleカレンダー
// 標準のRRULEで繰り返し予定として登録する
async function gcalCreateGoogleEvent(calId, y, m, d, title, start, end, recurrence){
  const pad = (n) => String(n).padStart(2, "0");
  const dateStr = `${y}-${pad(m+1)}-${pad(d)}`;
  const summary = title;
  let body;
  if(start){
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    body = {
      summary,
      start: { dateTime: `${dateStr}T${start}:00`, timeZone: tz },
      end: { dateTime: `${dateStr}T${end || start}:00`, timeZone: tz },
    };
  } else {
    const next = new Date(y, m, d+1);
    const nextStr = newsDateKey(next.getFullYear(), next.getMonth(), next.getDate());
    body = { summary, start: { date: dateStr }, end: { date: nextStr } };
  }
  const rrule = recurrence && recurrence !== "none" ? gcalBuildRRule(recurrence, new Date(y, m, d)) : "";
  if(rrule) body.recurrence = [rrule];
  return gcalGoogleApiFetch(`calendars/${encodeURIComponent(calId)}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function gcalDeleteGoogleEvent(calId, eventId){
  await gcalGoogleApiFetch(`calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
}

// Gemini経由の予定変更（update_schedule）用：日時・タイトルの一部だけを
// 差し替えたいので、既存イベントを取り直さずPATCHで直接上書きする
async function gcalPatchGoogleEvent(calId, eventId, y, m, d, title, start, end){
  const pad = (n) => String(n).padStart(2, "0");
  const dateStr = `${y}-${pad(m+1)}-${pad(d)}`;
  const summary = title;
  let body;
  if(start){
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    body = {
      summary,
      start: { dateTime: `${dateStr}T${start}:00`, timeZone: tz },
      end: { dateTime: `${dateStr}T${end || start}:00`, timeZone: tz },
    };
  } else {
    const next = new Date(y, m, d+1);
    const nextStr = newsDateKey(next.getFullYear(), next.getMonth(), next.getDate());
    body = { summary, start: { date: dateStr }, end: { date: nextStr } };
  }
  return gcalGoogleApiFetch(`calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Gemini経由で登録・変更・削除した直近1件の予定への参照。「今のやつ消して」
// 「さっきの予定を後ろ倒しして」のように対象を明示しない依頼に応えるために、
// このチャットタブを開いている間だけ保持する（永続化はしない）
let geminiLastSchedule = null;

// start/endは"HH:MM"（空文字は終日予定）。2つの予定が同じ日に時間帯として
// 重なっているかどうかを判定する。どちらかが終日予定の場合はその日全体を
// 占有しているとみなし、常に重複扱いにする
function gcalTimesOverlap(aStart, aEnd, bStart, bEnd){
  if(!aStart || !bStart) return true;
  const aE = aEnd || aStart;
  const bE = bEnd || bStart;
  return aStart < bE && bStart < aE;
}

function gcalTimeToMinutes(hhmm){
  return Number(hhmm.slice(0,2)) * 60 + Number(hhmm.slice(3,5));
}
function gcalMinutesToTime(min){
  const clamped = Math.max(0, Math.min(23 * 60 + 59, min));
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
}

// Googleカレンダーの繰り返し予定用RRULEを組み立てる。dateは1回目の日付
// （曜日・日にちの基準）として使う
const GCAL_RRULE_BYDAY = ["SU","MO","TU","WE","TH","FR","SA"];
function gcalBuildRRule(recurrence, dateObj){
  if(recurrence === "daily") return "RRULE:FREQ=DAILY";
  if(recurrence === "weekly") return `RRULE:FREQ=WEEKLY;BYDAY=${GCAL_RRULE_BYDAY[dateObj.getDay()]}`;
  if(recurrence === "monthly") return `RRULE:FREQ=MONTHLY;BYMONTHDAY=${dateObj.getDate()}`;
  return "";
}

// 指定日の既存の予定一覧を、Google連携中／未連携どちらの場合でも同じ形
// （{source, calId/scheduleId, eventId, dateKey, y, m, d, title, start, end}）で
// 返す。予定の重複チェックと、delete_schedule/update_scheduleでの
// 日付＋タイトルによる対象特定の両方から共通で使う
async function geminiFetchDayEventsForQuery(y, m, d){
  const dateKey = newsDateKey(y, m, d);
  if(gcalGoogleAccessToken){
    if(gcalGoogleCalendars === null) await gcalRefreshGoogleCalendars();
    const cals = gcalGoogleCalendars || [];
    if(!cals.length) return [];
    let activeId = null;
    try{ activeId = localStorage.getItem(gcalStorageKey(GCAL_GOOGLE_ACTIVE_KEY)); }catch(e){}
    if(!activeId || !cals.some(c => c.id === activeId)) activeId = cals[0].id;
    const dayStart = new Date(y, m, d);
    const dayEnd = new Date(y, m, d + 1);
    const params = new URLSearchParams({ timeMin: dayStart.toISOString(), timeMax: dayEnd.toISOString(), singleEvents: "true", maxResults: "50", orderBy: "startTime" });
    const data = await gcalGoogleApiFetch(`calendars/${encodeURIComponent(activeId)}/events?${params.toString()}`);
    const map = gcalMapGoogleEventItems(data.items, { id: activeId });
    return (map[dateKey] || []).map(ev => ({ source: "google", calId: activeId, eventId: ev.id, dateKey, y, m, d, title: ev.title, start: ev.start, end: ev.end }));
  }
  // Google未連携のときは、アプリ内の予定テーブル（js/schedule/）を参照する。
  // ホーム画面・カレンダー画面と同じデータなので、Gemini経由の確認・変更・
  // 削除がそのまま画面へ反映される
  return scheduleOccurrencesForDate(dateKey).map(occ => ({
    source: "local", scheduleId: occ.scheduleId, recurring: occ.recurring,
    eventId: occ.scheduleId, dateKey, y, m, d,
    title: occ.title, start: occ.start, end: occ.end,
  }));
}

// delete_schedule/update_scheduleが日付＋タイトルで対象を指定してきたときに、
// その日の予定一覧からタイトルが部分一致する1件を探す。タイトル未指定なら
// その日の予定が1件だけの場合のみそれを対象にする（複数あると誤削除・誤変更の
// リスクがあるため、あいまいな場合は対象なしとして呼び出し側に聞き返させる）
async function geminiFindScheduleByQuery(dateStr, titleQuery){
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || "");
  if(!dm) return null;
  const y = Number(dm[1]), m = Number(dm[2]) - 1, d = Number(dm[3]);
  let evs;
  try{ evs = await geminiFetchDayEventsForQuery(y, m, d); }catch(e){ return null; }
  if(!evs.length) return null;
  if(titleQuery) return evs.find(ev => ev.title && ev.title.includes(titleQuery)) || null;
  return evs.length === 1 ? evs[0] : null;
}

// Gemini相談チャット（js/gemini.js）がregister_schedule関数呼び出しを
// 受け取ったときに呼ばれる。ここではカレンダーへは一切書き込まず、抽出
// された内容を検証・整形し、重複チェックの結果を添えたプレビュー情報を
// 返すだけに留める。実際の登録はユーザーが確認カードで確定操作をした
// 時点でgeminiConfirmSchedule()が行う（戻り値のpreviewが確認カード用、
// textはバリデーションエラー時にそのままチャットへ表示するメッセージ）
async function geminiRegisterSchedule(args){
  const title = (args && typeof args.title === "string" ? args.title : "").trim().slice(0, 200);
  const dateStr = args && typeof args.date === "string" ? args.date : "";
  const rawStart = args && typeof args.start_time === "string" ? args.start_time : "";
  const rawEnd = args && typeof args.end_time === "string" ? args.end_time : "";
  const anchorTitle = (args && typeof args.relative_anchor_title === "string" ? args.relative_anchor_title : "").trim();
  const relativePosition = args && args.relative_position === "before" ? "before" : "after";
  const recurrence = ["daily", "weekly", "monthly"].includes(args && args.recurrence) ? args.recurrence : "none";

  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if(!title || !dm){
    return { text: "予定の日付またはタイトルを認識できませんでした。日付とタイトルを明確にして、もう一度お試しください。" };
  }
  const y = Number(dm[1]), m = Number(dm[2]) - 1, d = Number(dm[3]);
  const dateObj = new Date(y, m, d);
  if(dateObj.getFullYear() !== y || dateObj.getMonth() !== m || dateObj.getDate() !== d){
    return { text: "日付を認識できませんでした。もう一度お試しください。" };
  }
  const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
  let start = timeRe.test(rawStart) ? rawStart : "";
  let end = timeRe.test(rawEnd) ? rawEnd : "";
  let relativeNote = "";

  // 「〜のあと／〜の前」のように既存の予定を基準にした時間指定の場合は、
  // Gemini自身には時刻を推測させず、ここで実際のカレンダーから基準予定を
  // 検索して開始時刻を自動計算する
  if(!start && anchorTitle){
    const anchor = await geminiFindScheduleByQuery(dateStr, anchorTitle);
    if(!anchor){
      return { text: `基準となる「${anchorTitle}」の予定が${y}年${m+1}月${d}日(${NEWS_WEEKDAYS[dateObj.getDay()]})に見つかりませんでした。時刻を指定してもう一度お試しください。` };
    }
    if(relativePosition === "before"){
      const base = anchor.start || anchor.end;
      if(base){
        end = base;
        start = gcalMinutesToTime(gcalTimeToMinutes(base) - 60);
      }
    } else {
      const base = anchor.end || anchor.start;
      if(base){
        start = base;
        end = gcalMinutesToTime(gcalTimeToMinutes(base) + 60);
      }
    }
    if(!start){
      return { text: `「${anchor.title || anchorTitle}」は終日の予定のため、前後の時刻を自動計算できませんでした。時刻を指定してもう一度お試しください。` };
    }
    relativeNote = `「${anchor.title || anchorTitle}」の${relativePosition === "before" ? "直前" : "直後"}に自動設定`;
  }

  if(start && end && end <= start){
    return { text: "終了時刻は開始時刻より後にしてください。" };
  }
  // 終了時刻が指定されなかった場合は、確認カードにもそのまま反映できるよう
  // ここでデフォルトの所要時間（1時間）を補っておく
  if(start && !end){
    const endDate = new Date(y, m, d, Number(start.slice(0,2)), Number(start.slice(3,5)) + 60);
    end = `${String(endDate.getHours()).padStart(2,"0")}:${String(endDate.getMinutes()).padStart(2,"0")}`;
  }

  const dateLabel = `${y}年${m+1}月${d}日(${NEWS_WEEKDAYS[dateObj.getDay()]})`;
  const timeLabel = start ? `${start}${end ? `〜${end}` : ""}` : "終日";
  const recurrenceLabel = gcalRecurrenceLabelFor(recurrence, dateObj);

  let warning = "";
  try{
    const existing = await geminiFetchDayEventsForQuery(y, m, d);
    const dup = existing.find(ev => gcalTimesOverlap(start, end, ev.start, ev.end));
    if(dup){
      const dupTimeLabel = dup.start ? `${dup.start}${dup.end ? `〜${dup.end}` : ""}` : "終日";
      warning = `${dupTimeLabel}に「${dup.title || "無題"}」の予定があります`;
    }
  }catch(e){ /* 重複チェックに失敗しても確認カード自体は表示する */ }

  return {
    preview: { title, dateLabel, timeLabel, warning, relativeNote, recurrenceLabel, args: { y, m, d, title, start, end, recurrence } },
  };
}

function gcalRecurrenceLabelFor(recurrence, dateObj){
  if(recurrence === "daily") return "毎日繰り返し";
  if(recurrence === "weekly") return `毎週${NEWS_WEEKDAYS[dateObj.getDay()]}曜日に繰り返し`;
  if(recurrence === "monthly") return `毎月${dateObj.getDate()}日に繰り返し`;
  return "";
}

// GUI編集フォームの「この内容で保存（登録）」で呼ばれる。フォームの入力値を
// register_scheduleと同じルールで検証し、問題なければmsg.previewを書き換えた
// うえでtrueを返す（呼び出し側はこの後geminiConfirmSchedule()で実際に登録する）。
// 検証エラーの場合はフォームを保持したままエラーメッセージだけ返す
// （フォームを再描画すると入力途中の値が失われてしまうため）。フォームには
// 繰り返し・相対時間指定の項目が無いため、recurrenceと相対時間の注記は
// 元のプレビューの値をそのまま引き継ぐ（繰り返し曜日表示だけ新しい日付で作り直す）
async function geminiApplyScheduleEdits(msg, form){
  const title = (form.title || "").trim().slice(0, 200);
  if(!title) return { error: "タイトルを入力してください。" };

  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(form.date || "");
  if(!dm) return { error: "日付を選択してください。" };
  const y = Number(dm[1]), m = Number(dm[2]) - 1, d = Number(dm[3]);
  const dateObj = new Date(y, m, d);
  if(dateObj.getFullYear() !== y || dateObj.getMonth() !== m || dateObj.getDate() !== d){
    return { error: "日付が正しくありません。" };
  }

  const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
  const rawStart = form.start || "";
  const rawEnd = form.end || "";
  if(rawStart && !timeRe.test(rawStart)) return { error: "開始時刻の形式が正しくありません。" };
  if(rawEnd && !timeRe.test(rawEnd)) return { error: "終了時刻の形式が正しくありません。" };
  let start = rawStart;
  let end = rawEnd;
  if(start && end && end <= start) return { error: "終了時刻は開始時刻より後にしてください。" };
  if(start && !end){
    const endDate = new Date(y, m, d, Number(start.slice(0, 2)), Number(start.slice(3, 5)) + 60);
    end = `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;
  }

  const dateLabel = `${y}年${m + 1}月${d}日(${NEWS_WEEKDAYS[dateObj.getDay()]})`;
  const timeLabel = start ? `${start}${end ? `〜${end}` : ""}` : "終日";

  let warning = "";
  try{
    const existing = await geminiFetchDayEventsForQuery(y, m, d);
    const dup = existing.find(ev => gcalTimesOverlap(start, end, ev.start, ev.end));
    if(dup){
      const dupTimeLabel = dup.start ? `${dup.start}${dup.end ? `〜${dup.end}` : ""}` : "終日";
      warning = `${dupTimeLabel}に「${dup.title || "無題"}」の予定があります`;
    }
  }catch(e){ /* 重複チェックに失敗しても保存自体は続行する */ }

  const recurrence = msg.preview.args.recurrence || "none";
  const recurrenceLabel = gcalRecurrenceLabelFor(recurrence, dateObj);

  msg.preview = { title, dateLabel, timeLabel, warning, relativeNote: msg.preview.relativeNote, recurrenceLabel, args: { y, m, d, title, start, end, recurrence } };
  return { ok: true };
}

// 確認カードの「この内容で登録する」（またはチャットでの「OK」相当の返答）で
// 呼ばれ、ここで初めて実際にカレンダーへ書き込む。書き込み後は同じメッセージ
// のstatusを更新し、結果を新しいモデル発言としてチャットに積む
async function geminiConfirmSchedule(msg){
  const { y, m, d, title, start, end, recurrence } = msg.preview.args;
  const dateLabel = msg.preview.dateLabel;
  const timeLabel = msg.preview.timeLabel;
  const recurrenceLabel = msg.preview.recurrenceLabel;

  try{
    if(gcalGoogleAccessToken){
      if(gcalGoogleCalendars === null) await gcalRefreshGoogleCalendars();
      const cals = gcalGoogleCalendars || [];
      if(!cals.length){
        pushGeminiMessage({ role: "model", text: "連携できるGoogleカレンダーが見つかりませんでした。" });
        return;
      }
      let activeId = null;
      try{ activeId = localStorage.getItem(gcalStorageKey(GCAL_GOOGLE_ACTIVE_KEY)); }catch(e){}
      if(!activeId || !cals.some(c => c.id === activeId)) activeId = cals[0].id;
      const created = await gcalCreateGoogleEvent(activeId, y, m, d, title, start, end, recurrence);
      // このチャット経由の追加は日／月カードのキャッシュを経由しないため、
      // 次にカレンダー画面を開いたときに確実に反映されるよう、切断時と
      // 同様にキャッシュを空にして再取得を促す
      gcalGoogleEventsCache = {};
      gcalGoogleDayEventsCache = {};
      geminiLastSchedule = { source: "google", calId: activeId, eventId: created && created.id, dateKey: newsDateKey(y, m, d), y, m, d, start, end, title };
    } else {
      // Google未連携のときはアプリ内の予定テーブルへ登録する。繰り返しは
      // 回数ぶんコピーせず、RRULEを持つ1件として保存する（削除するまで
      // ずっと表示され、あとから「この回だけ」の変更もできる）
      const dateKey = newsDateKey(y, m, d);
      const allDay = !start;
      const created = scheduleUpsert({
        title,
        startDateTime: allDay ? `${dateKey}T00:00` : `${dateKey}T${start}`,
        endDateTime: allDay ? `${dateKey}T23:59` : `${dateKey}T${end || start}`,
        allDay,
        recurrenceRule: recurrence && recurrence !== "none"
          ? scheduleBuildRRule(schedulePresetToSpec(recurrence, dateKey)) : "",
        syncStatus: "local",
      });
      geminiLastSchedule = { source: "local", scheduleId: created.id, recurring: !!created.recurrenceRule, eventId: created.id, dateKey, y, m, d, start, end, title };
    }
  }catch(e){
    msg.status = "pending";
    pushGeminiMessage({ role: "model", text: `予定の登録に失敗しました：「${title}」（${dateLabel} ${timeLabel}）。もう一度お試しください。` });
    return;
  }

  msg.status = "confirmed";
  const recurrenceSuffix = recurrenceLabel ? `（${recurrenceLabel}）` : "";
  pushGeminiMessage({ role: "model", text: `✅ ${dateLabel} ${timeLabel} に「${title}」を登録しました${recurrenceSuffix}。` });
  notifyScheduleCreated(gcalActorName(), title, `${dateLabel} ${timeLabel}`);
}

// 確認カードの「キャンセル・修正する」（またはチャットでの「キャンセル」相当の
// 返答）で呼ばれる。カレンダーへは何も書き込まず、カードを取り消し状態にする
function geminiCancelSchedule(msg){
  msg.status = "cancelled";
  pushGeminiMessage({ role: "model", text: "予定の登録をキャンセルしました。内容を変えて、もう一度お申し付けください。" });
}

// delete_schedule：target:'last'（または日付・タイトル省略時）なら直前に
// このチャットで登録・変更した予定を、それ以外はdate＋titleで特定した予定を削除する
async function geminiDeleteSchedule(args){
  const target = args && typeof args.target === "string" ? args.target : "";
  const dateStr = args && typeof args.date === "string" ? args.date : "";
  const titleQuery = (args && typeof args.title === "string" ? args.title : "").trim();

  let ref = null;
  if(target === "last" || (!dateStr && !titleQuery)){
    ref = geminiLastSchedule;
    if(!ref) return { text: "直前に登録した予定が見つかりませんでした。対象の日付とタイトルを教えてください。" };
  } else {
    ref = await geminiFindScheduleByQuery(dateStr, titleQuery);
    if(!ref) return { text: "該当する予定が見つかりませんでした。日付やタイトルを確認してもう一度お試しください。" };
  }

  try{
    if(ref.source === "google"){
      await gcalDeleteGoogleEvent(ref.calId, ref.eventId);
      gcalGoogleEventsCache = {};
      gcalGoogleDayEventsCache = {};
    } else {
      if(!scheduleGetSchedule(ref.scheduleId)){
        return { text: "対象の予定が見つかりませんでした。すでに削除されている可能性があります。" };
      }
      // 繰り返し予定はその日の回だけを取り消す（他の回は残す）
      if(ref.recurring) scheduleDeleteOccurrence(ref.scheduleId, ref.dateKey);
      else scheduleDeleteSchedule(ref.scheduleId);
    }
  }catch(e){
    return { text: `予定「${ref.title}」の削除に失敗しました。もう一度お試しください。` };
  }

  if(geminiLastSchedule === ref) geminiLastSchedule = null;
  notifyScheduleDeleted(gcalActorName(), ref.title);
  return { text: `🗑️ 「${ref.title}」の予定を${ref.source !== "google" && ref.recurring ? "（この回だけ）" : ""}削除しました。` };
}

// update_schedule：target:'last'（または日付・タイトル省略時）なら直前の予定を、
// それ以外はdate＋original_titleで特定した予定を対象に、指定された項目だけを書き換える
async function geminiUpdateSchedule(args){
  const target = args && typeof args.target === "string" ? args.target : "";
  const dateStr = args && typeof args.date === "string" ? args.date : "";
  const titleQuery = (args && typeof args.original_title === "string" ? args.original_title : "").trim();

  let ref = null;
  if(target === "last" || (!dateStr && !titleQuery)){
    ref = geminiLastSchedule;
    if(!ref) return { text: "直前に登録した予定が見つかりませんでした。対象の日付とタイトルを教えてください。" };
  } else {
    ref = await geminiFindScheduleByQuery(dateStr, titleQuery);
    if(!ref) return { text: "該当する予定が見つかりませんでした。日付やタイトルを確認してもう一度お試しください。" };
  }

  const newDateStr = args && typeof args.new_date === "string" ? args.new_date : "";
  const newDm = newDateStr ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(newDateStr) : null;
  if(newDateStr && !newDm) return { text: "変更後の日付を認識できませんでした。" };

  const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
  const rawNewStart = args && typeof args.new_start_time === "string" ? args.new_start_time : "";
  const rawNewEnd = args && typeof args.new_end_time === "string" ? args.new_end_time : "";
  const newStart = rawNewStart ? (timeRe.test(rawNewStart) ? rawNewStart : null) : undefined;
  const newEnd = rawNewEnd ? (timeRe.test(rawNewEnd) ? rawNewEnd : null) : undefined;
  if(newStart === null || newEnd === null){
    return { text: "変更後の時刻を認識できませんでした。「HH:MM」の形式でお伝えください。" };
  }

  const y = newDm ? Number(newDm[1]) : ref.y;
  const m = newDm ? Number(newDm[2]) - 1 : ref.m;
  const d = newDm ? Number(newDm[3]) : ref.d;
  const start = newStart !== undefined ? newStart : ref.start;
  const end = newEnd !== undefined ? newEnd : ref.end;
  const newTitleRaw = args && typeof args.new_title === "string" ? args.new_title.trim().slice(0, 200) : "";
  const title = newTitleRaw || ref.title;

  if(start && end && end <= start){
    return { text: "終了時刻は開始時刻より後にしてください。" };
  }

  try{
    if(ref.source === "google"){
      await gcalPatchGoogleEvent(ref.calId, ref.eventId, y, m, d, title, start, end);
      gcalGoogleEventsCache = {};
      gcalGoogleDayEventsCache = {};
    } else {
      const schedule = scheduleGetSchedule(ref.scheduleId);
      if(!schedule) return { text: "対象の予定が見つかりませんでした。すでに削除・変更されている可能性があります。" };
      const newDateKey = newsDateKey(y, m, d);
      if(ref.recurring && newDateKey === ref.dateKey){
        // 繰り返し予定の日付が変わらない変更は「この回だけ」の一時変更にする
        scheduleSetOccurrenceOverride(ref.scheduleId, ref.dateKey, { title, start, end });
      } else {
        if(ref.recurring) scheduleDeleteOccurrence(ref.scheduleId, ref.dateKey);
        const allDay = !start;
        const moved = ref.recurring
          ? scheduleUpsert({ title, allDay, syncStatus: "local",
              startDateTime: allDay ? `${newDateKey}T00:00` : `${newDateKey}T${start}`,
              endDateTime: allDay ? `${newDateKey}T23:59` : `${newDateKey}T${end || start}` })
          : scheduleUpsert({ ...schedule, title, allDay,
              startDateTime: allDay ? `${newDateKey}T00:00` : `${newDateKey}T${start}`,
              endDateTime: allDay ? `${newDateKey}T23:59` : `${newDateKey}T${end || start}` });
        ref.scheduleId = moved.id;
        ref.recurring = !!moved.recurrenceRule;
      }
      ref.dateKey = newDateKey;
    }
  }catch(e){
    return { text: `予定「${ref.title}」の変更に失敗しました。もう一度お試しください。` };
  }

  ref.y = y; ref.m = m; ref.d = d; ref.start = start; ref.end = end; ref.title = title;
  const dateLabel = `${y}年${m+1}月${d}日(${NEWS_WEEKDAYS[new Date(y, m, d).getDay()]})`;
  const timeLabel = start ? `${start}${end ? `〜${end}` : ""}` : "終日";
  return { text: `✏️ 予定を「${title}」（${dateLabel} ${timeLabel}）に変更しました。` };
}

// js/gemini.js側からは関数名と引数だけが渡されるので、ここで3種類の
// カレンダー操作へ振り分ける
async function geminiHandleScheduleFunctionCall(name, args){
  if(name === "delete_schedule") return geminiDeleteSchedule(args);
  if(name === "update_schedule") return geminiUpdateSchedule(args);
  return geminiRegisterSchedule(args);
}
setGeminiScheduleHandler(geminiHandleScheduleFunctionCall);

// Geminiチャットが「今日の予定・タスク」の質問にホーム画面と同じ実データで
// 答えられるよう、予定／タスクのローカルストア（ホーム画面の「今日の予定」
// 「本日のタスク」と同じ一次情報源）から本日ぶんのスナップショットを返す。
// 新規のネットワーク取得は行わないので、オフラインでも同じ答えになる
function getTodayHomeContext(){
  const now = new Date();
  const dateKey = newsDateKey(now.getFullYear(), now.getMonth(), now.getDate());
  return {
    todos: scheduleTasksForDate(dateKey).map(t => ({ text: t.title, done: !!t.doneOnDate })),
    events: todayOccurrences().map(occ => ({ title: occ.title, start: occ.start || null, end: occ.end || null })),
  };
}
setGeminiHomeContextProvider(getTodayHomeContext);

// Geminiチャットが「今日の株価は？」のような質問に画面と同じ実データで
// 答えられるよう、保有株（ポートフォリオ）とウォッチリストの現在値をまとめて
// 返す。保有株の評価額はcomputeHoldingsSummary()（保有株画面・株価画面の
// 総資産と同じロジック＝リアルタイム株価×保有株数）をそのまま流用する
async function buildStockContextForGemini(){
  const watchTickers = loadWatchlist();
  const { rows } = computeHoldingsSummary();
  const marketOpen = isUSMarketHoursJST();

  const holdings = rows.map(r => ({ ticker:r.ticker, name:r.name, shares:r.shares, price:r.price, value:r.value }));

  if(!watchTickers.length) return { holdings, watchlist: [], cash: S.coins || 0, marketOpen };
  const { quotes } = await fetchStockQuotes(watchTickers);
  const watchlist = watchTickers.map(t => {
    const live = quotes[t];
    if(!live) return null;
    const changePercent = live.prevClose ? ((live.price - live.prevClose) / live.prevClose) * 100 : null;
    return { ticker: t, name: stockDisplayName(t), price: live.price, changePercent };
  }).filter(Boolean);

  return { holdings, watchlist, cash: S.coins || 0, marketOpen };
}
setGeminiStockContextProvider(buildStockContextForGemini);

function gcalBindConnectBar(root){
  const connectBtn = root.querySelector("#gcal-google-connect");
  if(connectBtn) connectBtn.onclick = () => gcalConnectGoogle();
  const disconnectBtn = root.querySelector("#gcal-google-disconnect");
  if(disconnectBtn) disconnectBtn.onclick = () => gcalDisconnectGoogle();
}

function gcalConnectBarHTML(){
  if(gcalGoogleAccessToken){
    return `
      <div class="gcal-google-bar">
        <span class="gcal-google-badge">🔗 Googleカレンダーと連携中</span>
        <button type="button" class="gcal-google-disconnect" id="gcal-google-disconnect">連携解除</button>
      </div>`;
  }
  return `
    <div class="gcal-google-bar">
      <button type="button" class="gcal-google-connect" id="gcal-google-connect"${gcalGoogleConnecting?" disabled":""}>${gcalGoogleConnecting?"連携中…":"🔗 Googleカレンダーと連携"}</button>
    </div>`;
}

// 前月・翌月にはみ出す先頭・末尾のマスは完全な空白にせず、実際のGoogle
// カレンダーと同様に前後の月の日付を薄く添えることで、グリッドが1行分
// 欠けたような不自然な空白に見えないようにする（クリックはできない）
const JAPAN_HOLIDAY_CACHE = {};

function gcalPad2(n){ return String(n).padStart(2, "0"); }
function gcalYmd(y, m, d){ return `${y}-${gcalPad2(m+1)}-${gcalPad2(d)}`; }

// year年のmonth月（0始まり）における第n◯曜日（ここでは月曜固定）の日付を返す
function gcalNthMondayOfMonth(year, month, n){
  const first = new Date(year, month, 1);
  const firstMonday = 1 + ((8 - first.getDay()) % 7);
  return firstMonday + (n - 1) * 7;
}

// 春分の日・秋分の日は天文計算で年ごとに変わるため、1980〜2099年の範囲で
// 実用上ずれのない近似式（国立天文台の暦要項に基づく一般的な近似式）で算出する
function gcalEquinoxDay(year, isAutumn){
  const base = isAutumn
    ? 23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)
    : 20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4);
  return Math.floor(base);
}

// 日本の祝日一覧（"YYYY-MM-DD"のSet）をyear年ぶん計算する。祝日ボタンは
// 廃止しつつも「土曜は青・日曜と祝日は赤」の配色判定にはこの祝日データを
// 裏側で使う。固定日・ハッピーマンデー・春分秋分に加え、振替休日・
// 国民の休日（前後を祝日に挟まれた平日）も反映する。2020・2021年は東京
// オリンピック開催に伴う祝日移動（海の日・スポーツの日・山の日）を個別に反映する
function gcalComputeJapanHolidays(year){
  if(JAPAN_HOLIDAY_CACHE[year]) return JAPAN_HOLIDAY_CACHE[year];
  const base = new Map();
  const add = (m, d) => base.set(gcalYmd(year, m, d), true);

  add(0, 1); // 元日
  add(0, gcalNthMondayOfMonth(year, 0, 2)); // 成人の日
  add(1, 11); // 建国記念の日
  if(year >= 2020) add(1, 23); // 天皇誕生日
  add(2, gcalEquinoxDay(year, false)); // 春分の日
  add(3, 29); // 昭和の日
  add(4, 3); add(4, 4); add(4, 5); // 憲法記念日・みどりの日・こどもの日

  if(year === 2020){
    add(6, 23); add(6, 24); add(7, 10); // 海の日・スポーツの日・山の日（五輪特例）
  } else if(year === 2021){
    add(6, 22); add(6, 23); add(7, 8); // 海の日・スポーツの日・山の日（五輪特例）
  } else {
    add(6, gcalNthMondayOfMonth(year, 6, 3)); // 海の日
    add(9, gcalNthMondayOfMonth(year, 9, 2)); // スポーツの日
    if(year >= 2016) add(7, 11); // 山の日
  }

  add(8, gcalNthMondayOfMonth(year, 8, 3)); // 敬老の日
  add(8, gcalEquinoxDay(year, true)); // 秋分の日
  add(10, 3); // 文化の日
  add(10, 23); // 勤労感謝の日

  const has = (y2, m2, d2) => base.has(gcalYmd(y2, m2, d2));

  // 国民の休日：前後を祝日に挟まれた平日（日曜を除く）は休日になる
  const bridged = new Map(base);
  for(let m=0; m<12; m++){
    const days = new Date(year, m+1, 0).getDate();
    for(let d=1; d<=days; d++){
      const key = gcalYmd(year, m, d);
      if(base.has(key)) continue;
      if(new Date(year, m, d).getDay() === 0) continue;
      const prev = new Date(year, m, d - 1);
      const next = new Date(year, m, d + 1);
      if(has(prev.getFullYear(), prev.getMonth(), prev.getDate()) && has(next.getFullYear(), next.getMonth(), next.getDate())){
        bridged.set(key, true);
      }
    }
  }

  // 振替休日：祝日が日曜日の場合、その直後の「祝日でない最初の日」を休日にする
  const result = new Map(bridged);
  bridged.forEach((_, key) => {
    const [yy, mm, dd] = key.split("-").map(Number);
    if(new Date(yy, mm-1, dd).getDay() !== 0) return;
    let cursor = new Date(yy, mm-1, dd+1);
    while(result.has(gcalYmd(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()))){
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()+1);
    }
    result.set(gcalYmd(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()), true);
  });

  const set = new Set(result.keys());
  JAPAN_HOLIDAY_CACHE[year] = set;
  return set;
}

function gcalDayCellsHTML(y, m, evMap, todayKey, color, selectedDay){
  const first = new Date(y, m, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const prevDaysInMonth = new Date(y, m, 0).getDate();
  const holidays = gcalComputeJapanHolidays(y);
  const cells = [];
  for(let i=startWeekday-1; i>=0; i--){
    cells.push(`<span class="gcal-cell empty">${prevDaysInMonth - i}</span>`);
  }
  for(let d=1; d<=daysInMonth; d++){
    const key = newsDateKey(y, m, d);
    const cls = ["gcal-cell"];
    if(key===todayKey) cls.push("today");
    if(d===selectedDay) cls.push("selected");
    // 土曜は青、日曜・祝日は赤（「日本の祝日」タブは廃止したが、配色判定
    // には引き続き裏側で祝日データを使う）
    const dow = new Date(y, m, d).getDay();
    if(dow === 6) cls.push("sat");
    if(dow === 0 || holidays.has(key)) cls.push("holiday");
    const dayEvents = evMap[key] || [];
    // 予定が複数カレンダー由来のときは、その日にある予定のカレンダーの色を
    // 重複なく（最大4つまで）並べて表示し、どのカレンダーの予定があるかを
    // ひと目で分かるようにする。calColorを持たない予定（ローカルのデモ
    // カレンダー）はこれまで通り呼び出し元が渡した単一色にフォールバックする
    const dotColors = dayEvents.length ? [...new Set(dayEvents.map(ev => ev.calColor || color))].slice(0, 4) : [];
    const dotsHTML = dotColors.length ? `<span class="gcal-cell-dots">${dotColors.map(c => `<span class="gcal-cell-dot" style="background:${esc(c)}"></span>`).join("")}</span>` : "";
    cells.push(`<button type="button" class="${cls.join(" ")}" data-gday="${d}">${d}${dotsHTML}</button>`);
  }
  const trailing = (7 - ((startWeekday + daysInMonth) % 7)) % 7;
  for(let d=1; d<=trailing; d++){
    cells.push(`<span class="gcal-cell empty">${d}</span>`);
  }
  return cells.join("");
}

// ホーム画面（1日表示）で表示中の年月日。renderSelect()によるホーム画面
// 全体の再描画をまたいでも見ていた日を保持するため、モジュール変数として
// 保持する（初回のみ今日）
let gcalDailyY = null, gcalDailyM = null, gcalDailyD = null;

function gcalShiftDailyDate(deltaDays){
  const d = new Date(gcalDailyY, gcalDailyM, gcalDailyD + deltaDays);
  gcalDailyY = d.getFullYear(); gcalDailyM = d.getMonth(); gcalDailyD = d.getDate();
}

// 予定1件ぶんのタイムラインカードHTML。時間・本文はそれぞれ1行に収め、
// カード幅に収まらない場合はgcalApplyMarquee()が自動横スクロールを付与する
function gcalEventRowHTML(ev){
  const timeText = ev.start ? (ev.end ? `${ev.start} ~ ${ev.end}` : ev.start) : "終日";
  const calDotHTML = ev.calColor ? `<span class="gcal-day-event-caldot" style="background:${esc(ev.calColor)}" title="${esc(ev.calName||"")}"></span>` : "";
  return `
    <div class="gcal-day-event" data-start="${esc(ev.start||"")}" data-end="${esc(ev.end||"")}">
      <div class="gcal-day-event-time"><span class="gcal-marquee-track">${esc(timeText)}</span></div>
      <div class="gcal-day-event-main"><span class="gcal-marquee-track">${calDotHTML}<span class="gcal-day-event-title">${esc(ev.title)}</span></span></div>
      <button type="button" class="gcal-day-event-del" data-del="${esc(ev.id)}" data-cal="${esc(ev.calId||"")}" aria-label="この予定を削除">×</button>
    </div>`;
}

// 連携中のGoogleアカウント自身のメールアドレス（プライマリカレンダーの
// IDは常にそのアカウントのメールアドレスと一致する）。未連携・未取得なら null
function gcalOwnGoogleEmail(){
  const primary = (gcalGoogleCalendars || []).find(c => c.primary);
  return primary ? primary.id : null;
}

// その予定が「今アプリを使っている本人」自身の予定かどうかを判定する。
// ローカル（デモ）モードの予定にはGoogle本来の作成者情報が無いため常に
// 本人の予定として扱う。Google連携中は、予定のcreator.emailが自分の
// プライマリカレンダーのメールアドレスと一致する場合だけ本人の予定とする
// （共有カレンダー経由で見えている他アカウントの予定と区別するため）
function gcalIsOwnEvent(ev){
  if(!ev.creatorEmail) return true;
  const own = gcalOwnGoogleEmail();
  return !own || ev.creatorEmail === own;
}

// 「共有カレンダー経由で見えている他ユーザー」の表示名を、自分だけの見た目
// としてこの端末上で上書きする設定（Google連携メールアドレス→自分で付けた
// 呼び方）。ローカル（デモ）の登録者名やGoogle Calendar本体とは無関係の、
// 完全にこのアプリ内・この端末限定の表示上書きであり、Firestoreなど
// データベースへは一切書き込まない（syncGcalToCloud()を呼ばない）
const GCAL_OTHER_NAME_KEY = "gcal_other_name_overrides_v1"; // { [emailLower]: customName }

function gcalLoadOtherNameOverrides(){
  try{
    const data = JSON.parse(localStorage.getItem(gcalStorageKey(GCAL_OTHER_NAME_KEY)) || "{}");
    return (data && typeof data === "object" && !Array.isArray(data)) ? data : {};
  }catch(e){ return {}; }
}

function gcalSaveOtherNameOverride(email, name){
  const key = (email || "").trim().toLowerCase();
  if(!key) return;
  const overrides = gcalLoadOtherNameOverrides();
  overrides[key] = (name || "").trim();
  try{ localStorage.setItem(gcalStorageKey(GCAL_OTHER_NAME_KEY), JSON.stringify(overrides)); }catch(e){}
}

// 「共有カレンダー経由で見えている他ユーザー」がこのアプリ自身に登録した
// 名前を、Google連携メールアドレス→登録名の公開ディレクトリ（gcalNames
// コレクション）からキャッシュ付きで引く。一度取得（または「登録なし」と
// 判明）したメールアドレスは再問い合わせしない。取得中・未取得はnullを返し
// （その間は呼び出し元がcreatorName等へフォールバックする）、取得が完了した
// 時点でrenderGcalActiveView()により表示中の予定一覧を登録名へ更新する
const gcalNameDirectory = {};
const gcalNameDirectoryPending = new Set();
function gcalLookupRegisteredName(email){
  const key = (email || "").trim().toLowerCase();
  if(!key || !window.GcalNames) return null;
  if(Object.prototype.hasOwnProperty.call(gcalNameDirectory, key)) return gcalNameDirectory[key];
  if(!gcalNameDirectoryPending.has(key)){
    gcalNameDirectoryPending.add(key);
    window.GcalNames.lookup(key)
      .then(name => { gcalNameDirectory[key] = name || null; })
      .catch(() => { gcalNameDirectory[key] = null; })
      .finally(() => { gcalNameDirectoryPending.delete(key); renderGcalActiveView(); });
  }
  return null;
}

// 予定1件の「作成者ラベル」を決定する。手動入力の登録者名(author)を最優先、
// 次に本人自身の予定なら「アプリに登録したユーザー名」（呼び出し元が渡す
// fallback）を使う。それ以外（共有カレンダー経由の他ユーザーの予定）は、
// まずこちら側がこの端末だけで付けた呼び方（gcalLoadOtherNameOverrides、
// データベースには保存されないローカル専用の表示上書き）を最優先する。
// 次にその相手が自分自身でこのアプリに登録した名前（公開ディレクトリ）、
// 次点として「カレンダーの表示名を変更」（✎）でこちら側が登録した名前
// (calRenamed && calName)、それも無ければGoogleカレンダー本来の作成者情報
// (creatorName。多くの場合Gmailアドレスそのまま)、最後に取得元カレンダー名
// (calName)を使う
function gcalEventUserLabel(ev, fallback){
  const author = (ev.author || "").trim();
  if(author) return author;
  if(gcalIsOwnEvent(ev)) return fallback || "予定";
  const emailKey = (ev.creatorEmail || "").trim().toLowerCase();
  if(emailKey){
    const localOverride = gcalLoadOtherNameOverrides()[emailKey];
    if(localOverride) return localOverride;
  }
  const registered = ev.creatorEmail ? gcalLookupRegisteredName(ev.creatorEmail) : null;
  if(registered) return registered;
  if(ev.calRenamed && ev.calName) return ev.calName;
  if(ev.creatorName) return ev.creatorName;
  if(ev.calName) return ev.calName;
  return fallback || "予定";
}

// 予定一覧を作成者ラベルごとにグループ化する。グループ内は開始時刻の
// 昇順、グループ自体はラベル名の五十音/辞書順に並べる。
// editKind:"own" は本人自身の予定グループ（見出しタップで「アプリに登録した
// ユーザー名」を変更）、editKind:"other"（editEmailにその相手のメールアドレス
// を保持）は他ユーザーの予定グループ（見出しタップでこの端末だけの呼び方を
// 設定）。同じグループ内に異なるメールアドレスの予定が混在してしまった場合は
// どちらの表示名を編集すべきか特定できないため編集不可にする
function gcalGroupEventsByUser(events, fallback){
  const order = [];
  const groups = new Map();
  events.forEach(ev => {
    const label = gcalEventUserLabel(ev, fallback);
    if(!groups.has(label)){ groups.set(label, { label, color: null, editKind: null, editEmail: null, events: [] }); order.push(label); }
    const g = groups.get(label);
    const author = (ev.author || "").trim();
    if(!author && gcalIsOwnEvent(ev)){
      g.editKind = "own";
    } else if(!author && ev.creatorEmail && g.editKind !== "own"){
      const email = ev.creatorEmail.trim().toLowerCase();
      if(g.editKind === null){ g.editKind = "other"; g.editEmail = email; }
      else if(g.editKind === "other" && g.editEmail !== email){ g.editKind = null; g.editEmail = null; }
    }
    if(!g.color && ev.calColor) g.color = ev.calColor;
    g.events.push(ev);
  });
  return order.map(label => groups.get(label))
    .map(g => ({ ...g, events: g.events.slice().sort((a,b)=>(a.start||"").localeCompare(b.start||"")) }))
    .sort((a,b) => a.label.localeCompare(b.label, "ja"));
}

// 1日ぶんの予定を「ユーザーごと」にエリアを分けたタイムライン表示にする。
// どの予定がどのユーザー（アカウント）の登録かを一目で分別できるよう、
// gcalGroupEventsByUser()でグループ化してから、グループ見出し＋予定
// カードの順に描画する。fallbackは作成者を判別できない予定に使うラベル
// （通常はこのカレンダーの登録者名、または取得元カレンダー名）
function gcalDayEventsListHTML(events, fallback){
  if(!events.length) return `<div class="gcal-day-empty">この日の予定はまだありません。</div>`;
  const groups = gcalGroupEventsByUser(events, fallback);
  return groups.map(g => {
    const editable = g.editKind === "own" || g.editKind === "other";
    const editAttr = g.editKind === "own" ? ' data-gcal-name-edit="1"'
      : g.editKind === "other" ? ` data-gcal-other-name-edit="${esc(g.editEmail)}"` : "";
    return `
    <div class="gcal-user-group">
      <div class="gcal-user-group-title${editable?" gcal-user-group-title-edit":""}"${editable?editAttr+' role="button" tabindex="0" aria-label="表示名を編集"':""}>${g.color?`<span class="gcal-user-group-dot" style="background:${esc(g.color)}"></span>`:""}${esc(g.label)}${editable?'<span class="gcal-user-group-edit-icon" aria-hidden="true">✏️</span>':""}</div>
      <div class="gcal-user-group-events">${g.events.map(gcalEventRowHTML).join("")}</div>
    </div>`;
  }).join("");
}

// gcalDayEventsListHTML()が出力したグループ見出しをタップ／Enterで押すと、
// 表示名の変更モーダルを開く。「自分自身」（data-gcal-name-edit）なら
// カレンダーで使う名前（アプリに登録したユーザー名）を、「他ユーザー」
// （data-gcal-other-name-edit、値はそのメールアドレス）ならこの端末だけの
// 呼び方（データベースには保存しないローカル専用の表示上書き）を変更する。
// 保存後はonSavedで呼び出し元の画面を再描画させる
function gcalBindNameEditHeadings(root, onSaved){
  root.querySelectorAll("[data-gcal-name-edit]").forEach(el => {
    const open = () => openGcalAuthorNameModal(() => { if(onSaved) onSaved(); }, { allowCancel: true });
    el.onclick = open;
    el.onkeydown = (e) => { if(e.key === "Enter" || e.key === " "){ e.preventDefault(); open(); } };
  });
  root.querySelectorAll("[data-gcal-other-name-edit]").forEach(el => {
    const email = el.dataset.gcalOtherNameEdit;
    const open = () => openGcalOtherNameModal(email, () => { if(onSaved) onSaved(); });
    el.onclick = open;
    el.onkeydown = (e) => { if(e.key === "Enter" || e.key === " "){ e.preventDefault(); open(); } };
  });
}

// 「他ユーザー」の予定グループ見出しをタップしたときに開く、この端末だけの
// 呼び方を設定するモーダル。gcalSaveOtherNameOverride()はlocalStorageのみを
// 使い、Firestore等のデータベースには一切書き込まない（相手や他の閲覧者の
// 画面には影響しない、完全に自分の見た目だけの変更であることをsub文言で明示する）
function openGcalOtherNameModal(email, onSaved){
  const ov = document.createElement("div");
  ov.className = "modal-ov";
  const current = gcalLoadOtherNameOverrides()[(email || "").trim().toLowerCase()] || "";
  const close = () => { try{ ov.remove(); }catch(e){} };
  ov.innerHTML = `
    <div class="modal">
      <div class="modal-title" style="color:var(--text)">✎ 表示名を変更</div>
      <div class="gcal-modal-sub">${esc(email)}<br>この端末・このアカウントだけの表示です。相手や他の人の画面には影響しません。</div>
      <input type="text" class="gcal-ev-input gcal-newcal-input" id="gcal-other-name-input" placeholder="例：お母さん" maxlength="40" value="${esc(current)}">
      <button class="cta" id="gcal-other-name-save">保存する</button>
      <button class="ghost" id="gcal-other-name-cancel" style="margin-top:8px">キャンセル</button>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if(e.target === ov) close(); });
  ov.querySelector("#gcal-other-name-cancel").onclick = close;
  const input = ov.querySelector("#gcal-other-name-input");
  ov.querySelector("#gcal-other-name-save").onclick = () => {
    const name = (input.value || "").trim();
    if(!name){ input.focus(); return; }
    gcalSaveOtherNameOverride(email, name);
    close();
    if(onSaved) onSaved(name);
  };
  input.onkeydown = (e) => { if(e.key === "Enter") ov.querySelector("#gcal-other-name-save").click(); };
  input.focus();
}

// gcalDayEventsListHTML()が描画した各予定カードの時間・本文について、
// カード幅に収まりきらないものだけを自動検出し、右→左へループして流れる
// マーキー表示（CSSアニメーション）を付与する。DOM挿入直後に呼び出す想定
function gcalApplyMarquee(root){
  root.querySelectorAll(".gcal-day-event-time, .gcal-day-event-main").forEach(el => {
    el.classList.remove("gcal-marquee");
    el.style.removeProperty("--gcal-marquee-duration");
    const track = el.querySelector(".gcal-marquee-track");
    if(!track) return;
    if(track.scrollWidth - el.clientWidth > 2){
      const distance = el.clientWidth + track.scrollWidth;
      el.style.setProperty("--gcal-marquee-duration", `${Math.max(3, distance / 40)}s`);
      el.classList.add("gcal-marquee");
    }
  });
}

// 予定エリアの高さ固定・スクロール位置の制御を行う。DOM挿入直後に呼び出す想定
// ・予定が5件以上あるときは最初の4件ぶんの高さに固定し、5件目以降は
//   overflow-y:autoの手動スワイプで見えるようにする
// ・直前と同じ日付／カレンダーの再描画（ToDo操作や予定の追加削除など）
//   ならユーザーがスクロールした位置をそのまま保つ
// ・日付やカレンダーが変わった直後（初回表示・前後日への移動）は、
//   終了時刻（なければ開始時刻）がまだ過ぎていない最初の予定が先頭に
//   来るよう自動でスクロール位置を計算し直す（終日予定は「過ぎていない」
//   扱いとし、それより後ろへは自動スクロールしない）
function gcalSetupDayEventsScroll(root, scrollKey, y, m, d, now, prevKey, prevScrollTop){
  const container = root.querySelector(".gcal-day-events");
  if(!container) return;
  container.style.removeProperty("height");
  const cards = [...container.querySelectorAll(".gcal-day-event")];

  if(cards.length >= 5){
    const gap = parseFloat(getComputedStyle(container).rowGap) || 0;
    let h = 0;
    for(let i=0; i<4; i++){ h += cards[i].offsetHeight + (i>0 ? gap : 0); }
    container.style.height = `${h}px`;
  }

  if(scrollKey === prevKey && prevScrollTop !== null){
    container.scrollTop = prevScrollTop;
    return;
  }

  let targetIndex = cards.length ? cards.length - 1 : 0;
  for(let i=0; i<cards.length; i++){
    const ref = cards[i].dataset.end || cards[i].dataset.start;
    if(!ref || new Date(y, m, d, ...ref.split(":").map(Number)) > now){ targetIndex = i; break; }
  }
  const target = cards[targetIndex];
  if(target){
    const contRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    container.scrollTop += (targetRect.top - contRect.top);
  }
}

function gcalTodoListHTML(todos){
  if(!todos.length) return `<div class="gcal-todo-empty">タスクはありません</div>`;
  return todos.map(t => `
    <div class="gcal-todo-item${t.done?" done":""}">
      <input type="checkbox" class="gcal-todo-check" data-todo-toggle="${esc(t.id)}"${t.done?" checked":""} aria-label="完了にする">
      <span class="gcal-todo-text">${esc(t.text)}</span>
      <button type="button" class="gcal-todo-del" data-todo-del="${esc(t.id)}" aria-label="このタスクを削除">×</button>
    </div>`).join("");
}

// 「変更を反映」ボタン：ホーム画面の日ウィジェットが表示中の1日ぶんの
// 予定を、キャッシュを使わず裏から取り直して画面に反映する。Google連携
// 中のみ実際のAPI再取得を行い、未連携（ローカルのデモモード）のときは
// localStorageの最新状態を読み直すだけの軽い再描画になる
async function gcalReloadDay(){
  if(gcalDayReloading) return;
  gcalDayReloading = true;
  renderGcalDailyWidget();
  if(gcalGoogleAccessToken){
    await gcalRefreshGoogleDayEvents(gcalDailyY, gcalDailyM, gcalDailyD);
  }
  gcalDayReloading = false;
  renderGcalDailyWidget();
}

// ホーム画面：本日（表示中の1日）だけを表示するコンパクトなウィジェット。
// 左に時間帯つきの予定タイムライン、右にその日のToDoリストを並べる。
// 連携設定・カレンダー切替・追加カレンダー・共有はすべて「カレンダー」
// 画面（月表示）側に集約したため、ここでは選択中カレンダーの1日ぶんの
// 予定確認・追加・削除と、日付に紐づくToDoの管理のみを行う
function renderGcalDailyWidget(){
  const root = document.getElementById("gcal-day-card");
  if(!root) return;
  gcalMaybeAutoReconnect();

  const prevEventsEl = root.querySelector(".gcal-day-events");
  const prevScrollTop = prevEventsEl ? prevEventsEl.scrollTop : null;
  const prevScrollKey = root.dataset.dayScrollKey || null;

  const now = new Date();
  if(gcalDailyY === null){ gcalDailyY = now.getFullYear(); gcalDailyM = now.getMonth(); gcalDailyD = now.getDate(); }
  const todayKey = newsDateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const dateKey = newsDateKey(gcalDailyY, gcalDailyM, gcalDailyD);
  const isToday = dateKey === todayKey;
  const weekday = NEWS_WEEKDAYS[new Date(gcalDailyY, gcalDailyM, gcalDailyD).getDay()];
  const dateLabel = `${gcalDailyM+1}月${gcalDailyD}日(${weekday})${isToday?"・今日":""}`;

  const todoStore = loadGcalTodoStore();
  const todos = todoStore[dateKey] || [];

  const bindShared = (root, src) => {
    root.querySelector("#gcal-day-prev").onclick = () => { gcalShiftDailyDate(-1); renderGcalDailyWidget(); };
    root.querySelector("#gcal-day-next").onclick = () => { gcalShiftDailyDate(1); renderGcalDailyWidget(); };
    const reloadBtn = root.querySelector("#gcal-day-reload");
    if(reloadBtn && !gcalDayReloading) reloadBtn.onclick = () => gcalReloadDay();
    const addBtn = root.querySelector("#gcal-day-add");
    if(addBtn) addBtn.onclick = () => gcalEnsureAuthorName(() => openGcalEventModal(src, gcalDailyY, gcalDailyM, gcalDailyD, { showList: false }));

    root.querySelectorAll("[data-todo-toggle]").forEach(cb => cb.onchange = () => {
      const s2 = loadGcalTodoStore();
      const item = (s2[dateKey] || []).find(t => t.id === cb.dataset.todoToggle);
      if(item) item.done = cb.checked;
      saveGcalTodoStore(s2);
      // 🏠 今日のタスク完了→まるチャピにXP/コイン（同じタスクIDは1日1回だけ。
      // チェックを外して付け直しても重複付与されない）
      if(cb.checked && dateKey === todayKey && item) chappyOnTaskCompleted(dateKey, item.id);
      renderGcalDailyWidget();
    });
    root.querySelectorAll("[data-todo-del]").forEach(btn => btn.onclick = () => {
      if(!confirm("このタスクを削除しますか？")) return;
      const s2 = loadGcalTodoStore();
      s2[dateKey] = (s2[dateKey] || []).filter(t => t.id !== btn.dataset.todoDel);
      saveGcalTodoStore(s2);
      renderGcalDailyWidget();
    });
    const todoInput = root.querySelector("#gcal-todo-input");
    const addTodo = () => {
      const text = (todoInput.value||"").trim();
      if(!text) return;
      const s2 = loadGcalTodoStore();
      if(!s2[dateKey]) s2[dateKey] = [];
      s2[dateKey].push({ id: gcalGenId("t"), text, done: false });
      saveGcalTodoStore(s2);
      renderGcalDailyWidget();
    };
    root.querySelector("#gcal-todo-add").onclick = addTodo;
    todoInput.onkeydown = (e) => { if(e.key === "Enter") addTodo(); };
  };

  const shellHTML = (eventsHTML) => `
    <div class="gcal-box gcal-day-box">
      <div class="gcal-day-head">
        <button type="button" class="gcal-nav-btn" id="gcal-day-prev" aria-label="前の日">‹</button>
        <div class="gcal-day-title">${esc(dateLabel)}</div>
        <div class="gcal-day-head-right">
          <button type="button" class="gcal-reload-btn${gcalDayReloading?" spinning":""}" id="gcal-day-reload" aria-label="変更を反映（最新の予定を再取得）" title="変更を反映"${gcalDayReloading?" disabled":""}>⟲</button>
          <button type="button" class="gcal-nav-btn" id="gcal-day-next" aria-label="次の日">›</button>
        </div>
      </div>
      <div class="gcal-day-body">
        <div class="gcal-day-timeline">
          <div class="gcal-day-events">${eventsHTML}</div>
          <button type="button" class="gcal-day-add-btn" id="gcal-day-add">＋ 予定を追加</button>
        </div>
        <div class="gcal-day-todo">
          <div class="gcal-day-todo-title">本日のタスク</div>
          <div class="gcal-day-todo-list">${gcalTodoListHTML(todos)}</div>
          <div class="gcal-day-todo-form">
            <input type="text" id="gcal-todo-input" class="gcal-todo-input" placeholder="タスク" maxlength="60">
            <button type="button" id="gcal-todo-add" class="gcal-todo-add-btn" aria-label="タスクを追加">＋</button>
          </div>
        </div>
      </div>
    </div>`;

  if(gcalGoogleAccessToken){
    if(gcalGoogleCalendars === null){
      root.innerHTML = `<div class="gcal-box gcal-day-box"><div class="gcal-google-loading">読み込み中…</div></div>`;
      gcalRefreshGoogleCalendars();
      return;
    }
    if(!gcalGoogleCalendars.length){
      root.innerHTML = `<div class="gcal-box gcal-day-box"><div class="gcal-google-loading">連携できるカレンダーが見つかりませんでした。</div></div>`;
      return;
    }
    let activeId = null;
    try{ activeId = localStorage.getItem(gcalStorageKey(GCAL_GOOGLE_ACTIVE_KEY)); }catch(e){}
    const active = gcalGoogleCalendars.find(c => c.id === activeId) || gcalGoogleCalendars[0];
    const cacheKey = gcalDayCacheKey(dateKey);
    const evMap = gcalGoogleDayEventsCache[cacheKey];

    // 予定の新規追加は「アクティブなカレンダー」（カレンダー画面のスイッチャー
    // で選んだ1つ）へ行うが、表示は連携中の全カレンダー（他アカウントから
    // 共有されたサブカレンダーを含む）ぶんの予定をまとめて出す
    const src = {
      mode: "google", calId: active.id, color: active.color, name: active.name,
      getEventsMap: () => gcalGoogleDayEventsCache[cacheKey] || {},
      refresh: () => gcalRefreshGoogleDayEvents(gcalDailyY, gcalDailyM, gcalDailyD),
    };

    root.innerHTML = shellHTML(evMap ? gcalDayEventsListHTML(evMap[dateKey] || [], gcalLoadAuthorName() || getProfileName() || active.name) : `<div class="gcal-google-loading">予定を読み込み中…</div>`);
    bindShared(root, src);
    gcalBindNameEditHeadings(root, renderGcalDailyWidget);
    gcalApplyMarquee(root);
    const googleScrollKey = `g|${dateKey}`;
    gcalSetupDayEventsScroll(root, googleScrollKey, gcalDailyY, gcalDailyM, gcalDailyD, now, prevScrollKey, prevScrollTop);
    root.dataset.dayScrollKey = googleScrollKey;
    if(!evMap){
      gcalRefreshGoogleDayEvents(gcalDailyY, gcalDailyM, gcalDailyD);
    } else {
      root.querySelectorAll("[data-del]").forEach(btn => btn.onclick = async () => {
        if(!confirm("この予定を削除しますか？")) return;
        const targetEv = (evMap[dateKey] || []).find(ev => ev.id === btn.dataset.del);
        const evTitle = targetEv ? targetEv.title : "予定";
        try{
          await gcalDeleteGoogleEvent(btn.dataset.cal || active.id, btn.dataset.del);
          await src.refresh();
          notifyScheduleDeleted(gcalActorName(), evTitle);
        }catch(e){
          gcalGoogleError = "削除に失敗しました。もう一度お試しください。";
          renderGcalDailyWidget();
        }
      });
    }
    return;
  }

  // ---------------- ローカル（デモ）モード ----------------
  const store = loadGcalStore();
  const active = store.calendars.find(c => c.id === store.activeId) || store.calendars[0];
  const events = (store.events[active.id] && store.events[active.id][dateKey]) || [];
  const src = {
    mode: "local", calId: active.id, color: active.color, name: active.name,
    getEventsMap: () => (loadGcalStore().events[active.id] || {}),
    refresh: () => renderGcalDailyWidget(),
  };

  root.innerHTML = shellHTML(gcalDayEventsListHTML(events, gcalLoadAuthorName() || getProfileName() || active.name));
  bindShared(root, src);
  gcalBindNameEditHeadings(root, renderGcalDailyWidget);
  gcalApplyMarquee(root);
  const localScrollKey = `l|${active.id}|${dateKey}`;
  gcalSetupDayEventsScroll(root, localScrollKey, gcalDailyY, gcalDailyM, gcalDailyD, now, prevScrollKey, prevScrollTop);
  root.dataset.dayScrollKey = localScrollKey;
  root.querySelectorAll("[data-del]").forEach(btn => btn.onclick = () => {
    if(!confirm("この予定を削除しますか？")) return;
    const s2 = loadGcalStore();
    const targetEv = ((s2.events[active.id] && s2.events[active.id][dateKey]) || []).find(ev => ev.id === btn.dataset.del);
    const evTitle = targetEv ? targetEv.title : "予定";
    if(s2.events[active.id] && s2.events[active.id][dateKey]){
      s2.events[active.id][dateKey] = s2.events[active.id][dateKey].filter(ev => ev.id !== btn.dataset.del);
      saveGcalStore(s2);
      const delActorName = gcalActorName();
      notifyScheduleDeleted(delActorName, evTitle);
      gcalNotifyCalendarMembers(active.id, "delete", { authorName: delActorName, title: evTitle });
    }
    renderGcalDailyWidget();
  });
}

// 「カレンダー」画面：月グリッドの真下に置く、選択中の日の予定一覧＋
// 追加フォーム。予定の確認・追加・削除はここで完結し、モーダルは開かない
function gcalSelectedDaySectionHTML(y, m, d, events, fallback){
  const weekday = NEWS_WEEKDAYS[new Date(y, m, d).getDay()];
  const now = new Date();
  const isToday = newsDateKey(y, m, d) === newsDateKey(now.getFullYear(), now.getMonth(), now.getDate());
  return `
    <div class="gcal-selday-section">
      <div class="gcal-selday-title">${m+1}月${d}日(${weekday})${isToday?"・今日":""}の予定</div>
      ${gcalSelDayError ? `<div class="gcal-google-error">${esc(gcalSelDayError)}</div>` : ""}
      <div class="gcal-day-events gcal-selday-events">${gcalDayEventsListHTML(events, fallback)}</div>
      <div class="gcal-ev-form">
        <input type="text" class="gcal-ev-input" id="gcal-selday-input" placeholder="予定を入力（過去の予定から候補を検索）" autocomplete="off"${gcalSelDayBusy?" disabled":""}>
      </div>
      <div class="gcal-suggest" id="gcal-selday-suggest"></div>
      <div class="gcal-ev-time-row">
        <input type="time" class="gcal-ev-time-input" id="gcal-selday-start" aria-label="開始時刻"${gcalSelDayBusy?" disabled":""}>
        <span class="gcal-ev-time-sep">〜</span>
        <input type="time" class="gcal-ev-time-input" id="gcal-selday-end" aria-label="終了時刻"${gcalSelDayBusy?" disabled":""}>
        <button type="button" class="gcal-ev-add-btn" id="gcal-selday-add"${gcalSelDayBusy?" disabled":""}>追加</button>
      </div>
    </div>`;
}

// 予定入力欄の「過去の予定から引用」サジェスト用の候補プールを作る。
// 履歴全体をAPIへ毎回問い合わせるのは重いため、ローカル（デモ）カレンダー
// に保存済みの予定と、このセッション中に既に画面表示のため取得済みの
// Googleカレンダーの予定（キャッシュ済み分のみ）を対象にした軽量な実装。
// 共有カレンダー経由で見えている他ユーザーの予定が紛れ込まないよう、
// gcalIsOwnEvent()で「今この予定を登録しようとしている本人」自身の
// 過去の予定だけに絞り込む
function gcalSuggestPool(){
  const seen = new Map();
  const add = (title, start, end) => {
    const t = (title || "").trim();
    if(!t) return;
    const key = `${t}|${start||""}|${end||""}`;
    if(!seen.has(key)) seen.set(key, { title: t, start: start||"", end: end||"" });
  };
  const store = loadGcalStore();
  Object.values(store.events || {}).forEach(byDate => {
    Object.values(byDate || {}).forEach(list => (list||[]).forEach(ev => { if(gcalIsOwnEvent(ev)) add(ev.title, ev.start, ev.end); }));
  });
  [gcalGoogleEventsCache, gcalGoogleDayEventsCache].forEach(cache => {
    Object.values(cache).forEach(byDate => {
      Object.values(byDate || {}).forEach(list => (list||[]).forEach(ev => { if(gcalIsOwnEvent(ev)) add(ev.title, ev.start, ev.end); }));
    });
  });
  return [...seen.values()];
}

// タイトル入力欄(input)・開始/終了時刻入力欄(startInput/endInput)・候補を
// 表示するコンテナ(box)を受け取り、入力のたびに過去の予定タイトルを部分
// 一致（前方一致を含む）で絞り込んで表示する。候補をクリックするとタイトル
// ・開始・終了時刻を入力欄へ自動補完する。入力が空のときは何も表示しない
function gcalBindSuggest(input, box, startInput, endInput){
  if(!input || !box) return;
  const hide = () => { box.innerHTML = ""; box.classList.remove("open"); };
  input.oninput = () => {
    const q = input.value.trim();
    if(!q){ hide(); return; }
    const matches = gcalSuggestPool().filter(p => p.title.includes(q)).slice(0, 5);
    if(!matches.length){ hide(); return; }
    box.innerHTML = matches.map((m, i) => `
      <button type="button" class="gcal-suggest-item" data-si="${i}">
        <span class="gcal-suggest-title">${esc(m.title)}</span>
        <span class="gcal-suggest-time">${m.start ? (m.end ? `${esc(m.start)}〜${esc(m.end)}` : esc(m.start)) : "終日"}</span>
      </button>`).join("");
    box.classList.add("open");
    box.querySelectorAll("[data-si]").forEach(btn => btn.onclick = () => {
      const m = matches[parseInt(btn.dataset.si, 10)];
      input.value = m.title;
      if(startInput) startInput.value = m.start || "";
      if(endInput) endInput.value = m.end || "";
      hide();
      input.focus();
    });
  };
  // 候補クリック(mousedown→click)より先にblurでhide()してしまうと選択が
  // 反映されないため、クリック処理が先に走るよう一呼吸遅らせて閉じる
  input.onblur = () => { setTimeout(hide, 150); };
}

// src.mode==="google"なら本物のGoogle Calendar APIを、"local"ならlocalStorage
// のデモ用データを読み書きする。処理後は毎回renderGcalMonthCard()で画面
// 全体を再描画し直すことで、グリッドの●印・一覧の両方を最新状態に保つ
function gcalBindSelectedDaySection(root, src, y, m, d){
  const dateKey = newsDateKey(y, m, d);

  gcalBindNameEditHeadings(root, renderGcalMonthCard);

  root.querySelectorAll(".gcal-selday-events [data-del]").forEach(btn => btn.onclick = async () => {
    if(gcalSelDayBusy) return;
    const evId = btn.dataset.del;
    const targetEv = (src.getEventsMap()[dateKey] || []).find(ev => ev.id === evId);
    const evTitle = targetEv ? targetEv.title : "予定";
    if(src.mode === "google"){
      gcalSelDayBusy = true; gcalSelDayError = null; renderGcalMonthCard();
      try{
        // 一覧には複数カレンダー（共有カレンダーを含む）の予定が混在するため、
        // 削除は各予定が実際に属するカレンダー（data-cal）を優先して使う
        await gcalDeleteGoogleEvent(btn.dataset.cal || src.calId, evId);
        await src.refresh();
        notifyScheduleDeleted(gcalActorName(), evTitle);
      }catch(e){
        gcalSelDayError = "削除に失敗しました。もう一度お試しください。";
      }
      gcalSelDayBusy = false; renderGcalMonthCard();
      return;
    }
    const s2 = loadGcalStore();
    if(s2.events[src.calId] && s2.events[src.calId][dateKey]){
      s2.events[src.calId][dateKey] = s2.events[src.calId][dateKey].filter(ev => ev.id !== evId);
      saveGcalStore(s2);
      const delActorName = gcalActorName();
      notifyScheduleDeleted(delActorName, evTitle);
      gcalNotifyCalendarMembers(src.calId, "delete", { authorName: delActorName, title: evTitle });
    }
    src.refresh();
    renderGcalMonthCard();
  });

  const input = root.querySelector("#gcal-selday-input");
  const startInput = root.querySelector("#gcal-selday-start");
  const endInput = root.querySelector("#gcal-selday-end");
  gcalBindSuggest(input, root.querySelector("#gcal-selday-suggest"), startInput, endInput);
  const submit = async () => {
    if(gcalSelDayBusy) return;
    const title = (input.value||"").trim();
    if(!title){ input.focus(); return; }
    const start = startInput.value || "";
    const end = endInput.value || "";
    if(start && end && end <= start){ gcalSelDayError = "終了時刻は開始時刻より後にしてください。"; renderGcalMonthCard(); return; }
    if(src.mode === "google"){
      gcalSelDayBusy = true; gcalSelDayError = null; renderGcalMonthCard();
      try{
        await gcalCreateGoogleEvent(src.calId, y, m, d, title, start, end);
        await src.refresh();
        gcalSelDayBusy = false; renderGcalMonthCard();
        notifyScheduleCreated(gcalActorName(), title, gcalWhenLabel(y, m, d, start, end));
      }catch(e){
        gcalSelDayBusy = false; gcalSelDayError = "追加に失敗しました。もう一度お試しください。"; renderGcalMonthCard();
      }
      return;
    }
    const author = gcalLoadAuthorName();
    const s2 = loadGcalStore();
    if(!s2.events[src.calId]) s2.events[src.calId] = {};
    if(!s2.events[src.calId][dateKey]) s2.events[src.calId][dateKey] = [];
    s2.events[src.calId][dateKey].push({ id: gcalGenId("e"), title, start, end, author });
    saveGcalStore(s2);
    gcalSelDayError = null;
    src.refresh();
    renderGcalMonthCard();
    const addActorName = gcalActorName();
    notifyScheduleCreated(addActorName, title, gcalWhenLabel(y, m, d, start, end));
    gcalNotifyCalendarMembers(src.calId, "create", { authorName: addActorName, title, whenLabel: gcalWhenLabel(y, m, d, start, end) });
    notifyScheduleCreated(gcalActorName(), title, gcalWhenLabel(y, m, d, start, end));
  };
  root.querySelector("#gcal-selday-add").onclick = submit;
  if(!gcalSelDayBusy){
    input.onkeydown = (e) => { if(e.key === "Enter") submit(); };
  }
}

// 「変更を反映」ボタン：カレンダー画面が表示中の月ぶんの予定を、
// キャッシュを使わず裏から取り直して画面に反映する。Google連携中のみ
// 実際のAPI再取得を行い、未連携（ローカルのデモモード）のときは
// localStorageの最新状態を読み直すだけの軽い再描画になる
async function gcalReloadMonth(){
  if(gcalMonthReloading) return;
  gcalMonthReloading = true;
  renderGcalMonthCard();
  if(gcalGoogleAccessToken){
    await gcalRefreshGoogleEvents(gcalViewY, gcalViewM);
  }
  gcalMonthReloading = false;
  renderGcalMonthCard();
}

// 「カレンダー」画面の中身を描画し直す（画面単体の更新用。カレンダー
// 切り替え・月移動・予定の増減・Google連携状態の変化のたびに呼ぶ）。
// Google連携済みなら本物のGoogleカレンダーのデータを表示し、未連携なら
// 従来通りローカル保存のデモ用カレンダーにフォールバックする
function renderGcalMonthCard(){
  const root = document.getElementById("gcal-month-card");
  if(!root) return;
  const now = new Date();
  if(gcalViewY === null){ gcalViewY = now.getFullYear(); gcalViewM = now.getMonth(); }
  const todayKey = newsDateKey(now.getFullYear(), now.getMonth(), now.getDate());
  if(gcalSelectedDay === null && gcalViewY === now.getFullYear() && gcalViewM === now.getMonth()){
    gcalSelectedDay = now.getDate();
  }
  if(gcalSelectedDay !== null){
    const daysInViewMonth = new Date(gcalViewY, gcalViewM+1, 0).getDate();
    if(gcalSelectedDay > daysInViewMonth) gcalSelectedDay = daysInViewMonth;
  }
  gcalMaybeAutoReconnect();

  const errorHTML = gcalGoogleError ? `<div class="gcal-google-error">${esc(gcalGoogleError)}</div>` : "";

  if(gcalGoogleAccessToken){
    // ---------------- Google連携モード ----------------
    if(gcalGoogleCalendars === null){
      root.innerHTML = `
        <div class="gcal-box">
          ${gcalConnectBarHTML()}
          ${errorHTML}
          <div class="gcal-google-loading">カレンダー一覧を読み込み中…</div>
        </div>`;
      gcalBindConnectBar(root);
      gcalRefreshGoogleCalendars();
      return;
    }
    if(!gcalGoogleCalendars.length){
      root.innerHTML = `
        <div class="gcal-box">
          ${gcalConnectBarHTML()}
          ${errorHTML}
          <div class="gcal-google-loading">書き込み可能なカレンダーが見つかりませんでした。</div>
        </div>`;
      gcalBindConnectBar(root);
      return;
    }

    let activeId = null;
    try{ activeId = localStorage.getItem(gcalStorageKey(GCAL_GOOGLE_ACTIVE_KEY)); }catch(e){}
    const active = gcalGoogleCalendars.find(c => c.id === activeId) || gcalGoogleCalendars[0];

    const switcherHTML = gcalGoogleCalendars.map(c => {
      const isActive = c.id === active.id;
      return `
        <div class="gcal-chip-wrap${isActive?" active":""}">
          <button type="button" class="gcal-chip${isActive?" active":""}" data-gcal="${esc(c.id)}" style="--chip-color:${esc(c.color)}">
            <span class="gcal-chip-dot"></span>${esc(c.name)}
          </button>
          <button type="button" class="gcal-rename-btn" data-rename="${esc(c.id)}" aria-label="${esc(c.name)}の表示名を変更" title="表示名を変更">✎</button>
        </div>`;
    }).join("");

    // スイッチャーで選んだカレンダーが「アクティブなカレンダー」となり、
    // 新しい予定の追加先になるだけでなく、グリッドの●印・下の予定一覧も
    // そのカレンダー単体の予定だけに絞り込む（＝カレンダーの切替）。
    // 取得自体は連携中の全カレンダー（共有カレンダーを含む）ぶんを一度に
    // まとめて行い、切替のたびに再取得しなくて済むようキャッシュ済みの
    // マージ済みマップからクライアント側でカレンダーIDによる絞り込みを行う
    const evKey = gcalEventsCacheKey(gcalViewY, gcalViewM);
    const evMerged = gcalGoogleEventsCache[evKey];
    const evActive = evMerged ? gcalFilterMapByCal(evMerged, active.id) : null;

    root.innerHTML = `
      <div class="gcal-box">
        ${gcalConnectBarHTML()}
        ${errorHTML}
        <div class="gcal-switcher">${switcherHTML}</div>
        <div class="gcal-cal-head">
          <button type="button" class="gcal-nav-btn" id="gcal-prev" aria-label="前の月">‹</button>
          <div class="gcal-cal-title">${gcalViewY}年${gcalViewM+1}月</div>
          <div class="gcal-cal-head-right">
            <button type="button" class="gcal-reload-btn${gcalMonthReloading?" spinning":""}" id="gcal-month-reload" aria-label="変更を反映（最新の予定を再取得）" title="変更を反映"${gcalMonthReloading?" disabled":""}>⟲</button>
            <button type="button" class="gcal-nav-btn" id="gcal-next" aria-label="次の月">›</button>
          </div>
        </div>
        <div class="gcal-grid-wrap">
          <div class="gcal-grid gcal-weekdays">${NEWS_WEEKDAYS.map(w=>`<span class="gcal-wd-cell">${w}</span>`).join("")}</div>
          <div class="gcal-grid">${evActive ? gcalDayCellsHTML(gcalViewY, gcalViewM, evActive, todayKey, active.color, gcalSelectedDay) : ""}</div>
        </div>
        ${evActive ? "" : `<div class="gcal-google-loading">予定を読み込み中…</div>`}
        ${evActive && gcalSelectedDay !== null ? gcalSelectedDaySectionHTML(gcalViewY, gcalViewM, gcalSelectedDay, evActive[newsDateKey(gcalViewY, gcalViewM, gcalSelectedDay)] || [], gcalLoadAuthorName() || getProfileName() || active.name) : ""}
        <div class="gcal-google-note">カレンダーの追加・共有設定は<a href="https://calendar.google.com/" target="_blank" rel="noopener noreferrer">Googleカレンダー</a>側で行ってください。</div>
      </div>`;

    gcalBindConnectBar(root);
    const monthReloadBtn = root.querySelector("#gcal-month-reload");
    if(monthReloadBtn && !gcalMonthReloading) monthReloadBtn.onclick = () => gcalReloadMonth();
    root.querySelectorAll("[data-gcal]").forEach(b => b.onclick = () => {
      try{ localStorage.setItem(gcalStorageKey(GCAL_GOOGLE_ACTIVE_KEY), b.dataset.gcal); }catch(e){}
      gcalSelDayError = null;
      renderGcalMonthCard();
    });
    root.querySelectorAll("[data-rename]").forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      openGcalRenameCalendarModal(b.dataset.rename);
    });
    root.querySelector("#gcal-prev").onclick = () => { gcalViewM--; if(gcalViewM<0){ gcalViewM=11; gcalViewY--; } gcalSelDayError = null; renderGcalMonthCard(); };
    root.querySelector("#gcal-next").onclick = () => { gcalViewM++; if(gcalViewM>11){ gcalViewM=0; gcalViewY++; } gcalSelDayError = null; renderGcalMonthCard(); };

    if(!evMerged){
      gcalRefreshGoogleEvents(gcalViewY, gcalViewM);
    } else {
      root.querySelectorAll("[data-gday]").forEach(b => b.onclick = () => {
        gcalEnsureAuthorName(() => {
          gcalSelectedDay = parseInt(b.dataset.gday, 10);
          gcalSelDayError = null;
          renderGcalMonthCard();
        });
      });
      if(gcalSelectedDay !== null){
        gcalBindSelectedDaySection(root, {
          mode: "google", calId: active.id, color: active.color, name: active.name,
          getEventsMap: () => gcalFilterMapByCal(gcalGoogleEventsCache[evKey] || {}, active.id),
          refresh: () => gcalRefreshGoogleEvents(gcalViewY, gcalViewM),
        }, gcalViewY, gcalViewM, gcalSelectedDay);
        gcalApplyMarquee(root);
      }
    }
    return;
  }

  // ---------------- ローカル（デモ）モード ----------------
  const store = loadGcalStore();
  const active = store.calendars.find(c => c.id === store.activeId) || store.calendars[0];
  const evOfActive = store.events[active.id] || {};

  const switcherHTML = store.calendars.map(c => {
    const isActive = c.id === store.activeId;
    return `
      <div class="gcal-chip-wrap${isActive?" active":""}">
        <button type="button" class="gcal-chip${isActive?" active":""}" data-cal="${esc(c.id)}" style="--chip-color:${esc(c.color)}">
          <span class="gcal-chip-dot"></span>${esc(c.name)}
        </button>
        <button type="button" class="gcal-share-btn" data-share="${esc(c.id)}" aria-label="${esc(c.name)}の共有ユーザー設定" title="共有ユーザー設定">👥</button>
      </div>`;
  }).join("") + `<button type="button" class="gcal-add-cal-btn" id="gcal-add-cal" aria-label="カレンダーを追加" title="カレンダーを追加">＋</button>`;

  root.innerHTML = `
    <div class="gcal-box">
      ${gcalConnectBarHTML()}
      ${errorHTML}
      <div class="gcal-switcher">${switcherHTML}</div>
      <div class="gcal-cal-head">
        <button type="button" class="gcal-nav-btn" id="gcal-prev" aria-label="前の月">‹</button>
        <div class="gcal-cal-title">${gcalViewY}年${gcalViewM+1}月</div>
        <div class="gcal-cal-head-right">
          <button type="button" class="gcal-reload-btn${gcalMonthReloading?" spinning":""}" id="gcal-month-reload" aria-label="変更を反映（最新の予定を再取得）" title="変更を反映"${gcalMonthReloading?" disabled":""}>⟲</button>
          <button type="button" class="gcal-nav-btn" id="gcal-next" aria-label="次の月">›</button>
        </div>
      </div>
      <div class="gcal-grid-wrap">
        <div class="gcal-grid gcal-weekdays">${NEWS_WEEKDAYS.map(w=>`<span class="gcal-wd-cell">${w}</span>`).join("")}</div>
        <div class="gcal-grid">${gcalDayCellsHTML(gcalViewY, gcalViewM, evOfActive, todayKey, active.color, gcalSelectedDay)}</div>
      </div>
      ${gcalSelectedDay !== null ? gcalSelectedDaySectionHTML(gcalViewY, gcalViewM, gcalSelectedDay, evOfActive[newsDateKey(gcalViewY, gcalViewM, gcalSelectedDay)] || [], gcalLoadAuthorName() || getProfileName() || active.name) : ""}
    </div>`;

  gcalBindConnectBar(root);
  const monthReloadBtnLocal = root.querySelector("#gcal-month-reload");
  if(monthReloadBtnLocal && !gcalMonthReloading) monthReloadBtnLocal.onclick = () => gcalReloadMonth();
  root.querySelectorAll("[data-cal]").forEach(b => b.onclick = () => {
    const s2 = loadGcalStore();
    s2.activeId = b.dataset.cal;
    saveGcalStore(s2);
    gcalSelDayError = null;
    renderGcalMonthCard();
  });
  root.querySelectorAll("[data-share]").forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    openGcalShareModal(b.dataset.share);
  });
  const addCalBtn = root.querySelector("#gcal-add-cal");
  if(addCalBtn) addCalBtn.onclick = () => openGcalAddCalendarModal();
  root.querySelector("#gcal-prev").onclick = () => {
    gcalViewM--; if(gcalViewM<0){ gcalViewM=11; gcalViewY--; }
    gcalSelDayError = null;
    renderGcalMonthCard();
  };
  root.querySelector("#gcal-next").onclick = () => {
    gcalViewM++; if(gcalViewM>11){ gcalViewM=0; gcalViewY++; }
    gcalSelDayError = null;
    renderGcalMonthCard();
  };
  root.querySelectorAll("[data-gday]").forEach(b => b.onclick = () => {
    gcalEnsureAuthorName(() => {
      gcalSelectedDay = parseInt(b.dataset.gday, 10);
      gcalSelDayError = null;
      renderGcalMonthCard();
    });
  });
  if(gcalSelectedDay !== null){
    gcalBindSelectedDaySection(root, {
      mode: "local", calId: active.id, color: active.color, name: active.name,
      getEventsMap: () => (loadGcalStore().events[active.id] || {}),
      refresh: () => renderGcalMonthCard(),
    }, gcalViewY, gcalViewM, gcalSelectedDay);
    gcalApplyMarquee(root);
  }
}

// 日付セルタップで開く、その日の予定の確認・追加・削除ポップアップ。
// src.mode==="google" なら本物のGoogle Calendar APIを、"local" なら
// 従来通りlocalStorageのデモ用データを読み書きする
// 日付セルタップで開く、その日の予定の確認・追加・削除ポップアップ。
// src.mode==="google" なら本物のGoogle Calendar APIを、"local" なら
// 従来通りlocalStorageのデモ用データを読み書きする。src.getEventsMap()は
// 呼び出し元（週ウィジェット／月カード）が持つ最新のイベントmapを返す
// 関数、src.refresh()は追加・削除後にそのmapを更新して呼び出し元の
// 表示を再描画する関数 —— この2つを差し替えるだけで、同じモーダルを
// 週表示・月表示のどちらからでも共通して使える
// 日付タップ・「＋予定を追加」で開く、その日の予定の確認・追加・削除
// ポップアップ。src.mode==="google"なら本物のGoogle Calendar APIを、
// "local"なら従来通りlocalStorageのデモ用データを読み書きする。
// opts.showList=falseの場合は既存の予定一覧を省略し、追加フォームのみの
// 軽量なポップアップになる（ホーム画面の「＋予定を追加」ボタン用。
// 一覧はホーム側に既にタイムライン表示されているため重複を避ける）
function openGcalEventModal(src, y, m, d, opts){
  const showList = !opts || opts.showList !== false;
  const dateKey = newsDateKey(y, m, d);
  const ov = document.createElement("div");
  ov.className = "modal-ov";
  const close = () => { try{ ov.remove(); }catch(e){} };
  let busy = false;

  const getEvents = () => src.getEventsMap()[dateKey] || [];

  const draw = (msg) => {
    const events = showList ? getEvents() : [];
    ov.innerHTML = `
      <div class="modal">
        <div class="modal-title" style="color:var(--text)">📅 ${m+1}月${d}日の予定</div>
        <div class="gcal-modal-sub">${esc(src.name)}</div>
        ${msg ? `<div class="gcal-google-error">${esc(msg)}</div>` : ""}
        ${showList ? `<div class="gcal-ev-list">
          ${events.length ? events.map(ev => `
            <div class="gcal-ev-item">
              <div class="gcal-ev-time">${ev.start ? `${esc(ev.start)}${ev.end?`〜${esc(ev.end)}`:""}` : "終日"}</div>
              <div class="gcal-ev-main">${ev.author?`<span class="gcal-ev-author">(${esc(ev.author)})</span> `:""}<span class="gcal-ev-title">${esc(ev.title)}</span></div>
              <button type="button" class="gcal-ev-del" data-del="${esc(ev.id)}" aria-label="この予定を削除"${busy?" disabled":""}>×</button>
            </div>`).join("") : `<div class="gcal-ev-empty">この日の予定はまだありません。</div>`}
        </div>` : ""}
        <div class="gcal-ev-form">
          <input type="text" class="gcal-ev-input" id="gcal-ev-input" placeholder="予定を入力（過去の予定から候補を検索）" autocomplete="off"${busy?" disabled":""}>
        </div>
        <div class="gcal-suggest" id="gcal-ev-suggest"></div>
        <div class="gcal-ev-time-row">
          <input type="time" class="gcal-ev-time-input" id="gcal-ev-start" aria-label="開始時刻"${busy?" disabled":""}>
          <span class="gcal-ev-time-sep">〜</span>
          <input type="time" class="gcal-ev-time-input" id="gcal-ev-end" aria-label="終了時刻"${busy?" disabled":""}>
          <button type="button" class="gcal-ev-add-btn" id="gcal-ev-add"${busy?" disabled":""}>追加</button>
        </div>
        <button class="ghost" id="gcal-ev-close" style="margin-top:12px">閉じる</button>
      </div>`;

    ov.querySelector("#gcal-ev-close").onclick = close;
    ov.querySelectorAll("[data-del]").forEach(btn => btn.onclick = async () => {
      if(busy) return;
      const evId = btn.dataset.del;
      const targetEv = getEvents().find(ev => ev.id === evId);
      const evTitle = targetEv ? targetEv.title : "予定";
      if(src.mode === "google"){
        busy = true; draw();
        try{
          await gcalDeleteGoogleEvent(src.calId, evId);
          await src.refresh();
          busy = false; draw();
          notifyScheduleDeleted(gcalActorName(), evTitle);
        }catch(e){
          busy = false; draw("削除に失敗しました。もう一度お試しください。");
        }
        return;
      }
      const s2 = loadGcalStore();
      if(s2.events[src.calId] && s2.events[src.calId][dateKey]){
        s2.events[src.calId][dateKey] = s2.events[src.calId][dateKey].filter(ev => ev.id !== evId);
        saveGcalStore(s2);
        const delActorName = gcalActorName();
        notifyScheduleDeleted(delActorName, evTitle);
        gcalNotifyCalendarMembers(src.calId, "delete", { authorName: delActorName, title: evTitle });
      }
      src.refresh();
      draw();
    });

    const input = ov.querySelector("#gcal-ev-input");
    const startInput = ov.querySelector("#gcal-ev-start");
    const endInput = ov.querySelector("#gcal-ev-end");
    gcalBindSuggest(input, ov.querySelector("#gcal-ev-suggest"), startInput, endInput);
    const submit = async () => {
      if(busy) return;
      const title = (input.value||"").trim();
      if(!title){ input.focus(); return; }
      const start = startInput.value || "";
      const end = endInput.value || "";
      if(start && end && end <= start){ draw("終了時刻は開始時刻より後にしてください。"); return; }
      if(src.mode === "google"){
        busy = true; draw();
        try{
          await gcalCreateGoogleEvent(src.calId, y, m, d, title, start, end);
          await src.refresh();
          close(); // 登録に成功したら手動で閉じなくても自動でモーダルを閉じる
          notifyScheduleCreated(gcalActorName(), title, gcalWhenLabel(y, m, d, start, end));
        }catch(e){
          busy = false; draw("追加に失敗しました。もう一度お試しください。");
        }
        return;
      }
      const author = gcalLoadAuthorName();
      const s2 = loadGcalStore();
      if(!s2.events[src.calId]) s2.events[src.calId] = {};
      if(!s2.events[src.calId][dateKey]) s2.events[src.calId][dateKey] = [];
      s2.events[src.calId][dateKey].push({ id: gcalGenId("e"), title, start, end, author });
      saveGcalStore(s2);
      const addActorName = gcalActorName();
      notifyScheduleCreated(addActorName, title, gcalWhenLabel(y, m, d, start, end));
      gcalNotifyCalendarMembers(src.calId, "create", { authorName: addActorName, title, whenLabel: gcalWhenLabel(y, m, d, start, end) });
      src.refresh();
      close(); // 登録に成功したら手動で閉じなくても自動でモーダルを閉じる
    };
    ov.querySelector("#gcal-ev-add").onclick = submit;
    if(!busy){
      input.onkeydown = (e) => { if(e.key === "Enter") submit(); };
      input.focus();
    }
  };

  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if(e.target === ov) close(); });
  draw();
}

// カレンダー横の👥ボタンから開く、共有ユーザー（メールアドレス）の設定
// ポップアップ。ここに登録したメールアドレス宛てには、このカレンダーでの
// 予定の登録・削除が起きるたびに通知が届く（gcalNotifyCalendarMembers参照）。
// ただし予定データ自体（一覧の中身）はこの端末のローカル限定のままで、
// 相手の画面にその予定が表示されるようになるわけではない
function openGcalShareModal(calId){
  const ov = document.createElement("div");
  ov.className = "modal-ov";
  const close = () => { try{ ov.remove(); }catch(e){} };

  const draw = () => {
    const store = loadGcalStore();
    const cal = store.calendars.find(c => c.id === calId);
    if(!cal){ close(); return; }
    ov.innerHTML = `
      <div class="modal">
        <div class="modal-title" style="color:var(--text)">👥 共有ユーザー設定</div>
        <div class="gcal-modal-sub">${esc(cal.name)}</div>
        <div class="gcal-share-list">
          ${cal.shared.length ? cal.shared.map(email => `
            <span class="gcal-share-tag">${esc(email)}<button type="button" data-rm="${esc(email)}" aria-label="共有を解除">×</button></span>`).join("")
            : `<div class="gcal-share-empty">まだ共有相手はいません。</div>`}
        </div>
        <div class="gcal-ev-form">
          <input type="email" class="gcal-ev-input" id="gcal-share-input" placeholder="共有相手のメールアドレス">
          <button type="button" class="gcal-ev-add-btn" id="gcal-share-add">追加</button>
        </div>
        <div class="gcal-share-note">※ここに登録した相手が、このアプリに同じメールアドレスでログインしている場合、このカレンダーでの予定の登録・削除を通知でお知らせします（他のカレンダーの操作は届きません）。予定データそのものが相手の画面に表示されるわけではありません。</div>
        <button class="ghost" id="gcal-share-close" style="margin-top:12px">閉じる</button>
      </div>`;

    ov.querySelector("#gcal-share-close").onclick = close;
    ov.querySelectorAll("[data-rm]").forEach(btn => btn.onclick = () => {
      const s2 = loadGcalStore();
      const c2 = s2.calendars.find(c => c.id === calId);
      if(c2) c2.shared = c2.shared.filter(e => e !== btn.dataset.rm);
      saveGcalStore(s2);
      draw();
    });
    const input = ov.querySelector("#gcal-share-input");
    const submit = () => {
      const email = (input.value||"").trim();
      if(!email){ input.focus(); return; }
      const s2 = loadGcalStore();
      const c2 = s2.calendars.find(c => c.id === calId);
      if(c2 && !c2.shared.includes(email)) c2.shared.push(email);
      saveGcalStore(s2);
      draw();
    };
    ov.querySelector("#gcal-share-add").onclick = submit;
    input.onkeydown = (e) => { if(e.key === "Enter") submit(); };
  };

  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if(e.target === ov) close(); });
  draw();
}

// スイッチャー右端の＋ボタンから開く、表示カレンダーの新規追加ポップアップ
function openGcalAddCalendarModal(){
  const ov = document.createElement("div");
  ov.className = "modal-ov";
  const close = () => { try{ ov.remove(); }catch(e){} };
  let selectedColor = GCAL_COLORS[0];
  let nameValue = "";

  const draw = () => {
    ov.innerHTML = `
      <div class="modal">
        <div class="modal-title" style="color:var(--text)">📅 カレンダーを追加</div>
        <input type="text" class="gcal-ev-input gcal-newcal-input" id="gcal-newcal-name" placeholder="カレンダー名（例：家族の予定）" value="${esc(nameValue)}">
        <div class="gcal-color-row">
          ${GCAL_COLORS.map(c => `<button type="button" class="gcal-color-dot${c===selectedColor?" selected":""}" data-color="${c}" style="background:${c}" aria-label="この色を選択"></button>`).join("")}
        </div>
        <button class="cta" id="gcal-newcal-save">追加する</button>
        <button class="ghost" id="gcal-newcal-cancel" style="margin-top:8px">キャンセル</button>
      </div>`;
    const nameInput = ov.querySelector("#gcal-newcal-name");
    nameInput.oninput = () => { nameValue = nameInput.value; };
    nameInput.focus();
    ov.querySelectorAll("[data-color]").forEach(btn => btn.onclick = () => { selectedColor = btn.dataset.color; draw(); });
    ov.querySelector("#gcal-newcal-cancel").onclick = close;
    ov.querySelector("#gcal-newcal-save").onclick = () => {
      const name = (nameInput.value||"").trim();
      if(!name){ nameInput.focus(); return; }
      const store = loadGcalStore();
      const id = gcalGenId("c");
      store.calendars.push({ id, name, color: selectedColor, shared: [] });
      store.activeId = id;
      saveGcalStore(store);
      close();
      renderGcalMonthCard();
    };
  };

  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if(e.target === ov) close(); });
  draw();
}

// スイッチャーの✎ボタンから開く、Googleカレンダーの表示名をこのアプリ内
// だけ好きな名前に変更するポップアップ。Google側の実際のカレンダー名
// （プライマリカレンダーならGmailアドレス）は変更せず、表示だけを上書きする
function openGcalRenameCalendarModal(calId){
  const cal = (gcalGoogleCalendars || []).find(c => c.id === calId);
  if(!cal) return;
  const ov = document.createElement("div");
  ov.className = "modal-ov";
  const close = () => { try{ ov.remove(); }catch(e){} };

  ov.innerHTML = `
    <div class="modal">
      <div class="modal-title" style="color:var(--text)">✎ 表示名を変更</div>
      <div class="gcal-modal-sub">${esc(cal.name)}</div>
      <input type="text" class="gcal-ev-input gcal-newcal-input" id="gcal-rename-input" placeholder="表示名（例：自分の予定）" maxlength="40" value="${esc(cal.name)}">
      <button class="cta" id="gcal-rename-save">保存する</button>
      <button class="ghost" id="gcal-rename-cancel" style="margin-top:8px">キャンセル</button>
    </div>`;

  const input = ov.querySelector("#gcal-rename-input");
  ov.querySelector("#gcal-rename-cancel").onclick = close;
  ov.querySelector("#gcal-rename-save").onclick = () => {
    const name = (input.value||"").trim();
    if(!name){ input.focus(); return; }
    gcalSaveCalNameOverride(calId, name);
    cal.name = name;
    cal.renamed = true;
    close();
    renderGcalMonthCard();
  };

  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if(e.target === ov) close(); });
  input.focus();
  input.select();
}

/* =========================================================================
   🔔 通知エンジン（予定登録／削除・5分前リマインダー・朝7時のデイリーサマリー）
   ・登録／削除の通知は、各操作の成功直後にnotifyScheduleCreated/Deleted()を
     呼ぶ形（このファイル内の各create/delete処理を参照）。
   ・5分前リマインダーと朝7時サマリーはサーバー側のスケジューラを持たない
     ため、アプリが開いている間だけ動くポーリング（setInterval）で判定する
     フロントエンド完結の実装（モック）。判定結果はjs/notifications.jsの
     トースト＋ブラウザローカル通知として表示する。
   ========================================================================= */

// 予定を「今まさに操作している本人」の呼び名。予定に手動入力する登録者名
// (gcalLoadAuthorName)を優先し、無ければアプリのプロフィール名にフォールバックする
function gcalActorName(){
  return gcalLoadAuthorName() || getProfileName() || "ゲスト";
}

function gcalWhenLabel(y, m, d, start, end){
  return `${m + 1}月${d}日 ${start ? `${start}${end ? `〜${end}` : ""}` : "終日"}`;
}

/* ---- カレンダーに紐づくユーザーだけへの通知配信（ローカル／デモカレンダー限定） ----
   ローカル（デモ）カレンダーは「共有ユーザー設定」（openGcalShareModal）で
   紐づけたメールアドレスの一覧を持っている。予定の登録・削除が起きたとき、
   このカレンダーに紐づくメールアドレス宛てにだけFirestore経由で通知を配る
   （＝Aだけのカレンダーの操作はB・Cには届かず、A・Bで共有しているカレンダー
   の操作はA・Bにだけ届き、Cには届かない）。宛先はwindow.CalNotify.send()で
   Firestoreの受信箱に積み、宛先本人が（別端末で）ログイン中なら
   gcalStartNotifyListener()のリアルタイム購読で受け取ってトースト表示する。
   Google連携カレンダーは、実際の共有相手をアプリ側から特定できないため対象外
   （操作した本人のトーストのみ。Google Calendar自体の通知に委ねる） */
function gcalCalendarById(calId){
  const store = loadGcalStore();
  return store.calendars.find(c => c.id === calId) || null;
}

function gcalNotifyCalendarMembers(calId, kind, payload){
  if(!window.CalNotify || !state.currentUserId || state.guestMode) return;
  const cal = gcalCalendarById(calId);
  if(!cal || !Array.isArray(cal.shared) || !cal.shared.length) return;
  const selfEmail = ((state.currentUser && state.currentUser.email) || "").trim().toLowerCase();
  const seen = new Set();
  cal.shared.forEach(raw => {
    const email = (raw || "").trim().toLowerCase();
    if(!email || email === selfEmail || seen.has(email)) return;
    seen.add(email);
    try{ window.CalNotify.send(email, Object.assign({ kind }, payload)); }catch(e){}
  });
}

// 自分宛て（ログイン中のメールアドレス宛て）の通知受信箱をリアルタイム購読する。
// db.jsのonAuthStateChangedから、ログイン時に開始・ログアウト時に停止する
let gcalNotifyUnsub = null;
export function gcalStartNotifyListener(email){
  gcalStopNotifyListener();
  if(!window.CalNotify || !email) return;
  gcalNotifyUnsub = window.CalNotify.listen(email, (item) => {
    if(!item) return;
    if(item.kind === "create") notifyScheduleCreated(item.authorName, item.title, item.whenLabel);
    else if(item.kind === "delete") notifyScheduleDeleted(item.authorName, item.title);
  });
}
export function gcalStopNotifyListener(){
  if(gcalNotifyUnsub){ try{ gcalNotifyUnsub(); }catch(e){} gcalNotifyUnsub = null; }
}

// 朝7時のデイリーサマリー用の「今日の予定」。予定は新しい予定機能
// （js/schedule/）のローカルストアが一次情報源になったので、Google連携の
// 有無に関わらずそちらから取り出す（オフラインでも正しく集計できる）
function gcalCollectTodayEvents(){
  return todayOccurrences().map(occ => ({ id: occ.key, title: occ.title, start: occ.start, end: occ.end }));
}

// 開始前のリマインダーは、予定ごとに「○分前／○時間前／前日○時」を自由に
// 設定できる新しい通知エンジン（js/schedule/reminders.js）が担当する。
// ここでは以前の「一律5分前」の判定は行わない（二重通知になるため）。

// 朝7時のデイリーサマリー：日付が変わって初めて7:00を過ぎたタイミングで
// 一度だけ発火する。アプリを開いていない状態で7:00を過ぎていた場合も、
// 次にアプリを開いた（＝このポーリングが動き出した）時点で追いついて発火する
function gcalDailySummaryKey(){ return gcalStorageKey("gcal_daily_summary_sent_v1"); }
function gcalCheckDailySummary(){
  const now = new Date();
  if(now.getHours() < 7) return;
  const todayKey = newsDateKey(now.getFullYear(), now.getMonth(), now.getDate());
  let last = null;
  try{ last = localStorage.getItem(gcalDailySummaryKey()); }catch(e){}
  if(last === todayKey) return;
  try{ localStorage.setItem(gcalDailySummaryKey(), todayKey); }catch(e){}
  const events = gcalCollectTodayEvents()
    .filter(ev => ev && ev.title)
    .slice()
    .sort((a, b) => (a.start || "99:99").localeCompare(b.start || "99:99"));
  notifyDailySummary(events);
}

// エンジン起動：30秒間隔で朝のデイリーサマリーを判定する。起動直後にも
// 一度評価しておくことで、7時を過ぎてからアプリを開いた場合にも追いつける
// （予定ごとのリマインダーは js/schedule/reminders.js が別途担当する）
if(typeof window !== "undefined"){
  setInterval(gcalCheckDailySummary, 30000);
  setTimeout(() => { gcalCheckDailySummary(); }, 5000);
}

export function renderSelect(){
  app.innerHTML = `
    ${weatherCardHTML()}
    ${scheduleHomeCardHTML()}
    ${newsTodayCardHTML()}
    ${state.currentUser
      ? `<div class="acct-bar"> ${esc(state.currentUser.email||"ログイン中")}<button class="link2" data-logout>ログアウト</button></div>`
      : (state.guestMode ? `<div class="acct-bar">ゲストモード（この端末のみ・同期なし）<button class="link2" data-login>ログイン / 新規登録</button></div>` : "")}
    ${paletteFabHTML()}
    ${geminiFabHTML()}
  `;
  // 長押し／右クリックでカラー選択ポップアップを開いた直後に発火する合成クリックは
  // isLongPressSuppressed()で検知して無視し、意図しない画面遷移を防ぐ
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>{ if(isLongPressSuppressed(b)) return; go(b.dataset.go); });
  app.querySelectorAll("[data-open-settings]").forEach(b=>b.onclick=()=>openSettingsModal());
  app.querySelectorAll("[data-open-rules]").forEach(b=>b.onclick=()=>openRulesModal());
  const lo=app.querySelector("[data-logout]"); if(lo)lo.onclick=()=>logout();
  const li=app.querySelector("[data-login]"); if(li)li.onclick=()=>{ state.guestMode=false; state.authMode="login"; render(); };
  loadWeatherCard();
  renderScheduleHome();
  renderNewsTodayCard();
  applyCustomButtonColors(app);
  wireButtonColorLongPress(app);
  // 夜20:00〜23:59にこのダッシュボードを開いた瞬間、当日ニュースが存在し
  // まだ挑戦/スキップしていなければクイズポップアップを出す（1日1回）。
  // 判定・AC加算はサーバー側で行うため、ここでは呼び出すだけでよい。
  checkNewsQuizPopup();
}

/* =========================================================================
   ⚙️ 設定モーダル（ホーム画面のカレンダーボタン横のギアボタンから開く）
   ・トップ画面はシンプルな2つの入口ボタンのみ（背景一覧／タップ音一覧）
   ・「背景一覧」→ UI_THEME_DATA をカード形式で一覧表示（body[data-theme]で
     即時切替。フェード演出つき）
   ・「タップ音一覧」→ TAP_SOUND_DATA をカード形式で一覧表示（選ぶと即試聴）
   ・テーマ／音を増やしたいときはjs/data/uithemes.js・js/data/tapsounds.jsの
     配列に1要素足すだけで、カード一覧・切替処理は自動的に対応する。
   他のポップアップ（openGcalAuthorNameModal等）と同じく、#app（render()で
   丸ごと差し替わる領域）の外、document.bodyに直接オーバーレイを追加する
   方式。これによりカード選択でapp側を再描画しても閉じない。
   ========================================================================= */
let settingsModalView = "main"; // "main" | "themes" | "sounds"

function settingsCardHTML({ key, icon, name, sub, applied, dataAttr }){
  return `
    <button type="button" class="settings-card${applied ? " applied" : ""}" data-${dataAttr}="${key}">
      <span class="settings-card-icon">${icon}</span>
      <span class="settings-card-info">
        <span class="settings-card-name">${esc(name)}</span>
        <span class="settings-card-sub">${esc(sub)}</span>
      </span>
      ${applied ? `<span class="settings-check">✓</span>` : ""}
    </button>`;
}

function settingsMainHTML(){
  return `
    <div class="settings-section">
      <button type="button" class="settings-nav-btn" data-settings-nav="themes">
        <span class="settings-nav-icon">🎨</span>
        <span class="settings-nav-info">
          <span class="settings-nav-title">背景一覧</span>
          <span class="settings-nav-sub">好きな背景テーマを選ぶ（全${UI_THEME_DATA.length}種）</span>
        </span>
        <span class="settings-nav-arrow">›</span>
      </button>
      <button type="button" class="settings-nav-btn" data-settings-nav="sounds">
        <span class="settings-nav-icon">🔊</span>
        <span class="settings-nav-info">
          <span class="settings-nav-title">タップ音一覧</span>
          <span class="settings-nav-sub">好きなタップ音を選ぶ（全${TAP_SOUND_DATA.length}種）</span>
        </span>
        <span class="settings-nav-arrow">›</span>
      </button>
      <button type="button" class="settings-nav-btn" data-settings-toggle="geminiPlainText">
        <span class="settings-nav-icon">📝</span>
        <span class="settings-nav-info">
          <span class="settings-nav-title">Geminiの回答形式</span>
          <span class="settings-nav-sub">ONにすると*や#などの記号を使わず「・」の箇条書きで答えます</span>
        </span>
        <span class="settings-switch${S.geminiPlainText ? " on" : ""}"><span class="settings-switch-knob"></span></span>
      </button>
    </div>`;
}

function settingsThemeListHTML(){
  const cards = UI_THEME_DATA.map(th => settingsCardHTML({
    key: th.key, icon: th.icon, name: th.name, sub: th.sub,
    applied: (S.uiTheme || "default") === th.key, dataAttr: "theme-pick",
  })).join("");
  return `
    <div class="settings-subhead">
      <button type="button" class="settings-back-btn" data-settings-nav="main">‹ 戻る</button>
      <span class="settings-subhead-title">🎨 背景一覧</span>
    </div>
    <div class="settings-card-grid">${cards}</div>`;
}

function settingsSoundListHTML(){
  const cards = TAP_SOUND_DATA.map(sd => settingsCardHTML({
    key: sd.key, icon: sd.icon, name: sd.name, sub: sd.sub,
    applied: (S.tapSound || "wood") === sd.key, dataAttr: "sound-pick",
  })).join("");
  return `
    <div class="settings-subhead">
      <button type="button" class="settings-back-btn" data-settings-nav="main">‹ 戻る</button>
      <span class="settings-subhead-title">🔊 タップ音一覧</span>
    </div>
    <div class="settings-card-list">${cards}</div>`;
}

function settingsModalBodyHTML(){
  if(settingsModalView === "themes") return settingsThemeListHTML();
  if(settingsModalView === "sounds") return settingsSoundListHTML();
  return settingsMainHTML();
}

// UIテーマ切り替えを軽いフェードを挟んで反映する（背景がふわっと切り替わって見える）
function applyUiThemeAnimated(){
  document.body.classList.add("theme-fading");
  setTimeout(() => {
    applyUiTheme();
    requestAnimationFrame(() => document.body.classList.remove("theme-fading"));
  }, 90);
}

function wireSettingsModal(ov){
  const body = ov.querySelector("#settings-modal-body");
  const refresh = () => { body.innerHTML = settingsModalBodyHTML(); wireSettingsModal(ov); };

  ov.querySelectorAll("[data-settings-nav]").forEach(b => b.onclick = () => {
    playTapSound();
    settingsModalView = b.dataset.settingsNav;
    refresh();
  });
  ov.querySelectorAll("[data-theme-pick]").forEach(b => b.onclick = () => {
    playTapSound(); // 選択時の操作フィードバックは現在のタップ音設定のまま鳴らす
    S.uiTheme = b.dataset.themePick;
    saveUiTheme(S.uiTheme);
    applyUiThemeAnimated();
    refresh();
  });
  ov.querySelectorAll("[data-sound-pick]").forEach(b => b.onclick = () => {
    S.tapSound = b.dataset.soundPick;
    saveTapSound(S.tapSound);
    playTapSound(); // 選んだ音をその場で試聴
    refresh();
  });
  ov.querySelectorAll("[data-settings-toggle='geminiPlainText']").forEach(b => b.onclick = () => {
    playTapSound();
    S.geminiPlainText = !S.geminiPlainText;
    saveGeminiPlainText(S.geminiPlainText);
    refresh();
  });
  const closeBtn = ov.querySelector("#settings-modal-close");
  if(closeBtn) closeBtn.onclick = () => { playTapSound(); closeSettingsModal(ov); };
}

function closeSettingsModal(ov){ try{ ov.remove(); }catch(e){} settingsModalView = "main"; }

function openSettingsModal(){
  settingsModalView = "main";
  const ov = document.createElement("div");
  ov.className = "modal-ov";
  ov.innerHTML = `
    <div class="modal settings-modal">
      <div class="modal-title settings-modal-title">⚙️ 設定</div>
      <div id="settings-modal-body">${settingsModalBodyHTML()}</div>
      <button type="button" class="settings-modal-close" id="settings-modal-close">閉じる</button>
    </div>`;
  document.body.appendChild(ov);
  wireSettingsModal(ov);
  ov.addEventListener("click", (e) => { if(e.target === ov) closeSettingsModal(ov); });
}

/* =========================================================================
   📋 ルールモーダル（ホーム画面の設定ボタンの隣から開く）
   ・このアプリに現在ある機能の全体像をまとめた説明書き。動作を変える設定
   ではなく、読み物として表示するだけの静的モーダル（設定モーダルと同じ
   #app外・document.body直付けのオーバーレイ方式を踏襲）
   ========================================================================= */
function rulesModalBodyHTML(){
  return `
    <div class="rules-section">
      <div class="rules-section-title">📝 このアプリについて</div>
      <div class="rules-text">複数のIT資格試験を演習形式で学べる問題集アプリです。学習以外にも、コイン・スキン・データセンター育成といったゲーム要素や、カレンダー・ニュース・株価・お天気・AIチャットなどの生活系ミニ機能もホーム画面から使えます。</div>
    </div>
    <div class="rules-section">
      <div class="rules-section-title">🎓 資格試験モード</div>
      <div class="rules-text">対応資格：AZ-900（Azure基礎）／SC-300（Identity and Access）／SC-900（セキュリティ基礎）／LPIC-1・2・3（Linux技術者認定）。</div>
      <ul class="rules-list">
        <li>演習モード：1問ごとに正誤と解説を確認しながら進める</li>
        <li>本番（試験）モード：まとめて解答し、最後にスコアをまとめて確認する</li>
        <li>復習モード：これまで間違えた問題だけを解き直す</li>
        <li>LPICのみ：コマンド別に絞った演習も可能</li>
        <li>解答履歴・正答率などの学習記録（履歴／分析画面）</li>
      </ul>
    </div>
    <div class="rules-section">
      <div class="rules-section-title">🏗️ コイン・スキン・データセンター育成</div>
      <div class="rules-text">問題に正解するとコインとBP（ビルドポイント）を獲得します。コインはショップでスキン（見た目）の購入に使え、BPは資格ごとの「データセンター」の育成レベル・称号に反映されます。</div>
    </div>
    <div class="rules-section">
      <div class="rules-section-title">🏆 ランキング・プロフィール・ログイン</div>
      <div class="rules-text">Firebaseによるログイン（新規登録／ログイン）またはゲストモード（この端末のみ・同期なし）で利用できます。総合ランキングと資格別ランキング、表示名を設定できるプロフィール画面があります。</div>
    </div>
    <div class="rules-section">
      <div class="rules-section-title">⚙️ 設定</div>
      <div class="rules-text">設定ボタンから、「背景一覧」（全${UI_THEME_DATA.length}種のテーマ）と「タップ音一覧」（全${TAP_SOUND_DATA.length}種の効果音）をカードから選んで即時切り替えられます。</div>
    </div>
    <div class="rules-section">
      <div class="rules-section-title">📅 カレンダー</div>
      <div class="rules-text">Googleカレンダーと連携し、ホームの日別ウィジェットや月表示で予定を確認・追加・削除できます。自分／共有相手のカレンダーを切り替えたり、共有ユーザーをこの端末に登録することも可能です（実際の招待通知や同期は行われません）。</div>
    </div>
    <div class="rules-section">
      <div class="rules-section-title">🤖 Gemini AIチャット相談</div>
      <div class="rules-text">Gemini AIとチャットで相談できます。「予定を入れて／変更して／消して」のような依頼をすると、AIがカレンダーの予定登録・変更・削除を提案し、確認のうえ反映できます。会話履歴はそのタブを開いている間だけ保持され、保存はされません。</div>
    </div>
    <div class="rules-section">
      <div class="rules-section-title">📰 ニュース・📈 株価・☀️ お天気</div>
      <div class="rules-text">国内／海外ニュースの一覧と詳細表示、株価・ポートフォリオの確認、現在地に基づくお天気表示をホーム画面から見られます。</div>
    </div>
    <div class="rules-section">
      <div class="rules-section-title">📖 用語辞典・💾 データ引き継ぎ</div>
      <div class="rules-text">資格学習用の用語辞典に加え、コードを発行してこの端末のデータ（進捗・コイン・スキン等）を別端末へ引き継ぐ機能があります。</div>
    </div>
    <div class="rules-section">
      <div class="rules-section-title">💡 マインド・パレット</div>
      <div class="rules-text">ニュースや株価などで気になった情報・思いついたアイデアを自由なキャンバスに付箋として集められます。空いている場所をダブルタップで付箋を作成し、ドラッグで移動、「線でつなぐ」「グループ化」で関連づけできます。付箋のまわりにはAIが考える関連キーワードがふわっと浮かびます。</div>
    </div>
    <div class="rules-section">
      <div class="rules-section-title">🏠 チャッピーハウス</div>
      <div class="rules-text">オリジナルキャラクター「まるチャピ」の育成部屋です。タスク完了・Linux問題の正解・シナリオクリア・ニュース閲覧・毎日の利用などで経験値とコインがもらえ、レベルアップや成長（たまご→ベビー→キッズ→成長体）が楽しめます。コインでごはんをあげたり、なでてなかよし度を上げたりできます。お天気カード右側のまるチャピ、または各種機能メニューから開けます。放置してもキャラクターが弱ったり進化が取り消されたりすることはありません。</div>
    </div>`;
}

function closeRulesModal(ov){ try{ ov.remove(); }catch(e){} }

function openRulesModal(){
  const ov = document.createElement("div");
  ov.className = "modal-ov";
  ov.innerHTML = `
    <div class="modal rules-modal">
      <div class="modal-title rules-modal-title">📋 ルール</div>
      <div id="rules-modal-body" class="rules-modal-body">${rulesModalBodyHTML()}</div>
      <button type="button" class="settings-modal-close" id="rules-modal-close">閉じる</button>
    </div>`;
  document.body.appendChild(ov);
  const closeBtn = ov.querySelector("#rules-modal-close");
  if(closeBtn) closeBtn.onclick = () => { playTapSound(); closeRulesModal(ov); };
  ov.addEventListener("click", (e) => { if(e.target === ov) closeRulesModal(ov); });
}

// 「カレンダー」メニューボタンから遷移する専用画面。ニュース画面と同じ
// q-head（← ホーム＋タイトル）の構成に統一し、Google連携の設定と
// 月／週／日／週間ルーティンの切り替え表示をここに集約する。
// 中身の描画は js/schedule/index.js が担当する
export function renderCalendarScreen(){
  app.innerHTML = `
    <div class="q-head"><button class="quit" data-go="select">← ホーム</button><span class="q-count">📅 カレンダー</span></div>
    ${scheduleCalendarCardHTML()}
  `;
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  renderScheduleCalendar();
}


// ホーム画面右下に常設するフローティングボタン。Gemini相談画面への唯一の入口。
// data-goは他の[data-go]ボタンと同じ仕組みでrenderSelect()側から配線される。
// data-color-keyは長押し（右クリック）カラーカスタム機能（js/buttonColors.js）が
// このボタンを識別するためのキー
function geminiFabHTML(){
  return `
    <button type="button" class="gemini-fab" data-go="gemini" data-color-key="gemini" aria-label="Geminiに相談する" title="Geminiに相談する">
      <svg class="gemini-fab-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 0C12 6.75 6.75 12 0 12C6.75 12 12 17.25 12 24C12 17.25 17.25 12 24 12C17.25 12 12 6.75 12 0Z" fill="currentColor"/>
      </svg>
    </button>`;
}

// ホーム画面左下に常設するフローティングボタン。マインド・パレット画面への
// 唯一の入口（以前は中段の横スクロールカードにあった「パレット」アイコンを
// ここへ移設）。右下のGeminiボタンと形状・サイズ・シャドウを完全に統一し、
// 左右対称のレイアウトにする
function paletteFabHTML(){
  return `
    <button type="button" class="palette-fab" data-go="mind-palette" data-color-key="palette" aria-label="マインド・パレットを開く" title="マインド・パレット">
      <svg class="palette-fab-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 2.2C6.6 2.2 2.2 6.2 2.2 11.1c0 3.4 2.7 5.7 5.7 5.7h1.1c.8 0 1.4.62 1.4 1.38 0 .35-.14.66-.36.9-.24.25-.36.56-.36.92 0 1 .84 1.8 1.9 1.8 5.34 0 9.7-3.98 9.7-8.9 0-5.5-4.4-9.7-9.7-9.7Z" fill="currentColor" opacity=".16"/>
        <path d="M12 2.2C6.6 2.2 2.2 6.2 2.2 11.1c0 3.4 2.7 5.7 5.7 5.7h1.1c.8 0 1.4.62 1.4 1.38 0 .35-.14.66-.36.9-.24.25-.36.56-.36.92 0 1 .84 1.8 1.9 1.8 5.34 0 9.7-3.98 9.7-8.9 0-5.5-4.4-9.7-9.7-9.7Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
        <circle cx="7.1" cy="10.3" r="1.3" fill="currentColor"/>
        <circle cx="10.2" cy="6.9" r="1.3" fill="currentColor"/>
        <circle cx="14.7" cy="7.1" r="1.3" fill="currentColor"/>
        <circle cx="17.1" cy="10.9" r="1.3" fill="currentColor"/>
      </svg>
    </button>`;
}

/* =========================================================================
   💡 マインド・パレット（AIアイデア整理ノート）
   自由なキャンバスに付箋（アイデア）を置き、ドラッグで移動・線でつないで
   関連づけ・複数選択してグループ化できる、疑似マインドマップ画面。
   キャンバスは「ボード」単位で複数保存でき（フォルダボタンから切替・
   名前変更）、2本指ピンチでズーム・パンできる。
   データの永続化・AIキーワード提案（モック）はjs/mindpalette.jsが担当し、
   ここではドラッグ・ピンチズーム・ダブルタップ検知などDOM寄りの処理のみを行う。
   ========================================================================= */
const MP_CANVAS_W = 1200, MP_CANVAS_H = 1500;
const MP_NOTE_W = 156, MP_NOTE_H = 118;
const MP_ZOOM_MIN = 0.5, MP_ZOOM_MAX = 2.5;
function mpClamp(v, min, max){ return Math.max(min, Math.min(max, v)); }

function mpTagsHTML(tags){
  return (tags || []).map((t, i) => `<span class="mp-tag" style="--mp-tag-delay:${(i * 0.35).toFixed(2)}s">${esc(t)}</span>`).join("");
}

function mpSourceBadgeHTML(source){
  if(!source) return "";
  const icon = source.kind === "news" ? "📰" : source.kind === "stock" ? "📈" : "💡";
  return `<div class="mp-note-source">${icon} ${esc(source.label || "")}</div>`;
}

function mpLinksSVGContent(st){
  return st.links.map(l => {
    const a = st.notes.find(n => n.id === l.a), b = st.notes.find(n => n.id === l.b);
    if(!a || !b) return "";
    const ax = a.x + MP_NOTE_W / 2, ay = a.y + MP_NOTE_H / 2, bx = b.x + MP_NOTE_W / 2, by = b.y + MP_NOTE_H / 2;
    return `<line class="mp-link-line" data-link-id="${esc(l.id)}" x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}"></line>`;
  }).join("");
}

// 付箋本体はプレビュー表示のみ（タップで編集用オーバーレイを開く）。
// これによりキャンバスのピンチズーム／パン中にtextareaがフォーカスを奪ったり、
// モバイルのキーボード表示でレイアウトが崩れたりする問題を避けている
function mpNoteHTML(note, mode, pendingId, selectedIds, groupColor){
  const classes = ["mp-note", `mp-note-${note.color}`];
  if(mode === "link" && pendingId === note.id) classes.push("mp-link-pending");
  if(mode === "group" && selectedIds.has(note.id)) classes.push("mp-note-selected");
  const style = `left:${note.x}px;top:${note.y}px;${groupColor ? `--mp-group-color:${groupColor}` : ""}`;
  const previewHTML = note.text
    ? esc(note.text).replace(/\n/g, "<br>")
    : `<span class="mp-note-placeholder">タップして入力…</span>`;
  return `
    <div class="${classes.join(" ")}" style="${style}" data-note-id="${esc(note.id)}"${note.groupId ? " data-grouped" : ""}>
      <div class="mp-note-handle" data-drag-handle aria-label="ドラッグして移動">⠿</div>
      <button type="button" class="mp-note-del" aria-label="この付箋を削除">×</button>
      ${mpSourceBadgeHTML(note.source)}
      <div class="mp-note-text-preview" data-note-preview>${previewHTML}</div>
      <div class="mp-note-tags">${mpTagsHTML(mpSuggestKeywords(note.text))}</div>
    </div>`;
}

// 更新日時を「たった今／n分前／n時間前／n日前／M/D」のようなラベルに変換
function mpRelativeTime(ts){
  const diff = Date.now() - (ts || 0);
  const min = Math.floor(diff / 60000);
  if(min < 1) return "たった今";
  if(min < 60) return `${min}分前`;
  const hr = Math.floor(min / 60);
  if(hr < 24) return `${hr}時間前`;
  const day = Math.floor(hr / 24);
  if(day < 7) return `${day}日前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// キャンバス（フォルダ）の名前変更モーダル。マインド・パレット画面／
// フォルダ画面のどちらからも呼べるよう、どの画面固有の状態にも依存しない
// モジュールスコープの関数にしている
function openBoardRenameModal(boardId, currentName, onSaved){
  const ov = document.createElement("div");
  ov.className = "modal-ov";
  ov.innerHTML = `
    <div class="modal">
      <div class="modal-title" style="color:var(--text)">✏️ キャンバスの名前</div>
      <input type="text" class="gcal-ev-input gcal-newcal-input" id="mp-board-name-input" placeholder="例：経済ニュースまとめ" maxlength="30" value="${esc(currentName || "")}">
      <button class="cta" id="mp-board-name-save">保存する</button>
      <button class="ghost" id="mp-board-name-cancel" style="margin-top:8px">キャンセル</button>
    </div>`;
  document.body.appendChild(ov);
  const close = () => { try{ ov.remove(); }catch(e){} };
  ov.addEventListener("click", (e) => { if(e.target === ov) close(); });
  ov.querySelector("#mp-board-name-cancel").onclick = close;
  const input = ov.querySelector("#mp-board-name-input");
  const submit = () => {
    const name = (input.value || "").trim();
    if(!name){ input.focus(); return; }
    mpRenameBoard(boardId, name);
    close();
    if(onSaved) onSaved();
  };
  ov.querySelector("#mp-board-name-save").onclick = submit;
  input.onkeydown = (e) => { if(e.key === "Enter") submit(); };
  input.focus(); input.select();
}

// クラウド（Firestoreの users/{uid}.mindPalette）から届いたデータをこの端末へ
// 反映する。db.jsのonSnapshotから呼ばれる。今マインド・パレット関連の画面を
// 見ている場合のみ、その場で再描画して反映する
// クラウド（Firestoreの users/{uid}.voiceprint）から届いた声紋登録者一覧を
// この端末へ反映する。db.jsのonSnapshotから呼ばれる。イントロドン画面は
// renderGeneration（自前の世代番号）で再描画を管理しているため、ここでは
// キャッシュを更新するだけに留め、ゲーム中・録音中の画面を巻き添えで
// 再描画しない（登録者一覧を開き直した際に反映されれば十分）
export function applyCloudVoiceprint(data){
  VoiceprintManager.applyCloud(data);
}

export function applyCloudMindPalette(data){
  if(!mpApplyCloud(data)) return;
  if(S.screen === "mind-palette") renderMindPalette();
  else if(S.screen === "mind-palette-folders") renderMindPaletteFolders();
}

// クラウド（Firestoreの users/{uid}.scenarioMode）から届いたシナリオモードの
// 進捗をこの端末へ反映する。db.jsのonSnapshotから呼ばれる。プレイ中の画面は
// メモリ上のセッションを優先したいため、シナリオモード画面を見ている間は
// 再描画しない（一覧画面のクリア済みバッジ等は次回入室時に反映される）
export function applyCloudScenarioMode(data){
  scenarioModeApplyCloud(data);
}

// クラウド（Firestoreの users/{uid}.playground）から届いたデータをこの端末へ
// 反映する。db.jsのonSnapshotから呼ばれる。ログインごとに最初の1回だけ実際の
// 復元が行われ（pgApplyCloud内部でガード）、以降のsnapshotは無視される
export function applyCloudPlayground(data){
  if(!pgApplyCloud(data)) return;
  pgOnCloudRestored();
}

// 画面固有の一時UI状態（モード・選択中付箋・ズーム/パン量など）を閉じ込めた
// ファクトリー。createNewsScreen()と同じ構成方針
function createMindPaletteScreen(){
  let mode = "idle"; // idle | link | group
  let pendingLinkId = null;
  let selectedIds = new Set();
  let zoom = 1, panX = 20, panY = 20;
  let lastBoardId = null;
  let centerPending = true; // 初回・ボード切替時、DOM生成後にキャンバス中央へ寄せる

  // ビューポート中央にキャンバスの中央が来るpanX/panYを算出する
  const centerPan = (viewport) => ({
    x: (viewport.clientWidth - MP_CANVAS_W * zoom) / 2,
    y: (viewport.clientHeight - MP_CANVAS_H * zoom) / 2
  });

  /* ---- 付箋テキストの編集オーバーレイ ----
     キーボードが立ち上がってもキャンバスの表示位置がずれたり、フォーカスが
     迷子にならないよう、編集中はposition:fixedで画面中央に固定表示する。
     visualViewportの変化（キーボード表示による可視領域の縮小）にも追従する */
  function openNoteEditor(noteId){
    const st = mpGetState();
    const note = st.notes.find(n => n.id === noteId);
    if(!note) return;

    const backdrop = document.createElement("div");
    backdrop.className = "mp-edit-backdrop";
    backdrop.innerHTML = `
      <div class="mp-edit-card mp-note-${note.color}">
        ${mpSourceBadgeHTML(note.source)}
        <textarea class="mp-edit-textarea" placeholder="アイデアを入力…" maxlength="240">${esc(note.text)}</textarea>
        <div class="mp-edit-tags" id="mp-edit-tags">${mpTagsHTML(mpSuggestKeywords(note.text))}</div>
        <div class="mp-edit-actions">
          <button type="button" class="mp-edit-btn mp-edit-del">🗑 削除</button>
          <button type="button" class="mp-edit-btn mp-edit-done">完了</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add("show"));

    const ta = backdrop.querySelector(".mp-edit-textarea");
    const tagsEl = backdrop.querySelector("#mp-edit-tags");
    let tagTimer = null;
    ta.addEventListener("input", () => {
      clearTimeout(tagTimer);
      tagTimer = setTimeout(() => { tagsEl.innerHTML = mpTagsHTML(mpSuggestKeywords(ta.value)); }, 500);
    });

    const vv = window.visualViewport;
    const card = backdrop.querySelector(".mp-edit-card");
    const reposition = () => { if(vv) card.style.maxHeight = Math.round(vv.height * 0.72) + "px"; };
    reposition();
    if(vv) vv.addEventListener("resize", reposition);

    let closed = false;
    const close = (save) => {
      if(closed) return;
      closed = true;
      clearTimeout(tagTimer);
      if(vv) vv.removeEventListener("resize", reposition);
      if(save) mpUpdateNote(note.id, { text: ta.value });
      backdrop.classList.remove("show");
      setTimeout(() => { backdrop.remove(); mpRender(); }, 220);
    };
    backdrop.querySelector(".mp-edit-done").onclick = () => close(true);
    backdrop.querySelector(".mp-edit-del").onclick = () => {
      if(!confirm("この付箋を削除しますか？")) return;
      mpDeleteNote(note.id);
      closed = true;
      clearTimeout(tagTimer);
      if(vv) vv.removeEventListener("resize", reposition);
      backdrop.classList.remove("show");
      setTimeout(() => { backdrop.remove(); mpRender(); }, 220);
    };
    backdrop.addEventListener("click", (e) => { if(e.target === backdrop) close(true); });
    setTimeout(() => ta.focus(), 60);
  }

  function wireToolbar(){
    document.getElementById("mp-tool-link").onclick = () => {
      mode = mode === "link" ? "idle" : "link";
      pendingLinkId = null; selectedIds = new Set();
      mpRender();
    };
    document.getElementById("mp-tool-group").onclick = () => {
      mode = mode === "group" ? "idle" : "group";
      pendingLinkId = null; selectedIds = new Set();
      mpRender();
    };
    document.getElementById("mp-tool-clear").onclick = () => {
      if(!mpGetState().notes.length) return;
      if(!confirm("このキャンバス上の付箋・接続をすべて削除しますか？この操作は取り消せません。")) return;
      mpClearAll();
      mode = "idle"; pendingLinkId = null; selectedIds = new Set();
      mpRender();
    };
    const gc = document.getElementById("mp-group-confirm");
    if(gc) gc.onclick = () => {
      if(selectedIds.size < 2) return;
      mpGroupNotes([...selectedIds]);
      mode = "idle"; selectedIds = new Set();
      mpRender();
    };
    const folderBtn = document.getElementById("mp-folder-btn");
    if(folderBtn) folderBtn.onclick = () => { mpFoldersReset(); go("mind-palette-folders"); };
    const renameBtn = document.getElementById("mp-board-rename-btn");
    if(renameBtn) renameBtn.onclick = () => {
      const id = mpActiveBoardId();
      const b = mpBoardMeta(id);
      openBoardRenameModal(id, b ? b.name : "", () => mpRender());
    };
    const newBtn = document.getElementById("mp-board-new-btn");
    if(newBtn) newBtn.onclick = () => {
      const b = mpCreateBoard();
      mpRender();
      openBoardRenameModal(b.id, b.name, () => mpRender());
    };
  }

  /* ---- 2本指ピンチでズーム・1本指ドラッグ（空欄部分）でパン ----
     canvasEl自体はtranslate+scaleの1つのtransformで一括制御するため、
     ズーム状態が変わっても付箋の座標・コネクタの接続はズレない */
  function wireViewport(canvasEl, viewport){
    const applyTransform = () => {
      canvasEl.style.transform = `translate(${panX}px,${panY}px) scale(${zoom})`;
      const lab = document.getElementById("mp-zoom-label");
      if(lab) lab.textContent = Math.round(zoom * 100) + "%";
    };
    applyTransform();

    // prevX/prevYを基準に「その画面座標にあったコンテンツ点」がnewX/newYに
    // 来るようズーム・パンを同時に適用する（ピンチ・1本指パン共通の式）
    const step = (prevX, prevY, newX, newY, factor) => {
      const newZoom = mpClamp(zoom * factor, MP_ZOOM_MIN, MP_ZOOM_MAX);
      const actual = newZoom / zoom;
      panX = newX - (prevX - panX) * actual;
      panY = newY - (prevY - panY) * actual;
      zoom = newZoom;
      applyTransform();
    };

    const pointers = new Map();
    let prevMid = null, prevDist = null, singlePan = false, dragMoved = false;
    let lastTap = { t: 0, x: 0, y: 0 };

    const mid2 = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

    viewport.addEventListener("pointerdown", (e) => {
      // 1本目の指が付箋やボタンなど「空いている場所」以外から始まった操作には
      // 介入しない（setPointerCaptureで捕捉すると、その要素本来のclickが
      // viewport側に奪われてボタンが反応しなくなってしまうため）。
      // 2本目以降（ピンチ）は既にキャンバス上でジェスチャーが始まっているので追跡する
      if(pointers.size === 0 && e.target !== canvasEl) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try{ viewport.setPointerCapture(e.pointerId); }catch(err){}
      const pts = [...pointers.values()];
      if(pts.length === 1){
        prevMid = pts[0]; prevDist = null; dragMoved = false; singlePan = true;
      } else if(pts.length === 2){
        prevMid = mid2(pts[0], pts[1]); prevDist = dist2(pts[0], pts[1]); singlePan = false;
      }
    });

    viewport.addEventListener("pointermove", (e) => {
      if(!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...pointers.values()];
      if(pts.length === 2){
        const m = mid2(pts[0], pts[1]), d = dist2(pts[0], pts[1]);
        if(prevDist) step(prevMid.x, prevMid.y, m.x, m.y, d / prevDist);
        prevMid = m; prevDist = d;
      } else if(pts.length === 1 && singlePan){
        const p = pts[0];
        if(Math.hypot(p.x - prevMid.x, p.y - prevMid.y) > 3) dragMoved = true;
        step(prevMid.x, prevMid.y, p.x, p.y, 1);
        prevMid = p;
      }
    });

    const endPointer = (e) => {
      const wasSingle = pointers.size === 1 && pointers.has(e.pointerId);
      pointers.delete(e.pointerId);
      if(pointers.size === 1){
        prevMid = [...pointers.values()][0]; prevDist = null;
      } else if(pointers.size === 0){
        prevMid = null; prevDist = null;
      }
      if(wasSingle && singlePan){
        singlePan = false;
        // 空いている場所のダブルタップ（動いていない場合のみ）で新しい付箋を作成。
        // pointerdown時にsetPointerCaptureしているため、ここでのe.targetは常に
        // viewport自身になる（実際にどこで指を離したかは反映されない）ので判定に使わない
        if(!dragMoved){
          const now = Date.now();
          const dx = e.clientX - lastTap.x, dy = e.clientY - lastTap.y;
          const isDouble = (now - lastTap.t) < 420 && Math.hypot(dx, dy) < 26;
          if(isDouble){
            lastTap = { t: 0, x: 0, y: 0 };
            const rect = canvasEl.getBoundingClientRect();
            const rawX = (e.clientX - rect.left) / zoom, rawY = (e.clientY - rect.top) / zoom;
            // ズーム・パンで見えている「キャンバスの外側（点線の枠の外）」は
            // 付箋を置けない領域。以前はここをタップしても座標が枠内に
            // 強制的にクランプされ、意図しない位置に付箋が出来て分かりにくかった
            if(rawX < 0 || rawY < 0 || rawX > MP_CANVAS_W || rawY > MP_CANVAS_H){
              canvasEl.classList.add("mp-canvas-flash");
              setTimeout(() => canvasEl.classList.remove("mp-canvas-flash"), 260);
              return;
            }
            const x = mpClamp(rawX - MP_NOTE_W / 2, 0, MP_CANVAS_W - MP_NOTE_W);
            const y = mpClamp(rawY - MP_NOTE_H / 2, 0, MP_CANVAS_H - MP_NOTE_H);
            const note = mpAddNote({ x, y, text: "", color: mpRandomColor() });
            mpRender();
            openNoteEditor(note.id);
            return;
          }
          lastTap = { t: now, x: e.clientX, y: e.clientY };
        }
      }
    };
    viewport.addEventListener("pointerup", endPointer);
    viewport.addEventListener("pointercancel", endPointer);

    // デスクトップ：ホイールでパン、Ctrl/⌘+ホイール（トラックパッドのピンチ含む）でズーム
    viewport.addEventListener("wheel", (e) => {
      e.preventDefault();
      if(e.ctrlKey || e.metaKey){
        const factor = Math.exp(-e.deltaY * 0.01);
        step(e.clientX, e.clientY, e.clientX, e.clientY, factor);
      } else {
        panX -= e.deltaX; panY -= e.deltaY; applyTransform();
      }
    }, { passive: false });

    const zoomIn = document.getElementById("mp-zoom-in");
    const zoomOut = document.getElementById("mp-zoom-out");
    const zoomReset = document.getElementById("mp-zoom-reset");
    if(zoomIn) zoomIn.onclick = () => { const r = viewport.getBoundingClientRect(); step(r.left + r.width / 2, r.top + r.height / 2, r.left + r.width / 2, r.top + r.height / 2, 1.25); };
    if(zoomOut) zoomOut.onclick = () => { const r = viewport.getBoundingClientRect(); step(r.left + r.width / 2, r.top + r.height / 2, r.left + r.width / 2, r.top + r.height / 2, 0.8); };
    if(zoomReset) zoomReset.onclick = () => { zoom = 1; ({ x: panX, y: panY } = centerPan(viewport)); applyTransform(); };
  }

  function wireCanvas(st){
    const canvas = document.getElementById("mp-canvas");
    const viewport = document.getElementById("mp-canvas-viewport");
    const svgEl = document.getElementById("mp-links-svg");
    if(!canvas || !viewport) return;

    if(centerPending){
      ({ x: panX, y: panY } = centerPan(viewport));
      centerPending = false;
    }

    wireViewport(canvas, viewport);

    canvas.querySelectorAll(".mp-note").forEach(noteEl => {
      const id = noteEl.dataset.noteId;
      const note = st.notes.find(n => n.id === id);
      if(!note) return;

      const handle = noteEl.querySelector("[data-drag-handle]");
      handle.addEventListener("pointerdown", (e) => {
        e.preventDefault(); e.stopPropagation();
        const startX = e.clientX, startY = e.clientY, origX = note.x, origY = note.y;
        try{ handle.setPointerCapture(e.pointerId); }catch(err){}
        noteEl.classList.add("dragging");
        const onMove = (ev) => {
          note.x = mpClamp(origX + (ev.clientX - startX) / zoom, 0, MP_CANVAS_W - MP_NOTE_W);
          note.y = mpClamp(origY + (ev.clientY - startY) / zoom, 0, MP_CANVAS_H - MP_NOTE_H);
          noteEl.style.left = note.x + "px"; noteEl.style.top = note.y + "px";
          if(svgEl) svgEl.innerHTML = mpLinksSVGContent(st);
        };
        const onUp = () => {
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
          noteEl.classList.remove("dragging");
          mpUpdateNote(note.id, { x: note.x, y: note.y });
        };
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
      });

      const delBtn = noteEl.querySelector(".mp-note-del");
      delBtn.onclick = (e) => {
        e.stopPropagation();
        if(!confirm("この付箋を削除しますか？")) return;
        mpDeleteNote(note.id);
        mpRender();
      };

      noteEl.addEventListener("click", (e) => {
        if(e.target.closest("[data-drag-handle]") || e.target.closest(".mp-note-del")) return;
        if(mode === "link"){
          if(!pendingLinkId){ pendingLinkId = note.id; mpRender(); }
          else if(pendingLinkId === note.id){ pendingLinkId = null; mpRender(); }
          else { mpAddLink(pendingLinkId, note.id); pendingLinkId = null; mpRender(); }
        } else if(mode === "group"){
          if(selectedIds.has(note.id)) selectedIds.delete(note.id); else selectedIds.add(note.id);
          mpRender();
        } else {
          openNoteEditor(note.id);
        }
      });
    });

    if(svgEl){
      svgEl.querySelectorAll(".mp-link-line").forEach(line => {
        line.addEventListener("click", (e) => {
          e.stopPropagation();
          if(!confirm("この接続を解除しますか？")) return;
          mpRemoveLink(line.dataset.linkId);
          mpRender();
        });
      });
    }
  }

  function mpRender(){
    const st = mpGetState();
    if(st.id !== lastBoardId){
      zoom = 1; panX = 20; panY = 20; lastBoardId = st.id;
      mode = "idle"; pendingLinkId = null; selectedIds = new Set();
      centerPending = true;
    }
    const groupColorOf = (gid) => gid ? ((st.groups.find(g => g.id === gid) || {}).color || null) : null;

    const notesHTML = st.notes.map(n => mpNoteHTML(n, mode, pendingLinkId, selectedIds, groupColorOf(n.groupId))).join("");
    const linksHTML = mpLinksSVGContent(st);

    const modeHint = mode === "link"
      ? (pendingLinkId ? "つなげたい相手の付箋をタップ（同じ付箋の再タップで取消）" : "起点にする付箋をタップしてください")
      : mode === "group"
        ? "グループ化したい付箋を2つ以上タップして選んでください"
        : "点線の枠の中をダブルタップで付箋を作成（枠の外には置けません）。2本指でピンチしてズームできます";

    const groupBarHTML = mode === "group"
      ? `<div class="mp-groupbar">
          <span>選択中：${selectedIds.size}件</span>
          <button type="button" id="mp-group-confirm"${selectedIds.size < 2 ? " disabled" : ""}>🗂 グループ化する</button>
        </div>`
      : "";

    app.innerHTML = `
      <div class="q-head">
        <button class="quit" data-go="select">← ホーム</button>
        <span class="q-count">💡 マインド・パレット</span>
        <button type="button" class="mp-folder-btn" id="mp-folder-btn" aria-label="キャンバス一覧" title="キャンバス一覧">📁</button>
      </div>
      <div class="mp-board-bar">
        <button type="button" class="mp-board-name-btn" id="mp-board-rename-btn" title="名前を変更">📂 ${esc(st.name)} <span class="mp-board-edit-ico">✎</span></button>
        <button type="button" class="mp-board-new-inline" id="mp-board-new-btn" title="新しいキャンバスを作成">＋ 新規</button>
      </div>
      <div class="mp-toolbar">
        <button type="button" class="mp-tool-btn${mode === "link" ? " active" : ""}" id="mp-tool-link">🔗 線でつなぐ</button>
        <button type="button" class="mp-tool-btn${mode === "group" ? " active" : ""}" id="mp-tool-group">🗂 グループ化</button>
        <button type="button" class="mp-tool-btn mp-tool-danger" id="mp-tool-clear">🧹 全消去</button>
      </div>
      <div class="mp-hint">${esc(modeHint)}</div>
      ${groupBarHTML}
      <div class="mp-canvas-viewport" id="mp-canvas-viewport">
        <div class="mp-canvas" id="mp-canvas" style="width:${MP_CANVAS_W}px;height:${MP_CANVAS_H}px">
          <svg class="mp-links-svg" id="mp-links-svg" width="${MP_CANVAS_W}" height="${MP_CANVAS_H}">${linksHTML}</svg>
          ${notesHTML}
          ${!st.notes.length ? `<div class="mp-empty">ここはあなたの発想キャンバスです。<br>ダブルタップして最初の付箋を置いてみましょう。</div>` : ""}
        </div>
        <div class="mp-zoom-controls">
          <button type="button" id="mp-zoom-out" aria-label="縮小">－</button>
          <span class="mp-zoom-label" id="mp-zoom-label">${Math.round(zoom * 100)}%</span>
          <button type="button" id="mp-zoom-in" aria-label="拡大">＋</button>
          <button type="button" id="mp-zoom-reset" aria-label="表示をリセット" title="表示をリセット">⟳</button>
        </div>
      </div>
    `;
    app.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
    wireToolbar();
    wireCanvas(st);
  }

  return mpRender;
}

export const renderMindPalette = createMindPaletteScreen();

/* =========================================================================
   📁 マインド・パレットのフォルダ画面
   フォルダボタンを押すとモーダルではなくこの専用画面（mind-palette-folders）
   に遷移する。ボードは親子関係（parentId）を持てるため、この画面では
   パンくずリストで階層を辿りながら「フォルダの中にさらにサブフォルダを
   作る」「フォルダ内のキャンバスをそのまま開く」ができる
   ========================================================================= */
function createMindPaletteFoldersScreen(){
  let parentId = null; // 現在表示中の階層（null＝最上位）

  function resetToRoot(){ parentId = null; }

  function crumbHTML(){
    const chain = parentId ? mpBoardChain(parentId) : [];
    const items = [{ id: "", name: "すべて", icon: "📁" }, ...chain.map(c => ({ id: c.id, name: c.name, icon: "📂" }))];
    return `<div class="mp-breadcrumb">${items.map((it, i) => `${i > 0 ? '<span class="mp-crumb-sep">›</span>' : ""}<button type="button" class="mp-crumb${i === items.length - 1 ? " active" : ""}" data-crumb="${esc(it.id)}">${it.icon} ${esc(it.name)}</button>`).join("")}</div>`;
  }

  function currentOpenHTML(){
    if(!parentId) return "";
    const meta = mpBoardMeta(parentId);
    if(!meta) return "";
    return `<button type="button" class="mp-folder-open-current" id="mp-folder-open-current">📝 「${esc(meta.name)}」のキャンバスを開く（付箋 ${meta.count}件）</button>`;
  }

  function rowsHTML(){
    const boards = mpListBoards(parentId);
    const activeId = mpActiveBoardId();
    const total = mpTotalBoardCount();
    if(!boards.length){
      return `<div class="mp-folder-empty">まだフォルダがありません。上のボタンから作成できます。</div>`;
    }
    return boards.map(b => `
      <div class="mp-board-row${b.id === activeId ? " active" : ""}">
        <button type="button" class="mp-board-row-main" data-board-enter="${esc(b.id)}">
          <span class="mp-board-row-name">📂 ${esc(b.name)}${b.id === activeId ? " <em>（表示中）</em>" : ""} <span class="mp-board-row-chevron">›</span></span>
          <span class="mp-board-row-meta">付箋 ${b.count}件${b.childCount ? ` ・ 📁 サブフォルダ${b.childCount}件` : ""}・${esc(mpRelativeTime(b.updatedAt))}</span>
        </button>
        <button type="button" class="mp-board-row-icon" data-board-open="${esc(b.id)}" aria-label="このキャンバスを開く" title="このキャンバスを開く">📝</button>
        <button type="button" class="mp-board-row-icon" data-board-rename="${esc(b.id)}" aria-label="名前を変更" title="名前を変更">✎</button>
        <button type="button" class="mp-board-row-icon mp-board-row-del" data-board-del="${esc(b.id)}" aria-label="削除" title="削除"${total <= 1 ? " disabled" : ""}>🗑</button>
      </div>`).join("");
  }

  function render(){
    app.innerHTML = `
      <div class="q-head">
        <button class="quit" data-go="mind-palette">← マインド・パレット</button>
        <span class="q-count">📁 フォルダ</span>
      </div>
      ${crumbHTML()}
      ${currentOpenHTML()}
      <button type="button" class="mp-board-createbtn" id="mp-board-create">＋ ${parentId ? "この中に新しいサブフォルダを作成" : "新しいキャンバスを作成"}</button>
      <div class="mp-board-list">${rowsHTML()}</div>
    `;
    app.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));

    app.querySelectorAll("[data-crumb]").forEach(btn => btn.onclick = () => {
      parentId = btn.dataset.crumb || null;
      render();
    });

    const openCurrentBtn = document.getElementById("mp-folder-open-current");
    if(openCurrentBtn) openCurrentBtn.onclick = () => {
      mpSwitchBoard(parentId);
      go("mind-palette");
    };

    const createBtn = document.getElementById("mp-board-create");
    if(createBtn) createBtn.onclick = () => {
      const b = mpCreateBoard(undefined, parentId);
      render();
      openBoardRenameModal(b.id, b.name, () => render());
    };

    app.querySelectorAll("[data-board-enter]").forEach(btn => btn.onclick = () => {
      parentId = btn.dataset.boardEnter;
      render();
    });
    app.querySelectorAll("[data-board-open]").forEach(btn => btn.onclick = (e) => {
      e.stopPropagation();
      mpSwitchBoard(btn.dataset.boardOpen);
      go("mind-palette");
    });
    app.querySelectorAll("[data-board-rename]").forEach(btn => btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.dataset.boardRename;
      const meta = mpBoardMeta(id);
      openBoardRenameModal(id, meta ? meta.name : "", () => render());
    });
    app.querySelectorAll("[data-board-del]").forEach(btn => btn.onclick = (e) => {
      e.stopPropagation();
      if(btn.disabled) return;
      const id = btn.dataset.boardDel;
      const meta = mpBoardMeta(id);
      const warnExtra = meta && meta.childCount ? "中のサブフォルダもすべて" : "中の付箋・接続もすべて";
      if(!confirm(`このキャンバスを削除しますか？${warnExtra}失われます。`)) return;
      if(!mpDeleteBoard(id)){ alert("最後の1枚のキャンバスは削除できません。"); return; }
      render();
    });
  }

  return { render, resetToRoot };
}

const mpFoldersScreen = createMindPaletteFoldersScreen();
export const renderMindPaletteFolders = mpFoldersScreen.render;
export function mpFoldersReset(){ mpFoldersScreen.resetToRoot(); }

/* =========================================================================
   ニュース画面（日本経済・世界経済）共通ロジック
   - 上部：今月のミニカレンダー。日付をタップすると選択日が切り替わる
   - 中央：選択中の日付に紐づくニュースをタイトルのみで縦並びに表示。
     カードをタップするとアプリ内の「ニュース詳細画面」（news-detail）へ
     遷移し、登録された本文（content）をそのまま表示する。外部URLへは
     一切遷移しない
   - 管理者（isAdminAccount()）の場合のみ、各カード左側に削除選択用の
     チェックボックスと「選択したニュースを削除」ボタン、および
     「タイトル入力欄」「本文入力欄」「登録ボタン」の3点構成の登録フォーム
     を表示する
   ニュースはFirestoreの news コレクション（1件＝1ドキュメント）に保存し、
   全ユーザーで共有する（管理者が登録すると全員の一覧に反映される。API本体は
   db.jsのwindow.News）。日本経済・世界経済は同一のカレンダー／一覧／管理
   フォーム／削除ロジックをcreateNewsScreen()で共有し、categoryと画面ラベル
   だけが異なる
   ========================================================================= */

const NEWS_WEEKDAYS = ["日","月","火","水","木","金","土"];

function newsDateKey(y, m, d){ return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }

function newsCalendarHTML(y, m, selectedDay, hasNewsSet, todayKey){
  const first = new Date(y, m, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const cells = [];
  for(let i=0;i<startWeekday;i++) cells.push(`<span class="njp-cal-cell empty"></span>`);
  for(let d=1; d<=daysInMonth; d++){
    const key = newsDateKey(y, m, d);
    const cls = ["njp-cal-cell"];
    if(d===selectedDay) cls.push("selected");
    if(key===todayKey) cls.push("today");
    if(hasNewsSet.has(key)) cls.push("has-news");
    cells.push(`<button type="button" class="${cls.join(" ")}" data-day="${d}">${d}</button>`);
  }
  return `
    <div class="njp-cal">
      <div class="njp-cal-title">${y}年${m+1}月</div>
      <div class="njp-cal-grid njp-cal-weekdays">${NEWS_WEEKDAYS.map(w=>`<span>${w}</span>`).join("")}</div>
      <div class="njp-cal-grid">${cells.join("")}</div>
    </div>`;
}

// タイトルのみを表示し、カードをタップするとニュース詳細画面（news-detail）
// へ遷移する（本文はここでは表示しない）。管理者の場合のみ、削除選択用の
// チェックボックスをカード左側に添える（selectedIdsは選択中のnews.idの集合）
function newsListHTML(items, admin, selectedIds){
  if(!items || !items.length){
    return `<div class="njp-empty">この日のニュースはまだ登録されていません。</div>`;
  }
  return `<div class="njp-news-list">${items.map(n => {
    const link = `<button type="button" class="njp-news-link" data-news-id="${esc(n.id)}">
      <span class="njp-news-title">${esc(n.title)}</span>
      <span class="njp-news-arrow">→</span>
    </button>`;
    const checkbox = admin
      ? `<input type="checkbox" class="njp-news-check" data-id="${esc(n.id)}" aria-label="削除対象として選択"${selectedIds&&selectedIds.has(n.id)?" checked":""}>`
      : "";
    return `<div class="njp-news-item has-link">${checkbox}${link}</div>`;
  }).join("")}</div>`;
}

function newsAdminFormHTML(){
  return `
    <div class="njp-admin">
      <div class="njp-admin-title">🛠️ 管理者専用：ニュース登録</div>
      <input type="text" class="njp-admin-input" id="njp-admin-title" placeholder="ニュースのタイトルを入力">
      <textarea class="njp-admin-input njp-admin-textarea" id="njp-admin-content" rows="5" placeholder="ニュースの本文を入力"></textarea>
      <button type="button" class="njp-admin-btn" id="njp-admin-submit">ニュースを登録</button>
    </div>`;
}

function newsBulkDeleteHTML(){
  return `
    <div class="njp-bulk-row">
      <button type="button" class="njp-bulk-btn" id="njp-bulk-delete" disabled>選択したニュースを削除</button>
    </div>`;
}

/* =========================================================================
   ホーム画面：今日のニュースカード
   日本ニュース／海外ニュース画面と同じキャッシュ（js/news.js）を参照するだけで、
   ホーム表示のために新しくFirestoreへ問い合わせることはしない。天気カード
   （weatherCardHTML/loadWeatherCard）と同じく、まず空の枠だけを描画し、
   その枠のidに対してデータを流し込む構成にすることで、ホーム画面全体を
   作り直さずにこのカードだけを更新できるようにしてある。
   ========================================================================= */
const NEWS_HOME_CATEGORIES = [
  { category: "japan", screenKey: "news-japan", icon: "🇯🇵", tag: "日本", detailLabel: "日本経済", tagClass: "news-today-tag-jp" },
  { category: "world", screenKey: "news-world", icon: "🌐", tag: "海外", detailLabel: "世界経済", tagClass: "news-today-tag-world" },
];
const NEWS_HOME_ITEMS_PER_CATEGORY = 2;

function newsTodayCardHTML(){
  return `<div class="news-card news-today-card" id="news-today-card"></div>`;
}

function newsTodayGroupHTML(cat){
  const { items, error, loading } = getNewsCategoryState(cat.category);
  const tagHTML = `<button type="button" class="news-today-tag ${cat.tagClass}" data-go="${cat.screenKey}">${cat.icon} ${esc(cat.tag)}</button>`;

  let bodyHTML;
  if(items === null && loading){
    bodyHTML = `<div class="news-today-skeleton"><span></span><span></span></div>`;
  }else if(items === null && error){
    bodyHTML = `<div class="news-today-msg news-today-msg-error">ニュースを取得できませんでした</div>`;
  }else{
    const todays = todaysNewsForCategory(cat.category, NEWS_HOME_ITEMS_PER_CATEGORY);
    bodyHTML = todays.length
      ? `<ul class="news-today-list">${todays.map(n => `
          <li><button type="button" class="news-today-item" data-news-today-id="${esc(n.id)}" data-news-today-cat="${esc(cat.category)}">
            <span class="news-today-title">${esc(n.title)}</span>
          </button></li>`).join("")}</ul>`
      : `<div class="news-today-msg">本日の登録はまだありません</div>`;
  }

  return `<div class="news-today-group">${tagHTML}${bodyHTML}</div>`;
}

function newsTodayUpdatedLabel(){
  const times = NEWS_HOME_CATEGORIES
    .map(c => getNewsCategoryState(c.category).fetchedAt)
    .filter(t => t > 0);
  if(!times.length) return "";
  const latest = new Date(Math.max(...times));
  const pad = (n) => String(n).padStart(2, "0");
  return `更新：${pad(latest.getHours())}:${pad(latest.getMinutes())}`;
}

// #news-today-card の中身だけを描画・更新する。データが未取得のカテゴリが
// あればここで取得をキックし、完了時にこの関数を呼び直して差し替える
// （renderSelect()自体は呼ばない＝天気・予定カードの表示状態はそのまま）
function renderNewsTodayCard(){
  const card = document.getElementById("news-today-card");
  if(!card) return;

  // 未取得のカテゴリだけ取得する。すでに日本／海外ニュース画面側が取得中
  // であればfetchNewsCategory側で重複取得せず、その完了を待つだけになる
  NEWS_HOME_CATEGORIES.forEach(cat => {
    if(getNewsCategoryState(cat.category).items === null){
      fetchNewsCategory(cat.category).then(() => renderNewsTodayCard());
    }
  });

  card.innerHTML = `
    <div class="news-card-head">
      <span class="news-today-head-title">📰 今日のニュース</span>
      <button type="button" class="news-today-seeall" data-go="news-japan">すべて見る ＞</button>
    </div>
    <div class="news-today-body">${NEWS_HOME_CATEGORIES.map(newsTodayGroupHTML).join("")}</div>
    <div class="news-today-updated">${newsTodayUpdatedLabel()}</div>
  `;

  card.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
  card.querySelectorAll("[data-news-today-id]").forEach(b => b.onclick = () => {
    const catConf = NEWS_HOME_CATEGORIES.find(c => c.category === b.dataset.newsTodayCat);
    const item = todaysNewsForCategory(b.dataset.newsTodayCat, NEWS_HOME_ITEMS_PER_CATEGORY)
      .find(n => n.id === b.dataset.newsTodayId);
    if(!item || !catConf) return;
    S.newsDetail = { title: item.title, content: item.content, dateKey: item.dateKey, label: catConf.detailLabel, icon: catConf.icon, returnScreen: "select" };
    go("news-detail");
  });
}

// 日本経済・世界経済の両画面が使う共通ロジックを1箇所にまとめたファクトリー。
// categoryとlabel/iconだけを差し替えれば同じ挙動の画面を量産できる。
// データはFirestoreのnewsコレクション（window.News、db.js）に保存し、
// 全ユーザーで共有する。取得・キャッシュそのものはjs/news.jsに集約してあり、
// ホーム画面の「今日のニュース」カードとも同じキャッシュを共有する
// （画面を行き来しても同じカテゴリを2回Firestoreへ取りに行かない）
function createNewsScreen({ category, label, icon, screenKey }){
  // 画面を離れても選択中の日付を覚えておく（再訪時は前回の続きから）。
  // 未選択（初回訪問）の場合のみ「今日」を初期値にする
  let selected = null;
  // 削除対象としてチェックボックスで選択中のnews.idの集合。日付を切り替えた
  // ときや削除実行後にはリセットする（別の日の選択が残らないように）
  let selectedIds = new Set();

  async function refresh(){
    await fetchNewsCategory(category, { force: true });
    render();
  }

  function render(){
    const now = new Date();
    if(!selected) selected = { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
    const { y, m, d } = selected;
    const { items: cache } = getNewsCategoryState(category);
    // 未取得ならFirestoreから取得する。すでに他画面（ホームの「今日のニュース」
    // カードなど）が取得中の場合はfetchNewsCategory側で重複取得せず、その
    // 完了を待つだけになる。取得完了時、まだこの画面を見ている場合だけ再描画する
    if(cache === null){
      fetchNewsCategory(category).then(() => { if(S.screen === screenKey) render(); });
    }
    const allItems = cache || [];
    const selKey = newsDateKey(y, m, d);
    const items = allItems.filter(n => n.dateKey === selKey);
    const hasNewsSet = new Set(allItems.map(n => n.dateKey));
    const todayKey = newsDateKey(now.getFullYear(), now.getMonth(), now.getDate());
    const admin = isAdminAccount();

    // その日のニュースに存在しないidの選択は持ち越さない（削除済み・日付
    // 切り替え後の残留選択を防ぐ）
    const validIds = new Set(items.map(n=>n.id));
    Array.from(selectedIds).forEach(id=>{ if(!validIds.has(id)) selectedIds.delete(id); });

    app.innerHTML = `
      <div class="q-head"><button class="quit" data-go="select">← ホーム</button><span class="q-count">${icon} ${label}</span></div>
      ${newsCalendarHTML(y, m, d, hasNewsSet, todayKey)}
      <div class="section-lab" style="margin-top:16px">${m+1}月${d}日のニュース</div>
      <div id="njp-news-area">${cache===null ? `<div class="njp-empty">読み込み中…</div>` : newsListHTML(items, admin, selectedIds)}</div>
      ${admin ? newsBulkDeleteHTML() : ""}
      ${admin ? newsAdminFormHTML() : ""}
    `;
    app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
    app.querySelectorAll("[data-day]").forEach(b=>b.onclick=()=>{
      selected = { y, m, d: parseInt(b.dataset.day, 10) };
      selectedIds = new Set();
      render();
    });

    // カードタップ→アプリ内のニュース詳細画面へ遷移（外部URLへは遷移しない）
    app.querySelectorAll("[data-news-id]").forEach(b=>b.onclick=()=>{
      const item = items.find(n => n.id === b.dataset.newsId);
      if(!item) return;
      S.newsDetail = { title:item.title, content:item.content, dateKey:item.dateKey, label, icon, returnScreen:S.screen };
      go("news-detail");
    });

    if(admin){
      const bulkBtn = document.getElementById("njp-bulk-delete");
      const syncBulkBtn = () => {
        if(bulkBtn) bulkBtn.disabled = !(items.length > 0 && selectedIds.size > 0);
      };
      syncBulkBtn();

      app.querySelectorAll(".njp-news-check").forEach(cb=>{
        cb.onclick = (ev) => ev.stopPropagation();  // カード本体のクリック（詳細画面遷移）を誘発させない
        cb.onchange = () => {
          const id = cb.dataset.id;
          if(cb.checked) selectedIds.add(id); else selectedIds.delete(id);
          syncBulkBtn();
        };
      });

      if(bulkBtn) bulkBtn.onclick = async () => {
        if(bulkBtn.disabled || !selectedIds.size || !window.News) return;
        bulkBtn.disabled = true;
        try{
          await Promise.all(Array.from(selectedIds).map(id => window.News.remove(id)));
        }catch(e){
          alert("削除に失敗しました。時間をおいて再度お試しください。");
        }
        selectedIds = new Set();
        await refresh();
      };

      const submitBtn = document.getElementById("njp-admin-submit");
      if(submitBtn) submitBtn.onclick = async () => {
        const titleInput = document.getElementById("njp-admin-title");
        const contentInput = document.getElementById("njp-admin-content");
        const title = (titleInput.value||"").trim();
        const content = (contentInput.value||"").trim();
        if(!title){ titleInput.focus(); return; }
        if(!content){ contentInput.focus(); return; }
        if(!window.News){ alert("準備中です。少し待って再度お試しください。"); return; }
        submitBtn.disabled = true;
        try{
          await window.News.add(category, selKey, title, content);
          titleInput.value = "";
          contentInput.value = "";
          await refresh();
        }catch(e){
          alert("登録に失敗しました。時間をおいて再度お試しください。");
        }finally{
          submitBtn.disabled = false;
        }
      };
    }
  }

  return render;
}

export const renderNewsJapan = createNewsScreen({
  category: "japan",
  label: "日本経済",
  icon: "🇯🇵",
  screenKey: "news-japan",
});

export const renderNewsWorld = createNewsScreen({
  category: "world",
  label: "世界経済",
  icon: "🌐",
  screenKey: "news-world",
});

// ニュース詳細画面：一覧でカードをタップした際の遷移先。管理者が登録した
// 本文（content）をそのまま表示するだけの単純な画面で、外部サイトへは
// 遷移しない。表示するデータはS.newsDetail（一覧タップ時にセットされる）
function renderNewsDetail(){
  const d = S.newsDetail;
  if(!d){ go("select"); return; }
  // 🏠 ニュースを1件開いた→まるチャピにXP（同じ記事は1日1回・1日上限あり）
  chappyOnNewsOpened(`${d.dateKey || ""}:${d.title || ""}`);
  // 🎖️ 同じ記事は同日1回・1日上限つきで活動BPも付与する
  bpOnNewsRead(`${d.dateKey || ""}:${d.title || ""}`, d.title || "");
  app.innerHTML = `
    <div class="q-head"><button class="quit" data-go="${esc(d.returnScreen||"select")}">← 戻る</button><span class="q-count">${d.icon||""} ${esc(d.label||"ニュース")}</span></div>
    <div class="njp-detail">
      <div class="njp-detail-date">${esc(newsDetailDateLabel(d.dateKey))}</div>
      <h2 class="njp-detail-title">${esc(d.title)}</h2>
      <div class="njp-detail-body">${newsDetailBodyHTML(d.content)}</div>
    </div>`;
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
}

function newsDetailDateLabel(dateKey){
  const mtch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey||"");
  if(!mtch) return "";
  const y = Number(mtch[1]), m = Number(mtch[2]), d = Number(mtch[3]);
  const weekday = NEWS_WEEKDAYS[new Date(y, m-1, d).getDay()];
  return `${y}年${m}月${d}日(${weekday})`;
}

// 本文中の空行を段落区切り、単独の改行を<br>として表示する。
// XSS対策のためesc()適用後の文字列に対して改行だけを変換する
function newsDetailBodyHTML(content){
  return esc(content||"").split(/\n{2,}/).map(p => `<p>${p.split("\n").join("<br>")}</p>`).join("");
}

/* 「資格を選ぶ」CTAボタンから遷移する専用画面：総合レベルと資格カード一覧
   vendorで「microsoft」「lpic」を切り替え、同じUI・レベリングの仕組みを
   ベンダーごとの資格一覧として使い回す */

function renderCertListByVendor(vendor, eyebrow){
  updateHeaderNav(false); // グローバルヘッダーの.topごと非表示にするため、代わりにq-head内へ同じアイコンを描画する
  const cards = CERTS.filter(c=>(c.vendor||"microsoft")===vendor).map(c=>{
    if(c.status!=="ready"){
      return `<div class="cert-card locked">
        <div class="cert-top"><span class="cert-code">${esc(c.code)}</span><span class="cert-soon">🔒 近日公開</span></div>
        <div class="cert-name">${esc(c.name)}</div>
        <div class="cert-sub">${esc(c.sub||"")}</div>
      </div>`;
    }
    const st = certStat(c);
    const started = st.plays>0;
    return `<button class="cert-card" data-cert="${c.id}" style="--ca:${c.accent}">
      <div class="cert-top"><span class="cert-code">${esc(c.code)}</span><span class="cert-go">${started?"学習を続ける":"はじめる"} →</span></div>
      <div class="cert-name">${esc(c.name)}</div>
      <div class="cert-sub">${esc(c.sub||"")}</div>
      <div class="cert-pool">出題プール：${(c.Q||[]).length} 問</div>
      <div class="cert-stats">
        <span>Lv.${st.lvl}<small>/${st.tiers}</small></span>
        <span>最高 ${st.best}</span>
        <span>${st.plays} 回</span>
      </div>
    </button>`;
  }).join("");
  app.innerHTML = `
    <div class="q-head" style="margin-bottom:14px">
      <button class="quit" data-go="select">← ホーム</button>
      <div class="top-nav">
        <button type="button" class="hdr-icobtn" data-go="ranking" aria-label="ランキング" title="ランキング">
          <span class="hdr-icobtn-circle">🏆</span>
          <span class="hdr-icobtn-lab">ランキング</span>
        </button>
        <button type="button" class="hdr-icobtn" data-go="profile" aria-label="プロフィール" title="プロフィール">
          <span class="hdr-icobtn-circle">👤</span>
          <span class="hdr-icobtn-lab">プロフ</span>
        </button>
      </div>
    </div>
    <div class="sel-head">
      <span class="eyebrow">${esc(eyebrow)}</span>
      <h2 class="sel-title">資格を選ぶ</h2>
    </div>
    <div class="cert-list">${cards}</div>
  `;
  app.querySelectorAll("[data-cert]").forEach(b=>b.onclick=()=>selectCert(b.dataset.cert));
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
}

export function renderCertList(){ renderCertListByVendor("microsoft", "MICROSOFT 認定対策"); }
export function renderLpicList(){ renderCertListByVendor("lpic", "LPIC 認定対策"); }

/* ======================= プロフィール／ランキング ======================= */

export function renderProfile(){
  const ov=overallStat();
  const name=getProfileName();
  const certRows = CERTS.filter(c=>c.status==="ready").map(c=>{
    const st=certStat(c);
    return `<div class="pf-cert"><span style="color:${c.accent}">${esc(c.code)}</span><span class="pf-cn">${esc(c.name)}</span><span class="pf-cl">Lv.${st.lvl} ・ 最高 ${st.best}</span></div>`;
  }).join("");
  app.innerHTML = `
    <div class="q-head"><button class="quit" data-go="${certsBackTarget()}">← 資格選択</button><span class="q-count">プロフィール</span></div>
    <div class="me-hero">
      <div class="me-lab">総合レベル</div>
      <div class="me-lvrow"><span class="me-lv">Lv.${ov.lv}</span><span class="me-title">${esc(ov.title)}</span></div>
      <div class="me-next" style="margin-top:6px">${ov.tbp.toLocaleString()} BP ・ 学習中 ${ov.active} 資格</div>
    </div>
    <div class="dc-sub">ユーザー名</div>
    <input id="pf-name" class="auth-input" maxlength="16" placeholder="例：くらうど太郎" value="${esc(name)}">
    <div id="pf-msg" class="auth-msg"></div>
    <button class="cta" id="pf-save">${state.guestMode?"※ ログインするとランキングに参加できます":"ユーザー名を保存"}</button>
    <div class="x-hint" style="margin-top:8px">ランキングはログイン中、クイズを解くたびに<b style="color:var(--good)">自動で更新</b>されます。ユーザー名は空にできず、他の人と重複しない名前にしてください。</div>
    <div class="dc-sub">資格別レベル</div>
    <div class="pf-list">${certRows}</div>
    <button class="ghost" data-go="ranking" style="margin-top:14px">🏆 ランキングを見る</button>
    ${(!state.guestMode && state.currentUser) ? `
    <div class="danger-zone">
      <div class="dz-title">アカウント削除</div>
      <div class="dz-note">退会するとアカウント情報・スコア・履歴がすべて削除され、元に戻せません。</div>
      <button class="ghost danger" id="pf-del">アカウントを削除する（退会）</button>
    </div>` : ""}
  `;
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  const pd=document.getElementById("pf-del"); if(pd)pd.onclick=openDeleteModal;
  const msg=document.getElementById("pf-msg");
  document.getElementById("pf-save").onclick=async ()=>{
    if(state.guestMode || !state.currentUser){ msg.style.color="var(--gold)"; msg.textContent="ランキングに参加するにはログインが必要です。"; return; }
    const v=(document.getElementById("pf-name").value||"").trim();
    if(!v){ msg.style.color="var(--gold)"; msg.textContent="ユーザー名を入力してください（空にはできません）。"; return; }
    if(v===getProfileName()){ msg.style.color="var(--muted)"; msg.textContent="現在のユーザー名と同じです。"; return; }
    if(!window.LB){ msg.style.color="var(--bad)"; msg.textContent="準備中です。少し待って再度お試しください。"; return; }
    msg.style.color="var(--muted)"; msg.textContent="重複を確認中…";
    try{
      const taken=await window.LB.nameTaken(v);
      if(taken){ msg.style.color="var(--bad)"; msg.textContent="その名前はすでに使われています。別の名前にしてください。"; return; }
      setProfileName(v);
      publishLeaderboard();
      msg.style.color="var(--good)"; msg.textContent="✓ ユーザー名を保存し、ランキングに反映しました。";
    }catch(e){
      msg.style.color="var(--bad)"; msg.textContent="確認に失敗しました。通信環境を確認してください。";
    }
  };
}

const RANKING_TABS = [
  {key:"overall", label:"総合レベル"},
  ...CERTS.filter(c=>c.status==="ready").map(c=>({key:c.id, label:c.code})),
];

export function renderRanking(){
  const activeTab = state.rankingTab || "overall";
  app.innerHTML = `
    <div class="q-head"><button class="quit" data-go="${certsBackTarget()}">← 資格選択</button><span class="q-count">ランキング</span></div>
    <div class="rank-tabs">
      ${RANKING_TABS.map(t=>`<button class="rank-tab${activeTab===t.key?" active":""}" data-rtab="${t.key}">${t.label}</button>`).join("")}
    </div>
    <div id="lb-body"><div class="loading">読み込み中…</div></div>
  `;
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  app.querySelectorAll("[data-rtab]").forEach(b=>b.onclick=()=>{ state.rankingTab=b.dataset.rtab; renderRanking(); });
  loadRanking();
}

export async function loadRanking(){
  const body=document.getElementById("lb-body"); if(!body) return;
  if(state.guestMode || !window.LB || !state.currentUser){
    body.innerHTML=`<div class="empty">ランキングを見るにはログインが必要です。<br>ログインして、プロフィールで表示名を設定すると参加できます。</div>`;
    return;
  }
  const tab = state.rankingTab || "overall";
  const cert = tab==="overall" ? null : certById(tab);
  if(tab!=="overall" && !cert){ state.rankingTab="overall"; return loadRanking(); }
  try{
    // 管理者アカウントはpublishLeaderboard側で書き込み自体を止めているが、
    // それ以前に登録された古いデータが残っている場合に備えて表示側でも
    // 念のため除外する（表示名一致による二重防御）
    const rows = (tab==="overall" ? await window.LB.top(50) : await window.LB.topByCert(tab,50))
      .filter(r => (r.displayName||"").trim().toLowerCase() !== "admin");
    const ov = overallStat();
    const st = cert ? certStat(cert) : null;
    let myRank=null;
    try{ myRank = tab==="overall" ? await window.LB.myRank(ov.tbp) : await window.LB.myRankByCert(tab, st.bp); }catch(e){}
    const label = cert ? cert.code : "総合";
    if(!rows.length){
      body.innerHTML=`<div class="empty">まだ誰も${esc(label)}のランキングに登録していません。<br>プロフィールで表示名を設定すると一番乗りで参加できます。</div>`;
      return;
    }
    const myUid=state.currentUserId;
    const myLv = cert ? st.lvl : ov.lv;
    const myBp = cert ? st.bp : ov.tbp;
    body.innerHTML = `
      ${myRank?`<div class="lb-me">あなた：<b>${myRank}位</b> ・ ${esc(label)}Lv.${myLv} ・ ${myBp.toLocaleString()} BP${getProfileName()?"":' <button class="link2" data-go="profile">表示名を変更</button>'}</div>`:""}
      <div class="lb-list">
        ${rows.map((r,i)=>{
          const lv = cert ? ((r.certLevels||{})[tab]||0) : (r.overallLevel||0);
          const bp = cert ? ((r.certBP||{})[tab]||0) : (r.totalBP||0);
          return `
          <div class="lb-row ${r.uid===myUid?'me':''}">
            <span class="lb-rank ${i<3?'top':''}">${i+1}</span>
            <div class="lb-info">
              <span class="lb-name">${esc(r.displayName||"名無し")}${r.uid===myUid?' <small>(あなた)</small>':''}</span>
              <span class="lb-cert">${esc(label)}Lv.${lv}${!cert && r.title?" ・ "+esc(r.title):""}</span>
            </div>
            <span class="lb-bp">${bp.toLocaleString()}<small> BP</small></span>
          </div>`;
        }).join("")}
      </div>
      <div class="x-hint" style="margin-top:14px">${getProfileName()?"":'表示名は未設定でも自動で参加中です。<button class="link2" data-go="profile">表示名を変更</button>'}</div>
    `;
    app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  }catch(e){
    body.innerHTML=`<div class="empty">読み込みに失敗しました。<br>${esc(String(e.message||e))}</div>`;
  }
}

export function renderSettings() {
  app.innerHTML = `
    <div class="q-head" style="margin-bottom:20px">
      <button class="quit" data-go="home">← ホーム</button>
      <span class="q-count" style="color:var(--accent)">⚙️ 設定</span>
    </div>

    <div class="settings-list" style="display:flex; flex-direction:column; gap:12px;">
      <button class="ghost" data-go="skins" style="text-align:left; padding:16px;">🎨 背景変更 (スキン購入)</button>

      </div>
  `;

  // ボタンのイベント紐付け
  app.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
}

/* 設定＞背景変更：スキン一覧・購入・適用 */

export function renderSkinShop() {
  const cards = SKIN_DATA.map(sk=>{
    const isOwned = S.ownedSkins.includes(sk.key);
    const isApplied = S.currentSkin === sk.key;
    const canBuy = (S.coins||0) >= sk.cost;
    let btnHTML;
    if(isApplied) btnHTML = `<button class="sb-skin-btn sb-applied-btn" disabled>適用中</button>`;
    else if(isOwned) btnHTML = `<button class="sb-skin-btn" data-apply="${sk.key}">適用する</button>`;
    else if(canBuy) btnHTML = `<button class="sb-skin-btn sb-buy" data-buy="${sk.key}">購入 (${sk.cost}AC)</button>`;
    else btnHTML = `<button class="sb-skin-btn sb-locked" disabled>🔒 AC不足</button>`;
    return `<div class="sb-skin-card${isApplied?" sb-applied":""}">
      <div class="sb-skin-prev sb-theme-${sk.key}"></div>
      <div class="sb-skin-meta">
        <div class="sb-skin-nm">${sk.icon} ${esc(sk.name)}</div>
        <div class="sb-skin-sub">${esc(sk.sub)}${sk.cost>0?` (${sk.cost} AC)`:" (無料)"}</div>
      </div>
      ${btnHTML}
    </div>`;
  }).join("");

  app.innerHTML = `
    <div class="q-head" style="margin-bottom:14px">
      <button class="quit" data-go="settings">← 設定</button>
      <span class="q-count" style="color:var(--accent)">🎨 背景変更</span>
    </div>
    <div class="x-hint" style="margin-top:0;margin-bottom:14px">好きなスキンを選んで購入・適用できます。所持金：💰 <b>${(S.coins||0).toLocaleString()} AC</b></div>
    <div id="skin-shop-msg" class="x-hint" style="margin-top:0;min-height:1.4em"></div>
    <div id="skin-shop-list">${cards}</div>
  `;
  app.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));

  app.querySelectorAll("[data-buy]").forEach(b=>b.onclick=()=>{
    const res = purchaseSkin(b.dataset.buy);
    render(); // 所持金・所持スキン・背景色を画面全体（ステータスバー含む）へ即時反映
    const m = document.getElementById("skin-shop-msg");
    if(!m) return;
    m.style.color = res.ok ? "var(--good)" : "var(--bad)";
    m.textContent = res.ok ? `✓ 「${res.skin.name}」を購入し、背景に適用しました！` : res.msg;
  });
  app.querySelectorAll("[data-apply]").forEach(b=>b.onclick=()=>{
    const res = applySkin(b.dataset.apply);
    render();
    const m = document.getElementById("skin-shop-msg");
    if(!m) return;
    m.style.color = res.ok ? "var(--good)" : "var(--bad)";
    m.textContent = res.ok ? "✓ 背景を適用しました。" : res.msg;
  });
}
