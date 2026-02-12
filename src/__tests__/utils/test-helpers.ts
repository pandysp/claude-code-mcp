import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Get the base directory for test mocks.
 * Uses HOME if set and not /home/node (which is noexec in containers),
 * otherwise falls back to /workspace (which is executable).
 */
export function getTestMockBaseDir(): string {
  const home = process.env.HOME || homedir();

  // If HOME is /home/node or empty, use /workspace instead (noexec issue in containers)
  if (!home || home === '/home/node') {
    return '/workspace';
  }

  return home;
}

export function verifyMockExists(binaryName: string): boolean {
  const mockPath = join(getTestMockBaseDir(), '.claude-code-test-mock', binaryName);
  return existsSync(mockPath);
}

export async function ensureMockExists(mock: any): Promise<void> {
  if (!verifyMockExists('claudeMocked')) {
    await mock.setup();
  }
}