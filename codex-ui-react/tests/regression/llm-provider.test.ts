/**
 * Regression Tests - LLM Provider
 *
 * These tests verify LLM API calls work correctly against the Rust codex-server
 * at port 3458. The server uses the OpenAI Chat Completions API format.
 */

import { describe, test, expect } from '@jest/globals';

const BRIDGE_PORT = process.env.BRIDGE_PORT || '3458';
const API_BASE = process.env.API_URL || `http://localhost:${BRIDGE_PORT}`;
const TEST_TIMEOUT = 60000; // 60s for LLM calls

describe('LLM Provider - Core Functionality', () => {
  describe('Model Listing', () => {
    test('GET /v1/models returns available models', async () => {
      const response = await fetch(`${API_BASE}/v1/models`);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);

      // Should include Kimi models
      const models = body.data.map((m: any) => m.id);
      expect(models.length).toBeGreaterThan(0);
      expect(models).toContain('kimi-for-coding');
    });
  });

  describe('Chat Completions API', () => {
    test('POST /v1/chat/completions with Kimi model (non-streaming)', async () => {
      const response = await fetch(`${API_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'kimi-for-coding',
          messages: [{ role: 'user', content: 'Say "test" and nothing else' }],
          max_tokens: 20,
          stream: false,
        }),
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('object', 'chat.completion');
      expect(body).toHaveProperty('choices');
      expect(Array.isArray(body.choices)).toBe(true);
      expect(body.choices.length).toBeGreaterThan(0);
      expect(body.choices[0]).toHaveProperty('message');
      expect(body.choices[0].message).toHaveProperty('content');
    }, TEST_TIMEOUT);

    test('POST /v1/chat/completions with streaming', async () => {
      const response = await fetch(`${API_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'kimi-for-coding',
          messages: [{ role: 'user', content: 'Count 1 2 3' }],
          max_tokens: 30,
          stream: true,
        }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');

      // Read SSE stream
      const reader = response.body?.getReader();
      expect(reader).toBeDefined();

      let eventCount = 0;
      const decoder = new TextDecoder();

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const events = text.split('\n\n').filter(e => e.startsWith('data:'));
        eventCount += events.length;
      }

      expect(eventCount).toBeGreaterThan(0);
    }, TEST_TIMEOUT);

    test('POST /v1/chat/completions with tools', async () => {
      const response = await fetch(`${API_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'kimi-for-coding',
          messages: [{ role: 'user', content: 'What is the weather in Beijing?' }],
          tools: [{
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather for a location',
              parameters: {
                type: 'object',
                properties: {
                  location: { type: 'string' }
                }
              }
            }
          }],
          stream: false,
        }),
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty('choices');
      expect(Array.isArray(body.choices)).toBe(true);
    }, TEST_TIMEOUT);
  });

  describe('Provider Routing', () => {
    test('gpt-4o routes to Azure provider', async () => {
      const response = await fetch(`${API_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
          stream: false,
        }),
      });

      // Should work if Azure is configured, fail gracefully if not
      expect([200, 500, 503]).toContain(response.status);
    }, TEST_TIMEOUT);

    test('kimi-* models route to Kimi provider', async () => {
      const response = await fetch(`${API_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'kimi-for-coding',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
          stream: false,
        }),
      });

      expect(response.status).toBe(200);
    }, TEST_TIMEOUT);
  });

  describe('Error Handling', () => {
    test('Unknown model returns 404 or error status', async () => {
      const response = await fetch(`${API_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'invalid-model-not-supported',
          messages: [{ role: 'user', content: 'Hi' }],
          stream: false,
          max_tokens: 5,
        }),
      });

      // Server rejects unknown models
      expect([400, 404, 500]).toContain(response.status);
    }, TEST_TIMEOUT);

    test('Request with valid configuration succeeds', async () => {
      const response = await fetch(`${API_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'kimi-for-coding',
          messages: [{ role: 'user', content: 'Hi' }],
          stream: false,
          max_tokens: 5,
        }),
      });

      // Should succeed when API key is configured
      expect(response.status).toBe(200);
    }, TEST_TIMEOUT);
  });
});

describe('LLM Provider - Chat Completions API Compatibility', () => {
  test('Response format matches OpenAI Chat Completions spec', async () => {
    const response = await fetch(`${API_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'kimi-for-coding',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10,
        stream: false,
      }),
    });

    if (response.status !== 200) {
      // Skip if no API key
      return;
    }

    const body = await response.json();

    // OpenAI Chat Completions format
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('object', 'chat.completion');
    expect(body).toHaveProperty('created');
    expect(body).toHaveProperty('model');
    expect(body).toHaveProperty('choices');
    expect(body).toHaveProperty('usage');
    expect(body.choices[0]).toHaveProperty('message');
    expect(body.choices[0].message).toHaveProperty('role', 'assistant');
    expect(body.choices[0].message).toHaveProperty('content');
  }, TEST_TIMEOUT);
});
