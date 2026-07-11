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
  const a = normalize(rawA), b = normalize(rawB);
  if (!a && !b) return 1;
  const maxLen = Math.max(a.length, b.length, 1);
  return 1 - levenshtein(a, b) / maxLen;
}

// answerText を候補フィールド群（曲名・カナ・ローマ字・英語表記など）と比較し、
// 最も一致度が高いものを返す。
//   candidates: [{ field: "title", value: "紅蓮華" }, ...]
// 戻り値: { exact, score(0-1), field, value }
function matchAnswer(answerText, candidates) {
  const normalizedInput = normalize(answerText);
  let best = { exact: false, score: 0, field: null, value: null };
  if (!normalizedInput) return best;
  for (const c of candidates || []) {
    if (!c || !c.value) continue;
    const normalizedCandidate = normalize(c.value);
    if (!normalizedCandidate) continue;
    if (normalizedCandidate === normalizedInput) {
      return { exact: true, score: 1, field: c.field, value: c.value };
    }
    const score = similarity(answerText, c.value);
    if (score > best.score) best = { exact: false, score, field: c.field, value: c.value };
  }
  return best;
}

module.exports = { normalize, katakanaToHiragana, levenshtein, similarity, matchAnswer };
