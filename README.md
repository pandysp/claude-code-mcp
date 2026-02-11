# Claude Code MCP Server

[![npm](https://img.shields.io/npm/v/@pandysp/claude-code-mcp)](https://www.npmjs.com/package/@pandysp/claude-code-mcp)
[![CI](https://github.com/pandysp/claude-code-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/pandysp/claude-code-mcp/actions/workflows/ci.yml)

MCP server that runs Claude Code as a tool -- with session continuity.

Provides two tools via the [Model Context Protocol](https://modelcontextprotocol.io/):

- **`claude_code`** -- Run Claude Code in one-shot mode with any prompt
- **`claude_code_reply`** -- Continue a previous conversation by thread ID

Both tools parse structured JSON output from the CLI, returning `session_id` for threading and `is_error` for error detection. A 30-minute execution timeout prevents runaway processes.

## Quick Start

```bash
npx @pandysp/claude-code-mcp@latest
```

Requires Node.js 20+ and the [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) installed locally.

### First-time setup

Accept the CLI permissions once before the MCP server can use them:

```bash
npm install -g @anthropic-ai/claude-code
claude --dangerously-skip-permissions
```

## Configuration

Add to your MCP client config:

### Claude Desktop / Cursor

```json
{
  "mcpServers": {
    "claude-code-mcp": {
      "command": "npx",
      "args": ["-y", "@pandysp/claude-code-mcp@latest"]
    }
  }
}
```

### Windsurf

```json
{
  "mcpServers": {
    "claude-code-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@pandysp/claude-code-mcp@latest"]
    }
  }
}
```

### OpenClaw (Docker)

When running inside a Docker container (e.g., as an OpenClaw MCP adapter server), use the container's `node` binary directly instead of `npx`:

```json
{
  "command": "node",
  "args": ["/path/to/dist/server.js"]
}
```

## Tools Reference

### `claude_code`

Run Claude Code with a one-shot prompt.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | yes | The prompt to send to Claude Code |
| `workFolder` | string | no | Absolute path to the working directory |

Returns the CLI result text. If the CLI outputs JSON with a `session_id`, the response includes `structuredContent.threadId` for use with `claude_code_reply`.

### `claude_code_reply`

Continue a previous Claude Code conversation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `threadId` | string | yes | Session ID from a previous call |
| `prompt` | string | yes | Follow-up prompt |
| `workFolder` | string | no | Should match the original call's working directory |

Uses `--resume <threadId>` under the hood to maintain conversation context.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_CLI_NAME` | `claude` | Override the CLI binary name or absolute path |
| `MCP_CLAUDE_DEBUG` | `false` | Enable verbose debug logging to stderr |

`CLAUDE_CLI_NAME` supports simple names (looked up in PATH) or absolute paths. Relative paths are rejected.

## Development

```bash
npm install
npm run build
npm run test:unit    # 100 unit tests, fully mocked
npm run dev          # dev mode with tsx
```

## Attribution

Originally forked from [@steipete/claude-code-mcp](https://github.com/steipete/claude-code-mcp).

## License

MIT
