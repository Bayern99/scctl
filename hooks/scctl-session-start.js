#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GOVERNED_LOOP =
  'prepare_handoff -> run_probe -> summarize_session -> candidate_action/review -> audit_session -> memory_summary';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

function roleDocName(role) {
  if (role === 'builder') {
    return 'sc-builder';
  }
  return role;
}

function buildContext(repoRoot, env) {
  const marker = readGovernedMarker(repoRoot);
  const governedRole = env.SCCTL_GOVERNED_ROLE?.trim().toLowerCase() || null;
  const finalNrt =
    env.SCCTL_FINAL_NRT === '1'
    || env.SCCTL_FINAL_NRT?.toLowerCase() === 'true'
    || marker?.final_nrt === true;

  const lines = [
    'SuperCollider Pilot (scctl) session context:',
    '- Default creative closure: governed workflow, not raw sc_eval/sc_run_file/sc_render alone.',
    `- Governed loop: ${GOVERNED_LOOP}`,
    '- Operator/debug raw tools are OK for smoke; do not use them to claim governed task completion.',
    '- Skills: .agents/skills/scctl-governed-loop and scctl-draft-vs-final',
    '- Spec: docs/guides/agent-skills-spec.zh-CN.md',
  ];

  if (marker || governedRole) {
    lines.push('');
    lines.push('Active governed session detected:');
    if (governedRole) {
      lines.push(`- SCCTL_GOVERNED_ROLE=${governedRole}`);
    }
    if (marker?.task_id) {
      lines.push(`- task_id=${marker.task_id}`);
    }
    if (finalNrt) {
      lines.push('- final_nrt=true: draft sc_render is not valid for closure; use sc_render_nrt or governed NRT probe.');
    }
    const role = governedRole || 'builder';
    lines.push(
      `- Role docs: docs/superpowers/roles/${roleDocName(role)}.md (read canonical file; do not guess tool lists).`,
    );
    lines.push('- Raw MCP runtime tools may be blocked by hooks/scctl-governed-preflight.js');
  } else {
    lines.push('');
    lines.push('No governed marker (.scctl/governed-role) and no SCCTL_GOVERNED_ROLE — operator/debug mode unless user requests governed loop.');
  }

  return lines.join('\n');
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  try {
    JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    // sessionStart input is optional; continue with defaults
  }

  const repoRoot = resolveRepoRoot(process.cwd());
  const additional_context = buildContext(repoRoot, process.env);

  process.stdout.write(JSON.stringify({ additional_context }));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ additional_context: '' }));
});
