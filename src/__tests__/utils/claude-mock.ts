import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * Mock Claude CLI for testing
 * This creates a fake Claude CLI that can be used during testing
 */
export class ClaudeMock {
  private mockPath: string;
  private responses = new Map<string, string>();

  constructor(binaryName: string = 'claude') {
    // Use home directory instead of /tmp to avoid noexec issues
    const testMockDir = process.env.HOME || process.env.USERPROFILE || '/home/node';
    this.mockPath = join(testMockDir, '.claude-code-test-mock', binaryName);
  }

  /**
   * Setup the mock Claude CLI
   */
  async setup(): Promise<void> {
    const dir = dirname(this.mockPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Create a simple bash script that echoes responses.
    // The real Claude CLI uses -p as a flag (not an option taking a value).
    // The prompt is the last positional argument:
    //   claude --dangerously-skip-permissions -p --output-format json "the prompt"
    const mockScript = `#!/bin/bash
# Mock Claude CLI for testing

# The prompt is the last positional argument (after all flags/options).
# Collect positional args; the last one is the prompt.
prompt=""
while [[ $# -gt 0 ]]; do
  case $1 in
    -p|--prompt|--dangerously-skip-permissions|--yes|-y)
      shift
      ;;
    --output-format|--resume)
      shift 2
      ;;
    --verbose)
      shift
      ;;
    *)
      prompt="$1"
      shift
      ;;
  esac
done

# Mock responses based on prompt
if [[ "$prompt" == *"error"* ]]; then
  echo "Error: Mock error response" >&2
  exit 1
elif [[ "$prompt" == *"create"* ]] || [[ "$prompt" == *"Create"* ]]; then
  echo "Created file successfully"
elif [[ "$prompt" == *"git"* ]] && [[ "$prompt" == *"commit"* ]]; then
  echo "Committed changes successfully"
else
  echo "Command executed successfully"
fi
`;

    writeFileSync(this.mockPath, mockScript);
    // Make executable - use sync to avoid race condition
    chmodSync(this.mockPath, 0o755);
  }

  /**
   * Cleanup the mock Claude CLI
   */
  async cleanup(): Promise<void> {
    const { rm } = await import('node:fs/promises');
    await rm(this.mockPath, { force: true });
  }

  /**
   * Add a mock response for a specific prompt pattern
   */
  addResponse(pattern: string, response: string): void {
    this.responses.set(pattern, response);
  }
}