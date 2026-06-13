#!/usr/bin/env node
import { Command } from 'commander';
import { OrchestrationService } from './orchestration/service.js';
import { ScDriver } from './runtime/driver.js';
import { executeTransportTool } from './transport/tool-executor.js';
import { WorkflowService } from './workflow/service.js';

const driver = new ScDriver();
const workflowService = new WorkflowService({ driver });
const orchestrationService = new OrchestrationService({ workflowService });
const transportServices = {
  driver,
  workflowService,
  orchestrationService,
};
const program = new Command();

program
  .name('scctl')
  .description('Structured SuperCollider driver CLI for local agents and operators')
  .version('1.1.1');

function printJson(result: unknown, success = true): never {
  console.log(JSON.stringify(result, null, 2));
  process.exit(success ? 0 : 1);
}

async function runCliTool(
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<never> {
  const result = await executeTransportTool(
    {
      toolName,
      args,
      surface: 'cli',
    },
    transportServices,
  );
  return printJson(result.payload, result.success);
}

program
  .command('check')
  .description('Verify that SuperCollider is discoverable and the interpreter can be reached')
  .action(async () => {
    await runCliTool('sc_check');
  });

program
  .command('status')
  .description('Show the current driver session snapshot')
  .action(async () => {
    await runCliTool('sc_status');
  });

program
  .command('health')
  .description('Run a deeper health probe against the active session')
  .action(async () => {
    await runCliTool('sc_health');
  });

program
  .command('eval <code>')
  .description('Evaluate inline SuperCollider code in the driver session')
  .action(async (code: string) => {
    await runCliTool('sc_eval', { code });
  });

program
  .command('run <file>')
  .description('Read and evaluate a .scd file in the driver session')
  .option('--task-tag <tag>', 'Optional task tag for route enforcement reporting')
  .action(async (file: string, options: { taskTag?: string }) => {
    await runCliTool('sc_run_file', {
      path: file,
      task_tag: options.taskTag,
    });
  });

program
  .command('logs')
  .description('Return the current driver log buffer')
  .option('--tail <n>', 'Return only the last N characters', parsePositiveInt)
  .action(async (options: { tail?: number }) => {
    await runCliTool('sc_logs', { tail: options.tail });
  });

program
  .command('render <file>')
  .description('Render a .scd file to a draft WAV using the realtime render flow')
  .requiredOption('-o, --out <path>', 'Output WAV path')
  .option('-d, --duration <seconds>', 'Draft render duration in seconds', '5')
  .option('--task-tag <tag>', 'Optional task tag for route enforcement reporting')
  .action(async (file: string, options: { duration: string; out: string; taskTag?: string }) => {
    await runCliTool('sc_render', {
      path: file,
      out: options.out,
      duration: parseFloat(options.duration),
      task_tag: options.taskTag,
    });
  });

program
  .command('render-nrt <file>')
  .description('Render a .scd file to a final NRT WAV artifact')
  .requiredOption('-o, --out <path>', 'Output WAV path')
  .option('-d, --duration <seconds>', 'Optional NRT render duration override in seconds')
  .option(
    '-e, --engine <engine>',
    'Engine preference: auto, scsynth, or supernova',
    'auto',
  )
  .option(
    '--sample-format <format>',
    'Sample format: float or double',
    'float',
  )
  .option('--task-tag <tag>', 'Optional task tag for route enforcement reporting')
  .action(
    async (
      file: string,
      options: {
        duration?: string;
        engine: 'auto' | 'scsynth' | 'supernova';
        out: string;
        sampleFormat: 'float' | 'double';
        taskTag?: string;
      },
    ) => {
      await runCliTool('sc_render_nrt', {
        path: file,
        out: options.out,
        duration: options.duration ? parseFloat(options.duration) : undefined,
        engine_preference: options.engine,
        sample_format: options.sampleFormat,
        task_tag: options.taskTag,
      });
    },
  );

program
  .command('stop')
  .description('Stop the active driver session')
  .action(async () => {
    await runCliTool('sc_stop');
  });

program
  .command('reset')
  .description('Reset the active driver session without discarding it when possible')
  .action(async () => {
    await runCliTool('sc_reset');
  });

program
  .command('reboot')
  .description('Stop the active session and start a fresh ready session')
  .action(async () => {
    await runCliTool('sc_reboot');
  });

program
  .command('reclaim')
  .description('Discard the local session handle and create a fresh ready session')
  .action(async () => {
    await runCliTool('sc_reclaim');
  });

function parsePositiveInt(value: string): number {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('Value must be a positive integer');
  }
  return n;
}

