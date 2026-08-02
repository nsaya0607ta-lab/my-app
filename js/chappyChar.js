/* =========================================================================
   🏠 チャッピーハウス：キャラクター「まるチャピ」の描画（⑩ 成長システム）

   ・完全オリジナルの手続き生成SVG。白い犬をベースに、水色の垂れ耳、
     ピンクのほっぺ、星の首飾りを残しつつ、頭・胴体・マズル・脚・しっぽを
     分けて描き、以前より犬らしい立体感とシルエットにしている。
   ・成長段階（たまご→赤ちゃん→子ども→成長体→大人→マスター）で大きさ・
     飾り・オーラが少しずつ変わる。
   ・着せ替え（衣装・帽子・アクセサリー・メガネ・くつ）は本体の上に重ねて
     描画する。衣装は胴体に沿った服のかたち、小物は絵文字を配置する。
   ・表情・ポーズはSVG内に全パターンを持ち、外側のラッパーclassで切り替える：
       .chp-face-happy  … にっこり目   .chp-face-sleepy … ねむそうな目＋Zzz
       .chp-pose-hungry … お腹を押さえる前脚
   ========================================================================= */
import { CHAPPY_STAGES } from './data/chappy-config.js';

function starPath(cx, cy, r){
  let d = "";
  for(let i = 0; i < 10; i++){
    const ang = -Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    d += `${i === 0 ? "M" : "L"}${(cx + Math.cos(ang) * rr).toFixed(1)},${(cy + Math.sin(ang) * rr).toFixed(1)}`;
  }
  return d + "Z";
}

function stageConf(stageKey){
  return CHAPPY_STAGES.find(s => s.key === stageKey) || CHAPPY_STAGES[0];
}

function chappyEggSVG(){
  return `
    <svg viewBox="0 0 200 200" class="chp-svg" aria-hidden="true">
      <ellipse class="chp-shadow" cx="100" cy="172" rx="46" ry="9"/>
      <g class="chp-body-g">
        <path d="M100 38 C136 38 152 82 152 118 C152 152 129 170 100 170 C71 170 48 152 48 118 C48 82 64 38 100 38Z"
              fill="#fffaf0" stroke="#f3e4c8" stroke-width="3"/>
        <circle cx="76" cy="88" r="5.5" fill="#cbe9fb"/>
        <circle cx="128" cy="128" r="4.5" fill="#fbd9e3"/>
        <circle cx="66" cy="128" r="4" fill="#fdeec9"/>
        <path d="${starPath(112, 78, 9)}" fill="#f7d774"/>
        <path class="chp-egg-eye" d="M84 122 q5 5 10 0" stroke="#5a5a5a" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path class="chp-egg-eye" d="M106 122 q5 5 10 0" stroke="#5a5a5a" stroke-width="3" fill="none" stroke-linecap="round"/>
      </g>
    </svg>`;
}

/* 着せ替えの重ね描き。wear は { outfit, hat, acc, glasses, shoes } の
   アイテム定義（null可）。絵文字は <text> で配置する */
