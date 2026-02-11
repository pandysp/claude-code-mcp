#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type ServerResult,
} from '@modelcontextprotocol/sdk/types.js';
import { spawn } from 'node:child_process';

type ExtendedServerResult = ServerResult & {
  structuredContent?: { threadId: string; content: string };
};
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve as pathResolve } from 'node:path';
import * as path from 'path';

// Server version - update this when releasing new versions
const SERVER_VERSION = "2.0.0";

/**
 * Structured output from `claude -p --output-format json`
 */
interface ClaudeJsonOutput {
  type: string;
  session_id: string;
  result: string;
  is_error: boolean;
  duration_ms: number;
  total_cost_usd: number;
}

// Define debugMode globally using const
const debugMode = process.env.MCP_CLAUDE_DEBUG === 'true';

// Track if this is the first tool use for version printing
let isFirstToolUse = true;

// Capture server startup time when the module loads
const serverStartupTime = new Date().toISOString();

// Dedicated debug logging function
export function debugLog(message?: any, ...optionalParams: any[]): void {
  if (debugMode) {
    console.error(message, ...optionalParams);
  }
}

/**
 * Determine the Claude CLI command/path.
 * 1. Checks for CLAUDE_CLI_NAME environment variable:
 *    - If absolute path, uses it directly
 *    - If relative path, throws error
 *    - If simple name, continues with path resolution
 * 2. Checks for Claude CLI at the local user path: ~/.claude/local/claude.
 * 3. If not found, defaults to the CLI name (or 'claude'), relying on the system's PATH for lookup.
 */
export function findClaudeCli(): string {
  debugLog('[Debug] Attempting to find Claude CLI...');

  // Check for custom CLI name from environment variable
  const customCliName = process.env.CLAUDE_CLI_NAME;
  if (customCliName) {
    debugLog(`[Debug] Using custom Claude CLI name from CLAUDE_CLI_NAME: ${customCliName}`);
    
    // If it's an absolute path, use it directly
    if (path.isAbsolute(customCliName)) {
      debugLog(`[Debug] CLAUDE_CLI_NAME is an absolute path: ${customCliName}`);
      return customCliName;
    }
    
    // If it starts with ~ or ./, reject as relative paths are not allowed
    if (customCliName.startsWith('./') || customCliName.startsWith('../') || customCliName.includes('/')) {
      throw new Error(`Invalid CLAUDE_CLI_NAME: Relative paths are not allowed. Use either a simple name (e.g., 'claude') or an absolute path (e.g., '/tmp/claude-test')`);
    }
  }
  
  const cliName = customCliName || 'claude';

  // Try local install path: ~/.claude/local/claude (using the original name for local installs)
  const userPath = join(homedir(), '.claude', 'local', 'claude');
  debugLog(`[Debug] Checking for Claude CLI at local user path: ${userPath}`);

  if (existsSync(userPath)) {
    debugLog(`[Debug] Found Claude CLI at local user path: ${userPath}. Using this path.`);
    return userPath;
  } else {
    debugLog(`[Debug] Claude CLI not found at local user path: ${userPath}.`);
  }

  // 3. Fallback to CLI name (PATH lookup)
  debugLog(`[Debug] Falling back to "${cliName}" command name, relying on spawn/PATH lookup.`);
  console.warn(`[Warning] Claude CLI not found at ~/.claude/local/claude. Falling back to "${cliName}" in PATH. Ensure it is installed and accessible.`);
  return cliName;
}

/**
 * Parse Claude CLI JSON output, extracting session_id and result text.
 * Falls back to raw text if JSON parsing fails, with a warning logged.
 */
export function parseClaudeOutput(stdout: string): { resultText: string; sessionId?: string; isError?: boolean } {
  try {
    const parsed = JSON.parse(stdout);
    if (typeof parsed.result !== 'string') {
      console.error(
        `[Warning] Claude CLI JSON output missing 'result' field. ` +
        `Keys found: ${Object.keys(parsed).join(', ')}. Falling back to raw output.`
      );
      return { resultText: stdout };
    }
    return {
      resultText: parsed.result,
      sessionId: typeof parsed.session_id === 'string' ? parsed.session_id : undefined,
      isError: typeof parsed.is_error === 'boolean' ? parsed.is_error : undefined,
    };
  } catch (e) {
    console.error(
      `[Warning] Failed to parse Claude CLI JSON output. ` +
      `Session continuity will not work for this response. ` +
      `This may indicate the CLI does not support --output-format json. ` +
      `Parse error: ${e instanceof Error ? e.message : String(e)}. ` +
      `Raw output (first 200 chars): ${stdout.slice(0, 200)}`
    );
    return { resultText: stdout };
  }
}

