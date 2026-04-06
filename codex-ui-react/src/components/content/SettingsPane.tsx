import { useEffect, useState } from 'react';
import { Settings, ExternalLink, Plus, Trash2, Shield } from 'lucide-react';
import { IconTablerFolder, IconTablerChevronLeft } from '../icons';
import * as api from '../../api/codexGateway';
import type { CodexUiSettingsInfo, MarketEntry, SandboxModeSetting } from '../../api/codexGateway';
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

  // User files path edit
  const [userFilesInput, setUserFilesInput] = useState('');
  const [userFilesBrowserTarget, setUserFilesBrowserTarget] = useState<SandboxModeSetting | null>(null);

  // Sandbox mode
  const [sandboxMode, setSandboxMode] = useState<SandboxModeSetting>('workspace-write');

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
      setUserFilesInput(data.savedUserFilesPath ?? '');
      setSandboxMode(data.sandboxMode ?? 'workspace-write');
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

  const handleSaveUserFilesPath = async () => {
    setSaveError('');
    setSaveMessage('');
    setIsSaving(true);
    try {
      const result = await api.saveSettings({ userFilesPath: userFilesInput.trim() || undefined });
      setSaveMessage(result.message);
      await loadSettings();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetUserFilesPath = async () => {
    setSaveError('');
    setSaveMessage('');
    setIsSaving(true);
    try {
      const result = await api.saveSettings({ userFilesPath: '' });
      setSaveMessage(result.message);
      setUserFilesInput('');
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

  const handleOpenUserFilesBrowser = async (target: SandboxModeSetting) => {
    const startPath = userFilesInput.trim() || settings?.userFilesPath || '/';
    setUserFilesBrowserTarget(target);
    await browseDirectory(startPath);
  };

  const builtIn = settings?.builtInMarket;

  const renderUserFilesOverrideControls = (
    mode: SandboxModeSetting,
    tone: 'neutral' | 'warning' = 'neutral',
  ) => {
    const isWarning = tone === 'warning';
    return (
      <div className="mt-3 space-y-2">
        <div className={`rounded-md px-2.5 py-2 text-xs ${isWarning ? 'bg-orange-100/60 text-orange-800' : 'bg-gray-50 text-gray-600'}`}>
          <div className="flex items-center gap-2">
            <span className={`shrink-0 font-medium ${isWarning ? 'text-orange-900' : 'text-gray-700'}`}>Active path</span>
            <code className={`min-w-0 break-all rounded px-1 py-0.5 text-[11px] ${isWarning ? 'bg-white/80 text-orange-900' : 'bg-white text-gray-700'}`}>
              {settings?.userFilesPath || settings?.defaultUserFilesPath || 'Not configured'}
            </code>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className={`shrink-0 font-medium ${isWarning ? 'text-orange-900' : 'text-gray-500'}`}>Default</span>
            <code className={`min-w-0 break-all rounded px-1 py-0.5 text-[11px] ${isWarning ? 'bg-white/80 text-orange-900' : 'bg-white text-gray-500'}`}>
              {settings?.defaultUserFilesPath || 'Not configured'}
            </code>
          </div>
        </div>

        <div className="space-y-2">
          <label className={`block text-xs font-medium ${isWarning ? 'text-orange-800' : 'text-gray-700'}`}>
            Override path <span className={isWarning ? 'font-normal text-orange-700/80' : 'font-normal text-gray-400'}>(leave blank to use default)</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={userFilesInput}
              onChange={(e) => setUserFilesInput(e.target.value)}
              placeholder={settings?.defaultUserFilesPath}
              className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-primary"
            />
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                void handleOpenUserFilesBrowser(mode);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:border-primary hover:text-primary"
              title="Browse…"
            >
              <IconTablerFolder className="h-4 w-4" />
            </button>
          </div>

          {userFilesBrowserTarget === mode ? (
            <DirectoryBrowser
              currentPath={browserPath}
              parentPath={browserParentPath}
              entries={browserEntries}
              isLoading={isBrowserLoading}
              onNavigate={handleBrowserNavigate}
              onSelect={(path) => {
                setUserFilesInput(path);
                setUserFilesBrowserTarget(null);
              }}
            />
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                void handleSaveUserFilesPath();
              }}
              disabled={isSaving}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary/90 disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Save path'}
            </button>
            {settings?.savedUserFilesPath ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  void handleResetUserFilesPath();
                }}
                disabled={isSaving}
                className={`rounded-lg border px-3 py-1.5 text-xs transition disabled:opacity-50 ${isWarning ? 'border-orange-200 text-orange-700 hover:border-orange-300 hover:text-orange-800' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-800'}`}
              >
                Reset to default
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

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
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-32 shrink-0 text-xs font-medium text-gray-500">Active now</span>
                    <code className="min-w-0 break-all text-xs text-gray-700">{settings?.codexHome}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-32 shrink-0 text-xs font-medium text-gray-500">Skills dir</span>
                    <code className="min-w-0 break-all text-xs text-gray-600">{settings?.skillsDir}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-32 shrink-0 text-xs font-medium text-gray-500">Default</span>
                    <code className="min-w-0 break-all text-xs text-gray-400">{settings?.defaultCodexHome}</code>
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
                      Agent can write inside its thread workspace <strong>and</strong> the
                      configured User Files directory. Cannot write elsewhere.
                    </p>
                    {renderUserFilesOverrideControls('workspace-write')}
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
                      Useful when the agent needs to touch paths outside the workspace
                      (e.g. system config, arbitrary project directories).
                    </p>
                    {renderUserFilesOverrideControls('danger-full-access', 'warning')}
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
