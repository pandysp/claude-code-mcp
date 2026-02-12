import { ClaudeMock } from './claude-mock.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getTestMockBaseDir } from './test-helpers.js';

let sharedMock: ClaudeMock | null = null;

export async function getSharedMock(): Promise<ClaudeMock> {
  if (!sharedMock) {
    sharedMock = new ClaudeMock('claudeMocked');
  }

  // Always ensure mock exists and is executable
  const mockPath = join(getTestMockBaseDir(), '.claude-code-test-mock', 'claudeMocked');
  if (!existsSync(mockPath)) {
    console.error(`[DEBUG] Mock not found at ${mockPath}, creating it...`);
    await sharedMock.setup();
    console.error(`[DEBUG] Mock created and made executable at ${mockPath}`);
  } else {
    console.error(`[DEBUG] Mock already exists at ${mockPath}`);
    // Re-apply chmod to ensure it's executable in case permissions were lost
    const { chmodSync } = await import('node:fs');
    chmodSync(mockPath, 0o755);
    console.error(`[DEBUG] Re-applied executable permissions to ${mockPath}`);
  }

  return sharedMock;
}

export async function cleanupSharedMock(): Promise<void> {
  if (sharedMock) {
    await sharedMock.cleanup();
    sharedMock = null;
  }
}