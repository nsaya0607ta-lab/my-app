/* =========================================================================
   🏠 チャッピーハウス：生活行動・ミッション・バッジ・季節イベント・隠しイベント

   ・CHAPPY_ACTIVITIES … 見ているだけで癒される「自分で生活する」行動。
     needs に家具IDを書くと、その家具を置いているときだけ選ばれる。
   ・CHAPPY_MISSION_DEFS … 毎日入れ替わるミッション。metric は
     js/chappy.js が chappyTrack() で数えているカウンターのキー。
   ・CHAPPY_BADGES … 継続や達成でもらえるバッジ（図鑑に並ぶ）。
   ・CHAPPY_SEASON_EVENTS … 日付で自動開催される季節イベント。
   ・CHAPPY_SECRET_EVENTS … 低確率で現れる隠し要素。
   ========================================================================= */

/* =========================================================================
   ③ チャッピーの生活
   weight は時間帯ごとの選ばれやすさ（0なら選ばれない）。
   effect はごく小さな変化で、放置しても極端にはならない。
   ========================================================================= */
export const CHAPPY_ACTIVITIES = [
  { id: "sleep",   label: "ねむる",       icon: "😴", anim: "chp-act-sleep",  needs: "bed",
    effect: { sleep: 4, genki: 2, stress: -2 }, weight: { morning: 0, noon: 0, evening: 1, night: 8 } },
  { id: "nap",     label: "おひるね",     icon: "💤", anim: "chp-act-sleep",
    effect: { sleep: 3, stress: -2 },            weight: { morning: 1, noon: 3, evening: 2, night: 1 } },
  { id: "eat",     label: "ごはんをたべる", icon: "🍽️", anim: "chp-act-eat", needs: "table",
    effect: { hunger: 3, fun: 1 },               weight: { morning: 3, noon: 4, evening: 4, night: 1 } },
  { id: "cook",    label: "おりょうり",   icon: "🍳", anim: "chp-act-work",   needs: "kitchen",
    effect: { hunger: 2, fun: 2 },               weight: { morning: 2, noon: 3, evening: 3, night: 0 } },
  { id: "read",    label: "本をよむ",     icon: "📖", anim: "chp-act-read",   needs: "bookshelf",
    effect: { fun: 2, stress: -2 },              weight: { morning: 2, noon: 3, evening: 3, night: 2 } },
  { id: "study",   label: "べんきょう",   icon: "✏️", anim: "chp-act-read",
    effect: { fun: 1, stress: 1 },               weight: { morning: 2, noon: 3, evening: 2, night: 1 } },
  { id: "clean",   label: "そうじする",   icon: "🧹", anim: "chp-act-work",
    effect: { clean: 3, genki: -1 },             weight: { morning: 3, noon: 3, evening: 2, night: 0 } },
  { id: "dance",   label: "ダンスする",   icon: "💃", anim: "chp-act-dance",
    effect: { fun: 4, genki: -1, stress: -3 },   weight: { morning: 2, noon: 3, evening: 3, night: 1 } },
  { id: "stretch", label: "ストレッチ",   icon: "🤸", anim: "chp-act-stretch",
    effect: { genki: 3, stress: -2 },            weight: { morning: 4, noon: 2, evening: 2, night: 1 } },
  { id: "window",  label: "窓をみる",     icon: "🪟", anim: "chp-act-look",
    effect: { stress: -2, fun: 1 },              weight: { morning: 3, noon: 3, evening: 4, night: 2 } },
  { id: "game",    label: "ゲームする",   icon: "🎮", anim: "chp-act-play",   needs: "game",
    effect: { fun: 5, genki: -1 },               weight: { morning: 1, noon: 3, evening: 4, night: 3 } },
  { id: "bath",    label: "おふろに入る", icon: "🛁", anim: "chp-act-splash", needs: "bath",
    effect: { clean: 5, stress: -3 },            weight: { morning: 1, noon: 1, evening: 4, night: 3 } },
  { id: "tv",      label: "テレビをみる", icon: "📺", anim: "chp-act-look",   needs: "tv",
    effect: { fun: 3, stress: -1 },              weight: { morning: 1, noon: 2, evening: 4, night: 3 } },
  { id: "music",   label: "えんそうする", icon: "🎵", anim: "chp-act-dance",  needs: "guitar",
    effect: { fun: 4, stress: -2 },              weight: { morning: 1, noon: 2, evening: 3, night: 2 } },
  { id: "relax",   label: "くつろぐ",     icon: "🛋️", anim: "chp-act-idle",   needs: "sofa",
    effect: { stress: -3, genki: 1 },            weight: { morning: 2, noon: 3, evening: 3, night: 2 } },
  { id: "water",   label: "水やり",       icon: "🚿", anim: "chp-act-work",   needs: "plant",
    effect: { fun: 2, stress: -1 },              weight: { morning: 4, noon: 2, evening: 1, night: 0 } },
  { id: "fish",    label: "お魚をながめる", icon: "🐠", anim: "chp-act-look",  needs: "aquarium",
    effect: { stress: -4, fun: 2 },              weight: { morning: 2, noon: 2, evening: 3, night: 3 } },
  { id: "roll",    label: "ころころする", icon: "🌀", anim: "chp-act-roll",    needs: "rug",
    effect: { fun: 3, stress: -2 },              weight: { morning: 2, noon: 3, evening: 2, night: 1 } },
  { id: "hug",     label: "ぎゅっとする", icon: "🧸", anim: "chp-act-idle",    needs: "cushion",
    effect: { stress: -3, bond: 1 },             weight: { morning: 2, noon: 2, evening: 3, night: 3 } },
  { id: "smell",   label: "おはなの香り", icon: "🌷", anim: "chp-act-look",    needs: "flower",
    effect: { stress: -2, fun: 1 },              weight: { morning: 3, noon: 2, evening: 2, night: 1 } },
  { id: "star",    label: "星をながめる", icon: "🔭", anim: "chp-act-look",    needs: "telescope",
    effect: { stress: -3, fun: 3 },              weight: { morning: 0, noon: 0, evening: 2, night: 6 } },
  { id: "snack",   label: "おやつタイム", icon: "🍿", anim: "chp-act-eat",
    effect: { hunger: 2, fun: 2 },               weight: { morning: 1, noon: 3, evening: 3, night: 1 } },
  { id: "dressup", label: "おしゃれチェック", icon: "🪞", anim: "chp-act-idle", needs: "mirror",
    effect: { fun: 2 },                          weight: { morning: 3, noon: 2, evening: 2, night: 1 } },
  { id: "wander",  label: "おさんぽ",     icon: "🚶", anim: "chp-act-walk",
    effect: { genki: 1, fun: 1 },                weight: { morning: 3, noon: 3, evening: 3, night: 1 } },
  // 季節イベント限定の行動（対応する家具を置いているときだけ）
  { id: "hanami",  label: "おはなみ",     icon: "🌸", anim: "chp-act-dance",  needs: "sakura",
    effect: { fun: 4, stress: -3 },              weight: { morning: 3, noon: 4, evening: 3, night: 1 } },
  { id: "hanabi",  label: "花火をみる",   icon: "🎆", anim: "chp-act-look",   needs: "hanabi",
    effect: { fun: 5, stress: -3 },              weight: { morning: 0, noon: 0, evening: 3, night: 6 } },
  { id: "surf",    label: "うみあそび",   icon: "🏄", anim: "chp-act-splash", needs: "surfboard",
    effect: { fun: 4, genki: -1 },               weight: { morning: 3, noon: 5, evening: 2, night: 0 } },
  { id: "spook",   label: "おばけごっこ", icon: "🎃", anim: "chp-act-dance",  needs: "pumpkin",
    effect: { fun: 4 },                          weight: { morning: 1, noon: 2, evening: 4, night: 4 } },
  { id: "kotatsu", label: "こたつでぬくぬく", icon: "🔥", anim: "chp-act-idle", needs: "kotatsu",
    effect: { stress: -4, sleep: 2 },            weight: { morning: 2, noon: 3, evening: 4, night: 3 } },
  { id: "xmas",    label: "ツリーをみる", icon: "🎄", anim: "chp-act-look",   needs: "xmastree",
    effect: { fun: 4, stress: -2 },              weight: { morning: 2, noon: 2, evening: 4, night: 4 } },
  { id: "snow",    label: "ゆきあそび",   icon: "⛄", anim: "chp-act-play",   needs: "snowman",
    effect: { fun: 4, genki: -1 },               weight: { morning: 3, noon: 4, evening: 2, night: 1 } },
];

