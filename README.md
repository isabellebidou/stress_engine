# Pronunciation Stress Module

Reusable Node module for an English teaching app. It predicts expected word stress from teachable rules and compares it with observed syllable prominence from WAV audio plus ElevenLabs word timings.

The module intentionally has no runtime dependencies, so it can be embedded inside an existing Node app.

## Module Usage

```js
import { analyzeAudioStress } from "pronunciation-stress-api";

const result = await analyzeAudioStress({
  expectedText: "Hello world!",
  audioBase64: "UklGR...",
  elevenLabs: {
    text: "Hello world!",
    words: [
      { text: "Hello", start: 0, end: 0.5 },
      { text: "world!", start: 0.5, end: 1.2 }
    ]
  }
});
```

Input:

```js
{
  expectedText: string,
  audioBase64: string,
  elevenLabs: {
    text: string,
    words: Array<{ text: string, start: number, end: number }>
  },
  partsOfSpeech?: {
    [word: string]: "noun" | "verb" | "adjective"
  },
  stressOverrides?: {
    [word: string]: number | null | {
      noun?: number,
      verb?: number,
      adjective?: number
    }
  }
}
```

Optional `partsOfSpeech` helps the module choose the right expected stress for ambiguous words. For example, `record` as a noun is usually `RE-cord`, while `record` as a verb is usually `re-CORD`.

```js
const result = await analyzeAudioStress({
  expectedText: "I record my voice",
  audioBase64: "UklGR...",
  elevenLabs: {
    text: "I record my voice",
    words: [
      { text: "I", start: 0, end: 0.15 },
      { text: "record", start: 0.2, end: 0.75 },
      { text: "my", start: 0.8, end: 0.95 },
      { text: "voice", start: 1, end: 1.35 }
    ]
  },
  partsOfSpeech: {
    record: "verb"
  }
});
```

Accepted values are `"noun"`, `"verb"`, and `"adjective"`. You only need to include words where part of speech matters or where your grammar engine already knows it.

Rule priority:

1. Lexical overrides in `STRESS_OVERRIDES` win first, including part-of-speech-specific overrides such as noun `increase`.
2. Suffix rules apply next: `-tion`, `-sion`, `-ic`, and `-ity` use the configured relative stress.
3. If `partsOfSpeech` is provided, the matching part-of-speech branch is used.
4. Structured exceptions override the default for that branch, such as verb `open` using first-syllable stress.
5. Unknown words fall back gracefully to first-syllable stress instead of throwing.

The built-in override list lives in `core/stressOverrides.js` as `DEFAULT_STRESS_OVERRIDES`. Add or remove permanent entries there.

You can also add, replace, or remove overrides per request with `stressOverrides`:

```js
const result = await analyzeAudioStress({
  expectedText: "quality customword",
  audioBase64: "UklGR...",
  elevenLabs: {
    text: "quality customword",
    words: [
      { text: "quality", start: 0, end: 0.6 },
      { text: "customword", start: 0.7, end: 1.3 }
    ]
  },
  stressOverrides: {
    quality: null,       // remove built-in override for this request
    customword: 1,        // add general override: second syllable
    increase: { noun: 0, verb: 1 }
  }
});
```

Override values use zero-based indexes: `0` means first syllable, `1` means second, and `2` means third.

Output:

```js
{
  ok: boolean,
  summary: {
    wordsAnalyzed: number,
    matches: number,
    mismatches: number,
    unknown: number
  },
  words: [
    {
      word: string,
      expectedStress: number | null,
      observedStress: number | null,
      status: "match" | "mismatch" | "unknown"
    }
  ]
}
```

Errors are returned, never thrown:

```js
{
  ok: false,
  error: "audioBase64 must contain a WAV file."
}
```

## Optional HTTP Wrapper

## Run

```bash
npm start
```

The API listens on `http://127.0.0.1:4317` by default.

Set a different port with:

```bash
PORT=5000 npm start
```

## Text-Only Stress Endpoint

`POST /analyze-stress`

