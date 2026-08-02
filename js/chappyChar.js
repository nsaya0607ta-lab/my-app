/* =========================================================================
   🏠 チャッピーハウス：キャラクター「まるチャピ」の描画（⑩ 成長システム）

   ・完全オリジナルの手続き生成SVG（白くて丸い小動物・水色の垂れ耳・
     ピンクのほっぺ・つぶらな目・首元に星の飾り）。外部画像は使わない。
   ・成長段階（たまご→赤ちゃん→子ども→成長体→大人→マスター）で大きさ・
     飾り・オーラが少しずつ変わる。
   ・着せ替え（衣装・帽子・アクセサリー・メガネ・くつ）は本体の上に重ねて
     描画する。衣装は色つきの服のかたち、小物は絵文字を配置する。
   ・表情・ポーズはSVG内に全パターンを持ち、外側のラッパーclassで切り替える：
       .chp-face-happy  … にっこり目   .chp-face-sleepy … ねむそうな目＋Zzz
       .chp-pose-hungry … お腹を押さえる手
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

  // 衣装：体の下半分を服の色でぬる（袖もすこしだけ）
  const outfit = wear.outfit;
  if(outfit && outfit.color){
    under.push(`
      <g class="chp-wear-outfit">
        <path d="M56 122 C56 156 76 172 100 172 C124 172 144 156 144 122 C130 132 112 136 100 136 C88 136 70 132 56 122Z"
              fill="${outfit.color}" opacity=".95"/>
        <path d="M56 122 q44 16 88 0" stroke="rgba(255,255,255,.55)" stroke-width="3" fill="none"/>
      </g>`);
    over.push(`<text class="chp-wear-badge" x="100" y="160" text-anchor="middle" font-size="17">${outfit.icon}</text>`);
  }
  // メガネ：目の上に重ねる
  if(wear.glasses && wear.glasses.cute > 0){
    over.push(`<text class="chp-wear-glasses" x="100" y="112" text-anchor="middle" font-size="34">${wear.glasses.icon}</text>`);
  }
  // 帽子：頭のうえ
  if(wear.hat && wear.hat.cute > 0){
    over.push(`<text class="chp-wear-hat" x="100" y="62" text-anchor="middle" font-size="38">${wear.hat.icon}</text>`);
  }
  // アクセサリー：首元
  if(wear.acc && wear.acc.cute > 0){
    over.push(`<text class="chp-wear-acc" x="126" y="150" text-anchor="middle" font-size="24">${wear.acc.icon}</text>`);
  }
  // くつ：足元に左右ひとつずつ
  if(wear.shoes && wear.shoes.cute > 0){
    over.push(`<text class="chp-wear-shoe" x="76" y="180" text-anchor="middle" font-size="20">${wear.shoes.icon}</text>`);
    over.push(`<text class="chp-wear-shoe" x="124" y="180" text-anchor="middle" font-size="20">${wear.shoes.icon}</text>`);
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
  const ty = 172 - 172 * scale;
  const layers = wearLayers(wear);

  return `
    <svg viewBox="0 0 200 200" class="chp-svg" aria-hidden="true">
      <ellipse class="chp-shadow" cx="100" cy="176" rx="${(48 * scale).toFixed(1)}" ry="8"/>
      <g class="chp-body-g" transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${scale})">
        ${master ? `<circle class="chp-aura" cx="100" cy="112" r="76" fill="none" stroke="#f7d774" stroke-width="2" stroke-dasharray="5 9" opacity=".7"/>` : ""}
        <!-- しっぽ（小さく丸い） -->
        <circle cx="154" cy="138" r="11" fill="#ffffff" stroke="#e5edf5" stroke-width="3"/>
        <!-- 垂れ耳（水色） -->
        <g class="chp-ears">
          <path d="M64 62 C46 58 36 78 44 96 C50 108 62 108 68 96 C72 86 70 72 64 62Z"
                fill="#aadcf5" stroke="#8ecbec" stroke-width="2.5"/>
          <path d="M136 62 C154 58 164 78 156 96 C150 108 138 108 132 96 C128 86 130 72 136 62Z"
                fill="#aadcf5" stroke="#8ecbec" stroke-width="2.5"/>
          <path d="M60 70 C52 72 48 84 52 92 C55 98 61 97 64 90 C66 83 64 75 60 70Z" fill="#cceefb"/>
          <path d="M140 70 C148 72 152 84 148 92 C145 98 139 97 136 90 C134 83 136 75 140 70Z" fill="#cceefb"/>
        </g>
        <!-- 本体（白くて丸い・もちもち） -->
        <path d="M100 52 C142 52 160 86 160 118 C160 152 134 172 100 172 C66 172 40 152 40 118 C40 86 58 52 100 52Z"
              fill="#ffffff" stroke="#e5edf5" stroke-width="3.5"/>
        ${layers.under}
        <!-- 足（短い） -->
        <ellipse cx="76" cy="169" rx="14" ry="8" fill="#ffffff" stroke="#e5edf5" stroke-width="3"/>
        <ellipse cx="124" cy="169" rx="14" ry="8" fill="#ffffff" stroke="#e5edf5" stroke-width="3"/>
        <!-- 手（通常：体の横） -->
        <g class="chp-arms-normal">
          <ellipse cx="47" cy="132" rx="9" ry="12" fill="#ffffff" stroke="#e5edf5" stroke-width="3"/>
          <ellipse cx="153" cy="132" rx="9" ry="12" fill="#ffffff" stroke="#e5edf5" stroke-width="3"/>
        </g>
        <!-- 手（空腹：お腹を押さえる） -->
        <g class="chp-arms-hungry">
          <ellipse cx="82" cy="146" rx="10" ry="9" fill="#ffffff" stroke="#e5edf5" stroke-width="3"/>
          <ellipse cx="118" cy="146" rx="10" ry="9" fill="#ffffff" stroke="#e5edf5" stroke-width="3"/>
        </g>
        <!-- ほっぺ（薄ピンク） -->
        <ellipse cx="${baby ? 68 : 66}" cy="118" rx="${baby ? 12 : 10}" ry="${baby ? 8 : 7}" fill="#fbd0da"/>
        <ellipse cx="${baby ? 132 : 134}" cy="118" rx="${baby ? 12 : 10}" ry="${baby ? 8 : 7}" fill="#fbd0da"/>
        <!-- 目（つぶらな黒目）：通常／にっこり／ねむい を切り替え -->
        <g class="chp-eyes-normal">
          <circle cx="82" cy="104" r="${baby ? 7 : 6}" fill="#3d3d3d"/><circle cx="84" cy="102" r="2" fill="#ffffff"/>
          <circle cx="118" cy="104" r="${baby ? 7 : 6}" fill="#3d3d3d"/><circle cx="120" cy="102" r="2" fill="#ffffff"/>
        </g>
        <g class="chp-eyes-happy">
          <path d="M75 105 q7 -8 14 0" stroke="#3d3d3d" stroke-width="3.5" fill="none" stroke-linecap="round"/>
          <path d="M111 105 q7 -8 14 0" stroke="#3d3d3d" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        </g>
        <g class="chp-eyes-sleepy">
          <path d="M75 104 q7 4 14 0" stroke="#3d3d3d" stroke-width="3.5" fill="none" stroke-linecap="round"/>
          <path d="M111 104 q7 4 14 0" stroke="#3d3d3d" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        </g>
        <!-- 口（小さな「ω」） -->
        <path class="chp-mouth" d="M94 116 q3 4 6 0 q3 4 6 0" stroke="#c98a96" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <!-- 首元の飾り：星（成長するほど少し豪華になる） -->
        ${fancy ? `<path d="M86 156 q14 8 28 0 l-4 10 q-10 5 -20 0Z" fill="#fbd0da" stroke="#f3b7c6" stroke-width="2"/>` : ""}
        ${master ? `<path d="M64 150 q36 22 72 0 l6 16 q-42 22 -84 0Z" fill="#cfe0ff" stroke="#aec6ee" stroke-width="2" opacity=".85"/>` : ""}
        <path d="${starPath(100, fancy ? 158 : 156, master ? 11 : adult ? 10 : fancy ? 9 : 7)}" fill="#f7d774" stroke="#eec659" stroke-width="1.5"/>
        ${layers.over}
        <!-- Zzz（ねむい時のみ表示） -->
        <g class="chp-zzz" fill="#9db8d6" font-size="16" font-weight="700" font-family="sans-serif">
          <text x="146" y="66">z</text><text x="156" y="52" font-size="20">Z</text>
        </g>
        <!-- ☔（ホームの雨の日のみ表示：小さな傘） -->
        <g class="chp-umbrella">
          <path d="M158 40 q-26 -18 -52 0 q6 -22 26 -22 q20 0 26 22Z" fill="#aadcf5" stroke="#8ecbec" stroke-width="2"/>
          <path d="M132 40 v56 q0 8 8 8" stroke="#9db8d6" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        </g>
      </g>
    </svg>`;
}

/* stageKey … CHAPPY_STAGES のキー
   wear     … chappyEquipped() の戻り値（省略可） */
export function chappySVG(stageKey, wear){
  return stageKey === "egg" ? chappyEggSVG() : chappyBodySVG(stageKey, wear);
}