function wearLayers(wear){
  if(!wear) return { under: "", over: "" };
  const under = [];
  const over = [];

  // 衣装：首元から胴体に沿わせ、犬らしい胸の丸みを残す
  const outfit = wear.outfit;
  if(outfit && outfit.color){
    under.push(`
      <g class="chp-wear-outfit">
        <path d="M63 119 C66 138 64 156 75 169 C84 178 116 178 125 169 C136 156 134 138 137 119
                 C126 128 115 132 100 132 C85 132 74 128 63 119Z"
              fill="${outfit.color}" opacity=".95"/>
        <path d="M64 120 Q100 140 136 120" stroke="rgba(255,255,255,.58)" stroke-width="3" fill="none" stroke-linecap="round"/>
      </g>`);
    over.push(`<text class="chp-wear-badge" x="100" y="159" text-anchor="middle" font-size="17">${outfit.icon}</text>`);
  }
  // メガネ：目の上に重ねる
  if(wear.glasses && wear.glasses.cute > 0){
    over.push(`<text class="chp-wear-glasses" x="100" y="105" text-anchor="middle" font-size="34">${wear.glasses.icon}</text>`);
  }
  // 帽子：頭のうえ
  if(wear.hat && wear.hat.cute > 0){
    over.push(`<text class="chp-wear-hat" x="100" y="48" text-anchor="middle" font-size="38">${wear.hat.icon}</text>`);
  }
  // アクセサリー：首元
  if(wear.acc && wear.acc.cute > 0){
    over.push(`<text class="chp-wear-acc" x="130" y="143" text-anchor="middle" font-size="24">${wear.acc.icon}</text>`);
  }
  // くつ：前脚の足元に左右ひとつずつ
  if(wear.shoes && wear.shoes.cute > 0){
    over.push(`<text class="chp-wear-shoe" x="76" y="183" text-anchor="middle" font-size="20">${wear.shoes.icon}</text>`);
    over.push(`<text class="chp-wear-shoe" x="124" y="183" text-anchor="middle" font-size="20">${wear.shoes.icon}</text>`);
  }
  return { under: under.join(""), over: over.join("") };
}