export const CHAPPY_ACTIVITY_BY_ID = Object.fromEntries(CHAPPY_ACTIVITIES.map(a => [a.id, a]));

/* =========================================================================
   ⑥ 毎日のミッション
   metric … chappyTrack() が数えているカウンターのキー
   reward … coins / xp / ticket（ガチャ券）/ item（家具などのID）
   ========================================================================= */
export const CHAPPY_MISSION_DEFS = [
  { id: "m-login",     label: "アプリを開く",                metric: "login",        target: 1,  reward: { coins: 20, xp: 5 },  icon: "🌅", always: true },
  { id: "m-study30",   label: "30分学習する",                metric: "studyMinutes", target: 30, reward: { coins: 60, xp: 30 }, icon: "⏱️" },
  { id: "m-study10",   label: "10分だけ学習する",            metric: "studyMinutes", target: 10, reward: { coins: 30, xp: 12 }, icon: "📗" },
  { id: "m-quiz",      label: "演習・試験を2回やりきる",     metric: "studySession", target: 2,  reward: { coins: 45, xp: 20 }, icon: "📝" },
  { id: "m-lpic",      label: "LPICの問題に10問正解する",    metric: "lpicCorrect",  target: 10, reward: { coins: 50, xp: 25 }, icon: "🐧" },
  { id: "m-azure",     label: "Azureの問題に10問正解する",   metric: "azureCorrect", target: 10, reward: { coins: 50, xp: 25 }, icon: "☁️" },
  { id: "m-task1",     label: "タスクを1つ完了する",          metric: "taskDone",     target: 1,  reward: { coins: 25, xp: 10 }, icon: "✅" },
  { id: "m-task3",     label: "タスクを3つ完了する",          metric: "taskDone",     target: 3,  reward: { coins: 60, xp: 25 }, icon: "🗒️" },
  { id: "m-calendar",  label: "カレンダーに予定を登録する",   metric: "calendarAdd",  target: 1,  reward: { coins: 30, xp: 10 }, icon: "📅" },
  { id: "m-schedule",  label: "予定を1件完了する",            metric: "scheduleDone", target: 1,  reward: { coins: 30, xp: 15 }, icon: "⏰" },
  { id: "m-news",      label: "AIニュースを2件よむ",          metric: "newsOpen",     target: 2,  reward: { coins: 30, xp: 10 }, icon: "📰" },
  { id: "m-gcal",      label: "Googleカレンダーと同期する",   metric: "gcalSync",     target: 1,  reward: { coins: 40, xp: 12 }, icon: "🔄" },
  { id: "m-feed",      label: "チャッピーにごはんをあげる",   metric: "feed",         target: 1,  reward: { coins: 15, xp: 5 },  icon: "🍚" },
  { id: "m-pet",       label: "チャッピーを5回なでる",        metric: "pet",          target: 5,  reward: { coins: 20, xp: 5 },  icon: "🤗" },
  { id: "m-care",      label: "お世話を3回する",              metric: "care",         target: 3,  reward: { coins: 25, xp: 8 },  icon: "🫧" },
  { id: "m-room",      label: "お部屋の模様がえをする",       metric: "roomEdit",     target: 1,  reward: { coins: 25, xp: 8 },  icon: "🛋️" },
  { id: "m-dress",     label: "着せ替えをする",               metric: "dressChange",  target: 1,  reward: { coins: 25, xp: 8 },  icon: "👕" },
  { id: "m-gacha",     label: "ガチャを1回まわす",            metric: "gacha",        target: 1,  reward: { coins: 20, xp: 8 },  icon: "🎁" },
  { id: "m-puzzle",    label: "ライト消しパズルであそぶ",     metric: "lightpuzzle",  target: 1,  reward: { coins: 30, xp: 10 }, icon: "💡" },
  { id: "m-scenario",  label: "シナリオモードをクリアする",   metric: "scenario",     target: 1,  reward: { coins: 70, xp: 35 }, icon: "🧭" },
];

