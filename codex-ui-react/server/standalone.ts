import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { execSync, spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { applyReviewAction, getReviewSnapshot, initializeReviewGit } from './reviewGit';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');
const PROVIDER_MODELS_FETCH_TIMEOUT_MS = 5_000;

function resolveCodexHome(): string {
  const explicit = process.env.CODEXUI_REACT_CODEX_HOME?.trim() || process.env.CODEX_HOME?.trim();
  if (explicit) return explicit;
  return join(homedir(), '.codex');
}

const CODEX_HOME = resolveCodexHome();

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

type WorkspaceRootsState = {
  order: string[];
  labels: Record<string, string>;
  active: string[];
};

// Check and free the configured bridge port before starting
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

function resolveRipgrepCommand(): string | null {
  return canRunCommand('rg', ['--version']) ? 'rg' : null;
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

function isThreadNotMaterializedYetError(error: unknown): boolean {
  const message = getErrorMessage(error, '');
  return (
    message.includes('not materialized yet') ||
    message.includes('includeTurns is unavailable before first user message')
  );
}

function getStandaloneStatePath(): string {
  return join(CODEX_HOME, 'global-state.json');
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const next: string[] = [];
  for (const item of value) {
    if (typeof item === 'string' && item.trim().length > 0 && !next.includes(item.trim())) {
      next.push(item.trim());
    }
  }
  return next;
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const next: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof key !== 'string' || typeof entry !== 'string') continue;
    const normalizedKey = key.trim();
    const normalizedValue = entry.trim();
    if (!normalizedKey || !normalizedValue) continue;
    next[normalizedKey] = normalizedValue;
  }
  return next;
}

async function readWorkspaceRootsState(): Promise<WorkspaceRootsState> {
  const statePath = getStandaloneStatePath();
  let payload: Record<string, unknown> = {};

  try {
    const raw = await readFile(statePath, 'utf8');
    payload = asRecord(JSON.parse(raw)) ?? {};
  } catch {
    payload = {};
  }

  return {
    order: normalizeStringArray(payload['electron-saved-workspace-roots']),
    labels: normalizeStringRecord(payload['electron-workspace-root-labels']),
    active: normalizeStringArray(payload['active-workspace-roots']),
  };
}

async function writeWorkspaceRootsState(nextState: WorkspaceRootsState): Promise<void> {
  const statePath = getStandaloneStatePath();
  let payload: Record<string, unknown> = {};
  try {
    const raw = await readFile(statePath, 'utf8');
    payload = asRecord(JSON.parse(raw)) ?? {};
  } catch {
    payload = {};
  }

  payload['electron-saved-workspace-roots'] = normalizeStringArray(nextState.order);
  payload['electron-workspace-root-labels'] = normalizeStringRecord(nextState.labels);
  payload['active-workspace-roots'] = normalizeStringArray(nextState.active);

  await mkdir(CODEX_HOME, { recursive: true });
  await writeFile(statePath, JSON.stringify(payload), 'utf8');
}

function logProviderModelDiscoveryWarning(message: string, details: Record<string, unknown>): void {
  console.warn('[codex-provider-models]', message, details);
}

function scoreFileCandidate(path: string, query: string): number {
  if (!query) return 0;
  const lowerPath = path.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const baseName = lowerPath.slice(lowerPath.lastIndexOf('/') + 1);
  if (baseName === lowerQuery) return 0;
  if (baseName.startsWith(lowerQuery)) return 1;
  if (baseName.includes(lowerQuery)) return 2;
  if (lowerPath.includes(`/${lowerQuery}`)) return 3;
  if (lowerPath.includes(lowerQuery)) return 4;
  return 10;
}

