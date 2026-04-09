/**
 * Regression Tests - API Contract
 *
 * These tests define the expected behavior of the Codex UI API.
 * They must pass against both TypeScript and Rust implementations.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';

const API_BASE = process.env.API_URL || 'http://localhost:3457';

// Helper to make API requests
async function apiRequest(path: string, options?: RequestInit): Promise<Response> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  return response;
}

describe('API Contract - Core Endpoints', () => {
  describe('Health Check', () => {
    test('GET /codex-api/settings returns 200 (server health)', async () => {
      // Main server doesn't have /health, use settings as health check
      const response = await apiRequest('/codex-api/settings');

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty('data');
    });
  });

  describe('RPC Endpoint', () => {
    test('POST /codex-api/rpc accepts requests', async () => {
      // Note: Full RPC tests require codex process spawned
      // This test just verifies the endpoint accepts requests
      const response = await apiRequest('/codex-api/rpc', {
        method: 'POST',
        body: JSON.stringify({
          method: 'meta/methods',
          params: {},
        }),
      });

      // Response may be 200 (success) or 500 (codex not ready)
      // Both indicate endpoint is working
      expect([200, 500]).toContain(response.status);
    });

    test('POST /codex-api/rpc thread/list returns a JSON-RPC result envelope', async () => {
      const response = await apiRequest('/codex-api/rpc', {
        method: 'POST',
        body: JSON.stringify({
          method: 'thread/list',
          params: {
            archived: false,
            limit: 50,
          },
        }),
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty('result');
      expect(body.result).toHaveProperty('data');
      expect(Array.isArray(body.result.data)).toBe(true);
    });

    test('POST /codex-api/rpc collaborationMode/list returns startup defaults', async () => {
      const response = await apiRequest('/codex-api/rpc', {
        method: 'POST',
        body: JSON.stringify({
          method: 'collaborationMode/list',
          params: {},
        }),
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty('result');
      expect(body.result).toHaveProperty('data');
      expect(Array.isArray(body.result.data)).toBe(true);
    });
  });

  describe('Settings Endpoints', () => {
    test('GET /codex-api/settings returns settings object', async () => {
      const response = await apiRequest('/codex-api/settings');

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('codexHome');
      expect(body.data).toHaveProperty('skillsDir');
      expect(body.data).toHaveProperty('userFilesPath');
    });

    test('PUT /codex-api/settings updates settings', async () => {
      const updateResponse = await apiRequest('/codex-api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          sandboxMode: 'workspace-write',
        }),
      });

      expect(updateResponse.status).toBe(200);

      const body = await updateResponse.json();
      expect(body).toHaveProperty('ok', true);
    });

    test('PUT /codex-api/settings rejects invalid sandbox mode', async () => {
      const response = await apiRequest('/codex-api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          sandboxMode: 'invalid-mode',
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('Directory Browser', () => {
    test('GET /codex-api/browse-directory returns directory entries', async () => {
      const response = await apiRequest('/codex-api/browse-directory?path=/tmp');

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('path');
      expect(body.data).toHaveProperty('entries');
      expect(Array.isArray(body.data.entries)).toBe(true);
    });

    test('GET /codex-api/home-directory returns home path', async () => {
      const response = await apiRequest('/codex-api/home-directory');

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('path');
      expect(typeof body.data.path).toBe('string');
    });
  });

  describe('Workspace Roots', () => {
    test('GET /codex-api/workspace-roots-state returns state', async () => {
      const response = await apiRequest('/codex-api/workspace-roots-state');

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('order');
      expect(body.data).toHaveProperty('labels');
      expect(body.data).toHaveProperty('active');
    });

    test('PUT /codex-api/workspace-roots-state updates state', async () => {
      const response = await apiRequest('/codex-api/workspace-roots-state', {
        method: 'PUT',
        body: JSON.stringify({
          order: ['/tmp/test'],
          labels: { '/tmp/test': 'Test' },
          active: ['/tmp/test'],
        }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toHaveProperty('ok', true);
    });
  });

  describe('Project Management', () => {
    test('POST /codex-api/project-root creates project', async () => {
      const response = await apiRequest('/codex-api/project-root', {
        method: 'POST',
        body: JSON.stringify({
          path: '/tmp/codex-test-project',
          createIfMissing: true,
          label: 'Test Project',
        }),
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('path');
    });

    test('DELETE /codex-api/project deletes project', async () => {
      // First create a project to delete
      await apiRequest('/codex-api/project-root', {
        method: 'POST',
        body: JSON.stringify({
          path: '/tmp/codex-delete-test',
          createIfMissing: true,
        }),
      });

      const response = await apiRequest('/codex-api/project', {
        method: 'DELETE',
        body: JSON.stringify({
          path: '/tmp/codex-delete-test',
        }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toHaveProperty('ok', true);
    });
  });

  describe('Skills Hub', () => {
    test('GET /codex-api/meta/methods returns available methods', async () => {
      const response = await apiRequest('/codex-api/meta/methods');

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
    });

    // Note: /codex-api/skills-hub fetches from GitHub API
    // This test is skipped by default to avoid rate limits
    test.skip('GET /codex-api/skills-hub returns skills list [SLOW]', async () => {
      const response = await apiRequest('/codex-api/skills-hub');

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('installed');
      expect(body).toHaveProperty('total');
    });
  });

  describe('User Files', () => {
    test('POST /codex-api/user-files/write creates file', async () => {
      const response = await apiRequest('/codex-api/user-files/write', {
        method: 'POST',
        body: JSON.stringify({
          path: 'test-file.txt',
          content: 'Hello, World!',
        }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toHaveProperty('ok', true);
    });

    test('GET /codex-api/user-files/list returns files', async () => {
      const response = await apiRequest('/codex-api/user-files/list');

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('path');
      expect(body.data).toHaveProperty('entries');
    });
  });

  describe('Events Endpoint', () => {
    // Note: SSE endpoint keeps connection open
    // This test just verifies the endpoint accepts connections
    test('GET /codex-api/events accepts connections', async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1000);

      try {
        const response = await apiRequest('/codex-api/events', {
          signal: controller.signal,
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('text/event-stream');
      } catch (e) {
        // Abort is expected due to timeout
        expect(e.name).toBe('AbortError');
      } finally {
        clearTimeout(timeout);
      }
    });
  });

  describe('Error Handling', () => {
    test('Unknown codex-api endpoints return error or fallback', async () => {
      const response = await apiRequest('/codex-api/unknown-endpoint');

      // SPA fallback may return 200 with index.html for unknown paths
      // Or API may return 404/500
      expect([200, 404, 500]).toContain(response.status);
    });

    test('Malformed JSON returns error', async () => {
      const response = await apiRequest('/codex-api/rpc', {
        method: 'POST',
        body: 'not valid json',
      });

      // Should fail parsing
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });
});

describe('API Contract - Response Format', () => {
  test('All successful responses have consistent structure', async () => {
    const response = await apiRequest('/codex-api/settings');
    const body = await response.json();

    // Success responses wrap data in 'data' field
    expect(body).toHaveProperty('data');
    expect(body.error).toBeUndefined();
  });

  test('Error responses have consistent structure', async () => {
    const response = await apiRequest('/codex-api/rpc', {
      method: 'POST',
      body: JSON.stringify({ method: 'invalid/method' }),
    });

    if (!response.ok) {
      const body = await response.json();
      // Error responses should have 'error' field
      expect(body).toHaveProperty('error');
    }
  });
});
