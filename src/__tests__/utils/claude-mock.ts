import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { getTestMockBaseDir } from './test-helpers.js';

/**
 * Mock Claude CLI for testing
 * This creates a fake Claude CLI that can be used during testing
 */
export class ClaudeMock {
  private mockPath: string;
  private responses = new Map<string, string>();

  constructor(binaryName: string = 'claude') {
    this.mockPath = join(getTestMockBaseDir(), '.claude-code-test-mock', binaryName);
  }

  /**
   * Setup the mock Claude CLI
   */
  async setup(): Promise<void> {
    const dir = dirname(this.mockPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Create a simple bash script that echoes responses
    const mockScript = `#!/bin/bash
# Mock Claude CLI for testing

# Extract the prompt and format from arguments
prompt=""
output_format=""
verbose=false
# -p is a flag indicating the last positional arg is the prompt
use_positional_prompt=false

while [[ $# -gt 0 ]]; do
  case $1 in
    -p)
      # -p is just a flag, prompt comes as last positional argument
      use_positional_prompt=true
      shift
      ;;
    --prompt)
      prompt="$2"
      shift 2
      ;;
    --output-format)
      output_format="$2"
      shift 2
      ;;
    --verbose)
      verbose=true
      shift
      ;;
    --yes|-y|--dangerously-skip-permissions|--resume)
      shift
      ;;
    *)
      # If we're using positional prompt, the last arg is the prompt
      if [[ $use_positional_prompt == true ]]; then
        prompt="$1"
      fi
      shift
      ;;
  esac
done

# Generate a mock session ID
session_id="test-session-$(date +%s)-$$"

# Mock responses based on prompt
if [[ "$prompt" == *"error"* ]]; then
  if [[ "$output_format" == "json" ]]; then
    echo '{"result": "Error: Mock error response", "is_error": true, "session_id": "'$session_id'"}'
    exit 1
  else
    echo "Error: Mock error response" >&2
    exit 1
  fi
elif [[ "$prompt" == *"create"* ]] || [[ "$prompt" == *"Create"* ]]; then
  if [[ "$output_format" == "json" ]]; then
    echo '{"result": "Created file successfully", "session_id": "'$session_id'"}'
  else
    echo "Created file successfully"
  fi
elif [[ "$prompt" == *"git"* ]] && [[ "$prompt" == *"commit"* ]]; then
  if [[ "$output_format" == "json" ]]; then
    echo '{"result": "Committed changes successfully", "session_id": "'$session_id'"}'
  else
    echo "Committed changes successfully"
  fi
else
  if [[ "$output_format" == "json" ]]; then
    echo '{"result": "Command executed successfully", "session_id": "'$session_id'"}'
  else
    echo "Command executed successfully"
  fi
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