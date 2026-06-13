import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { OrchestrationService } from '../orchestration/service.js';
import { ScDriver } from '../runtime/driver.js';
import { executeTransportTool } from '../transport/tool-executor.js';
import { getTransportToolDefinitions } from '../transport/tool-metadata.js';
import { WorkflowService } from '../workflow/service.js';

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

function getTransportServices() {
  return {
    driver: activeDriver,
    workflowService: getWorkflowService(),
    orchestrationService: getOrchestrationService(),
  };
}

export const server = new Server(
  {
    name: 'supercollider-pilot',
    version: '1.1.1',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: getTransportToolDefinitions(),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const result = await executeTransportTool(
    {
      toolName: request.params.name,
      args: request.params.arguments as Record<string, unknown> | undefined,
      surface: 'mcp',
    },
    getTransportServices(),
  );
  return asJsonToolResult(result.payload, !result.success);
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
