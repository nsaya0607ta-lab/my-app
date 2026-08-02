const assert = require("node:assert/strict");
const {
  normalize,
  answerVariants,
  matchAnswer,
} = require("../api/_lib/textMatch");

const candidates = [
  { field: "title", value: "紅蓮華" },
  { field: "titleKana", value: "ぐれんげ" },
  { field: "titleRomaji", value: "Gurenge" },
];

assert.equal(normalize(" グレンゲ！ "), "ぐれんげ");
assert.deepEqual(answerVariants("答えはグレンゲです"), ["答えはぐれんげです", "ぐれんげ"]);

const exactKana = matchAnswer("グレンゲ", candidates);
assert.equal(exactKana.exact, true);
assert.equal(exactKana.confident, true);

const spokenPhrase = matchAnswer("えっと、答えは ぐれんげ です", candidates);
assert.equal(spokenPhrase.exact, true);

const oneSoundOff = matchAnswer("ぐれんけ", candidates);
assert.equal(oneSoundOff.exact, false);
assert.equal(oneSoundOff.confident, true);
assert.equal(oneSoundOff.distance, 1);

const shortCandidates = [{ field: "titleKana", value: "はる" }];
const unsafeShortMatch = matchAnswer("はれ", shortCandidates);
assert.equal(unsafeShortMatch.confident, false);

const unrelated = matchAnswer("まったくちがう", candidates);
assert.equal(unrelated.exact, false);
assert.equal(unrelated.confident, false);
assert.ok(unrelated.score < 0.65);

console.log("intro quiz text matching: ok");
