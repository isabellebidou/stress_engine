const VOWELS = "aeiouy";

export async function analyzeAudioStress(input) {
  try {
    const normalized = validateAndNormalizeInput(input);
    const wav = decodeWavBase64(normalized.audioBase64);
    const expectedWords = tokenize(normalized.expectedText);
    const transcriptWords = normalizeElevenLabsWords(normalized.elevenLabs.words);
    const words = expectedWords.map((word, index) => {
      const syllables = splitSyllables(word);
      const expectedStress = expectedStressForWord(word, syllables);
      const timing = transcriptWords[index];
      const observedStress = timing
        ? observedStressForWord(wav, timing, syllables)
        : null;
      const status = stressStatus(expectedStress, observedStress);

      return {
        word,
        expectedStress,
        observedStress,
        status
      };
    });

    return {
      ok: true,
      summary: summarize(words),
      words
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to analyze audio stress."
    };
  }
}

function validateAndNormalizeInput(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Input must be an object.");
  }

  if (typeof input.expectedText !== "string" || input.expectedText.trim() === "") {
    throw new Error("expectedText is required.");
  }

  if (typeof input.audioBase64 !== "string" || input.audioBase64.trim() === "") {
    throw new Error("audioBase64 is required.");
  }

  if (!input.elevenLabs || typeof input.elevenLabs !== "object") {
    throw new Error("elevenLabs is required.");
  }

  if (typeof input.elevenLabs.text !== "string") {
    throw new Error("elevenLabs.text is required.");
  }

  if (!Array.isArray(input.elevenLabs.words)) {
    throw new Error("elevenLabs.words must be an array.");
  }

  return input;
}

function normalizeElevenLabsWords(words) {
  return words
    .filter((word) => !word.type || word.type === "word")
    .map((word) => ({
      word: normalizeWord(word.text),
      startMs: secondsToMs(word.start),
      endMs: secondsToMs(word.end)
    }))
    .filter((word) => word.word && Number.isFinite(word.startMs) && Number.isFinite(word.endMs));
}

function observedStressForWord(wav, timing, syllables) {
  if (syllables.length <= 0 || timing.endMs <= timing.startMs) {
    return null;
  }

  const startMs = Math.max(0, timing.startMs);
  const endMs = Math.min(wav.durationMs, timing.endMs);
  const durationMs = Math.max(1, endMs - startMs);
  const prominence = syllables.map((_, index) => {
    const syllableStartMs = startMs + (durationMs * index) / syllables.length;
    const syllableEndMs = startMs + (durationMs * (index + 1)) / syllables.length;
    return acousticProminence(wav.samples, wav.sampleRate, syllableStartMs, syllableEndMs);
  });

  if (prominence.every((value) => value === 0)) {
    return null;
  }

  return prominence.indexOf(Math.max(...prominence));
}

function expectedStressForWord(word, syllables) {
  if (syllables.length === 0) {
    return null;
  }

  if (syllables.length === 1) {
    return 0;
  }

  const normalized = normalizeWord(word);

  if (/(tion|sion)$/.test(normalized) && syllables.length >= 2) {
    return Math.max(0, syllables.length - 2);
  }

  if (/ic$/.test(normalized) && syllables.length >= 2) {
    return Math.max(0, syllables.length - 2);
  }

  if (/ity$/.test(normalized) && syllables.length >= 3) {
    return Math.max(0, syllables.length - 3);
  }

  if (syllables.length === 2 && (normalized.startsWith("a") || FRENCH_ORIGIN_ADJECTIVES.has(normalized))) {
    return 1;
  }

  return 0;
}

