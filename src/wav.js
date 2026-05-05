export function decodeWavBase64(audioBase64) {
  const clean = String(audioBase64 ?? "").replace(/^data:audio\/\w+;base64,/, "");
  const bytes = Buffer.from(clean, "base64");
  return decodeWav(bytes);
}

export function decodeWav(bytes) {
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
    channelCount: format.channelCount,
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
    const value = bytes.readIntLE(offset, 3);
    return value / 8388608;
  }

  return bytes.readInt32LE(offset) / 2147483648;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
