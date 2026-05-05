import { normalizeWord, splitSyllables, tokenize } from "./syllables.js";

const FRENCH_ORIGIN_ADJECTIVES = new Set([
  "antique",
  "chic",
  "elite",
  "mature",
  "obscure",
  "polite",
  "precise",
  "severe",
  "sincere",
  "unique"
]);

const FUNCTION_WORD_SCHWA = new Map([
  ["a", { phoneme: "/ə/", note: "The article 'a' is normally reduced to /ə/." }],
  ["an", { phoneme: "/ən/", note: "The article 'an' often uses a schwa before the final /n/." }],
  ["the", { phoneme: "/ðə/", note: "'The' is often /ðə/ before a consonant sound." }],
  ["to", { phoneme: "/tə/", note: "'To' is often reduced to /tə/ in connected speech." }],
  ["of", { phoneme: "/əv/", note: "'Of' commonly contains schwa in weak form." }],
  ["can", { phoneme: "/kən/", note: "'Can' is often reduced when it is not emphasized." }]
]);

export function analyzeStress(input) {
  const expectedWords = tokenize(input.expectedText);
  const transcriptWords = tokenize(input.transcript);
  const observedByWord = new Map(
    (input.words ?? []).map((entry) => [normalizeWord(entry.word), entry])
  );

  const words = expectedWords.map((word, index) => {
    const observed = observedByWord.get(word) ?? {};
    const partOfSpeech = normalizePartOfSpeech(observed.partOfSpeech);
    const syllables = splitSyllables(word);
    const expected = expectedStressForWord(word, syllables, partOfSpeech);
    const observedStress = resolveObservedStress(observed);
    const status = stressStatus(expected.index, observedStress);
    const schwa = schwaTargetsForWord(word, syllables, expected.index, observed);

    return {
      word,
      transcriptWord: transcriptWords[index] ?? null,
      partOfSpeech,
      syllables,
      expectedStress: expected.index,
      expectedStressHuman: expected.index === null ? null : expected.index + 1,
      rule: expected.rule,
      observedStress,
      observedStressHuman: observedStress === null ? null : observedStress + 1,
      status,
      schwa
    };
  });

  return {
    ok: true,
    summary: summarize(words),
    words
  };
}

export function expectedStressForWord(word, syllables = splitSyllables(word), partOfSpeech) {
  const normalized = normalizeWord(word);
  const count = syllables.length;

  if (count <= 1) {
    return {
      index: 0,
      rule: "One-syllable words carry their main stress on the only syllable."
    };
  }

  const suffixRule = suffixStressRule(normalized, count);
  if (suffixRule) {
    return suffixRule;
  }

  if (count === 2 && partOfSpeech === "verb") {
    return {
      index: 1,
      rule: "Most 2-syllable verbs are stressed on the second syllable."
    };
  }

  if (count === 2 && partOfSpeech === "adjective") {
    if (normalized.startsWith("a") || FRENCH_ORIGIN_ADJECTIVES.has(normalized)) {
      return {
        index: 1,
        rule: "Adjectives of French origin or starting with a- are often stressed on the second syllable."
      };
    }

    return {
      index: 0,
      rule: "Most 2-syllable adjectives are stressed on the first syllable."
    };
  }

  if (count === 2 && (!partOfSpeech || partOfSpeech === "noun")) {
    return {
      index: 0,
      rule: "Most 2-syllable nouns are stressed on the first syllable."
    };
  }

  if (partOfSpeech === "verb") {
    return {
      index: Math.floor(count / 2),
      rule: "Longer verbs often carry stress near the middle syllable."
    };
  }

  if (partOfSpeech === "noun") {
    return {
      index: 0,
      rule: "Nouns often stress the first syllable when no stronger suffix rule applies."
    };
  }

  return {
    index: 0,
    rule: "Default teaching rule: stress the first syllable when no stronger pattern applies."
  };
}

function suffixStressRule(word, syllableCount) {
  if (/(tion|sion)$/.test(word) && syllableCount >= 2) {
    return {
      index: Math.max(0, syllableCount - 2),
      rule: "Words ending in -tion or -sion usually stress the syllable before the ending."
    };
  }

  if (/ic$/.test(word) && syllableCount >= 2) {
    return {
      index: Math.max(0, syllableCount - 2),
      rule: "Words ending in -ic usually stress the syllable before -ic."
    };
  }

  if (/ity$/.test(word) && syllableCount >= 3) {
    return {
      index: Math.max(0, syllableCount - 3),
      rule: "Words ending in -ity usually stress the syllable before the -ity ending."
    };
  }

  return null;
}

function normalizePartOfSpeech(value) {
  const normalized = String(value ?? "").toLowerCase();
  if (["v", "verb"].includes(normalized)) return "verb";
  if (["n", "noun"].includes(normalized)) return "noun";
  if (["adj", "adjective"].includes(normalized)) return "adjective";
  return null;
}

function resolveObservedStress(observed) {
  if (Number.isInteger(observed.observedStress)) {
    return observed.observedStress;
  }

  if (Array.isArray(observed.syllableStress) && observed.syllableStress.length > 0) {
    let maxIndex = 0;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < observed.syllableStress.length; i += 1) {
      const value = Number(observed.syllableStress[i]);
      if (Number.isFinite(value) && value > max) {
        max = value;
        maxIndex = i;
      }
    }
    return maxIndex;
  }

  return null;
}

function stressStatus(expectedStress, observedStress) {
  if (observedStress === null || expectedStress === null) return "unknown";
  return expectedStress === observedStress ? "match" : "needs_attention";
}

function schwaTargetsForWord(word, syllables, expectedStress, observed) {
  const normalized = normalizeWord(word);
  const functionWord = FUNCTION_WORD_SCHWA.get(normalized);
  const targets = [];

  if (functionWord) {
    targets.push({
      syllableIndex: 0,
      syllable: syllables[0] ?? normalized,
      expected: functionWord.phoneme,
      status: schwaStatus(observed),
      note: functionWord.note
    });
  }

  syllables.forEach((syllable, index) => {
    if (index !== expectedStress && /[aeiou]/.test(syllable) && syllable.length <= 3) {
      targets.push({
        syllableIndex: index,
        syllable,
        expected: "/ə/",
        status: schwaStatus(observed),
        note: "Short unstressed vowel syllables are common schwa candidates."
      });
    }
  });

  return dedupeSchwaTargets(targets);
}

function schwaStatus(observed) {
  if (!observed.phonemes) return "target";
  return /(ə|AH0|AX)/i.test(String(observed.phonemes)) ? "heard" : "not_heard";
}

function dedupeSchwaTargets(targets) {
  const seen = new Set();
  return targets.filter((target) => {
    const key = `${target.syllableIndex}:${target.expected}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summarize(words) {
  return {
    wordsAnalyzed: words.length,
    matches: words.filter((word) => word.status === "match").length,
    needsAttention: words.filter((word) => word.status === "needs_attention").length,
    unknown: words.filter((word) => word.status === "unknown").length,
    schwaTargets: words.reduce((sum, word) => sum + word.schwa.length, 0)
  };
}
