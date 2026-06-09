# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.0.x   | Yes       |

## Reporting a Vulnerability

Please **do not** open public GitHub issues for security vulnerabilities.

Report privately by opening a [GitHub Security Advisory](https://github.com/Bayern99/supercollider-mcp/security/advisories/new) or emailing the repository owner.

We aim to acknowledge reports within 72 hours.

## Trust Boundary

**scctl is not a sandbox.** The `sc_eval` MCP tool executes arbitrary SuperCollider code with the privileges of the host user. SuperCollider can access the file system, spawn processes, and load extensions.

### Safe usage

- Run the MCP server **locally** only
- Connect only **trusted** MCP clients (e.g. Claude Desktop, Cursor on your own machine)
- Do **not** expose the MCP server to the public internet
- Review AI-generated SuperCollider code before execution when the source is untrusted

### Out of scope

Code execution risks inherent to SuperCollider itself are expected behavior, not vulnerabilities in scctl, unless scctl fails to document or enforce its stated trust model.
