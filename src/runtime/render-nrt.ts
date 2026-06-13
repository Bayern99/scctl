import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { EngineKind, RequestedSampleFormat } from './driver-types.js';
import { escapeScString, makeMarker } from './protocol.js';

export interface RenderNrtOptions {
  durationSec?: number;
  enginePath: string;
  engineUsed: EngineKind;
  executeTimeoutMs: number;
  outPath: string;
  sampleFormat: RequestedSampleFormat;
  sclangPath: string;
  sourcePath: string;
}

export interface RenderNrtResult {
  exit_code: number | null;
  raw_output: string;
  success: boolean;
}

interface NrtMetadata {
  channel_count: number;
  duration_sec: number;
  sample_format: RequestedSampleFormat;
  sample_rate: number;
}

const META_PREFIX = 'SCCTL_NRT_META:';

export function buildNrtWrapperScript(
  options: RenderNrtOptions,
  doneMarker: string,
  oscPath: string,
): string {
  const escapedSourcePath = escapeScString(options.sourcePath);
  const escapedOscPath = escapeScString(oscPath);
  const durationLine =
    typeof options.durationSec === 'number'
      ? `overrideDuration = ${Number(options.durationSec).toFixed(6)};`
      : 'overrideDuration = nil;';

  return [
    '(',
    'var spec, scoreSource, score, sampleRate, sampleFormat, channelCount, duration, overrideDuration;',
    `${durationLine}`,
    'try {',
    `  spec = thisProcess.interpreter.executeFile("${escapedSourcePath}");`,
    '  if(spec.isNil) { Error("NRT source file must return an Event or Dictionary.").throw; };',
    '  if((spec.isKindOf(Event)).not and: { (spec.isKindOf(Dictionary)).not }) {',
    '    Error("NRT source file must return an Event or Dictionary.").throw;',
    '  };',
    '  scoreSource = spec[\\score];',
    '  if(scoreSource.isNil) { Error("NRT source file must provide \\\\score.").throw; };',
    '  score = if(scoreSource.isKindOf(Score), { scoreSource }, { Score.new(scoreSource) });',
    '  score.addSystemSynthDefs;',
    '  sampleRate = spec[\\sample_rate] ? 48000;',
    `  sampleFormat = spec[\\sample_format] ? "${options.sampleFormat}";`,
    '  channelCount = spec[\\channel_count] ? 2;',
    '  duration = if(overrideDuration.notNil, { overrideDuration }, { spec[\\duration] });',
    '  if(duration.isNil) { Error("NRT source file must provide \\\\duration or caller must override duration.").throw; };',
    `  score.writeOSCFile("${escapedOscPath}", 0, duration);`,
    `  ("${META_PREFIX}" ++ sampleRate.asString ++ "|" ++ sampleFormat.asString ++ "|" ++ channelCount.asString ++ "|" ++ duration.asString).postln;`,
    `  "${doneMarker}".postln;`,
    '  0.exit;',
    '} { |err|',
    '  ("SCCTL_NRT_ERROR: " ++ err.asString).postln;',
    '  err.reportError;',
    '  1.exit;',
    '};',
    ')',
    '',
  ].join('\n');
}

function stripMarker(rawOutput: string, doneMarker: string): string {
  return rawOutput
    .split(/\r?\n/)
    .filter((line) => line.trim() !== doneMarker && !line.includes(META_PREFIX))
    .join('\n')
    .trim();
}

export function parseNrtMetadataFromOutput(rawOutput: string): {
  channel_count: number;
  duration_sec: number;
  sample_format: RequestedSampleFormat;
  sample_rate: number;
} | null {
  return parseMetadata(rawOutput);
}

