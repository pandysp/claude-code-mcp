import { ClaudeMock } from './claude-mock.js';

let sharedMock: ClaudeMock | null = null;

export async function getSharedMock(): Promise<ClaudeMock> {
  if (!sharedMock) {
    sharedMock = new ClaudeMock('claudeMocked');
  }

  // Always overwrite the mock script to ensure it matches the current version.
  // Skipping setup when the file exists risks running tests against a stale mock.
  await sharedMock.setup();

  return sharedMock;
}

export async function cleanupSharedMock(): Promise<void> {
  // No-op: mock lives in /tmp and is safe to leave.
  // Cleaning up here caused race conditions when vitest runs
  // multiple test files in parallel that share the same mock.
  sharedMock = null;
}