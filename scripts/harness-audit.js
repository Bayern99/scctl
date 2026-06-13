#!/usr/bin/env node
/**
 * Deterministic agent-harness audit for consumer repos (rubric 2026-05-19).
 * Usage: node scripts/harness-audit.js [repo|hooks|skills|commands|agents] [--format text|json] [--root path]
 */

import fs from 'fs';
import path from 'path';

const RUBRIC_VERSION = '2026-05-19';
const MAX_CATEGORY = 10;

function parseArgs(argv) {
  const args = { scope: 'repo', format: 'text', root: process.cwd() };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--format') {
      args.format = argv[i + 1] ?? 'text';
      i += 1;
    } else if (arg === '--root') {
      args.root = path.resolve(argv[i + 1] ?? '.');
      i += 1;
    } else if (!arg.startsWith('-')) {
      args.scope = arg;
    }
  }
  return args;
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, rel));
}

function readText(root, rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return '';
  return fs.readFileSync(full, 'utf8');
}

function countFiles(root, predicate) {
  let count = 0;
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        walk(full);
      } else if (predicate(full, entry.name)) {
        count += 1;
      }
    }
  }
  walk(root);
  return count;
}

function scoreFromChecks(checks) {
  const passed = checks.filter((c) => c.pass).length;
  return Math.round((passed / checks.length) * MAX_CATEGORY);
}

function auditToolCoverage(root) {
  const checks = [
    { id: 'mcp_server', pass: exists(root, 'src/mcp/server.ts'), path: 'src/mcp/server.ts' },
    { id: 'cli_entry', pass: exists(root, 'src/cli.ts'), path: 'src/cli.ts' },
    { id: 'workflow_service', pass: exists(root, 'src/workflow/service.ts'), path: 'src/workflow/service.ts' },
    { id: 'orchestration_service', pass: exists(root, 'src/orchestration/service.ts'), path: 'src/orchestration/service.ts' },
    {
      id: 'governed_mcp_tools',
      pass: /sc_prepare_handoff|sc_run_probe|sc_audit_session/.test(readText(root, 'src/mcp/server.ts')),
      path: 'src/mcp/server.ts',
    },
    {
      id: 'nrt_surface',
      pass: /render_nrt|render-nrt/.test(readText(root, 'src/cli.ts')),
      path: 'src/cli.ts',
    },
  ];
  return { name: 'Tool Coverage', checks, score: scoreFromChecks(checks) };
}

function auditContextEfficiency(root) {
  const checks = [
    { id: 'agents_md', pass: exists(root, 'AGENTS.md'), path: 'AGENTS.md' },
    { id: 'status_md', pass: exists(root, 'docs/superpowers/status.md'), path: 'docs/superpowers/status.md' },
    { id: 'kb_dir', pass: exists(root, 'docs/superpowers/kb'), path: 'docs/superpowers/kb/' },
    { id: 'roles_dir', pass: exists(root, 'docs/superpowers/roles'), path: 'docs/superpowers/roles/' },
    {
      id: 'operator_runbook',
      pass: exists(root, 'docs/operator-runbook.md'),
      path: 'docs/operator-runbook.md',
    },
    {
      id: 'agent_skills_spec',
      pass: exists(root, 'docs/guides/agent-skills-spec.zh-CN.md'),
      path: 'docs/guides/agent-skills-spec.zh-CN.md',
    },
    {
      id: 'pilot_tutorial',
      pass: exists(root, 'docs/guides/governed-pilot-tutorial.zh-CN.md'),
      path: 'docs/guides/governed-pilot-tutorial.zh-CN.md',
    },
  ];
  return { name: 'Context Efficiency', checks, score: scoreFromChecks(checks) };
}

function auditQualityGates(root) {
  const pkg = JSON.parse(readText(root, 'package.json') || '{}');
  const scripts = pkg.scripts ?? {};
  const checks = [
    { id: 'typecheck_script', pass: Boolean(scripts.typecheck), path: 'package.json' },
    { id: 'build_script', pass: Boolean(scripts.build), path: 'package.json' },
    { id: 'test_script', pass: Boolean(scripts.test), path: 'package.json' },
    { id: 'ci_workflow', pass: exists(root, '.github/workflows/ci.yml'), path: '.github/workflows/ci.yml' },
    {
      id: 'vitest_config',
      pass: exists(root, 'vitest.config.ts') || exists(root, 'vitest.config.js'),
      path: 'vitest.config.ts',
    },
  ];
  return { name: 'Quality Gates', checks, score: scoreFromChecks(checks) };
}

function auditMemoryPersistence(root) {
  const gitignore = readText(root, '.gitignore');
  const checks = [
    { id: 'archive_store', pass: exists(root, 'src/archive/archive-store.ts'), path: 'src/archive/archive-store.ts' },
    { id: 'memory_summary', pass: exists(root, 'src/archive/memory-summary.ts'), path: 'src/archive/memory-summary.ts' },
    {
      id: 'session_audit_kind',
      pass: /session_audit/.test(readText(root, 'src/archive/archive-types.ts')),
      path: 'src/archive/archive-types.ts',
    },
    { id: 'gitignore_scctl', pass: /\.scctl/.test(gitignore), path: '.gitignore' },
    { id: 'archive_tests', pass: exists(root, 'tests/archive/archive-store.test.ts'), path: 'tests/archive/' },
  ];
  return { name: 'Memory Persistence', checks, score: scoreFromChecks(checks) };
}

