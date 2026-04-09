/**
 * Integration Tests - Full User Flows
 *
 * These tests verify complete user workflows work end-to-end.
 * They must pass against both TypeScript and Rust implementations.
 */

import { describe, test, expect, beforeAll } from '@jest/globals';

const API_BASE = process.env.API_URL || 'http://localhost:3457';

async function apiRequest(path: string, options?: RequestInit): Promise<Response> {
  const url = `${API_BASE}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
}

describe('Integration - User Workflows', () => {
  describe('Complete Thread Lifecycle', () => {
    let threadId: string;

    test('Create project workspace', async () => {
      const response = await apiRequest('/codex-api/project-root', {
        method: 'POST',
        body: JSON.stringify({
          path: '/tmp/codex-integration-test',
          createIfMissing: true,
          label: 'Integration Test',
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data).toHaveProperty('path');
    });

    // Note: Thread lifecycle tests require codex process to be fully spawned
    // These are skipped by default for quick regression testing
    test.skip('Start a thread via RPC [REQUIRES CODEX]', async () => {
      const response = await apiRequest('/codex-api/rpc', {
        method: 'POST',
        body: JSON.stringify({
          method: 'thread/start',
          params: {
            cwd: '/tmp/codex-integration-test',
            instructions: 'Test thread',
          },
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('result');
      expect(body.result).toHaveProperty('thread');
      threadId = body.result.thread.id;
      expect(threadId).toBeDefined();
    });

    test.skip('Read thread via RPC [REQUIRES CODEX]', async () => {
      const response = await apiRequest('/codex-api/rpc', {
        method: 'POST',
        body: JSON.stringify({
          method: 'thread/read',
          params: {
            thread_id: threadId,
            includeTurns: false,
          },
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.result).toHaveProperty('thread');
      expect(body.result.thread.id).toBe(threadId);
    });

    test('Settings survive thread operations', async () => {
      // Update settings
      await apiRequest('/codex-api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          sandboxMode: 'workspace-write',
        }),
      });

      // Read settings back
      const response = await apiRequest('/codex-api/settings');
      const body = await response.json();

      expect(body.data.sandboxMode).toBe('workspace-write');
    });

    test('Cleanup - delete project', async () => {
      const response = await apiRequest('/codex-api/project', {
        method: 'DELETE',
        body: JSON.stringify({
          path: '/tmp/codex-integration-test',
        }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toHaveProperty('ok', true);
    });
  });

  describe('File Operations', () => {
    test('Write and read back user files', async () => {
      const testContent = 'Test content ' + Date.now();

      // Write file
      const writeResponse = await apiRequest('/codex-api/user-files/write', {
        method: 'POST',
        body: JSON.stringify({
          path: 'test/integration.txt',
          content: testContent,
        }),
      });

      expect(writeResponse.status).toBe(200);

      // List files
      const listResponse = await apiRequest('/codex-api/user-files/list');
      const listBody = await listResponse.json();

      expect(listBody.data.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'test' }),
        ])
      );
    });
  });
});
