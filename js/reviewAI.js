/* =========================================================================
   AIおすすめ復習（忘却曲線ベースの復習レコメンド）
   ・コマンドごとの学習統計（最終学習日時・正答率・連続正誤・回答時間など）を
     ログインユーザーごとに保存し、エビングハウスの忘却曲線を参考にした
     0〜100点の「AI復習スコア」をアプリ内で計算する（生成AIへの問い合わせはしない）
   ・スコア計算は AI_REVIEW_WEIGHTS / CMD_DIFFICULTY / LPIC_FREQUENCY を
     書き換えるだけで調整できるように関数化してある
   ・更新タイミング：問題終了時(core.js finish)・アプリ起動時(main.js)・
     ログイン時(db.js)・日付が変わった時(renderHomeのaiDailyUpdateCheck)
   ========================================================================= */

import { LPIC1_COMMANDS } from './data/lpic1-commands.js';
import { S, state } from './state.js';

/* ===== 調整用パラメータ =====
   各評価項目の重み（合計100）。値を変えるだけで配点バランスを調整できる */
export const AI_REVIEW_WEIGHTS = {
  forgetting:  40,   // ① ⑤ 忘却曲線：最終学習からの経過日数と記憶の強さ
  accuracy:    25,   // ② 正答率の低さ
  wrongStreak: 15,   // ③ 連続不正解
  lowAttempts: 10,   // ④ 演習回数の少なさ（まだ練習が足りない）
  difficulty:   5,   // ⑥ コマンド自体の難易度（忘れやすさ）
  lpicFreq:     5,   // ⑦ LPICでの頻出度
};

/* ⑥ コマンドの難易度（0〜1。高いほど忘れやすい）。未記載は DIFficulty_DEFAULT */
const DIFFICULTY_DEFAULT = 0.35;
const CMD_DIFFICULTY = {
  awk:1.0, sed:0.95, find:0.85, xargs:0.8, crontab:0.8, tar:0.75,
  chmod:0.7, umask:0.7, systemctl:0.7, fdisk:0.65, gdisk:0.65, parted:0.65,
  tune2fs:0.65, xfs_admin:0.6, xfs_repair:0.6, rpm:0.6, dpkg:0.6,
  modprobe:0.6, "grub-install":0.6, "grub-mkconfig":0.6, cpio:0.55,
  chage:0.55, gpasswd:0.55, tr:0.5, cut:0.5, grep:0.5, mount:0.5,
};

/* ⑦ LPIC-1での頻出度（0〜1。高いほど試験で問われやすい）。未記載は FREQ_DEFAULT */
const FREQ_DEFAULT = 0.4;
const LPIC_FREQUENCY = {
  grep:1.0, chmod:1.0, tar:0.9, find:0.9, ls:0.8, ps:0.8, kill:0.8,
  chown:0.8, mount:0.8, rpm:0.8, dpkg:0.8, apt:0.8, yum:0.7, dnf:0.7,
  systemctl:0.9, crontab:0.8, sed:0.8, awk:0.7, passwd:0.7, useradd:0.7,
  usermod:0.7, umask:0.7, fdisk:0.7, df:0.6, du:0.6, top:0.6, nice:0.6,
  ln:0.6, cut:0.6, sort:0.6, tail:0.6, head:0.5, wc:0.5, cat:0.5,
};

/* ===== 星表示：スコア→星の数（1〜5） ===== */
export function aiScoreStars(score){
  if(score>=95) return 5;
  if(score>=80) return 4;
  if(score>=60) return 3;
  if(score>=40) return 2;
  return 1;
}

/* ===== 保存領域 =====
   ログインユーザーごと（未ログインは guest）・資格ごとに分けて保存する。
   形式：{ [cmd]: {last,lastCorrect,attempts,correct,wrong,
                   streakCorrect,streakWrong,avgTime,timeN,aiScore} } */
export function cmdStatsStorageKey(certId){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `cert_${certId||S.cert||"lpic1"}_cmdstats::${uid}`;
}

export function loadCmdStats(certId){
  try{ return JSON.parse(localStorage.getItem(cmdStatsStorageKey(certId))) || {}; }
  catch(e){ return {}; }
}

