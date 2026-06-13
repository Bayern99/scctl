import { describe, expect, it } from 'vitest';
import {
  buildNrtWrapperScript,
  parseNrtMetadataFromOutput,
} from '../../src/runtime/render-nrt.js';

describe('render-nrt helpers', () => {
  it('builds wrapper script with metadata marker and source path', () => {
    const script = buildNrtWrapperScript(
      {
        durationSec: 2.5,
        enginePath: '/mock/scsynth',
        engineUsed: 'scsynth',
        executeTimeoutMs: 1000,
        outPath: '/tmp/out.wav',
        sampleFormat: 'float',
        sclangPath: '/mock/sclang',
        sourcePath: '/absolute/final-nrt.scd',
      },
      'SCCTL_DONE',
      '/tmp/score.osc',
    );

    expect(script).toContain('/absolute/final-nrt.scd');
    expect(script).toContain('SCCTL_NRT_META:');
    expect(script).toContain('overrideDuration = 2.500000');
    expect(script).toContain('SCCTL_DONE');
  });

  it('parses NRT metadata lines from wrapper output', () => {
    const metadata = parseNrtMetadataFromOutput(
      'booting\nSCCTL_NRT_META:48000|float|2|3.5\nSCCTL_DONE\n',
    );

    expect(metadata).toEqual({
      sample_rate: 48000,
      sample_format: 'float',
      channel_count: 2,
      duration_sec: 3.5,
    });
  });

  it('returns null when metadata line is missing', () => {
    expect(parseNrtMetadataFromOutput('no metadata here')).toBeNull();
  });
});
