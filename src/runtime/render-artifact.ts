import fs from 'fs';
import { EngineKind, RenderArtifact } from './driver-types.js';
import { containsScRuntimeError } from './protocol.js';
import { readWavMetadata } from './wav.js';

export function buildRenderArtifact(
  outPath: string,
  durationSec: number,
  rawOutput: string,
  stopCompleted: boolean,
  renderMode: 'draft' | 'nrt',
  engineUsed: EngineKind,
): RenderArtifact {
  const exists = fs.existsSync(outPath);
  const bytes = exists ? fs.statSync(outPath).size : 0;
  const outputErrorDetected = containsScRuntimeError(rawOutput);
  const failureReasons: string[] = [];
  let metadata:
    | {
        channel_count: number;
        duration_sec: number;
        frame_count: number;
        sample_format: RenderArtifact['sample_format'];
        sample_rate: number;
      }
    | undefined;

  if (!exists) {
    failureReasons.push('Output WAV file was not created.');
  }
  if (bytes <= 0) {
    failureReasons.push('Output WAV file is empty.');
  }
  if (outputErrorDetected) {
    failureReasons.push('SuperCollider reported a runtime error during render.');
  }
  if (!stopCompleted) {
    failureReasons.push('Render stop sequence did not complete cleanly.');
  }
  if (exists && bytes > 0) {
    try {
      const wavMetadata = readWavMetadata(outPath);
      metadata = {
        channel_count: wavMetadata.channel_count,
        duration_sec: wavMetadata.duration_sec,
        frame_count: wavMetadata.frame_count,
        sample_format: wavMetadata.sample_format,
        sample_rate: wavMetadata.sample_rate,
      };
    } catch (err: any) {
      failureReasons.push(`Render artifact is not a valid WAV file: ${err.message}`);
    }
  }

  return {
    path: outPath,
    bytes,
    duration_sec: metadata?.duration_sec ?? durationSec,
    render_mode: renderMode,
    engine_used: engineUsed,
    sample_rate: metadata?.sample_rate,
    sample_format: metadata?.sample_format,
    channel_count: metadata?.channel_count,
    frame_count: metadata?.frame_count,
    verification: {
      exists,
      non_empty: bytes > 0,
      output_error_detected: outputErrorDetected,
      stop_completed: stopCompleted,
      failure_reasons: failureReasons,
    },
  };
}

export function isRenderArtifactValid(artifact: RenderArtifact): boolean {
  const verification = artifact.verification;
  if (!verification) {
    return artifact.bytes > 0;
  }

  return (
    verification.exists &&
    verification.non_empty &&
    verification.stop_completed &&
    !verification.output_error_detected &&
    verification.failure_reasons.length === 0
  );
}
