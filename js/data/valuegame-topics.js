/* =========================================================================
   🃏 チャッピーの価値観ゲーム：お題データ

   このアプリ独自に書き下ろしたお題。既存のカードゲーム製品のロゴ・
   カード画像・文章・固有キャラクターは一切使用していない。

   各お題は「1がどんな状態か」「100がどんな状態か」を必ず明示する。
   1と100の意味が曖昧だと、数字の大小の向きが人によってずれてしまい、
   協力ゲームとして成立しないため。

   ・id     … 保存・集計用の固定ID（変更しないこと）
   ・title  … お題の見出し
   ・low    … 1の意味
   ・high   … 100の意味
   ・hint   … 答え方のヒント（回答例ではなく「考え方」を示す）
   ・season … 季節限定お題（"spring"|"summer"|"autumn"|"winter"）。
              未指定なら通年で出題される

   不適切・差別的・性的・攻撃的な題材は入れない方針で作成している。
   ========================================================================= */

export const VG_TOPICS = [
  { id: "want",       title: "欲しいもの",            low: "まったく欲しくない",     high: "絶対に欲しい",           hint: "モノでも体験でもOK。値段の話は避けて。" },
  { id: "scary",      title: "怖いもの",              low: "まったく怖くない",       high: "この世でいちばん怖い",   hint: "自分が本当に苦手なものを思い浮かべて。" },
  { id: "happy",      title: "うれしい出来事",        low: "べつにうれしくない",     high: "跳びはねるほどうれしい", hint: "日常の小さな出来事でも大丈夫。" },
  { id: "food",       title: "人気の食べ物",          low: "あまり人気がなさそう",   high: "みんなが大好きそう",     hint: "自分の好みではなく「みんなの人気」で考えて。" },
  { id: "place",      title: "行ってみたい場所",      low: "行きたいと思わない",     high: "今すぐ行きたい",         hint: "近所でも海外でも、実在しなくてもOK。" },
  { id: "animal",     title: "強そうな動物",          low: "とても弱そう",           high: "圧倒的に強そう",         hint: "実際の強さより「強そうに見えるか」で。" },
  { id: "cert",       title: "難しい資格",            low: "すぐ取れそう",           high: "とてつもなく難しい",     hint: "勉強量のイメージで考えて。" },
  { id: "app",        title: "便利なアプリ",          low: "ほとんど使わない",       high: "ないと生きていけない",   hint: "アプリの種類でも機能でもOK。" },
  { id: "dayoff",     title: "休みの日にしたいこと",  low: "まったくしたくない",     high: "休みのたびにしたい",     hint: "インドアでもアウトドアでも。" },
  { id: "hype",       title: "テンションが上がること", low: "まったく上がらない",     high: "最高に上がる",           hint: "些細なことほど個性が出ます。" },
  { id: "gift",       title: "もらってうれしいプレゼント", low: "もらっても困る",     high: "感激するほどうれしい",   hint: "値段ではなく気持ちの大きさで。" },
  { id: "hardwork",   title: "大変な仕事",            low: "とても楽そう",           high: "想像を絶するほど大変",   hint: "体力・気力・責任、どの大変さでも。" },
  { id: "house",      title: "住みたい家",            low: "住みたくない",           high: "一生ここに住みたい",     hint: "間取り・場所・雰囲気、どれでも。" },
  { id: "reliable",   title: "頼りになる人",          low: "あまり頼れない",         high: "この人がいれば安心",     hint: "職業でも役割でも身近な人でも。" },
  { id: "studyhard",  title: "学習の難しさ",          low: "とても簡単",             high: "習得に何年もかかる",     hint: "勉強・スポーツ・技能なんでも。" },
  { id: "morning",    title: "朝起きるのがつらい日",  low: "すっと起きられる",       high: "布団から出られない",     hint: "天気・予定・季節などで考えて。" },
  { id: "chappy",     title: "チャッピーが喜びそうなもの", low: "たぶん興味がない",   high: "大喜びで飛びつきそう",   hint: "チャッピーの気持ちになって考えて。" },
  { id: "nostalgic",  title: "なつかしいもの",        low: "まったく懐かしくない",   high: "涙が出るほど懐かしい",   hint: "思い出の品・音・風景など。" },
  { id: "relax",      title: "リラックスできる時間",  low: "全然くつろげない",       high: "この上なく安らぐ",       hint: "場所でも行動でも時間帯でも。" },
  { id: "annoying",   title: "地味に面倒なこと",      low: "ぜんぜん平気",           high: "考えるだけでうんざり",   hint: "日常のちょっとした手間で。" },
  { id: "luxury",     title: "ぜいたくだと感じること", low: "ふつうのこと",           high: "最高のぜいたく",         hint: "金額ではなく「贅沢な感じ」で。" },
  { id: "skill",      title: "身につけたい特技",      low: "べつにいらない",         high: "どうしても欲しい",       hint: "実用的でも役に立たなくてもOK。" },
  { id: "sound",      title: "心地よい音",            low: "うるさいだけ",           high: "ずっと聴いていたい",     hint: "自然音でも生活音でも。" },
  { id: "hot",        title: "暑さを感じる場面",      low: "まったく暑くない",       high: "耐えられないほど暑い",   hint: "場所・服装・状況などで。" },
  { id: "brave",      title: "勇気がいる行動",        low: "気軽にできる",           high: "一生ためらいそう",       hint: "日常の一歩でも大きな挑戦でも。" },
  { id: "smell",      title: "いい匂い",              low: "まったく好きじゃない",   high: "ずっと嗅いでいたい",     hint: "食べ物でも自然でも。" },
  { id: "fast",       title: "速いもの",              low: "とてもゆっくり",         high: "とてつもなく速い",       hint: "乗り物でも動物でも現象でも。" },
  { id: "childhood",  title: "子どものころの夢",      low: "まったく憧れなかった",   high: "本気でなりたかった",     hint: "職業でも状態でもOK。" },
  { id: "hobby",      title: "続けやすい趣味",        low: "三日坊主になりそう",     high: "一生続けられそう",       hint: "手軽さ・費用・熱中度などで。" },
  { id: "meeting",    title: "会いたい人",            low: "とくに会いたくない",     high: "何としても会いたい",     hint: "実在でも架空でも。" },
  { id: "sweet",      title: "甘いもの",              low: "ぜんぜん甘くない",       high: "甘すぎるほど甘い",       hint: "食べ物・飲み物どちらでも。" },
  { id: "expensive",  title: "高そうに見えるもの",    low: "とても安そう",           high: "とんでもなく高そう",     hint: "実際の値段より「見た目の高級感」で。" },
  { id: "quiet",      title: "静かな場所",            low: "とてもにぎやか",         high: "物音ひとつしない",       hint: "室内でも屋外でも。" },
  { id: "helpful",    title: "あると助かる持ち物",    low: "持っていても使わない",   high: "忘れたら引き返すほど大事", hint: "外出時のカバンの中身で考えて。" },
  { id: "tired",      title: "疲れること",            low: "まったく疲れない",       high: "翌日まで動けない",       hint: "体の疲れでも心の疲れでも。" },
  { id: "cute",       title: "かわいいもの",          low: "かわいいとは思わない",   high: "かわいすぎて悶える",     hint: "生き物でも物でもしぐさでも。" },
  { id: "wait",       title: "待つのがつらい時間",    low: "気にならない",           high: "1秒も待ちたくない",      hint: "どんな場面の待ち時間かも考えて。" },
  { id: "teamwork",   title: "チームでやりたいこと",  low: "ひとりでやりたい",       high: "絶対にみんなでやりたい", hint: "作業でも遊びでも。" },
  { id: "weather",    title: "好きな天気",            low: "できれば避けたい",       high: "この天気が一番好き",     hint: "季節や時間帯もあわせて。" },
  { id: "message",    title: "もらってうれしい言葉",  low: "とくに響かない",         high: "一生忘れないほどうれしい", hint: "短いひとことでもOK。" },

  /* ---- 季節限定お題（該当する季節にだけ出題される） ---- */
  { id: "s-spring",   title: "春を感じるもの",        low: "春っぽくない",           high: "これぞ春そのもの",       hint: "景色・食べ物・においなど。", season: "spring" },
  { id: "s-newstart", title: "新生活で必要なもの",    low: "なくても困らない",       high: "まず最初に買うべき",     hint: "引っ越し・進学・異動をイメージして。", season: "spring" },
  { id: "s-summer",   title: "夏にやりたいこと",      low: "夏じゃなくてもいい",     high: "夏にしかできない",       hint: "屋外でも屋内でも。", season: "summer" },
  { id: "s-cooling",  title: "涼しくなる方法",        low: "ほとんど効かない",       high: "一瞬で涼しくなる",       hint: "身近な工夫で考えて。", season: "summer" },
  { id: "s-autumn",   title: "秋においしいもの",      low: "秋らしくない",           high: "秋の味覚の王様",         hint: "旬の食べ物で考えて。", season: "autumn" },
  { id: "s-reading",  title: "秋の夜長にしたいこと",  low: "とくにしたくない",       high: "夜通しやっていたい",     hint: "静かな夜をイメージして。", season: "autumn" },
  { id: "s-winter",   title: "冬のあたたかいもの",    low: "ぜんぜん温まらない",     high: "芯から温まる",           hint: "食べ物・道具・場所など。", season: "winter" },
  { id: "s-yearend",  title: "年末年始にしたいこと",  low: "べつにしなくていい",     high: "これをしないと年を越せない", hint: "行事でも過ごし方でも。", season: "winter" },
];

// 今の季節（北半球・日本の四季を想定）
export function vgCurrentSeason(date){
  const m = (date || new Date()).getMonth() + 1;
  if(m >= 3 && m <= 5) return "spring";
  if(m >= 6 && m <= 8) return "summer";
  if(m >= 9 && m <= 11) return "autumn";
  return "winter";
}

// 出題対象のお題一覧（通年のお題＋今の季節の限定お題）
export function vgAvailableTopics(opts){
  const season = (opts && opts.season) || vgCurrentSeason();
  const includeSeasonal = !opts || opts.includeSeasonal !== false;
  return VG_TOPICS.filter(t => !t.season || (includeSeasonal && t.season === season));
}

export function vgTopicById(id){ return VG_TOPICS.find(t => t.id === id) || null; }

// 直近で使ったお題を避けつつ1つ選ぶ
export function vgPickTopic(excludeIds, opts){
  const pool = vgAvailableTopics(opts);
  const ex = new Set(excludeIds || []);
  const fresh = pool.filter(t => !ex.has(t.id));
  const from = fresh.length ? fresh : pool;
  return from[Math.floor(Math.random() * from.length)];
}