// 1日に出すミッションの数（「アプリを開く」を含む）
export const CHAPPY_MISSION_COUNT = 4;

// その日のミッションを全部達成したときのボーナス
export const CHAPPY_MISSION_ALL_BONUS = { coins: 80, xp: 30, ticket: { key: "furniture", n: 1 } };

/* =========================================================================
   ⑪ バッジ（図鑑に並ぶ・現実のがんばりの記録）
   cond は js/chappy.js の evaluateBadges() が解釈する
   ========================================================================= */
export const CHAPPY_BADGES = [
  { id: "b-first",     name: "はじめまして",   icon: "🐣", desc: "チャッピーハウスをひらいた",           cond: { totalDays: 1 } },
  { id: "b-streak3",   name: "3日つづいた",     icon: "🔥", desc: "3日連続でアプリをひらいた",           cond: { streak: 3 } },
  { id: "b-streak7",   name: "1週間つづいた",   icon: "🔥", desc: "7日連続でアプリをひらいた",           cond: { streak: 7 } },
  { id: "b-streak14",  name: "2週間つづいた",   icon: "🔥", desc: "14日連続でアプリをひらいた",          cond: { streak: 14 } },
  { id: "b-streak30",  name: "1か月つづいた",   icon: "🏅", desc: "30日連続でアプリをひらいた",          cond: { streak: 30 } },
  { id: "b-streak100", name: "100日つづいた",   icon: "🏆", desc: "100日連続でアプリをひらいた",         cond: { streak: 100 } },
  { id: "b-days30",    name: "30日いっしょ",    icon: "📆", desc: "通算30日いっしょにすごした",          cond: { totalDays: 30 } },
  { id: "b-days100",   name: "100日いっしょ",   icon: "🎂", desc: "通算100日いっしょにすごした",         cond: { totalDays: 100 } },
  { id: "b-lv10",      name: "Lv.10とうたつ",   icon: "⭐", desc: "レベル10になった",                    cond: { level: 10 } },
  { id: "b-lv20",      name: "Lv.20とうたつ",   icon: "🌟", desc: "レベル20になった",                    cond: { level: 20 } },
  { id: "b-lv30",      name: "Lv.30とうたつ",   icon: "✨", desc: "レベル30になった",                    cond: { level: 30 } },
  { id: "b-lv50",      name: "Lv.50とうたつ",   icon: "💫", desc: "レベル50になった",                    cond: { level: 50 } },
  { id: "b-adult",     name: "大人になった",    icon: "🎓", desc: "成長段階「大人」になった",            cond: { stage: "adult" } },
  { id: "b-master",    name: "マスター",        icon: "👑", desc: "成長段階「マスター」になった",        cond: { stage: "master" } },
  { id: "b-room5",     name: "おうち Lv.5",     icon: "🏡", desc: "お部屋レベルが5になった",             cond: { roomLevel: 5 } },
  { id: "b-room10",    name: "夢のおうち",      icon: "🏰", desc: "お部屋レベルが最大になった",          cond: { roomLevel: 10 } },
  { id: "b-furni10",   name: "家具あつめ",      icon: "🪑", desc: "家具を10種類あつめた",                cond: { furnitureOwned: 10 } },
  { id: "b-furni25",   name: "家具マスター",    icon: "🛋️", desc: "家具を25種類あつめた",                cond: { furnitureOwned: 25 } },
  { id: "b-wear10",    name: "おしゃれさん",    icon: "👗", desc: "衣装・小物を10種類あつめた",          cond: { wearOwned: 10 } },
  { id: "b-study100",  name: "がんばりや",      icon: "📚", desc: "学習で通算100ポイントためた",         cond: { pointsLearn: 100 } },
  { id: "b-task50",    name: "やりきる人",      icon: "✅", desc: "タスクを通算50回完了した",            cond: { taskTotal: 50 } },
  { id: "b-news50",    name: "もの知り",        icon: "📰", desc: "ニュースを通算50件よんだ",            cond: { newsTotal: 50 } },
  { id: "b-gacha50",   name: "ガチャ好き",      icon: "🎁", desc: "ガチャを通算50回まわした",            cond: { gachaTotal: 50 } },
  { id: "b-secret",    name: "ふしぎ発見",      icon: "🔮", desc: "隠しイベントに出会った",              cond: { secretSeen: 1 } },
  { id: "b-secret7",   name: "ふしぎマニア",    icon: "🌈", desc: "隠しイベントを7種類みつけた",         cond: { secretSeen: 7 } },
];

