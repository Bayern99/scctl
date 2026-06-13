import { OrchestrationService } from '../orchestration/service.js';
import { ScDriver } from '../runtime/driver.js';
import {
  DriverErrorKind,
  DriverResult,
  RenderArtifact,
} from '../runtime/driver-types.js';
import { readScdFile } from '../runtime/sc-file.js';
import { WorkflowService } from '../workflow/service.js';
import { attachCompletion } from './completion.js';
import {
  buildGovernanceErrorPayload,
  checkTransportGovernance,
} from './governance.js';

export interface TransportServices {
  driver: ScDriver;
  workflowService: WorkflowService;
  orchestrationService: OrchestrationService;
}

export interface TransportToolExecutionInput {
  args?: Record<string, unknown>;
  surface: 'cli' | 'mcp';
  toolName: string;
}

export interface TransportToolExecutionResult {
  payload: unknown;
  success: boolean;
}

export async function executeTransportTool(
  input: TransportToolExecutionInput,
  services: TransportServices,
): Promise<TransportToolExecutionResult> {
  const governanceViolation = checkTransportGovernance(input.toolName);
  if (governanceViolation) {
    return {
      payload: buildGovernanceErrorPayload(governanceViolation),
      success: false,
    };
  }

  const args = input.args ?? {};

  switch (input.toolName) {
    case 'sc_check':
      return driverResult(await services.driver.check());
    case 'sc_status':
      return driverResult(await services.driver.status());
    case 'sc_health':
      return driverResult(await services.driver.health());
    case 'sc_eval':
      return driverResult(await executeEval(args, services.driver));
    case 'sc_run_file':
      return driverResult(await executeRunFile(args, input.surface, services.driver));
    case 'sc_logs':
      return driverResult(await services.driver.logs(asFiniteNumber(args.tail)));
    case 'sc_render':
      return driverResult(await executeRender(args, input.surface, services.driver));
    case 'sc_render_nrt':
      return driverResult(await executeRenderNrt(args, input.surface, services.driver));
    case 'sc_stop':
      return driverResult(await services.driver.stop());
    case 'sc_reset':
      return driverResult(await services.driver.reset());
    case 'sc_reboot':
      return driverResult(await services.driver.reboot());
    case 'sc_reclaim':
      return driverResult(await services.driver.reclaim());
    case 'sc_plan_workflow': {
      const result = await services.workflowService.planWorkflow({
        spec: args.spec,
        context: args.context as any,
      });
      return { payload: result, success: result.success };
    }
    case 'sc_run_probe': {
      const result = await services.workflowService.runProbeCommand({
        spec: args.spec as any,
      });
      return { payload: result, success: result.success };
    }
    case 'sc_summarize_session': {
      const result = await services.workflowService.summarizeSessionCommand(args as any);
      return { payload: result, success: result.success };
    }
    case 'sc_candidate_action': {
      const result = await services.workflowService.candidateActionCommand(args as any);
      return { payload: result, success: result.success };
    }
    case 'sc_memory_summary': {
      const result = await services.workflowService.memorySummaryCommand(args as any);
      return { payload: result, success: result.success };
    }
    case 'sc_prepare_handoff': {
      const result = await services.orchestrationService.prepareHandoff(args as any);
      return { payload: result, success: result.success };
    }
    case 'sc_audit_session': {
      const result = await services.orchestrationService.auditSession(args as any);
      return { payload: result, success: result.success };
    }
    default:
      throw new Error(`Unknown tool: ${input.toolName}`);
  }
}

async function executeEval(
  args: Record<string, unknown>,
  driver: ScDriver,
): Promise<DriverResult<unknown>> {
  if (typeof args.code !== 'string') {
    return buildDriverErrorResult('eval', 'code is required.');
  }

  return driver.eval(args.code);
}

async function executeRunFile(
  args: Record<string, unknown>,
  surface: 'cli' | 'mcp',
  driver: ScDriver,
): Promise<DriverResult<RenderArtifact | undefined>> {
  const taskTag = args.task_tag;
  const loadedSource = loadScdSource(args.path, 'run_file');
  if (!loadedSource.ok) {
    return attachCompletion(loadedSource.result, {
      action: 'run',
      sourceKind: 'scd_file',
      sourcePath: loadedSource.sourcePath,
      surface,
      taskTag,
    });
  }

  const result = await driver.runFile(
    loadedSource.path,
    () => loadedSource.userCode,
  );
  return attachCompletion(
    {
      ...result,
      artifact: undefined,
    },
    {
      action: 'run',
      sourceKind: 'scd_file',
      sourcePath: loadedSource.path,
      surface,
      taskTag,
    },
  );
}

