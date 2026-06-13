import {
  enforceGovernedToolIfActive,
  GovernanceViolation,
  GovernedToolCheckOptions,
} from '../harness/role-policies.js';
import { DriverResult } from '../runtime/driver-types.js';
import { findTransportToolByCliCommand } from './tool-metadata.js';

export interface GovernanceErrorPayload {
  success: false;
  error_kind: 'governance_violation';
  role: string;
  tool: string;
  allowed_tools: string[];
  forbidden_paths: string[];
  summary: string;
}

export function checkTransportGovernance(
  toolName: string,
  options: GovernedToolCheckOptions = {},
): GovernanceViolation | null {
  return enforceGovernedToolIfActive(toolName, options);
}

export function buildGovernanceErrorPayload(
  violation: GovernanceViolation,
): GovernanceErrorPayload {
  return {
    success: false,
    error_kind: 'governance_violation',
    role: violation.role,
    tool: violation.tool,
    allowed_tools: violation.allowed_tools,
    forbidden_paths: violation.forbidden_paths,
    summary: violation.summary,
  };
}

export function buildGovernanceDriverResult(
  violation: GovernanceViolation,
  phase: string,
): DriverResult {
  return {
    success: false,
    state: 'idle',
    phase,
    session_id: null,
    recoverable: true,
    error_kind: 'governance_violation',
    summary: violation.summary,
    raw_output: '',
  };
}

export function cliCommandToGovernedTool(commandName: string): string | null {
  return findTransportToolByCliCommand(commandName)?.name ?? null;
}
