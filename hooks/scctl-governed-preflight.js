#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RAW_RUNTIME_TOOLS = new Set(['sc_eval', 'sc_run_file', 'sc_render', 'sc_render_nrt']);
const POLICIES_PATH = path.join(
  __dirname,
  '..',
  'docs',
  'superpowers',
  'kb',
  'role-tool-policies.json',
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readGovernedMarker(repoRoot) {
  const markerPath = path.join(repoRoot, '.scctl', 'governed-role');
  if (!fs.existsSync(markerPath)) {
    return null;
  }

  try {
    return readJson(markerPath);
  } catch {
    return null;
  }
}

function resolveRepoRoot(cwd) {
  let current = cwd;
  while (true) {
    if (fs.existsSync(path.join(current, 'docs', 'superpowers', 'kb', 'role-tool-policies.json'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return cwd;
    }
    current = parent;
  }
}

function normalizeToolName(toolName) {
  if (!toolName) {
    return '';
  }
  if (toolName.startsWith('sc_candidate_action')) {
    return 'sc_candidate_action';
  }
  return toolName;
}

function shouldBlock(toolName, repoRoot, env) {
  const normalized = normalizeToolName(toolName);
  if (!RAW_RUNTIME_TOOLS.has(normalized)) {
    return null;
  }

  const governedRole = env.SCCTL_GOVERNED_ROLE?.trim().toLowerCase();
  const marker = readGovernedMarker(repoRoot);
  const finalNrt =
    env.SCCTL_FINAL_NRT === '1'
    || env.SCCTL_FINAL_NRT?.toLowerCase() === 'true'
    || marker?.final_nrt === true;

  if (!governedRole && !marker) {
    return null;
  }

  const policies = readJson(POLICIES_PATH);
  const role = governedRole || 'builder';
  let policy;
  if (role === 'builder') {
    policy = finalNrt ? policies.roles.builder.final_nrt : policies.roles.builder.default;
  } else if (role === 'manager' || role === 'critic') {
    policy = policies.roles[role];
  } else {
    return {
      user_message:
        `Unknown SCCTL_GOVERNED_ROLE "${governedRole}". `
        + 'Use manager, builder, or critic, or clear governed mode for operator debugging.',
    };
  }

  if (finalNrt && policies.final_nrt_global_forbidden.includes(normalized)) {
    return {
      user_message:
        `Blocked raw runtime tool "${normalized}" while final_nrt governed mode is active. `
        + 'Use sc_run_probe or sc_render_nrt through the governed workflow instead.',
    };
  }

  if (policy.forbidden_paths.includes(normalized) || !policy.allowed_tools.includes(normalized)) {
    return {
      user_message:
        `Blocked raw runtime tool "${normalized}" for governed role "${role}". `
        + `Allowed tools: ${policy.allowed_tools.join(', ')}. `
        + 'Use the governed workflow loop (prepare_handoff -> run_probe -> audit_session).',
    };
  }

  return null;
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  let input = {};
  try {
    input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    process.stdout.write(JSON.stringify({ permission: 'allow' }));
    return;
  }

  const repoRoot = resolveRepoRoot(process.cwd());
  const toolName = input.tool_name || input.toolName || input.name || '';
  const block = shouldBlock(toolName, repoRoot, process.env);

  if (block) {
    process.stdout.write(
      JSON.stringify({
        permission: 'deny',
        user_message: block.user_message,
      }),
    );
    return;
  }

  process.stdout.write(JSON.stringify({ permission: 'allow' }));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ permission: 'allow' }));
});