/* =========================================================================
   ⑨ 季節イベント（日付で自動開催）
   season は限定アイテムの event キーと対応する。
   from/to は [月, 日]。年をまたぐ期間（冬）にも対応している。
   ========================================================================= */
export const CHAPPY_SEASON_EVENTS = [
  { id: "hanami",    name: "おはなみまつり",   icon: "🌸", season: "spring", from: [3, 15],  to: [4, 20],
    deco: ["🌸", "🌸", "🌷"], tint: "rgba(255,205,225,.22)", line: "さくら、きれいだね〜！" },
  { id: "koinobori", name: "こどもの日",       icon: "🎏", season: "spring", from: [4, 25],  to: [5, 10],
    deco: ["🎏", "🍡"],       tint: "rgba(205,235,255,.20)", line: "こいのぼり、およいでる〜！" },
  { id: "umi",       name: "うみびらき",       icon: "🏖️", season: "summer", from: [7, 1],   to: [7, 20],
    deco: ["🐚", "🏖️", "🍧"], tint: "rgba(190,235,255,.22)", line: "うみ、いきたいなぁ〜！" },
  { id: "hanabi",    name: "花火大会",         icon: "🎆", season: "summer", from: [7, 21],  to: [8, 25],
    deco: ["🎆", "🎇", "🏮"], tint: "rgba(150,150,220,.20)", line: "花火だ〜！たまや〜！" },
  { id: "momiji",    name: "紅葉がり",         icon: "🍁", season: "autumn", from: [10, 10], to: [11, 25],
    deco: ["🍁", "🍂", "🌰"], tint: "rgba(255,200,150,.22)", line: "もみじがまっかだね〜" },
  { id: "halloween", name: "ハロウィン",       icon: "🎃", season: "autumn", from: [10, 20], to: [11, 1],
    deco: ["🎃", "👻", "🦇"], tint: "rgba(190,150,220,.22)", line: "とりっく・おあ・とりーと〜！" },
  { id: "xmas",      name: "クリスマス",       icon: "🎄", season: "winter", from: [12, 5],  to: [12, 26],
    deco: ["🎄", "🎁", "❄️"], tint: "rgba(200,230,255,.22)", line: "メリークリスマス〜！" },
  { id: "yuki",      name: "ゆきあそび",       icon: "⛄", season: "winter", from: [12, 27], to: [2, 15],
    deco: ["❄️", "⛄", "🧣"], tint: "rgba(220,240,255,.26)", line: "ゆき、つもったよ〜！" },
];

