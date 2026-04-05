import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSidebarChrome } from '../../hooks/useSidebarChrome';
import { useCodexStore } from '../../stores';
import type { SkillInfo } from '../../types/codex';
import ContentHeader from './ContentHeader';
import SidebarThreadControls, { SidebarToolbarAction } from '../sidebar/SidebarThreadControls';
import { IconTablerX, IconTablerBolt, IconTablerSearch } from '../icons';

interface SkillCardProps {
  skill: SkillInfo;
  onClick: () => void;
}

function SkillCard({ skill, onClick }: SkillCardProps) {
  const title = skill.name || 'Unnamed skill';
  return (
    <button
      onClick={onClick}
      className="w-full overflow-hidden text-left p-4 bg-white border border-gray-200 rounded-xl hover:border-primary hover:shadow-md transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <h3 className="min-w-0 flex-1 break-words font-semibold text-gray-800">{title}</h3>
            {skill.isInstalled && (
              <span className="shrink-0 self-start px-2 py-0.5 text-xs bg-primary/10 text-primary rounded-full">
                Installed
              </span>
            )}
          </div>
          {skill.description && (
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">
              {skill.description}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

interface SkillDetailModalProps {
  skill: SkillInfo | null;
  onClose: () => void;
}

function SkillDetailModal({ skill, onClose }: SkillDetailModalProps) {
  if (!skill) return null;
  const title = skill.name || 'Unnamed skill';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <IconTablerX className="w-5 h-5" />
          </button>
        </div>

        {skill.description && (
          <p className="text-gray-600 mb-4">{skill.description}</p>
        )}

        <div className="flex gap-3">
          {skill.isInstalled ? (
            <button
              className="flex-1 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100"
              onClick={() => {
                // TODO: Uninstall skill
                onClose();
              }}
            >
              Uninstall
            </button>
          ) : (
            <button
              className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover"
              onClick={() => {
                // TODO: Install skill
                onClose();
              }}
            >
              Install
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
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
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const normalizedQuery = searchQuery.toLowerCase();
  const filteredSkills = installedSkills.filter(
    (skill) => {
      const name = typeof skill.name === 'string' ? skill.name.toLowerCase() : '';
      const description = typeof skill.description === 'string' ? skill.description.toLowerCase() : '';
      return name.includes(normalizedQuery) || description.includes(normalizedQuery);
    }
  );

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
            <SidebarToolbarAction label="Search threads" onClick={openSidebarSearch}>
              <IconTablerSearch className="h-4 w-4" />
            </SidebarToolbarAction>
          </SidebarThreadControls>
        ) : null}
      />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl p-6">
          {/* Header */}
          <div className="mb-8">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-800">
              <IconTablerBolt className="h-7 w-7 text-primary" />
              Skills Hub
            </h1>
            <p className="mt-1 text-gray-500">
              Manage your installed skills and discover new ones.
            </p>
          </div>

          {/* Search */}
          <div className="mb-6">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search skills..."
              className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Skills Grid */}
          {filteredSkills.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              {searchQuery ? 'No skills match your search.' : 'No skills installed.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredSkills.map((skill) => (
                <SkillCard
                  key={skill.id || skill.path || skill.name}
                  skill={skill}
                  onClick={() => setSelectedSkill(skill)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      <SkillDetailModal
        skill={selectedSkill}
        onClose={() => setSelectedSkill(null)}
      />
    </div>
  );
}

export default SkillsHub;