async function listFilesWithRipgrep(cwd: string): Promise<string[]> {
  return await new Promise<string[]>((resolvePromise, reject) => {
    const ripgrepCommand = resolveRipgrepCommand();
    if (!ripgrepCommand) {
      reject(new Error('ripgrep (rg) is not available'));
      return;
    }

    const proc = spawn(
      ripgrepCommand,
      ['--files', '--hidden', '-g', '!.git', '-g', '!node_modules'],
      {
        cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolvePromise(
          stdout
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
        );
        return;
      }
      const details = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n');
      reject(new Error(details || 'rg --files failed'));
    });
  });
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

function bufferIndexOf(buf: Buffer, needle: Buffer, start = 0): number {
  for (let i = start; i <= buf.length - needle.length; i++) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (buf[i + j] !== needle[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}

function sanitizeUploadFilename(fileName: string): string {
  const sanitized = fileName.replace(/[/\\]/g, '_').trim();
  return sanitized || 'uploaded-file';
}

async function handleFileUpload(req: express.Request, res: express.Response): Promise<void> {
  try {
    const chunks: Buffer[] = [];
    await new Promise<void>((resolvePromise, reject) => {
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolvePromise());
      req.on('error', reject);
    });

    const body = Buffer.concat(chunks);
    const contentType = req.headers['content-type'] ?? '';
    const boundaryMatch = contentType.match(/boundary=(.+)/i);
    if (!boundaryMatch) {
      res.status(400).json({ error: 'Missing multipart boundary' });
      return;
    }

    const boundaryBuf = Buffer.from(`--${boundaryMatch[1]}`);
    const parts: Buffer[] = [];
    let searchStart = 0;
    while (searchStart < body.length) {
      const idx = body.indexOf(boundaryBuf, searchStart);
      if (idx < 0) break;
      if (searchStart > 0) {
        parts.push(body.subarray(searchStart, idx));
      }
      searchStart = idx + boundaryBuf.length;
      if (body[searchStart] === 0x0d && body[searchStart + 1] === 0x0a) {
        searchStart += 2;
      }
    }

    let fileName = 'uploaded-file';
    let fileData: Buffer | null = null;
    const headerSep = Buffer.from('\r\n\r\n');
    for (const part of parts) {
      const headerEnd = bufferIndexOf(part, headerSep);
      if (headerEnd < 0) continue;
      const headers = part.subarray(0, headerEnd).toString('utf8');
      const fileNameMatch = headers.match(/filename="([^"]+)"/i);
      if (!fileNameMatch) continue;
      fileName = sanitizeUploadFilename(fileNameMatch[1]);
      let end = part.length;
      if (end >= 2 && part[end - 2] === 0x0d && part[end - 1] === 0x0a) {
        end -= 2;
      }
      fileData = part.subarray(headerEnd + 4, end);
      break;
    }

    if (!fileData) {
      res.status(400).json({ error: 'No file in request' });
      return;
    }

    const uploadRoot = join(tmpdir(), 'codex-ui-react-uploads');
    await mkdir(uploadRoot, { recursive: true });
    const destDir = await mkdtemp(join(uploadRoot, 'f-'));
    const destPath = join(destDir, fileName);
    await writeFile(destPath, fileData);
    res.status(200).json({ data: { path: destPath, label: fileName } });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error, 'Upload failed') });
  }
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

type SkillHubEntry = {
  name: string;
  owner: string;
  description: string;
  displayName: string;
  publishedAt: number;
  avatarUrl: string;
  url: string;
  installed: boolean;
  path?: string;
  enabled?: boolean;
};

type SkillsTreeEntry = {
  name: string;
  owner: string;
  url: string;
};

type SkillsTreeCache = {
  entries: SkillsTreeEntry[];
  fetchedAt: number;
};

type InstalledSkillInfo = {
  name: string;
  path: string;
  enabled: boolean;
};

type MetaJson = {
  displayName?: string;
  description?: string;
  latest?: { publishedAt?: number };
};

