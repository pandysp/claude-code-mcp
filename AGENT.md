# AGENT.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

This is `@pandysp/claude-code-mcp` -- an MCP server that runs Claude Code as a tool with session continuity. It provides two tools: `claude_code` (one-shot) and `claude_code_reply` (resume by thread ID).

## Key Files

- `src/server.ts`: Main server implementation (tool definitions, CLI invocation, JSON output parsing)
- `package.json`: Package configuration and dependencies
- `start.sh`/`start.bat`: Scripts to start the server

## Development Commands

```bash
npm install          # Install dependencies
npm run build        # Build (tsc)
npm run start        # Start the server
npm run dev          # Dev mode with tsx
npm run test:unit    # Run unit tests
npm run test:coverage # Coverage report
```

## Architecture Notes

- Two MCP tools: `claude_code` (one-shot) and `claude_code_reply` (session resume via `--resume`)
- CLI invocation via `spawnAsync` with 30-minute timeout
- JSON output parsing extracts `session_id`, `result`, and `is_error` from `--output-format json`
- `structuredContent.threadId` in responses enables multi-agent session threading
- `workFolder` validation rejects non-existent directories with `InvalidParams`

## Environment Variables

- `CLAUDE_CLI_NAME`: Override CLI binary name or absolute path (default: `claude`)
- `MCP_CLAUDE_DEBUG`: Set to `true` for verbose debug logging

## Best Practices

- Always test changes locally before committing
- Maintain compatibility with the Model Context Protocol spec
- Keep error messages informative for troubleshooting
- Document any changes to the API or configuration options
- Use `./scripts/publish-release.sh` for releases (automatically syncs `SERVER_VERSION` in `src/server.ts` with `package.json`)