/**
 * Build the MCP response with optional structuredContent containing threadId.
 *
 * NOTE: `structuredContent` is NOT part of the official MCP spec. It is an
 * extension consumed by OpenClaw's multi-agent system to enable session
 * threading across tool calls. Other MCP clients will ignore it.
 */
export function buildResponse(resultText: string, sessionId?: string, isError?: boolean): ExtendedServerResult {
  const response: ExtendedServerResult = {
    content: [{ type: 'text', text: resultText }],
    isError: isError ?? false,
  };
  if (sessionId) {
    response.structuredContent = { threadId: sessionId, content: resultText };
  }
  return response;
}

/**
 * Resolve the effective CWD from a workFolder argument.
 * Throws InvalidParams if the specified directory does not exist.
 */
function resolveWorkFolder(workFolder?: unknown): string {
  if (typeof workFolder === 'string' && workFolder.trim() === '') {
    throw new McpError(ErrorCode.InvalidParams, 'workFolder cannot be an empty string');
  }
  if (workFolder && typeof workFolder === 'string') {
    const resolvedCwd = pathResolve(workFolder);
    debugLog(`[Debug] Specified workFolder: ${workFolder}, Resolved to: ${resolvedCwd}`);
    if (existsSync(resolvedCwd)) {
      debugLog(`[Debug] Using workFolder as CWD: ${resolvedCwd}`);
      return resolvedCwd;
    }
    throw new McpError(
      ErrorCode.InvalidParams,
      `Specified workFolder does not exist: ${resolvedCwd}`
    );
  }
  debugLog(`[Debug] No workFolder provided, using default CWD: ${homedir()}`);
  return homedir();
}

