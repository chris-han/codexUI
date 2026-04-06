import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { execSync, spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { applyReviewAction, getReviewSnapshot, initializeReviewGit } from './reviewGit';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');
const DEFAULT_CODEX_HOME = join(__dirname, '..', '.codex');
const DEFAULT_USER_FILES_PATH = join(__dirname, '..', 'user_files');
const SETTINGS_FILE = join(__dirname, '..', '.codex-ui-settings.json');
const PROVIDER_MODELS_FETCH_TIMEOUT_MS = 5_000;

type SandboxModeSetting = 'workspace-write' | 'danger-full-access';
const DEFAULT_SANDBOX_MODE: SandboxModeSetting = 'workspace-write';

type CodexUiSettings = {
  codexHome?: string;
  userFilesPath?: string;
  sandboxMode?: SandboxModeSetting;
  markets?: Array<{ owner: string; repo: string; active: boolean }>;
};

function readSettingsSync(): CodexUiSettings {
  try {
    const raw = readFileSync(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as CodexUiSettings;
    }
  } catch {
    // ignore missing/invalid file
  }
  return {};
}

async function readSettingsAsync(): Promise<CodexUiSettings> {
  try {
    const raw = await readFile(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as CodexUiSettings;
    }
  } catch {
    // ignore missing/invalid file
  }
  return {};
}

async function writeSettingsAsync(next: CodexUiSettings): Promise<void> {
  const current = await readSettingsAsync();
  const merged = { ...current, ...next };
  const dir = dirname(SETTINGS_FILE);
  await mkdir(dir, { recursive: true });
  await writeFile(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf8');
}

function resolveCodexHome(): string {
  // Priority: env var > saved settings > default local .codex
  const envHome = process.env.CODEXUI_CODEX_HOME?.trim();
  if (envHome) return envHome;
  const saved = readSettingsSync();
  if (saved.codexHome && saved.codexHome.trim()) return saved.codexHome.trim();
  return DEFAULT_CODEX_HOME;
}

function resolveUserFilesPath(): string {
  const saved = readSettingsSync();
  if (saved.userFilesPath && saved.userFilesPath.trim()) return saved.userFilesPath.trim();
  return DEFAULT_USER_FILES_PATH;
}

const CODEX_HOME = resolveCodexHome();
let userFilesPath = resolveUserFilesPath();

function resolveSandboxMode(): SandboxModeSetting {
  const saved = readSettingsSync();
  if (saved.sandboxMode === 'danger-full-access' || saved.sandboxMode === 'workspace-write') {
    return saved.sandboxMode;
  }
  return DEFAULT_SANDBOX_MODE;
}
let sandboxModeSetting: SandboxModeSetting = resolveSandboxMode();

/** Ensure userFilesPath exists with 0o755 (rw for owner, no exec by default on files) */
async function ensureUserFilesDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o755 });
}

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
  owner: string;           // skill author within the market tree
  description: string;
  displayName: string;
  publishedAt: number;
  avatarUrl: string;
  url: string;
  installed: boolean;
  path?: string;
  enabled?: boolean;
  marketOwner: string;     // which market repo this came from
  marketRepo: string;
};