const HUB_SKILLS_OWNER = 'openclaw';
const HUB_SKILLS_REPO = 'skills';
const TREE_CACHE_TTL_MS = 5 * 60 * 1000;
let skillsTreeCache: SkillsTreeCache | null = null;
const metaCache = new Map<string, { description: string; displayName: string; publishedAt: number }>();

function getSkillsInstallDir(): string {
  return join(CODEX_HOME, 'skills');
}

function getErrorMessageFromPayload(payload: unknown, fallback: string): string {
  if (payload instanceof Error && payload.message.trim().length > 0) {
    return payload.message;
  }
  const record = asRecord(payload);
  if (!record) return fallback;
  const error = record.error;
  if (typeof error === 'string' && error.trim().length > 0) return error;
  const nested = asRecord(error);
  if (nested && typeof nested.message === 'string' && nested.message.trim().length > 0) {
    return nested.message;
  }
  return fallback;
}

async function runCommand(command: string, args: string[], options: { cwd?: string; timeoutMs?: number } = {}): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  await new Promise<void>((resolvePromise, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill('SIGKILL');
      reject(new Error(`Command timed out after ${timeoutMs}ms (${command} ${args.join(' ')})`));
    }, timeoutMs);

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolvePromise();
        return;
      }
      const details = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n');
      reject(new Error(details || `Command failed (${command} ${args.join(' ')})`));
    });
  });
}

function resolvePythonCommand(): CommandInvocation | null {
  const candidates: CommandInvocation[] = [
    { command: 'python3', args: [] },
    { command: 'python', args: [] },
  ];
  for (const candidate of candidates) {
    if (canRunCommand(candidate.command, [...candidate.args, '--version'])) {
      return candidate;
    }
  }
  return null;
}

function resolveSkillInstallerScriptPath(): string | null {
  const candidates = [
    join(homedir(), '.codex', 'skills', '.system', 'skill-installer', 'scripts', 'install-skill-from-github.py'),
    join(CODEX_HOME, 'skills', '.system', 'skill-installer', 'scripts', 'install-skill-from-github.py'),
    join(homedir(), '.cursor', 'skills', '.system', 'skill-installer', 'scripts', 'install-skill-from-github.py'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

async function detectUserSkillsDir(bridge: CodexBridge): Promise<string> {
  try {
    const result = await bridge.call('skills/list', {}) as {
      data?: Array<{ skills?: Array<{ scope?: string; path?: string }> }>;
    };
    for (const entry of result.data ?? []) {
      for (const skill of entry.skills ?? []) {
        if (skill.scope !== 'user' || !skill.path) continue;
        const normalized = skill.path.endsWith('/SKILL.md')
          ? skill.path.slice(0, -'/SKILL.md'.length)
          : skill.path;
        const lastSlash = normalized.lastIndexOf('/');
        if (lastSlash > 0) {
          return normalized.slice(0, lastSlash);
        }
      }
    }
  } catch {
    // fall back
  }
  return getSkillsInstallDir();
}

async function scanInstalledSkills(bridge: CodexBridge): Promise<Map<string, InstalledSkillInfo>> {
  const installed = new Map<string, InstalledSkillInfo>();
  try {
    const result = await bridge.call('skills/list', {}) as {
      data?: Array<{ skills?: Array<{ name?: string; path?: string; enabled?: boolean }> }>;
    };
    for (const entry of result.data ?? []) {
      for (const skill of entry.skills ?? []) {
        if (!skill.name) continue;
        installed.set(skill.name, {
          name: skill.name,
          path: skill.path ?? '',
          enabled: skill.enabled !== false,
        });
      }
    }
  } catch {
    // fall through to disk scan
  }

  if (installed.size > 0) return installed;

  try {
    const rows = await readdir(getSkillsInstallDir(), { withFileTypes: true });
    for (const row of rows) {
      if (!row.isDirectory() || row.name.startsWith('.')) continue;
      const skillPath = join(getSkillsInstallDir(), row.name, 'SKILL.md');
      try {
        const info = await stat(skillPath);
        if (!info.isFile()) continue;
        installed.set(row.name, { name: row.name, path: skillPath, enabled: true });
      } catch {
        // ignore invalid entry
      }
    }
  } catch {
    // ignore missing dir
  }

  return installed;
}

async function ghFetch(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'codex-ui-react',
    },
  });
}

