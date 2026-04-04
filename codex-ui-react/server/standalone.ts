import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { execSync, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { applyReviewAction, getReviewSnapshot, initializeReviewGit } from './reviewGit';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');
const CODEX_HOME = join(__dirname, '..', '.codex');
const PROVIDER_MODELS_FETCH_TIMEOUT_MS = 5_000;

type CommandInvocation = {
  command: string;
  args: string[];
};

type ProviderModelsResponse = {
  data: string[];
  providerId: string;
  source: 'provider';
};

type DirectoryBrowseEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
};

type DirectoryBrowseResponse = {
  path: string;
  parentPath: string | null;
  entries: DirectoryBrowseEntry[];
};

// Check and free port 3000 before starting
function ensurePortFree(port: number): void {
  try {
    const pid = execSync(`lsof -ti:${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    if (pid) {
      console.log(`Killing process ${pid} on port ${port}...`);
      try {
        execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
        console.log(`Killed process ${pid}`);
      } catch {
        // Ignore kill errors
      }
      // Wait for port to be released
      let attempts = 0;
      while (attempts < 10) {
        try {
          execSync(`lsof -i:${port}`, { stdio: 'ignore' });
          attempts++;
          // Sleep 100ms
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
        } catch {
          // Port is free
          break;
        }
      }
    }
  } catch {
    // Port is already free
  }
}

function canRunCommand(command: string, args: string[] = []): boolean {
  const result = spawnSync(command, args, {
    stdio: 'ignore',
  });
  return !result.error && result.status === 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

function logProviderModelDiscoveryWarning(message: string, details: Record<string, unknown>): void {
  console.warn('[codex-provider-models]', message, details);
}

function isTimeoutError(payload: unknown): boolean {
  return payload instanceof Error && (payload.name === 'AbortError' || payload.name === 'TimeoutError');
}

function normalizeHeaderValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

function normalizeQueryParams(value: unknown): URLSearchParams {
  const params = new URLSearchParams();
  const record = asRecord(value);
  if (!record) return params;

  for (const [key, rawValue] of Object.entries(record)) {
    const normalized = normalizeHeaderValue(rawValue);
    if (!normalized) continue;
    params.set(key, normalized);
  }

  return params;
}

function buildProviderModelsUrl(baseUrl: string, queryParams: unknown): URL {
  const url = new URL(baseUrl);
  url.pathname = url.pathname.endsWith('/') ? `${url.pathname}models` : `${url.pathname}/models`;
  const extraParams = normalizeQueryParams(queryParams);
  for (const [key, value] of extraParams.entries()) {
    url.searchParams.set(key, value);
  }
  return url;
}

function normalizeProviderModelsData(payload: unknown): string[] {
  const record = asRecord(payload);
  const rows = Array.isArray(record?.data) ? record.data : null;
  if (!rows) {
    throw new Error('provider /models payload is missing a data array');
  }

  const ids: string[] = [];
  for (const row of rows) {
    const entry = asRecord(row);
    const candidate = readNonEmptyString(entry?.id);
    if (!candidate || ids.includes(candidate)) continue;
    ids.push(candidate);
  }

  return ids;
}

function normalizeLocalPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('file://')) {
    try {
      return decodeURIComponent(trimmed.replace(/^file:\/\//u, ''));
    } catch {
      return trimmed.replace(/^file:\/\//u, '');
    }
  }
  return trimmed;
}

async function readDirectoryEntries(directoryPath: string): Promise<DirectoryBrowseEntry[]> {
  const rows = await readdir(directoryPath, { withFileTypes: true });
  const entries = rows
    .filter((row) => row.isDirectory())
    .map((row) => ({
      name: row.name,
      path: join(directoryPath, row.name),
      isDirectory: true,
    }));

  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

async function browseDirectory(rawPath: string): Promise<DirectoryBrowseResponse> {
  const normalizedPath = normalizeLocalPath(rawPath) || homedir();
  const directoryPath = normalizedPath.startsWith('/') ? normalizedPath : homedir();
  const directoryStat = await stat(directoryPath);
  if (!directoryStat.isDirectory()) {
    throw new Error('Expected directory path');
  }

  const entries = await readDirectoryEntries(directoryPath);
  const parentPath = directoryPath === '/' ? null : dirname(directoryPath);

  return {
    path: directoryPath,
    parentPath,
    entries,
  };
}

function resolveCodexInvocation(): CommandInvocation {
  const explicit = process.env.CODEXUI_CODEX_COMMAND?.trim();
  if (explicit && canRunCommand(explicit, ['--version'])) {
    return {
      command: explicit,
      args: [],
    };
  }

  if (canRunCommand('codex', ['--version'])) {
    return {
      command: 'codex',
      args: [],
    };
  }

  // Fall back to bunx so `bun run dev` works even when the Codex CLI
  // is not preinstalled globally on the machine.
  if (canRunCommand('bunx', ['--bun', '@openai/codex', '--version'])) {
    return {
      command: 'bunx',
      args: ['--bun', '@openai/codex'],
    };
  }

  throw new Error(
    'Unable to find a runnable Codex CLI. Install `codex` globally or ensure `bunx --bun @openai/codex` works.',
  );
}

// Simple Codex Bridge - spawns codex app-server and proxies requests
type JsonRpcCall = {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

class CodexBridge {
  private process: ChildProcessWithoutNullStreams | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private notificationListeners: ((notification: unknown) => void)[] = [];
  private buffer = '';
  private isReady = false;

  async start(): Promise<void> {
    console.log('Starting codex app-server...');
    console.log(`Using CODEX_HOME: ${CODEX_HOME}`);

    const codexInvocation = resolveCodexInvocation();

    // Always point Codex at the local Responses-compatible proxy. The proxy decides
    // whether to upstream to Kimi or Azure OpenAI based on model/env.
    const proxyEnv = {
      ...process.env,
      FORCE_COLOR: '0',
      CODEX_HOME,
      XDG_CONFIG_HOME: CODEX_HOME,
      OPENAI_BASE_URL: 'http://localhost:3456/v1',
      OPENAI_API_KEY: process.env.KIMI_API_KEY || process.env.AZURE_OPENAI_API_KEY || 'sk-proxy',
      // Also try standard OpenAI env vars
      OPENAI_ORG_ID: '',
      // Disable any other API keys to force proxy usage
      ANTHROPIC_API_KEY: '',
      GEMINI_API_KEY: '',
    };

    console.log('Proxy config:', {
      PROVIDER: 'local-proxy',
      OPENAI_BASE_URL: proxyEnv.OPENAI_BASE_URL,
      OPENAI_API_KEY_SET: !!proxyEnv.OPENAI_API_KEY,
      AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT || undefined,
      CODEX_COMMAND: [codexInvocation.command, ...codexInvocation.args].join(' '),
    });

    this.process = spawn(codexInvocation.command, [...codexInvocation.args, 'app-server'], {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: proxyEnv,
    });

    this.process.stdout.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.process.on('exit', (code) => {
      console.log(`codex app-server exited with code ${code}`);
      this.process = null;
      this.isReady = false;
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    try {
      await this.call('initialize', {
        clientInfo: {
          name: 'codex-ui-react',
          version: '0.1.0',
        },
        capabilities: {},
      });
      console.log('codex app-server initialized');
      this.isReady = true;
    } catch (error) {
      console.warn('Could not initialize:', error);
      this.isReady = true;
    }
  }

  stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  private processBuffer() {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        this.handleMessage(message);
      } catch (e) {
        // Not valid JSON, might be log output
      }
    }
  }

  private handleMessage(message: { id?: number; method?: string; params?: unknown; result?: unknown; error?: { message?: string; code?: number } }) {
    if (message.method === 'ready' || message.method === 'initialized') {
      this.isReady = true;
    }

    if (message.id !== undefined) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message || 'Unknown error'));
        } else {
          pending.resolve(message.result);
        }
      }
    }

    if (message.method && message.id === undefined) {
      for (const listener of this.notificationListeners) {
        try {
          listener(message);
        } catch (e) {
          console.error('Notification listener error:', e);
        }
      }
    }
  }

  call(method: string, params?: unknown): Promise<unknown> {
    if (!this.process) {
      return Promise.reject(new Error('codex app-server not running'));
    }

    const id = ++this.requestId;
    const request: JsonRpcCall = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.process!.stdin.write(JSON.stringify(request) + '\n');

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 60000);
    });
  }

  onNotification(listener: (notification: unknown) => void): () => void {
    this.notificationListeners.push(listener);
    return () => {
      const index = this.notificationListeners.indexOf(listener);
      if (index > -1) {
        this.notificationListeners.splice(index, 1);
      }
    };
  }
}

async function readProviderBackedModelIds(): Promise<ProviderModelsResponse> {
  const configPayload = asRecord(await bridge.call('config/read', {}));
  const config = asRecord(configPayload?.config);
  const providerId = readNonEmptyString(config?.model_provider);
  if (!providerId) {
    return { data: [], providerId: '', source: 'provider' };
  }

  const providers = asRecord(config?.model_providers);
  const provider = asRecord(providers?.[providerId]);
  if (!provider) {
    logProviderModelDiscoveryWarning('configured provider is missing from model_providers', { providerId });
    return { data: [], providerId, source: 'provider' };
  }

  const wireApi = readNonEmptyString(provider.wire_api);
  if (wireApi !== 'responses') {
    return { data: [], providerId, source: 'provider' };
  }

  const baseUrl = readNonEmptyString(provider.base_url);
  if (!baseUrl) {
    logProviderModelDiscoveryWarning('responses provider is missing base_url', { providerId });
    return { data: [], providerId, source: 'provider' };
  }

  const headers = new Headers();
  const configuredHeaders = asRecord(provider.http_headers);
  if (configuredHeaders) {
    for (const [key, rawValue] of Object.entries(configuredHeaders)) {
      const normalized = normalizeHeaderValue(rawValue);
      if (!normalized) continue;
      headers.set(key, normalized);
    }
  }

  const bearerToken = readNonEmptyString(provider.experimental_bearer_token);
  if (bearerToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${bearerToken}`);
  }

  const envKey = readNonEmptyString(provider.env_key);
  const envHttpHeaders = asRecord(provider.env_http_headers);
  if (envKey || envHttpHeaders) {
    logProviderModelDiscoveryWarning('provider discovery skipped env-backed auth/header expansion', {
      providerId,
      hasEnvKey: Boolean(envKey),
      hasEnvHttpHeaders: Boolean(envHttpHeaders),
    });
  }

  let requestUrl: URL;
  try {
    requestUrl = buildProviderModelsUrl(baseUrl, provider.query_params);
  } catch (error) {
    logProviderModelDiscoveryWarning('provider /models URL was invalid', {
      providerId,
      error: getErrorMessage(error, 'invalid url'),
    });
    return { data: [], providerId, source: 'provider' };
  }

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(PROVIDER_MODELS_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    logProviderModelDiscoveryWarning('provider /models request failed', {
      providerId,
      error: isTimeoutError(error)
        ? `request timed out after ${PROVIDER_MODELS_FETCH_TIMEOUT_MS}ms`
        : getErrorMessage(error, 'network error'),
    });
    return { data: [], providerId, source: 'provider' };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch (error) {
    logProviderModelDiscoveryWarning('provider /models response was not valid JSON', {
      providerId,
      status: response.status,
      error: getErrorMessage(error, 'invalid json'),
    });
    return { data: [], providerId, source: 'provider' };
  }

  if (!response.ok) {
    logProviderModelDiscoveryWarning('provider /models request returned non-2xx', {
      providerId,
      status: response.status,
      statusText: response.statusText,
    });
    return { data: [], providerId, source: 'provider' };
  }

  try {
    return {
      data: normalizeProviderModelsData(payload),
      providerId,
      source: 'provider',
    };
  } catch (error) {
    logProviderModelDiscoveryWarning('provider /models payload was invalid', {
      providerId,
      error: getErrorMessage(error, 'invalid payload'),
    });
    return { data: [], providerId, source: 'provider' };
  }
}

// Create Express app
const app = express();
const bridge = new CodexBridge();

// Enable CORS for all origins
app.use(cors());
app.use(express.json());
app.use('/codex-api', (req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    console.log('[codex-api]', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });
  next();
});