type SkillsTreeEntry = {
  name: string;
  owner: string;
  url: string;
  marketOwner: string;
  marketRepo: string;
  metaStyle?: 'meta-json' | 'skill-md';
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

const BUILTIN_MARKET_OWNER = 'openai';
const BUILTIN_MARKET_REPO = 'skills';

// Default markets shown when the user has no saved configuration.
const DEFAULT_MARKETS: Array<{ owner: string; repo: string; active: boolean }> = [
  { owner: 'openai', repo: 'skills', active: true },
  { owner: 'openclaw', repo: 'skills', active: true },
];

type MarketEntry = { owner: string; repo: string; active: boolean };

function resolveAllMarkets(): MarketEntry[] {
  const saved = readSettingsSync();
  const savedMarkets: MarketEntry[] = Array.isArray(saved.markets)
    ? (saved.markets as Array<{ owner?: unknown; repo?: unknown; active?: unknown }>)
        .filter((m) => typeof m.owner === 'string' && typeof m.repo === 'string' && m.owner.trim() && m.repo.trim())
        .map((m) => ({ owner: (m.owner as string).trim(), repo: (m.repo as string).trim(), active: m.active !== false }))
    : [];

  // No saved markets yet — return the defaults
  if (savedMarkets.length === 0) {
    return DEFAULT_MARKETS.map((m) => ({ ...m }));
  }

  // Ensure openai/skills (Official) is always first; preserve its saved active state
  const builtInSaved = savedMarkets.find((m) => m.owner === BUILTIN_MARKET_OWNER && m.repo === BUILTIN_MARKET_REPO);
  const builtIn: MarketEntry = { owner: BUILTIN_MARKET_OWNER, repo: BUILTIN_MARKET_REPO, active: builtInSaved ? builtInSaved.active : true };
  const rest = savedMarkets.filter((m) => !(m.owner === BUILTIN_MARKET_OWNER && m.repo === BUILTIN_MARKET_REPO));
  return [builtIn, ...rest];
}

let allMarkets: MarketEntry[] = resolveAllMarkets();

const TREE_CACHE_TTL_MS = 5 * 60 * 1000;
const SKILLS_HUB_GITHUB_TIMEOUT_MS = 8_000;
const SKILLS_HUB_BRIDGE_TIMEOUT_MS = 5_000;
// Per-market caches keyed as "owner/repo"
const skillsTreeCacheMap = new Map<string, { entries: SkillsTreeEntry[]; fetchedAt: number }>();
const metaCacheMap = new Map<string, Map<string, { description: string; displayName: string; publishedAt: number }>>();

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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
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
  // Check CODEX_HOME first so the local skills dir takes priority, then fallbacks
  const candidates = [
    join(CODEX_HOME, 'skills', '.system', 'skill-installer', 'scripts', 'install-skill-from-github.py'),
    join(homedir(), '.codex', 'skills', '.system', 'skill-installer', 'scripts', 'install-skill-from-github.py'),
    join(homedir(), '.cursor', 'skills', '.system', 'skill-installer', 'scripts', 'install-skill-from-github.py'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

async function scanInstalledSkills(bridge: CodexBridge): Promise<Map<string, InstalledSkillInfo>> {
  const installed = new Map<string, InstalledSkillInfo>();
  const localSkillsDir = getSkillsInstallDir();
  try {
    const result = await withTimeout(bridge.call('skills/list', {}), SKILLS_HUB_BRIDGE_TIMEOUT_MS, 'skills/list') as {
      data?: Array<{ skills?: Array<{ name?: string; path?: string; enabled?: boolean }> }>;
    };
    for (const entry of result.data ?? []) {
      for (const skill of entry.skills ?? []) {
        if (!skill.name) continue;
        const normalizedPath = typeof skill.path === 'string' ? skill.path.trim() : '';
        if (normalizedPath && !normalizedPath.startsWith(`${localSkillsDir}/`)) continue;
        installed.set(skill.name, {
          name: skill.name,
          path: normalizedPath,
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
    signal: AbortSignal.timeout(SKILLS_HUB_GITHUB_TIMEOUT_MS),
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'codex-ui-react',
    },
  });
}

async function fetchSkillsTree(marketOwner: string, marketRepo: string): Promise<SkillsTreeEntry[]> {
  const cacheKey = `${marketOwner}/${marketRepo}`;
  const cached = skillsTreeCacheMap.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < TREE_CACHE_TTL_MS) {
    return cached.entries;
  }

  const response = await ghFetch(`https://api.github.com/repos/${marketOwner}/${marketRepo}/git/trees/main?recursive=1`);
  if (!response.ok) {
    throw new Error(`GitHub tree API returned ${response.status}`);
  }
  const payload = await response.json() as { tree?: Array<{ path: string; type: string }> };
  const metaJsonPattern = /^skills\/([^/]+)\/([^/]+)\/_meta\.json$/;
  const skillMdPattern = /^skills\/([^/]+)\/([^/]+)\/SKILL\.md$/;
  const entries: SkillsTreeEntry[] = [];
  const seen = new Set<string>();

  for (const node of payload.tree ?? []) {
    const metaMatch = metaJsonPattern.exec(node.path);
    if (metaMatch) {
      const owner = metaMatch[1];
      const name = metaMatch[2];
      const key = `${owner}/${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({
        owner,
        name,
        url: `https://github.com/${marketOwner}/${marketRepo}/tree/main/skills/${owner}/${name}`,
        marketOwner,
        marketRepo,
        metaStyle: 'meta-json',
      });
      continue;
    }
    const skillMdMatch = skillMdPattern.exec(node.path);
    if (skillMdMatch) {
      const owner = skillMdMatch[1];
      const name = skillMdMatch[2];
      const key = `${owner}/${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({
        owner,
        name,
        url: `https://github.com/${marketOwner}/${marketRepo}/tree/main/skills/${owner}/${name}`,
        marketOwner,
        marketRepo,
        metaStyle: 'skill-md',
      });
    }
  }

  skillsTreeCacheMap.set(cacheKey, { entries, fetchedAt: Date.now() });
  return entries;
}