async function fetchSkillsTree(): Promise<SkillsTreeEntry[]> {
  if (skillsTreeCache && Date.now() - skillsTreeCache.fetchedAt < TREE_CACHE_TTL_MS) {
    return skillsTreeCache.entries;
  }

  const response = await ghFetch(`https://api.github.com/repos/${HUB_SKILLS_OWNER}/${HUB_SKILLS_REPO}/git/trees/main?recursive=1`);
  if (!response.ok) {
    throw new Error(`GitHub tree API returned ${response.status}`);
  }
  const payload = await response.json() as { tree?: Array<{ path: string; type: string }> };
  const metaPattern = /^skills\/([^/]+)\/([^/]+)\/_meta\.json$/;
  const entries: SkillsTreeEntry[] = [];
  const seen = new Set<string>();

  for (const node of payload.tree ?? []) {
    const match = metaPattern.exec(node.path);
    if (!match) continue;
    const owner = match[1];
    const name = match[2];
    const key = `${owner}/${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      owner,
      name,
      url: `https://github.com/${HUB_SKILLS_OWNER}/${HUB_SKILLS_REPO}/tree/main/skills/${owner}/${name}`,
    });
  }

  skillsTreeCache = { entries, fetchedAt: Date.now() };
  return entries;
}

async function fetchMetaBatch(entries: SkillsTreeEntry[]): Promise<void> {
  const batch = entries.filter((entry) => !metaCache.has(`${entry.owner}/${entry.name}`)).slice(0, 50);
  await Promise.allSettled(batch.map(async (entry) => {
    const response = await fetch(`https://raw.githubusercontent.com/${HUB_SKILLS_OWNER}/${HUB_SKILLS_REPO}/main/skills/${entry.owner}/${entry.name}/_meta.json`);
    if (!response.ok) return;
    const meta = await response.json() as MetaJson;
    metaCache.set(`${entry.owner}/${entry.name}`, {
      description: typeof meta.description === 'string' ? meta.description : '',
      displayName: typeof meta.displayName === 'string' ? meta.displayName : '',
      publishedAt: meta.latest?.publishedAt ?? 0,
    });
  }));
}

function buildSkillHubEntry(entry: SkillsTreeEntry): SkillHubEntry {
  const meta = metaCache.get(`${entry.owner}/${entry.name}`);
  return {
    name: entry.name,
    owner: entry.owner,
    description: meta?.description ?? '',
    displayName: meta?.displayName ?? '',
    publishedAt: meta?.publishedAt ?? 0,
    avatarUrl: `https://github.com/${entry.owner}.png?size=40`,
    url: entry.url,
    installed: false,
  };
}

function searchSkillsHub(entries: SkillsTreeEntry[], query: string, limit: number, sort: 'date' | 'name', installed: Map<string, InstalledSkillInfo>): SkillHubEntry[] {
  const normalizedQuery = query.trim().toLowerCase();
  const rows = entries
    .map((entry) => {
      const base = buildSkillHubEntry(entry);
      const installInfo = installed.get(entry.name);
      return installInfo ? { ...base, installed: true, path: installInfo.path, enabled: installInfo.enabled } : base;
    })
    .filter((entry) => {
      if (!normalizedQuery) return true;
      const haystack = [
        entry.name,
        entry.owner,
        entry.displayName,
        entry.description,
      ].join(' ').toLowerCase();
      return haystack.includes(normalizedQuery);
    })
    .filter((entry) => !entry.installed);

  rows.sort((left, right) => {
    if (sort === 'name') {
      return left.name.localeCompare(right.name);
    }
    return (right.publishedAt ?? 0) - (left.publishedAt ?? 0) || left.name.localeCompare(right.name);
  });

  return rows.slice(0, limit);
}

