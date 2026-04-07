import { useEffect, useMemo, useState } from 'react';
import { SquareLibrary } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as api from '../../api/codexGateway';
import type { MarketEntry } from '../../api/codexGateway';
import { useSidebarChrome } from '../../hooks/useSidebarChrome';
import { useCodexStore } from '../../stores';
import type { SkillMarketplaceInfo } from '../../types/codex';
import ContentHeader from './ContentHeader';
import SidebarThreadControls, { SidebarToolbarAction } from '../sidebar/SidebarThreadControls';
import { IconTablerSearch, IconTablerX } from '../icons';

interface SkillCardProps {
  skill: SkillMarketplaceInfo;
  onClick: () => void;
}

function SkillAvatar({ skill, title }: { skill: SkillMarketplaceInfo; title: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const fallbackLabel = title.trim().charAt(0).toUpperCase() || 'S';

  if (skill.avatarUrl && !imageFailed) {
    return (
      <img
        src={skill.avatarUrl}
        alt=""
        aria-hidden="true"
        loading="lazy"
        onError={() => setImageFailed(true)}
        className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-gray-100 object-cover"
      />
    );
  }

  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-sm font-semibold text-gray-600"
      aria-hidden="true"
    >
      {fallbackLabel}
    </div>
  );
}

function isPseudoSkillOwner(owner: string): boolean {
  return owner.trim().startsWith('.');
}

function getSkillSubtitle(skill: SkillMarketplaceInfo): string {
  const marketLabel = skill.marketOwner && skill.marketRepo ? `${skill.marketOwner}/${skill.marketRepo}` : '';

  if (skill.scope === 'system') {
    return 'System skill';
  }

  if (skill.installed) {
    return isPseudoSkillOwner(skill.owner) ? 'Installed skill' : (skill.owner || 'Installed skill');
  }

  if (isPseudoSkillOwner(skill.owner)) {
    return marketLabel || 'Official market';
  }

  return skill.owner;
}

function getSkillCollectionBadge(skill: SkillMarketplaceInfo): string | null {
  if (!isPseudoSkillOwner(skill.owner)) return null;
  const label = skill.owner.replace(/^[.]+/, '').trim();
  return label || null;
}

function SkillCard({ skill, onClick }: SkillCardProps) {
  const title = skill.displayName || skill.name || 'Unnamed skill';
  const subtitle = getSkillSubtitle(skill);
  const collectionBadge = getSkillCollectionBadge(skill);

  return (
    <button
      onClick={onClick}
      className="w-full overflow-hidden rounded-xl border border-gray-200 bg-white p-4 text-left transition-all hover:border-primary hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <SkillAvatar skill={skill} title={title} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <h3 className="min-w-0 flex-1 break-words font-semibold text-gray-800">{title}</h3>
            {skill.installed ? (
              <span className="shrink-0 self-start rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                Installed
              </span>
            ) : null}
          </div>
          {(subtitle || collectionBadge) ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-400">
              {subtitle ? <span>{subtitle}</span> : null}
              {collectionBadge ? (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium capitalize text-gray-500">
                  {collectionBadge}
                </span>
              ) : null}
            </div>
          ) : null}
          {skill.description ? (
            <p className="mt-1 line-clamp-2 text-sm text-gray-500">{skill.description}</p>
          ) : null}
        </div>
      </div>
    </button>
  );
}

interface SkillDetailModalProps {
  skill: SkillMarketplaceInfo | null;
  isInstalling: boolean;
  isUninstalling: boolean;
  actionError: string | null;
  onInstall: (skill: SkillMarketplaceInfo) => Promise<void>;
  onUninstall: (skill: SkillMarketplaceInfo) => Promise<void>;
  onClose: () => void;
}

function simpleMarkdown(md: string): string {
  if (!md.trim()) return '';
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n{2,}/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}

