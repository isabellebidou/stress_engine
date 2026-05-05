import { normalizeWord } from "./syllables.js";

export function normalizeSpeechInput(input) {
  const elevenLabs = input.elevenLabs ?? input.elevenlabs ?? input.speechToText;
  if (!elevenLabs) {
    return {
      ...input,
      transcript: input.transcript ?? input.text ?? ""
    };
  }

  const elevenWords = Array.isArray(elevenLabs.words) ? elevenLabs.words : [];
  const words = elevenWords
    .filter((word) => word?.type === "word")
    .map((word) => ({
      word: normalizeWord(word.text),
      originalText: word.text,
      startMs: secondsToMs(word.start),
      endMs: secondsToMs(word.end),
      speakerId: word.speaker_id ?? null,
      logprob: Number.isFinite(word.logprob) ? word.logprob : null,
      source: "elevenlabs"
    }))
    .filter((word) => word.word && Number.isFinite(word.startMs) && Number.isFinite(word.endMs));

  const partOfSpeechByWord = new Map(
    (input.words ?? []).map((word) => [normalizeWord(word.word ?? word.text), word.partOfSpeech])
  );

  return {
    ...input,
    transcript: input.transcript ?? elevenLabs.text ?? "",
    languageCode: input.languageCode ?? elevenLabs.language_code ?? null,
    languageProbability: input.languageProbability ?? elevenLabs.language_probability ?? null,
    words: words.map((word) => ({
      ...word,
      partOfSpeech: partOfSpeechByWord.get(word.word) ?? null
    }))
  };
}

function secondsToMs(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
}
