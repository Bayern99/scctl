export interface TransportToolDefinition {
  name: string;
  cliCommand?: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

const AGENT_SC_RULE =
  ' Do not encode formation, oracle, or casting logic in SuperCollider code.';

export const TRANSPORT_TOOL_DEFINITIONS: readonly TransportToolDefinition[] = [
  {
    name: 'sc_check',
    cliCommand: 'check',
    description:
      'Verify that the local SuperCollider engine is discoverable and the interpreter can be reached.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'sc_status',
    cliCommand: 'status',
    description: 'Return the current driver session snapshot.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'sc_health',
    cliCommand: 'health',
    description: 'Run a deeper health probe against the active driver session.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'sc_eval',
    cliCommand: 'eval',
    description:
      '[operator/debug] Evaluate SuperCollider code in the active driver session. The result includes structured driver state and raw SuperCollider output.'
      + AGENT_SC_RULE,
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
    cliCommand: 'run',
    description: 'Read and evaluate a .scd file in the active driver session.' + AGENT_SC_RULE,
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
    cliCommand: 'logs',
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
    cliCommand: 'render',
    description:
      '[operator/debug] Render SuperCollider code to a draft WAV file using a clean realtime render flow. Use path or code, not both.'
      + AGENT_SC_RULE,
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
    cliCommand: 'render-nrt',
    description:
      'Render a final-quality WAV artifact through SuperCollider NRT from an absolute .scd path only.'
      + AGENT_SC_RULE,
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
    cliCommand: 'stop',
    description: 'Stop the active driver session and release audio resources.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'sc_reset',
    cliCommand: 'reset',
    description: 'Reset the active driver session without discarding it when possible.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'sc_reboot',
    cliCommand: 'reboot',
    description: 'Stop the active driver session and start a fresh ready session.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'sc_reclaim',
    cliCommand: 'reclaim',
    description:
      'Recover from a degraded or ambiguous session by discarding the local handle and creating a fresh ready session.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'sc_plan_workflow',
    cliCommand: 'plan-workflow',
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
    cliCommand: 'run-probe',
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
    cliCommand: 'summarize-session',
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
    cliCommand: 'candidate-action',
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
    cliCommand: 'memory-summary',
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
    cliCommand: 'prepare-handoff',
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
    cliCommand: 'audit-session',
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
];

export function getTransportToolDefinitions(): readonly TransportToolDefinition[] {
  return TRANSPORT_TOOL_DEFINITIONS;
}

export function findTransportTool(
  name: string,
): TransportToolDefinition | undefined {
  return TRANSPORT_TOOL_DEFINITIONS.find((tool) => tool.name === name);
}

export function findTransportToolByCliCommand(
  commandName: string,
): TransportToolDefinition | undefined {
  return TRANSPORT_TOOL_DEFINITIONS.find((tool) => tool.cliCommand === commandName);
}
