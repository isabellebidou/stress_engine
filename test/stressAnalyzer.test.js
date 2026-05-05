import assert from "node:assert/strict";
import test from "node:test";
import { analyzeStress, expectedStressForWord } from "../src/stressAnalyzer.js";
import { splitSyllables } from "../src/syllables.js";

test("2-syllable verbs default to second-syllable stress", () => {
  const result = expectedStressForWord("record", ["re", "cord"], "verb");
  assert.equal(result.index, 1);
});

test("2-syllable nouns default to first-syllable stress", () => {
  const result = expectedStressForWord("record", ["re", "cord"], "noun");
  assert.equal(result.index, 0);
});

test("French-origin and a-start adjectives can stress the second syllable", () => {
  assert.equal(expectedStressForWord("polite", ["po", "lite"], "adjective").index, 1);
  assert.equal(expectedStressForWord("afraid", ["a", "fraid"], "adjective").index, 1);
});

test("suffix rules take priority", () => {
  assert.equal(expectedStressForWord("nation", ["na", "tion"], "noun").index, 0);
  assert.equal(expectedStressForWord("specific", ["spe", "cif", "ic"], "adjective").index, 1);
  assert.equal(expectedStressForWord("ability", ["a", "bil", "i", "ty"], "noun").index, 1);
});

test("analyzeStress compares observed stress scores", () => {
  const result = analyzeStress({
    expectedText: "record",
    transcript: "record",
    words: [{ word: "record", partOfSpeech: "verb", syllableStress: [0.2, 0.9] }]
  });

  assert.equal(result.words[0].status, "match");
  assert.equal(result.summary.matches, 1);
});

test("analyzeStress marks schwa targets and heard schwa phonemes", () => {
  const result = analyzeStress({
    expectedText: "a polite introduction",
    transcript: "a polite introduction",
    words: [
      { word: "a", phonemes: "AH0" },
      { word: "polite", partOfSpeech: "adjective", phonemes: "P AH0 L AY1 T" }
    ]
  });

  assert.equal(result.words[0].schwa[0].expected, "/ə/");
  assert.equal(result.words[0].schwa[0].status, "heard");
  assert.ok(result.summary.schwaTargets >= 2);
});

test("syllable splitter handles common examples", () => {
  assert.deepEqual(splitSyllables("record"), ["re", "cord"]);
  assert.deepEqual(splitSyllables("teacher"), ["teach", "er"]);
});
