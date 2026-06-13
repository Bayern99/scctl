#!/usr/bin/env bash
# Bootstrap a consumer workspace with KB, skills, hooks, and gitignore entries.
# Usage: ./scripts/bootstrap-consumer-project.sh /path/to/your-project

set -euo pipefail

PILOT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-}"

if [[ -z "${TARGET}" ]]; then
  echo "Usage: $0 /absolute/path/to/consumer-project" >&2
  exit 1
fi

if [[ ! -d "${TARGET}" ]]; then
  echo "Target directory does not exist: ${TARGET}" >&2
  exit 1
fi

TARGET="$(cd "${TARGET}" && pwd)"

copy_tree() {
  local src="$1"
  local dest="$2"
  mkdir -p "${dest}"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a "${src}/" "${dest}/"
  else
    cp -R "${src}/." "${dest}/"
  fi
}

echo "Pilot repo: ${PILOT_ROOT}"
echo "Consumer project: ${TARGET}"

copy_tree "${PILOT_ROOT}/docs/superpowers/kb" "${TARGET}/docs/superpowers/kb"
copy_tree "${PILOT_ROOT}/docs/superpowers/roles" "${TARGET}/docs/superpowers/roles"
copy_tree "${PILOT_ROOT}/.agents/skills" "${TARGET}/.agents/skills"

mkdir -p "${TARGET}/hooks"
for hook_script in scctl-governed-preflight.js scctl-session-start.js; do
  cp "${PILOT_ROOT}/hooks/${hook_script}" "${TARGET}/hooks/${hook_script}"
done
cp "${PILOT_ROOT}/hooks/hooks.json" "${TARGET}/hooks/hooks.json"

mkdir -p "${TARGET}/.cursor"
cat > "${TARGET}/.cursor/hooks.json" <<'EOF'
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "command": "node hooks/scctl-session-start.js"
      }
    ],
    "beforeMCPExecution": [
      {
        "command": "node hooks/scctl-governed-preflight.js",
        "matcher": "sc_eval|sc_run_file|sc_render|sc_render_nrt"
      }
    ]
  }
}
EOF

GITIGNORE="${TARGET}/.gitignore"
if [[ -f "${GITIGNORE}" ]]; then
  if ! grep -qxF '.scctl/' "${GITIGNORE}" 2>/dev/null; then
    printf '\n# SuperCollider Pilot runtime state\n.scctl/\n' >> "${GITIGNORE}"
    echo "Appended .scctl/ to .gitignore"
  fi
else
  printf '# SuperCollider Pilot runtime state\n.scctl/\n' > "${GITIGNORE}"
  echo "Created .gitignore with .scctl/"
fi

MCP_SERVER="${PILOT_ROOT}/dist/mcp/server.js"
if [[ ! -f "${MCP_SERVER}" ]]; then
  echo "Warning: ${MCP_SERVER} not found. Run 'npm run build' in Pilot repo first." >&2
fi

cat > "${TARGET}/.scctl-pilot.env.example" <<EOF
# Copy values into your IDE MCP config (env block) or shell profile.
# Pilot install (absolute path):
SCCTL_PILOT_ROOT=${PILOT_ROOT}
# Governed role (unset for operator/debug): manager | builder | critic
SCCTL_GOVERNED_ROLE=builder
# Reject draft render when governed + final task:
# SCCTL_FINAL_NRT=1
EOF

echo ""
echo "Bootstrap complete."
echo ""
echo "Next steps:"
echo "  1. Add MCP server to Cursor / Claude Desktop:"
echo "     command: node"
echo "     args: [\"${MCP_SERVER}\"]"
echo "     env: { \"SCCTL_GOVERNED_ROLE\": \"builder\" }  (optional)"
echo "  2. Open workspace: ${TARGET}"
echo "  3. Verify: node \"${PILOT_ROOT}/dist/cli.js\" check"
echo "  4. Edit docs/superpowers/kb/*.md for your project rules"
echo ""
echo "See docs/guides/consumer-bootstrap.zh-CN.md in Pilot repo for full checklist."
