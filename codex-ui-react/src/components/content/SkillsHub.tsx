import { useEffect, useState } from 'react';
import { useCodexStore } from '../../stores';
import type { SkillInfo } from '../../types/codex';
import { IconTablerX, IconTablerBolt } from '../icons';

interface SkillCardProps {
  skill: SkillInfo;
  onClick: () => void;
}

function SkillCard({ skill, onClick }: SkillCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 bg-white border border-gray-200 rounded-xl hover:border-primary hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-gray-800">{skill.name}</h3>
          {skill.description && (
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">
              {skill.description}
            </p>
          )}
        </div>
        {skill.isInstalled && (
          <span className="px-2 py-0.5 text-xs bg-primary/10 text-primary rounded-full">
            Installed
          </span>
        )}
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">{skill.name}</h2>
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
  const { installedSkills, loadSkills } = useCodexStore();
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const filteredSkills = installedSkills.filter(
    (skill) =>
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <IconTablerBolt className="w-7 h-7 text-primary" />
            Skills Hub
          </h1>
          <p className="text-gray-500 mt-1">
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
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Skills Grid */}
        {filteredSkills.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            {searchQuery ? 'No skills match your search.' : 'No skills installed.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSkills.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                onClick={() => setSelectedSkill(skill)}
              />
            ))}
          </div>
        )}
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
