// イントロドンの自由回答（テキスト入力）を判定するための表記ゆれ吸収ユーティリティ。
//
// 「英語表記・ローマ字でも正解にする」判定は、この関数による正規化・類似度計算
// だけで実現するのではなく、楽曲マスター側に titleKana/titleRomaji/titleEn を
// 持たせる設計とセットで機能する。日本語の曲名の正式なローマ字表記（例：
// 「紅蓮華」→"Gurenge"）は一般的な変換ルールでは再現できない固有の表記が
// 多いため、アルゴリズムによる自動変換ではなくマスターデータで持つ方針とした。
// ここでの正規化はあくまで「同じ表記のゆらぎ」（全角/半角・大文字/小文字・
// カタカナ/ひらがな・記号の有無）を吸収するためのもの。

const KATAKANA_START = 0x30a1; // ァ
const KATAKANA_END = 0x30f6;   // ヶ
const HIRAGANA_OFFSET = 0x30a1 - 0x3041; // カタカナ→ひらがなのコードポイント差

function katakanaToHiragana(str) {
  let out = "";
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (code >= KATAKANA_START && code <= KATAKANA_END) {
      out += String.fromCodePoint(code - HIRAGANA_OFFSET);
    } else {
      out += ch;
    }
  }
  return out;
}

// 判定に使う記号・空白类（曲名によく含まれるものだけを対象にする）
const STRIP_CHARS_RE = /[「」『』・･\-ー_\s!！?？.。,、'’"”()（）\[\]【】~〜:：]/g;

// 入力文字列を判定用に正規化する：
//   1) Unicode NFKC正規化（全角英数字・記号 → 半角化）
//   2) 小文字化
//   3) カタカナ → ひらがな化
//   4) 記号・空白の除去
function normalize(str) {
  if (!str) return "";
  const nfkc = String(str).normalize("NFKC").toLowerCase();
  const hira = katakanaToHiragana(nfkc);
  return hira.replace(STRIP_CHARS_RE, "").trim();
}

// 音声回答に付きやすい「答えは〜です」などを外した比較候補も作る。
// 正式な曲名そのものは変更せず、入力側だけに適用する。
function answerVariants(str) {
  const normalized = normalize(str);
  if (!normalized) return [];
  const withoutFraming = normalized
    .replace(/^(?:えっと|あの|たぶん|おそらく)+/, "")
    .replace(/^(?:こたえ|答え|きょくめい|曲名)(?:は|わ)?/, "")
    .replace(/(?:です|だよ|だとおもいます|だと思います|とおもいます|と思います|かな)+$/, "");
  return Array.from(new Set([normalized, withoutFraming].filter(Boolean)));
}

// 音声認識で揺れやすい、読みとしてほぼ同じ文字だけを寄せる。
// 濁点を一律に外すような強すぎる変換は誤正解を増やすため行わない。
function looseReadingKey(str) {
  return normalize(str)
    .replace(/[ぁ]/g, "あ").replace(/[ぃ]/g, "い")
    .replace(/[ぅ]/g, "う").replace(/[ぇ]/g, "え").replace(/[ぉ]/g, "お")
    .replace(/[ゃ]/g, "や").replace(/[ゅ]/g, "ゆ").replace(/[ょ]/g, "よ")
    .replace(/[ゎ]/g, "わ").replace(/を/g, "お")
    .replace(/づ/g, "ず").replace(/ぢ/g, "じ").replace(/ゔ/g, "ぶ");
}

// レーベンシュタイン距離（編集距離）。O(n*m)の2行だけ保持するDP実装
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,       // 削除
        curr[j - 1] + 1,   // 挿入
        prev[j - 1] + cost // 置換
      );
    }
    const tmp = prev; prev = curr; curr = tmp;
  }
  return prev[n];
}

// 0〜1の類似度（1が完全一致）。正規化した文字列同士を比較し、長さで割ることで
// 曲名の長短によるバイアスを抑える
function similarity(rawA, rawB) {
  const a = looseReadingKey(rawA), b = looseReadingKey(rawB);
  if (!a && !b) return 1;
  const maxLen = Math.max(a.length, b.length, 1);
  return 1 - levenshtein(a, b) / maxLen;
}

// answerText を候補フィールド群（曲名・カナ・ローマ字・英語表記など）と比較し、
// 最も一致度が高いものを返す。
//   candidates: [{ field: "title", value: "紅蓮華" }, ...]
// 戻り値: { exact, score(0-1), field, value }
function matchAnswer(answerText, candidates) {
  const inputs = answerVariants(answerText);
  let best = {
    exact: false, confident: false, score: 0, distance: Infinity,
    inputLength: 0, candidateLength: 0, field: null, value: null,
  };
  if (!inputs.length) return best;
  for (const c of candidates || []) {
    if (!c || !c.value) continue;
    const normalizedCandidate = normalize(c.value);
    if (!normalizedCandidate) continue;
    for (const input of inputs) {
      if (normalizedCandidate === input) {
        return {
          exact: true, confident: true, score: 1, distance: 0,
          inputLength: input.length, candidateLength: normalizedCandidate.length,
          field: c.field, value: c.value,
        };
      }
      // 「YOASOBI 夜に駆ける」のように、正式なタイトルの前後にアーティスト名や
      // 「歌ってください」等の余計な語が付いていても、タイトルそのものが丸ごと
      // 含まれていれば正解にする（音声認識結果は特にこの形になりやすい）
      if (normalizedCandidate.length >= 2 && input.includes(normalizedCandidate)) {
        return {
          exact: true, confident: true, score: 1, distance: 0,
          inputLength: input.length, candidateLength: normalizedCandidate.length,
          field: c.field, value: c.value,
        };
      }

      const inputKey = looseReadingKey(input);
      const candidateKey = looseReadingKey(normalizedCandidate);
      const distance = levenshtein(inputKey, candidateKey);
      const maxLength = Math.max(inputKey.length, candidateKey.length, 1);
      const score = 1 - distance / maxLength;
      const candidateLength = candidateKey.length;
      // 4文字以上の曲名は1文字、8文字以上なら2文字までの聞き違いを自動で
      // 正解にする。短い曲名は別の曲と衝突しやすいため完全一致を優先する。
      const confident = (candidateLength >= 4 && distance <= 1)
        || (candidateLength >= 8 && distance <= 2 && score >= 0.75);
      if (score > best.score || (score === best.score && distance < best.distance)) {
        best = {
          exact: false, confident, score, distance,
          inputLength: inputKey.length, candidateLength,
          field: c.field, value: c.value,
        };
      }
    }
  }
  return best;
}

module.exports = {
  normalize, answerVariants, looseReadingKey,
  katakanaToHiragana, levenshtein, similarity, matchAnswer,
};