function parseJsonOption<T>(value: string | undefined, label: string): T {
  if (!value || !value.trim()) {
    throw new Error(`${label} is required and must be valid JSON.`);
  }

  try {
    return JSON.parse(value) as T;
  } catch (err: any) {
    throw new Error(`${label} must be valid JSON: ${err.message}`);
  }
}

function invalidWorkflowResult(action: string, message: string, issues?: string[]) {
  return {
    success: false,
    action,
    summary: message,
    error_kind: 'invalid_argument',
    archive_root: workflowService.getArchiveRoot(),
    issues,
  };
}

function invalidOrchestrationResult(action: string, message: string, issues?: string[]) {
  return {
    success: false,
    action,
    summary: message,
    error_kind: 'invalid_argument',
    archive_root: orchestrationService.getArchiveRoot(),
    issues,
  };
}

program
  .command('plan-workflow')
  .description('Plan a workflow from a JSON spec or partial context')
  .option('--spec <json>', 'Optional complete ScSpec JSON')
  .option('--context <json>', 'Optional partial workflow-selection context JSON')
  .action(async (options: { context?: string; spec?: string }) => {
    try {
      await runCliTool('sc_plan_workflow', {
        spec: options.spec ? parseJsonOption(options.spec, 'spec') : undefined,
        context: options.context ? parseJsonOption(options.context, 'context') : undefined,
      });
    } catch (err: any) {
      printJson(
        invalidWorkflowResult('plan_workflow', err.message, [err.message]),
        false,
      );
    }
  });

program
  .command('run-probe')
  .description('Run a probe from a ProbeSpec JSON payload')
  .option('--spec <json>', 'ProbeSpec JSON')
  .action(async (options: { spec?: string }) => {
    try {
      await runCliTool('sc_run_probe', {
        spec: parseJsonOption(options.spec, 'spec'),
      });
    } catch (err: any) {
      printJson(
        invalidWorkflowResult('run_probe', err.message, [err.message]),
        false,
      );
    }
  });

program
  .command('summarize-session')
  .description('Write a session summary from a JSON payload')
  .option('--input <json>', 'Session summary input JSON')
  .action(async (options: { input?: string }) => {
    try {
      await runCliTool('sc_summarize_session', parseJsonOption(options.input, 'input'));
    } catch (err: any) {
      printJson(
        invalidWorkflowResult('summarize_session', err.message, [err.message]),
        false,
      );
    }
  });

program
  .command('candidate-action')
  .description('Apply a candidate lifecycle or review action from a JSON payload')
  .option('--input <json>', 'Candidate action input JSON')
  .action(async (options: { input?: string }) => {
    try {
      await runCliTool('sc_candidate_action', parseJsonOption(options.input, 'input'));
    } catch (err: any) {
      printJson(
        invalidWorkflowResult('candidate_action', err.message, [err.message]),
        false,
      );
    }
  });

program
  .command('memory-summary')
  .description('Compute a project memory summary from the local archive')
  .option('--session-id <id>', 'Optional session filter')
  .option('--candidate-id <id>', 'Optional candidate filter')
  .option('--limit <n>', 'Optional max recent sessions', parsePositiveInt)
  .action(async (options: { candidateId?: string; limit?: number; sessionId?: string }) => {
    try {
      await runCliTool('sc_memory_summary', {
        session_id: options.sessionId,
        candidate_id: options.candidateId,
        limit: options.limit,
      });
    } catch (err: any) {
      printJson(
        invalidWorkflowResult('memory_summary', err.message, [err.message]),
        false,
      );
    }
  });

program
  .command('prepare-handoff')
  .description('Prepare governed role packets and a KB snapshot from a task envelope')
  .option('--input <json>', 'Task envelope JSON')
  .action(async (options: { input?: string }) => {
    try {
      await runCliTool('sc_prepare_handoff', parseJsonOption(options.input, 'input'));
    } catch (err: any) {
      printJson(
        invalidOrchestrationResult('prepare_handoff', err.message, [err.message]),
        false,
      );
    }
  });

program
  .command('audit-session')
  .description('Audit a governed session trace from the local archive')
  .option('--input <json>', 'Session audit input JSON')
  .action(async (options: { input?: string }) => {
    try {
      await runCliTool('sc_audit_session', parseJsonOption(options.input, 'input'));
    } catch (err: any) {
      printJson(
        invalidOrchestrationResult('audit_session', err.message, [err.message]),
        false,
      );
    }
  });

await program.parseAsync(process.argv);