app.post('/codex-api/rpc', async (req, res) => {
  try {
    const { method, params } = req.body;
    const result = await bridge.call(method, params);
    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get('/codex-api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendNotification = (notification: unknown) => {
    res.write(`data: ${JSON.stringify(notification)}\n\n`);
  };

  const unsubscribe = bridge.onNotification(sendNotification);

  req.on('close', () => {
    unsubscribe();
  });
});

let pendingServerRequests: unknown[] = [];

app.get('/codex-api/server-requests/pending', (req, res) => {
  res.json({ data: pendingServerRequests });
});

app.post('/codex-api/server-requests/respond', async (req, res) => {
  try {
    const { id, result } = req.body;
    await bridge.call('server/request/respond', { id, result });
    pendingServerRequests = pendingServerRequests.filter(
      (r: { id: number }) => r.id !== id
    );
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get('/codex-api/meta/methods', async (req, res) => {
  try {
    const result = await bridge.call('meta/methods');
    res.json({ data: result });
  } catch {
    res.json({ data: [] });
  }
});

app.get('/codex-api/meta/notifications', async (req, res) => {
  try {
    const result = await bridge.call('meta/notifications');
    res.json({ data: result });
  } catch {
    res.json({ data: [] });
  }
});

app.get('/codex-api/provider-models', async (req, res) => {
  try {
    const data = await readProviderBackedModelIds();
    res.json(data);
  } catch (error) {
    res.json({ data: [], providerId: '', source: 'provider' });
  }
});

app.get('/codex-api/home-directory', async (req, res) => {
  res.json({ data: { path: homedir() } });
});

app.get('/codex-api/browse-directory', async (req, res) => {
  try {
    const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
    const data = await browseDirectory(rawPath);
    res.json({ data });
  } catch (error) {
    res.status(400).json({ error: getErrorMessage(error, 'Failed to browse directory') });
  }
});

app.get('/codex-api/review/snapshot', async (req, res) => {
  try {
    const cwd = typeof req.query.cwd === 'string' ? req.query.cwd.trim() : '';
    const scope = req.query.scope === 'baseBranch' ? 'baseBranch' : 'workspace';
    const workspaceView = req.query.workspaceView === 'staged' ? 'staged' : 'unstaged';
    const baseBranch = typeof req.query.baseBranch === 'string' ? req.query.baseBranch.trim() : '';
    if (!cwd) {
      res.status(400).json({ error: 'Missing cwd' });
      return;
    }

    const data = await getReviewSnapshot(cwd, scope, workspaceView, baseBranch);
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error, 'Failed to load review snapshot') });
  }
});

app.post('/codex-api/review/action', async (req, res) => {
  try {
    const data = await applyReviewAction(req.body);
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error, 'Failed to apply review action') });
  }
});