```json
{
  "expectedText": "I record a polite introduction",
  "transcript": "I record a polite introduction",
  "words": [
    { "word": "record", "partOfSpeech": "verb", "syllableStress": [0.2, 0.86] },
    { "word": "polite", "partOfSpeech": "adjective", "syllableStress": [0.22, 0.79] },
    { "word": "introduction", "phonemes": "IH2 N T R AH0 D AH1 K SH AH0 N" }
  ]
}
```

Response:

```json
{
  "ok": true,
  "summary": {
    "wordsAnalyzed": 5,
    "matches": 2,
    "needsAttention": 0,
    "schwaTargets": 3
  },
  "words": [
    {
      "word": "record",
      "partOfSpeech": "verb",
      "syllables": ["re", "cord"],
      "expectedStress": 1,
      "rule": "Most 2-syllable verbs are stressed on the second syllable.",
      "observedStress": 1,
      "status": "match",
      "schwa": []
    }
  ]
}
```

## Notes

Speech-to-text normally returns words, not acoustic stress or vowel quality. For real stress feedback, pass one of these per word when available:

- `syllableStress`: numeric energy/pitch/prominence scores per syllable
- `observedStress`: zero-based stressed syllable index
- `phonemes`: recognized phoneme string, where `/ə/` can be represented as `ə`, `AH0`, or `AX`

Without those signals, the API still returns the expected stress and schwa teaching targets, but marks observed stress as `unknown`.

## React/Node Client Example

```js
const response = await fetch("http://127.0.0.1:4317/analyze-stress", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    expectedText,
    transcript,
    words: speechWords
  })
});

const feedback = await response.json();
```

`speechWords` can come from your existing speech pipeline. If you only have speech-to-text today, send `expectedText` and `transcript` first, then add `syllableStress` or `phonemes` later when your recorder/ASR provider exposes them.

## Analyze Real Audio Speech Endpoint

`POST /analyze-audio-stress`

This endpoint is a thin wrapper around the module. It accepts raw base64 WAV audio and an ElevenLabs response.

```json
{
  "expectedText": "record",
  "audioBase64": "UklGR...",
  "elevenLabs": {
    "text": "record",
    "words": [
      {
        "text": "record",
        "start": 0,
        "end": 0.9
      }
    ]
  }
}
```

### ElevenLabs Speech-to-Text Input

You can send the ElevenLabs response directly under `elevenLabs`. The module filters out `spacing` tokens and converts `start` / `end` seconds to milliseconds internally.

```json
{
  "expectedText": "Hello world!",
  "audioBase64": "UklGR...",
  "elevenLabs": {
    "language_code": "en",
    "language_probability": 0.98,
    "text": "Hello world!",
    "words": [
      {
        "text": "Hello",
        "start": 0,
        "end": 0.5,
        "type": "word",
        "speaker_id": "speaker_1",
        "logprob": -0.124
      },
      {
        "text": " ",
        "start": 0.5,
        "end": 0.5,
        "type": "spacing",
        "speaker_id": "speaker_1",
        "logprob": 0
      },
      {
        "text": "world!",
        "start": 0.5,
        "end": 1.2,
        "type": "word",
        "speaker_id": "speaker_1",
        "logprob": -0.089
      }
    ]
  }
}
```

### Browser Capture Sketch

Most browsers record WebM/Opus by default, while this dependency-free service expects WAV. In your React app, either:

- Convert microphone PCM to WAV in the browser before posting.
- Or add a production ASR/audio provider that returns WAV, word timings, phonemes, and/or pitch-energy features.

The API request shape stays the same:

```js
await fetch("http://127.0.0.1:4317/analyze-audio-stress", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    expectedText,
    audioBase64: rawWavBase64,
    elevenLabs: elevenLabsResponse
  })
});
```

## Production Recommendation

The acoustic analyzer here is a practical local baseline. For stronger feedback, pair it with an ASR provider that exposes word timestamps and phonemes, then send those fields into this service. Stress is primarily acoustic, so word timing, intensity, pitch movement, and vowel duration are much more useful than transcript text alone.