function chappyBodySVG(stageKey, wear){
  const conf = stageConf(stageKey);
  const scale = conf.scale || 1;
  const baby = stageKey === "baby";
  const grown = stageKey === "grown";
  const adult = stageKey === "adult";
  const master = stageKey === "master";
  const fancy = grown || adult || master;
  const tx = 100 - 100 * scale;
  const ty = 174 - 174 * scale;
  const layers = wearLayers(wear);
  const eyeY = baby ? 91 : 89;
  const eyeR = baby ? 6.6 : 5.7;
  const cheekY = baby ? 108 : 106;

  return `
    <svg viewBox="0 0 200 200" class="chp-svg" aria-hidden="true">
      <ellipse class="chp-shadow" cx="100" cy="179" rx="${(47 * scale).toFixed(1)}" ry="8"/>
      <g class="chp-body-g" transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${scale})">
        ${master ? `<circle class="chp-aura" cx="100" cy="106" r="77" fill="none" stroke="#f7d774" stroke-width="2" stroke-dasharray="5 9" opacity=".7"/>` : ""}

        <!-- しっぽ：丸ではなく、付け根から自然に上がる犬のしっぽ -->
        <path d="M139 132 C160 119 171 127 164 140 C159 149 151 149 148 143"
              fill="none" stroke="#dfe8f1" stroke-width="13" stroke-linecap="round"/>
        <path d="M139 132 C160 119 171 127 164 140 C159 149 151 149 148 143"
              fill="none" stroke="#ffffff" stroke-width="9" stroke-linecap="round"/>

        <!-- 胴体：頭と分け、胸から腰へ自然に細くなる形 -->
        <path d="M70 111 C60 124 59 151 69 166 C80 181 120 181 131 166 C141 151 140 124 130 111
                 C119 102 81 102 70 111Z"
              fill="#ffffff" stroke="#dfe8f1" stroke-width="3.2"/>
        <path d="M74 117 C70 137 72 158 82 168 C90 175 110 175 118 168 C128 158 130 137 126 117"
              fill="#f7fbff" opacity=".72"/>
        ${layers.under}

        <!-- 後ろ脚：胴体の奥に見える短い脚 -->
        <path d="M66 148 C57 151 54 164 59 171 C64 177 76 176 81 169 C84 164 80 153 74 150Z"
              fill="#f8fbfe" stroke="#dfe8f1" stroke-width="3"/>
        <path d="M134 148 C143 151 146 164 141 171 C136 177 124 176 119 169 C116 164 120 153 126 150Z"
              fill="#f8fbfe" stroke="#dfe8f1" stroke-width="3"/>

        <!-- 首元のふわっとした毛 -->
        <path d="M72 112 C78 118 84 116 88 121 C92 116 96 120 100 123 C104 120 108 116 112 121
                 C116 116 122 118 128 112 C123 132 115 140 100 140 C85 140 77 132 72 112Z"
              fill="#ffffff" stroke="#e7eef5" stroke-width="2.2"/>

        <!-- 頭：頬・額・あごに凹凸をつけた犬らしい輪郭 -->
        <path d="M100 39 C125 39 143 52 147 72 C151 91 142 112 126 122
                 C119 127 111 130 100 130 C89 130 81 127 74 122 C58 112 49 91 53 72
                 C57 52 75 39 100 39Z"
              fill="#ffffff" stroke="#dfe8f1" stroke-width="3.4"/>
        <path d="M68 59 C76 48 88 44 100 44 C112 44 124 48 132 59 C123 55 114 54 100 54 C86 54 77 55 68 59Z"
              fill="#f8fbfe"/>

        <!-- 垂れ耳：付け根を細く、先端を丸めた自然な形 -->
        <g class="chp-ears">
          <path d="M64 56 C52 53 39 62 38 78 C37 94 45 108 56 110 C64 111 70 102 70 90 C70 77 69 64 64 56Z"
                fill="#9ed6f2" stroke="#78bfe7" stroke-width="2.7"/>
          <path d="M136 56 C148 53 161 62 162 78 C163 94 155 108 144 110 C136 111 130 102 130 90 C130 77 131 64 136 56Z"
                fill="#9ed6f2" stroke="#78bfe7" stroke-width="2.7"/>
          <path d="M58 65 C50 67 46 77 47 88 C48 97 52 102 57 101 C62 99 64 91 63 82 C63 74 61 68 58 65Z" fill="#cbeafb" opacity=".92"/>
          <path d="M142 65 C150 67 154 77 153 88 C152 97 148 102 143 101 C138 99 136 91 137 82 C137 74 139 68 142 65Z" fill="#cbeafb" opacity=".92"/>
        </g>

        <!-- 眉上の毛と額のハイライト -->
        <path d="M76 76 Q83 70 91 74" stroke="#e6eef5" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M109 74 Q117 70 124 76" stroke="#e6eef5" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M84 49 Q100 43 116 49" stroke="#ffffff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".75"/>

        <!-- 目（通常／にっこり／ねむい） -->
        <g class="chp-eyes-normal">
          <ellipse cx="80" cy="${eyeY}" rx="${eyeR}" ry="${(eyeR + 0.7).toFixed(1)}" fill="#303740"/>
          <circle cx="82" cy="${eyeY - 2}" r="2" fill="#ffffff"/>
          <ellipse cx="120" cy="${eyeY}" rx="${eyeR}" ry="${(eyeR + 0.7).toFixed(1)}" fill="#303740"/>
          <circle cx="122" cy="${eyeY - 2}" r="2" fill="#ffffff"/>
        </g>
        <g class="chp-eyes-happy">
          <path d="M72 ${eyeY + 1} q8 -9 16 0" stroke="#303740" stroke-width="3.5" fill="none" stroke-linecap="round"/>
          <path d="M112 ${eyeY + 1} q8 -9 16 0" stroke="#303740" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        </g>
        <g class="chp-eyes-sleepy">
          <path d="M72 ${eyeY} q8 4 16 0" stroke="#303740" stroke-width="3.5" fill="none" stroke-linecap="round"/>
          <path d="M112 ${eyeY} q8 4 16 0" stroke="#303740" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        </g>

        <!-- ほっぺ：小さめにしてマズルを目立たせる -->
        <ellipse cx="66" cy="${cheekY}" rx="${baby ? 10 : 8.5}" ry="${baby ? 6.7 : 5.8}" fill="#fbd0da" opacity=".9"/>
        <ellipse cx="134" cy="${cheekY}" rx="${baby ? 10 : 8.5}" ry="${baby ? 6.7 : 5.8}" fill="#fbd0da" opacity=".9"/>

        <!-- マズル・鼻・口：犬らしさの中心 -->
        <ellipse cx="100" cy="106" rx="25" ry="18" fill="#fff9ef" stroke="#edf0ee" stroke-width="2.2"/>
        <path d="M92 100 Q100 94 108 100 Q107 108 100 109 Q93 108 92 100Z" fill="#3b4148"/>
        <ellipse cx="97" cy="99" rx="2.2" ry="1.2" fill="#ffffff" opacity=".55"/>
        <path class="chp-mouth" d="M100 108 v4 M100 112 q-6 7 -12 1 M100 112 q6 7 12 1"
              stroke="#9f6f77" stroke-width="2.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>

        <!-- 前脚（通常）：棒ではなく肩から足先までつながる形 -->
        <g class="chp-arms-normal">
          <path d="M75 123 C68 131 66 151 69 168 C70 176 82 179 88 172 C91 168 88 159 87 151 C86 141 87 131 84 126Z"
                fill="#ffffff" stroke="#dfe8f1" stroke-width="3"/>
          <path d="M125 123 C132 131 134 151 131 168 C130 176 118 179 112 172 C109 168 112 159 113 151 C114 141 113 131 116 126Z"
                fill="#ffffff" stroke="#dfe8f1" stroke-width="3"/>
          <path d="M72 169 q7 5 14 0 M114 169 q7 5 14 0" stroke="#cfdbe6" stroke-width="2" fill="none" stroke-linecap="round"/>
          <path d="M76 171 v3 M82 171 v3 M118 171 v3 M124 171 v3" stroke="#cfdbe6" stroke-width="1.5" stroke-linecap="round"/>
        </g>

        <!-- 前脚（空腹）：胸の前へ自然に寄せる -->
        <g class="chp-arms-hungry">
          <path d="M73 128 C73 140 80 149 91 151 C96 152 99 146 96 142 C91 136 85 130 80 126Z"
                fill="#ffffff" stroke="#dfe8f1" stroke-width="3"/>
          <path d="M127 128 C127 140 120 149 109 151 C104 152 101 146 104 142 C109 136 115 130 120 126Z"
                fill="#ffffff" stroke="#dfe8f1" stroke-width="3"/>
        </g>

        <!-- 首元の飾り：星（成長するほど少し豪華になる） -->
        ${fancy ? `<path d="M82 132 Q100 142 118 132 L114 145 Q100 151 86 145Z" fill="#fbd0da" stroke="#f3b7c6" stroke-width="2"/>` : ""}
        ${master ? `<path d="M66 135 Q100 154 134 135 L140 151 Q100 171 60 151Z" fill="#cfe0ff" stroke="#aec6ee" stroke-width="2" opacity=".8"/>` : ""}
        <path d="${starPath(100, fancy ? 142 : 136, master ? 10.5 : adult ? 9.5 : fancy ? 8.5 : 7)}" fill="#f7d774" stroke="#eec659" stroke-width="1.5"/>

        ${layers.over}

        <!-- Zzz（ねむい時のみ表示） -->
        <g class="chp-zzz" fill="#9db8d6" font-size="16" font-weight="700" font-family="sans-serif">
          <text x="146" y="61">z</text><text x="156" y="47" font-size="20">Z</text>
        </g>

        <!-- ☔（ホームの雨の日のみ表示：小さな傘） -->
        <g class="chp-umbrella">
          <path d="M159 35 q-27 -18 -54 0 q6 -22 27 -22 q21 0 27 22Z" fill="#aadcf5" stroke="#8ecbec" stroke-width="2"/>
          <path d="M132 35 v57 q0 8 8 8" stroke="#9db8d6" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        </g>
      </g>
    </svg>`;
}

/* stageKey … CHAPPY_STAGES のキー
   wear     … chappyEquipped() の戻り値（省略可） */
export function chappySVG(stageKey, wear){
  return stageKey === "egg" ? chappyEggSVG() : chappyBodySVG(stageKey, wear);
}