app.post('/codex-api/review/git/init', async (req, res) => {
  try {
    const cwd = typeof req.body?.cwd === 'string' ? req.body.cwd.trim() : '';
    if (!cwd) {
      res.status(400).json({ error: 'Missing cwd' });
      return;
    }

    await initializeReviewGit(cwd);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error, 'Failed to initialize Git') });
  }
});

bridge.onNotification((notification) => {
  const n = notification as { method?: string; params?: { id: number } };
  if (n.method === 'server/request' && n.params) {
    pendingServerRequests.push(n.params);
  }
  if (n.method === 'server/request/resolved' && n.params) {
    pendingServerRequests = pendingServerRequests.filter(
      (r: { id: number }) => r.id !== n.params!.id
    );
  }
});

if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res) => {
    res.sendFile(join(distDir, 'index.html'));
  });
}

async function main() {
  const PORT = process.env.PORT || 3000;
  const USER_THREADS_PATH = '/home/chris/repo/codexUI/user_threads';

  // Ensure port is free before starting
  ensurePortFree(PORT);

  // Ensure user_threads folder exists
  try {
    if (!existsSync(USER_THREADS_PATH)) {
      await mkdir(USER_THREADS_PATH, { recursive: true });
      console.log(`Created folder: ${USER_THREADS_PATH}`);
    }
  } catch (err) {
    console.warn(`Could not create folder ${USER_THREADS_PATH}:`, err);
  }

  await bridge.start();
  console.log('Bridge ready');

  const server = createServer(app);

  const wss = new WebSocketServer({ server, path: '/codex-api/ws' });

  wss.on('connection', (ws) => {
    console.log('WebSocket client connected');

    ws.send(
      JSON.stringify({
        method: 'ready',
        params: { ok: true },
        atIso: new Date().toISOString(),
      })
    );

    const unsubscribe = bridge.onNotification((notification) => {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify(notification));
      }
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      unsubscribe();
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      unsubscribe();
    });
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use.`);
      console.error(`Run: lsof -ti:${PORT} | xargs kill -9`);
      process.exit(1);
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });

  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  const shutdown = () => {
    console.log('Shutting down...');
    bridge.stop();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
