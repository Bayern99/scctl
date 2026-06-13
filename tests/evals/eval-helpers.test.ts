import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { buildSummary } from '../../src/evals/eval-types.js';
import { evaluatePathCompliance } from '../../src/evals/path-compliance.js';
import { evaluateRenderQuality } from '../../src/evals/render-quality.js';
import { evaluateTaskOutcome } from '../../src/evals/task-outcome.js';
import { gradeTrace } from '../../src/evals/trace-grading.js';

function writeTestWav(
  outPath: string,
  options: {
    amplitude?: number;
    channelCount?: number;
    durationSec: number;
    sampleRate?: number;
  },
): void {
  const sampleRate = options.sampleRate ?? 48000;
  const channelCount = options.channelCount ?? 2;
  const frameCount = Math.max(1, Math.round(sampleRate * options.durationSec));
  const amplitude = options.amplitude ?? 0.1;
  const blockAlign = channelCount * 2;
  const byteRate = sampleRate * blockAlign;
  const dataSize = frameCount * blockAlign;
  const header = Buffer.alloc(44);
  const data = Buffer.alloc(dataSize);

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channelCount, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const sample = Math.round(
      Math.sin((2 * Math.PI * 220 * frame) / sampleRate) * 32767 * amplitude,
    );
    for (let channel = 0; channel < channelCount; channel += 1) {
      data.writeInt16LE(sample, (frame * channelCount + channel) * 2);
    }
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.concat([header, data]));
}

describe('eval helpers', () => {
  it('builds a passing summary from weighted metrics', () => {
    const summary = buildSummary({
      evaluator: 'unit',
      metrics: [
        { name: 'a', value: 1, weight: 2 },
        { name: 'b', value: 0.9, weight: 1 },
      ],
    });

    expect(summary.grade).toBe('pass');
    expect(summary.score).toBeCloseTo(0.9666666667);
  });

  it('flags disallowed path steps and missing requirements', () => {
    const result = evaluatePathCompliance({
      workflow: 'render_qa',
      steps: [{ name: 'sc_render' }, { name: 'scp_upload' }],
    });

    expect(result.compliance_rate).toBe(0.5);
    expect(result.disallowed_steps).toEqual(['scp_upload']);
    expect(result.missing_required_steps).toEqual([
      'sc_run_probe',
      'sc_summarize_session',
      'sc_candidate_action:add_review',
    ]);
    expect(result.summary.grade).toBe('fail');
  });

  it('evaluates render quality from lightweight metadata', () => {
    const outPath = path.join(os.tmpdir(), `scctl-render-quality-${Date.now()}.wav`);
    writeTestWav(outPath, { durationSec: 1.4 });
    const result = evaluateRenderQuality({
      success: true,
      artifact: {
        path: outPath,
        bytes: fs.statSync(outPath).size,
      },
      expected_duration_sec: 1.0,
      max_duration_drift_sec: 0.25,
    });

    expect(result.duration_delta_sec).toBeCloseTo(0.4);
    expect(result.summary.grade).toBe('warn');
    expect(result.usable).toBe(true);
    expect(result.waveform_analysis?.sample_rate).toBe(48000);
  });

  it('treats missing required artifacts as task failure', () => {
    const result = evaluateTaskOutcome({
      task_label: 'sc-audio-generation',
      workflow: 'render_qa',
      execution_success: true,
      artifact_present: false,
      review_passed: true,
    });

    expect(result.completed).toBe(false);
    expect(result.summary.grade).toBe('fail');
  });

  it('aggregates trace completion, recovery, and rejection reasons', () => {
    const result = gradeTrace({
      steps: [
        { name: 'plan', category: 'plan', success: true },
        { name: 'render', category: 'execute', success: true },
        {
          name: 'review',
          category: 'review',
          success: false,
          rejection_reason: 'noisy_tail',
        },
        { name: 'reset', category: 'recovery', success: true },
      ],
      candidate_promoted: false,
    });

    expect(result.completion_rate).toBe(0.75);
    expect(result.recovery_invocation_rate).toBe(0.25);
    expect(result.review_rejection_reason_distribution).toEqual({ noisy_tail: 1 });
    expect(result.summary.grade).toBe('warn');
  });
});
