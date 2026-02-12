// Global test setup
import { beforeAll } from 'vitest';
import { getSharedMock } from './utils/persistent-mock.js';

beforeAll(async () => {
  console.error('[TEST SETUP] Creating shared mock for all tests...');
  await getSharedMock();
});

// Note: We don't clean up the mock in afterAll because:
// 1. It's in a temporary location (.claude-code-test-mock)
// 2. Multiple test files may still be using it when afterAll runs
// 3. The mock file is small and will be recreated on next test run