function parseSkillMdFrontMatter(content: string): { name?: string; description?: string } {
  const fmMatch = /^---\s*\n([\s\S]*?)\n---/.exec(content);
  if (!fmMatch) return {};
  const fm = fmMatch[1];
  const nameMatch = /^name:\s*["']?([^"'\n]+)["']?\s*$/m.exec(fm);
  // description may be a quoted string, possibly containing backticks
  const descMatch = /^description:\s*"([\s\S]*?)"\s*$/m.exec(fm);
  return {
    name: nameMatch?.[1]?.trim(),
    description: descMatch?.[1]?.replace(/\s+/g, ' ').trim(),
  };
}

function extractH1Title(content: string): string {
  const match = /^#\s+(.+)$/m.exec(content);
  return match?.[1]?.trim() ?? '';
}

async function fetchMetaBatch(entries: SkillsTreeEntry[]): Promise<void> {
  // Group by market, fetch uncached entries
  const byMarket = new Map<string, SkillsTreeEntry[]>();
  for (const entry of entries) {
    const mk = `${entry.marketOwner}/${entry.marketRepo}`;
    if (!byMarket.has(mk)) byMarket.set(mk, []);
    const mc = metaCacheMap.get(mk) ?? new Map();
    if (!mc.has(`${entry.owner}/${entry.name}`)) {
      byMarket.get(mk)!.push(entry);
    }
  }

  const toFetch: SkillsTreeEntry[] = [];
  for (const list of byMarket.values()) toFetch.push(...list.slice(0, 50));

  await Promise.allSettled(toFetch.map(async (entry) => {
    const mk = `${entry.marketOwner}/${entry.marketRepo}`;
    if (!metaCacheMap.has(mk)) metaCacheMap.set(mk, new Map());

    if (entry.metaStyle === 'skill-md') {
      // openai/skills format: parse SKILL.md front matter
      const response = await fetch(
        `https://raw.githubusercontent.com/${entry.marketOwner}/${entry.marketRepo}/main/skills/${entry.owner}/${entry.name}/SKILL.md`,
        { signal: AbortSignal.timeout(SKILLS_HUB_GITHUB_TIMEOUT_MS) }
      );
      if (!response.ok) return;
      const text = await response.text();
      const fm = parseSkillMdFrontMatter(text);
      const displayName = extractH1Title(text) || fm.name || entry.name;
      metaCacheMap.get(mk)!.set(`${entry.owner}/${entry.name}`, {
        description: fm.description ?? '',
        displayName,
        publishedAt: 0,
      });
      return;
    }

    const response = await fetch(
      `https://raw.githubusercontent.com/${entry.marketOwner}/${entry.marketRepo}/main/skills/${entry.owner}/${entry.name}/_meta.json`,
      { signal: AbortSignal.timeout(SKILLS_HUB_GITHUB_TIMEOUT_MS) }
    );
    if (!response.ok) return;
    const meta = await response.json() as MetaJson;
    metaCacheMap.get(mk)!.set(`${entry.owner}/${entry.name}`, {
      description: typeof meta.description === 'string' ? meta.description : '',
      displayName: typeof meta.displayName === 'string' ? meta.displayName : '',
      publishedAt: meta.latest?.publishedAt ?? 0,
    });
  }));
}

