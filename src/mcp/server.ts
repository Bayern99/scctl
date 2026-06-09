import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { discoverSclangPath } from '../runtime/discover.js';
import { SclangController } from '../runtime/sclang.js';

let activeController: SclangController | null = null;

export function getActiveController(): SclangController | null {
  return activeController;
}

export function setActiveController(controller: SclangController | null): void {
  activeController = controller;
}

export const server = new Server(
  {
    name: 'scctl-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register ListTools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'sc_check',
        description: 'Check if SuperCollider sclang path is available',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'sc_eval',
        description: 'Evaluate SuperCollider code using a persistent sclang controller',
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
        name: 'sc_stop',
        description: 'Stop the active SuperCollider sclang controller',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Register CallTool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'sc_check') {
    const path = discoverSclangPath();
    if (path) {
      return {
        content: [
          {
            type: 'text',
            text: `sclang found at: ${path}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: 'text',
            text: 'sclang binary not found in standard paths or system PATH',
          },
        ],
        isError: true,
      };
    }
  }

  if (name === 'sc_eval') {
    const code = args?.code as string;
    if (!code) {
      return {
        content: [
          {
            type: 'text',
            text: 'Missing required argument: code',
          },
        ],
        isError: true,
      };
    }

    try {
      if (!activeController) {
        const path = discoverSclangPath();
        if (!path) {
          return {
            content: [
              {
                type: 'text',
                text: 'sclang binary not found',
              },
            ],
            isError: true,
          };
        }
        activeController = new SclangController(path);
        await activeController.boot();
      }

      const result = await activeController.execute(code);
      return {
        content: [
          {
            type: 'text',
            text: result.output,
          },
        ],
        isError: !result.success,
      };
    } catch (err: any) {
      if (activeController) {
        try {
          await activeController.stop();
        } catch {
          // Ignore
        }
        activeController = null;
      }
      return {
        content: [
          {
            type: 'text',
            text: `Execution failed: ${err.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === 'sc_stop') {
    if (activeController) {
      try {
        await activeController.stop();
      } catch (err: any) {
        activeController = null;
        return {
          content: [
            {
              type: 'text',
              text: `Failed to stop: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
      activeController = null;
      return {
        content: [
          {
            type: 'text',
            text: 'sclang controller stopped successfully',
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: 'text',
            text: 'No active sclang controller running',
          },
        ],
      };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

export async function startMcpServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Run standard transport if executed directly
import { fileURLToPath } from 'url';
const nodePath = process.argv[1];
if (nodePath && import.meta.url) {
  try {
    const modulePath = fileURLToPath(import.meta.url);
    if (nodePath === modulePath || nodePath.endsWith('server.ts') || nodePath.endsWith('server.js')) {
      startMcpServer().catch(console.error);
    }
  } catch {
    // Ignore
  }
}