// Ensure spawnAsync is defined correctly *before* the class
export async function spawnAsync(command: string, args: string[], options?: { timeout?: number, cwd?: string }): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    debugLog(`[Spawn] Running command: ${command} ${args.join(' ')}`);
    const process = spawn(command, args, {
      shell: false, // Reverted to false
      timeout: options?.timeout,
      cwd: options?.cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    process.stdout.on('data', (data) => { stdout += data.toString(); });
    process.stderr.on('data', (data) => {
      stderr += data.toString();
      debugLog(`[Spawn Stderr Chunk] ${data.toString()}`);
    });

    process.on('error', (error: NodeJS.ErrnoException) => {
      if (settled) { debugLog('[Spawn] Ignoring error event after promise settled'); return; }
      settled = true;
      debugLog(`[Spawn Error Event] Full error object:`, error);
      let errorMessage = `Spawn error: ${error.message}`;
      if (error.path) {
        errorMessage += ` | Path: ${error.path}`;
      }
      if (error.syscall) {
        errorMessage += ` | Syscall: ${error.syscall}`;
      }
      errorMessage += `\nStderr: ${stderr.trim()}`;
      reject(new Error(errorMessage));
    });

    process.on('close', (code) => {
      if (settled) { debugLog('[Spawn] Ignoring close event after promise settled'); return; }
      settled = true;
      debugLog(`[Spawn Close] Exit code: ${code}`);
      debugLog(`[Spawn Stderr Full] ${stderr.trim()}`);
      debugLog(`[Spawn Stdout Full] ${stdout.trim()}`);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with exit code ${code}\nStderr: ${stderr.trim()}\nStdout: ${stdout.trim()}`));
      }
    });
  });
}

/**
 * MCP Server for Claude Code
 * Provides a simple MCP tool to run Claude CLI in one-shot mode
 */
export class ClaudeCodeServer {
  private server: Server;
  private claudeCliPath: string; // This now holds either a full path or just 'claude'
  private packageVersion: string; // Add packageVersion property

  constructor() {
    // Use the simplified findClaudeCli function
    this.claudeCliPath = findClaudeCli(); // Removed debugMode argument
    console.error(`[Setup] Using Claude CLI command/path: ${this.claudeCliPath}`);
    this.packageVersion = SERVER_VERSION;

    this.server = new Server(
      {
        name: 'claude_code',
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();

    this.server.onerror = (error) => console.error('[Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  /**
   * Set up the MCP tool handlers
   */
  private setupToolHandlers(): void {
    // Define available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'claude_code',
          description: `Claude Code Agent: Your versatile multi-modal assistant for code, file, Git, and terminal operations via Claude CLI. Use \`workFolder\` for contextual execution.

• File ops: Create, read, (fuzzy) edit, move, copy, delete, list files, analyze/ocr images, file content analysis
    └─ e.g., "Create /tmp/log.txt with 'system boot'", "Edit main.py to replace 'debug_mode = True' with 'debug_mode = False'", "List files in /src", "Move a specific section somewhere else"

• Code: Generate / analyse / refactor / fix
    └─ e.g. "Generate Python to parse CSV→JSON", "Find bugs in my_script.py"

• Git: Stage ▸ commit ▸ push ▸ tag (any workflow)
    └─ "Commit '/workspace/src/main.java' with 'feat: user auth' to develop."

• Terminal: Run any CLI cmd or open URLs
    └─ "npm run build", "Open https://developer.mozilla.org"

• Web search + summarise content on-the-fly

• Multi-step workflows  (Version bumps, changelog updates, release tagging, etc.)

• GitHub integration  Create PRs, check CI status

• Confused or stuck on an issue? Ask Claude Code for a second opinion, it might surprise you!

**Prompt tips**

1. Be concise, explicit & step-by-step for complex tasks. No need for niceties, this is a tool to get things done.
2. For multi-line text, write it to a temporary file in the project root, use that file, then delete it.
3. If you get a timeout, split the task into smaller steps.
4. **Seeking a second opinion/analysis**: If you're stuck or want advice, you can ask \`claude_code\` to analyze a problem and suggest solutions. Clearly state in your prompt that you are looking for analysis only and no actual file modifications should be made.
5. If workFolder is set to the project path, there is no need to repeat that path in the prompt and you can use relative paths for files.
6. Claude Code is really good at complex multi-step file operations and refactorings and faster than your native edit features.
7. Combine file operations, README updates, and Git commands in a sequence.
8. Claude can do much more, just ask it!

        `,
          inputSchema: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description: 'The detailed natural language prompt for Claude to execute.',
              },
              workFolder: {
                type: 'string',
                description: 'Mandatory when using file operations or referencing any file. The working directory for the Claude CLI execution. Must be an absolute path.',
              },
            },
            required: ['prompt'],
          },
        },
        {
          name: 'claude_code_reply',
          description: 'Continue a Claude Code conversation by providing the thread ID and a new prompt. Use this to send follow-up instructions that build on prior context from a previous claude_code call. If the original call used a workFolder, provide the same workFolder here to maintain execution context.',
          inputSchema: {
            type: 'object',
            properties: {
              threadId: {
                type: 'string',
                description: 'The thread/session ID from a previous claude_code or claude_code_reply call.',
              },
              prompt: {
                type: 'string',
                description: 'The follow-up prompt to continue the conversation.',
              },
              workFolder: {
                type: 'string',
                description: 'The working directory for execution. Should match the workFolder from the original claude_code call. Must be an absolute path.',
              },
            },
            required: ['threadId', 'prompt'],
          },
        },
      ],
    }));

    // Handle tool calls
    const executionTimeoutMs = 1800000; // 30 minutes timeout

    this.server.setRequestHandler(CallToolRequestSchema, async (args, call): Promise<ServerResult> => {
      debugLog('[Debug] Handling CallToolRequest:', args);

      const toolName = args.params.name;
      const toolArguments = args.params.arguments;

      if (toolName !== 'claude_code' && toolName !== 'claude_code_reply') {
        throw new McpError(ErrorCode.MethodNotFound, `Tool ${toolName} not found`);
      }

      // Print tool info on first use
      if (isFirstToolUse) {
        const versionInfo = `claude_code v${SERVER_VERSION} started at ${serverStartupTime}`;
        console.error(versionInfo);
        isFirstToolUse = false;
      }

      // --- claude_code_reply ---
      if (toolName === 'claude_code_reply') {
        const threadId = toolArguments?.threadId;
        const prompt = toolArguments?.prompt;

        if (!threadId || typeof threadId !== 'string') {
          throw new McpError(ErrorCode.InvalidParams, 'Missing or invalid required parameter: threadId');
        }
        if (!prompt || typeof prompt !== 'string') {
          throw new McpError(ErrorCode.InvalidParams, 'Missing or invalid required parameter: prompt');
        }

        const effectiveCwd = resolveWorkFolder(toolArguments?.workFolder);

        try {
          debugLog(`[Debug] Resuming session ${threadId} with prompt: "${prompt}" in CWD: "${effectiveCwd}"`);
          const claudeProcessArgs = ['--dangerously-skip-permissions', '-p', '--output-format', 'json', '--resume', threadId, prompt];
          debugLog(`[Debug] Invoking Claude CLI: ${this.claudeCliPath} ${claudeProcessArgs.join(' ')}`);

          const { stdout, stderr } = await spawnAsync(
            this.claudeCliPath,
            claudeProcessArgs,
            { timeout: executionTimeoutMs, cwd: effectiveCwd }
          );

          debugLog('[Debug] Claude CLI stdout:', stdout.trim());
          if (stderr) debugLog('[Debug] Claude CLI stderr:', stderr.trim());

          const { resultText, sessionId, isError } = parseClaudeOutput(stdout);
          return buildResponse(resultText, sessionId, isError);

        } catch (error: any) {
          if (error instanceof McpError) throw error;
          debugLog('[Error] Error executing Claude CLI (reply):', error);
          let errorMessage = error.message || 'Unknown error';
          if (error.stderr) errorMessage += `\nStderr: ${error.stderr}`;
          if (error.stdout) errorMessage += `\nStdout: ${error.stdout}`;
          if (error.message?.includes('ENOENT')) {
            errorMessage += '\nClaude CLI not found. Ensure it is installed and in your PATH, or set CLAUDE_CLI_NAME.';
          }
          if (error.signal === 'SIGTERM' || error.message?.includes('ETIMEDOUT') || error.code === 'ETIMEDOUT') {
            throw new McpError(ErrorCode.InternalError, `Claude CLI command timed out after ${executionTimeoutMs / 1000}s. Details: ${errorMessage}`);
          }
          throw new McpError(ErrorCode.InternalError, `Claude CLI execution failed: ${errorMessage}`);
        }
      }

      // --- claude_code ---
      let prompt: string;
      if (
        toolArguments &&
        typeof toolArguments === 'object' &&
        'prompt' in toolArguments &&
        typeof toolArguments.prompt === 'string'
      ) {
        prompt = toolArguments.prompt;
      } else {
        throw new McpError(ErrorCode.InvalidParams, 'Missing or invalid required parameter: prompt (must be an object with a string "prompt" property) for claude_code tool');
      }

      const effectiveCwd = resolveWorkFolder(toolArguments.workFolder);

      try {
        debugLog(`[Debug] Attempting to execute Claude CLI with prompt: "${prompt}" in CWD: "${effectiveCwd}"`);

        const claudeProcessArgs = ['--dangerously-skip-permissions', '-p', '--output-format', 'json', prompt];
        debugLog(`[Debug] Invoking Claude CLI: ${this.claudeCliPath} ${claudeProcessArgs.join(' ')}`);

        const { stdout, stderr } = await spawnAsync(
          this.claudeCliPath,
          claudeProcessArgs,
          { timeout: executionTimeoutMs, cwd: effectiveCwd }
        );

        debugLog('[Debug] Claude CLI stdout:', stdout.trim());
        if (stderr) debugLog('[Debug] Claude CLI stderr:', stderr.trim());

        const { resultText, sessionId, isError } = parseClaudeOutput(stdout);
        return buildResponse(resultText, sessionId, isError);

      } catch (error: any) {
        if (error instanceof McpError) throw error;
        debugLog('[Error] Error executing Claude CLI:', error);
        let errorMessage = error.message || 'Unknown error';
        if (error.stderr) errorMessage += `\nStderr: ${error.stderr}`;
        if (error.stdout) errorMessage += `\nStdout: ${error.stdout}`;
        if (error.message?.includes('ENOENT')) {
          errorMessage += '\nClaude CLI not found. Ensure it is installed and in your PATH, or set CLAUDE_CLI_NAME.';
        }

        if (error.signal === 'SIGTERM' || error.message?.includes('ETIMEDOUT') || error.code === 'ETIMEDOUT') {
          throw new McpError(ErrorCode.InternalError, `Claude CLI command timed out after ${executionTimeoutMs / 1000}s. Details: ${errorMessage}`);
        }
        throw new McpError(ErrorCode.InternalError, `Claude CLI execution failed: ${errorMessage}`);
      }
    });
  }

  /**
   * Start the MCP server
   */
  async run(): Promise<void> {
    // Revert to original server start logic if listen caused errors
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Claude Code MCP server running on stdio');
  }
}

// Create and run the server unless under vitest (tests instantiate manually).
// When VITEST is set, skip auto-start so tests can control instantiation.
// If this guard incorrectly fires in production, check for VITEST in the environment.
if (!process.env.VITEST) {
  const server = new ClaudeCodeServer();
  server.run().catch((error) => {
    console.error('[Fatal] Server failed to start:', error);
    process.exit(1);
  });
}