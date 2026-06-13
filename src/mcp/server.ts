import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { OrchestrationService } from '../orchestration/service.js';
import { DriverResult } from '../runtime/driver-types.js';
import { ScDriver } from '../runtime/driver.js';
import { readScdFile } from '../runtime/sc-file.js';
import { attachCompletion } from '../transport/completion.js';
import { WorkflowService } from '../workflow/service.js';

const AGENT_SC_RULE =
  ' Do not encode formation, oracle, or casting logic in SuperCollider code.';

let activeDriver = new ScDriver();

export function getActiveDriver(): ScDriver {
  return activeDriver;
}

export function setActiveDriver(driver: ScDriver): void {
  activeDriver = driver;
}

async function shutdownDriver(): Promise<void> {
  try {
    await activeDriver.stop();
  } catch {
    // Ignore best-effort shutdown failures.
  }
}

process.on('SIGINT', async () => {
  await shutdownDriver();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await shutdownDriver();
  process.exit(0);
});

function asToolResult(result: DriverResult<unknown>) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
    isError: !result.success,
  };
}

function asJsonToolResult(result: unknown, isError = false) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
    isError,
  };
}

function getWorkflowService(): WorkflowService {
  return new WorkflowService({ driver: activeDriver });
}

function getOrchestrationService(): OrchestrationService {
  return new OrchestrationService({ workflowService: getWorkflowService() });
}

