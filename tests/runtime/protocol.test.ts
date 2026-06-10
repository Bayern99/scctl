import { describe, expect, it } from 'vitest';
import {
  buildEvalScript,
  buildPingScript,
  buildRenderStartScript,
  buildRenderStopScript,
  buildResetScript,
  buildServerRunningScript,
  buildWaitForBootScript,
  containsScRuntimeError,
  escapeScString,
} from '../../src/runtime/protocol.js';

describe('protocol helpers', () => {
  it('escapes strings for SuperCollider source', () => {
    expect(escapeScString(String.raw`C:\tmp"a.wav`)).toBe(String.raw`C:\\tmp\"a.wav`);
  });

  it('detects runtime errors in raw SuperCollider output', () => {
    expect(containsScRuntimeError('ERROR: Class not defined.')).toBe(true);
    expect(containsScRuntimeError('FAILURE IN SERVER /s_new too many nodes')).toBe(true);
    expect(containsScRuntimeError('all good')).toBe(false);
  });

  it('builds interpreter ping and wait-for-boot scripts', () => {
    expect(buildPingScript('__DONE__')).toContain('__DONE__');
    expect(buildWaitForBootScript('__READY__')).toContain('s.waitForBoot');
  });

  it('builds a running/not-ready probe', () => {
    const script = buildServerRunningScript('__READY__', '__NOT_READY__');
    expect(script).toContain('__READY__');
    expect(script).toContain('__NOT_READY__');
    expect(script).toContain('s.serverRunning');
  });

  it('builds eval/reset/render scripts', () => {
    expect(buildEvalScript('1 + 1', '__DONE__')).toContain('.interpret');
    expect(buildResetScript('__DONE__')).toContain('CmdPeriod.run');

    const renderStart = buildRenderStartScript(
      {
        durationSec: 1,
        outPath: '/tmp/out.wav',
        userCode: '{ SinOsc.ar(440) }.play;',
      },
      '__DONE__',
    );
    expect(renderStart).toContain('s.prepareForRecord');
    expect(renderStart).toContain('s.record');
    expect(renderStart).toContain('.interpret');

    const renderStop = buildRenderStopScript('__DONE__');
    expect(renderStop).toContain('s.stopRecording');
    expect(renderStop).toContain('CmdPeriod.run');
  });
});
