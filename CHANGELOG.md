# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-02-10

### Added

- `claude_code_reply` tool for session continuity (resume conversations via `--resume` and thread IDs)
- `structuredContent` response extension with `threadId` for multi-agent session threading
- JSON output parsing (`--output-format json`) with `session_id`, `result`, and `is_error` extraction
- Comprehensive unit test suite (100 tests, fully mocked)

### Changed

- Standalone project under `@pandysp/claude-code-mcp` (previously forked from `@steipete/claude-code-mcp`)
- Consolidated CI into a single GitHub Actions workflow with npm publish on tag push
- Improved error handling with detailed stderr/stdout in error messages
- **Breaking:** `workFolder: ""` (empty string) now throws `InvalidParams` instead of silently defaulting to home directory

### Fixed

- Hardened `parseClaudeOutput` with graceful fallback when JSON parsing fails
- `workFolder` validation now throws `InvalidParams` for non-existent directories

---

Originally forked from [steipete/claude-code-mcp](https://github.com/steipete/claude-code-mcp).