function auditEvalCoverage(root) {
  const testCount = countFiles(path.join(root, 'tests'), (full) => full.endsWith('.test.ts'));
  const checks = [
    { id: 'evals_module', pass: exists(root, 'src/evals'), path: 'src/evals/' },
    { id: 'eval_tests', pass: exists(root, 'tests/evals'), path: 'tests/evals/' },
    { id: 'orchestration_tests', pass: exists(root, 'tests/orchestration/service.test.ts'), path: 'tests/orchestration/service.test.ts' },
    { id: 'workflow_tests', pass: exists(root, 'tests/workflow/service.test.ts'), path: 'tests/workflow/service.test.ts' },
    { id: 'test_file_count', pass: testCount >= 15, path: `tests/ (${testCount} files)` },
  ];
  return { name: 'Eval Coverage', checks, score: scoreFromChecks(checks) };
}

function auditSecurityGuardrails(root) {
  const checks = [
    {
      id: 'route_enforcement_docs',
      pass: exists(root, 'docs/design/route-enforcement-rules.md'),
      path: 'docs/design/route-enforcement-rules.md',
    },
    {
      id: 'completion_rules',
      pass: exists(root, 'src/harness/completion-rules.ts'),
      path: 'src/harness/completion-rules.ts',
    },
    {
      id: 'hooks_json',
      pass: exists(root, 'hooks/hooks.json'),
      path: 'hooks/hooks.json',
    },
    {
      id: 'gitignore_env',
      pass: /\.env/.test(readText(root, '.gitignore')),
      path: '.gitignore',
    },
  ];
  return { name: 'Security Guardrails', checks, score: scoreFromChecks(checks) };
}

function auditCostEfficiency(root) {
  const checks = [
    {
      id: 'narrow_roles',
      pass: exists(root, 'docs/superpowers/roles/manager.md'),
      path: 'docs/superpowers/roles/',
    },
    {
      id: 'workflow_selector',
      pass: exists(root, 'src/planner/workflow-selector.ts'),
      path: 'src/planner/workflow-selector.ts',
    },
    {
      id: 'transport_dedup',
      pass: exists(root, 'src/transport/completion.ts'),
      path: 'src/transport/completion.ts',
    },
  ];
  return { name: 'Cost Efficiency', checks, score: scoreFromChecks(checks) };
}

const REQUIRED_PROJECT_SKILLS = [
  'scctl-governed-loop',
  'scctl-draft-vs-final',
  'scctl-operator-debug',
  'scctl-role-handoff',
  'scctl-probe-lifecycle',
  'scctl-module-boundaries',
];

function readSkillFrontmatter(root, skillName) {
  const skillPath = path.join(root, '.agents', 'skills', skillName, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    return null;
  }
  const text = fs.readFileSync(skillPath, 'utf8');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return null;
  }
  const frontmatter = match[1];
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
  return {
    name: nameMatch?.[1]?.trim() ?? '',
    description: descMatch?.[1]?.trim() ?? '',
  };
}

function auditProjectSkills(root) {
  const checks = [
    {
      id: 'skills_spec',
      pass: exists(root, 'docs/guides/agent-skills-spec.zh-CN.md'),
      path: 'docs/guides/agent-skills-spec.zh-CN.md',
    },
    {
      id: 'skills_dir',
      pass: exists(root, '.agents/skills'),
      path: '.agents/skills/',
    },
    {
      id: 'session_start_hook',
      pass: /sessionStart/.test(readText(root, 'hooks/hooks.json')),
      path: 'hooks/hooks.json',
    },
    {
      id: 'session_start_script',
      pass: exists(root, 'hooks/scctl-session-start.js'),
      path: 'hooks/scctl-session-start.js',
    },
    {
      id: 'governed_loop_skill',
      pass: exists(root, '.agents/skills/scctl-governed-loop/SKILL.md'),
      path: '.agents/skills/scctl-governed-loop/SKILL.md',
    },
    {
      id: 'draft_final_skill',
      pass: exists(root, '.agents/skills/scctl-draft-vs-final/SKILL.md'),
      path: '.agents/skills/scctl-draft-vs-final/SKILL.md',
    },
  ];

  for (const skillName of REQUIRED_PROJECT_SKILLS) {
    const meta = readSkillFrontmatter(root, skillName);
    checks.push({
      id: `skill_${skillName}`,
      pass: Boolean(
        meta
        && meta.name === skillName
        && /^Use when/i.test(meta.description),
      ),
      path: `.agents/skills/${skillName}/SKILL.md`,
    });
  }

  return { name: 'Project Skills', checks, score: scoreFromChecks(checks) };
}

