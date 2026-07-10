/* =========================================================================
   🔮 デジタル・デトックス・ペット（幾何学的クリスタル盆栽）

   ホーム画面の一番下に置く育成ギミックのロジック部分（見た目のSVG生成・
   HTML組み立てはjs/render.js側で行う。ここでは状態の計算・永続化のみ）。

   ・進化段階（PET_STAGES）は総合ランクLv（core.jsのoverallStat().lv、
     既存のBP累積システムをそのまま利用）に応じて決まる。呼び出し側で
     計算済みのlvを渡すだけで完結させ、core.js⇄pet.jsの循環参照を避ける。
   ・「今日タスクを1つもこなしていない／しばらくアプリを開いていない」
     状態は、他の端末ローカル設定（スキン・カレンダー等）と同じく
     ログイン中ユーザーごとにキーを分けてlocalStorageで管理する。
   ========================================================================= */
import { state } from './state.js';

function petKey(base){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  return `${base}::${uid}`;
}

const ACTIVITY_KEY = "pet_last_active_date_v1";
const OPEN_KEY = "pet_last_open_ts_v1";
const NEGLECT_HOURS = 20; // これ以上アプリを開いていないと「放置」扱い

function todayStr(){
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

// 進化段階：総合ランクの称号（core.js overallTitle）と同じ節目に合わせてある
export const PET_STAGES = [
  { min:0,  key:"seed",     name:"クリスタルの種",       facets:3  },
  { min:1,  key:"sprout",   name:"芽吹く結晶",           facets:5  },
  { min:6,  key:"sapling",  name:"若木の結晶盆栽",       facets:7  },
  { min:12, key:"branch",   name:"枝分かれ結晶盆栽",     facets:9  },
  { min:20, key:"radiant",  name:"輝晶の盆栽",           facets:11 },
  { min:30, key:"bloom",    name:"満開の結晶盆栽",       facets:13 },
  { min:40, key:"celestial",name:"天想樹",               facets:16 },
].map((s,i) => ({ ...s, tier:i }));

export function petStageForLevel(lv){
  let s = PET_STAGES[0];
  for(const st of PET_STAGES){ if(lv >= st.min) s = st; }
  return s;
}

export function petNextStage(lv){
  const cur = petStageForLevel(lv);
  return PET_STAGES[cur.tier + 1] || null;
}

// アイデア整理・タスク完了・ニュース閲覧など「今日の活動」があったことを記録する。
// core.jsのfinish()（演習・試験）、ニュース詳細閲覧、本日のタスク完了、
// マインド・パレットでの付箋作成のいずれかから呼ばれる想定
export function markPetActivity(){
  try{ localStorage.setItem(petKey(ACTIVITY_KEY), todayStr()); }catch(e){}
}

export function petHasActivityToday(){
  try{ return localStorage.getItem(petKey(ACTIVITY_KEY)) === todayStr(); }catch(e){ return false; }
}

// 「一定時間アプリを開いていない」判定は、セッション開始時（ログイン識別
// 確定時）に前回起動時刻との差分を1度だけ計算してキャッシュする。
// render()のたびに毎回計算し直すと、開いたまま長時間経過しただけで
// セッション中に急に「放置」表示へ変わってしまい、体験として不自然なため
let cachedGapNeglected = false;
let petIdentityToken;
export function petHandleIdentityChange(){
  const uid = (state && state.currentUserId) ? state.currentUserId : "guest";
  if(petIdentityToken === uid) return;
  petIdentityToken = uid;
  try{
    const prev = parseInt(localStorage.getItem(petKey(OPEN_KEY)) || "0", 10);
    cachedGapNeglected = prev ? ((Date.now() - prev) / 3600000 > NEGLECT_HOURS) : false;
    localStorage.setItem(petKey(OPEN_KEY), String(Date.now()));
  }catch(e){ cachedGapNeglected = false; }
}

export function petIsNeglected(){
  return !petHasActivityToday() || cachedGapNeglected;
}