function acousticProminence(samples, sampleRate, startMs, endMs) {
  const start = Math.max(0, Math.floor((startMs / 1000) * sampleRate));
  const end = Math.min(samples.length, Math.ceil((endMs / 1000) * sampleRate));
  const sliceLength = Math.max(1, end - start);
  let sumSquares = 0;
  let peak = 0;
  let zeroCrossings = 0;
  let previous = samples[start] ?? 0;

  for (let index = start; index < end; index += 1) {
    const sample = samples[index] ?? 0;
    sumSquares += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
    if ((sample >= 0 && previous < 0) || (sample < 0 && previous >= 0)) {
      zeroCrossings += 1;
    }
    previous = sample;
  }

  const rms = Math.sqrt(sumSquares / sliceLength);
  const pitch = pitchConfidence(samples, sampleRate, start, end);
  return round(rms * 0.72 + peak * 0.18 + pitch.confidence * 0.1 + zeroCrossings * 0);
}

function pitchConfidence(samples, sampleRate, start, end) {
  const maxSamples = Math.min(end - start, Math.floor(sampleRate * 0.09));
  if (maxSamples < Math.floor(sampleRate / 90)) {
    return { confidence: 0 };
  }

  const minLag = Math.floor(sampleRate / 350);
  const maxLag = Math.floor(sampleRate / 75);
  let bestCorrelation = 0;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    let energy = 0;

    for (let i = 0; i < maxSamples - lag; i += 1) {
      const a = samples[start + i] ?? 0;
      const b = samples[start + i + lag] ?? 0;
      correlation += a * b;
      energy += a * a + b * b;
    }

    const normalized = energy > 0 ? (2 * correlation) / energy : 0;
    if (normalized > bestCorrelation) {
      bestCorrelation = normalized;
    }
  }

  return {
    confidence: bestCorrelation < 0.22 ? 0 : Math.max(0, Math.min(1, bestCorrelation))
  };
}

function decodeWavBase64(audioBase64) {
  const clean = audioBase64.replace(/^data:audio\/\w+;base64,/, "");
  return decodeWav(Buffer.from(clean, "base64"));
}

function decodeWav(bytes) {
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("audioBase64 must contain a WAV file.");
  }

  let offset = 12;
  let format = null;
  let dataOffset = null;
  let dataSize = null;

  while (offset + 8 <= bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;

    if (id === "fmt ") {
      format = readFormat(bytes, chunkStart);
    }

    if (id === "data") {
      dataOffset = chunkStart;
      dataSize = size;
    }

    offset = chunkStart + size + (size % 2);
  }

  if (!format) {
    throw new Error("WAV file is missing a fmt chunk.");
  }

  if (dataOffset === null || dataSize === null) {
    throw new Error("WAV file is missing a data chunk.");
  }

  const samples = readSamples(bytes, dataOffset, dataSize, format);
  return {
    sampleRate: format.sampleRate,
    durationMs: Math.round((samples.length / format.sampleRate) * 1000),
    samples
  };
}

function readFormat(bytes, offset) {
  const audioFormat = bytes.readUInt16LE(offset);
  const channelCount = bytes.readUInt16LE(offset + 2);
  const sampleRate = bytes.readUInt32LE(offset + 4);
  const bitsPerSample = bytes.readUInt16LE(offset + 14);

  if (![1, 3].includes(audioFormat)) {
    throw new Error("Only PCM and IEEE-float WAV files are supported.");
  }

  if (![8, 16, 24, 32].includes(bitsPerSample)) {
    throw new Error("WAV bit depth must be 8, 16, 24, or 32.");
  }

  return {
    audioFormat,
    channelCount,
    sampleRate,
    bitsPerSample,
    bytesPerSample: bitsPerSample / 8
  };
}

function readSamples(bytes, dataOffset, dataSize, format) {
  const frameSize = format.bytesPerSample * format.channelCount;
  const frameCount = Math.floor(dataSize / frameSize);
  const samples = new Float32Array(frameCount);

  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < format.channelCount; channel += 1) {
      const sampleOffset = dataOffset + frame * frameSize + channel * format.bytesPerSample;
      sum += readSample(bytes, sampleOffset, format);
    }
    samples[frame] = sum / format.channelCount;
  }

  return samples;
}

