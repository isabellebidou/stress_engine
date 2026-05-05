import assert from "node:assert/strict";
import test from "node:test";
import { analyzeAudioStress } from "../index.js";
import { decodeWav } from "../src/wav.js";

test("decodeWav reads generated 16-bit PCM WAV", () => {
  const wav = decodeWav(makeWav([0.2, 0.8]));
  assert.equal(wav.sampleRate, 16000);
  assert.equal(wav.channelCount, 1);
  assert.equal(wav.durationMs, 400);
  assert.ok(wav.samples.length > 0);
});

test("analyzeAudioStress returns the stable minimal module response", async () => {
  const audioBase64 = makeWav([0.18, 0.9]).toString("base64");
  const result = await analyzeAudioStress({
    expectedText: "polite",
    audioBase64,
    elevenLabs: {
      text: "polite",
      words: [{ text: "polite", start: 0, end: 0.4 }]
    }
  });

  assert.deepEqual(Object.keys(result).sort(), ["ok", "summary", "words"]);
  assert.deepEqual(result.summary, {
    wordsAnalyzed: 1,
    matches: 1,
    mismatches: 0,
    unknown: 0
  });
  assert.deepEqual(result.words[0], {
    word: "polite",
    expectedStress: 1,
    observedStress: 1,
    status: "match"
  });
});

test("analyzeAudioStress reports mismatch when observed stress differs", async () => {
  const audioBase64 = makeWav([0.9, 0.18]).toString("base64");
  const result = await analyzeAudioStress({
    expectedText: "polite",
    audioBase64,
    elevenLabs: {
      text: "polite",
      words: [{ text: "polite", start: 0, end: 0.4 }]
    }
  });

  assert.equal(result.words[0].observedStress, 0);
  assert.equal(result.words[0].status, "mismatch");
});

test("analyzeAudioStress accepts ElevenLabs spacing tokens", async () => {
  const audioBase64 = makeWav([0.18, 0.9, 0.3]).toString("base64");
  const result = await analyzeAudioStress({
    expectedText: "polite world",
    audioBase64,
    elevenLabs: {
      language_code: "en",
      language_probability: 0.98,
      text: "polite world",
      words: [
        {
          text: "polite",
          start: 0,
          end: 0.4,
          type: "word",
          speaker_id: "speaker_1",
          logprob: -0.124
        },
        {
          text: " ",
          start: 0.4,
          end: 0.4,
          type: "spacing"
        },
        {
          text: "world!",
          start: 0.4,
          end: 0.6,
          type: "word"
        }
      ]
    }
  });

  assert.equal(result.summary.wordsAnalyzed, 2);
  assert.equal(result.words[0].word, "polite");
  assert.equal(result.words[1].word, "world");
});

test("analyzeAudioStress uses optional partsOfSpeech for ambiguous stress rules", async () => {
  const audioBase64 = makeWav([0.18, 0.9]).toString("base64");
  const result = await analyzeAudioStress({
    expectedText: "record",
    audioBase64,
    elevenLabs: {
      text: "record",
      words: [{ text: "record", start: 0, end: 0.4 }]
    },
    partsOfSpeech: {
      record: "verb"
    }
  });

  assert.deepEqual(result.words[0], {
    word: "record",
    expectedStress: 1,
    observedStress: 1,
    status: "match"
  });
});

test("analyzeAudioStress defaults 2-syllable nouns to first-syllable stress", async () => {
  const audioBase64 = makeWav([0.9, 0.18]).toString("base64");
  const result = await analyzeAudioStress({
    expectedText: "record",
    audioBase64,
    elevenLabs: {
      text: "record",
      words: [{ text: "record", start: 0, end: 0.4 }]
    },
    partsOfSpeech: {
      record: "noun"
    }
  });

  assert.equal(result.words[0].expectedStress, 0);
  assert.equal(result.words[0].status, "match");
});

test("analyzeAudioStress applies verb exceptions before verb defaults", async () => {
  const audioBase64 = makeWav([0.9, 0.18]).toString("base64");
  const result = await analyzeAudioStress({
    expectedText: "open",
    audioBase64,
    elevenLabs: {
      text: "open",
      words: [{ text: "open", start: 0, end: 0.4 }]
    },
    partsOfSpeech: {
      open: "verb"
    }
  });

  assert.equal(result.words[0].expectedStress, 0);
  assert.equal(result.words[0].status, "match");
});

test("analyzeAudioStress applies noun adjective exceptions", async () => {
  const audioBase64 = makeWav([0.18, 0.9]).toString("base64");
  const result = await analyzeAudioStress({
    expectedText: "afraid",
    audioBase64,
    elevenLabs: {
      text: "afraid",
      words: [{ text: "afraid", start: 0, end: 0.4 }]
    },
    partsOfSpeech: {
      afraid: "adjective"
    }
  });

  assert.equal(result.words[0].expectedStress, 1);
  assert.equal(result.words[0].status, "match");
});

