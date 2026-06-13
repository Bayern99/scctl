import { evaluateCompletion } from '../harness/completion-rules.js';
import {
  DriverResult,
  PilotAction,
  PilotSourceKind,
  RenderArtifact,
} from '../runtime/driver-types.js';

export interface CompletionInput {
  action: PilotAction;
  sourceKind: PilotSourceKind;
  sourcePath?: string | null;
  surface: 'cli' | 'mcp';
  taskTag?: unknown;
}

export function attachCompletion(
  result: DriverResult<RenderArtifact>,
  input: CompletionInput,
): DriverResult<RenderArtifact> {
  const nextArtifact =
    input.sourceKind === 'scd_file' && result.artifact
      ? {
          ...result.artifact,
          source_path: input.sourcePath?.trim() ? input.sourcePath : null,
        }
      : result.artifact;

  return {
    ...result,
    artifact: nextArtifact,
    compliance: evaluateCompletion({
      action: input.action,
      result: { ...result, artifact: nextArtifact },
      sourceKind: input.sourceKind,
      sourcePath: input.sourcePath,
      surface: input.surface,
      taskTag: input.taskTag,
    }),
  };
}
