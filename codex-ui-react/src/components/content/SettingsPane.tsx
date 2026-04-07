import { useEffect, useState } from 'react';
import { Settings, ExternalLink, Plus, Trash2, Shield, FolderOpen, AlertCircle } from 'lucide-react';
import { IconTablerFolder, IconTablerChevronLeft } from '../icons';
import * as api from '../../api/codexGateway';
import type { CodexUiSettingsInfo, CodexSubdirectoryInfo, MarketEntry, SandboxModeSetting } from '../../api/codexGateway';
import ContentHeader from './ContentHeader';

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

// ── Directory browser panel ───────────────────────────────────────────────────

interface DirectoryBrowserProps {
  currentPath: string;
  parentPath: string | null;
  entries: DirectoryBrowseEntry[];
  isLoading: boolean;
  onNavigate: (path: string) => void;
  onSelect: (path: string) => void;
}

function DirectoryBrowser({
  currentPath,
  parentPath,
  entries,
  isLoading,
  onNavigate,
  onSelect,
}: DirectoryBrowserProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50">
      <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2">
        {parentPath ? (
          <button
            type="button"
            onClick={() => onNavigate(parentPath)}
            className="flex items-center gap-1 rounded p-1 text-gray-500 transition hover:bg-gray-200 hover:text-gray-700"
            aria-label="Go up"
          >
            <IconTablerChevronLeft className="h-4 w-4" />
          </button>
        ) : (
          <div className="w-6" />
        )}
        <span className="min-w-0 flex-1 truncate text-xs text-gray-600" title={currentPath}>
          {currentPath}
        </span>
        <button
          type="button"
          onClick={() => onSelect(currentPath)}
          className="shrink-0 rounded bg-primary px-3 py-1 text-xs font-medium text-white transition hover:bg-primary/90"
        >
          Select
        </button>
      </div>
      <div className="max-h-52 overflow-y-auto">
        {isLoading ? (
          <div className="px-4 py-6 text-center text-sm text-gray-400">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-gray-400">No subdirectories</div>
        ) : (
          entries.map((entry) => (
            <button
              key={entry.path}
              type="button"
              onClick={() => onNavigate(entry.path)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-100"
            >
              <IconTablerFolder className="h-4 w-4 shrink-0 text-amber-500" />
              <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${checked ? 'bg-primary' : 'bg-gray-200'}`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`}
      />
    </button>
  );
}

// ── Subdirectory info card ───────────────────────────────────────────────────

function SubdirectoryCard({ subdir }: { subdir: CodexSubdirectoryInfo }) {
  return (
    <div className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${subdir.exists ? 'border-gray-200 bg-white' : 'border-orange-200 bg-orange-50/50'}`}>
      {subdir.exists ? (
        <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
      ) : (
        <AlertCircle className="h-4 w-4 shrink-0 text-orange-500" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-700">{subdir.name}/</span>
          {subdir.exists ? (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              Ready
            </span>
          ) : (
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
              Missing
            </span>
          )}
        </div>
        <code className="block truncate text-xs text-gray-500">{subdir.path}</code>
      </div>
      {subdir.exists && (
        <div className="flex shrink-0 gap-1">
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${subdir.readable ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
            R
          </span>
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${subdir.writable ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
            W
          </span>
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${subdir.executable ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
            X
          </span>
        </div>
      )}
    </div>
  );
}

// ── Settings pane ─────────────────────────────────────────────────────────────

function SettingsPane() {
  const [settings, setSettings] = useState<CodexUiSettingsInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');

  // Directory browser state
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [browserPath, setBrowserPath] = useState('');
  const [browserParentPath, setBrowserParentPath] = useState<string | null>(null);
  const [browserEntries, setBrowserEntries] = useState<DirectoryBrowseEntry[]>([]);
  const [isBrowserLoading, setIsBrowserLoading] = useState(false);

  // Codex home edit
  const [codexHomeInput, setCodexHomeInput] = useState('');

  // Sandbox mode
  const [sandboxMode, setSandboxMode] = useState<SandboxModeSetting>('workspace-write');

  // Fine-grained sandbox settings
  const [networkAccess, setNetworkAccess] = useState(false);
  const [excludeTmpdirEnvVar, setExcludeTmpdirEnvVar] = useState(false);
  const [excludeSlashTmp, setExcludeSlashTmp] = useState(false);

  // Markets state
  const [markets, setMarkets] = useState<MarketEntry[]>([]);

  // Add market form
  const [addOwner, setAddOwner] = useState('');
  const [addRepo, setAddRepo] = useState('');

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const data = await api.getSettings();
      setSettings(data);
      setCodexHomeInput(data.savedCodexHome ?? '');
      setSandboxMode(data.sandboxMode ?? 'workspace-write');
      setNetworkAccess(data.networkAccess ?? false);
      setExcludeTmpdirEnvVar(data.excludeTmpdirEnvVar ?? false);
      setExcludeSlashTmp(data.excludeSlashTmp ?? false);
      setMarkets(data.markets ?? []);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const browseDirectory = async (path: string) => {
    setIsBrowserLoading(true);
    try {
      const response = await fetch(`/codex-api/browse-directory?path=${encodeURIComponent(path)}`);
      const payload = await response.json() as { data?: DirectoryBrowseResponse; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? 'Failed to browse');
      setBrowserPath(payload.data.path);
      setBrowserParentPath(payload.data.parentPath);
      setBrowserEntries(payload.data.entries.filter((e) => e.isDirectory));
    } catch {
      // ignore
    } finally {
      setIsBrowserLoading(false);
    }
  };

  const handleOpenBrowser = async () => {
    const startPath = codexHomeInput.trim() || settings?.codexHome || '/';
    setIsBrowsing(true);
    await browseDirectory(startPath);
  };

  const handleBrowserNavigate = async (path: string) => {
    await browseDirectory(path);
  };

  const handleBrowserSelect = (path: string) => {
    setCodexHomeInput(path);
    setIsBrowsing(false);
  };

  const saveMarkets = async (next: MarketEntry[]) => {
    setSaveError('');
    setSaveMessage('');
    setIsSaving(true);
    try {
      const result = await api.saveSettings({ markets: next });
      setSaveMessage(result.message);
      setMarkets(next);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleMarket = (index: number) => {
    const next = markets.map((m, i) => (i === index ? { ...m, active: !m.active } : m));
    void saveMarkets(next);
  };

  const handleRemoveMarket = (index: number) => {
    const next = markets.filter((_, i) => i !== index);
    void saveMarkets(next);
  };

  const handleAddMarket = () => {
    const owner = addOwner.trim();
    const repo = addRepo.trim();
    if (!owner || !repo) return;
    const alreadyExists = markets.some((m) => m.owner === owner && m.repo === repo);
    if (alreadyExists) {
      setSaveError(`${owner}/${repo} is already in the list`);
      return;
    }
    const next = [...markets, { owner, repo, active: true }];
    void saveMarkets(next);
    setAddOwner('');
    setAddRepo('');
  };

  const handleSaveCodexHome = async () => {
    setSaveError('');
    setSaveMessage('');
    setIsSaving(true);
    try {
      const result = await api.saveSettings({ codexHome: codexHomeInput.trim() || undefined });
      setSaveMessage(result.message);
      await loadSettings();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetCodexHome = async () => {
    setSaveError('');
    setSaveMessage('');
    setIsSaving(true);
    try {
      const result = await api.saveSettings({ codexHome: '' });
      setSaveMessage(result.message);
      setCodexHomeInput('');
      await loadSettings();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSandboxMode = async (mode: SandboxModeSetting) => {
    setSaveError('');
    setSaveMessage('');
    setIsSaving(true);
    try {
      setSandboxMode(mode);
      const result = await api.saveSettings({ sandboxMode: mode });
      setSaveMessage(result.message);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSandboxSetting = async (patch: { networkAccess?: boolean; excludeTmpdirEnvVar?: boolean; excludeSlashTmp?: boolean }) => {
    setSaveError('');
    setSaveMessage('');
    setIsSaving(true);
    try {
      if (patch.networkAccess !== undefined) setNetworkAccess(patch.networkAccess);
      if (patch.excludeTmpdirEnvVar !== undefined) setExcludeTmpdirEnvVar(patch.excludeTmpdirEnvVar);
      if (patch.excludeSlashTmp !== undefined) setExcludeSlashTmp(patch.excludeSlashTmp);
      const result = await api.saveSettings(patch);
      setSaveMessage(result.message);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const builtIn = settings?.builtInMarket;
  const skillsWrapperCommand = 'bun run skills:with-settings -- npx <skills-cli> ...';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ContentHeader
        title="Settings"
        leading={<Settings className="h-4 w-4 text-gray-500" strokeWidth={1.8} />}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-2xl space-y-8">

          {/* CODEX_HOME section */}
          <section className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Codex Home Directory</h2>
              <p className="mt-1 text-sm text-gray-500">
                The directory where Codex stores configuration, skills, and state. Maps to the{' '}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">CODEX_HOME</code>{' '}
                environment variable.
              </p>
            </div>

            {isLoading ? (
              <div className="text-sm text-gray-400">Loading…</div>
            ) : (
              <>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3 text-sm">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-xs font-medium text-gray-500">Active now</span>
                      <code className="min-w-0 break-all text-xs text-gray-700">{settings?.codexHome}</code>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-xs font-medium text-gray-500">Default</span>
                      <code className="min-w-0 break-all text-xs text-gray-400">{settings?.defaultCodexHome}</code>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-xs font-medium text-gray-500">Settings</span>
                      <code className="min-w-0 break-all text-xs text-gray-400">{settings?.settingsFile}</code>
                    </div>
                  </div>

                  {/* Subdirectories */}
                  <div className="border-t border-gray-200 pt-3">
                    <p className="mb-2 text-xs font-medium text-gray-500">Subdirectories</p>
                    <div className="space-y-2">
                      {settings?.subdirectories?.map((subdir) => (
                        <SubdirectoryCard key={subdir.name} subdir={subdir} />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Override path <span className="font-normal text-gray-400">(leave blank to use default)</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={codexHomeInput}
                      onChange={(e) => setCodexHomeInput(e.target.value)}
                      placeholder={settings?.defaultCodexHome}
                      className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={handleOpenBrowser}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:border-primary hover:text-primary"
                      title="Browse…"
                    >
                      <IconTablerFolder className="h-4 w-4" />
                    </button>
                  </div>

                  {isBrowsing ? (
                    <DirectoryBrowser
                      currentPath={browserPath}
                      parentPath={browserParentPath}
                      entries={browserEntries}
                      isLoading={isBrowserLoading}
                      onNavigate={handleBrowserNavigate}
                      onSelect={handleBrowserSelect}
                    />
                  ) : null}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSaveCodexHome}
                    disabled={isSaving}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isSaving ? 'Saving…' : 'Save'}
                  </button>
                  {settings?.savedCodexHome ? (
                    <button
                      type="button"
                      onClick={handleResetCodexHome}
                      disabled={isSaving}
                      className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:border-gray-300 hover:text-gray-800 disabled:opacity-50"
                    >
                      Reset to default
                    </button>
                  ) : null}
                </div>

                <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-3 text-sm">
                  <p className="font-medium text-blue-900">Run an external skills CLI with the saved Settings-page path</p>
                  <p className="mt-1 text-xs text-blue-800">
                    This wrapper reads <code className="rounded bg-white/80 px-1 py-0.5 text-[11px]">{settings?.settingsFile}</code> on each run and exports{' '}
                    <code className="rounded bg-white/80 px-1 py-0.5 text-[11px]">CODEX_HOME</code> and{' '}
                    <code className="rounded bg-white/80 px-1 py-0.5 text-[11px]">CODEXUI_SKILLS_DIR</code> for your command, so it does not require a server restart just to reuse the saved path.
                  </p>
                  <code className="mt-2 block break-all rounded bg-white/80 px-2 py-1.5 text-xs text-blue-900">
                    {skillsWrapperCommand}
                  </code>
                  <p className="mt-2 text-[11px] text-blue-700">
                    Current skills target: <span className="font-medium">{settings?.skillsDir}</span>
                  </p>
                </div>
              </>
            )}
          </section>


          {/* Sandbox Mode section */}
          <section className="space-y-4 border-t border-gray-100 pt-6">
            <div>
              <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                <Shield className="h-4 w-4 text-gray-400" strokeWidth={1.8} />
                Agent Sandbox Mode
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Controls what the agent is allowed to write on the filesystem.
                Changes apply to new threads; existing threads keep their sandbox.
              </p>
            </div>

            {isLoading ? (
              <div className="text-sm text-gray-400">Loading…</div>
            ) : (
              <div className="space-y-3">
                {/* workspace-write option */}
                <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition ${
                  sandboxMode === 'workspace-write'
                    ? 'border-primary bg-primary/5'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}>
                  <input
                    type="radio"
                    name="sandboxMode"
                    value="workspace-write"
                    checked={sandboxMode === 'workspace-write'}
                    onChange={() => void handleSaveSandboxMode('workspace-write')}
                    className="mt-0.5 accent-primary"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">Workspace Write</span>
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Recommended</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Agent can write inside its thread folder. Cannot write elsewhere.
                    </p>
                  </div>
                </label>

                {/* danger-full-access option */}
                <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition ${
                  sandboxMode === 'danger-full-access'
                    ? 'border-orange-400 bg-orange-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}>
                  <input
                    type="radio"
                    name="sandboxMode"
                    value="danger-full-access"
                    checked={sandboxMode === 'danger-full-access'}
                    onChange={() => void handleSaveSandboxMode('danger-full-access')}
                    className="mt-0.5 accent-orange-500"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">Full Access</span>
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">⚠ Use with care</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Agent has unrestricted read/write access to the entire filesystem.
                      Useful when the agent needs to touch paths outside the thread folder
                      (e.g. system config, arbitrary project directories).
                    </p>
                  </div>
                </label>

                {settings?.sandboxMode !== settings?.defaultSandboxMode ? (
                  <button
                    type="button"
                    onClick={() => void handleSaveSandboxMode(settings?.defaultSandboxMode ?? 'workspace-write')}
                    disabled={isSaving}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:border-gray-300 hover:text-gray-800 disabled:opacity-50"
                  >
                    Reset to default
                  </button>
                ) : null}

                {/* Fine-grained sandbox settings */}
                <div className="mt-2 space-y-1 rounded-lg border border-gray-200 bg-gray-50 divide-y divide-gray-100">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0 flex-1 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">Network Access</span>
                        {networkAccess && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Enabled</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500">
                        Allow the agent to make outbound network requests (e.g. <code className="rounded bg-gray-200 px-1">curl</code>, package installs, API calls).
                        Has no effect when Sandbox is set to Full Access (network is always on).
                      </p>
                    </div>
                    <Toggle
                      checked={networkAccess}
                      onChange={(v) => void handleSaveSandboxSetting({ networkAccess: v })}
                      label="Toggle network access"
                    />
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0 flex-1 pr-4">
                      <span className="text-sm font-medium text-gray-800">Exclude TMPDIR env var</span>
                      <p className="mt-0.5 text-xs text-gray-500">
                        Remove the <code className="rounded bg-gray-200 px-1">TMPDIR</code> environment variable from the sandbox environment.
                      </p>
                    </div>
                    <Toggle
                      checked={excludeTmpdirEnvVar}
                      onChange={(v) => void handleSaveSandboxSetting({ excludeTmpdirEnvVar: v })}
                      label="Toggle exclude TMPDIR env var"
                    />
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0 flex-1 pr-4">
                      <span className="text-sm font-medium text-gray-800">Exclude /tmp</span>
                      <p className="mt-0.5 text-xs text-gray-500">
                        Remove access to <code className="rounded bg-gray-200 px-1">/tmp</code> from the sandbox environment.
                      </p>
                    </div>
                    <Toggle
                      checked={excludeSlashTmp}
                      onChange={(v) => void handleSaveSandboxSetting({ excludeSlashTmp: v })}
                      label="Toggle exclude /tmp"
                    />
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Skills Marketplace section */}
          <section className="space-y-4 border-t border-gray-100 pt-6">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Skills Marketplaces</h2>
              <p className="mt-1 text-sm text-gray-500">
                GitHub repositories used as skill sources. Skills from all active marketplaces are
                merged in the Skills Hub. Each repo must use the{' '}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">skills/&lt;author&gt;/&lt;name&gt;/</code>{' '}
                layout.
              </p>
            </div>

            {isLoading ? (
              <div className="text-sm text-gray-400">Loading…</div>
            ) : (
              <>
                {/* Market rows */}
                <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                  {markets.map((market, i) => {
                    const isBuiltIn = builtIn &&
                      market.owner === builtIn.owner &&
                      market.repo === builtIn.repo;
                    const url = `https://github.com/${market.owner}/${market.repo}`;
                    return (
                      <div
                        key={`${market.owner}/${market.repo}`}
                        className="flex items-center gap-3 bg-white px-3 py-2.5"
                      >
                        <Toggle
                          checked={market.active}
                          onChange={() => handleToggleMarket(i)}
                          label={`Toggle ${market.owner}/${market.repo}`}
                        />

                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                          <code className="min-w-0 truncate text-sm text-gray-700">
                            {market.owner}/{market.repo}
                          </code>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-gray-400 transition hover:text-primary"
                            title={url}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>

                        {isBuiltIn ? (
                          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            Official
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRemoveMarket(i)}
                            disabled={isSaving}
                            className="shrink-0 rounded p-1 text-gray-400 transition hover:text-red-500 disabled:opacity-50"
                            title="Remove"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {markets.length === 0 ? (
                    <div className="bg-white px-4 py-4 text-center text-sm text-gray-400">
                      No marketplaces configured. The official marketplace will be used.
                    </div>
                  ) : null}
                </div>

                {/* Add marketplace form */}
                <div className="rounded-lg border border-dashed border-gray-200 p-3">
                  <p className="mb-2.5 text-xs font-medium text-gray-500">Add marketplace</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={addOwner}
                      onChange={(e) => setAddOwner(e.target.value)}
                      placeholder="owner"
                      className="min-w-0 w-28 flex-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-primary"
                    />
                    <span className="self-center text-gray-400">/</span>
                    <input
                      type="text"
                      value={addRepo}
                      onChange={(e) => setAddRepo(e.target.value)}
                      placeholder="repo"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddMarket(); }}
                      className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={handleAddMarket}
                      disabled={isSaving || !addOwner.trim() || !addRepo.trim()}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>

          {/* Shared save feedback */}
          {saveMessage ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {saveMessage}
            </div>
          ) : null}
          {saveError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {saveError}
            </div>
          ) : null}

          {/* How it works */}
          <section className="space-y-3 border-t border-gray-100 pt-6 text-sm text-gray-500">
            <h3 className="font-medium text-gray-700">How it works</h3>
            <ul className="space-y-1.5 list-disc pl-5">
              <li>
                Settings are saved to{' '}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">.codex-ui-settings.json</code>{' '}
                next to the server.
              </li>
              <li>
                <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">CODEX_HOME</code> resolution order:{' '}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">CODEXUI_CODEX_HOME</code>{' '}
                env var → saved override → default local{' '}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">.codex/</code>.
                <strong className="text-gray-700"> Restart required</strong> after changing.
              </li>
              <li>
                <strong className="text-gray-700">User Files</strong> is an isolated writable area
                (default: <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">~/user_files/</code>).
                Files saved here are never mixed with Codex system files. File API endpoint:{' '}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">POST /codex-api/user-files/write</code>.
              </li>
              <li>
                Marketplace changes are applied <strong className="text-gray-700">immediately</strong>{' '}
                (no restart needed). The skills cache is cleared on each change.
              </li>
              <li>
                Skills from multiple active marketplaces are merged. If two marketplaces share a skill name, the first one in the list takes priority.
              </li>
            </ul>
          </section>

        </div>
      </div>
    </div>
  );
}

export default SettingsPane;
