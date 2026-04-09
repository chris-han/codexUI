/**
 * Regression Tests - WebSocket Contract
 *
 * Tests WebSocket behavior that must be preserved in Rust implementation
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import WebSocket from 'ws';

const WS_URL = process.env.WS_URL || 'ws://localhost:3457/codex-api/ws';

describe('WebSocket Contract', () => {
  let ws: WebSocket;

  beforeAll((done) => {
    ws = new WebSocket(WS_URL);
    ws.on('open', done);
  });

  afterAll(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });

  test('WebSocket connects successfully', () => {
    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  test('Server sends ready notification on connect', (done) => {
    const timeout = setTimeout(() => {
      done(new Error('No ready notification received within 5s'));
    }, 5000);

    ws.once('message', (data) => {
      clearTimeout(timeout);
      const message = JSON.parse(data.toString());

      expect(message).toHaveProperty('method', 'ready');
      expect(message).toHaveProperty('params');
      expect(message.params).toHaveProperty('ok', true);
      expect(message).toHaveProperty('atIso');

      done();
    });
  });

  // Note: Notifications require active codex operations
  // This test verifies the connection can receive messages
  test.skip('WebSocket can send and receive messages', (done) => {
    const timeout = setTimeout(() => {
      done(new Error('No message received within 5s'));
    }, 5000);

    // Send a test message
    ws.send(JSON.stringify({ test: 'ping' }));

    ws.once('message', (data) => {
      clearTimeout(timeout);
      const message = JSON.parse(data.toString());

      // Should receive some response (could be ready notification or echo)
      expect(message).toHaveProperty('method');

      done();
    });
  });

  test('WebSocket handles close gracefully', (done) => {
    const testWs = new WebSocket(WS_URL);

    testWs.on('open', () => {
      testWs.close();
    });

    testWs.on('close', () => {
      expect(testWs.readyState).toBe(WebSocket.CLOSED);
      done();
    });

    testWs.on('error', (err) => {
      done(err);
    });
  });
});