function buildSkillHubEntry(entry: SkillsTreeEntry): SkillHubEntry {
  const mk = `${entry.marketOwner}/${entry.marketRepo}`;
  const meta = metaCacheMap.get(mk)?.get(`${entry.owner}/${entry.name}`);
  return {
    name: entry.name,
    owner: entry.owner,
    description: meta?.description ?? '',
    displayName: meta?.displayName ?? '',
    publishedAt: meta?.publishedAt ?? 0,
    avatarUrl: `https://github.com/${entry.owner}.png?size=40`,
    url: entry.url,
    installed: false,
    marketOwner: entry.marketOwner,
    marketRepo: entry.marketRepo,
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
      // Expose configured user-files path so shell commands can reference $CODEXUI_USER_FILES_PATH
      CODEXUI_USER_FILES_PATH: userFilesPath,
      CODEXUI_SKILLS_DIR: getSkillsInstallDir(),
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

/** Build the developer_instructions block injected into thread starts and turns. */
function buildThreadDevInstructions(options: { threadCwd?: string | null; compact?: boolean } = {}): string {
  const { threadCwd = null, compact = false } = options;
  const skillsDir = getSkillsInstallDir();

  if (compact) {
    return [
      '## Codex UI — File Output Reminder',
      '',
      `- Default output location for unspecified created files: \`${userFilesPath}\``,
      '- This overrides the usual tendency to save generic files in the repo/workspace cwd.',
      '- Only use another location when the user explicitly provides a path or the task is clearly modifying repository code.',
    ].join('\n');
  }

  const lines = [
    '## Codex UI — Runtime Configuration',
    '',
    'The following paths are configured by the user in the Settings page.',
    'Always use these paths when reading/writing files or installing skills.',
    '',
    `- **CODEX_HOME** (Codex home directory): \`${CODEX_HOME}\``,
    `- **Skills directory** (installed skills live here): \`${skillsDir}\``,
    `- **User files directory** (default output location for user-created files): \`${userFilesPath}\``,
  ];

  if (threadCwd && threadCwd !== userFilesPath) {
    lines.push(`- **Workspace / repo cwd** (use this for code edits when the user is working on repo files): \`${threadCwd}\``);
  }

  lines.push(
    '',
    'IMPORTANT FILE-WRITE RULES:',
    '1. If the user asks you to create, save, export, or test-write a file and does not specify an exact target path, you MUST use the **User files directory** above.',
    '2. This rule overrides the normal cwd default: do NOT place generic output files in the repo/workspace cwd just because it is the current directory.',
    '3. Prefer an absolute path under that directory (for example: `${CODEXUI_USER_FILES_PATH}/test_file.txt`) instead of writing relative files into the workspace cwd.',
    '4. Only write somewhere else when the user explicitly gives a different path or the task is clearly editing repository code in the workspace.',
    '5. Do NOT write user content into the skills directory or CODEX_HOME.',
    'The env var `$CODEXUI_USER_FILES_PATH` also points to this directory.',
  );

  return lines.join('\n');
}

function mergeDeveloperInstructions(baseBlock: string, existing: unknown): string {
  const existingText = typeof existing === 'string' ? existing.trim() : '';
  return existingText ? `${baseBlock}\n\n${existingText}` : baseBlock;
}

app.post('/codex-api/rpc', async (req, res) => {
  try {
    const { method } = req.body;
    let { params } = req.body;

    // Ensure the cwd directory exists before starting a new thread
    if (method === 'thread/start') {
      const p = (params ?? {}) as Record<string, unknown>;
      const cwd = readNonEmptyString(p.cwd);
      if (cwd) {
        await mkdir(cwd, { recursive: true });
      }

      // Inject configured-path context into developer_instructions
      const configBlock = buildThreadDevInstructions({ threadCwd: cwd });

      // Apply the user-configured sandbox mode (workspace-write or danger-full-access).
      // For workspace-write, also inject userFilesPath as an additional writable root so
      // the agent can write there in addition to its cwd.
      const effectiveSandbox = p.sandbox == null ? sandboxModeSetting : (p.sandbox as string);

      const existingConfig = (p.config != null && typeof p.config === 'object' && !Array.isArray(p.config))
        ? p.config as Record<string, unknown>
        : {};

      const configPatch: Record<string, unknown> = { ...existingConfig };
      if (effectiveSandbox === 'workspace-write') {
        const existingWritableRoots: string[] = Array.isArray(
          (existingConfig.sandbox_workspace_write as Record<string, unknown> | undefined)?.writable_roots
        )
          ? ((existingConfig.sandbox_workspace_write as Record<string, unknown>).writable_roots as string[])
          : [];
        configPatch.sandbox_workspace_write = {
          ...((existingConfig.sandbox_workspace_write as Record<string, unknown>) ?? {}),
          writable_roots: [...new Set([...existingWritableRoots, userFilesPath])],
        };
      }

      params = {
        ...p,
        ...(p.sandbox == null ? { sandbox: effectiveSandbox } : {}),
        config: configPatch,
        developer_instructions: mergeDeveloperInstructions(configBlock, p.developer_instructions),
      };
    }

    if (method === 'turn/start') {
      const p = (params ?? {}) as Record<string, unknown>;
      const reminderBlock = buildThreadDevInstructions({ compact: true });
      const collaborationMode = asRecord(p.collaborationMode) ?? asRecord(p.collaboration_mode);
      const existingSettings = asRecord(collaborationMode?.settings) ?? {};
      const patchedCollaborationMode = {
        ...(collaborationMode ?? {}),
        settings: {
          ...existingSettings,
          developer_instructions: mergeDeveloperInstructions(reminderBlock, existingSettings.developer_instructions),
        },
      };

      params = {
        ...p,
        collaborationMode: patchedCollaborationMode,
      };
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
  const query = typeof req.query.q === 'string' ? req.query.q : '';
  const sort = req.query.sort === 'name' ? 'name' : 'date';
  const limitRaw = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 100;
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 100, 1), 200);

  try {
    const activeMarkets = allMarkets.filter((m) => m.active);

    const [treesResult, installedResult] = await Promise.allSettled([
      Promise.allSettled(activeMarkets.map((m) => fetchSkillsTree(m.owner, m.repo))),
      scanInstalledSkills(bridge),
    ]);

    // Merge entries from all active markets; first market wins on name collision
    const allEntries: SkillsTreeEntry[] = [];
    const seenNames = new Set<string>();
    if (treesResult.status === 'fulfilled') {
      for (const treeResult of treesResult.value) {
        if (treeResult.status === 'fulfilled') {
          for (const entry of treeResult.value) {
            if (!seenNames.has(entry.name)) {
              seenNames.add(entry.name);
              allEntries.push(entry);
            }
          }
        }
      }
    }

    const installed = installedResult.status === 'fulfilled' ? installedResult.value : new Map<string, InstalledSkillInfo>();

    if (allEntries.length > 0) {
      await fetchMetaBatch(allEntries).catch(() => {});
    }

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
            marketOwner: '',
            marketRepo: '',
          };
      return {
        ...base,
        installed: true,
        path: skill.path,
        enabled: skill.enabled,
      };
    });

    const partialErrors: string[] = [];
    if (treesResult.status === 'fulfilled') {
      for (let i = 0; i < treesResult.value.length; i++) {
        if (treesResult.value[i].status === 'rejected') {
          const m = activeMarkets[i];
          partialErrors.push(`${m.owner}/${m.repo}: ${getErrorMessageFromPayload((treesResult.value[i] as PromiseRejectedResult).reason, 'Failed to load marketplace')}`);
        }
      }
    }
    if (installedResult.status === 'rejected') {
      partialErrors.push(getErrorMessageFromPayload(installedResult.reason, 'Failed to load installed skills'));
    }

    res.json({
      data: allEntries.length > 0 ? searchSkillsHub(allEntries, query, limit, sort, installed) : [],
      installed: installedEntries,
      total: allEntries.length,
      partialError: partialErrors.join('; ') || undefined,
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
    // marketOwner/marketRepo tell us which market repo to fetch SKILL.md from
    const marketOwner = (typeof req.query.marketOwner === 'string' ? req.query.marketOwner.trim() : '') || BUILTIN_MARKET_OWNER;
    const marketRepo = (typeof req.query.marketRepo === 'string' ? req.query.marketRepo.trim() : '') || BUILTIN_MARKET_REPO;

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

    const response = await fetch(`https://raw.githubusercontent.com/${marketOwner}/${marketRepo}/main/skills/${owner}/${name}/SKILL.md`);
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
    // marketOwner/marketRepo identify which market repo to install from
    const marketOwner = (typeof req.body?.marketOwner === 'string' ? req.body.marketOwner.trim() : '') || BUILTIN_MARKET_OWNER;
    const marketRepo = (typeof req.body?.marketRepo === 'string' ? req.body.marketRepo.trim() : '') || BUILTIN_MARKET_REPO;
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

    const installDir = getSkillsInstallDir();
    await mkdir(installDir, { recursive: true });
    const skillDir = join(installDir, name);
    if (existsSync(skillDir)) {
      await rm(skillDir, { recursive: true, force: true });
    }

    await runCommand(python.command, [
      ...python.args,
      installerScript,
      '--repo', `${marketOwner}/${marketRepo}`,
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

// Settings endpoints — read/write .codex-ui-settings.json
app.get('/codex-api/settings', async (_req, res) => {
  try {
    const settings = await readSettingsAsync();
    res.json({
      data: {
        codexHome: CODEX_HOME,
        savedCodexHome: settings.codexHome ?? null,
        defaultCodexHome: DEFAULT_CODEX_HOME,
        skillsDir: getSkillsInstallDir(),
        settingsFile: SETTINGS_FILE,
        userFilesPath,
        savedUserFilesPath: settings.userFilesPath ?? null,
        defaultUserFilesPath: DEFAULT_USER_FILES_PATH,
        sandboxMode: sandboxModeSetting,
        savedSandboxMode: settings.sandboxMode ?? null,
        defaultSandboxMode: DEFAULT_SANDBOX_MODE,
        markets: allMarkets,
        builtInMarket: { owner: BUILTIN_MARKET_OWNER, repo: BUILTIN_MARKET_REPO },
      },
    });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error, 'Failed to read settings') });
  }
});

app.put('/codex-api/settings', async (req, res) => {
  try {
    const record = asRecord(req.body);
    if (!record) {
      res.status(400).json({ error: 'Invalid body: expected object' });
      return;
    }
    const nextSettings: CodexUiSettings = {};
    let codexHomeChanged = false;

    if (typeof record.codexHome === 'string') {
      const trimmed = record.codexHome.trim();
      if (trimmed) {
        const normalized = isAbsolute(trimmed) ? trimmed : resolve(trimmed);
        try {
          const info = await stat(normalized);
          if (!info.isDirectory()) {
            res.status(400).json({ error: 'codexHome must be a directory path' });
            return;
          }
        } catch {
          // allow non-existent paths; codex will error at startup if invalid
        }
        nextSettings.codexHome = normalized;
      } else {
        nextSettings.codexHome = '';
      }
      codexHomeChanged = true;
    }

    if (typeof record.userFilesPath === 'string') {
      const trimmed = record.userFilesPath.trim();
      if (trimmed) {
        const normalized = isAbsolute(trimmed) ? trimmed : resolve(trimmed);
        await ensureUserFilesDir(normalized);
        nextSettings.userFilesPath = normalized;
        userFilesPath = normalized;
      } else {
        nextSettings.userFilesPath = '';
        userFilesPath = DEFAULT_USER_FILES_PATH;
        await ensureUserFilesDir(DEFAULT_USER_FILES_PATH);
      }
    }

    if (typeof record.sandboxMode === 'string') {
      const mode = record.sandboxMode.trim();
      if (mode === 'workspace-write' || mode === 'danger-full-access') {
        nextSettings.sandboxMode = mode;
        sandboxModeSetting = mode;
      } else if (mode === '') {
        nextSettings.sandboxMode = DEFAULT_SANDBOX_MODE;
        sandboxModeSetting = DEFAULT_SANDBOX_MODE;
      } else {
        res.status(400).json({ error: 'sandboxMode must be "workspace-write" or "danger-full-access"' });
        return;
      }
    }

    if (Array.isArray(record.markets)) {
      const normalized = (record.markets as unknown[])
        .filter((m): m is { owner: string; repo: string; active: boolean } => {
          if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
          const r = m as Record<string, unknown>;
          return typeof r.owner === 'string' && typeof r.repo === 'string' && r.owner.trim().length > 0 && r.repo.trim().length > 0;
        })
        .map((m) => ({ owner: m.owner.trim(), repo: m.repo.trim(), active: m.active !== false }));
      // Ensure built-in is always in the list
      const hasBuiltIn = normalized.some((m) => m.owner === BUILTIN_MARKET_OWNER && m.repo === BUILTIN_MARKET_REPO);
      if (!hasBuiltIn) {
        normalized.unshift({ owner: BUILTIN_MARKET_OWNER, repo: BUILTIN_MARKET_REPO, active: true });
      }
      nextSettings.markets = normalized;
      // Apply immediately
      allMarkets = normalized;
      skillsTreeCacheMap.clear();
      metaCacheMap.clear();
    }

    await writeSettingsAsync(nextSettings);
    res.json({
      ok: true,
      restartRequired: codexHomeChanged,
      message: codexHomeChanged
        ? 'Settings saved. Restart the server for the Codex Home change to take effect.'
        : 'Settings saved.',
    });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error, 'Failed to save settings') });
  }
});

