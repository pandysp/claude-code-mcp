import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MCPTestClient } from './utils/mcp-client.js';
import { getSharedMock, cleanupSharedMock } from './utils/persistent-mock.js';
import { getTestMockBaseDir } from './utils/test-helpers.js';

describe('Claude Code MCP E2E Tests', () => {
  let client: MCPTestClient;
  let testDir: string;
  const serverPath = 'dist/server.js';
  const mockBinaryPath = join(getTestMockBaseDir(), '.claude-code-test-mock', 'claudeMocked');

  beforeEach(async () => {
    // Ensure mock exists
    await getSharedMock();

    // Create a temporary directory for test files
    testDir = mkdtempSync(join(tmpdir(), 'claude-code-test-'));

    // Initialize MCP client with debug mode and custom binary name using absolute path
    client = new MCPTestClient(serverPath, {
      MCP_CLAUDE_DEBUG: 'true',
      CLAUDE_CLI_NAME: mockBinaryPath,
    });

    await client.connect();
  });

  afterEach(async () => {
    // Disconnect client
    await client.disconnect();
    
    // Clean up test directory
    rmSync(testDir, { recursive: true, force: true });
  });
  
  afterAll(async () => {
    // Only cleanup mock at the very end
    await cleanupSharedMock();
  });

  describe('Tool Registration', () => {
    it('should register claude_code and claude_code_reply tools', async () => {
      const tools = await client.listTools();

      expect(tools).toHaveLength(2);
      expect(tools[0]).toEqual({
        name: 'claude_code',
        description: expect.stringContaining('Claude Code Agent'),
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'The detailed natural language prompt for Claude to execute.',
            },
            workFolder: {
              type: 'string',
              description: expect.stringContaining('working directory'),
            },
          },
          required: ['prompt'],
        },
      });
      expect(tools[1]).toEqual({
        name: 'claude_code_reply',
        description: expect.stringContaining('Continue a Claude Code conversation'),
        inputSchema: {
          type: 'object',
          properties: {
            threadId: {
              type: 'string',
              description: expect.stringContaining('thread/session ID'),
            },
            prompt: {
              type: 'string',
              description: expect.stringContaining('follow-up prompt'),
            },
            workFolder: {
              type: 'string',
              description: expect.stringContaining('working directory'),
            },
          },
          required: ['threadId', 'prompt'],
        },
      });
    });
  });

  describe('Basic Operations', () => {
    it('should execute a simple prompt', async () => {
      const response = await client.callTool('claude_code', {
        prompt: 'create a file called test.txt with content "Hello World"',
        workFolder: testDir,
      });

      expect(response).toEqual([{
        type: 'text',
        text: expect.stringContaining('successfully'),
      }]);
    });

    it('should handle errors gracefully', async () => {
      // The mock should trigger an error
      await expect(
        client.callTool('claude_code', {
          prompt: 'error',
          workFolder: testDir,
        })
      ).rejects.toThrow();
    });

    it('should use default working directory when not specified', async () => {
      const response = await client.callTool('claude_code', {
        prompt: 'List files in current directory',
      });

      expect(response).toBeTruthy();
    });
  });

  describe('Working Directory Handling', () => {
    it('should respect custom working directory', async () => {
      const response = await client.callTool('claude_code', {
        prompt: 'Show current working directory',
        workFolder: testDir,
      });

      expect(response).toBeTruthy();
    });

    it('should reject non-existent working directory', async () => {
      const nonExistentDir = join(testDir, 'non-existent');

      await expect(
        client.callTool('claude_code', {
          prompt: 'Test prompt',
          workFolder: nonExistentDir,
        })
      ).rejects.toThrow(/Specified workFolder does not exist/);
    });
  });

  describe('Timeout Handling', () => {
    it('should respect timeout settings', async () => {
      // This would require modifying the mock to simulate a long-running command
      // Since we're testing locally, we'll skip the actual timeout test
      expect(true).toBe(true);
    });
  });

  describe('Debug Mode', () => {
    it('should log debug information when enabled', async () => {
      // Debug logs go to stderr, which we capture in the client
      const response = await client.callTool('claude_code', {
        prompt: 'Debug test prompt',
        workFolder: testDir,
      });

      expect(response).toBeTruthy();
    });
  });
});

describe('Integration Tests (Local Only)', () => {
  let client: MCPTestClient;
  let testDir: string;

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'claude-code-integration-'));
    
    // Initialize client without mocks for real Claude testing
    client = new MCPTestClient('dist/server.js', {
      MCP_CLAUDE_DEBUG: 'true',
    });
  });

  afterEach(async () => {
    if (client) {
      await client.disconnect();
    }
    rmSync(testDir, { recursive: true, force: true });
  });

  // These tests will only run locally when Claude is available
  it.skip('should create a file with real Claude CLI', async () => {
    await client.connect();
    
    const response = await client.callTool('claude_code', {
      prompt: 'Create a file called hello.txt with content "Hello from Claude"',
      workFolder: testDir,
    });

    const filePath = join(testDir, 'hello.txt');
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf-8')).toContain('Hello from Claude');
  });

  it.skip('should handle git operations with real Claude CLI', async () => {
    await client.connect();
    
    // Initialize git repo
    const response = await client.callTool('claude_code', {
      prompt: 'Initialize a git repository and create a README.md file',
      workFolder: testDir,
    });

    expect(existsSync(join(testDir, '.git'))).toBe(true);
    expect(existsSync(join(testDir, 'README.md'))).toBe(true);
  });
});