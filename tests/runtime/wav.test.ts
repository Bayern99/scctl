import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeWavFile, readWavMetadata } from '../../src/runtime/wav.js';

function writePcm16Wav(
  filePath: string,
  samples: number[],
  sampleRate = 48000,
  channels = 1,
): void {
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i += 1) {
    buffer.writeInt16LE(samples[i]!, 44 + i * bytesPerSample);
  }

  fs.writeFileSync(filePath, buffer);
}

describe('wav analysis', () => {
  it('reads PCM16 metadata from a synthetic WAV file', () => {
    const filePath = path.join(os.tmpdir(), `scctl-wav-${Date.now()}.wav`);
    writePcm16Wav(filePath, [0, 16383, -16384, 32767], 48000, 1);

    const metadata = readWavMetadata(filePath);
    expect(metadata.sample_rate).toBe(48000);
    expect(metadata.channel_count).toBe(1);
    expect(metadata.sample_format).toBe('int16');
    expect(metadata.duration_sec).toBeCloseTo(4 / 48000, 6);

    fs.unlinkSync(filePath);
  });

  it('detects clipping and silence ratio in analyzed WAV files', () => {
    const filePath = path.join(os.tmpdir(), `scctl-wav-analysis-${Date.now()}.wav`);
    writePcm16Wav(filePath, [0, 0, 32767, 32767], 48000, 1);

    const analysis = analyzeWavFile(filePath);
    expect(analysis.clipping_detected).toBe(true);
    expect(analysis.peak).toBeGreaterThan(0.99);
    expect(analysis.silence_ratio).toBeGreaterThan(0);

    fs.unlinkSync(filePath);
  });

  it('rejects invalid WAV headers', () => {
    expect(() => readWavMetadata('/does/not/exist.wav')).toThrow();
  });
});