function parseMetadata(rawOutput: string): NrtMetadata | null {
  const metaLine = rawOutput
    .split(/\r?\n/)
    .find((line) => line.includes(META_PREFIX));
  if (!metaLine) {
    return null;
  }

  const payload = metaLine.slice(metaLine.indexOf(META_PREFIX) + META_PREFIX.length).trim();
  const [sampleRateText, sampleFormatText, channelCountText, durationText] = payload.split('|');
  const sampleRate = Number(sampleRateText);
  const channelCount = Number(channelCountText);
  const durationSec = Number(durationText);
  if (
    !Number.isFinite(sampleRate)
    || !Number.isFinite(channelCount)
    || !Number.isFinite(durationSec)
    || (sampleFormatText !== 'float' && sampleFormatText !== 'double')
  ) {
    return null;
  }

  return {
    channel_count: channelCount,
    duration_sec: durationSec,
    sample_format: sampleFormatText,
    sample_rate: sampleRate,
  };
}

async function runCommand(
  executable: string,
  args: string[],
  timeoutMs: number,
  successPredicate: (rawOutput: string, exitCode: number | null, timedOut: boolean) => boolean,
): Promise<RenderNrtResult> {
  const cleanupHandle: {
    current: {
      killed: boolean;
      kill(signal?: NodeJS.Signals | number): boolean;
    } | null;
  } = {
    current: null,
  };
  let timedOut = false;

  try {
    const result = await new Promise<RenderNrtResult>((resolve, reject) => {
      let rawOutput = '';
      const spawned = spawn(executable, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      cleanupHandle.current = spawned;

      const timeout = setTimeout(() => {
        timedOut = true;
        spawned.kill('SIGKILL');
      }, timeoutMs);

      const finish = (exitCode: number | null) => {
        clearTimeout(timeout);
        resolve({
          exit_code: exitCode,
          raw_output: rawOutput.trim(),
          success: successPredicate(rawOutput, exitCode, timedOut),
        });
      };

      spawned.stdout.on('data', (chunk) => {
        rawOutput += chunk.toString();
      });
      spawned.stderr.on('data', (chunk) => {
        rawOutput += chunk.toString();
      });
      spawned.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      spawned.on('close', (code) => {
        finish(code);
      });
    });

    if (timedOut) {
      return {
        exit_code: result.exit_code,
        raw_output: `${result.raw_output}\nExecution timed out after ${timeoutMs}ms`.trim(),
        success: false,
      };
    }

    return result;
  } finally {
    if (cleanupHandle.current?.killed === false) {
      try {
        cleanupHandle.current.kill('SIGKILL');
      } catch {
        // Ignore best-effort cleanup failures.
      }
    }
  }
}

export async function runNrtRender(options: RenderNrtOptions): Promise<RenderNrtResult> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scctl-nrt-'));
  const wrapperPath = path.join(tempDir, 'render-nrt.scd');
  const oscPath = path.join(tempDir, 'render-nrt.osc');
  const doneMarker = makeMarker(`render_nrt_${options.engineUsed}`);
  const script = buildNrtWrapperScript(options, doneMarker, oscPath);

  await fs.writeFile(wrapperPath, script, 'utf8');

  try {
    const wrapperResult = await runCommand(
      options.sclangPath,
      [wrapperPath],
      options.executeTimeoutMs,
      (rawOutput, exitCode, timedOut) =>
        !timedOut && rawOutput.includes(doneMarker) && exitCode === 0,
    );

    const wrapperOutput = stripMarker(wrapperResult.raw_output, doneMarker);
    const metadata = parseMetadata(wrapperResult.raw_output);
    if (!wrapperResult.success || !metadata) {
      return {
        exit_code: wrapperResult.exit_code,
        raw_output: metadata
          ? wrapperOutput
          : `${wrapperOutput}\nFailed to derive NRT metadata from wrapper output.`.trim(),
        success: false,
      };
    }

    const engineArgs = [
      '-N',
      oscPath,
      '_',
      options.outPath,
      String(metadata.sample_rate),
      'WAV',
      metadata.sample_format,
      '-o',
      String(metadata.channel_count),
    ];
    const engineResult = await runCommand(
      options.enginePath,
      engineArgs,
      options.executeTimeoutMs,
      (_rawOutput, exitCode, timedOut) => !timedOut && exitCode === 0,
    );

    return {
      exit_code: engineResult.exit_code,
      raw_output: [wrapperOutput, engineResult.raw_output].filter(Boolean).join('\n').trim(),
      success: engineResult.success,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