export function saveCmdStats(stats, certId){
  try{ localStorage.setItem(cmdStatsStorageKey(certId), JSON.stringify(stats||{})); }catch(e){}
}

function emptyStat(){
  return { last:null, lastCorrect:null, attempts:0, correct:0, wrong:0,
           streakCorrect:0, streakWrong:0, avgTime:0, timeN:0, aiScore:0 };
}

/* ===== 学習結果の記録 =====
   finish() から呼ばれる。results: [{cmd, correct, timeSec}] （cmd付き問題のみ） */
export function recordCmdResults(results, certId){
  if(!Array.isArray(results) || !results.length) return;
  const stats = loadCmdStats(certId);
  const now = new Date().toISOString();
  results.forEach(r=>{
    if(!r || !r.cmd) return;
    const st = stats[r.cmd] || (stats[r.cmd] = emptyStat());
    st.attempts++;
    if(r.correct){
      st.correct++; st.streakCorrect++; st.streakWrong=0; st.lastCorrect=now;
    }else{
      st.wrong++; st.streakWrong++; st.streakCorrect=0;
    }
    if(typeof r.timeSec === "number" && r.timeSec > 0 && r.timeSec < 600){
      st.timeN = (st.timeN||0) + 1;
      st.avgTime = Math.round(((st.avgTime||0)*(st.timeN-1) + r.timeSec) / st.timeN * 10) / 10;
    }
    st.last = now;
  });
  saveCmdStats(stats, certId);
}

const clamp01 = v => Math.max(0, Math.min(1, v));

/* ===== AIスコアの計算（0〜100） =====
   各評価項目を0〜1に正規化し、AI_REVIEW_WEIGHTSで重み付けして合計する。
   戻り値：{score, reasons:[...], days, retention, accuracy} */
export function calcAiScore(st, cmd, now){
  now = now || Date.now();
  const W = AI_REVIEW_WEIGHTS;
  const reasons = [];

  // ①⑤ 忘却曲線：R = exp(-経過日数/記憶の強さ)。正解を重ねるほど強さ(stability)が
  //     伸びて忘れにくくなり、復習優先度の上がり方が緩やかになる（間隔反復の考え方）
  const days = st.last ? (now - new Date(st.last).getTime()) / 86400000 : 999;
  const accuracy = st.attempts ? st.correct / st.attempts : 0;
  const stability = Math.max(1, Math.min(30, 1 + st.streakCorrect*2 + st.attempts*0.3*accuracy));
  const retention = Math.exp(-days / stability);
  const fForget = clamp01(1 - retention);

  // ② 正答率：95%以上→0、40%以下→1 の間で線形
  const fAcc = st.attempts ? clamp01((0.95 - accuracy) / 0.55) : 0;

  // ③ 連続不正解：3回連続で最大
  const fStreak = clamp01(st.streakWrong / 3);

  // ④ 演習回数：10回未満は少ないほど優先度を上げる
  const fFew = clamp01(1 - st.attempts / 10);

  // ⑥⑦ コマンド固有の難易度・LPIC頻出度
  const fDiff = CMD_DIFFICULTY[cmd] !== undefined ? CMD_DIFFICULTY[cmd] : DIFFICULTY_DEFAULT;
  const fFreq = LPIC_FREQUENCY[cmd] !== undefined ? LPIC_FREQUENCY[cmd] : FREQ_DEFAULT;

  const score = Math.round(
    W.forgetting*fForget + W.accuracy*fAcc + W.wrongStreak*fStreak +
    W.lowAttempts*fFew + W.difficulty*fDiff + W.lpicFreq*fFreq
  );

  // 理由の生成（優先度に効いている項目から順に表示）
  const d = Math.floor(days);
  if(d>=14)      reasons.push(`${d}日間復習していません`);
  else if(d>=1)  reasons.push(d===1 ? "昨日学習済み" : `最後の学習から${d}日経過`);
  else           reasons.push("今日学習済み");
  if(st.attempts) reasons.push(`正答率${Math.round(accuracy*100)}%`);
  if(st.streakWrong>=2) reasons.push(`過去${st.streakWrong}回連続で不正解`);
  else if(st.streakWrong===1) reasons.push("直近の1問が不正解");
  if(st.attempts>0 && st.attempts<5) reasons.push(`まだ${st.attempts}回しか演習していません`);
  if(fFreq>=0.8) reasons.push("LPIC頻出コマンドです");
  if(fDiff>=0.8) reasons.push("忘れやすい難関コマンドです");

  return { score: Math.max(0, Math.min(100, score)), reasons, days, retention, accuracy };
}