function SkillDetailModal({
  skill,
  isInstalling,
  isUninstalling,
  actionError,
  onInstall,
  onUninstall,
  onClose,
}: SkillDetailModalProps) {
  const [readme, setReadme] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!skill) {
      setReadme('');
      setDescription('');
      setIsLoading(false);
      return;
    }

    setReadme('');
    setDescription('');
    setIsLoading(true);
    api.getSkillMarketplaceReadme({
      owner: skill.owner,
      name: skill.name,
      installed: skill.installed,
      path: skill.path,
      marketOwner: skill.marketOwner,
      marketRepo: skill.marketRepo,
    }).then((data) => {
      if (cancelled) return;
      setReadme(data.content);
      setDescription(data.description);
    }).catch(() => {
      if (cancelled) return;
      setReadme('');
      setDescription('');
    }).finally(() => {
      if (cancelled) return;
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [skill]);

  if (!skill) return null;

  const title = skill.displayName || skill.name || 'Unnamed skill';
  const effectiveDescription = description || skill.description || '';
  const renderedReadme = simpleMarkdown(readme);
  const subtitle = getSkillSubtitle(skill);
  const collectionBadge = getSkillCollectionBadge(skill);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white">
        <div className="flex items-start justify-between gap-4 px-6 py-5">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold text-gray-900">{title}</h2>
            {(subtitle || collectionBadge) ? (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-400">
                {subtitle ? <span>{subtitle}</span> : null}
                {collectionBadge ? (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium capitalize text-gray-500">
                    {collectionBadge}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <IconTablerX className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-5">
          {effectiveDescription ? (
            <p className="mb-4 text-gray-600">{effectiveDescription}</p>
          ) : null}

          {actionError ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {actionError}
            </div>
          ) : null}

          {isLoading ? (
            <p className="text-sm text-gray-400">Loading skill contents…</p>
          ) : renderedReadme ? (
            <div
              className="prose prose-sm max-w-none text-gray-700"
              dangerouslySetInnerHTML={{ __html: renderedReadme }}
            />
          ) : null}

          {skill.url ? (
            <a
              className="mt-4 inline-flex text-sm text-primary hover:underline"
              href={skill.url}
              target="_blank"
              rel="noreferrer"
            >
              View on GitHub
            </a>
          ) : skill.scope === 'system' ? (
            <p className="mt-4 text-sm text-gray-500">
              Bundled system skill from your local `.codex/skills/.system` folder.
            </p>
          ) : null}
        </div>

        <div className="flex gap-3 border-t border-gray-100 px-6 py-4">
          {skill.scope === 'system' ? (
            <div className="flex-1 rounded-lg bg-gray-50 px-4 py-2 text-sm text-gray-600">
              Bundled with the local app configuration.
            </div>
          ) : skill.installed ? (
            <button
              className="flex-1 rounded-lg bg-red-50 px-4 py-2 text-red-600 hover:bg-red-100"
              onClick={() => void onUninstall(skill)}
              disabled={isInstalling || isUninstalling}
            >
              {isUninstalling ? 'Uninstalling…' : 'Uninstall'}
            </button>
          ) : (
            <button
              className="flex-1 rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-hover"
              onClick={() => void onInstall(skill)}
              disabled={isInstalling || isUninstalling}
            >
              {isInstalling ? 'Installing…' : 'Install'}
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function SkillsHub() {
  const navigate = useNavigate();
  const { isSidebarCollapsed, showHeaderControls, toggleSidebar, openSidebarSearch } = useSidebarChrome();
  const { installedSkills, loadSkills } = useCodexStore();
  const [selectedSkill, setSelectedSkill] = useState<SkillMarketplaceInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [sortMode, setSortMode] = useState<'date' | 'name'>('date');
  const [marketplaceSkills, setMarketplaceSkills] = useState<SkillMarketplaceInfo[]>([]);
  const [installedMarketSkills, setInstalledMarketSkills] = useState<SkillMarketplaceInfo[]>([]);
  const [systemInstalledSkills, setSystemInstalledSkills] = useState<SkillMarketplaceInfo[]>([]);
  const [totalSkills, setTotalSkills] = useState(0);
  const [isLoadingMarketplace, setIsLoadingMarketplace] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [actingSkillKey, setActingSkillKey] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // Market filter
  const [activeMarkets, setActiveMarkets] = useState<MarketEntry[]>([]);
  const [builtInMarket, setBuiltInMarket] = useState<{ owner: string; repo: string } | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<string>('openai/skills'); // default to official
  const [installFilter, setInstallFilter] = useState<'all' | 'available' | 'installed'>('all');

  useEffect(() => {
    void loadSkills();
    // Load active markets for the filter
    api.getSettings().then((s) => {
      setActiveMarkets(s.markets.filter((m) => m.active));
      setBuiltInMarket(s.builtInMarket);
      // Default selection: official market if active, otherwise 'all'
      const official = `${s.builtInMarket.owner}/${s.builtInMarket.repo}`;
      const isOfficialActive = s.markets.some((m) => m.active && `${m.owner}/${m.repo}` === official);
      setSelectedMarket(isOfficialActive ? official : 'all');
    }).catch(() => {
      setSelectedMarket('all');
    });
  }, [loadSkills]);

  useEffect(() => {
    void reloadMarketplace('');
  }, [sortMode]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const visibleInstalledSkills = useMemo(() => {
    return [...installedMarketSkills].sort((left, right) => {
      const leftTitle = (left.displayName || left.name).toLowerCase();
      const rightTitle = (right.displayName || right.name).toLowerCase();
      return leftTitle.localeCompare(rightTitle);
    });
  }, [installedMarketSkills]);

  const visibleSystemSkills = useMemo(() => {
    return [...systemInstalledSkills].sort((left, right) => {
      const leftTitle = (left.displayName || left.name).toLowerCase();
      const rightTitle = (right.displayName || right.name).toLowerCase();
      return leftTitle.localeCompare(rightTitle);
    });
  }, [systemInstalledSkills]);

  const selectedMarketInfo = useMemo(() => {
    if (selectedMarket === 'all') return null;
    return activeMarkets.find((market) => `${market.owner}/${market.repo}` === selectedMarket) ?? null;
  }, [activeMarkets, selectedMarket]);

  const selectedMarketUrl = selectedMarketInfo
    ? `https://github.com/${selectedMarketInfo.owner}/${selectedMarketInfo.repo}`
    : null;

  const installedNames = useMemo(() => new Set(installedSkills.map((skill) => skill.name)), [installedSkills]);

  // Merge installed market skills + uninstalled marketplace skills into one list.
  // Overlay installed status from local store so even skills not yet refreshed
  // on the server side get the correct badge.
  const allMarketSkills = useMemo(() => {
    const installedWithFlag = installedMarketSkills.map((s) => ({ ...s, installed: true }));
    const marketWithFlag = marketplaceSkills.map((s) => ({
      ...s,
      installed: s.installed || installedNames.has(s.name),
    }));
    return [...installedWithFlag, ...marketWithFlag];
  }, [installedMarketSkills, marketplaceSkills, installedNames]);

  // Apply market + install filters
  const visibleMarketplaceSkills = useMemo(() => {
    let list = allMarketSkills;
    if (selectedMarket !== 'all') {
      list = list.filter((s) => `${s.marketOwner}/${s.marketRepo}` === selectedMarket);
    }
    if (installFilter === 'installed') {
      list = list.filter((s) => s.installed);
    } else if (installFilter === 'available') {
      list = list.filter((s) => !s.installed);
    }
    return list;
  }, [allMarketSkills, selectedMarket, installFilter]);
  const selectedSkillKey = selectedSkill ? `${selectedSkill.owner}/${selectedSkill.name}` : '';
  const modalSkill = selectedSkill
    ? { ...selectedSkill, installed: selectedSkill.installed || installedNames.has(selectedSkill.name) }
    : null;

  async function reloadMarketplace(query: string): Promise<void> {
    const normalizedQuery = query.trim();
    setActiveQuery(normalizedQuery);
    setIsLoadingMarketplace(true);
    setError('');
    try {
      const result = await api.getSkillsMarketplace({
        query: normalizedQuery,
        limit: 100,
        sort: sortMode,
      });
      setMarketplaceSkills(result.data);
      setInstalledMarketSkills(result.installed);
      setSystemInstalledSkills(result.systemInstalled);
      setTotalSkills(result.total);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load skills marketplace');
    } finally {
      setIsLoadingMarketplace(false);
    }
  }

  async function handleInstall(skill: SkillMarketplaceInfo): Promise<void> {
    const key = `${skill.owner}/${skill.name}`;
    setActingSkillKey(key);
    setActionError(null);
    setIsInstalling(true);
    try {
      await api.installMarketplaceSkill({ owner: skill.owner, name: skill.name, marketOwner: skill.marketOwner, marketRepo: skill.marketRepo });
      await Promise.all([loadSkills(), reloadMarketplace(activeQuery || searchQuery)]);
      setToast(`${skill.displayName || skill.name} installed`);
      setSelectedSkill(null);
    } catch (installError) {
      const message = installError instanceof Error ? installError.message : 'Failed to install skill';
      setActionError(message);
      setToast(message);
    } finally {
      setIsInstalling(false);
    }
  }

  async function handleUninstall(skill: SkillMarketplaceInfo): Promise<void> {
    const key = `${skill.owner}/${skill.name}`;
    setActingSkillKey(key);
    setActionError(null);
    setIsUninstalling(true);
    try {
      await api.uninstallMarketplaceSkill({ name: skill.name, path: skill.path });
      await Promise.all([loadSkills(), reloadMarketplace(activeQuery || searchQuery)]);
      setToast(`${skill.displayName || skill.name} uninstalled`);
      setSelectedSkill(null);
    } catch (uninstallError) {
      const message = uninstallError instanceof Error ? uninstallError.message : 'Failed to uninstall skill';
      setActionError(message);
      setToast(message);
    } finally {
      setIsUninstalling(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <ContentHeader
        title="Skills"
        leading={showHeaderControls ? (
          <SidebarThreadControls
            isSidebarCollapsed={isSidebarCollapsed}
            onToggleSidebar={toggleSidebar}
            onNewThread={() => navigate('/')}
          >
            <SidebarToolbarAction label="Skills Hub" onClick={() => navigate('/skills')} isActive>
              <SquareLibrary className="h-4 w-4" strokeWidth={1.8} />
            </SidebarToolbarAction>
            <SidebarToolbarAction label="Search threads" onClick={openSidebarSearch}>
              <IconTablerSearch className="h-4 w-4" />
            </SidebarToolbarAction>
          </SidebarThreadControls>
        ) : null}
      />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl p-6">
          <div className="mb-8">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-800">
              Skills Hub
            </h1>
            <p className="mt-1 text-gray-500">
              Browse the marketplace and install skills into your local Codex skills folder.
            </p>
          </div>

          {toast ? (
            <div className="mb-4 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm">
              {toast}
            </div>
          ) : null}

          {visibleInstalledSkills.length > 0 ? (
            <div className="mb-8">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Installed ({visibleInstalledSkills.length})
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {visibleInstalledSkills.map((skill) => (
                  <SkillCard
                    key={`installed-${skill.owner}-${skill.name}`}
                    skill={{ ...skill, installed: true }}
                    onClick={() => {
                      setActionError(null);
                      setSelectedSkill({ ...skill, installed: true });
                    }}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {visibleSystemSkills.length > 0 ? (
            <div className="mb-8">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                  System Skills ({visibleSystemSkills.length})
                </h2>
                <span className="text-xs text-gray-400">
                  Bundled from `.codex/skills/.system`
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {visibleSystemSkills.map((skill) => (
                  <SkillCard
                    key={`system-${skill.owner}-${skill.name}`}
                    skill={{ ...skill, installed: true, scope: 'system' }}
                    onClick={() => {
                      setActionError(null);
                      setSelectedSkill({ ...skill, installed: true, scope: 'system' });
                    }}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* Market filter tabs */}
          {activeMarkets.length > 1 ? (
            <div className="mb-5 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedMarket('all')}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  selectedMarket === 'all'
                    ? 'bg-primary text-white'
                    : 'border border-gray-200 bg-white text-gray-600 hover:border-primary hover:text-primary'
                }`}
              >
                All
              </button>
              {activeMarkets.map((m) => {
                const key = `${m.owner}/${m.repo}`;
                const isOfficial = builtInMarket && m.owner === builtInMarket.owner && m.repo === builtInMarket.repo;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedMarket(key)}
                    className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition ${
                      selectedMarket === key
                        ? 'bg-primary text-white'
                        : 'border border-gray-200 bg-white text-gray-600 hover:border-primary hover:text-primary'
                    }`}
                  >
                    {key}
                    {isOfficial ? (
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        selectedMarket === key ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'
                      }`}>Official</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span>Search source:</span>
            {selectedMarket === 'all' ? (
              <span>All active markets</span>
            ) : selectedMarketUrl ? (
              <a
                className="font-medium text-primary hover:underline"
                href={selectedMarketUrl}
                target="_blank"
                rel="noreferrer"
              >
                {selectedMarketInfo?.owner}/{selectedMarketInfo?.repo}
              </a>
            ) : (
              <span>{selectedMarket}</span>
            )}
          </div>

          <div className="mb-6 flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <IconTablerSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void reloadMarketplace(searchQuery);
                  }
                }}
                placeholder="Search skills..."
                className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <button
              type="button"
              onClick={() => void reloadMarketplace(searchQuery)}
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => setSortMode((current) => current === 'date' ? 'name' : 'date')}
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              {sortMode === 'date' ? 'Newest' : 'A-Z'}
            </button>
            <select
              value={installFilter}
              onChange={(e) => setInstallFilter(e.target.value as 'all' | 'available' | 'installed')}
              className={`rounded-xl border px-4 py-3 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-primary ${
                installFilter !== 'all'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              <option value="all">All</option>
              <option value="available">Available</option>
              <option value="installed">Installed</option>
            </select>
            <div className="flex items-center px-1 text-sm text-gray-400">
              {visibleMarketplaceSkills.length > 0
                ? `${visibleMarketplaceSkills.length}${selectedMarket !== 'all' ? ` / ${totalSkills}` : ''} skills`
                : totalSkills > 0 ? `${totalSkills} skills` : ''}
            </div>
          </div>

          {isLoadingMarketplace ? (
            <div className="py-12 text-center text-gray-400">Loading skills…</div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          ) : allMarketSkills.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              {activeQuery ? `No skills found for "${activeQuery}".` : 'No marketplace skills available.'}
            </div>
          ) : visibleMarketplaceSkills.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              {installFilter !== 'all'
                ? `No ${installFilter} skills${selectedMarket !== 'all' ? ` from ${selectedMarket}` : ''}${activeQuery ? ` matching "${activeQuery}"` : ''}.`
                : <>No skills from <code className="text-xs">{selectedMarket}</code>{activeQuery ? ` matching "${activeQuery}"` : ''}.</>}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {visibleMarketplaceSkills.map((skill) => (
                <SkillCard
                  key={`${skill.owner}-${skill.name}`}
                  skill={skill}
                  onClick={() => {
                    setActionError(null);
                    setSelectedSkill(skill);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <SkillDetailModal
        skill={modalSkill}
        isInstalling={isInstalling && actingSkillKey === selectedSkillKey}
        isUninstalling={isUninstalling && actingSkillKey === selectedSkillKey}
        actionError={actionError}
        onInstall={handleInstall}
        onUninstall={handleUninstall}
        onClose={() => {
          setActionError(null);
          setSelectedSkill(null);
        }}
      />
    </div>
  );
}

export default SkillsHub;