function extractSkillDescriptionFromMarkdown(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  let inCodeFence = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('```')) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence || !line || line.startsWith('#') || line.startsWith('>')) continue;
    if (line.startsWith('- ') || line.startsWith('* ')) continue;
    return line;
  }
  return '';
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
        capabilities: {
          experimentalApi: true,
        },
      });
      this.process.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialized',
      }) + '\n');
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
    const request: JsonRpcCall = { jsonrpc: '2.0', id, method, params: params ?? {} };

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

  let baseUrl: string | null = null;
  let queryParams: unknown = undefined;
  const headers = new Headers();
  const providers = asRecord(config?.model_providers);
  const provider = asRecord(providers?.[providerId]);
  if (provider) {
    const wireApi = readNonEmptyString(provider.wire_api);
    if (wireApi !== 'responses') {
      return { data: [], providerId, source: 'provider' };
    }

    baseUrl = readNonEmptyString(provider.base_url);
    if (!baseUrl) {
      logProviderModelDiscoveryWarning('responses provider is missing base_url', { providerId });
      return { data: [], providerId, source: 'provider' };
    }

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

    queryParams = provider.query_params;
  } else if (providerId === 'openai') {
    baseUrl = readNonEmptyString(config?.openai_base_url);
    if (!baseUrl) {
      logProviderModelDiscoveryWarning('configured provider is missing from model_providers', { providerId });
      return { data: [], providerId, source: 'provider' };
    }

    const legacyApiKey = readNonEmptyString(config?.openai_api_key);
    if (legacyApiKey && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${legacyApiKey}`);
    }
  } else {
    logProviderModelDiscoveryWarning('configured provider is missing from model_providers', { providerId });
    return { data: [], providerId, source: 'provider' };
  }

  let requestUrl: URL;
  try {
    requestUrl = buildProviderModelsUrl(baseUrl, queryParams);
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

    // Ensure the cwd directory exists before starting a new thread
    if (method === 'thread/start') {
      const cwd = readNonEmptyString((params as Record<string, unknown>)?.cwd);
      if (cwd) {
        await mkdir(cwd, { recursive: true });
      }
    }

    const result = await bridge.call(method, params);
    res.status(200).json({ result });
  } catch (error) {
    const { method, params } = req.body ?? {};
    if (
      method === 'thread/read' &&
      params &&
      typeof params === 'object' &&
      (params as Record<string, unknown>).includeTurns === true &&
      isThreadNotMaterializedYetError(error)
    ) {
      try {
        const fallbackParams = { ...(params as Record<string, unknown>) };
        delete fallbackParams.includeTurns;
        const result = await bridge.call('thread/read', fallbackParams);
        res.status(200).json({ result });
        return;
      } catch (fallbackError) {
        res.status(500).json({ error: String(fallbackError) });
        return;
      }
    }
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

app.get('/codex-api/workspace-roots-state', async (req, res) => {
  try {
    const state = await readWorkspaceRootsState();
    res.json({ data: state });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error, 'Failed to load workspace roots state') });
  }
});

app.put('/codex-api/workspace-roots-state', async (req, res) => {
  try {
    const record = asRecord(req.body);
    if (!record) {
      res.status(400).json({ error: 'Invalid body: expected object' });
      return;
    }
    const nextState: WorkspaceRootsState = {
      order: normalizeStringArray(record.order),
      labels: normalizeStringRecord(record.labels),
      active: normalizeStringArray(record.active),
    };
    await writeWorkspaceRootsState(nextState);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error, 'Failed to save workspace roots state') });
  }
});

app.post('/codex-api/project-root', async (req, res) => {
  try {
    const record = asRecord(req.body);
    const rawPath = typeof record?.path === 'string' ? record.path.trim() : '';
    const createIfMissing = record?.createIfMissing === true;
    const label = typeof record?.label === 'string' ? record.label.trim() : '';
    if (!rawPath) {
      res.status(400).json({ error: 'Missing path' });
      return;
    }

    const normalizedPath = isAbsolute(rawPath) ? rawPath : resolve(rawPath);
    let pathExists = true;
    try {
      const info = await stat(normalizedPath);
      if (!info.isDirectory()) {
        res.status(400).json({ error: 'Path exists but is not a directory' });
        return;
      }
    } catch {
      pathExists = false;
    }

    if (!pathExists && createIfMissing) {
      await mkdir(normalizedPath, { recursive: true });
    } else if (!pathExists) {
      res.status(404).json({ error: 'Directory does not exist' });
      return;
    }

    const existingState = await readWorkspaceRootsState();
    const nextOrder = [normalizedPath, ...existingState.order.filter((item) => item !== normalizedPath)];
    const nextActive = [normalizedPath, ...existingState.active.filter((item) => item !== normalizedPath)];
    const nextLabels = { ...existingState.labels };
    if (label) {
      nextLabels[normalizedPath] = label;
    }
    await writeWorkspaceRootsState({
      order: nextOrder,
      labels: nextLabels,
      active: nextActive,
    });

    res.json({ data: { path: normalizedPath } });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error, 'Failed to open project root') });
  }
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

app.post('/codex-api/upload-file', async (req, res) => {
  await handleFileUpload(req, res);
});

app.post('/codex-api/composer-file-search', async (req, res) => {
  try {
    const body = asRecord(req.body);
    const rawCwd = readNonEmptyString(body?.cwd);
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    const limitRaw = typeof body?.limit === 'number' ? body.limit : 20;
    const limit = Math.max(1, Math.min(100, Math.floor(limitRaw)));

    if (!rawCwd) {
      res.status(400).json({ error: 'Missing cwd' });
      return;
    }

    const cwd = isAbsolute(rawCwd) ? rawCwd : resolve(rawCwd);
    const info = await stat(cwd).catch(() => null);
    if (!info) {
      res.status(404).json({ error: 'cwd does not exist' });
      return;
    }
    if (!info.isDirectory()) {
      res.status(400).json({ error: 'cwd is not a directory' });
      return;
    }

    const files = await listFilesWithRipgrep(cwd);
    const data = files
      .map((path) => ({ path, score: scoreFileCandidate(path, query) }))
      .filter((row) => query.length === 0 || row.score < 10)
      .sort((a, b) => (a.score - b.score) || a.path.localeCompare(b.path))
      .slice(0, limit)
      .map((row) => ({ path: row.path }));

    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error, 'Failed to search files') });
  }
});

app.get('/codex-api/skills-hub', async (req, res) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    const sort = req.query.sort === 'name' ? 'name' : 'date';
    const limitRaw = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 100;
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 100, 1), 200);
    const [allEntries, installed] = await Promise.all([
      fetchSkillsTree(),
      scanInstalledSkills(bridge),
    ]);
    await fetchMetaBatch(allEntries);

    const installedEntries = Array.from(installed.values()).map((skill) => {
      const treeEntry = allEntries.find((entry) => entry.name === skill.name);
      const base = treeEntry
        ? buildSkillHubEntry(treeEntry)
        : {
            name: skill.name,
            owner: 'local',
            description: '',
            displayName: '',
            publishedAt: 0,
            avatarUrl: '',
            url: '',
            installed: true,
          };
      return {
        ...base,
        installed: true,
        path: skill.path,
        enabled: skill.enabled,
      };
    });

    res.json({
      data: searchSkillsHub(allEntries, query, limit, sort, installed),
      installed: installedEntries,
      total: allEntries.length,
    });
  } catch (error) {
    res.status(500).json({ error: getErrorMessageFromPayload(error, 'Failed to fetch skills hub') });
  }
});

app.get('/codex-api/skills-hub/readme', async (req, res) => {
  try {
    const owner = typeof req.query.owner === 'string' ? req.query.owner.trim() : '';
    const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';
    const installed = req.query.installed === 'true';
    const skillPath = typeof req.query.path === 'string' ? req.query.path.trim() : '';

    if (!owner || !name) {
      res.status(400).json({ error: 'Missing owner or name' });
      return;
    }

    if (installed && skillPath) {
      const localSkillPath = skillPath.endsWith('/SKILL.md') ? skillPath : `${skillPath}/SKILL.md`;
      const content = await readFile(localSkillPath, 'utf8');
      res.json({
        content,
        description: extractSkillDescriptionFromMarkdown(content),
        source: 'local',
      });
      return;
    }

    const response = await fetch(`https://raw.githubusercontent.com/${HUB_SKILLS_OWNER}/${HUB_SKILLS_REPO}/main/skills/${owner}/${name}/SKILL.md`);
    if (!response.ok) {
      throw new Error(`Failed to fetch SKILL.md: ${response.status}`);
    }
    const content = await response.text();
    res.json({
      content,
      description: extractSkillDescriptionFromMarkdown(content),
      source: 'remote',
    });
  } catch (error) {
    res.status(500).json({ error: getErrorMessageFromPayload(error, 'Failed to fetch skill details') });
  }
});