/* =========================================================================
   ⑮ 隠し要素（部屋を開いているあいだ、低確率で現れる）
   chance は1回の判定（約20秒ごと）で出る確率。
   night:true は夜だけ、day:true は昼だけ出る。
   ========================================================================= */
export const CHAPPY_SECRET_EVENTS = [
  { id: "shootingstar", name: "流れ星",       icon: "🌠", chance: 0.030, night: true, reward: { coins: 60, xp: 15 },  msg: "おねがいごとをした！" },
  { id: "rainbow",      name: "にじ",         icon: "🌈", chance: 0.022, day: true,   reward: { coins: 50, xp: 12 },  msg: "にじがかかった！" },
  { id: "ufo",          name: "UFO",          icon: "🛸", chance: 0.008, night: true, reward: { coins: 150, xp: 40 }, msg: "なにかが飛んでいった…！" },
  { id: "present",      name: "プレゼント",   icon: "🎁", chance: 0.028,              reward: { coins: 80, ticket: { key: "furniture", n: 1 } }, msg: "プレゼントがとどいた！" },
  { id: "visitor",      name: "レア訪問者",   icon: "🐿️", chance: 0.014,              reward: { coins: 90, xp: 20 },  msg: "おきゃくさんが遊びに来た！" },
  { id: "treasure",     name: "宝箱",         icon: "🧰", chance: 0.012,              reward: { coins: 200 },          msg: "たからばこを開けた！" },
  { id: "fairy",        name: "妖精",         icon: "🧚", chance: 0.006,              reward: { coins: 120, ticket: { key: "costume", n: 1 } }, msg: "ようせいが祝福してくれた！" },
];

export const CHAPPY_SECRET_BY_ID = Object.fromEntries(CHAPPY_SECRET_EVENTS.map(s => [s.id, s]));

/* =========================================================================
   ⑫ 思い出アルバムに自動で残す出来事のテンプレート
   ========================================================================= */
export const CHAPPY_ALBUM_TEMPLATES = {
  levelUp:    { icon: "🌟", title: (n) => `Lv.${n} 達成`,        desc: () => "いっしょにレベルアップした日" },
  stageUp:    { icon: "🎉", title: (n) => `${n}になった`,        desc: () => "すがたが変わった記念日" },
  days:       { icon: "🎂", title: (n) => `${n}日記念`,          desc: () => "ここまでいっしょに過ごした日数" },
  streak:     { icon: "🔥", title: (n) => `${n}日連続達成`,      desc: () => "毎日つづけたごほうび" },
  firstBuy:   { icon: "🛍️", title: () => "はじめての家具",       desc: (n) => `${n} をおうちにむかえた` },
  firstWear:  { icon: "👗", title: () => "はじめての着せ替え",   desc: (n) => `${n} を着てみた` },
  roomLevel:  { icon: "🏡", title: (n) => `おうち Lv.${n}`,      desc: (u) => u || "おうちが広くなった" },
  gachaSSR:   { icon: "💫", title: () => "ウルトラレア！",        desc: (n) => `${n} を引きあてた` },
  event:      { icon: "🎪", title: (n) => `${n} に参加`,         desc: () => "季節のイベントを楽しんだ" },
  secret:     { icon: "🔮", title: (n) => `${n} に出会った`,     desc: () => "とてもめずらしい出来事" },
  badge:      { icon: "🏅", title: (n) => `バッジ「${n}」`,      desc: (d) => d || "あたらしいバッジを獲得" },
};