function readSample(bytes, offset, format) {
  if (format.audioFormat === 3 && format.bitsPerSample === 32) {
    return clamp(bytes.readFloatLE(offset), -1, 1);
  }

  if (format.bitsPerSample === 8) {
    return (bytes.readUInt8(offset) - 128) / 128;
  }

  if (format.bitsPerSample === 16) {
    return bytes.readInt16LE(offset) / 32768;
  }

  if (format.bitsPerSample === 24) {
    return bytes.readIntLE(offset, 3) / 8388608;
  }

  return bytes.readInt32LE(offset) / 2147483648;
}

function splitSyllables(word) {
  const normalized = normalizeWord(word);

  if (!normalized) {
    return [];
  }

  if (SPECIAL_SYLLABLES.has(normalized)) {
    return SPECIAL_SYLLABLES.get(normalized);
  }

  const chars = [...normalized];
  const vowelGroups = [];
  let groupStart = -1;

  for (let i = 0; i < chars.length; i += 1) {
    const isVowel = VOWELS.includes(chars[i]);
    if (isVowel && groupStart === -1) {
      groupStart = i;
    }
    if ((!isVowel || i === chars.length - 1) && groupStart !== -1) {
      const end = isVowel && i === chars.length - 1 ? i : i - 1;
      vowelGroups.push([groupStart, end]);
      groupStart = -1;
    }
  }

  if (normalized.endsWith("e") && vowelGroups.length > 1) {
    const last = vowelGroups.at(-1);
    if (last[0] === normalized.length - 1) {
      vowelGroups.pop();
    }
  }

  if (vowelGroups.length <= 1) {
    return [normalized];
  }

  const syllables = [];
  let start = 0;

  for (let i = 0; i < vowelGroups.length - 1; i += 1) {
    const currentEnd = vowelGroups[i][1];
    const nextStart = vowelGroups[i + 1][0];
    const consonantsBetween = nextStart - currentEnd - 1;
    let boundary = currentEnd + 1;

    if (consonantsBetween > 1) {
      boundary = currentEnd + Math.ceil(consonantsBetween / 2);
    }

    syllables.push(normalized.slice(start, boundary + 1));
    start = boundary + 1;
  }

  syllables.push(normalized.slice(start));
  return syllables.filter(Boolean);
}

function tokenize(text) {
  return String(text ?? "")
    .split(/\s+/)
    .map(normalizeWord)
    .filter(Boolean);
}

function normalizeWord(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/^[^a-z']+|[^a-z']+$/g, "")
    .replace(/'s$/g, "");
}

function secondsToMs(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
}

function stressStatus(expectedStress, observedStress) {
  if (expectedStress === null || observedStress === null) return "unknown";
  return expectedStress === observedStress ? "match" : "mismatch";
}

function summarize(words) {
  return {
    wordsAnalyzed: words.length,
    matches: words.filter((word) => word.status === "match").length,
    mismatches: words.filter((word) => word.status === "mismatch").length,
    unknown: words.filter((word) => word.status === "unknown").length
  };
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

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

const SPECIAL_SYLLABLES = new Map([
  ["about", ["a", "bout"]],
  ["above", ["a", "bove"]],
  ["afraid", ["a", "fraid"]],
  ["again", ["a", "gain"]],
  ["ago", ["a", "go"]],
  ["alone", ["a", "lone"]],
  ["around", ["a", "round"]],
  ["away", ["a", "way"]],
  ["because", ["be", "cause"]],
  ["begin", ["be", "gin"]],
  ["city", ["cit", "y"]],
  ["comic", ["com", "ic"]],
  ["happy", ["hap", "py"]],
  ["hotel", ["ho", "tel"]],
  ["introduction", ["in", "tro", "duc", "tion"]],
  ["music", ["mu", "sic"]],
  ["nation", ["na", "tion"]],
  ["police", ["po", "lice"]],
  ["polite", ["po", "lite"]],
  ["record", ["re", "cord"]],
  ["student", ["stu", "dent"]],
  ["teacher", ["teach", "er"]]
]);