export const server = new Server(
  {
    name: 'supercollider-pilot',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'sc_check',
        description:
          'Verify that the local SuperCollider engine is discoverable and the interpreter can be reached.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'sc_status',
        description: 'Return the current driver session snapshot.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'sc_health',
        description: 'Run a deeper health probe against the active driver session.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'sc_eval',
        description:
          '[operator/debug] Evaluate SuperCollider code in the active driver session. The result includes structured driver state and raw SuperCollider output.' +
          AGENT_SC_RULE,
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'SuperCollider code block to evaluate',
            },
          },
          required: ['code'],
        },
      },
      {
        name: 'sc_run_file',
        description:
          'Read and evaluate a .scd file in the active driver session.' + AGENT_SC_RULE,
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute or relative path to a .scd file',
            },
            task_tag: {
              type: 'string',
              description: 'Optional task tag for route enforcement reporting',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'sc_logs',
        description:
          'Return the active session log buffer. Use together with structured driver results, not as the only source of truth.',
        inputSchema: {
          type: 'object',
          properties: {
            tail: {
              type: 'number',
              description: 'Optional max characters from the end of the buffer',
            },
          },
        },
      },
      {
        name: 'sc_render',
        description:
          '[operator/debug] Render SuperCollider code to a draft WAV file using a clean realtime render flow. Use path or code, not both.' +
          AGENT_SC_RULE,
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to a .scd file (use path or code, not both)',
            },
            code: {
              type: 'string',
              description: 'Inline SuperCollider code (use path or code, not both)',
            },
            out: {
              type: 'string',
              description: 'Output WAV file path',
            },
            duration: {
              type: 'number',
              description: 'Draft render duration in seconds (default 5)',
            },
            task_tag: {
              type: 'string',
              description: 'Optional task tag for route enforcement reporting',
            },
          },
          required: ['out'],
        },
      },
      {
        name: 'sc_render_nrt',
        description:
          'Render a final-quality WAV artifact through SuperCollider NRT from an absolute .scd path only.' +
          AGENT_SC_RULE,
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute path to the .scd file that returns an NRT spec event',
            },
            out: {
              type: 'string',
              description: 'Absolute output WAV file path',
            },
            duration: {
              type: 'number',
              description: 'Optional NRT render duration override in seconds',
            },
            engine_preference: {
              type: 'string',
              enum: ['auto', 'scsynth', 'supernova'],
              description: 'Optional NRT engine preference',
            },
            sample_format: {
              type: 'string',
              enum: ['float', 'double'],
              description: 'Optional NRT sample format',
            },
            task_tag: {
              type: 'string',
              description: 'Optional task tag for route enforcement reporting',
            },
          },
          required: ['path', 'out'],
        },
      },
      {
        name: 'sc_stop',
        description: 'Stop the active driver session and release audio resources.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'sc_reset',
        description: 'Reset the active driver session without discarding it when possible.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'sc_reboot',
        description: 'Stop the active driver session and start a fresh ready session.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'sc_reclaim',
        description:
          'Recover from a degraded or ambiguous session by discarding the local handle and creating a fresh ready session.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'sc_plan_workflow',
        description:
          'Plan a narrow workflow from a partial context or a full ScSpec JSON payload.',
        inputSchema: {
          type: 'object',
          properties: {
            spec: {
              type: 'object',
              description: 'Optional full ScSpec object',
            },
            context: {
              type: 'object',
              description: 'Optional partial workflow-selection context',
            },
          },
        },
      },
      {
        name: 'sc_run_probe',
        description: 'Validate and execute a ProbeSpec through the Pilot workflow layer.',
        inputSchema: {
          type: 'object',
          properties: {
            spec: {
              type: 'object',
              description: 'ProbeSpec object',
            },
          },
          required: ['spec'],
        },
      },
      {
        name: 'sc_summarize_session',
        description: 'Write a structured session summary into the append-only archive.',
        inputSchema: {
          type: 'object',
          properties: {
            session_id: { type: 'string' },
            task: { type: 'string' },
            outcome: { type: 'string', enum: ['success', 'failure', 'mixed'] },
            preserved_items: {
              type: 'array',
              items: { type: 'string' },
            },
            failures: {
              type: 'array',
              items: { type: 'string' },
            },
            probe_id: { type: 'string' },
            notes: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: ['session_id', 'task', 'outcome', 'preserved_items', 'failures'],
        },
      },
      {
        name: 'sc_candidate_action',
        description: 'Apply a candidate lifecycle or review action through the workflow layer.',
        inputSchema: {
          type: 'object',
          properties: {
            session_id: { type: 'string' },
            action: { type: 'string' },
            candidate_id: { type: 'string' },
            name: { type: 'string' },
            source_probe_id: { type: 'string' },
            summary: { type: 'string' },
            next_name: { type: 'string' },
            split_into: { type: 'array', items: { type: 'string' } },
            merged_from: { type: 'array', items: { type: 'string' } },
            superseded_by: { type: 'array', items: { type: 'string' } },
            artifacts: { type: 'array', items: { type: 'object' } },
            metadata: { type: 'object' },
            review: { type: 'object' },
          },
          required: ['session_id', 'action', 'candidate_id'],
        },
      },
      {
        name: 'sc_memory_summary',
        description: 'Compute a project-level memory summary from the local archive.',
        inputSchema: {
          type: 'object',
          properties: {
            session_id: { type: 'string' },
            candidate_id: { type: 'string' },
            limit: { type: 'number' },
          },
        },
      },
      {
        name: 'sc_prepare_handoff',
        description:
          '[governed default] Prepare governed manager, builder, and critic packets from a task envelope.',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: { type: 'string' },
            task_tag: { type: 'string' },
            goal: { type: 'string' },
            requested_outcome: {
              type: 'string',
              enum: ['explore', 'refine', 'review', 'promote'],
            },
            spec: { type: 'object' },
            constraints: {
              type: 'array',
              items: { type: 'string' },
            },
            memory_options: {
              type: 'object',
              properties: {
                session_id: { type: 'string' },
                candidate_id: { type: 'string' },
                limit: { type: 'number' },
              },
            },
            quality: {
              type: 'object',
              properties: {
                render_tier: {
                  type: 'string',
                  enum: ['draft', 'final_nrt'],
                },
                engine_preference: {
                  type: 'string',
                  enum: ['auto', 'scsynth', 'supernova'],
                },
                sample_format: {
                  type: 'string',
                  enum: ['float', 'double'],
                },
              },
            },
          },
          required: ['task_id', 'task_tag', 'goal', 'requested_outcome'],
        },
      },
      {
        name: 'sc_audit_session',
        description:
          'Audit a governed session trace and recommend the next narrow action.',
        inputSchema: {
          type: 'object',
          properties: {
            session_id: { type: 'string' },
            task_tag: { type: 'string' },
            candidate_id: { type: 'string' },
            quality: {
              type: 'object',
              properties: {
                render_tier: {
                  type: 'string',
                  enum: ['draft', 'final_nrt'],
                },
                engine_preference: {
                  type: 'string',
                  enum: ['auto', 'scsynth', 'supernova'],
                },
                sample_format: {
                  type: 'string',
                  enum: ['float', 'double'],
                },
              },
            },
          },
          required: ['session_id'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { arguments: args, name } = request.params;

  if (name === 'sc_check') {
    return asToolResult(await activeDriver.check());
  }

  if (name === 'sc_status') {
    return asToolResult(await activeDriver.status());
  }

  if (name === 'sc_health') {
    return asToolResult(await activeDriver.health());
  }

  if (name === 'sc_eval') {
    const code = args?.code;
    if (typeof code !== 'string') {
      return asToolResult(
        await activeDriver.eval(typeof code === 'undefined' ? '' : String(code)),
      );
    }

    return asToolResult(await activeDriver.eval(code));
  }

  if (name === 'sc_run_file') {
    const filePath = args?.path;
    const taskTag = args?.task_tag;
    if (typeof filePath !== 'string') {
      const result = await activeDriver.runFile('', readScdFile);
      return asToolResult(
        attachCompletion(
          {
            ...result,
            artifact: undefined,
          },
          {
            action: 'run',
            sourceKind: 'scd_file',
            sourcePath: typeof filePath === 'string' ? filePath : '',
            surface: 'mcp',
            taskTag,
          },
        ),
      );
    }

    const result = await activeDriver.runFile(filePath, readScdFile);
    return asToolResult(
      attachCompletion(
        {
          ...result,
          artifact: undefined,
        },
        {
          action: 'run',
          sourceKind: 'scd_file',
          sourcePath: filePath,
          surface: 'mcp',
          taskTag,
        },
      ),
    );
  }

  if (name === 'sc_logs') {
    const tail = typeof args?.tail === 'number' ? args.tail : undefined;
    return asToolResult(await activeDriver.logs(tail));
  }

  if (name === 'sc_render') {
    const out = args?.out;
    const filePath = args?.path;
    const code = args?.code;
    const taskTag = args?.task_tag;
    const hasPath = typeof filePath === 'string' && filePath !== '';
    const hasCode = typeof code === 'string' && code !== '';

    if (typeof out !== 'string' || out === '' || hasPath === hasCode) {
      const result = await activeDriver.render({
          durationSec: typeof args?.duration === 'number' ? args.duration : undefined,
          outPath: typeof out === 'string' ? out : '',
          userCode: '',
        });
      return asToolResult(
        attachCompletion(result, {
          action: 'render',
          sourceKind: hasPath ? 'scd_file' : hasCode ? 'inline_code' : 'none',
          sourcePath: hasPath ? (filePath as string) : null,
          surface: 'mcp',
          taskTag,
        }),
      );
    }

    let userCode = code as string;
    if (hasPath) {
      try {
        userCode = readScdFile(filePath as string);
      } catch (err: any) {
        const result = await activeDriver.render({
            durationSec: typeof args?.duration === 'number' ? args.duration : undefined,
            outPath: out,
            userCode: '',
          });
        return asToolResult(
          attachCompletion(result, {
            action: 'render',
            sourceKind: 'scd_file',
            sourcePath: filePath as string,
            surface: 'mcp',
            taskTag,
          }),
        );
      }
    }

    const result = await activeDriver.render({
      durationSec: typeof args?.duration === 'number' ? args.duration : undefined,
      outPath: out,
      userCode,
    });
    return asToolResult(
      attachCompletion(result, {
        action: 'render',
        sourceKind: hasPath ? 'scd_file' : 'inline_code',
        sourcePath: hasPath ? (filePath as string) : null,
        surface: 'mcp',
        taskTag,
      }),
    );
  }

  if (name === 'sc_render_nrt') {
    const out = args?.out;
    const filePath = args?.path;
    const taskTag = args?.task_tag;

    const result = await activeDriver.renderNrt({
      durationSec: typeof args?.duration === 'number' ? args.duration : undefined,
      enginePreference:
        args?.engine_preference === 'scsynth'
        || args?.engine_preference === 'supernova'
        || args?.engine_preference === 'auto'
          ? args.engine_preference
          : 'auto',
      outPath: typeof out === 'string' ? out : '',
      sampleFormat:
        args?.sample_format === 'double' || args?.sample_format === 'float'
          ? args.sample_format
          : 'float',
      sourcePath: typeof filePath === 'string' ? filePath : '',
    });

    return asToolResult(
      attachCompletion(result, {
        action: 'render_nrt',
        sourceKind: 'scd_file',
        sourcePath: typeof filePath === 'string' ? filePath : null,
        surface: 'mcp',
        taskTag,
      }),
    );
  }

  if (name === 'sc_stop') {
    return asToolResult(await activeDriver.stop());
  }

  if (name === 'sc_reset') {
    return asToolResult(await activeDriver.reset());
  }

  if (name === 'sc_reboot') {
    return asToolResult(await activeDriver.reboot());
  }

  if (name === 'sc_reclaim') {
    return asToolResult(await activeDriver.reclaim());
  }

  if (name === 'sc_plan_workflow') {
    const result = await getWorkflowService().planWorkflow({
      spec: args?.spec,
      context: args?.context as any,
    });
    return asJsonToolResult(result, !result.success);
  }

  if (name === 'sc_run_probe') {
    const result = await getWorkflowService().runProbeCommand({
      spec: args?.spec as any,
    });
    return asJsonToolResult(result, !result.success);
  }

  if (name === 'sc_summarize_session') {
    const result = await getWorkflowService().summarizeSessionCommand(args as any);
    return asJsonToolResult(result, !result.success);
  }

  if (name === 'sc_candidate_action') {
    const result = await getWorkflowService().candidateActionCommand(args as any);
    return asJsonToolResult(result, !result.success);
  }

  if (name === 'sc_memory_summary') {
    const result = await getWorkflowService().memorySummaryCommand(args as any);
    return asJsonToolResult(result, !result.success);
  }

  if (name === 'sc_prepare_handoff') {
    const result = await getOrchestrationService().prepareHandoff(args as any);
    return asJsonToolResult(result, !result.success);
  }

  if (name === 'sc_audit_session') {
    const result = await getOrchestrationService().auditSession(args as any);
    return asJsonToolResult(result, !result.success);
  }

  throw new Error(`Unknown tool: ${name}`);
});

export async function startMcpServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

import { fileURLToPath } from 'url';
const nodePath = process.argv[1];
if (nodePath && import.meta.url) {
  try {
    const modulePath = fileURLToPath(import.meta.url);
    if (
      nodePath === modulePath ||
      nodePath.endsWith('server.ts') ||
      nodePath.endsWith('server.js')
    ) {
      startMcpServer().catch(console.error);
    }
  } catch {
    // Ignore module path detection failures.
  }
}