test("analyzeAudioStress lets suffix rules override part of speech defaults", async () => {
  const audioBase64 = makeWav([0.12, 0.85, 0.2, 0.15]).toString("base64");
  const result = await analyzeAudioStress({
    expectedText: "ability",
    audioBase64,
    elevenLabs: {
      text: "ability",
      words: [{ text: "ability", start: 0, end: 0.8 }]
    },
    partsOfSpeech: {
      ability: "noun"
    }
  });

  assert.equal(result.words[0].expectedStress, 2);
  assert.equal(result.words[0].observedStress, 1);
  assert.equal(result.words[0].status, "mismatch");
});

test("analyzeAudioStress applies three syllable part of speech defaults", async () => {
  const audioBase64 = makeWav([0.12, 0.85, 0.2]).toString("base64");
  const result = await analyzeAudioStress({
    expectedText: "remember",
    audioBase64,
    elevenLabs: {
      text: "remember",
      words: [{ text: "remember", start: 0, end: 0.6 }]
    },
    partsOfSpeech: {
      remember: "verb"
    }
  });

  assert.equal(result.words[0].expectedStress, 1);
  assert.equal(result.words[0].status, "match");
});

test("analyzeAudioStress falls back gracefully for unknown words", async () => {
  const audioBase64 = makeWav([0.8, 0.2, 0.1, 0.1]).toString("base64");
  const result = await analyzeAudioStress({
    expectedText: "customword",
    audioBase64,
    elevenLabs: {
      text: "customword",
      words: [{ text: "customword", start: 0, end: 0.8 }]
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.words[0].expectedStress, 0);
});

test("analyzeAudioStress lets lexical overrides beat suffix rules", async () => {
  const audioBase64 = makeWav([0.9, 0.18, 0.12]).toString("base64");
  const result = await analyzeAudioStress({
    expectedText: "quality",
    audioBase64,
    elevenLabs: {
      text: "quality",
      words: [{ text: "quality", start: 0, end: 0.6 }]
    }
  });

  assert.equal(result.words[0].expectedStress, 0);
  assert.equal(result.words[0].status, "match");
});

test("analyzeAudioStress applies part of speech specific lexical overrides", async () => {
  const audioBase64 = makeWav([0.9, 0.18]).toString("base64");
  const result = await analyzeAudioStress({
    expectedText: "increase",
    audioBase64,
    elevenLabs: {
      text: "increase",
      words: [{ text: "increase", start: 0, end: 0.4 }]
    },
    partsOfSpeech: {
      increase: "noun"
    }
  });

  assert.equal(result.words[0].expectedStress, 0);
  assert.equal(result.words[0].status, "match");
});

test("analyzeAudioStress applies third syllable lexical overrides", async () => {
  const audioBase64 = makeWav([0.12, 0.18, 0.9, 0.15]).toString("base64");
  const result = await analyzeAudioStress({
    expectedText: "introduction",
    audioBase64,
    elevenLabs: {
      text: "introduction",
      words: [{ text: "introduction", start: 0, end: 0.8 }]
    }
  });

  assert.equal(result.words[0].expectedStress, 2);
  assert.equal(result.words[0].status, "match");
});

test("analyzeAudioStress accepts runtime stress override additions", async () => {
  const audioBase64 = makeWav([0.12, 0.9, 0.18]).toString("base64");
  const result = await analyzeAudioStress({
    expectedText: "customword",
    audioBase64,
    elevenLabs: {
      text: "customword",
      words: [{ text: "customword", start: 0, end: 0.6 }]
    },
    stressOverrides: {
      customword: 1
    }
  });

  assert.equal(result.words[0].expectedStress, 1);
  assert.equal(result.words[0].status, "match");
});

test("analyzeAudioStress accepts runtime stress override removals", async () => {
  const audioBase64 = makeWav([0.12, 0.9, 0.18]).toString("base64");
  const result = await analyzeAudioStress({
    expectedText: "quality",
    audioBase64,
    elevenLabs: {
      text: "quality",
      words: [{ text: "quality", start: 0, end: 0.6 }]
    },
    stressOverrides: {
      quality: null
    }
  });

  assert.equal(result.words[0].expectedStress, 1);
  assert.equal(result.words[0].status, "match");
});

test("analyzeAudioStress never throws for invalid input", async () => {
  const result = await analyzeAudioStress({
    expectedText: "polite",
    audioBase64: "not-a-wav",
    elevenLabs: {
      text: "polite",
      words: [{ text: "polite", start: 0, end: 0.4 }]
    }
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /WAV/);
});

function makeWav(amplitudes) {
  const sampleRate = 16000;
  const secondsPerSyllable = 0.2;
  const samplesPerSyllable = sampleRate * secondsPerSyllable;
  const sampleCount = samplesPerSyllable * amplitudes.length;
  const bytes = Buffer.alloc(44 + sampleCount * 2);

  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(36 + sampleCount * 2, 4);
  bytes.write("WAVE", 8);
  bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(sampleCount * 2, 40);

  for (let i = 0; i < sampleCount; i += 1) {
    const syllableIndex = Math.floor(i / samplesPerSyllable);
    const amplitude = amplitudes[syllableIndex] ?? 0.1;
    const envelope = Math.sin((Math.PI * (i % samplesPerSyllable)) / samplesPerSyllable);
    const value = Math.sin((2 * Math.PI * 180 * i) / sampleRate) * amplitude * envelope;
    bytes.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }

  return bytes;
}
