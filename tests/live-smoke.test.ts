import fs from 'fs';
import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { ScDriver } from '../src/runtime/driver.js';
import { discoverSclangPath } from '../src/runtime/discover.js';

const shouldRun = process.env.SCCTL_RUN_LIVE_SMOKE === '1' && Boolean(discoverSclangPath());
const liveDescribe = shouldRun ? describe : describe.skip;
const draftOutPath = path.resolve('/tmp/scctl-live-smoke.wav');
const nrtOutPath = path.resolve('/tmp/scctl-live-smoke-nrt.wav');
const nrtSourcePath = path.resolve(
  process.cwd(),
  'sc/families/sustained-tonal-carrier/final-nrt.scd',
);

liveDescribe('live SuperCollider smoke', () => {
  const driver = new ScDriver();

  afterAll(async () => {
    await driver.stop();
    for (const artifactPath of [draftOutPath, nrtOutPath]) {
      if (fs.existsSync(artifactPath)) {
        fs.unlinkSync(artifactPath);
      }
    }
  });

  it(
    'drives eval, runtime errors, reset, draft render, NRT render, and reclaim against a real engine',
    async () => {
      const check = await driver.check();
      expect(check.success).toBe(true);

      const evalResult = await driver.eval('{ SinOsc.ar(440, 0, 0.05) }.play;');
      expect(evalResult.success).toBe(true);
      expect(evalResult.state).toBe('ready');

      const badEval = await driver.eval('NoSuchClass.foo');
      expect(badEval.success).toBe(false);
      expect(badEval.error_kind).toBe('sc_runtime_error');
      expect(badEval.recoverable).toBe(true);

      const reset = await driver.reset();
      expect(reset.success).toBe(true);
      expect(reset.state).toBe('ready');

      const render = await driver.render({
        durationSec: 1,
        outPath: draftOutPath,
        userCode: '{ SinOsc.ar(440, 0, 0.05) }.play;',
      });
      expect(render.success).toBe(true);
      expect(render.artifact?.bytes).toBeGreaterThan(0);
      expect(render.artifact?.path).toBe(draftOutPath);
      expect(render.artifact?.verification).toMatchObject({
        exists: true,
        non_empty: true,
        output_error_detected: false,
        stop_completed: true,
      });

      const nrtRender = await driver.renderNrt({
        sourcePath: nrtSourcePath,
        outPath: nrtOutPath,
        sampleFormat: 'float',
      });
      expect(nrtRender.success).toBe(true);
      expect(nrtRender.artifact?.path).toBe(nrtOutPath);
      expect(nrtRender.artifact?.render_mode).toBe('nrt');
      expect(nrtRender.artifact?.verification).toMatchObject({
        exists: true,
        non_empty: true,
        output_error_detected: false,
        stop_completed: true,
      });

      const reclaim = await driver.reclaim();
      expect(reclaim.success).toBe(true);
      expect(reclaim.state).toBe('ready');
    },
    30_000,
  );
});