// ── User-files endpoints (isolated writable area) ──────────────────────────

/** Resolve and validate that a requested path is inside userFilesPath (no path traversal) */
function resolveInsideUserFiles(relOrAbs: string): string | null {
  const base = userFilesPath;
  const candidate = isAbsolute(relOrAbs) ? relOrAbs : join(base, relOrAbs);
  const normalized = resolve(candidate);
  if (!normalized.startsWith(base + '/') && normalized !== base) return null;
  return normalized;
}

app.post('/codex-api/user-files/write', async (req, res) => {
  try {
    const record = asRecord(req.body);
    if (!record) { res.status(400).json({ error: 'Invalid body' }); return; }
    const relPath = typeof record.path === 'string' ? record.path.trim() : '';
    const content = typeof record.content === 'string' ? record.content : null;
    if (!relPath) { res.status(400).json({ error: 'path is required' }); return; }
    if (content === null) { res.status(400).json({ error: 'content is required' }); return; }

    const target = resolveInsideUserFiles(relPath);
    if (!target) { res.status(400).json({ error: 'Path must be inside the user_files directory' }); return; }

    await ensureUserFilesDir(dirname(target));
    await writeFile(target, content, { encoding: 'utf8', mode: 0o644 });
    res.json({ ok: true, path: target });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error, 'Failed to write file') });
  }
});

app.get('/codex-api/user-files/list', async (req, res) => {
  try {
    const subPath = typeof req.query.path === 'string' ? req.query.path.trim() : '';
    const targetDir = subPath ? resolveInsideUserFiles(subPath) : userFilesPath;
    if (!targetDir) { res.status(400).json({ error: 'Path must be inside the user_files directory' }); return; }

    await ensureUserFilesDir(targetDir);
    const rawEntries = await readdir(targetDir, { withFileTypes: true });
    const entries = rawEntries.map((e) => ({ name: e.name, isDirectory: e.isDirectory(), path: join(targetDir, e.name) }));
    res.json({ data: { path: targetDir, entries } });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error, 'Failed to list user files') });
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

  // Ensure user_files directory exists at startup
  await ensureUserFilesDir(userFilesPath);

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