async function executeRender(
  args: Record<string, unknown>,
  surface: 'cli' | 'mcp',
  driver: ScDriver,
): Promise<DriverResult<RenderArtifact | undefined>> {
  const outPath = asNonEmptyString(args.out);
  const taskTag = args.task_tag;
  const durationSec = asFiniteNumber(args.duration);
  const inlineCode = asNonEmptyString(args.code);
  const sourcePath = asNonEmptyString(args.path);
  const hasInlineCode = inlineCode !== null;
  const hasSourcePath = sourcePath !== null;
  const sourceKind =
    hasSourcePath
      ? 'scd_file'
      : hasInlineCode
        ? 'inline_code'
        : 'none';

  if (!outPath) {
    return attachCompletion(
      buildDriverErrorResult('render', 'out is required.'),
      {
        action: 'render',
        sourceKind,
        sourcePath,
        surface,
        taskTag,
      },
    );
  }

  if (hasSourcePath === hasInlineCode) {
    return attachCompletion(
      buildDriverErrorResult('render', 'Provide exactly one of path or code.'),
      {
        action: 'render',
        sourceKind,
        sourcePath,
        surface,
        taskTag,
      },
    );
  }

  if (typeof args.duration !== 'undefined' && durationSec === undefined) {
    return attachCompletion(
      buildDriverErrorResult('render', 'duration must be a finite number.'),
      {
        action: 'render',
        sourceKind,
        sourcePath,
        surface,
        taskTag,
      },
    );
  }

  let userCode = inlineCode;
  if (sourcePath) {
    const loadedSource = loadScdSource(sourcePath, 'render');
    if (!loadedSource.ok) {
      return attachCompletion(loadedSource.result, {
        action: 'render',
        sourceKind: 'scd_file',
        sourcePath: loadedSource.sourcePath,
        surface,
        taskTag,
      });
    }
    userCode = loadedSource.userCode;
  }

  const result = await driver.render({
    durationSec,
    outPath,
    userCode: userCode ?? '',
  });

  return attachCompletion(result, {
    action: 'render',
    sourceKind,
    sourcePath,
    surface,
    taskTag,
  });
}

async function executeRenderNrt(
  args: Record<string, unknown>,
  surface: 'cli' | 'mcp',
  driver: ScDriver,
): Promise<DriverResult<RenderArtifact | undefined>> {
  const outPath = asNonEmptyString(args.out);
  const sourcePath = asNonEmptyString(args.path);
  const taskTag = args.task_tag;
  const durationSec = asFiniteNumber(args.duration);

  if (!outPath) {
    return attachCompletion(
      buildDriverErrorResult('render_nrt', 'out is required.'),
      {
        action: 'render_nrt',
        sourceKind: 'scd_file',
        sourcePath,
        surface,
        taskTag,
      },
    );
  }

  if (!sourcePath) {
    return attachCompletion(
      buildDriverErrorResult('render_nrt', 'path is required.'),
      {
        action: 'render_nrt',
        sourceKind: 'scd_file',
        sourcePath,
        surface,
        taskTag,
      },
    );
  }

  if (typeof args.duration !== 'undefined' && durationSec === undefined) {
    return attachCompletion(
      buildDriverErrorResult('render_nrt', 'duration must be a finite number.'),
      {
        action: 'render_nrt',
        sourceKind: 'scd_file',
        sourcePath,
        surface,
        taskTag,
      },
    );
  }

  const enginePreference =
    args.engine_preference === 'scsynth'
    || args.engine_preference === 'supernova'
    || args.engine_preference === 'auto'
      ? args.engine_preference
      : 'auto';
  const sampleFormat =
    args.sample_format === 'double' || args.sample_format === 'float'
      ? args.sample_format
      : 'float';

  const result = await driver.renderNrt({
    durationSec,
    enginePreference,
    outPath,
    sampleFormat,
    sourcePath,
  });

  return attachCompletion(result, {
    action: 'render_nrt',
    sourceKind: 'scd_file',
    sourcePath,
    surface,
    taskTag,
  });
}

function loadScdSource(
  pathValue: unknown,
  phase: 'run_file' | 'render',
):
  | {
      ok: true;
      path: string;
      sourcePath: string;
      userCode: string;
    }
  | {
      ok: false;
      result: DriverResult<RenderArtifact | undefined>;
      sourcePath: string | null;
    } {
  const sourcePath = asNonEmptyString(pathValue);
  if (!sourcePath) {
    return {
      ok: false,
      sourcePath: null,
      result: buildDriverErrorResult(phase, 'path is required.'),
    };
  }

  try {
    return {
      ok: true,
      path: sourcePath,
      sourcePath,
      userCode: readScdFile(sourcePath),
    };
  } catch (err: any) {
    return {
      ok: false,
      sourcePath,
      result: buildDriverErrorResult(phase, err.message),
    };
  }
}

function buildDriverErrorResult(
  phase: string,
  summary: string,
  errorKind: DriverErrorKind = 'invalid_argument',
): DriverResult<RenderArtifact | undefined> {
  return {
    success: false,
    state: 'idle',
    phase,
    session_id: null,
    recoverable: true,
    error_kind: errorKind,
    summary,
    raw_output: '',
  };
}

function driverResult<TArtifact>(result: DriverResult<TArtifact>): TransportToolExecutionResult {
  return {
    payload: result,
    success: result.success,
  };
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : null;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}