function auditHooksScope(root) {
  const checks = [
    {
      id: 'hooks_json',
      pass: exists(root, 'hooks/hooks.json'),
      path: 'hooks/hooks.json',
    },
    {
      id: 'cursor_hooks_json',
      pass: exists(root, '.cursor/hooks.json'),
      path: '.cursor/hooks.json',
    },
    {
      id: 'governed_preflight',
      pass: exists(root, 'hooks/scctl-governed-preflight.js'),
      path: 'hooks/scctl-governed-preflight.js',
    },
    {
      id: 'session_start_hook',
      pass: /sessionStart/.test(readText(root, 'hooks/hooks.json')),
      path: 'hooks/hooks.json',
    },
    {
      id: 'before_mcp_guard',
      pass: /beforeMCPExecution/.test(readText(root, 'hooks/hooks.json')),
      path: 'hooks/hooks.json',
    },
  ];
  return { name: 'Hooks', checks, score: scoreFromChecks(checks) };
}

function auditGitHubIntegration(root) {
  const checks = [
    { id: 'workflows_dir', pass: exists(root, '.github/workflows'), path: '.github/workflows/' },
    { id: 'ci_yml', pass: exists(root, '.github/workflows/ci.yml'), path: '.github/workflows/ci.yml' },
    { id: 'dependabot', pass: exists(root, '.github/dependabot.yml'), path: '.github/dependabot.yml' },
    { id: 'readme', pass: exists(root, 'README.md'), path: 'README.md' },
  ];
  return { name: 'GitHub Integration', checks, score: scoreFromChecks(checks) };
}

function deployCategory(name, markerPaths, root) {
  const applicable = markerPaths.some((p) => exists(root, p));
  if (!applicable) return null;
  const checks = markerPaths.map((p) => ({ id: p, pass: exists(root, p), path: p }));
  return { name, checks, score: scoreFromChecks(checks) };
}

function buildTopActions(categories) {
  const failed = [];
  for (const category of categories) {
    for (const check of category.checks) {
      if (!check.pass) {
        failed.push({ category: category.name, message: check.id, path: check.path });
      }
    }
  }
  return failed.slice(0, 3).map((item, index) => ({
    rank: index + 1,
    category: item.category,
    action: item.message,
    path: item.path,
  }));
}

const SCOPE_CATEGORIES = {
  repo: null,
  hooks: ['Hooks', 'Security Guardrails'],
  skills: ['Project Skills', 'Context Efficiency'],
  commands: ['Tool Coverage'],
  agents: ['Cost Efficiency', 'Eval Coverage'],
};

function runAudit(args) {
  const allCategories = [
    auditToolCoverage(args.root),
    auditContextEfficiency(args.root),
    auditQualityGates(args.root),
    auditMemoryPersistence(args.root),
    auditEvalCoverage(args.root),
    auditSecurityGuardrails(args.root),
    auditCostEfficiency(args.root),
    auditGitHubIntegration(args.root),
    auditProjectSkills(args.root),
    auditHooksScope(args.root),
    deployCategory('Vercel Integration', ['vercel.json', '.vercel/'], args.root),
    deployCategory('Netlify Integration', ['netlify.toml', '.netlify/'], args.root),
    deployCategory('Cloudflare Integration', ['wrangler.toml', 'wrangler.jsonc'], args.root),
    deployCategory('Fly Integration', ['fly.toml'], args.root),
  ].filter(Boolean);

  const scopeFilter = SCOPE_CATEGORIES[args.scope];
  const categories = scopeFilter
    ? allCategories.filter((category) => scopeFilter.includes(category.name))
    : allCategories;

  const overallScore = categories.reduce((sum, c) => sum + c.score, 0);
  const maxScore = categories.length * MAX_CATEGORY;
  const topActions = buildTopActions(categories);

  return {
    rubric_version: RUBRIC_VERSION,
    scope: args.scope,
    root: args.root,
    overall_score: overallScore,
    max_score: maxScore,
    category_count: categories.length,
    applicable_categories: categories.map((c) => c.name),
    categories: categories.map((c) => ({
      name: c.name,
      score: c.score,
      max: MAX_CATEGORY,
      checks: c.checks,
    })),
    top_actions: topActions,
    suggested_skills: [
      'verification-before-completion',
      'test-driven-development',
      'agent-harness-construction',
    ],
  };
}

function formatText(report) {
  const lines = [
    `Harness Audit (${report.scope}, ${path.basename(report.root)}): ${report.overall_score}/${report.max_score}`,
    `Rubric: ${report.rubric_version}`,
    '',
  ];
  for (const category of report.categories) {
    lines.push(`- ${category.name}: ${category.score}/${category.max}`);
    for (const check of category.checks.filter((c) => !c.pass)) {
      lines.push(`  FAIL: ${check.id} (${check.path})`);
    }
  }
  lines.push('');
  lines.push('Top 3 Actions:');
  for (const action of report.top_actions) {
    lines.push(`${action.rank}) [${action.category}] ${action.action} (${action.path})`);
  }
  return lines.join('\n');
}

const args = parseArgs(process.argv);
const report = runAudit(args);
if (args.format === 'json') {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(formatText(report));
}
