import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { IconTablerFolder, IconTablerChevronLeft } from '../icons';
import * as api from '../../api/codexGateway';
import type { CodexUiSettingsInfo } from '../../api/codexGateway';
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
      {/* Current path + up button */}
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
      {/* Directory entries */}
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

  // Editable fields
  const [codexHomeInput, setCodexHomeInput] = useState('');
  const [marketplaceOwnerInput, setMarketplaceOwnerInput] = useState('');
  const [marketplaceRepoInput, setMarketplaceRepoInput] = useState('');

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const data = await api.getSettings();
      setSettings(data);
      setCodexHomeInput(data.savedCodexHome ?? '');
      setMarketplaceOwnerInput(data.savedMarketplaceOwner ?? '');
      setMarketplaceRepoInput(data.savedMarketplaceRepo ?? '');
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

  const handleSave = async () => {
    setSaveError('');
    setSaveMessage('');
    setIsSaving(true);
    try {
      const result = await api.saveSettings({
        codexHome: codexHomeInput.trim() || undefined,
        marketplaceOwner: marketplaceOwnerInput.trim() || undefined,
        marketplaceRepo: marketplaceRepoInput.trim() || undefined,
      });
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

  const handleResetMarketplace = async () => {
    setSaveError('');
    setSaveMessage('');
    setIsSaving(true);
    try {
      const result = await api.saveSettings({ marketplaceOwner: '', marketplaceRepo: '' });
      setSaveMessage(result.message);
      setMarketplaceOwnerInput('');
      setMarketplaceRepoInput('');
      await loadSettings();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setIsSaving(false);
    }
  };

  const isMarketplaceCustomized =
    !!(settings?.savedMarketplaceOwner || settings?.savedMarketplaceRepo);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ContentHeader
        title="Settings"
        leading={<Settings className="h-4 w-4 text-gray-500" strokeWidth={1.8} />}
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
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
                {/* Active value (read-only info) */}
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

                {/* Edit field */}
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

                  {/* Directory browser */}
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
                    onClick={handleSave}
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

          {/* Skills Marketplace section */}
          <section className="space-y-4 border-t border-gray-100 pt-6">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Skills Marketplace</h2>
              <p className="mt-1 text-sm text-gray-500">
                The GitHub repository used as the skill marketplace. Skills are fetched from{' '}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">github.com/&lt;owner&gt;/&lt;repo&gt;</code>.
              </p>
            </div>

            {isLoading ? (
              <div className="text-sm text-gray-400">Loading…</div>
            ) : (
              <>
                {/* Current marketplace info */}
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-32 shrink-0 text-xs font-medium text-gray-500">Active URL</span>
                    <a
                      href={settings?.marketplaceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 break-all text-xs text-primary underline underline-offset-2"
                    >
                      {settings?.marketplaceUrl}
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-32 shrink-0 text-xs font-medium text-gray-500">Owner</span>
                    <code className="text-xs text-gray-700">{settings?.marketplaceOwner}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-32 shrink-0 text-xs font-medium text-gray-500">Repo</span>
                    <code className="text-xs text-gray-700">{settings?.marketplaceRepo}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-32 shrink-0 text-xs font-medium text-gray-500">Default</span>
                    <code className="text-xs text-gray-400">
                      {settings?.defaultMarketplaceOwner}/{settings?.defaultMarketplaceRepo}
                    </code>
                  </div>
                </div>

                {/* Edit fields */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700">Owner</label>
                    <input
                      type="text"
                      value={marketplaceOwnerInput}
                      onChange={(e) => setMarketplaceOwnerInput(e.target.value)}
                      placeholder={settings?.defaultMarketplaceOwner}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700">Repo</label>
                    <input
                      type="text"
                      value={marketplaceRepoInput}
                      onChange={(e) => setMarketplaceRepoInput(e.target.value)}
                      placeholder={settings?.defaultMarketplaceRepo}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-primary"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isSaving ? 'Saving…' : 'Save'}
                  </button>
                  {isMarketplaceCustomized ? (
                    <button
                      type="button"
                      onClick={handleResetMarketplace}
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
                Marketplace changes are applied <strong className="text-gray-700">immediately</strong>{' '}
                (no restart needed) and the skills cache is cleared.
              </li>
              <li>
                The marketplace repo must follow the{' '}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">skills/&lt;owner&gt;/&lt;name&gt;/</code>{' '}
                directory layout with a <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">SKILL.md</code> in each skill folder.
              </li>
            </ul>
          </section>

        </div>
      </div>
    </div>
  );
}

export default SettingsPane;
