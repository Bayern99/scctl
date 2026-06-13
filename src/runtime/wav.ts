import fs from 'fs';
import { RenderSampleFormat } from './driver-types.js';

export interface WavMetadata {
  audio_format: number;
  bit_depth: number;
  block_align: number;
  byte_length: number;
  channel_count: number;
  data_offset: number;
  data_size: number;
  duration_sec: number;
  frame_count: number;
  path: string;
  sample_format: RenderSampleFormat;
  sample_rate: number;
}

export interface WavAnalysis extends WavMetadata {
  clipping_detected: boolean;
  peak: number;
  silence_ratio: number;
}

function ensureWavHeader(buffer: Buffer): void {
  if (buffer.length < 44) {
    throw new Error('Invalid WAV header: file is too small.');
  }
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Invalid WAV header: RIFF/WAVE signature was not found.');
  }
}

function decodeSampleFormat(audioFormat: number, bitDepth: number): RenderSampleFormat {
  if (audioFormat === 3) {
    if (bitDepth === 64) {
      return 'double';
    }
    if (bitDepth === 32) {
      return 'float';
    }
    return 'unknown';
  }

  if (audioFormat !== 1) {
    return 'unknown';
  }

  if (bitDepth === 8) {
    return 'uint8';
  }
  if (bitDepth === 16) {
    return 'int16';
  }
  if (bitDepth === 24) {
    return 'int24';
  }
  if (bitDepth === 32) {
    return 'int32';
  }

  return 'unknown';
}

function parseFmtChunk(buffer: Buffer, offset: number, size: number) {
  if (size < 16) {
    throw new Error('Invalid WAV fmt chunk: expected at least 16 bytes.');
  }

  const audioFormat = buffer.readUInt16LE(offset);
  const channelCount = buffer.readUInt16LE(offset + 2);
  const sampleRate = buffer.readUInt32LE(offset + 4);
  const blockAlign = buffer.readUInt16LE(offset + 12);
  const bitDepth = buffer.readUInt16LE(offset + 14);

  if (channelCount <= 0 || sampleRate <= 0 || blockAlign <= 0 || bitDepth <= 0) {
    throw new Error('Invalid WAV fmt chunk: malformed channel, sample-rate, or bit-depth values.');
  }

  return {
    audioFormat,
    channelCount,
    sampleRate,
    blockAlign,
    bitDepth,
  };
}

export function readWavMetadata(path: string): WavMetadata {
  const buffer = fs.readFileSync(path);
  ensureWavHeader(buffer);

  let cursor = 12;
  let fmt:
    | {
        audioFormat: number;
        channelCount: number;
        sampleRate: number;
        blockAlign: number;
        bitDepth: number;
      }
    | null = null;
  let dataOffset = -1;
  let dataSize = -1;

  while (cursor + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', cursor, cursor + 4);
    const chunkSize = buffer.readUInt32LE(cursor + 4);
    const chunkStart = cursor + 8;
    const nextCursor = chunkStart + chunkSize + (chunkSize % 2);
    if (nextCursor > buffer.length + 1) {
      throw new Error('Invalid WAV chunk layout: chunk extends past file length.');
    }

    if (chunkId === 'fmt ') {
      fmt = parseFmtChunk(buffer, chunkStart, chunkSize);
    } else if (chunkId === 'data') {
      dataOffset = chunkStart;
      dataSize = chunkSize;
      break;
    }

    cursor = nextCursor;
  }

  if (!fmt) {
    throw new Error('Invalid WAV header: missing fmt chunk.');
  }
  if (dataOffset < 0 || dataSize < 0) {
    throw new Error('Invalid WAV header: missing data chunk.');
  }
  if (dataOffset + dataSize > buffer.length) {
    throw new Error('Invalid WAV data chunk: data extends past file length.');
  }

  const frameCount = Math.floor(dataSize / fmt.blockAlign);

  return {
    audio_format: fmt.audioFormat,
    bit_depth: fmt.bitDepth,
    block_align: fmt.blockAlign,
    byte_length: buffer.length,
    channel_count: fmt.channelCount,
    data_offset: dataOffset,
    data_size: dataSize,
    duration_sec: frameCount / fmt.sampleRate,
    frame_count: frameCount,
    path,
    sample_format: decodeSampleFormat(fmt.audioFormat, fmt.bitDepth),
    sample_rate: fmt.sampleRate,
  };
}

function readSigned24LE(buffer: Buffer, offset: number): number {
  const value = buffer.readUIntLE(offset, 3);
  return value & 0x800000 ? value - 0x1000000 : value;
}

function normalizeSample(
  buffer: Buffer,
  metadata: WavMetadata,
  offset: number,
): number {
  const { audio_format: audioFormat, bit_depth: bitDepth, sample_format: sampleFormat } = metadata;

  if (audioFormat === 1) {
    if (bitDepth === 8) {
      return (buffer.readUInt8(offset) - 128) / 128;
    }
    if (bitDepth === 16) {
      return buffer.readInt16LE(offset) / 32768;
    }
    if (bitDepth === 24) {
      return readSigned24LE(buffer, offset) / 8388608;
    }
    if (bitDepth === 32) {
      return buffer.readInt32LE(offset) / 2147483648;
    }
  } else if (audioFormat === 3) {
    if (sampleFormat === 'float') {
      return buffer.readFloatLE(offset);
    }
    if (sampleFormat === 'double') {
      return buffer.readDoubleLE(offset);
    }
  }

  throw new Error(
    `Unsupported WAV encoding: audio_format=${audioFormat}, bit_depth=${bitDepth}.`,
  );
}

export function analyzeWavFile(path: string, silenceThreshold = 1e-4): WavAnalysis {
  const metadata = readWavMetadata(path);
  const buffer = fs.readFileSync(path);
  const bytesPerSample = metadata.block_align / metadata.channel_count;

  let peak = 0;
  let clipped = false;
  let silentFrames = 0;

  for (let frameIndex = 0; frameIndex < metadata.frame_count; frameIndex += 1) {
    const frameOffset = metadata.data_offset + frameIndex * metadata.block_align;
    let framePeak = 0;

    for (let channelIndex = 0; channelIndex < metadata.channel_count; channelIndex += 1) {
      const sampleOffset = frameOffset + channelIndex * bytesPerSample;
      const sample = normalizeSample(buffer, metadata, sampleOffset);
      const amplitude = Math.abs(sample);
      framePeak = Math.max(framePeak, amplitude);
      peak = Math.max(peak, amplitude);

      if (metadata.audio_format === 1) {
        if (metadata.bit_depth === 8) {
          clipped ||= buffer.readUInt8(sampleOffset) === 0 || buffer.readUInt8(sampleOffset) === 255;
        } else if (metadata.bit_depth === 16) {
          const raw = buffer.readInt16LE(sampleOffset);
          clipped ||= raw === -32768 || raw === 32767;
        } else if (metadata.bit_depth === 24) {
          const raw = readSigned24LE(buffer, sampleOffset);
          clipped ||= raw === -8388608 || raw === 8388607;
        } else if (metadata.bit_depth === 32) {
          const raw = buffer.readInt32LE(sampleOffset);
          clipped ||= raw === -2147483648 || raw === 2147483647;
        }
      } else if (metadata.audio_format === 3) {
        clipped ||= amplitude >= 0.999999;
      }
    }

    if (framePeak <= silenceThreshold) {
      silentFrames += 1;
    }
  }

  return {
    ...metadata,
    clipping_detected: clipped,
    peak,
    silence_ratio: metadata.frame_count === 0 ? 1 : silentFrames / metadata.frame_count,
  };
}