app.post('/codex-api/skills-hub/install', async (req, res) => {
  try {
    const owner = typeof req.body?.owner === 'string' ? req.body.owner.trim() : '';
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!owner || !name) {
      res.status(400).json({ error: 'Missing owner or name' });
      return;
    }

    const installerScript = resolveSkillInstallerScriptPath();
    if (!installerScript) {
      throw new Error('Skill installer script not found');
    }
    const python = resolvePythonCommand();
    if (!python) {
      throw new Error('Python 3 is required to install skills');
    }

    const installDir = await detectUserSkillsDir(bridge);
    await mkdir(installDir, { recursive: true });
    const skillDir = join(installDir, name);
    if (existsSync(skillDir)) {
      await rm(skillDir, { recursive: true, force: true });
    }

    await runCommand(python.command, [
      ...python.args,
      installerScript,
      '--repo', `${HUB_SKILLS_OWNER}/${HUB_SKILLS_REPO}`,
      '--path', `skills/${owner}/${name}`,
      '--dest', installDir,
      '--method', 'auto',
    ], { timeoutMs: 90_000 });

    const skillManifestPath = join(skillDir, 'SKILL.md');
    const skillManifest = await stat(skillManifestPath).catch(() => null);
    if (!skillManifest?.isFile()) {
      throw new Error(`Installed skill is missing SKILL.md at ${skillManifestPath}`);
    }

    try {
      await bridge.call('skills/list', { forceReload: true });
    } catch {
      // ignore reload failures
    }

    res.json({ ok: true, path: skillDir });
  } catch (error) {
    res.status(500).json({ error: getErrorMessageFromPayload(error, 'Failed to install skill') });
  }
});

app.post('/codex-api/skills-hub/uninstall', async (req, res) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const path = typeof req.body?.path === 'string' ? req.body.path.trim() : '';
    const normalizedPath = path.endsWith('/SKILL.md') ? path.slice(0, -'/SKILL.md'.length) : path;
    const target = normalizedPath || (name ? join(getSkillsInstallDir(), name) : '');
    if (!target) {
      res.status(400).json({ error: 'Missing name or path' });
      return;
    }

    await rm(target, { recursive: true, force: true });
    try {
      await bridge.call('skills/list', { forceReload: true });
    } catch {
      // ignore reload failures
    }

    res.json({ ok: true, deletedPath: target });
  } catch (error) {
    res.status(500).json({ error: getErrorMessageFromPayload(error, 'Failed to uninstall skill') });
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
  const PORT = Number(process.env.PORT || process.env.BRIDGE_PORT || 3457);
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
