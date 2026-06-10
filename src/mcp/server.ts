import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { DriverResult } from '../runtime/driver-types.js';
import { ScDriver } from '../runtime/driver.js';
import { readScdFile } from '../runtime/sc-file.js';

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
          'Evaluate SuperCollider code in the active driver session. The result includes structured driver state and raw SuperCollider output.' +
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
          'Render SuperCollider code to a draft WAV file using a clean realtime render flow. Use path or code, not both.' +
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
          },
          required: ['out'],
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
    if (typeof filePath !== 'string') {
      return asToolResult(await activeDriver.runFile('', readScdFile));
    }

    return asToolResult(await activeDriver.runFile(filePath, readScdFile));
  }

  if (name === 'sc_logs') {
    const tail = typeof args?.tail === 'number' ? args.tail : undefined;
    return asToolResult(await activeDriver.logs(tail));
  }

  if (name === 'sc_render') {
    const out = args?.out;
    const filePath = args?.path;
    const code = args?.code;
    const hasPath = typeof filePath === 'string' && filePath !== '';
    const hasCode = typeof code === 'string' && code !== '';

    if (typeof out !== 'string' || out === '' || hasPath === hasCode) {
      return asToolResult(
        await activeDriver.render({
          durationSec: typeof args?.duration === 'number' ? args.duration : undefined,
          outPath: typeof out === 'string' ? out : '',
          userCode: '',
        }),
      );
    }

    let userCode = code as string;
    if (hasPath) {
      try {
        userCode = readScdFile(filePath as string);
      } catch (err: any) {
        return asToolResult(
          await activeDriver.render({
            durationSec: typeof args?.duration === 'number' ? args.duration : undefined,
            outPath: out,
            userCode: '',
          }),
        );
      }
    }

    return asToolResult(
      await activeDriver.render({
        durationSec: typeof args?.duration === 'number' ? args.duration : undefined,
        outPath: out,
        userCode,
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