/* ===== 全コマンドのAIスコアを再計算して保存 =====
   （問題終了時・アプリ起動時・ログイン時・日付が変わった時に呼ぶ） */
export function updateAiScores(certId){
  const stats = loadCmdStats(certId);
  const cmds = Object.keys(stats);
  if(!cmds.length) return stats;
  const now = Date.now();
  cmds.forEach(cmd=>{ stats[cmd].aiScore = calcAiScore(stats[cmd], cmd, now).score; });
  saveCmdStats(stats, certId);
  return stats;
}

/* ===== おすすめ一覧の取得 =====
   学習済み（attempts>0）のコマンドをスコア降順で返す。
   retention（記憶保持率：低いほど忘れかけ）とaccPct（正答率%）は
   ボトムシートの「最近忘れそう順」「正答率順」の並び替えに使う。
   [{cmd,label,desc,score,starsN,reasons,retention,accPct,stat}] */
export function getAiRecommendations(certId){
  const stats = updateAiScores(certId);   // 表示のたびに最新スコアへ自動更新
  const now = Date.now();
  const rows = [];
  LPIC1_COMMANDS.forEach(c=>{
    const st = stats[c.key];
    if(!st || !st.attempts) return;
    const r = calcAiScore(st, c.key, now);
    rows.push({ cmd:c.key, label:c.label, desc:c.desc, score:r.score,
                starsN:aiScoreStars(r.score), reasons:r.reasons,
                retention:r.retention, accPct:Math.round(r.accuracy*100), stat:st });
  });
  rows.sort((a,b)=>b.score-a.score || a.label.localeCompare(b.label));
  return rows;
}

/* ===== AIコメント：一覧の上に出す一言（スコアに応じて毎回変化） ===== */
export function aiOverallComment(recs){
  if(!recs || !recs.length){
    return "演習を始めると、AIがあなた専用の復習プランを提案します。";
  }
  const top = recs[0];
  if(top.score>=95) return `${top.label}は今が復習の限界ラインです。今日中に復習して記憶を取り戻しましょう。`;
  if(top.score>=80) return `${top.label}を忘れ始めています。今日復習すると記憶が定着しやすくなります。`;
  if(top.score>=60) return `${top.label}はあと1回復習すると長期記憶に入りそうです。`;
  if(top.score>=40) return `${top.label}を軽くおさらいしておくと安心です。`;
  return "どのコマンドも十分定着しています。新しいコマンドに挑戦するのに良いタイミングです。";
}

/* ===== AIコメント（短縮版）：ホーム画面のコンパクトカードに出す一言 =====
   詳しい理由やコメントはボトムシート側（aiOverallComment）だけで表示する */
export function aiShortComment(recs){
  if(!recs || !recs.length){
    return "演習を始めると、AIがあなた専用の復習プランを提案します。";
  }
  const high = recs.filter(r=>r.starsN>=4).length;
  if(high>=2) return `今日は復習優先度の高いコマンドが${high}件あります。`;
  const top = recs[0];
  if(top.score>=40) return `今日は${top.label}を復習するのがおすすめです。`;
  return "どのコマンドも十分定着しています。";
}

/* ===== 日付が変わった時の自動更新チェック =====
   学習画面を開くたびに呼ばれ、最後に計算した日付と今日が違えば再計算する */
export function aiDailyUpdateCheck(certId){
  const key = `ai_review_lastday::${cmdStatsStorageKey(certId)}`;
  const today = new Date().toISOString().slice(0,10);
  let last = null;
  try{ last = localStorage.getItem(key); }catch(e){}
  if(last !== today){
    updateAiScores(certId);
    try{ localStorage.setItem(key, today); }catch(e){}
  }
}
