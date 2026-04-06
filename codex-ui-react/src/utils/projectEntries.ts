import type { WorkspaceRootsState } from '../api/codexGateway';
import type { UiProjectGroup, UiThread } from '../types/codex';

export type ProjectEntry = {
  key: string;
  cwd: string;
  label: string;
  threads: UiThread[];
};

function normalizePathSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

function getBaseName(value: string): string {
  const normalized = normalizePathSlashes(value.trim());
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

export function deriveProjectLabel(cwd: string, labels: Record<string, string>, fallback?: string): string {
  const customLabel = labels[cwd]?.trim();
  if (customLabel) return customLabel;
  if (fallback?.trim()) return fallback.trim();
  const base = getBaseName(cwd);
  return base || cwd.trim() || 'Project';
}

export function buildProjectEntries(
  rootsState: WorkspaceRootsState,
  projectGroups: UiProjectGroup[]
): ProjectEntry[] {
  const entries: ProjectEntry[] = [];
  const usedCwds = new Set<string>();
  const configuredCwds = new Set<string>();

  const groupsByCwd = new Map<string, UiProjectGroup>();
  for (const group of projectGroups) {
    const cwd = group.threads[0]?.cwd?.trim() ?? '';
    if (!cwd || groupsByCwd.has(cwd)) continue;
    groupsByCwd.set(cwd, group);
  }

  for (const cwdRaw of [...rootsState.order, ...rootsState.active]) {
    const cwd = cwdRaw.trim();
    if (!cwd || configuredCwds.has(cwd)) continue;
    configuredCwds.add(cwd);
  }

  for (const cwd of rootsState.order) {
    const normalizedCwd = cwd.trim();
    if (!normalizedCwd || usedCwds.has(normalizedCwd)) continue;
    const group = groupsByCwd.get(normalizedCwd);
    entries.push({
      key: normalizedCwd,
      cwd: normalizedCwd,
      label: deriveProjectLabel(normalizedCwd, rootsState.labels, group?.projectName),
      threads: group?.threads ?? [],
    });
    usedCwds.add(normalizedCwd);
  }

  for (const cwd of rootsState.active) {
    const normalizedCwd = cwd.trim();
    if (!normalizedCwd || usedCwds.has(normalizedCwd)) continue;
    const group = groupsByCwd.get(normalizedCwd);
    entries.push({
      key: normalizedCwd,
      cwd: normalizedCwd,
      label: deriveProjectLabel(normalizedCwd, rootsState.labels, group?.projectName),
      threads: group?.threads ?? [],
    });
    usedCwds.add(normalizedCwd);
  }

  for (const projectGroup of projectGroups) {
    const cwd = projectGroup.threads[0]?.cwd?.trim() ?? '';
    if (!cwd || usedCwds.has(cwd)) continue;
    const group = groupsByCwd.get(cwd);
    entries.push({
      key: cwd,
      cwd,
      label: deriveProjectLabel(cwd, rootsState.labels, group?.projectName),
      threads: group?.threads ?? [],
    });
    usedCwds.add(cwd);
  }

  return entries;
}
