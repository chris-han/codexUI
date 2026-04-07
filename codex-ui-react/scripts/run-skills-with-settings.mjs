#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..');
const settingsFile = join(appRoot, '.codex-ui-settings.json');
const defaultCodexHome = join(appRoot, '.codex');

function readSettings() {
  try {
    const raw = readFileSync(settingsFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Ignore missing/invalid settings and fall back to the local .codex directory.
  }
  return {};
}

function resolveCodexHome() {
  const envHome = process.env.CODEXUI_CODEX_HOME?.trim() || process.env.CODEX_HOME?.trim();
  if (envHome) return envHome;

  const settings = readSettings();
  if (typeof settings.codexHome === 'string' && settings.codexHome.trim()) {
    return settings.codexHome.trim();
  }

  return defaultCodexHome;
}

function printUsage(codexHome, skillsDir) {
  console.log(`Usage:
  bun run skills:with-settings -- <command> [args...]
  node codex-ui-react/scripts/run-skills-with-settings.mjs -- <command> [args...]

Examples:
  bun run skills:with-settings -- npx some-skills-cli install playwright-web-scraper
  bun run skills:with-settings -- --print-config

Resolved values:
  CODEX_HOME=${codexHome}
  skillsDir=${skillsDir}
  settingsFile=${settingsFile}
`);
}

const codexHome = resolveCodexHome();
const skillsDir = join(codexHome, 'skills');
mkdirSync(skillsDir, { recursive: true });

const rawArgs = process.argv.slice(2);
const commandArgs = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;

if (commandArgs.length === 0 || commandArgs.includes('-h') || commandArgs.includes('--help')) {
  printUsage(codexHome, skillsDir);
  process.exit(commandArgs.length === 0 ? 1 : 0);
}

if (commandArgs.length === 1 && commandArgs[0] === '--print-config') {
  console.log(JSON.stringify({
    codexHome,
    skillsDir,
    settingsFile,
    source: codexHome === defaultCodexHome ? 'default' : 'saved-settings-or-env',
  }, null, 2));
  process.exit(0);
}

const [command, ...args] = commandArgs;
const env = {
  ...process.env,
  CODEX_HOME: codexHome,
  CODEXUI_CODEX_HOME: codexHome,
  XDG_CONFIG_HOME: codexHome,
  CODEXUI_SKILLS_DIR: skillsDir,
  SKILLS_DIR: skillsDir,
  AGENTS_HOME: codexHome,
  AGENTS_SKILLS_DIR: skillsDir,
};

console.error(`[skills-wrapper] CODEX_HOME=${codexHome}`);
console.error(`[skills-wrapper] skillsDir=${skillsDir}`);

const child = spawn(command, args, {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(`[skills-wrapper] Failed to start command: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
